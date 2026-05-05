from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Header, Depends, Request, Body
from typing import Optional, List, Dict, Any
import os
import time
import re
import json

# ===== Token/link do advogado =====
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo  # ✅ padroniza datas para America/Sao_Paulo
SAO_TZ = ZoneInfo("America/Sao_Paulo")

# ===== Settings =====
from app.utils.paths import get_storage_dir
STORAGE_ROOT = os.environ.get("STORAGE_ROOT") or get_storage_dir()
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
FRONTEND_PUBLIC_URL = os.environ.get("FRONTEND_PUBLIC_URL", "https://www.pjmol.com.br").rstrip("/")

# ===== Database & Tools =====
from sqlalchemy.orm import Session
import fitz  # PyMuPDF

router = APIRouter(prefix="/uploads", tags=["uploads"])

from jose import jwt
try:
    from app.auth_utils import SECRET_KEY, ALGORITHM
except Exception:
    SECRET_KEY = "dev-secret-change-me"  # não usar em produção
    ALGORITHM = "HS256"

# ===== Imports opcionais (db, modelos, mailer) =====
try:
    from database import get_db  # generator que retorna Session
except Exception:
    get_db = None

try:
    from app.models.extrato import Extrato
except Exception:
    Extrato = None

try:
    from app.models.advogado import Advogado
except Exception:
    Advogado = None

try:
    from app.auth_dependency import require_user_id
