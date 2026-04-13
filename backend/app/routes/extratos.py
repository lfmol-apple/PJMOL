from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional, Any, Dict, Set, Annotated

from fastapi import APIRouter, Depends, HTTPException, Header, status, Query, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session, selectinload  # 🔵
from sqlalchemy.exc import IntegrityError

from database import get_db
from app.core.time import now_sp, now_utc_for_sqlite
from app.core.timers import update_extrato_timers, get_extrato_timer_info
from app.core.timezone_middleware import auto_timezone_save, auto_timezone_display
from app.models.extrato import Extrato
from app.models.usuario import Usuario  # 🔵
from app.models.relacionados import ParcelaExtrato, CustaExtrato, AnexoExtrato
from app.services.push_notifications import notify_monitors_about_new_process

try:  # preferir helpers oficiais do módulo de uploads, mas manter fallback
    from app.routes.uploads import (  # type: ignore
        _fs_public_urls as _uploads_fs_public_urls,
        _db_status as _uploads_db_status,
    )
except Exception:  # pragma: no cover
    _uploads_fs_public_urls = None  # type: ignore
    _uploads_db_status = None  # type: ignore

# --- Helpers para normalizar campos JSON que às vezes vêm como string ---
import json as _json

def _coerce_json_list(val):
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            v = _json.loads(val)
            return v if isinstance(v, list) else []
        except Exception:
            return []
    return []

def _coerce_json_dict(val):
    if isinstance(val, dict):
        return val
    if val is None:
        return {}
    if isinstance(val, str):
        try:
            v = _json.loads(val)
            return v if isinstance(v, dict) else {}
        except Exception:
            return {}
    return {}

_DEFAULT_FS_KEYS = (
    "extrato_original",
    "comprovante_endereco",
    "comprovante_renda",
    "documento_identidade",
    "outros",
)


def _resolve_fs_payload(extrato_id: int) -> Dict[str, Any]:
    """Wrapper seguro: usa helper de uploads se disponível, garantindo chaves padrão."""
    base = {key: [] for key in _DEFAULT_FS_KEYS}
    helper = _uploads_fs_public_urls
    if callable(helper):
        try:
            fs = helper(extrato_id) or {}
            if isinstance(fs, dict):
                merged = base.copy()
                for key, value in fs.items():
                    merged[key] = value
                for key in _DEFAULT_FS_KEYS:
                    merged.setdefault(key, [])
                return merged
        except Exception:
            pass
    return base


def _resolve_db_status_payload(extrato_id: int) -> Optional[Dict[str, Any]]:
    helper = _uploads_db_status
    if callable(helper):
        try:
            dbinfo = helper(extrato_id)
            if isinstance(dbinfo, dict):
                return dbinfo
        except Exception:
            pass
    return None


def _normalize_doc_list(raw: Any) -> List[str]:
    """Normaliza listas de documentos (aceita str/list/dict com frente/verso/completo)."""
    out: List[str] = []
    if isinstance(raw, list):
        out = [str(x).strip() for x in raw if str(x).strip()]
    elif isinstance(raw, dict):
        for key in ("completo", "frente", "verso", "lista"):
            val = raw.get(key)
            if isinstance(val, list):
                out.extend(str(x).strip() for x in val if str(x).strip())
            elif isinstance(val, str) and val.strip():
                out.append(val.strip())
    elif isinstance(raw, str) and raw.strip():
        out = [raw.strip()]
    return out


_EXTRAS_EMAIL_KEYS = {
    "adv_email_last_sent_to",
    "adv_email_last_sent_name",
    "adv_email_last_sent_at",
}


def _sanitize_extras_on_create(raw_extras):
    """
    Remove históricos legados de e-mails quando um payload reaproveitado chega no POST /extratos.
    """
    data = _coerce_json_dict(raw_extras)
    if not data:
        return None

    for key in _EXTRAS_EMAIL_KEYS:
        data.pop(key, None)

    hist = data.get("adv_email_history")
    if isinstance(hist, list):
        data["adv_email_history"] = []
    else:
        data.pop("adv_email_history", None)

    return data or None


def _decorate_extrato_payload(data: Dict[str, Any], extrato_id: int) -> Dict[str, Any]:
    """
    Enriquecer payload com projeção do filesystem e status derivados (mínimos).
    Preserva campos existentes e adiciona:
      - extras.from_filesystem
      - extras.from_db (quando disponível)
      - extras.minimos (atualizados com base no filesystem)
      - extras.documento_identidade normalizado e deduplicado
      - from_filesystem / from_db no nível raiz (compat com front)
    """
    enriched = dict(data)
    extras_dict = _coerce_json_dict(enriched.get("extras"))
    if not isinstance(extras_dict, dict):
        extras_dict = {}

    fs_payload = _resolve_fs_payload(extrato_id)
    db_status_snapshot = _resolve_db_status_payload(extrato_id)

    doc_list: List[str] = []
    doc_list.extend(_normalize_doc_list(extras_dict.get("documento_identidade")))

    doc_url = enriched.get("documento_identidade_url")
    if isinstance(doc_url, str) and doc_url.strip():
        doc_list.append(doc_url.strip())

    for url in fs_payload.get("documento_identidade", []) or []:
        if isinstance(url, str) and url.strip():
            doc_list.append(url.strip())

    seen: Set[str] = set()
    flat_docs: List[str] = []
    for url in doc_list:
        if url and url not in seen:
            flat_docs.append(url)
            seen.add(url)
    extras_dict["documento_identidade"] = flat_docs

    endereco_url = enriched.get("comprovante_endereco_url") or extras_dict.get("comprovante_endereco_url")
    fs_enderecos = fs_payload.get("comprovante_endereco", []) or []
    has_addr = bool(fs_enderecos) or bool(endereco_url)
    has_id = bool(fs_payload.get("documento_identidade")) or bool(flat_docs)

    extras_dict.setdefault(
        "endereco_snapshot",
        {
            "rua": enriched.get("rua"),
            "numero": enriched.get("numero"),
            "bairro": enriched.get("bairro"),
            "complemento": enriched.get("complemento"),
            "cidade": enriched.get("cidade"),
            "estado": enriched.get("estado"),
            "cep": enriched.get("cep"),
        },
    )

    existing_minimos_raw = extras_dict.get("minimos")
    existing_minimos = existing_minimos_raw if isinstance(existing_minimos_raw, dict) else {}
    new_minimos = {
        "endereco_ok": has_addr,
        "identidade_ok": has_id,
        "modo_identidade": "arquivo" if has_id else "incompleto",
    }
    new_minimos["ok"] = bool(new_minimos["endereco_ok"] and new_minimos["identidade_ok"])
    merged_minimos = dict(existing_minimos)
    merged_minimos.update(new_minimos)
    extras_dict["minimos"] = merged_minimos

    extras_dict["from_filesystem"] = fs_payload
    if db_status_snapshot:
        extras_dict["from_db"] = db_status_snapshot
    else:
        extras_dict.pop("from_db", None)

    enriched["extras"] = extras_dict
    enriched["from_filesystem"] = fs_payload
    if db_status_snapshot:
        enriched["from_db"] = db_status_snapshot
    else:
        enriched.pop("from_db", None)

    return enriched
