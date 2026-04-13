# app/routes/webhook_zapsign.py
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
import shutil

import requests  # usado para GET síncrono (detalhes + download)
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from app.models.extrato import Extrato
from app.models.advogado import Advogado

# >>> ADIÇÕES (imports necessários para os avisos) <<<
from app.models.usuario import Usuario
from app.utils.mailer import send_email
# Reaproveita a mesma regra de "mínimos de anexos" usada em /uploads/status
# NOTA: Importação desabilitada temporariamente - webhook não depende de uploads
# from routes.uploads_clean import _fs_public_urls as _anx_fs, _db_status as _anx_db
_anx_fs = lambda extrato_id: {}
_anx_db = lambda extrato_id: None
# <<< FIM ADIÇÕES >>>
from app.core.time import now_sp
from app.core.timers import update_extrato_timers


router = APIRouter(prefix="/assinaturas", tags=["assinaturas"])

# --- Config/Paths -------------------------------------------------------------
APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../app
STORAGE_ROOT = os.getenv("STORAGE_ROOT", os.path.join(APP_DIR, "storage")).rstrip("/")
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")
LOCAL_BASE_FALLBACK = "http://127.0.0.1:8000"
# >>> NOVO: URL pública do FRONTEND para link real do extrato
FRONTEND_PUBLIC_URL = (os.getenv("FRONTEND_PUBLIC_URL") or "https://www.pjmol.com.br").rstrip("/")

EMAIL_REGEX = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)


def _base_url() -> str:
    return PUBLIC_BASE_URL or LOCAL_BASE_FALLBACK


def _mkdir(path: str | Path):
    Path(path).mkdir(parents=True, exist_ok=True)


def _public_url_from_abs(abs_path: str | Path) -> str:
    """
    Converte um caminho absoluto dentro do STORAGE_ROOT em URL pública via /files/...
    """
    rel = os.path.relpath(str(abs_path), STORAGE_ROOT).replace(os.sep, "/")  # ex: assinaturas/4/<token>/documento_assinado.pdf
    return f"{_base_url().rstrip('/')}/files/{rel}"


def _purge_assinaturas_dir(extrato_id: int) -> None:
    target = Path(STORAGE_ROOT) / "assinaturas" / str(extrato_id)
    try:
        if target.exists():
            shutil.rmtree(target)
    except Exception as exc:
        print(f"[webhook] aviso: falha ao limpar assinaturas/{extrato_id}: {exc}")


# --- Helpers ZapSign ----------------------------------------------------------
def _resolve_adv_by_token(
    db: Session,
    token_path: str,
    secret: str | None = None,
) -> Advogado | None:
    stmt = select(Advogado).where(Advogado.webhook_path_token == token_path)
    if secret is not None:
        stmt = stmt.where(Advogado.webhook_secret == secret)
    return db.execute(stmt).scalars().first()


def _resolve_api_key(adv: Advogado | None) -> str:
    if adv and getattr(adv, "api_key_zapsign", None):
        return adv.api_key_zapsign
    return os.getenv("ZAPSIGN_API_KEY_DEFAULT", "SUA_API_KEY_ZAPSIGN")


def _get_doc_detail(doc_token: str, api_key: str) -> dict:
    url = f"https://api.zapsign.com.br/api/v1/docs/{doc_token}/"
    resp = requests.get(url, headers={"Authorization": f"Bearer {api_key}"}, timeout=60)
    resp.raise_for_status()
    return resp.json() or {}


def _download(url: str, dest_path: str | Path):
    r = requests.get(url, timeout=120)
    r.raise_for_status()
    p = Path(dest_path)
    _mkdir(p.parent)
    p.write_bytes(r.content)


def _email_from_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    match = EMAIL_REGEX.search(value)
    if match:
        return match.group(0).lower()
    return None