except Exception:
    # Fallback simples para require_user_id se não estiver disponível
    def require_user_id(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> int:
        if x_usuario_id is None or x_usuario_id == "":
            raise HTTPException(status_code=401, detail="Cabeçalho X-Usuario-Id é obrigatório.")
        try:
            return int(x_usuario_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Cabeçalho X-Usuario-Id inválido (deve ser inteiro).")

@router.get("/remove_file/{extrato_id}")
async def remove_file(
    extrato_id: int,
    key: str = Query(..., description="Chave do tipo de arquivo (documento_identidade, comprovante_endereco, outros)"),
    url: str = Query(..., description="URL do arquivo a ser removido"),
    db: Session = Depends(get_db),
):
    # Obter o extrato
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")

    # Os parâmetros key e url já são validados pelo FastAPI através do Query(...)

    # Carregar os extras atuais
    try:
        extras = json.loads(extrato.extras) if extrato.extras else {}
    except:
        extras = {}

    # Remover a URL específica da lista de arquivos
    if key == "documento_identidade":
        if isinstance(extras.get("documento_identidade"), list):
            extras["documento_identidade"] = [u for u in extras["documento_identidade"] if u != url]
        else:
            extras["documento_identidade"] = []
    elif key == "comprovante_endereco":
        if "comprovante_endereco_url" in extras:
            if isinstance(extras["comprovante_endereco_url"], list):
                extras["comprovante_endereco_url"] = [u for u in extras["comprovante_endereco_url"] if u != url]
            else:
                extras["comprovante_endereco_url"] = []
    elif key == "outros":
        if isinstance(extras.get("outros"), list):
            extras["outros"] = [u for u in extras["outros"] if u != url]
        else:
            extras["outros"] = []

    # Atualizar o status dos documentos mínimos
    minimos = extras.get("minimos", {})
    if isinstance(minimos, dict):
        if key == "documento_identidade":
            minimos["identidade_ok"] = bool(extras.get("documento_identidade"))
        elif key == "comprovante_endereco":
            minimos["endereco_ok"] = bool(extras.get("comprovante_endereco_url"))
        minimos["ok"] = minimos.get("identidade_ok", False) and minimos.get("endereco_ok", False)
        extras["minimos"] = minimos

    # Salvar as alterações
    extrato.extras = json.dumps(extras)
    db.commit()

    # Tentar remover o arquivo físico
    try:
        # Usa helper para converter URL pública em caminho absoluto seguro
        abs_path = _abs_from_public_url(url)
        if abs_path and os.path.exists(abs_path):
            os.remove(abs_path)
    except Exception:
        pass  # Ignorar erros ao remover arquivo físico

    return {"message": "Arquivo removido com sucesso"}

try:
    from app.utils.mailer import send_email
except Exception:
    def send_email(*args, **kwargs):
        pass

# SQL helper p/ audit (sem depender de ORM de AuditLog)
try:
    from sqlalchemy import text
except Exception:
    text = None  # se não houver SQLAlchemy text(), faremos opções seguras

# ===== Settings =====
MAX_PDF_BYTES = 5 * 1024 * 1024  # 5 MB
HUMAN_MAX = f"{MAX_PDF_BYTES // (1024*1024)}MB"


# --------------- auth/header helper -----------------
def require_user_id(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> int:
    if x_usuario_id is None or x_usuario_id == "":
        raise HTTPException(status_code=401, detail="Cabeçalho X-Usuario-Id é obrigatório.")
    try:
        return int(x_usuario_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Cabeçalho X-Usuario-Id inválido (deve ser inteiro).")


# --------------- helpers -----------------
def _slugify_name(s: str) -> str:
    s = (s or "arquivo").replace(" ", "_")
    keep = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."
    return "".join(ch if ch in keep else "_" for ch in s)

def _public_url(rel_path: str) -> str:
    rel = rel_path if rel_path.startswith("/") else f"/{rel_path}"
    return f"{PUBLIC_BASE_URL}{rel}"

def _save_bytes(dst_path: str, data: bytes):
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    with open(dst_path, "wb") as f:
        f.write(data)

def _abs_from_public_url(public_url: str) -> Optional[str]:
    """
    Aceita:
      - http(s)://qualquer-host[:porta]/files/...
      - /files/...
      - files/...
    """
    if not public_url:
        return None
    try:
        u = public_url.strip()
        path = u
        if "://" in u:
            from urllib.parse import urlparse, unquote
            parsed = urlparse(u)
            path = unquote(parsed.path or "")
        else:
            from urllib.parse import unquote
            path = unquote(path)
            if not path.startswith("/"):
                path = "/" + path

        idx = path.find("/files/")
        if idx == -1:
            return None
        rel_from_files = path[idx + len("/files/") :]
        if not rel_from_files:
            return None

        storage_root_abs = os.path.abspath(STORAGE_ROOT)
        abs_path = os.path.abspath(os.path.join(storage_root_abs, rel_from_files))
        if not (abs_path == storage_root_abs or abs_path.startswith(storage_root_abs + os.sep)):
            return None
        return abs_path
    except Exception:
        return None

def _image_to_pdf_a4(image_bytes: bytes, image_ext: str) -> bytes:
    A4_W, A4_H = 595, 842
    max_w, max_h = 560, 800
    doc = fitz.open()
    page = doc.new_page(width=A4_W, height=A4_H)
    rect = fitz.Rect((A4_W - max_w)/2, (A4_H - max_h)/2, (A4_W + max_w)/2, (A4_H + max_h)/2)
    try:
        page.insert_image(rect, stream=image_bytes, keep_proportion=True)
    except Exception:
        page.insert_image(rect, stream=image_bytes)
    out = doc.tobytes()
    doc.close()
    return out

def _to_pdf_bytes(upload: UploadFile) -> bytes:
    content = upload.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    filename = (upload.filename or "").lower()
    mime = (upload.content_type or "").lower()
    if filename.endswith(".pdf") or mime == "application/pdf":
        return content
    if mime.startswith("image/") or any(filename.endswith(ext) for ext in (".jpg",".jpeg",".png",".webp",".bmp",".tif",".tiff")):
        ext = (mime.split("/")[-1] if "/" in mime else None) or (filename.split(".")[-1] if "." in filename else "png")
        try:
            return _image_to_pdf_a4(content, ext)
        except Exception:
            raise HTTPException(status_code=400, detail="Falha ao converter imagem para PDF.")
    raise HTTPException(status_code=415, detail="Tipo de arquivo não suportado. Envie PDF ou imagem.")

def _pdf_page_count(pdf_bytes: bytes) -> int:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        n = doc.page_count
        doc.close()
        return n
    except Exception:
        return 1


def _coerce_extras(v) -> dict:
    """Garante dict para o campo extras (aceita TEXT JSON ou dict)."""
    if isinstance(v, dict):
        return v
    if isinstance(v, str):
        try:
            data = json.loads(v)
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}

# ---- Datas / timezone ----
def _parse_any_dt_to_sp_iso(dt_or_str: Any) -> Optional[str]:
    """Converte qualquer datetime/str para ISO em America/Sao_Paulo."""
    if isinstance(dt_or_str, datetime):
        d = dt_or_str
        if d.tzinfo is None:
            # assumimos UTC se vier sem tz do sqlite
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(SAO_TZ).isoformat()
    if isinstance(dt_or_str, (int, float)):
        try:
            # epoch segundos
            return datetime.fromtimestamp(float(dt_or_str), tz=timezone.utc).astimezone(SAO_TZ).isoformat()
        except Exception:
            return None
    if isinstance(dt_or_str, str):
        s = dt_or_str.strip()
        # tenta vários formatos comuns
        candidates = [
            s,
            s.replace("Z", "+00:00"),
            s.replace(" ", "T"),
        ]
        for c in candidates:
            try:
                d = datetime.fromisoformat(c)
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                return d.astimezone(SAO_TZ).isoformat()
            except Exception:
                continue
        # último recurso: tratar como 'YYYY-MM-DD HH:MM:SS'
        try:
            d = datetime.strptime(s, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            return d.astimezone(SAO_TZ).isoformat()
        except Exception:
            return None
    return None

# ---- Audit helpers ----
def _audit_write(db, *, action: str, message: str, extrato_id: int, actor_id: int, payload: Dict[str, Any]):
    """Escreve em audit_logs usando a coluna 'payload' (JSON no seu schema)."""
    if db is None or text is None:
        return
    try:
        q = text("""
            INSERT INTO audit_logs (action, message, extrato_id, actor_id, payload)
            VALUES (:action, :message, :extrato_id, :actor_id, :payload)
        """)
        db.execute(q, {
            "action": action,
            "message": message,
            "extrato_id": extrato_id,
            "actor_id": actor_id,
            "payload": json.dumps(payload)
        })
    except Exception:
        pass  # silently fail audit writes


@router.post("/unmark_signed_external/{extrato_id}")
async def unmark_signed_external(
    extrato_id: int,
    usuario_id: int = Depends(require_user_id),
):
    """
    Reverte os efeitos de mark_signed_external: remove marca de assinatura externa
    e reabilita o timer de anexos. Usado para comportamento toggle no frontend.
    """
    if get_db is None or Extrato is None:
        raise HTTPException(status_code=500, detail="Dependências de DB não disponíveis")

    _db = next(get_db())
    try:
        ex = _db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not ex:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")

        extras_cur = _coerce_extras(ex.extras)
        # remover campos de assinatura
        extras_cur.pop("zapsign_signed_at", None)
        extras_cur.pop("zapsign_status", None)
        # desbloquear timer
        extras_cur["anexos_timer_frozen"] = False
        extras_cur.pop("anexos_timer_frozen_at", None)

        # Marcadores de estado principais
        ex.extras = extras_cur
        ex.zapsign_signed_at = None  # atualiza coluna SQL
        ex.zapsign_status = None  # atualiza coluna SQL
        ex.status_documento = "Enviado"  # reflete que não está assinado

        # Gravar e atualizar estado
        _db.add(ex)
        _db.commit()
        _db.refresh(ex)

        # Auditar a ação
        _audit_write(
            _db,
            action="uploads.unmarked.external",
            message="Remoção de marca de assinado fora da plataforma",
            extrato_id=extrato_id,
            actor_id=usuario_id,
            payload={
                "at": datetime.now(SAO_TZ).isoformat(),
                "by_user_id": usuario_id,
                "type": "unmark_signed_external"
            }
        )
        _db.commit()  # Segunda commit para ter certeza que pegou o audit

        return {"ok": True, "extrato_id": extrato_id, "unmarked": True}
    except Exception as e:
        _db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        try:
            _db.close()
        except Exception:
            pass


def _audit_list(db, *, extrato_id: int, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Lê os 'limit' mais recentes de envio ao advogado a partir do audit,
    usando as colunas reais: created_at, payload (JSON).
    """
    out: List[Dict[str, Any]] = []
    if db is None or text is None:
        return out
    try:
        q = text("""
            SELECT created_at, payload
            FROM audit_logs
            WHERE extrato_id = :eid
              AND action IN ('uploads.notify.sent','uploads.notify.resend','uploads.notify')
            ORDER BY created_at DESC, id DESC
            LIMIT :lim
        """)
        rows = list(db.execute(q, {"eid": extrato_id, "lim": limit}))
        for r in rows:
            created = None
            payload_s = None
            try:
                created = r["created_at"]
            except Exception:
                created = r[0]
            try:
                payload_s = r["payload"]
            except Exception:
                payload_s = r[1]

            payload = {}
            if isinstance(payload_s, str):
                try:
                    payload = json.loads(payload_s) or {}
                except Exception:
                    payload = {}
            # normaliza para zona São Paulo
            at_sp = payload.get("at")
            if not at_sp:
                at_sp = _parse_any_dt_to_sp_iso(created)
            else:
                at_sp = _parse_any_dt_to_sp_iso(at_sp)

            out.append({
                "to": payload.get("to"),
                "name": payload.get("name"),
                "at": at_sp,
                "by_user_id": payload.get("by_user_id"),
                "type": payload.get("type") or "uploads.notify",
            })
        return out
    except Exception:
        return out


def _update_extrato_urls(extrato_id: int, tipo: str, public_url: str):
    """Atualiza URLs no Extrato + extras.documento_identidade (lista)."""
    if get_db is None or Extrato is None:
        return
    db = None
    try:
        db = next(get_db())
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            return

        extras = _coerce_extras(extrato.extras)

        if tipo == "extrato_original":
            extrato.extrato_pdf_url = public_url
        elif tipo == "comprovante_endereco":
            extrato.comprovante_endereco_url = public_url
        elif tipo == "comprovante_renda":
            extrato.comprovante_renda_url = public_url
        elif tipo == "documento_identidade":
            doc_raw = extras.get("documento_identidade")
            lista: List[str] = []
            if isinstance(doc_raw, list):
                lista = [str(x).strip() for x in doc_raw if str(x).strip()]
            elif isinstance(doc_raw, dict):
                for key in ("completo", "frente", "verso"):
                    val = doc_raw.get(key)
                    if isinstance(val, list):
                        lista.extend(str(x).strip() for x in val if str(x).strip())
                    elif isinstance(val, str) and val.strip():
                        lista.append(val.strip())
            elif isinstance(doc_raw, str) and doc_raw.strip():
                lista = [doc_raw.strip()]
            if public_url and public_url not in lista:
                lista.append(public_url)
            extras["documento_identidade"] = lista
            extrato.extras = extras
        else:
            extras = _coerce_extras(extrato.extras)
            anexos = extras.get("anexos", {})
            lista = list(anexos.get(tipo, []))
            if public_url not in lista:
                lista.append(public_url)
            anexos[tipo] = lista
            extras["anexos"] = anexos
            extrato.extras = extras

        # Recalcula estado dos mínimos (endereço + documento identidade)
        extras = _coerce_extras(extrato.extras)
        doc_entry = extras.get("documento_identidade")
        doc_list: List[str] = []
        if isinstance(doc_entry, list):
            doc_list = [str(x).strip() for x in doc_entry if str(x).strip()]
        elif isinstance(doc_entry, dict):
            for key in ("completo", "frente", "verso"):
                val = doc_entry.get(key)
                if isinstance(val, list):
                    doc_list.extend(str(x).strip() for x in val if str(x).strip())
                elif isinstance(val, str) and val.strip():
                    doc_list.append(val.strip())
        elif isinstance(doc_entry, str) and doc_entry.strip():
            doc_list = [doc_entry.strip()]
        extras["documento_identidade"] = doc_list
        identidade_ok = len(doc_list) > 0

        endereco_ok = bool(extrato.comprovante_endereco_url)
        extras["minimos"] = {
            "endereco_ok": endereco_ok,
            "identidade_ok": identidade_ok,
            "ok": bool(endereco_ok and identidade_ok),
        }
        extrato.extras = extras

        db.add(extrato)
        db.commit()
    except Exception:
        if db is not None:
            db.rollback()
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass


def _make_client_alias(extrato_id: int, filename: str, abs_saved_path: str) -> Optional[str]:
    if get_db is None or Extrato is None:
        return None
    db = None
    try:
        db = next(get_db())
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            return None

        nome = (getattr(extrato, "nome_cliente", None) or "").strip()
        cpf = (getattr(extrato, "cpf_cnpj", None) or "").strip()
        if not nome or not cpf:
            return None
        cpf_digits = "".join(ch for ch in cpf if ch.isdigit()) or cpf

        client_folder = f"{_slugify_name(nome)}_{cpf_digits}"
        dest_dir = os.path.join(STORAGE_ROOT, "clientes", client_folder, "documentos")
        os.makedirs(dest_dir, exist_ok=True)

        dest_path = os.path.join(dest_dir, filename)
        if os.path.lexists(dest_path):
            try: os.remove(dest_path)
            except Exception: pass

        try:
            os.symlink(os.path.abspath(abs_saved_path), dest_path)
        except Exception:
            try:
                os.link(os.path.abspath(abs_saved_path), dest_path)
            except Exception:
                return None

        rel_alias = os.path.join("/files", "clientes", client_folder, "documentos", filename)
        return _public_url(rel_alias)
    except Exception:
        return None
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass


def _fs_public_urls(extrato_id: int) -> dict:
    """Escaneia storage/anexos/{id} e retorna URLs públicas por categoria."""
    base_dir = os.path.join(STORAGE_ROOT, "anexos", str(extrato_id))
    result = {
        "extrato_original": [],
        "comprovante_endereco": [],
        "comprovante_renda": [],
        "documento_identidade": [],
        "outros": [],
    }
    if not os.path.isdir(base_dir):
        return result

    for root, _dirs, files in os.walk(base_dir):
        for fname in files:
            if not fname.lower().endswith(".pdf"):
                continue
            abs_path = os.path.join(root, fname)
            rel_from_storage = os.path.relpath(abs_path, STORAGE_ROOT)
            rel_url = os.path.join("/files", rel_from_storage)
            pub = _public_url(rel_url)

            rel_parts = os.path.relpath(abs_path, base_dir).split(os.sep)
            top = rel_parts[0] if rel_parts else "outros"
            if top == "documento_identidade":
                result["documento_identidade"].append(pub)
            elif top in ("extrato_original", "comprovante_endereco", "comprovante_renda"):
                result[top].append(pub)
            else:
                result["outros"].append(pub)

    return result


def _db_status(extrato_id: int) -> Optional[dict]:
    """
    Lê o extrato e SEMPRE mescla o histórico:
    - extras.adv_email_history (N itens)
    - audit_logs (últimos 10 eventos)
    -> retorna extras.adv_email_history (top-5 mesclado) + adv_email_history_top5 + adv_email_history_raw
    Datas normalizadas p/ America/Sao_Paulo.
    """
    if get_db is None or Extrato is None:
        return None
    db = None
    try:
        db = next(get_db())
        ex = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not ex:
            return None

        extras = _coerce_extras(ex.extras) or {}

        doc_raw = extras.get("documento_identidade")
        doc_list: list = []
        if isinstance(doc_raw, list):
            doc_list = [str(x).strip() for x in doc_raw if str(x).strip()]
        elif isinstance(doc_raw, dict):
            for key in ("completo", "frente", "verso"):
                val = doc_raw.get(key)
                if isinstance(val, list):
                    doc_list.extend(str(x).strip() for x in val if str(x).strip())
                elif isinstance(val, str) and val.strip():
                    doc_list.append(val.strip())
        elif isinstance(doc_raw, str) and doc_raw.strip():
            doc_list = [doc_raw.strip()]
        docid = []
        seen_doc = set()
        for url in doc_list:
            if url and url not in seen_doc:
                docid.append(url)
                seen_doc.add(url)
        extras["documento_identidade"] = docid

        # ======= Mescla histórico (extras + audit) =======
        adv_email = (getattr(ex, "advogado_email", None) or "").strip()
        adv_nome  = (getattr(ex, "advogado_nome", None) or "").strip()

        # 1) itens do extras
        hist_extras: List[Dict[str, Any]] = []
        raw_hist = extras.get("adv_email_history") or []
        if isinstance(raw_hist, list):
            for h in raw_hist:
                if not isinstance(h, dict):
                    continue
                to_v = (h.get("to") or adv_email)
                name_v = (h.get("name") or adv_nome)
                at_iso = _parse_any_dt_to_sp_iso(h.get("at"))
                hist_extras.append({
                    "to": (to_v or "").strip(),
                    "name": (name_v or "").strip(),
                    "by_user_id": h.get("by_user_id"),
                    "type": h.get("type") or "uploads.notify",
                    "at": at_iso or datetime.now(SAO_TZ).isoformat(),
                })

        # 2) itens do audit (últimos 10)
        hist_audit = _audit_list(db, extrato_id=extrato_id, limit=10)

        # 3) merge + dedup + sort desc por data + top 5
        def _k(it: Dict[str, Any]) -> str:
            return f"{(it.get('to') or '').lower()}|{(it.get('name') or '').lower()}|{(it.get('at') or '').lower()}"
        merged_map: Dict[str, Dict[str, Any]] = {}
        for it in hist_extras + hist_audit:
            merged_map[_k(it)] = it
        merged_all = list(merged_map.values())
        merged_all.sort(key=lambda x: (_parse_any_dt_to_sp_iso(x.get("at")) or ""), reverse=True)
        top5 = merged_all[:5]

        # 4) Ajusta last_* (derivado do top-1 do merge)
        if top5:
            extras["adv_email_last_sent_to"] = top5[0].get("to") or adv_email or extras.get("adv_email_last_sent_to")
            extras["adv_email_last_sent_name"] = top5[0].get("name") or adv_nome or extras.get("adv_email_last_sent_name")
            extras["adv_email_last_sent_at"] = top5[0].get("at") or extras.get("adv_email_last_sent_at")

        # 5) expõe compat + diagnóstico
        extras_out = dict(extras)
        extras_out["adv_email_history_top5"] = top5
        extras_out["adv_email_history_raw"] = raw_hist if isinstance(raw_hist, list) else []
        # compat com o front (ele lê .adv_email_history)
        extras_out["adv_email_history"] = top5

        return {
            "extrato_pdf_url": getattr(ex, "extrato_pdf_url", None),
            "comprovante_endereco_url": getattr(ex, "comprovante_endereco_url", None),
            "comprovante_renda_url": getattr(ex, "comprovante_renda_url", None),
            "documento_identidade": docid,
            "extras": extras_out,
            "zapsign_status": getattr(ex, "zapsign_status", None),
        }
    except Exception:
        return None
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass


def _clear_extrato_refs(extrato_id: int, tipo: str, public_url: str):
    """Remove referências quebradas ou duplicadas do BD."""
    if get_db is None or Extrato is None:
        return

    def _suffix(u: Optional[str]) -> Optional[str]:
        if not u: return None
        try:
            s = u.strip()
            if "://" in s:
                from urllib.parse import urlparse
                s = urlparse(s).path or ""
            if not s.startswith("/"):
                s = "/" + s
            pos = s.find("/files/")
            return s[pos + len("/files/") :] if pos != -1 else None
        except Exception:
            return None

    def _same(a: Optional[str], b: Optional[str]) -> bool:
        sa, sb = _suffix(a), _suffix(b)
        return bool(sa and sb and sa == sb)

    def _missing(u: Optional[str]) -> bool:
        if not u:
            return False
        try:
            abs_p = _abs_from_public_url(u)
            return (abs_p is not None) and (not os.path.lexists(abs_p))
        except Exception:
            return False

    db = None
    try:
        db = next(get_db())
        ex = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not ex:
            return

        changed = False
        if tipo == "extrato_original":
            cur = getattr(ex, "extrato_pdf_url", None)
            if _same(cur, public_url) or _missing(cur):
                ex.extrato_pdf_url = None; changed = True
        elif tipo == "comprovante_endereco":
            cur = getattr(ex, "comprovante_endereco_url", None)
            if _same(cur, public_url) or _missing(cur):
                ex.comprovante_endereco_url = None; changed = True
        elif tipo == "comprovante_renda":
            cur = getattr(ex, "comprovante_renda_url", None)
            if _same(cur, public_url) or _missing(cur):
                ex.comprovante_renda_url = None; changed = True
        elif tipo == "documento_identidade":
            extras = _coerce_extras(ex.extras)
            lista = list(extras.get("documento_identidade") or [])
            new_list = []
            for item in lista:
                if _same(item, public_url) or _missing(item):
                    changed = True
                    continue
                new_list.append(item)
            extras["documento_identidade"] = new_list
            ex.extras = extras
        else:
            extras = _coerce_extras(ex.extras)
            anexos = extras.get("anexos", {})
            lista = list(anexos.get(tipo, []))
            if lista:
                new_list = []
                for item in lista:
                    if _same(item, public_url) or _missing(item):
                        changed = True
                        continue
                    new_list.append(item)
                anexos[tipo] = new_list
                extras["anexos"] = anexos
                ex.extras = extras

        if changed:
            db.add(ex); db.commit()
    except Exception:
        if db is not None: db.rollback()
    finally:
        try:
            if db is not None:
                db.close()
        except Exception:
            pass


def _guess_real_from_alias(extrato_id: int, alias_abs_path: str) -> Optional[str]:
    try:
        base_dir = os.path.abspath(os.path.join(STORAGE_ROOT, "anexos", str(extrato_id)))
        if not os.path.isdir(base_dir):
            return None
        fname = os.path.basename(alias_abs_path)
        for root, _dirs, files in os.walk(base_dir):
            if fname in files:
                cand = os.path.join(root, fname)
                return os.path.abspath(cand)
        return None
    except Exception:
        return None


# ===== Coalescer extrato_id de query|path|json|form =====
async def _coalesce_extrato_id(request: Request, extrato_id_qs: Optional[int]) -> int:
    if isinstance(extrato_id_qs, int):
        return extrato_id_qs

    # JSON
    try:
        if request.headers.get("content-type","").startswith("application/json"):
            body = await request.json()
            v = body.get("extrato_id")
            if isinstance(v, int):
                return v
            if isinstance(v, str):
                m = re.search(r"\d+", v)
                if m: return int(m.group(0))
    except Exception:
        pass

    # form-data / urlencoded
    try:
        ctype = request.headers.get("content-type","")
        if "multipart/form-data" in ctype or "application/x-www-form-urlencoded" in ctype:
            form = await request.form()
            v = form.get("extrato_id")
            if v is not None:
                m = re.search(r"\d+", str(v))
                if m: return int(m.group(0))
    except Exception:
        pass

    # query
    v = request.query_params.get("extrato_id")
    if v:
        m = re.search(r"\d+", v)
        if m: return int(m.group(0))

    raise HTTPException(status_code=422, detail=[{"loc":["query","extrato_id"],"msg":"extrato_id obrigatório","type":"missing"}])


# --------------- endpoint: status -----------------
@router.get("/status")
async def status_anexos(
    extrato_id: int = Query(..., description="ID do extrato"),
    usuario_id: int = Depends(require_user_id),
):
    fs = _fs_public_urls(extrato_id)
    dbinfo = _db_status(extrato_id)  # agora SEMPRE mescla audit + extras e normaliza horário para SP

    endereco_ok = bool(fs["comprovante_endereco"])
    identidade_ok = bool(fs["documento_identidade"])

    minimos = {
        "endereco_ok": endereco_ok,
        "identidade_ok": identidade_ok,
        "modo_identidade": "arquivo" if identidade_ok else "incompleto",
        "ok": bool(endereco_ok and identidade_ok),
    }

    return {
        "ok": True,
        "extrato_id": extrato_id,
        "usuario_id": usuario_id,
        "from_db": dbinfo,
        "from_filesystem": fs,
        "minimos": minimos,
    }


# --------------- endpoint: FREEZE TIMER (corrige 422) -----------------
@router.get("/freeze_timer")
async def freeze_anexos_timer(
    request: Request,
    extrato_id: Optional[int] = Query(None, description="ID do extrato"),
    freeze: bool = Query(True, description="True=congelar, False=descongelar"),
    usuario_id: int = Depends(require_user_id),
):
    """
    Congela/descongela o 'timer' de anexos do extrato.
    Aceita extrato_id por query, form ou JSON (como em /uploads/notify).
    Não exige body obrigatório -> evita 422 quando o front envia só query.
    """
    eid = await _coalesce_extrato_id(request, extrato_id)

    # Se quiser permitir 'freeze' via JSON opcional:
    try:
        if request.headers.get("content-type","").startswith("application/json"):
            body = await request.json()
            if "freeze" in body:
                freeze = bool(body.get("freeze"))
    except Exception:
        pass

    if get_db is None or Extrato is None:
        raise HTTPException(status_code=500, detail="DB indisponível.")

    db = next(get_db())
    try:
        ex = db.query(Extrato).filter(Extrato.id == eid).first()
        if not ex:
            raise HTTPException(status_code=404, detail="Extrato não encontrado.")

        extras = _coerce_extras(ex.extras)
        extras["anexos_timer_frozen"] = bool(freeze)
        extras["anexos_timer_frozen_at"] = datetime.now(SAO_TZ).isoformat()

        ex.extras = extras
        db.add(ex); db.commit(); db.refresh(ex)

        return {
            "ok": True,
            "extrato_id": eid,
            "frozen": bool(freeze),
            "frozen_at": extras["anexos_timer_frozen_at"],
            "by_user_id": usuario_id,
        }
    finally:
        try:
            db.close()
        except Exception:
            pass


# --------------- endpoint: notificar advogado -----------------
@router.post("/notify")
async def notify_advogado(
    request: Request,
    extrato_id: Optional[int] = Query(None, description="ID do extrato"),
    usuario_id: int = Depends(require_user_id),
):
    """
    Dispara e-mail quando mínimos estiverem OK **e** zapsign_status == 'assinado'.
    Persiste em Extrato.extras:
      - adv_email_last_sent_to, adv_email_last_sent_name, adv_email_last_sent_at (ISO America/Sao_Paulo)
      - adv_email_history: lista de registros {to, name, at, by_user_id} (MAIS NOVO PRIMEIRO)

    E também **audita** em audit_logs (action: 'uploads.notify.sent')
    """
    extrato_id = await _coalesce_extrato_id(request, extrato_id)

    fs = _fs_public_urls(extrato_id)
    endereco_ok = bool(fs["comprovante_endereco"])
    identidade_ok = bool(fs["documento_identidade"])
    minimos_ok = bool(endereco_ok and identidade_ok)

    if not minimos_ok:
        return {"ok": True, "sent": False, "reason": "Mínimos não atendidos", "extrato_id": extrato_id}

    # carrega extrato/advogado
    extrato = None
    adv = None
    db_lookup = None
    if get_db is not None and Extrato is not None:
        db_lookup = next(get_db())
        try:
            extrato = db_lookup.query(Extrato).filter(Extrato.id == extrato_id).first()
            if extrato and getattr(extrato, "advogado_id", None) and Advogado is not None:
                adv = db_lookup.query(Advogado).filter(Advogado.id == extrato.advogado_id).first()
        finally:
            try: db_lookup.close()
            except Exception: pass

    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")

    if (getattr(extrato, "zapsign_status", "") or "").lower() != "assinado":
        return {"ok": True, "sent": False, "reason": "Documento ainda não está 'assinado' no ZapSign.", "extrato_id": extrato_id}

    advogado_email = getattr(adv, "email", None) if adv else None
    advogado_nome = getattr(adv, "nome", None) if adv else None
    if not advogado_email:
        advogado_email = getattr(extrato, "advogado_email", None)
    if not advogado_nome:
        advogado_nome = getattr(extrato, "advogado_nome", None)

    if not advogado_email:
        return {"ok": True, "sent": False, "reason": "Extrato sem e-mail do advogado", "extrato_id": extrato_id}

    # link mágico PERMANENTE (sem expiração)
    try:
        payload = {
            "sub": advogado_email,
            "role": "advogado",
            "adv_id": getattr(adv, "id", None) or getattr(extrato, "advogado_id", None),
            "extrato_id": extrato.id,
            "purpose": "adv_open",
            # Sem campo "exp" = token permanente
        }
        magic_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        magic_link = f"{FRONTEND_PUBLIC_URL}/public/advogado/open/{extrato.id}/{magic_token}"
    except Exception:
        magic_link = None

    # ===== assunto atualizado: "Ação Necessária: {Nome do cliente}" =====
    cliente_nome = (getattr(extrato, "nome_cliente", "") or "").strip()
    assunto = f"Ação Necessária: {cliente_nome or 'Cliente'}"

    link_html = (f'<p><a href="{magic_link}" target="_blank" rel="noopener">Abrir o extrato (acesso direto)</a></p>'
                 f'<p style="font-size:12px;color:#666">Link de acesso permanente.</p>') if magic_link else ""
    html = f"""
    <h3>Documentos prontos</h3>
    <p><strong>Cliente:</strong> {getattr(extrato, "nome_cliente", "")}</p>
    <p><strong>Grupo/Cota:</strong> {getattr(extrato, "grupo", "")} / {getattr(extrato, "cota", "")}</p>
    <p><strong>Mínimos:</strong> Endereço OK: {endereco_ok} — Identidade OK: {identidade_ok}</p>
    {link_html}
    """

    try:
        send_email(recipients=advogado_email, subject=assunto, body_html=html)
    except Exception as e:
        return {"ok": False, "sent": False, "reason": f"Falha ao enviar e-mail: {e}", "extrato_id": extrato_id}

    # persiste info do envio no extras e AUDITA
    updated_extras = {}
    if get_db is not None and Extrato is not None:
        _db_session = next(get_db())
        try:
            ex = _db_session.query(Extrato).filter(Extrato.id == extrato_id).first()
            if ex:
                now_iso_sp = datetime.now(SAO_TZ).isoformat()  # ✅ SP

                # 1) coerção
                extras_cur = _coerce_extras(ex.extras)

                # 2) atualiza campos "last_*"
                extras_cur["adv_email_last_sent_to"] = advogado_email
                extras_cur["adv_email_last_sent_name"] = advogado_nome or None
                extras_cur["adv_email_last_sent_at"] = now_iso_sp  # ✅ SP

                # 3) histórico: MAIS NOVO NO TOPO
                hist = extras_cur.get("adv_email_history")
                if not isinstance(hist, list):
                    hist = []
                hist.insert(0, {
                    "to": advogado_email,
                    "name": advogado_nome or None,
                    "at": now_iso_sp,            # ✅ SP
                    "by_user_id": usuario_id,
                    "type": "uploads.notify",
                })
                # mantém bastante no BD (100). O front mostra só os 5 primeiros.
                hist = hist[:100]
                extras_cur["adv_email_history"] = hist

                # 4) gravar (coluna JSON ou TEXT)
                ex.extras = extras_cur
                _db_session.add(ex)
                _db_session.commit()
                _db_session.refresh(ex)

                saved = _coerce_extras(ex.extras)

                if not saved.get("adv_email_last_sent_at"):
                    ex.extras = json.dumps(extras_cur, ensure_ascii=False)
                    _db_session.add(ex)
                    _db_session.commit()
                    _db_session.refresh(ex)
                    saved = _coerce_extras(ex.extras)

                updated_extras = saved

                # 5) AUDIT (payload com horário SP)
                _audit_write(
                    _db_session,
                    action="uploads.notify.sent",
                    message="E-mail enviado ao advogado",
                    extrato_id=extrato_id,
                    actor_id=usuario_id,
                    payload={"to": advogado_email, "name": advogado_nome, "at": now_iso_sp, "by_user_id": usuario_id, "type":"uploads.notify"}
                )
        except Exception:
            _db_session.rollback()
        finally:
            try: _db_session.close()
            except Exception: pass

    return {
        "ok": True,
        "sent": True,
        "extrato_id": extrato_id,
        "advogado_email": advogado_email,
        "advogado_nome": advogado_nome,
        "sent_at": datetime.now(SAO_TZ).isoformat(),  # ✅ SP
        "extras": updated_extras,  # devolve o que foi gravado (útil p/ UI/depuração)
    }


# Rota alternativa com path param
@router.post("/notify/{extrato_id}")
async def notify_advogado_path(
    request: Request,
    extrato_id: int,
    usuario_id: int = Depends(require_user_id),
):
    return await notify_advogado(request=request, extrato_id=extrato_id, usuario_id=usuario_id)


@router.post("/mark_signed_external/{extrato_id}")
async def mark_signed_external(
    extrato_id: int,
    usuario_id: int = Depends(require_user_id),
):
    """
    Marca um extrato como assinado fora da plataforma. Atualiza o campo extras
    com timestamp e status, mantendo histórico mínimo. Também atualiza colunas
    `zapsign_status`, `zapsign_signed_at`, `status_documento` e congela o timer.
    """
    if get_db is None or Extrato is None:
        raise HTTPException(status_code=500, detail="Dependências de DB não disponíveis")
    _db = next(get_db())
    try:
        ex = _db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not ex:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")

        now_dt = datetime.now(SAO_TZ)
        now_iso_sp = now_dt.isoformat()
        extras_cur = _coerce_extras(ex.extras)
        # setar campos de assinatura no extras
        extras_cur["zapsign_signed_at"] = now_iso_sp
        extras_cur["zapsign_status"] = "Assinado"

        # congela timer de anexos
        extras_cur["anexos_timer_frozen"] = True
        extras_cur["anexos_timer_frozen_at"] = now_iso_sp

        # histórico mínimo
        hist = extras_cur.get("adv_email_history")
        if not isinstance(hist, list): hist = []
        hist.insert(0, {"to": None, "name": None, "at": now_iso_sp, "by_user_id": usuario_id, "type": "mark_signed_external"})
        extras_cur["adv_email_history"] = hist[:100]

        # atualiza colunas da tabela para refletir estado
        ex.extras = extras_cur
        ex.zapsign_status = "assinado"
        try:
            ex.zapsign_signed_at = now_dt
        except Exception:
            # se o dialect não aceita timezone-aware assignment, ignore
            try:
                ex.zapsign_signed_at = now_dt.replace(tzinfo=None)
            except Exception:
                pass
        ex.status_documento = "assinado"

        _db.add(ex)
        _db.commit()
        _db.refresh(ex)

        return {"ok": True, "extrato_id": extrato_id, "signed_at": now_iso_sp}
    finally:
        try: _db.close()
        except Exception: pass


# --------------- endpoint: remove -----------------
@router.post("/remove")
async def remove_anexo(
    request: Request,
    extrato_id: int = Query(..., description="ID do extrato"),
    tipo: str = Query(..., description="comprovante_endereco|documento_identidade|comprovante_renda|extrato_original|outros"),
    usuario_id: int = Depends(require_user_id),
):
    form = await request.form()
    public_url = (form.get("url") or request.query_params.get("url") or "").strip()
    if not public_url:
        raise HTTPException(status_code=400, detail="Campo 'url' é obrigatório.")

    abs_path = _abs_from_public_url(public_url)
    if not abs_path:
        _clear_extrato_refs(extrato_id, tipo, public_url)
        fs = _fs_public_urls(extrato_id)
        minimos = {
            "endereco_ok": bool(fs["comprovante_endereco"]),
            "identidade_ok": bool(fs["documento_identidade"]),
            "modo_identidade": "arquivo" if fs["documento_identidade"] else "incompleto",
            "ok": bool(fs["comprovante_endereco"]) and bool(fs["documento_identidade"]),
        }
        return {
            "ok": True,
            "removed": True,
            "extrato_id": extrato_id,
            "tipo": tipo,
            "public_url": public_url,
            "from_filesystem": fs,
            "minimos": minimos,
        }

    paths_to_remove = set()
    anexos_base = os.path.abspath(os.path.join(STORAGE_ROOT, "anexos", str(extrato_id))) + os.sep
    clientes_base = os.path.abspath(os.path.join(STORAGE_ROOT, "clientes")) + os.sep

    if abs_path.startswith(anexos_base):
        paths_to_remove.add(abs_path)
    elif abs_path.startswith(clientes_base):
        paths_to_remove.add(abs_path)
        real_target = None
        if os.path.islink(abs_path):
            try:
                link_target = os.readlink(abs_path)
                if not os.path.isabs(link_target):
                    link_target = os.path.abspath(os.path.join(os.path.dirname(abs_path), link_target))
                real_target = link_target
            except Exception:
                real_target = None
        if real_target is None:
            real_target = _guess_real_from_alias(extrato_id, abs_path)
        if real_target and real_target.startswith(anexos_base):
            paths_to_remove.add(real_target)
    else:
        raise HTTPException(status_code=400, detail="Arquivo fora do diretório permitido.")

    removed_any = False
    for p in list(paths_to_remove):
        if os.path.lexists(p):
            try:
                os.remove(p); removed_any = True
            except Exception:
                pass

    if not removed_any:
        _clear_extrato_refs(extrato_id, tipo, public_url)
        fs = _fs_public_urls(extrato_id)
        minimos = {
            "endereco_ok": bool(fs["comprovante_endereco"]),
            "identidade_ok": bool(fs["documento_identidade"]),
            "modo_identidade": "arquivo" if fs["documento_identidade"] else "incompleto",
            "ok": bool(fs["comprovante_endereco"]) and bool(fs["documento_identidade"]),
        }
        return {
            "ok": True,
            "removed": True,
            "extrato_id": extrato_id,
            "tipo": tipo,
            "public_url": public_url,
            "from_filesystem": fs,
            "minimos": minimos,
        }

    try:
        fname = os.path.basename(list(paths_to_remove)[0])
        for root, _dirs, files in os.walk(os.path.join(STORAGE_ROOT, "clientes")):
            alias_candidate = os.path.join(root, fname)
            if os.path.lexists(alias_candidate):
                try: os.remove(alias_candidate)
                except Exception: pass
    except Exception:
        pass

    _clear_extrato_refs(extrato_id, tipo, public_url)

    try:
        for p in list(paths_to_remove):
            if p.startswith(anexos_base):
                d = os.path.dirname(p)
                while d.startswith(anexos_base):
                    if os.path.isdir(d) and not os.listdir(d):
                        os.rmdir(d); d = os.path.dirname(d)
                    else:
                        break
    except Exception:
        pass

    fs = _fs_public_urls(extrato_id)
    endereco_ok = bool(fs["comprovante_endereco"])
    identidade_ok = bool(fs["documento_identidade"])

    minimos = {
        "endereco_ok": endereco_ok,
        "identidade_ok": identidade_ok,
        "modo_identidade": "arquivo" if identidade_ok else "incompleto",
        "ok": bool(endereco_ok and identidade_ok),
    }

    return {
        "ok": True,
        "removed": True,
        "extrato_id": extrato_id,
        "tipo": tipo,
        "public_url": public_url,
        "from_filesystem": fs,
        "minimos": minimos,
    }


# --------------- endpoint: upload (dinâmico) -----------------
@router.post("/{tipo}")
async def upload_arquivo(
    tipo: str,
    extrato_id: int = Query(..., description="ID do extrato"),
    file: UploadFile = File(...),
    usuario_id: int = Depends(require_user_id),
):
    pdf_bytes = _to_pdf_bytes(file)

    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo PDF final excede {HUMAN_MAX}. Compressão automática está desativada.")

    safe_name = _slugify_name(file.filename or "documento.pdf")
    if not safe_name.endswith(".pdf"):
        safe_name = f"{os.path.splitext(safe_name)[0]}.pdf"

    ts = int(time.time())
    subdir = "documento_identidade" if tipo == "documento_identidade" else tipo

    abs_dir = os.path.join(STORAGE_ROOT, "anexos", str(extrato_id), subdir)
    os.makedirs(abs_dir, exist_ok=True)

    filename = f"{ts}_{tipo}_{safe_name}"
    abs_path = os.path.join(abs_dir, filename)

    rel_path = os.path.join("/files", "anexos", str(extrato_id), subdir, filename)
    public_url = _public_url(rel_path)

    _save_bytes(abs_path, pdf_bytes)
    _update_extrato_urls(extrato_id=extrato_id, tipo=tipo, public_url=public_url)

    # ❌ DESABILITADO: criação de symlinks desnecessários em storage/clientes
    # alias_public_url = _make_client_alias(extrato_id=extrato_id, filename=filename, abs_saved_path=abs_path)
    alias_public_url = None  # não criar mais aliases

    return {
        "ok": True,
        "extrato_id": extrato_id,
        "usuario_id": usuario_id,
        "tipo": tipo,
        "filename": filename,
        "path": abs_path,
        "url": rel_path,
        "public_url": public_url,
        "alias_public_url": alias_public_url,
        "size_bytes": len(pdf_bytes),
        "max_limit": HUMAN_MAX,
    }

# ========================= FUNÇÕES EXPOSTAS PARA TESTES =========================
def mover_arquivos_temp_para_storage(extrato_id: int, tipo: str = "extrato") -> bool:
    """Função simples para testes que move arquivos de temp para storage"""
    try:
        from app.utils.paths import get_temp_uploads_dir, get_storage_dir
        
        temp_dir = os.path.join(get_temp_uploads_dir(), str(extrato_id))
        storage_dir = os.path.join(get_storage_dir(), "Extrato", str(extrato_id))
        
        if not os.path.exists(temp_dir):
            return False
            
        os.makedirs(storage_dir, exist_ok=True)
        
        # Simula movimentação (copia arquivos)
        import shutil
        for filename in os.listdir(temp_dir):
            if filename.endswith('.pdf'):
                src = os.path.join(temp_dir, filename)
                dst = os.path.join(storage_dir, filename)
                shutil.copy2(src, dst)
        
        return True
    except Exception as e:
        print(f"Erro ao mover arquivos: {e}")
        return False
