# app/routes/assinaturas.py
from datetime import datetime, date
from typing import Any, Dict, Optional, Tuple

import os
import json
import tempfile
import requests
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from database import get_db
from app.core.timers import update_extrato_timers
from app.core.timezone_middleware import auto_timezone_save, auto_timezone_display
from app.models.extrato import Extrato
from app.models.advogado import Advogado
from app.models.usuario import Usuario
from app.auth_dependency import get_current_user  # ajuste se o seu nome for outro
from app.utils.zapsign import enviar_documentos_consolidados_para_assinatura
from app.core.time import now_utc_for_sqlite, now_sp

router = APIRouter(prefix="/assinaturas", tags=["assinaturas"])

# ---------- Schemas (básico) ----------

class EnviarReq(BaseModel):
    id: Optional[int] = None                 # extrato_id (se vier vazio, cria um novo extrato)
    dados: Optional[Dict[str, Any]] = None   # estado do front (merge leve em extras/campos fixos)
    extrato_pdf_url: Optional[str] = None
    contrato_url: Optional[str] = None
    procuracao_url: Optional[str] = None
    # 🔒 Mantidos comentados (não usados agora; preserva progresso)
    # termo_acordo_pdf_url: Optional[str] = None
    # sentenca_pdf_url: Optional[str] = None
    # pagamento_admin_url: Optional[str] = None
    # pagamento_admin_valor: Optional[float] = None
    # pagamento_admin_data: Optional[date] = None
    # pagamento_gerente_url: Optional[str] = None
    # pagamento_gerente_valor: Optional[float] = None
    # pagamento_gerente_data: Optional[date] = None

# ---------- Utils ----------

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")

# Campos de data que podem chegar como string ISO no payload e precisam virar date/datetime
DATE_FIELDS_DATE = {
    "data_encerramento",
    "inicio_juros",
    "data_exportacao",
}
DATE_FIELDS_DATETIME = {
    "zapsign_signed_at",
    "gerado_em",
    "enviado_em",
    "criado_em",
    "atualizado_em",
}

def _parse_date_like(value: Any) -> Any:
    """Converte strings ISO para date/datetime conforme conteúdo; retorna original se não converter."""
    if value is None:
        return None
    if isinstance(value, (date, datetime)):
        return value
    if isinstance(value, str):
        # tenta datetime primeiro
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if isinstance(dt, datetime) and dt.tzinfo is None:
                dt = dt.replace(tzinfo=now_sp().tzinfo)  # assume SP se vier naive
            return dt
        except Exception:
            pass
        # tenta só data
        try:
            return datetime.fromisoformat(value).date()
        except Exception:
            pass
    return value

def _norm_dates_for_field(key: str, value: Any) -> Any:
    if key in DATE_FIELDS_DATE:
        v = _parse_date_like(value)
        if isinstance(v, datetime):
            return v.date()
        return v
    if key in DATE_FIELDS_DATETIME:
        v = _parse_date_like(value)
        if isinstance(v, date) and not isinstance(v, datetime):
            # promove a meia-noite UTC
            base = datetime.combine(v, datetime.min.time())
            return base.replace(tzinfo=now_sp().tzinfo)  # meia-noite em SP
        return v
    return value

# Campos "fixos" mapeados no modelo Extrato
FIXED_FIELDS = {
    "grupo","cota","nome_cliente","cpf_cnpj","tipo_documento","administradora",
    "taxa_adm_percentual","total_parcelas_plano","data_encerramento","valor_total_pago_extrato",
    "parcelas_pagas","soma_valores_pagos","cidade","estado","telefone","advogado",
    "numero_processo","honorarios_percentual","fase_processo","nome_magistrado",
    "valor_corrigido_hoje","valor_futuro","data_exportacao",
    "valor_credito","valor_pago_extrato","valor_pg_liquido",
    "fundo_comum","fundo_reserva","seguros","multas","juros","adesao","outros_valores",
    "valor_total_taxa_adm_cobrada","percentual_cobrada_calculado","taxa_adm_contratada_percentual","valor_taxa_adm_devida","diferenca_valores",
    "justica_gratuita","tipo_justica","inicio_juros","taxa_juros_percentual",
    "indice_ate_hoje","indice_ate_futuro",
    "comprovante_renda_url","comprovante_endereco_url","documento_identidade_url","observacoes",
    "advogado_id","advogado_nome","advogado_oab","advogado_email","advogado_telefone",
    "comarca_cliente_nome","comarca_cliente_uf","comarca_adm_nome","comarca_adm_uf",
    "resultado_processo","tipo_pagamento","valor_sentenca","ganho_sucumbencia","perda_sucumbencia",
    "honorarios_hoje_adv","honorarios_hoje_emp","honorarios_futuro_adv","honorarios_futuro_emp",
    "liquido_hoje","liquido_futuro","prejuizo",
    "valor_causa_opcao","valor_causa","valor_diferenca",
    "extrato_pdf_url","contrato_url","procuracao_url",
    # "termo_acordo_pdf_url","sentenca_pdf_url",
    "status_documento","zapsign_bundle_id","zapsign_contrato_id","zapsign_procuracao_id","zapsign_links",
    "contrato_assinado_url","procuracao_assinada_url","zapsign_signed_files","zapsign_status","zapsign_signed_at",
    "criado_em","atualizado_em","gerado_por_usuario_id","gerado_em","enviado_por_usuario_id","enviado_em",
    "extras",
}