def _extract_signer_email(detail: dict) -> str | None:
    """
    Varre a resposta da ZapSign e tenta localizar o e-mail utilizado na assinatura.
    Preferimos os signatários marcados como 'signed/completed', mas sempre
    devolvemos o primeiro e-mail válido encontrado.
    """

    if not isinstance(detail, dict):
        return None

    def _collect_signer_emails(signer: dict) -> list[str]:
        if not isinstance(signer, dict):
            return []

        found: list[str] = []

        def _add(email: str | None):
            if email and email not in found:
                found.append(email)

        for key in ("email", "email_address", "emailAddress", "signer_email"):
            _add(_email_from_str(signer.get(key)))

        user_info = signer.get("user")
        if isinstance(user_info, dict):
            for key in ("email", "email_address"):
                _add(_email_from_str(user_info.get(key)))

        signer_meta = signer.get("metadata")
        if isinstance(signer_meta, list):
            for meta in signer_meta:
                if isinstance(meta, dict):
                    key = (meta.get("key") or "").lower()
                    if "email" in key:
                        _add(_email_from_str(meta.get("value")))

        return found

    signers = detail.get("signers")
    if isinstance(signers, dict):
        signers = [signers]

    if isinstance(signers, list):
        signed_statuses = {"signed", "signed_and_finished", "finished", "completed"}
        signed_emails: list[str] = []
        fallback_emails: list[str] = []

        for signer in signers:
            emails = _collect_signer_emails(signer)
            if not emails:
                continue
            status = str(signer.get("status") or signer.get("signing_status") or "").lower()
            target_list = signed_emails if status in signed_statuses else fallback_emails
            for email in emails:
                if email not in target_list:
                    target_list.append(email)

        if signed_emails:
            return signed_emails[0]
        if fallback_emails:
            return fallback_emails[0]

    detail_meta = detail.get("metadata")
    if isinstance(detail_meta, list):
        for meta in detail_meta:
            if not isinstance(meta, dict):
                continue
            key = (meta.get("key") or "").lower()
            if "email" in key:
                email = _email_from_str(meta.get("value"))
                if email:
                    return email

    # Fallback: procura em trilhas/auditoria
    for field in ("audit_trail", "events", "history"):
        segment = detail.get(field)
        if isinstance(segment, (list, dict)):
            serialized = json.dumps(segment, ensure_ascii=False)
            email = _email_from_str(serialized)
            if email:
                return email

    # Última tentativa: varre todo o detail
    serialized = json.dumps(detail, ensure_ascii=False)
    return _email_from_str(serialized)


def _first_nonempty(d: dict, keys: list[str]) -> str | None:
    for k in keys:
        v = d.get(k)
        if v:
            return v
    return None


def _extract_extrato_id_from_metadata(detail: dict) -> int | None:
    """
    ZapSign pode devolver metadata como lista [{"key":"extrato_id","value":"123"}]
    """
    metas = detail.get("metadata") or []
    for m in metas:
        try:
            if (m.get("key") or "").strip() == "extrato_id":
                return int(str(m.get("value") or "").strip())
        except Exception:
            pass
    return None


def _load_signed_files(existing) -> list[dict]:
    """
    Normaliza o campo extrato.zapsign_signed_files (pode vir None, str JSON ou list).
    Sempre retorna uma lista de dicts [{name,url,path}, ...].
    """
    if not existing:
        return []
    if isinstance(existing, list):
        # já é lista (possivelmente list[dict])
        return [x for x in existing if isinstance(x, dict)]
    if isinstance(existing, str):
        try:
            data = json.loads(existing)
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict)]
        except Exception:
            return []
    # qualquer outro tipo, ignora
    return []


def _dedup_by_path(items: list[dict]) -> list[dict]:
    """
    Remove duplicatas pelo campo 'path'.
    """
    seen = set()
    out = []
    for it in items:
        p = it.get("path")
        if not p or p in seen:
            continue
        seen.add(p)
        out.append(it)
    return out