# --- FIM helpers ---

# ================
# Blindagem: não apagar advogado/comarca com null/""
# ================
_SENSITIVE_KEEP_IF_EMPTY: Set[str] = {
    "advogado_nome",
    "advogado_oab",
    "advogado_email",
    "advogado_telefone",
    "comarca_escolhida_nome",
    "comarca_escolhida_uf",
}

def _is_empty(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, str) and v.strip() == "":
        return True
    return False


# =========================
# Utilidades de recálculo
# =========================

def _recalcular_extrato_vals(db: 'Session', extrato: Any) -> None:
    """
    Recalcula os campos consolidados do extrato e salva.

    Prioridade de regra:
      1) Acordo: usa valor_acordo como base do 'hoje' e limpa 'futuro'.
      2) Ganhamos + à vista: usa valor_sentenca como base do 'hoje' e limpa 'futuro'.
      3) Caso contrário: mantém a regra atual de somar parcelas/juros/outros.

    Honorários:
      - Quando houver base (hoje/futuro) e honorarios_percentual definido,
        calcula o total (= base * pct/100) e divide 50/50 entre adv/emp.
    """
    try:
        from datetime import date as _date

        # Utilidades
        def _pct(v):
            try:
                return float(v or 0.0)
            except Exception:
                return 0.0

        def _money(v):
            try:
                return float(v) if v is not None else None
            except Exception:
                return None

        def _half_split(total: Optional[float]) -> tuple[Optional[float], Optional[float]]:
            if total is None:
                return None, None
            try:
                half = float(total) / 2.0
                return half, half
            except Exception:
                return None, None

        honor_pct = _pct(getattr(extrato, "honorarios_percentual", None))
        outros = _pct(getattr(extrato, "outros_valores", 0))

        # Normalização de textos
        def _norm(s: Any) -> str:
            if not s:
                return ""
            s = str(s).strip().lower()
            return (
                "avista" if s in {"avista", "a_vista", "à vista", "a vista", "a-vista"} else s
            )

        resultado = _norm(getattr(extrato, "resultado_processo", None))
        tipo_pg = _norm(getattr(extrato, "tipo_pagamento", None))
        valor_acordo = _money(getattr(extrato, "valor_acordo", None))
        valor_sentenca = _money(getattr(extrato, "valor_sentenca", None))

        # ============== 1) ACORDO  ==============
        if resultado == "acordo" and (valor_acordo is not None):
            base = float(valor_acordo)
            # honorários hoje (total e split 50/50)
            hon_total = base * (honor_pct / 100.0)
            hon_adv, hon_emp = _half_split(hon_total)
            # líquidos hoje (desconta honorários e 'outros')
            liquido_hoje = base - (hon_total) - (outros or 0.0)

            # aplicar no extrato
            extrato.valor_corrigido_hoje = base
            extrato.honorarios_hoje_adv = hon_adv
            extrato.honorarios_hoje_emp = hon_emp
            extrato.liquido_hoje = liquido_hoje

            # limpar futuro
            extrato.valor_corrigido_futuro = None
            extrato.liquido_futuro = None
            extrato.honorarios_futuro_adv = None
            extrato.honorarios_futuro_emp = None

            db.add(extrato); db.commit(); db.refresh(extrato)
            return

        # ============== 2) GANHAMOS + À VISTA  ==============
        if resultado == "ganhamos" and tipo_pg == "avista" and (valor_sentenca is not None):
            base = float(valor_sentenca)
            hon_total = base * (honor_pct / 100.0)
            hon_adv, hon_emp = _half_split(hon_total)
            liquido_hoje = base - (hon_total) - (outros or 0.0)

            extrato.valor_corrigido_hoje = base
            extrato.honorarios_hoje_adv = hon_adv
            extrato.honorarios_hoje_emp = hon_emp
            extrato.liquido_hoje = liquido_hoje

            extrato.valor_corrigido_futuro = None
            extrato.liquido_futuro = None
            extrato.honorarios_futuro_adv = None
            extrato.honorarios_futuro_emp = None

            db.add(extrato); db.commit(); db.refresh(extrato)
            return

        # ============== 3) REGRA ATUAL (parcelas/juros/outros)  ==============
        parcelas = getattr(extrato, 'parcelas', None) or getattr(extrato, 'parcelas_extrato', None) or []
        soma_hoje = 0.0
        soma_futuro = 0.0
        tem_futuro = False

        for p in parcelas:
            vch = getattr(p, 'valor_corrigido_hoje', None)
            vcf = getattr(p, 'valor_corrigido_futuro', None)
            if vch is not None:
                try:
                    soma_hoje += float(vch)
                except Exception:
                    pass
            elif getattr(p, 'valor_pago', None) is not None:
                try:
                    soma_hoje += float(p.valor_pago)
                except Exception:
                    pass
            if vcf is not None:
                tem_futuro = True
                try:
                    soma_futuro += float(vcf)
                except Exception:
                    pass

        total_hoje = float(soma_hoje)
        total_futuro = float(soma_futuro) if tem_futuro else None

        # juros compostos opcionais
        taxa = getattr(extrato, 'taxa_juros_percentual', None) or getattr(extrato, 'juros_mensal_percent', None)
        inicio = getattr(extrato, 'inicio_juros', None) or getattr(extrato, 'data_inicio_juros', None)
        enc = getattr(extrato, 'data_encerramento', None)

        try:
            taxa_f = float(taxa) if taxa is not None else 0.0
        except Exception:
            taxa_f = 0.0

        if taxa_f and inicio:
            def months_between(d1: _date, d2: _date) -> int:
                return max(0, (d2.year - d1.year) * 12 + (d2.month - d1.month))
            fator = 1.0 + (taxa_f / 100.0)
            m_hoje = months_between(inicio, _date.today())
            total_hoje = float(total_hoje) * (fator ** m_hoje)
            if total_futuro is not None and enc:
                m_fut = months_between(inicio, enc)
                total_futuro = float(total_futuro) * (fator ** m_fut)

        # líquidos considerando 'outros'
        liquido_hoje = (float(total_hoje) - (outros or 0.0)) if total_hoje is not None else None
        liquido_futuro = (float(total_futuro) - (outros or 0.0)) if total_futuro is not None else None

        # honorários (se houver percentual)
        hon_hoje_total = float(total_hoje) * (honor_pct / 100.0) if total_hoje is not None and honor_pct else None
        hon_fut_total = float(total_futuro) * (honor_pct / 100.0) if total_futuro is not None and honor_pct else None
        hon_hoje_adv, hon_hoje_emp = _half_split(hon_hoje_total)
        hon_fut_adv, hon_fut_emp = _half_split(hon_fut_total)

        # aplica no extrato
        extrato.valor_corrigido_hoje = float(total_hoje) if total_hoje is not None else extrato.valor_corrigido_hoje
        extrato.valor_corrigido_futuro = float(total_futuro) if total_futuro is not None else None
        extrato.liquido_hoje = liquido_hoje
        extrato.liquido_futuro = liquido_futuro

        # só seta honorários quando conseguimos calcular (para não "apagar" manualmente)
        if hon_hoje_total is not None:
            extrato.honorarios_hoje_adv = hon_hoje_adv
            extrato.honorarios_hoje_emp = hon_hoje_emp
        if hon_fut_total is not None:
            extrato.honorarios_futuro_adv = hon_fut_adv
            extrato.honorarios_futuro_emp = hon_fut_emp
        elif tem_futuro is False:
            # se não existe futuro, limpamos (consistente com regra)
            extrato.honorarios_futuro_adv = None
            extrato.honorarios_futuro_emp = None

        db.add(extrato)
        db.commit()
        db.refresh(extrato)

    except Exception as e:
        # recálculo não deve derrubar a request
        print("[extratos] aviso: exceção no recálculo:", e)
        pass