def _merge_extras(existing: Optional[dict], incoming: Optional[dict]) -> dict:
    base = dict(existing or {})
    for k, v in (incoming or {}).items():
        base[k] = v
    return base

def _set_from_dados(extrato: Extrato, dados: Optional[Dict[str, Any]]) -> None:
    """Ajusta campos conhecidos e joga o restante em extras. Não sobrescreve com None."""
    extras = dict(extrato.extras or {})
    for k, v in (dados or {}).items():
        if v is None:
            # não apaga conteúdos existentes com None
            continue
        v = _norm_dates_for_field(k, v)
        if k in FIXED_FIELDS and hasattr(Extrato, k):
            setattr(extrato, k, v)
        else:
            extras[k] = v
    extrato.extras = _merge_extras(extras, {})  # garante dict

def _download_to_tmp(url: str) -> str:
    try:
      r = requests.get(url, timeout=60)
      if r.status_code != 200:
          raise HTTPException(status_code=400, detail=f"Não consegui baixar: {url}")
    except requests.exceptions.RequestException as e:
      raise HTTPException(status_code=400, detail=f"Falha ao baixar '{url}': {e}")
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tf:
        tf.write(r.content)
        return tf.name

def _resolve_api_key(db: Session, extrato: Extrato) -> str:
    # tenta via advogado_id; se não achar, usa variável de ambiente
    if getattr(extrato, "advogado_id", None):
        try:
            adv = db.execute(select(Advogado).where(Advogado.id == extrato.advogado_id)).scalar_one_or_none()
            if adv and getattr(adv, "api_key_zapsign", None):
                return adv.api_key_zapsign
        except Exception:
            pass
    api_key = os.getenv("ZAPSIGN_API_KEY_DEFAULT", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ZAPSIGN_API_KEY_DEFAULT não configurada.")
    return api_key

def _normalize_zapsign_result(resultado: Any) -> Tuple[Optional[str], Optional[str], Optional[str], dict]:
    """
    Retorna (bundle_id, contrato_id, procuracao_id, links_dict)
    Aceita formatos variados.
    """
    bundle_id = contrato_id = procuracao_id = None
    links: Dict[str, str] = {}

    if isinstance(resultado, dict):
        # IDs
        for key in ("bundle_id", "zapsign_bundle_id"):
            if resultado.get(key):
                bundle_id = resultado[key]; break
        for key in ("contrato_id", "zapsign_contrato_id"):
            if resultado.get(key):
                contrato_id = resultado[key]; break
        for key in ("procuracao_id", "zapsign_procuracao_id"):
            if resultado.get(key):
                procuracao_id = resultado[key]; break

        # Links
        if isinstance(resultado.get("links"), dict):
            links.update({k: str(v) for k, v in resultado["links"].items() if v})
        for key in ("link", "url", "zapsign_link", "link_assinatura"):
            if resultado.get(key):
                links.setdefault("principal", str(resultado[key]))
    else:
        # se vier string única (URL)
        try:
            s = str(resultado).strip()
            if s:
                links["principal"] = s
        except Exception:
            pass

    return bundle_id, contrato_id, procuracao_id, links

# 🔵 NOVO: monta a webhook_url por advogado
def _build_webhook_url(db: Session, extrato: Extrato) -> str:
    if not PUBLIC_BASE_URL:
        raise HTTPException(status_code=500, detail="PUBLIC_BASE_URL não configurada no servidor")
    if not getattr(extrato, "advogado_id", None):
        raise HTTPException(status_code=400, detail="Selecione um advogado antes de enviar para assinatura")

    adv = db.execute(select(Advogado).where(Advogado.id == extrato.advogado_id)).scalar_one_or_none()
    if not adv or not getattr(adv, "webhook_path_token", None):
        raise HTTPException(status_code=400, detail="Advogado sem webhook configurado (token ausente)")

    url = f"{PUBLIC_BASE_URL}/assinaturas/hook/{adv.webhook_path_token}"
    if getattr(adv, "webhook_secret", None):
        url = f"{url}?secret={adv.webhook_secret}"
    return url

# ---------- Rotas ----------

@router.post("/enviar")
@auto_timezone_save
def enviar_para_assinatura(
    payload: EnviarReq,
    db: Session = Depends(get_db),
    x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id"),
):
    # valida cabeçalho
    if not x_usuario_id:
        raise HTTPException(status_code=400, detail="Cabeçalho 'X-Usuario-Id' é obrigatório.")
    try:
        usuario_id = int(x_usuario_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Cabeçalho 'X-Usuario-Id' inválido (deve ser inteiro).")

    # upsert básico
    if payload.id:
        extrato = db.get(Extrato, payload.id)
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
    else:
        extrato = Extrato(usuario_id=usuario_id)
        db.add(extrato)

    # merge leve: dados conhecidos viram campos, o resto vai para extras
    _set_from_dados(extrato, payload.dados or {})

    # URLs utilizadas no envio (se vierem)
    for attr in ("extrato_pdf_url", "contrato_url", "procuracao_url"):
        val = getattr(payload, attr)
        if val is not None:
            setattr(extrato, attr, val)

    # auditoria mínima
    extrato.enviado_por_usuario_id = usuario_id
    # auditoria/timezone: garantir id (flush) e atribuir um datetime timezone-aware
    # usando o ORM em vez de UPDATE texto cru. Isso preserva timezone e evita
    # inconsistências observadas ao gravar strings manualmente.
    db.flush()  # garante que extrato.id exista antes de dependermos dele
    from app.core.time import now_utc_for_sqlite
    extrato.enviado_em = extrato.enviado_em or now_utc_for_sqlite()
    
    # Atualizar timers quando enviado_em é definido
    update_extrato_timers(extrato, db)

    db.commit()
    db.refresh(extrato)

    # valida pré-envio
    if not extrato.contrato_url or not extrato.procuracao_url:
        raise HTTPException(status_code=400, detail="Contrato/Procuração ausentes para envio")

    # webhook por advogado
    webhook_url = _build_webhook_url(db, extrato)

    contrato_path = procuracao_path = None
    try:
        contrato_path = _download_to_tmp(extrato.contrato_url)
        procuracao_path = _download_to_tmp(extrato.procuracao_url)

        resultado = enviar_documentos_consolidados_para_assinatura(
            nome_cliente=extrato.nome_cliente,
            telefone_cliente=getattr(extrato, "telefone", None),
            caminho_contrato=contrato_path,
            caminho_procuracao=procuracao_path,
            api_key=_resolve_api_key(db, extrato),
            webhook_url=webhook_url,
            require_selfie_photo=False,  # ✅ Desativado: não pede mais selfie
            require_document_photo=False,  # ✅ Desativado: não pede mais foto do documento
            sandbox=True,  # Força modo sandbox para desenvolvimento
            selfie_validation_type="none",
            metadata={"extrato_id": extrato.id},
        )

        b_id, c_id, p_id, links = _normalize_zapsign_result(resultado)
        if not c_id and isinstance(resultado, dict):
            c_id = resultado.get("contrato_id") or resultado.get("zapsign_contrato_id")

        extrato.status_documento = "enviado"
        if b_id: extrato.zapsign_bundle_id = b_id
        if c_id: extrato.zapsign_contrato_id = c_id
        if p_id: extrato.zapsign_procuracao_id = p_id

        links_atual = dict(extrato.zapsign_links or {})
        if isinstance(links, dict):
            links_atual.update(links)
        extrato.zapsign_links = links_atual or None
        extrato.zapsign_status = "enviado"

        db.commit()
        db.refresh(extrato)

    except Exception as e:
        extrato.status_documento = "erro"
        db.commit()
        raise HTTPException(status_code=500, detail=f"ZapSign: {e}")
    finally:
        for path in (contrato_path, procuracao_path):
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass

    links_resp = extrato.zapsign_links or {}
    link_principal = links_resp.get("principal") or links_resp.get("link_assinatura")

    return {
        "ok": True,
        "id": extrato.id,
        "status": extrato.status_documento or "enviado",
        "bundle_id": getattr(extrato, "zapsign_bundle_id", None),
        "contrato_id": getattr(extrato, "zapsign_contrato_id", None),
        "procuracao_id": getattr(extrato, "zapsign_procuracao_id", None),
        "link_principal": link_principal,
        "links": links_resp,
    }


@router.post("/{extrato_id}/assinar-externo")
def marcar_assinatura_externa(
    extrato_id: int,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
):
    extrato = db.get(Extrato, extrato_id)
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    agora_utc = now_utc_for_sqlite()
    agora_sp = now_sp()
    extrato.status_documento = "assinado_externo"
    extrato.zapsign_status = "assinado_externo"
    extrato.zapsign_signed_at = extrato.zapsign_signed_at or agora_sp.isoformat()
    extrato.enviado_em = extrato.enviado_em or agora_utc

    extras_atual = dict(extrato.extras or {})
    trilha = extras_atual.get("assinatura_externa")
    if not isinstance(trilha, list):
        trilha = []
    trilha.append(
        {
            "por_usuario_id": getattr(usuario, "id", None),
            "por_usuario_nome": getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None),
            "registrado_em": agora_sp.isoformat(),
        }
    )
    extras_atual["assinatura_externa"] = trilha
    extrato.extras = extras_atual

    db.commit()
    db.refresh(extrato)

    return {
        "ok": True,
        "id": extrato.id,
        "status_documento": extrato.status_documento,
        "zapsign_status": extrato.zapsign_status,
        "zapsign_signed_at": extrato.zapsign_signed_at,
        "enviado_em": extrato.enviado_em,
    }