# --- Webhook ------------------------------------------------------------------
@router.post("/hook/{token}")
async def hook_receiver(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
    secret: str | None = Query(default=None),
):
    """
    Webhook por-advogado: /assinaturas/hook/{webhook_path_token}?secret=...
    Espera payload ZapSign. Quando status = 'signed', baixa PDFs e atualiza extrato.
    """
    # 1) Identifica advogado e valida secret (se houver)
    adv = None
    if secret:
        adv = _resolve_adv_by_token(db, token, secret=secret)
        if not adv:
            raise HTTPException(status_code=401, detail="Secret inválido.")
    if not adv:
        adv = _resolve_adv_by_token(db, token)
        if not adv:
            raise HTTPException(status_code=404, detail="Advogado não encontrado para este webhook.")

    if adv.webhook_secret:
        if not secret:
            raise HTTPException(status_code=401, detail="Secret obrigatório.")
        if secret != adv.webhook_secret:
            raise HTTPException(status_code=401, detail="Secret inválido.")

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido (não-JSON).")

    event_type = str(body.get("event_type") or "").strip().lower()
    doc_token = str(body.get("token") or body.get("document_token") or "").strip()

    # 2) Responde pings rapidamente
    if event_type in {"ping", "test"}:
        return {
            "ok": True,
            "event_type": event_type,
            "token": doc_token,
            "status": "",
            "extrato_id": None,
            "advogado_id": adv.id,
            "matched_by": "token",
        }

    if not doc_token:
        raise HTTPException(status_code=400, detail="Webhook sem token de documento.")

    api_key = _resolve_api_key(adv)

    # 3) Busca detalhes no ZapSign para confirmar status e pegar URLs
    try:
        detail = _get_doc_detail(doc_token, api_key)
    except requests.HTTPError as e:
        raise HTTPException(
            status_code=400,
            detail=f"ZapSign detail erro: {e.response.status_code} - {e.response.text}",
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"ZapSign detail erro de rede: {e}")

    status_doc = (detail.get("status") or "").lower()
    signed_url = _first_nonempty(detail, ["signed_file", "signed_file_url", "signed_pdf", "signed_file_multi"])
    signer_email = _extract_signer_email(detail)

    # 4) Resolve extrato:
    #    - primeiro pelo zapsign_contrato_id
    #    - depois pelo metadata.extrato_id
    #    - por fim tenta pelo zapsign_procuracao_id (failsafe)
    extrato = (
        db.query(Extrato)
        .filter(Extrato.zapsign_contrato_id == doc_token, Extrato.deleted_at.is_(None))
        .first()
    )
    matched_by = "zapsign_contrato_id"
    if not extrato:
        extrato_id_meta = _extract_extrato_id_from_metadata(detail)
        if extrato_id_meta:
            _ext = db.get(Extrato, extrato_id_meta)
            extrato = _ext if (_ext and getattr(_ext, "deleted_at", None) is None) else None
            matched_by = "metadata.extrato_id"

    if not extrato:
        extrato = (
            db.query(Extrato)
            .filter(Extrato.zapsign_procuracao_id == doc_token, Extrato.deleted_at.is_(None))
            .first()
        )
        if extrato:
            matched_by = "zapsign_procuracao_id"

    if not extrato:
        # Não achou; apenas ecoa o evento
        return {
            "ok": True,
            "event_type": event_type,
            "token": doc_token,
            "status": status_doc,
            "extrato_id": None,
            "advogado_id": adv.id,
            "matched_by": "none",
        }

    if extrato.advogado_id and extrato.advogado_id != adv.id:
        adv_extrato = db.get(Advogado, extrato.advogado_id)
        if adv_extrato:
            adv = adv_extrato
            api_key = _resolve_api_key(adv)

    # 5) Se assinou, baixa e marca
    signed_event = status_doc in {"signed", "signed_and_finished", "finished"} or event_type in {"document.signed", "document.finished", "doc_signed"}
    if not signed_event:
        # Outros eventos: apenas ecoa
        return {
            "ok": True,
            "event_type": event_type,
            "token": doc_token,
            "status": status_doc,
            "extrato_id": extrato.id,
            "matched_by": matched_by,
        }

    _purge_assinaturas_dir(extrato.id)
    # pasta do documento principal: /storage/assinaturas/<extrato_id>/<doc_token>/
    base_folder = Path(STORAGE_ROOT) / "assinaturas" / str(extrato.id)
    contract_folder = base_folder / doc_token
    _mkdir(contract_folder)

    saved_public: list[dict] = []
    contract_public_url: str | None = None

    # 5.1 Baixa o principal (contrato), se a ZapSign já disponibilizou
    if signed_url:
        main_pdf = contract_folder / "documento_assinado.pdf"
        try:
            _download(signed_url, main_pdf)
            contract_public_url = _public_url_from_abs(main_pdf)
            saved_public.append({
                "name": "documento_assinado.pdf",
                "url": contract_public_url,
                "path": contract_public_url.replace(_base_url().rstrip("/"), ""),  # começa com /files/...
            })
        except Exception:
            # não quebra se a URL ainda não estiver pronta
            pass

    # 5.2 Baixa anexos (ex.: Procuração vem em extra_docs[*].signed_file)
    extra_docs = detail.get("extra_docs") or []
    for ed in extra_docs:
        try:
            ed_token = str(ed.get("token") or "").strip()
            ed_signed = str(ed.get("signed_file") or "").strip()
            if not (ed_token and ed_signed):
                continue

            anex_folder = base_folder / ed_token
            _mkdir(anex_folder)
            anex_pdf = anex_folder / "documento_assinado.pdf"

            try:
                _download(ed_signed, anex_pdf)
                public_url = _public_url_from_abs(anex_pdf)
                saved_public.append({
                    "name": "documento_assinado.pdf",
                    "url": public_url,
                    "path": public_url.replace(_base_url().rstrip("/"), ""),
                })

                # Se este anexo é a PROCURAÇÃO do extrato, grava atalho específico
                if getattr(extrato, "zapsign_procuracao_id", None) == ed_token:
                    extrato.procuracao_assinada_url = public_url
            except Exception as e:
                # log leve; não derruba o webhook
                print(f"[webhook] Falhou salvar extra_doc token={ed_token}: {e}")
        except Exception:
            continue

    # 6) Atualiza Extrato
    extrato.zapsign_status = "assinado"
    extrato.status_documento = "assinado"
    extrato.zapsign_signed_at = now_sp()  # fuso America/Sao_Paulo
    
    # Atualiza timers com nova lógica correta
    update_extrato_timers(extrato, db)

    # por compatibilidade, preenche contrato_assinado_url com o principal (quando baixou)
    if contract_public_url:
        extrato.contrato_assinado_url = contract_public_url

    # acumula lista de arquivos assinados (dedup por path)
    prev_files = _load_signed_files(extrato.zapsign_signed_files)
    all_files = _dedup_by_path(prev_files + saved_public)
    # persistimos como JSON (TEXT) para evitar tipos diferentes entre envs
    extrato.zapsign_signed_files = json.dumps(all_files, ensure_ascii=False)

    if signer_email:
        current_email = (extrato.email_cliente or "").strip().lower()
        if signer_email != current_email:
            extrato.email_cliente = signer_email

    # mantém/atualiza links
    links = {}
    try:
        links = dict(extrato.zapsign_links or {})
    except Exception:
        links = {}
    if detail.get("sign_url"):
        links.setdefault("principal", detail["sign_url"])
    extrato.zapsign_links = links or None

    db.add(extrato)
    db.commit()
    db.refresh(extrato)

    # --- AVISO AO GERENTE (UM ÚNICO E-MAIL — Opção B) -------------------------
    try:
        # 1) checar anexos mínimos (mesma regra do /uploads/status)
        # NOTA: Simplificado - não verifica anexos mínimos por enquanto (funções desabilitadas)
        fs = _anx_fs(extrato.id) or {}
        dbinfo = _anx_db(extrato.id) or {}
        
        # Verificação segura de anexos
        endereco_ok = bool((dbinfo and dbinfo.get("comprovante_endereco_url")) or fs.get("comprovante_endereco"))
        docid = fs.get("documento_identidade") or []
        identidade_ok = False
        if isinstance(docid, dict):
            tem_frente = bool(docid.get("frente"))
            tem_verso = bool(docid.get("verso"))
            tem_completo = bool(docid.get("completo"))
            identidade_ok = bool(tem_completo or (tem_frente and tem_verso))
        elif isinstance(docid, list):
            identidade_ok = bool(docid)
        minimos_ok = bool(endereco_ok and identidade_ok)

        # 2) gerente = dono do extrato
        print(f"[webhook_zapsign] Buscando gerente do extrato {extrato.id} (usuario_id={extrato.usuario_id})")
        gerente = db.query(Usuario).filter(Usuario.id == extrato.usuario_id).first()
        gerente_email = getattr(gerente, "email", None)
        
        print(f"[webhook_zapsign] Gerente encontrado: {gerente.nome if gerente else 'NENHUM'}")
        print(f"[webhook_zapsign] Email do gerente: {gerente_email or 'NÃO CADASTRADO'}")

        if gerente_email:
            # Assunto padronizado e link real
            cliente_nome = (extrato.nome_cliente or "").strip()
            assunto = f"Ação Necessária: {cliente_nome or 'Cliente'}"
            link_extrato = f"{FRONTEND_PUBLIC_URL}/anexos/{extrato.id}"

            pendencias_html = ""
            if not minimos_ok:
                faltas = []
                if not endereco_ok:
                    faltas.append("Comprovante de Endereço")
                if not identidade_ok:
                    faltas.append("Documento de Identidade (frente+verso ou completo)")
                faltas_txt = ", ".join(faltas) if faltas else "—"
                pendencias_html = f"<p><strong>Pendências:</strong> {faltas_txt}</p>"

            html = f"""
            <h3>Cliente assinou no ZapSign</h3>
            <p><strong>Cliente:</strong> {extrato.nome_cliente}</p>
            <p><strong>Grupo/Cota:</strong> {extrato.grupo} / {extrato.cota}</p>
            {pendencias_html}
            <p><a href="{link_extrato}" target="_blank" rel="noopener">Abrir o extrato no sistema</a> (login necessário)</p>
            """

            print(f"[webhook_zapsign] Enviando email ao gerente {gerente_email}...")
            try:
                resultado = send_email(recipients=gerente_email, subject=assunto, body_html=html)
                if resultado:
                    print(f"[webhook_zapsign] ✅ Email enviado com sucesso ao gerente")
                else:
                    print(f"[webhook_zapsign] ❌ send_email retornou False")
            except Exception as e:
                print(f"[webhook_zapsign] ❌ Exceção ao enviar email: {e}")
        else:
            print(f"[webhook_zapsign] ⚠️  Gerente não tem email cadastrado - pulando envio")

    except Exception as e:
        # não quebrar o webhook por e-mail
        print(f"[webhook_zapsign] ❌ Erro geral no bloco de email ao gerente: {e}")
    # --- FIM AVISO AO GERENTE -------------------------------------------------

    return {
        "ok": True,
        "event_type": event_type or "doc_signed",
        "token": doc_token,
        "status": "assinado",
        "extrato_id": extrato.id,
        "files": all_files,  # retorna a lista completa que ficou no banco
        "matched_by": f"{matched_by}",
    }