# =========================
# Pydantic Schemas (Swagger)
# =========================

class ParcelaIn(BaseModel):
    numero_parcela: Optional[int] = None
    data_pagamento: Optional[date] = Field(default=None, description="YYYY-MM-DD")
    valor_pago: Optional[float] = None
    valor_corrigido_hoje: Optional[float] = None
    valor_corrigido_futuro: Optional[float] = None
    tipo: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class ParcelaOut(ParcelaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    extrato_id: int


class CustaIn(BaseModel):
    data: Optional[date] = Field(default=None, description="YYYY-MM-DD")
    descricao: Optional[str] = None
    valor: Optional[float] = None
    model_config = ConfigDict(extra="ignore")


class CustaOut(CustaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    extrato_id: int


class AnexoIn(BaseModel):
    original_name: Optional[str] = None
    filename: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None
    url_publica: Optional[str] = None
    model_config = ConfigDict(extra="ignore")


class AnexoOut(AnexoIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    extrato_id: int


class ExtratoIn(BaseModel):
    model_config = ConfigDict(extra="ignore")  # ignora chaves desconhecidas

    # Campos obrigatórios (NOT NULL no banco)
    grupo: str
    cota: str
    nome_cliente: str
    cpf_cnpj: str
    tipo_documento: str
    administradora: str
    total_parcelas_plano: int
    data_encerramento: date
    valor_total_pago_extrato: float

    # Endereço e identificação do cliente
    rua: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    complemento: Optional[str] = None
    cep: Optional[str] = None

    # Contrato e administradora
    numero_contrato: Optional[str] = None
    cnpj_administradora: Optional[str] = None

    # Comarca consolidada escolhida
    comarca_escolhida_nome: Optional[str] = None
    comarca_escolhida_uf: Optional[str] = None

    # Listas
    parcelas: Optional[List[ParcelaIn]] = Field(default=None, description="Lista de parcelas do extrato")
    custas: Optional[List[CustaIn]] = Field(default=None, description="Lista de custas do extrato")
    anexos: Optional[List[AnexoIn]] = Field(default=None, description="Lista de anexos do extrato")

    # Opcionais / snapshots
    telefone: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None

    numero_processo: Optional[str] = None
    honorarios_percentual: Optional[float] = None
    nome_magistrado: Optional[str] = None

    # **campos adicionais**
    parcelas_pagas: Optional[int] = None
    soma_valores_pagos: Optional[float] = None
    valor_corrigido_futuro: Optional[float] = None

    # consolidados (mantidos)
    valor_corrigido_hoje: Optional[float] = None
    valor_credito: Optional[float] = None
    valor_pago_extrato: Optional[float] = None
    valor_pg_liquido: Optional[float] = None

    fundo_comum: Optional[float] = None
    fundo_reserva: Optional[float] = None
    seguros: Optional[float] = None
    multas: Optional[float] = None
    juros: Optional[float] = None
    adesao: Optional[float] = None
    outros_valores: Optional[float] = None

    valor_total_taxa_adm_cobrada: Optional[float] = None
    percentual_cobrada_calculado: Optional[float] = None
    taxa_adm_contratada_percentual: Optional[float] = None
    valor_taxa_adm_devida: Optional[float] = None

    justica_gratuita: Optional[bool] = None
    tipo_justica: Optional[str] = None
    inicio_juros: Optional[date] = None
    taxa_juros_percentual: Optional[float] = None

    indice_ate_hoje: Optional[str] = None
    indice_ate_futuro: Optional[str] = None

    honorarios_hoje_adv: Optional[float] = None
    honorarios_hoje_emp: Optional[float] = None
    honorarios_futuro_adv: Optional[float] = None
    honorarios_futuro_emp: Optional[float] = None
    liquido_hoje: Optional[float] = None
    liquido_futuro: Optional[float] = None
    valor_causa_opcao: Optional[str] = None
    valor_causa: Optional[float] = None

    # RESULTADO / DECISÃO
    resultado_processo: Optional[str] = None
    tipo_pagamento: Optional[str] = None
    valor_sentenca: Optional[float] = None
    valor_acordo: Optional[float] = None  # ✅ novo: aceitar valor do acordo

    ganho_sucumbencia: Optional[float] = None
    perda_sucumbencia: Optional[float] = None
    reembolso_custas: Optional[float] = None
    prejuizo: Optional[float] = None
    data_sentenca: Optional[date] = None
    houve_sentenca: Optional[bool] = None

    comprovante_renda_url: Optional[str] = None
    comprovante_endereco_url: Optional[str] = None
    documento_identidade_url: Optional[str] = None
    observacoes: Optional[str] = None

    # ✅ correção aqui: eram floats em alguns lugares; garantimos str nos 4
    advogado_nome: Optional[str] = None
    advogado_oab: Optional[str] = None
    advogado_email: Optional[str] = None
    advogado_telefone: Optional[str] = None
    advogado_id: Optional[int] = None
    gerente_nome: Optional[str] = None  # 🔵

    cidade_estado_cliente: Optional[str] = None
    email_cliente: Optional[str] = None
    endereco_cliente: Optional[str] = None

    comprovante_identidade_url: Optional[str] = None
    nacionalidade: Optional[str] = None
    extrato_pdf_url: Optional[str] = None
    contrato_url: Optional[str] = None
    procuracao_url: Optional[str] = None
    termo_acordo_pdf_url: Optional[str] = None
    sentenca_pdf_url: Optional[str] = None

    status_documento: Optional[str] = None
    zapsign_bundle_id: Optional[str] = None
    zapsign_contrato_id: Optional[str] = None
    zapsign_procuracao_id: Optional[str] = None
    zapsign_links: Optional[Dict[str, Any]] = None

    contrato_assinado_url: Optional[str] = None
    procuracao_assinada_url: Optional[str] = None
    zapsign_signed_files: Optional[List[Dict[str, Any]]] = None
    zapsign_status: Optional[str] = None
    zapsign_signed_at: Optional[datetime] = None
    
    # Campo de auditoria de envio
    enviado_em: Optional[datetime] = None

    extras: Optional[Dict[str, Any]] = None

    # Campos adicionais que o frontend envia mas não estavam no schema
    advogado: Optional[str] = None  # nome do advogado (legado)
    custas_processuais: Optional[List[Dict[str, Any]]] = None  # lista de custas (será convertida)
    valor_diferenca: Optional[float] = None  # diferença calculada
    fase_processo: Optional[str] = None  # fase do processo (ganhamos/perdemos/acordo/sem julgamento)
    juros_mora_percentual: Optional[float] = None  # percentual de juros de mora
    comarca_cliente_nome: Optional[str] = None  # nome da comarca do cliente
    comarca_cliente_uf: Optional[str] = None  # UF da comarca do cliente
    comarca_adm_nome: Optional[str] = None  # nome da comarca da administradora
    comarca_adm_uf: Optional[str] = None  # UF da comarca da administradora
    liquido_corrigido_hoje: Optional[float] = None  # líquido corrigido hoje
    liquido_corrigido_futuro: Optional[float] = None  # líquido corrigido futuro
    percentual_honorarios: Optional[float] = None  # percentual de honorários


# Mantemos ExtratoUpdate (não usado no PUT integral)
class ExtratoUpdate(ExtratoIn):
    grupo: Optional[str] = None
    cota: Optional[str] = None
    nome_cliente: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    tipo_documento: Optional[str] = None
    administradora: Optional[str] = None
    total_parcelas_plano: Optional[int] = None
    data_encerramento: Optional[date] = None
    valor_total_pago_extrato: Optional[float] = None


class ExtratoOut(ExtratoIn):
    model_config = ConfigDict(from_attributes=True, extra="ignore")
    id: int
    usuario_id: int
    criado_em: Optional[datetime] = None
    atualizado_em: Optional[datetime] = None
    advogado_id: Optional[int] = None
    gerente_nome: Optional[str] = None  # 🔵
    valor_acordo: Optional[float] = None  # ✅ garantir que saia no response
    from_filesystem: Optional[Dict[str, Any]] = None
    from_db: Optional[Dict[str, Any]] = None

    parcelas: List[ParcelaOut] = []
    custas: List[CustaOut] = []
    anexos: List[AnexoOut] = []


# ================
# Router / Helpers
# ================
router = APIRouter(prefix="/extratos", tags=["Extratos"])


def _norm(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = s.strip().lower()
    if s in {"administrador", "adm", "super", "root"}:
        return "admin"
    if s in {"manager"}:
        return "gerente"
    return s


def get_perfil_header(
    x_perfil: Optional[str] = Header(None, alias="X-Perfil"),
    perfil_q: Optional[str] = Query(None),
) -> Optional[str]:
    return _norm(x_perfil or perfil_q)


def maybe_usuario_id(
    x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    usuario_id_q: Optional[int] = Query(None),
) -> Optional[int]:
    raw = x_usuario_id or x_user_id or (str(usuario_id_q) if usuario_id_q is not None else None)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except Exception:
        return None


def get_usuario_id_strict(
    x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
) -> int:
    raw = x_usuario_id or x_user_id
    if not raw:
        raise HTTPException(status_code=400, detail="Cabeçalho 'X-Usuario-Id' é obrigatório.")
    try:
        return int(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Cabeçalho 'X-Usuario-Id' inválido (deve ser inteiro).")


def _iso(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    return o


def _children_to_dict(extrato: Extrato) -> Dict[str, Any]:
    """Converte as relações para listas de dicts (datas em ISO)."""
    parcelas = []
    if getattr(extrato, "parcelas", None):
        for p in extrato.parcelas:
            parcelas.append({
                "id": p.id,
                "extrato_id": p.extrato_id,
                "numero_parcela": p.numero_parcela,
                "data_pagamento": _iso(p.data_pagamento),
                "valor_pago": p.valor_pago,
                "valor_corrigido_hoje": p.valor_corrigido_hoje,
                "valor_corrigido_futuro": p.valor_corrigido_futuro,
                "tipo": p.tipo,
            })

    custas = []
    if getattr(extrato, "custas", None):
        for c in extrato.custas:
            custas.append({
                "id": c.id,
                "extrato_id": c.extrato_id,
                "data": _iso(c.data),
                "descricao": c.descricao,
                "valor": c.valor,
            })

    anexos = []
    if getattr(extrato, "anexos", None):
        for a in extrato.anexos:
            anexos.append({
                "id": a.id,
                "extrato_id": a.extrato_id,
                "original_name": a.original_name,
                "filename": a.filename,
                "mime_type": a.mime_type,
                "size": a.size,
                "url_publica": a.url_publica,
            })

    return {"parcelas": parcelas, "custas": custas, "anexos": anexos}


def _replace_children(
    db: Session,
    extrato: Extrato,
    attr: str,
    model_cls,
    items: Optional[List[Dict[str, Any]]],
):
    """Remove todos os filhos existentes e insere os informados.

    Regras:
    - Se 'items' for None: não mexe na relação.
    - Se 'items' vier (inclusive []): apaga existentes e recria conforme lista.
    """
    if items is None:
        return

    db.query(model_cls).filter(model_cls.extrato_id == extrato.id).delete()

    def parse_date_maybe(v):
        if v is None or v == "":
            return None
        if isinstance(v, (date, datetime)):
            return v if isinstance(v, date) else v.date()
        try:
            return date.fromisoformat(v)
        except Exception:
            return None

    new_objs = []
    for raw in (items or []):
        data = dict(raw or {})
        if model_cls is ParcelaExtrato:
            obj = ParcelaExtrato(
                extrato_id=extrato.id,
                numero_parcela=data.get("numero_parcela"),
                data_pagamento=parse_date_maybe(data.get("data_pagamento")),
                valor_pago=data.get("valor_pago"),
                valor_corrigido_hoje=data.get("valor_corrigido_hoje"),
                valor_corrigido_futuro=data.get("valor_corrigido_futuro"),
                tipo=data.get("tipo"),
            )
        elif model_cls is CustaExtrato:
            obj = CustaExtrato(
                extrato_id=extrato.id,
                data=parse_date_maybe(data.get("data")),
                descricao=data.get("descricao"),
                valor=data.get("valor"),
            )
        elif model_cls is AnexoExtrato:
            obj = AnexoExtrato(
                extrato_id=extrato.id,
                original_name=data.get("original_name"),
                filename=data.get("filename"),
                mime_type=data.get("mime_type"),
                size=data.get("size"),
                url_publica=data.get("url_publica"),
            )
        else:
            raise RuntimeError("Classe de filho não suportada")
        new_objs.append(obj)

    if new_objs:
        db.bulk_save_objects(new_objs)

    db.flush()


# ================
# Endpoints
# ================

def _allowed_fields() -> Set[str]:
    """Campos válidos do modelo para filtrar payloads."""
    return {c.name for c in Extrato.__table__.columns}


# 🔒 Campos sensíveis nunca alterados por este PUT
_PROTECTED_ALWAYS: Set[str] = {
    "advogado_id",
    "dados_advogado_json",
    "zapsign_token",
    "zapsign_bundle_id",
    "zapsign_status",
}


@router.post(
    "",
    response_model=ExtratoOut,
    status_code=status.HTTP_201_CREATED,
    summary="Criar extrato (com parcelas/custas/anexos)",
)
def create_extrato(
    payload: ExtratoIn,
    db: Session = Depends(get_db),
    usuario_id: int = Depends(get_usuario_id_strict),
):
    # Unicidade: usuario_id + grupo + cota (ignora soft-deleted — permite re-criar)
    exists = (
        db.query(Extrato)
        .filter(
            Extrato.usuario_id == usuario_id,
            Extrato.grupo == payload.grupo,
            Extrato.cota == payload.cota,
            Extrato.deleted_at.is_(None),
        )
        .first()
    )
    if exists:
        raise HTTPException(
            status_code=409,
            detail="Já existe um extrato para este usuário com o mesmo grupo e cota.",
        )

    # Filtra somente colunas existentes no modelo (à prova de campos extras do frontend)
    fields = payload.model_dump(exclude={"parcelas", "custas", "anexos"}, exclude_unset=True)
    fields["usuario_id"] = usuario_id
    allowed = _allowed_fields()
    safe_fields = {k: v for k, v in fields.items() if k in allowed}
    if "extras" in safe_fields:
        safe_fields["extras"] = _sanitize_extras_on_create(safe_fields.get("extras"))
    
    # Define status inicial como "salvo" se não foi especificado
    if "status_documento" not in safe_fields or not safe_fields["status_documento"]:
        safe_fields["status_documento"] = "salvo"

    extrato = Extrato(**safe_fields)

    db.add(extrato)
    try:
        db.flush()  # gera extrato.id
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Erro de integridade ao criar extrato: {str(e)}")

    # filhos (replace) — respeita None vs lista vazia
    _replace_children(db, extrato, "parcelas", ParcelaExtrato, [p.dict() for p in (payload.parcelas or [])] if payload.parcelas is not None else None)
    _replace_children(db, extrato, "custas", CustaExtrato, [c.dict() for c in (payload.custas or [])] if payload.custas is not None else None)
    _replace_children(db, extrato, "anexos", AnexoExtrato, [a.dict() for a in (payload.anexos or [])] if payload.anexos is not None else None)

    # Cache desabilitado para performance
    db.commit()
    db.refresh(extrato)

    gerente_nome = (
        db.query(Usuario.nome)
        .filter(Usuario.id == extrato.usuario_id)
        .scalar()
    )
    try:
        notify_monitors_about_new_process(
            db,
            extrato_id=extrato.id,
            nome_cliente=extrato.nome_cliente,
            administradora=extrato.administradora,
            valor_causa=extrato.valor_causa,
            gerente_nome=gerente_nome,
        )
    except Exception as exc:
        print(f"[push_notifications] aviso: falha ao notificar novo processo {extrato.id}: {exc}")

    children = _children_to_dict(extrato)
    data = {k: getattr(extrato, k) for k in ExtratoOut.model_fields.keys() if hasattr(extrato, k)}
    # normalizações
    data["zapsign_signed_files"] = _coerce_json_list(data.get("zapsign_signed_files"))
    data["zapsign_links"] = _coerce_json_dict(data.get("zapsign_links"))
    data["extras"] = _coerce_json_dict(data.get("extras"))
    data = _decorate_extrato_payload(data, extrato.id)

    resp = ExtratoOut.model_validate({
        **data,
        **children,
    })
    return resp


@router.get(
    "",
    response_model=List[ExtratoOut],
    summary="Listar extratos (RBAC flexível: admin vê tudo; gerente filtra se enviar usuario_id)",
)
@auto_timezone_display
def list_extratos(
    db: Session = Depends(get_db),
    perfil: Optional[str] = Depends(get_perfil_header),   # "admin" | "gerente" | None
    usuario_id_opt: Optional[int] = Depends(maybe_usuario_id),
    limit: int = Query(9999, ge=1, le=10000),
    offset: int = Query(0, ge=0),
):
    # ⚡ OTIMIZAÇÃO: Query direta sem decorações extras que causam N+1 queries
    q = db.query(Extrato).options(selectinload(Extrato.usuario))
    # Exclui extratos soft-deleted da listagem padrão
    q = q.filter(Extrato.deleted_at.is_(None))
    if perfil == "gerente" and usuario_id_opt:
        q = q.filter(Extrato.usuario_id == usuario_id_opt)
    q = q.order_by(Extrato.id.desc()).limit(limit).offset(offset)
    rows = q.all()

    id_to_nome: dict[int, str] = {}  # 🔵 sempre definido

    result: List[ExtratoOut] = []
    for ex in rows:
        children = _children_to_dict(ex)
        data = {k: getattr(ex, k) for k in ExtratoOut.model_fields.keys() if hasattr(ex, k)}
        try:
            data["gerente_nome"] = (getattr(ex.usuario, "nome", None) if getattr(ex, "usuario", None) is not None else None) \
            or id_to_nome.get(ex.usuario_id) \
            or (f"#{ex.usuario_id}" if getattr(ex, "usuario_id", None) is not None else None)
        except Exception as e:
            print("[extratos] aviso: falha ao atribuir gerente_nome:", e)
            data["gerente_nome"] = f"#{getattr(ex, 'usuario_id', '-')}"  # fallback seguro  # 🔵

        # HOTFIX: normalizar campos JSON que podem ter sido salvos como string
        data["zapsign_signed_files"] = _coerce_json_list(data.get("zapsign_signed_files"))
        data["zapsign_links"] = _coerce_json_dict(data.get("zapsign_links"))
        data["extras"] = _coerce_json_dict(data.get("extras"))
        # data = _decorate_extrato_payload(data, ex.id)  # OTIMIZAÇÃO: removido para listagem

        final_data = {**data, **children}
            
        result.append(ExtratoOut.model_validate(final_data))
    
    return result


@router.get(
    "/{extrato_id}",
    response_model=ExtratoOut,
    summary="Obter extrato por ID (inclui arrays)",
)
def get_extrato(
    extrato_id: int,
    db: Session = Depends(get_db),
    usuario_id_opt: Optional[int] = Depends(maybe_usuario_id),
    perfil: Optional[str] = Depends(get_perfil_header),
):
    ex: Optional[Extrato] = None

    # Admins/Gerentes podem acessar qualquer extrato (exceto soft-deleted)
    if perfil in {"admin", "gerente"}:
        ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()

    # Dono do extrato (quando envia X-Usuario-Id)
    if ex is None and usuario_id_opt is not None:
        ex = (
            db.query(Extrato)
            .filter(Extrato.id == extrato_id, Extrato.usuario_id == usuario_id_opt, Extrato.deleted_at.is_(None))
            .first()
        )

    # Advogado (quando front sinaliza modo advogado) — mantém compat anterior
    if ex is None and perfil == "advogado":
        ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()

    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    children = _children_to_dict(ex)

    data = {k: getattr(ex, k) for k in ExtratoOut.model_fields.keys() if hasattr(ex, k)}
    data["zapsign_signed_files"] = _coerce_json_list(data.get("zapsign_signed_files"))
    data["zapsign_links"] = _coerce_json_dict(data.get("zapsign_links"))

    data["extras"] = _coerce_json_dict(data.get("extras"))
    data = _decorate_extrato_payload(data, extrato_id)

    return ExtratoOut.model_validate({**data, **children})


@router.put(
    "/{extrato_id}",
    response_model=ExtratoOut,
    summary="Atualizar extrato (substitui arrays conforme enviados)",
)
def update_extrato(
    extrato_id: int,
    payload: ExtratoIn,  # schema completo
    request: Request,  # Para detectar se vem do gerencial
    db: Session = Depends(get_db),
    # autorização mais flexível
    usuario_id_opt: Optional[int] = Depends(maybe_usuario_id),
    perfil: Optional[str] = Depends(get_perfil_header),
):
    # 🔧 CORREÇÃO: Se vem do gerencial, tratar como link mágico (perfil=advogado)
    referer = request.headers.get("referer", "")
    is_from_gerencial = "gerencial/processos" in referer or "mode=adv" in str(request.url)
    
    if is_from_gerencial:
        print(f"[DEBUG] 🎯 Acesso do gerencial detectado - forçando perfil='advogado'")
        print(f"[DEBUG] Referer: {referer}")
        print(f"[DEBUG] URL: {request.url}")
        print(f"[DEBUG] Perfil original: {perfil} -> Novo perfil: advogado")
        perfil = "advogado"  # Forçar comportamento de link mágico
    
    # Log payload para debug
    import json
    try:
        payload_dict = payload.model_dump()
        print(f"[DEBUG PUT /extratos/{extrato_id}] Payload recebido:")
        print(json.dumps(payload_dict, indent=2, default=str))
    except Exception as e:
        print(f"[DEBUG] Erro ao logar payload: {e}")
    
    # ===== Resolver autorização e carregar o extrato =====
    ex = None

    # 1) Admin/Gerente podem editar qualquer extrato (exceto soft-deleted)
    if perfil in ("admin", "gerente"):
        ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()

    # 2) Dono (quando X-Usuario-Id bate com extrato.usuario_id)
    if ex is None and usuario_id_opt is not None:
        ex = (
            db.query(Extrato)
            .filter(Extrato.id == extrato_id, Extrato.usuario_id == usuario_id_opt, Extrato.deleted_at.is_(None))
            .first()
        )

    # 3) Advogado (link mágico) — quando front sinaliza perfil=advogado
    if ex is None and perfil == "advogado":
        ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()

    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    # Unicidade se grupo/cota mudarem (só valida contra o mesmo usuario do extrato, excluindo deletados)
    if (payload.grupo is not None and payload.grupo != ex.grupo) or (payload.cota is not None and payload.cota != ex.cota):
        dup = (
            db.query(Extrato)
            .filter(
                Extrato.usuario_id == ex.usuario_id,
                Extrato.grupo == (payload.grupo if payload.grupo is not None else ex.grupo),
                Extrato.cota == (payload.cota if payload.cota is not None else ex.cota),
                Extrato.id != ex.id,
                Extrato.deleted_at.is_(None),
            )
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=409,
                detail="Outro extrato com o mesmo grupo e cota já existe para este usuário.",
            )

    # Atualiza apenas o que veio (exclude_unset=True), sem tocar protegidos
    fields_to_update = payload.model_dump(
        exclude={"parcelas", "custas", "anexos"} | _PROTECTED_ALWAYS,
        exclude_unset=True,
    )

    # BLINDAGEM: não apagar advogado/comarca com null/"" (remove do update)
    for k in list(fields_to_update.keys()):
        if k in _SENSITIVE_KEEP_IF_EMPTY and _is_empty(fields_to_update[k]):
            fields_to_update.pop(k, None)

    allowed = _allowed_fields()
    safe_updates = {k: v for k, v in fields_to_update.items() if k in allowed}

    # Evitar alteração indevida de FK se, por alguma razão, escapar aqui
    safe_updates.pop("advogado_id", None)

    # 🔧 CORREÇÃO DO "EFEITO COLA": Se vem do gerencial, não atualizar advogado
    referer = request.headers.get("referer", "")
    is_from_gerencial = "gerencial/processos" in referer or "mode=adv" in str(request.url)
    
    if is_from_gerencial:
        print(f"[DEBUG] Acesso do gerencial detectado - preservando advogado original")
        print(f"[DEBUG] Referer: {referer}")
        print(f"[DEBUG] URL: {request.url}")
        # Remover campos do advogado para não sobrescrever
        advogado_fields = ["advogado", "advogado_nome", "advogado_oab", "advogado_email", "advogado_telefone"]
        for field in advogado_fields:
            if field in safe_updates:
                print(f"[DEBUG] Removendo campo {field} para preservar original")
                safe_updates.pop(field, None)

    # Detectar mudança no número do processo ANTES de aplicar os updates
    numero_processo_changed = False
    old_numero_processo = ex.numero_processo
    
    for k, v in safe_updates.items():
        setattr(ex, k, v)
    
    # Verificar se numero_processo foi alterado (de vazio para preenchido ou mudou valor)
    if 'numero_processo' in safe_updates:
        new_numero_processo = ex.numero_processo
        if new_numero_processo and new_numero_processo != old_numero_processo:
            numero_processo_changed = True
    
    # Se está apenas salvando (não enviando para assinatura), registra data/hora atual
    # Mas se depois enviar para assinatura, a API do ZapSign vai sobrescrever este valor
    # ANTES de aplicar updates, verificar se numero_processo existe e não tem timestamp
    from app.routes.uploads_clean import _set_numero_processo_timestamp
    
    # Helper para garantir extras é dict
    def _coerce_extras_local(v) -> dict:
        if v is None:
            return {}
        if isinstance(v, dict):
            return v
        return {}
    
    # Verificar estado ANTES de sobrescrever extras com None
    extras_before = _coerce_extras_local(ex.extras)
    numero_processo_before = ex.numero_processo
    needs_timestamp = (
        numero_processo_before and 
        numero_processo_before.strip() and 
        not extras_before.get('numero_processo_inserted_at')
    )
    
    for k, v in safe_updates.items():
        setattr(ex, k, v)
    
    # Se estava faltando timestamp, criar AGORA (antes de extras ser sobrescrito)
    if needs_timestamp:
        print(f"[DEBUG] Extrato {ex.id}: numero_processo existe mas falta timestamp!")
        print(f"[DEBUG] numero_processo: {numero_processo_before}")
        print(f"[DEBUG] Chamando _set_numero_processo_timestamp...")
        _set_numero_processo_timestamp(ex, db)
        print(f"[DEBUG] _set_numero_processo_timestamp executado!")
    
    # Se número do processo foi alterado neste update
    if numero_processo_changed:
        print(f"[DEBUG] Extrato {ex.id}: numero_processo mudou, criando timestamp...")
        _set_numero_processo_timestamp(ex, db)
    
    # Se está apenas salvando (não enviando para assinatura), registra data/hora atual
    # Mas se depois enviar para assinatura, a API do ZapSign vai sobrescrever este valor
    if ex.enviado_em is None:
        # Usar UTC para garantir timezone correto no SQLite
        from app.core.time import now_utc_for_sqlite
        ex.enviado_em = now_utc_for_sqlite()

    db.flush()
    
    # Atualizar timers sempre que enviado_em for definido
    update_extrato_timers(ex, db)

    # Relações: se vieram no payload, substitui (inclusive limpa se vier lista vazia)
    if payload.parcelas is not None:
        _replace_children(db, ex, "parcelas", ParcelaExtrato, [p.dict() for p in (payload.parcelas or [])])
    if payload.custas is not None:
        _replace_children(db, ex, "custas", CustaExtrato, [c.dict() for c in (payload.custas or [])])
    if payload.anexos is not None:
        _replace_children(db, ex, "anexos", AnexoExtrato, [a.dict() for a in (payload.anexos or [])])

    # (opcional) recalcular derivados do servidor
    try:
        _recalcular_extrato_vals(db, ex)
    except Exception as e:
        print("[extratos] aviso: falha ao recalcular derivados:", e)

    # Cache desabilitado para performance
    db.commit()
    db.refresh(ex)

    children = _children_to_dict(ex)

    data = {k: getattr(ex, k) for k in ExtratoOut.model_fields.keys() if hasattr(ex, k)}
    # normalização dos campos JSON que podem ter sido salvos como string
    data["zapsign_signed_files"] = _coerce_json_list(data.get("zapsign_signed_files"))
    data["zapsign_links"] = _coerce_json_dict(data.get("zapsign_links"))
    data["extras"] = _coerce_json_dict(data.get("extras"))
    data = _decorate_extrato_payload(data, ex.id)

    return ExtratoOut.model_validate({
        **data,
        **children,
    })


@router.delete(
    "/{extrato_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir extrato (soft-delete) - marca deleted_at, não remove do banco nem do storage",
)
def delete_extrato(
    extrato_id: int,
    db: Session = Depends(get_db),
    perfil: Optional[str] = Depends(get_perfil_header),   # "admin" | "gerente" | None
    usuario_id_opt: Optional[int] = Depends(maybe_usuario_id),
):
    import logging
    logger = logging.getLogger(__name__)

    # Query base — não permitir deletar o que já foi soft-deleted
    q = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None))

    # Se não é admin, precisa filtrar pelo usuário
    if perfil != "admin" and usuario_id_opt:
        q = q.filter(Extrato.usuario_id == usuario_id_opt)
    elif perfil != "admin" and not usuario_id_opt:
        raise HTTPException(status_code=403, detail="Apenas admins podem deletar sem especificar usuário")

    ex = q.first()
    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    # Soft-delete: marca timestamp de exclusão lógica — NÃO remove do banco nem do storage
    from app.core.time import now_sp
    ex.deleted_at = now_sp()
    db.commit()

    logger.info(
        f"[soft-delete] Extrato id={extrato_id} marcado como deletado em {ex.deleted_at}. "
        "Storage preservado. Dados não removidos fisicamente."
    )

    return None


@router.get("/{extrato_id}/timers")
def get_extrato_timers(
    extrato_id: int,
    db: Session = Depends(get_db),
    usuario_id: Optional[int] = Depends(maybe_usuario_id)
):
    """
    Retorna informações dos timers de um extrato específico.
    Usado pelo frontend para exibir as etapas e tempos decorridos.
    """
    ex = db.get(Extrato, extrato_id)
    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    
    # Verificar permissões básicas (mesmo usuário ou admin)
    # TODO: implementar lógica de permissão adequada
    
    # Garantir que os timers estão atualizados
    update_extrato_timers(ex, db)
    
    # Obter informações dos timers
    timer_info = get_extrato_timer_info(ex)
    
    return {
        "extrato_id": extrato_id,
        "status_documento": ex.status_documento,
        "zapsign_status": ex.zapsign_status,
        "enviado_em": ex.enviado_em,
        "zapsign_signed_at": ex.zapsign_signed_at,
        "timers": timer_info
    }
