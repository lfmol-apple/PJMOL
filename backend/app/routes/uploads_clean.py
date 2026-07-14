"""
Rotas limpas e estáveis para uploads e gestão de anexos.

Objetivo: substituir a implementação corrompida mantendo as rotas principais:
- GET    /uploads/status
- GET    /uploads/freeze_timer  
- GET    /uploads/remove_file/{extrato_id}
- POST   /uploads/{tipo}
- POST   /uploads/mark_signed_external/{extrato_id}
- POST   /uploads/unmark_signed_external/{extrato_id}
- POST   /uploads/notify

Notas:
- Usa STORAGE_ROOT e utilitário para construir URLs públicas.
- Converte imagem → PDF se Pillow estiver instalado; senão, salva como imagem mesmo.
- A persistência usa os campos tradicionais em Extrato: *_url e o dicionário extras.
"""

from __future__ import annotations

import os
import io
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from app.models.extrato import Extrato
from app.utils.storage import STORAGE_ROOT, public_url_from_abspath, ensure_dir, save_bytes_atomically

try:
    from PIL import Image  # type: ignore
except Exception:  # Pillow opcional
    Image = None  # type: ignore


router = APIRouter(prefix="/uploads", tags=["Uploads"])


# ------------------------------
# Helpers
# ------------------------------

TIPO_TO_FIELD: Dict[str, str] = {
    "extrato": "extrato_pdf_url",
    "contrato": "contrato_url",
    "procuracao": "procuracao_url",
    "termo_acordo": "termo_acordo_pdf_url",
    "sentenca": "sentenca_pdf_url",
    "comprovante_renda": "comprovante_renda_url",
    "comprovante_endereco": "comprovante_endereco_url",
    "documento_identidade": "documento_identidade_url",
    "outros": "outros_anexos_url",  # Para anexos diversos
    "comprovante_recebimento_acordo": "comprovante_recebimento_acordo_url",
}


def _now_iso() -> str:
    """Retorna timestamp atual no timezone de São Paulo."""
    import pytz
    SAO_TZ = pytz.timezone("America/Sao_Paulo")
    return datetime.now(SAO_TZ).isoformat()


def _dest_dir(extrato_id: int, tipo: str) -> str:
    return os.path.join(STORAGE_ROOT, "anexos", str(extrato_id), tipo)


def _safe_filename(orig_name: str, content_type: str = "") -> str:
    base, ext = os.path.splitext(orig_name)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    ext = (ext or "").lower()
    if not ext:
        ct = (content_type or "").lower()
        if "pdf" in ct:
            ext = ".pdf"
        elif "jpeg" in ct or "jpg" in ct:
            ext = ".jpg"
        elif "png" in ct:
            ext = ".png"
        elif "gif" in ct:
            ext = ".gif"
        elif "webp" in ct:
            ext = ".webp"
        else:
            ext = ".bin"
    return f"{base}_{ts}{ext}"


def _image_to_pdf_bytes(image_bytes: bytes) -> Optional[bytes]:
    """Converte uma imagem para PDF A4 simples usando Pillow (se disponível)."""
    if Image is None:
        return None
    try:
        with Image.open(io.BytesIO(image_bytes)) as im:
            if im.mode != "RGB":
                im = im.convert("RGB")
            out = io.BytesIO()
            im.save(out, format="PDF")
            return out.getvalue()
    except Exception:
        return None


def _save_file_bytes(extrato_id: int, tipo: str, filename: str, data: bytes) -> str:
    """Salva bytes no STORAGE_ROOT e retorna URL pública /files/..."""
    import logging
    logger = logging.getLogger(__name__)
    
    dest_dir = _dest_dir(extrato_id, tipo)
    logger.info(f"📁 _save_file_bytes: dest_dir={dest_dir}")
    
    ensure_dir(dest_dir)
    logger.info(f"✅ Diretório criado/verificado: {os.path.exists(dest_dir)}")
    
    abs_path = os.path.abspath(os.path.join(dest_dir, filename))
    logger.info(f"💾 Salvando em: {abs_path}")
    
    save_bytes_atomically(data, abs_path)
    logger.info(f"✅ Arquivo salvo? {os.path.exists(abs_path)}, tamanho: {os.path.getsize(abs_path) if os.path.exists(abs_path) else 0}")
    
    url = public_url_from_abspath(abs_path)
    logger.info(f"🌐 URL gerada: {url}")
    
    return url


def _resolve_field_for_tipo(tipo: str) -> Optional[str]:
    return TIPO_TO_FIELD.get(tipo)


def _normalize_timestamp(timestamp) -> str:
    """Normaliza timestamp para formato ISO com timezone consistente."""
    import pytz
    SAO_TZ = pytz.timezone("America/Sao_Paulo")
    
    if hasattr(timestamp, 'isoformat'):
        # É um datetime object
        if timestamp.tzinfo is None:
            # Naive datetime, assume horário de SP
            timestamp = SAO_TZ.localize(timestamp)
        return timestamp.isoformat()
    elif isinstance(timestamp, str):
        # É uma string, verificar se tem timezone
        if '+' not in timestamp and 'Z' not in timestamp and not timestamp.endswith('-03:00'):
            # Sem timezone, adicionar -03:00 (SP)
            from datetime import datetime
            try:
                dt = datetime.fromisoformat(timestamp)
                dt = SAO_TZ.localize(dt)
                return dt.isoformat()
            except:
                return timestamp + '-03:00' if not timestamp.endswith('-03:00') else timestamp
        return timestamp
    else:
        return str(timestamp)

def _create_robust_timestamp() -> str:
    """Cria um timestamp robusto sempre no timezone de São Paulo."""
    import pytz
    SAO_TZ = pytz.timezone("America/Sao_Paulo")
    return datetime.now(SAO_TZ).isoformat()

def _validate_and_normalize_timestamp(timestamp) -> str:
    """
    Valida e normaliza um timestamp garantindo formato consistente.
    Retorna sempre no formato ISO com timezone de São Paulo.
    """
    import pytz
    SAO_TZ = pytz.timezone("America/Sao_Paulo")
    
    if not timestamp:
        return _create_robust_timestamp()
    
    try:
        # Se for um datetime object
        if hasattr(timestamp, 'isoformat'):
            if timestamp.tzinfo is None:
                # Naive datetime, assume SP timezone
                timestamp = SAO_TZ.localize(timestamp)
            else:
                # Converter para SP timezone
                timestamp = timestamp.astimezone(SAO_TZ)
            return timestamp.isoformat()
        
        # Se for string, tentar converter
        if isinstance(timestamp, str):
            # Tentar parsear a string
            try:
                dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                # Se não tem timezone, assumir SP
                if dt.tzinfo is None:
                    dt = SAO_TZ.localize(dt)
                else:
                    # Converter para SP timezone
                    dt = dt.astimezone(SAO_TZ)
                return dt.isoformat()
            except:
                # Se falhar, retornar timestamp atual
                return _create_robust_timestamp()
        
        # Para outros tipos, retornar timestamp atual
        return _create_robust_timestamp()
        
    except Exception:
        return _create_robust_timestamp()

def _normalize_timestamp_for_response(timestamp) -> Optional[str]:
    """
    Normaliza um timestamp para resposta da API, garantindo timezone correto.
    Retorna None se timestamp for None/vazio.
    """
    if not timestamp:
        return None
    
    try:
        return _validate_and_normalize_timestamp(timestamp)
    except:
        return None

def _atualizar_fase(extrato: Extrato, db: Session) -> None:
    """
    🎯 SISTEMA SIMPLIFICADO DE FASES (substitui timers complexos)
    
    Atualiza a fase_atual do extrato baseado no estado dos dados.
    
    LÓGICA SIMPLES:
    1. Se tem número_processo -> "finalizado"
    2. Se foi enviado ao advogado (minimos.ok ou enviado_advogado_em) -> "com_advogado"
    3. Se foi assinado (zapsign_signed_at ou signed_external_at) -> "assinado"
    4. Caso contrário -> "enviado"
    """
    # Parse extras JSON
    extras = extrato.extras or {}
    if isinstance(extras, str):
        try:
            import json
            extras = json.loads(extras)
        except:
            extras = {}
    if not isinstance(extras, dict):
        extras = {}
    
    # 1. FINALIZADO: tem número do processo
    if extrato.numero_processo and extrato.numero_processo.strip() and extrato.numero_processo != "None":
        extrato.fase_atual = "finalizado"
        return
    
    # 2. COM ADVOGADO: foi enviado ao advogado
    enviado_advogado_em = extras.get("enviado_advogado_em")
    minimos_ok = extras.get("minimos", {}).get("ok") if isinstance(extras.get("minimos"), dict) else False
    
    if enviado_advogado_em or minimos_ok:
        extrato.fase_atual = "com_advogado"
        return
    
    # 3. ASSINADO: cliente assinou
    zapsign_signed_at = extras.get("zapsign_signed_at")
    signed_external_at = extras.get("signed_external_at")
    
    if zapsign_signed_at or signed_external_at:
        extrato.fase_atual = "assinado"
        return
    
    # 4. ENVIADO: estado padrão
    extrato.fase_atual = "enviado"

# ============================================================================
# 🎯 SISTEMA SIMPLIFICADO - APENAS FASES (SEM TIMERS)
# ============================================================================

def _update_process_timers(extrato: Extrato, db: Session) -> None:
    """Sistema simplificado - atualiza apenas a fase_atual."""
    _atualizar_fase(extrato, db)

def _update_process_timers_v2(extrato: Extrato, db: Session) -> None:
    """Sistema simplificado - atualiza apenas a fase_atual."""
    _atualizar_fase(extrato, db)

def _set_numero_processo_timestamp(extrato: Extrato, db: Session) -> None:
    """Marca quando número do processo é definido e atualiza fase para 'finalizado'."""
    import pytz
    SAO_TZ = pytz.timezone("America/Sao_Paulo")
    now_iso = datetime.now(SAO_TZ).isoformat()
    
    extras = extrato.extras or {}
    
    # ✅ IMPORTANTE: usar numero_processo_inserted_at (não "set_at")
    # porque _update_process_timers_v2 procura por esse nome!
    if not extras.get("numero_processo_inserted_at"):
        extras["numero_processo_inserted_at"] = now_iso
    
    extrato.extras = extras
    db.add(extrato)
    
    # Atualiza timers (vai parar timer do advogado)
    _update_process_timers(extrato, db)


def _try_unlink_inside_storage(abs_path: str) -> bool:
    try:
        root = os.path.abspath(STORAGE_ROOT)
        ap = os.path.abspath(abs_path)
        if ap.startswith(root) and os.path.isfile(ap):
            os.remove(ap)
            return True
    except Exception:
        pass
    return False


# ------------------------------
# Endpoints
# ------------------------------


@router.get("/status")
def status(extrato_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """Retorna informações sobre anexos. Se extrato_id for fornecido, retorna do registro; caso contrário, vazio."""
    if extrato_id is None:
        return {"ok": True, "itens": []}
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    # Atualiza timers antes de retornar status
    _update_process_timers(extrato, db)
    db.commit()
    
    # Recarrega extrato para pegar extras atualizados
    db.refresh(extrato)
    extras = extrato.extras or {}
    
    itens: List[Dict] = []
    for tipo, field in TIPO_TO_FIELD.items():
        url = getattr(extrato, field, None)
        if url:
            itens.append({"tipo": tipo, "url": url})
    
    # Dados de compatibilidade para frontend antigo
    uploads = extras.get("uploads", {})
    
    # Busca arquivos em uploads/ ou diretamente em extras
    endereco_files = uploads.get("comprovante_endereco", []) if isinstance(uploads.get("comprovante_endereco"), list) else []
    identidade_files = uploads.get("documento_identidade", []) if isinstance(uploads.get("documento_identidade"), list) else []
    outros_files = uploads.get("outros", []) if isinstance(uploads.get("outros"), list) else []
    
    # Fallback: busca diretamente nos extras (formato antigo)
    if not identidade_files:
        direct_identidade = extras.get("documento_identidade", [])
        if isinstance(direct_identidade, list):
            identidade_files.extend(direct_identidade)
        elif isinstance(direct_identidade, str) and direct_identidade.strip():
            identidade_files.append(direct_identidade.strip())
            
    if not endereco_files:
        direct_endereco = extras.get("comprovante_endereco", [])
        if isinstance(direct_endereco, list):
            endereco_files.extend(direct_endereco)
        elif isinstance(direct_endereco, str) and direct_endereco.strip():
            endereco_files.append(direct_endereco.strip())
    
    # Adiciona arquivos dos campos URL diretos
    if extrato.comprovante_endereco_url:
        endereco_files.append(extrato.comprovante_endereco_url)
    if extrato.documento_identidade_url:
        identidade_files.append(extrato.documento_identidade_url)
    if extrato.outros_anexos_url:
        outros_files.append(extrato.outros_anexos_url)
    
    # Remove duplicatas
    endereco_files = list(set(endereco_files))
    identidade_files = list(set(identidade_files))
    outros_files = list(set(outros_files))
    
    minimos_ok = bool(endereco_files and identidade_files)
    
    return {
        "ok": True,
        "extrato_id": extrato_id,
        "nome_cliente": getattr(extrato, "nome_cliente", None),
        "itens": itens,
        # ❌ TIMERS REMOVIDOS - Sistema usa apenas fase_atual
        # Formato antigo para compatibilidade
        "minimos": {
            "endereco_ok": bool(endereco_files),
            "identidade_ok": bool(identidade_files),
            "modo_identidade": "completo" if identidade_files else "incompleto",
            "ok": minimos_ok
        },
        "from_filesystem": {
            "extrato_original": [],
            "comprovante_endereco": endereco_files,
            "comprovante_renda": [],
            "documento_identidade": identidade_files,
            "outros": outros_files
        },
        "from_db": {
            "extras": extras,
            "extrato": {
                "comprovante_endereco_url": extrato.comprovante_endereco_url,
                "documento_identidade_url": extrato.documento_identidade_url,
                "outros_anexos_url": extrato.outros_anexos_url
            }
        },
        "_debug": {
            "endereco_files_count": len(endereco_files),
            "identidade_files_count": len(identidade_files),
            "minimos_calculated": minimos_ok
        }
    }


@router.get("/freeze_timer")
def freeze_timer(
    extrato_id: int = Query(...),
    freeze: bool = Query(True),
    db: Session = Depends(get_db),
):
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    extras = extrato.extras or {}
    extras["anexos_timer_frozen"] = bool(freeze)
    extrato.extras = extras
    db.add(extrato)
    db.commit()
    return {"ok": True, "extrato_id": extrato_id, "timer_frozen": extras["anexos_timer_frozen"]}


@router.get("/clear_problematic_urls/{extrato_id}")
def clear_problematic_urls(
    extrato_id: int,
    db: Session = Depends(get_db),
):
    """Remove URLs problemáticas que não conseguem ser removidas pelo método normal"""
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")

    extras = extrato.extras or {}
    
    # Limpa uploads problemáticos
    if "uploads" in extras:
        uploads = extras["uploads"]
        cleaned_uploads = {}
        for key, value in uploads.items():
            if isinstance(value, list):
                # Remove URLs que contenham ngrok (URLs problemáticas antigas)
                cleaned_list = [url for url in value if not ("ngrok" in str(url) and "files/anexos" in str(url))]
                if cleaned_list != value:
                    cleaned_uploads[key] = cleaned_list
                else:
                    cleaned_uploads[key] = value
            else:
                cleaned_uploads[key] = value
        extras["uploads"] = cleaned_uploads
    
    extrato.extras = extras
    db.add(extrato)
    db.commit()
    
    return {"ok": True, "extrato_id": extrato_id, "message": "URLs problemáticas removidas"}


@router.get("/remove_file/{extrato_id}")
def remove_file(
    extrato_id: int,
    key: str = Query(...),
    url: str = Query(...),
    db: Session = Depends(get_db),
):
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")

    # Remove dos campos *_url
    removed_field: Optional[str] = None
    for tipo, field in TIPO_TO_FIELD.items():
        if getattr(extrato, field, None) == url:
            setattr(extrato, field, None)
            removed_field = field
            break

    # Remove também dos campos JSON extras
    removed_from_extras = False
    extras = extrato.extras or {}
    
    # Normaliza a URL removendo quebras de linha e espaços extras
    url_clean = url.strip().replace('\n', '').replace('\r', '')
    
    # Remove de extras.uploads.{key}
    uploads = extras.get("uploads", {})
    if key in uploads and isinstance(uploads[key], list):
        original_count = len(uploads[key])
        # Remove URLs que sejam similares (ignorando quebras de linha e espaços)
        new_list = []
        for u in uploads[key]:
            u_clean = str(u).strip().replace('\n', '').replace('\r', '') if u else ''
            if u_clean != url_clean and url_clean not in u_clean and u_clean not in url_clean:
                new_list.append(u)
        uploads[key] = new_list
        if len(uploads[key]) < original_count:
            removed_from_extras = True
            extras["uploads"] = uploads
    
    # Remove de extras.{key} se for uma lista  
    if key in extras and isinstance(extras[key], list):
        original_count = len(extras[key])
        new_list = []
        for u in extras[key]:
            u_clean = str(u).strip().replace('\n', '').replace('\r', '') if u else ''
            if u_clean != url_clean and url_clean not in u_clean and u_clean not in url_clean:
                new_list.append(u)
        extras[key] = new_list
        if len(extras[key]) < original_count:
            removed_from_extras = True
    
    # Remove de extras.{key} se for string igual à URL
    if key in extras and isinstance(extras[key], str):
        u_clean = str(extras[key]).strip().replace('\n', '').replace('\r', '') if extras[key] else ''
        if u_clean == url_clean or url_clean in u_clean or u_clean in url_clean:
            extras[key] = None
            removed_from_extras = True
    
    if removed_from_extras:
        extrato.extras = extras

    # Tenta remover o arquivo físico se apontar para /files dentro do STORAGE_ROOT
    abs_removed = None
    try:
        idx = url.find("/files/")
        if idx != -1:
            rel_from_files = url[idx + len("/files/") :].replace("/", os.sep)
            abs_root = os.path.abspath(STORAGE_ROOT)
            abs_path = os.path.abspath(os.path.join(abs_root, rel_from_files))
            if abs_path.startswith(abs_root):
                if _try_unlink_inside_storage(abs_path):
                    abs_removed = abs_path
    except Exception:
        pass

    db.add(extrato)
    db.commit()
    return {
        "ok": True, 
        "extrato_id": extrato_id, 
        "url": url, 
        "removed_field": removed_field, 
        "removed_file": abs_removed,
        "removed_from_extras": removed_from_extras
    }


@router.post("/notify")
def notify_advogado(
    extrato_id: int = Query(..., description="ID do extrato"),
    x_usuario_id: int = Header(..., alias="X-Usuario-Id"),
    db: Session = Depends(get_db)
):
    """
    Notificar advogado por email sobre documentos anexados.
    
    Envia email quando:
    - Documentos mínimos estão OK (comprovante_endereco + documento_identidade)  
    - zapsign_status == 'assinado'
    
    Persiste histórico em extrato.extras e cria audit log.
    """
    try:
        from app.models.advogado import Advogado
        from app.audit import log_event  
        from app.utils.mailer import send_email
        from app.auth_utils import SECRET_KEY, ALGORITHM
        import pytz
        import jwt
        from datetime import datetime, timedelta
        
        SAO_TZ = pytz.timezone("America/Sao_Paulo")
        FRONTEND_PUBLIC_URL = os.environ.get("FRONTEND_PUBLIC_URL", "https://www.pjmol.com.br")  # Fallback for frontend URL
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import error: {e}")
    
    # Busca extrato
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    
    # Verifica documentos mínimos
    extras = extrato.extras or {}
    uploads = extras.get("uploads", {})
    
    endereco_ok = bool(uploads.get("comprovante_endereco")) or bool(extrato.comprovante_endereco_url)
    identidade_ok = bool(uploads.get("documento_identidade")) or bool(extrato.documento_identidade_url)
    minimos_ok = endereco_ok and identidade_ok
    
    if not minimos_ok:
        return {
            "ok": True, 
            "sent": False, 
            "reason": "Documentos mínimos não atendidos", 
            "extrato_id": extrato_id,
            "endereco_ok": endereco_ok,
            "identidade_ok": identidade_ok
        }
    
    # Verifica se está assinado no ZapSign
    if (getattr(extrato, "zapsign_status", "") or "").lower() != "assinado":
        return {
            "ok": True, 
            "sent": False, 
            "reason": "Documento ainda não está 'assinado' no ZapSign", 
            "extrato_id": extrato_id
        }
    
    # Busca dados do advogado
    advogado = None
    if extrato.advogado_id:
        advogado = db.query(Advogado).filter(Advogado.id == extrato.advogado_id).first()
    
    advogado_email = (advogado.email if advogado else None) or getattr(extrato, "advogado_email", None)
    advogado_nome = (advogado.nome if advogado else None) or getattr(extrato, "advogado_nome", None)
    
    if not advogado_email:
        return {
            "ok": True, 
            "sent": False, 
            "reason": "Extrato sem e-mail do advogado", 
            "extrato_id": extrato_id
        }
    
    # Cria link mágico PERMANENTE (sem expiração)
    magic_link = None
    try:
        payload = {
            "sub": advogado_email,
            "role": "advogado",
            "adv_id": (advogado.id if advogado else None) or getattr(extrato, "advogado_id", None),
            "extrato_id": extrato_id,
            "purpose": "adv_open",
            # Sem campo "exp" = token permanente
        }
        magic_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        magic_link = f"{FRONTEND_PUBLIC_URL}/public/advogado/open/{extrato_id}/{magic_token}"
    except Exception:
        pass
    
    # Prepara email
    cliente_nome = (getattr(extrato, "nome_cliente", "") or "").strip()
    assunto = f"Ação Necessária: {cliente_nome or 'Cliente'}"
    
    link_html = ""
    if magic_link:
        link_html = f'''
        <p><a href="{magic_link}" target="_blank" rel="noopener">Abrir o extrato (acesso direto)</a></p>
        <p style="font-size:12px;color:#666">Link de acesso permanente.</p>
        '''
    
    html = f"""
    <h3>Documentos prontos</h3>
    <p><strong>Cliente:</strong> {getattr(extrato, "nome_cliente", "")}</p>
    <p><strong>Grupo/Cota:</strong> {getattr(extrato, "grupo", "")} / {getattr(extrato, "cota", "")}</p>
    <p><strong>Documentos mínimos:</strong> Endereço OK: {endereco_ok} — Identidade OK: {identidade_ok}</p>
    {link_html}
    """
    
    # Envia email
    try:
        send_email(recipients=advogado_email, subject=assunto, body_html=html)
    except Exception as e:
        return {
            "ok": False, 
            "sent": False, 
            "reason": f"Falha ao enviar e-mail: {e}", 
            "extrato_id": extrato_id
        }
    
    # Persiste histórico no extras
    now_iso = datetime.now(SAO_TZ).isoformat()
    
    extras["adv_email_last_sent_to"] = advogado_email
    extras["adv_email_last_sent_name"] = advogado_nome
    extras["adv_email_last_sent_at"] = now_iso
    
    # Histórico (mais novo primeiro)
    hist = extras.get("adv_email_history", [])
    if not isinstance(hist, list):
        hist = []
    
    hist.insert(0, {
        "to": advogado_email,
        "name": advogado_nome,
        "at": now_iso,
        "by_user_id": x_usuario_id,
        "type": "uploads.notify"
    })
    hist = hist[:100]  # Limita histórico
    extras["adv_email_history"] = hist
    
    # CRITICAL: SQLAlchemy não detecta mudanças em JSON automaticamente
    # Precisamos marcar explicitamente como modificado
    from sqlalchemy.orm.attributes import flag_modified
    
    extrato.extras = extras
    flag_modified(extrato, "extras")  # FORÇA SQLAlchemy detectar mudança!
    
    db.add(extrato)
    
    # Audit log
    try:
        log_event(
            db=db,
            action="uploads.notify.sent",
            message="E-mail enviado ao advogado",
            extrato_id=extrato_id,
            actor_id=x_usuario_id,
            payload={
                "to": advogado_email, 
                "name": advogado_nome, 
                "at": now_iso,
                "by_user_id": x_usuario_id,
                "type": "uploads.notify"
            }
        )
    except Exception:
        pass  # Audit é opcional
    
    db.commit()
    
    return {
        "ok": True,
        "sent": True,
        "extrato_id": extrato_id,
        "advogado_email": advogado_email,
        "advogado_nome": advogado_nome,
        "sent_at": now_iso
    }


@router.post("/{tipo}")
async def upload(
    tipo: str,
    extrato_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # Bloquear o uso de 'notify' como tipo de upload (conflita com /notify)
    if tipo == "notify":
        raise HTTPException(status_code=404, detail="Endpoint não encontrado")
    
    if tipo not in TIPO_TO_FIELD:
        raise HTTPException(status_code=400, detail=f"Tipo inválido: {tipo}")

    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")

    raw = await file.read()
    
    # Validar tamanho do arquivo (10MB)
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"Arquivo muito grande. Tamanho máximo permitido: 10MB. Tamanho atual: {len(raw) / (1024 * 1024):.1f}MB"
        )
    
    content_type = (file.content_type or "").lower()
    filename = _safe_filename(file.filename or "arquivo", content_type)

    # Se for imagem e Pillow disponível, converte para PDF
    saved_url: str
    try:
        if content_type.startswith("image/"):
            pdf_bytes = _image_to_pdf_bytes(raw)
            if pdf_bytes is not None:
                base, _ext = os.path.splitext(filename)
                filename = f"{base}.pdf"
                saved_url = _save_file_bytes(extrato_id, tipo, filename, pdf_bytes)
            else:
                # salva imagem como está
                saved_url = _save_file_bytes(extrato_id, tipo, filename, raw)
        else:
            # PDF ou outros tipos: salva direto
            saved_url = _save_file_bytes(extrato_id, tipo, filename, raw)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"❌ ERRO ao salvar arquivo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")

    # ✅ CORREÇÃO: Atualiza campo principal APENAS se vazio
    field = _resolve_field_for_tipo(tipo)
    if field:
        current_value = getattr(extrato, field, None)
        if not current_value:
            setattr(extrato, field, saved_url)

    # ✅ CORREÇÃO: Usar SQL direto para garantir persistência
    from sqlalchemy import text
    import json
    
    # Buscar extras atual via SQL
    result = db.execute(text("SELECT extras FROM extratos WHERE id = :extrato_id"), {"extrato_id": extrato_id})
    row = result.fetchone()
    current_extras = row[0] if row else None
    
    if isinstance(current_extras, str):
        try:
            extras = json.loads(current_extras)
        except:
            extras = {}
    else:
        extras = current_extras or {}
    
    # Atualizar o array de uploads
    uploads = extras.get("uploads") or {}
    history: List[str] = uploads.get(tipo) or []
    history.append(saved_url)
    uploads[tipo] = history
    extras["uploads"] = uploads
    extras["uploads_updated_at"] = _now_iso()
    
    # ✅ FORÇAR atualização via SQL direto
    extras_json = json.dumps(extras)
    db.execute(text("UPDATE extratos SET extras = :extras WHERE id = :extrato_id"), 
               {"extras": extras_json, "extrato_id": extrato_id})

    # Atualiza timers do processo
    _update_process_timers_v2(extrato, db)

    db.add(extrato)
    db.commit()

    return {"ok": True, "tipo": tipo, "url": saved_url, "field": field, "extrato_id": extrato_id}


@router.post("/mark_signed_external/{extrato_id}")
def mark_signed_external(extrato_id: int, db: Session = Depends(get_db)):
    try:
        # Buscar o extrato
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
        
        # Parse do extras (pode ser string JSON ou None)
        import json
        if isinstance(extrato.extras, str):
            try:
                extras = json.loads(extrato.extras)
            except:
                extras = {}
        else:
            extras = extrato.extras or {}
        
        # Marcar como assinado externamente
        # Criar timestamp como datetime (não string) para evitar erros de conversão
        from datetime import datetime
        import pytz
        timestamp_dt = datetime.now(pytz.timezone("America/Sao_Paulo"))
        timestamp_now = timestamp_dt.isoformat()  # String ISO para extras JSON
        
        extras["signed_external"] = True
        extras["signed_external_at"] = timestamp_now
        
        # Preservar dados originais do ZapSign se existirem
        if extrato.zapsign_bundle_id or extrato.zapsign_contrato_id:
            # Este extrato foi enviado via ZapSign, preservar dados originais
            # Converter datetime para string ISO para evitar erro de serialização JSON
            original_signed_at = extrato.zapsign_signed_at
            if original_signed_at and hasattr(original_signed_at, 'isoformat'):
                original_signed_at = original_signed_at.isoformat()
            elif not original_signed_at:
                original_signed_at = extras.get("zapsign_signed_at")
            
            extras["zapsign_original_signed_at"] = original_signed_at
            extras["zapsign_original_status"] = extrato.zapsign_status
        
        # ✅ SEMPRE atualizar zapsign_signed_at com o timestamp do clique (mesmo que já exista de webhook anterior)
        # Isso garante que o timer de gerente/anexos inicie do momento do clique
        extras["zapsign_signed_at"] = timestamp_now
        
        # ✅ IMPORTANTE: Atualizar zapsign_signed_at NO OBJETO antes de chamar _update_process_timers_v2
        # Isso permite que a função veja o valor atualizado e crie os timers corretos
        extrato.zapsign_signed_at = timestamp_dt  # Usar datetime object para o modelo SQLAlchemy
        # Isso permite que a função veja o valor atualizado e crie os timers corretos
        extrato.zapsign_signed_at = timestamp_dt  # Usar datetime object para o modelo SQLAlchemy
        extrato.zapsign_status = "assinado"
        extrato.status_documento = "assinado_externo"
        
        # ✅ ATUALIZAR TIMERS: Assinado externo interrompe timer assinatura e abre timer gerente
        # Atualizar o extras do extrato antes de salvar
        extrato.extras = extras
        _update_process_timers_v2(extrato, db)
        
        # Agora pegar os extras atualizados com os timers
        extras = extrato.extras or {}
        
        # Converter de volta para JSON string e atualizar via SQL direto
        extras_json = json.dumps(extras)
        
        from sqlalchemy import text
        
        # Usar SQL direto para persistir no banco (timestamp_dt já é datetime object)
        db.execute(
            text("UPDATE extratos SET extras = :extras, zapsign_status = 'assinado', status_documento = 'assinado_externo', zapsign_signed_at = :signed_at WHERE id = :extrato_id"),
            {"extras": extras_json, "extrato_id": extrato_id, "signed_at": timestamp_dt}
        )
        db.commit()
        
        return {
            "ok": True, 
            "extrato_id": extrato_id, 
            "signed_external": True,
            "zapsign_status": "assinado",
            "status_documento": "assinado_externo"
        }
    except Exception as e:
        print(f"Erro em mark_signed_external: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/initialize_all_missing_timers")
def initialize_all_missing_timers(db: Session = Depends(get_db)):
    """
    Inicializa timers para TODOS os extratos que estão assinados mas não têm timers.
    Solução definitiva para cobrir 100% das ocorrências.
    """
    try:
        import json
        from sqlalchemy import text
        
        # Buscar todos os extratos
        extratos = db.query(Extrato).all()
        
        processed = []
        skipped = []
        errors = []
        
        for extrato in extratos:
            try:
                # Parse extras
                if isinstance(extrato.extras, str):
                    try:
                        extras = json.loads(extrato.extras)
                    except:
                        extras = {}
                else:
                    extras = extrato.extras or {}
                
                # Verificar se já tem timers
                timer_keys = [k for k in extras.keys() if k.startswith('timer_')]
                
                # Verificar se está assinado (qualquer forma de assinatura)
                is_signed = (
                    extras.get('signed_external') or 
                    extrato.zapsign_status == 'assinado' or
                    extrato.zapsign_signed_at is not None or
                    extras.get('zapsign_signed_at') is not None
                )
                
                if is_signed and not timer_keys:
                    print(f"🔧 Inicializando timers para extrato {extrato.id}")
                    
                    # Marcar como signed_external se não estiver
                    if not extras.get('signed_external'):
                        timestamp_now = _now_iso()
                        extras["signed_external"] = True
                        extras["signed_external_at"] = timestamp_now
                        
                        # Usar data existente se disponível
                        if extrato.zapsign_signed_at:
                            if hasattr(extrato.zapsign_signed_at, 'isoformat'):
                                extras["signed_external_at"] = extrato.zapsign_signed_at.isoformat()
                        elif extras.get('zapsign_signed_at'):
                            extras["signed_external_at"] = extras['zapsign_signed_at']
                    
                    # Forçar criação de timers
                    extrato.extras = extras
                    _update_process_timers_v2(extrato, db)
                    
                    # Salvar mudanças
                    extras_json = json.dumps(extrato.extras or {})
                    db.execute(
                        text("UPDATE extratos SET extras = :extras, zapsign_status = 'assinado' WHERE id = :extrato_id"),
                        {"extras": extras_json, "extrato_id": extrato.id}
                    )
                    
                    processed.append(extrato.id)
                    
                elif timer_keys:
                    skipped.append(f"{extrato.id} (já tem timers)")
                else:
                    skipped.append(f"{extrato.id} (não assinado)")
                    
            except Exception as e:
                errors.append(f"Extrato {extrato.id}: {str(e)}")
                print(f"❌ Erro no extrato {extrato.id}: {e}")
        
        db.commit()
        
        return {
            "ok": True,
            "message": f"Processamento concluído",
            "processed": processed,
            "processed_count": len(processed),
            "skipped": skipped,
            "skipped_count": len(skipped),
            "errors": errors,
            "error_count": len(errors)
        }
        
    except Exception as e:
        print(f"❌ Erro geral em initialize_all_missing_timers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/reset_timer_to_signature_only/{extrato_id}")
def reset_timer_to_signature_only(extrato_id: int, db: Session = Depends(get_db)):
    """
    Reseta os timers de um extrato para mostrar apenas timer de assinatura correndo.
    Para casos onde o extrato não foi assinado mas está mostrando como concluído.
    """
    try:
        import json
        from sqlalchemy import text
        
        # Buscar o extrato
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
        
        # Parse extras
        if isinstance(extrato.extras, str):
            try:
                extras = json.loads(extrato.extras)
            except:
                extras = {}
        else:
            extras = extrato.extras or {}
        
        print(f"🔧 Resetando timers do extrato {extrato_id}")
        
        # Preservar timer_assinatura_start se existir, senão criar
        assinatura_start = extras.get('timer_assinatura_start')
        if not assinatura_start:
            # Criar timer_assinatura_start baseado na data de envio ou agora
            assinatura_start = _now_iso()
        
        # Limpar TODOS os timers e recriar apenas o de assinatura
        keys_to_remove = [k for k in extras.keys() if k.startswith('timer_')]
        for key in keys_to_remove:
            del extras[key]
        
        # Adicionar apenas timer_assinatura_start (sem _end)
        extras['timer_assinatura_start'] = assinatura_start
        
        # Garantir que signed_external seja False
        extras['signed_external'] = False
        extras['signed_external_at'] = None
        
        # Atualizar no banco
        extras_json = json.dumps(extras)
        db.execute(
            text("UPDATE extratos SET extras = :extras WHERE id = :extrato_id"),
            {"extras": extras_json, "extrato_id": extrato_id}
        )
        db.commit()
        
        print(f"✅ Extrato {extrato_id} resetado - apenas timer_assinatura_start ativo")
        
        return {
            "ok": True,
            "extrato_id": extrato_id,
            "message": "Timer resetado para apenas assinatura correndo",
            "timer_assinatura_start": assinatura_start,
            "signed_external": False
        }
        
    except Exception as e:
        print(f"❌ Erro em reset_timer_to_signature_only: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mark-salvo/{extrato_id}")
def mark_salvo_endpoint(extrato_id: int, db: Session = Depends(get_db)):
    """
    Marca um extrato como 'salvo' no status_documento.
    Chamado quando documentos são salvos no ModalDocumentos.
    """
    try:
        # Buscar o extrato
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
        
        # Atualizar status_documento para "salvo" usando SQL direto
        from sqlalchemy import text
        db.execute(
            text("UPDATE extratos SET status_documento = 'salvo' WHERE id = :extrato_id"),
            {"extrato_id": extrato_id}
        )
        db.commit()
        
        return {
            "ok": True,
            "extrato_id": extrato_id,
            "status_documento": "salvo",
            "message": "Extrato marcado como salvo"
        }
    except Exception as e:
        print(f"Erro em mark_salvo: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unmark_signed_external/{extrato_id}")
def unmark_signed_external(extrato_id: int, db: Session = Depends(get_db)):
    try:
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
        
        # Versão simples que usa SQL direto
        import json
        
        # Buscar extras atual
        current_extras = extrato.extras
        if isinstance(current_extras, str):
            try:
                extras = json.loads(current_extras)
            except:
                extras = {}
        else:
            extras = current_extras or {}
        
        # Remove marca de assinado externamente
        extras["signed_external"] = False
        extras["signed_external_at"] = None
        
        # ✅ IMPORTANTE: Remover timers de assinatura finalizada e gerente
        # Isso faz o timer de assinatura voltar a contar
        if "timer_assinatura_end" in extras:
            del extras["timer_assinatura_end"]
        if "timer_anexos_started_at" in extras:
            del extras["timer_anexos_started_at"]
        if "timer_anexos_ended_at" in extras:
            del extras["timer_anexos_ended_at"]
        if "timer_advogado_start" in extras:
            del extras["timer_advogado_start"]
        if "timer_advogado_end" in extras:
            del extras["timer_advogado_end"]
        
        # Restaurar dados originais do ZapSign se existirem
        original_signed_at = extras.get("zapsign_original_signed_at")
        original_status = extras.get("zapsign_original_status")
        
        from sqlalchemy import text
        
        if original_status:
            # Restaurar status original do ZapSign
            extras["zapsign_signed_at"] = original_signed_at  # pode ser null se não havia assinatura
            # Limpar flags de backup
            if "zapsign_original_signed_at" in extras:
                del extras["zapsign_original_signed_at"]
            if "zapsign_original_status" in extras:
                del extras["zapsign_original_status"]
            
            extras_json = json.dumps(extras)
            
            # Se original_signed_at é null, limpar também na tabela
            if original_signed_at:
                db.execute(
                    text("UPDATE extratos SET extras = :extras, zapsign_status = :status, status_documento = :status, zapsign_signed_at = :signed_at WHERE id = :extrato_id"),
                    {"extras": extras_json, "extrato_id": extrato_id, "status": original_status, "signed_at": original_signed_at}
                )
            else:
                db.execute(
                    text("UPDATE extratos SET extras = :extras, zapsign_status = :status, status_documento = :status, zapsign_signed_at = NULL WHERE id = :extrato_id"),
                    {"extras": extras_json, "extrato_id": extrato_id, "status": original_status}
                )
        elif extrato.zapsign_bundle_id or extrato.zapsign_contrato_id:
            # Documento ZapSign mas sem backup, reverter para "enviado"
            # ✅ NÃO limpar zapsign_signed_at - manter o timestamp original do webhook
            # Apenas atualizar status para "enviado"
            extras_json = json.dumps(extras)
            db.execute(
                text("UPDATE extratos SET extras = :extras, zapsign_status = 'enviado', status_documento = 'enviado' WHERE id = :extrato_id"),
                {"extras": extras_json, "extrato_id": extrato_id}
            )
        else:
            # Documento não-ZapSign, limpar tudo
            if extras.get("zapsign_signed_at"):
                extras["zapsign_signed_at"] = None
                
            extras_json = json.dumps(extras)
            db.execute(
                text("UPDATE extratos SET extras = :extras, zapsign_status = NULL, status_documento = 'enviado', zapsign_signed_at = NULL WHERE id = :extrato_id"),
                {"extras": extras_json, "extrato_id": extrato_id}
            )
        
        db.commit()
        
        # ✅ NÃO chamar _update_process_timers_v2 aqui porque já removemos tudo manualmente
        # Se chamar, pode recriar timers baseado em estados inconsistentes
        # Os timers foram removidos manualmente acima e isso é suficiente
        
        return {"ok": True, "extrato_id": extrato_id, "signed_external": False}
    except Exception as e:
        print(f"Erro em unmark_signed_external: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test_status/{extrato_id}")
def test_status(extrato_id: int, db: Session = Depends(get_db)):
    """Endpoint de teste para debug da resposta de status"""
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    
    extras = extrato.extras or {}
    
    return {
        "ok": True,
        "extrato_id": extrato_id,
        "test": "funcionando",
        "minimos": {
            "endereco_ok": bool(extrato.comprovante_endereco_url),
            "identidade_ok": bool(extrato.documento_identidade_url),
            "modo_identidade": "completo" if extrato.documento_identidade_url else "incompleto",
            "ok": bool(extrato.comprovante_endereco_url and extrato.documento_identidade_url)
        },
        "extras_keys": list(extras.keys()) if extras else []
    }


@router.get("/timers/{extrato_id}")
def get_timers(extrato_id: int, db: Session = Depends(get_db)):
    """
    Retorna informações detalhadas dos timers do processo.
    Útil para a tela gerencial de processos.
    """
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    
    # Atualiza timers antes de retornar
    _update_process_timers(extrato, db)
    db.commit()
    db.refresh(extrato)
    
    extras = extrato.extras or {}
    

    
    # Dados dos timers com timezone normalizado  
    assinatura_started = _normalize_timestamp_for_response(
        extras.get("timer_assinatura_start") or 
        extrato.enviado_em or 
        (extrato.atualizado_em if getattr(extrato, 'status_documento', None) == 'enviado' else None)
    )
    assinatura_ended = _normalize_timestamp_for_response(
        extras.get("timer_assinatura_ended_at") or 
        getattr(extrato, "zapsign_signed_at", None) or 
        extras.get("zapsign_signed_at")
    )
    
    timers = {
        "assinatura": {
            "started_at": assinatura_started,
            "ended_at": assinatura_ended,
            "active": bool(assinatura_started and not assinatura_ended)
        },
        "anexos": {
            "started_at": _normalize_timestamp_for_response(extras.get("timer_anexos_started_at")),
            "ended_at": _normalize_timestamp_for_response(extras.get("timer_anexos_ended_at")),
            "active": bool(extras.get("timer_anexos_started_at") and not extras.get("timer_anexos_ended_at")),
            "frozen": bool(extras.get("anexos_timer_frozen"))
        },
        "advogado": {
            "started_at": _normalize_timestamp_for_response(extras.get("timer_advogado_started_at")),
            "ended_at": _normalize_timestamp_for_response(extras.get("timer_advogado_ended_at")),
            "active": bool(extras.get("timer_advogado_started_at") and not extras.get("timer_advogado_ended_at"))
        }
    }
    
    # Compatibilidade com frontend existente
    legacy_timestamps = {
        "startEnvio": timers["assinatura"]["started_at"],
        "assinaturaConcluida": timers["assinatura"]["ended_at"],
        "enviadoAdvogado": timers["anexos"]["ended_at"],
        "advogadoConcluiu": timers["advogado"]["ended_at"]
    }
    
    # Retornar também os campos no nível raiz para compatibilidade
    result = {
        "ok": True,
        "extrato_id": extrato_id,
        "timers": timers,
        "timestamps": legacy_timestamps,
        "status": {
            "zapsign_status": getattr(extrato, "zapsign_status", None),
            "status_documento": getattr(extrato, "status_documento", None),
            "numero_processo": getattr(extrato, "numero_processo", None)
        }
    }
    
    # Adicionar campos diretos no nível raiz para compatibilidade (com timezone normalizado)
    result.update({
        "timer_assinatura_start": _normalize_timestamp_for_response(extras.get("timer_assinatura_start")),
        "timer_assinatura_end": _normalize_timestamp_for_response(extras.get("timer_assinatura_end")),
        "timer_gerente_start": _normalize_timestamp_for_response(extras.get("timer_gerente_start")),
        "timer_gerente_end": _normalize_timestamp_for_response(extras.get("timer_gerente_end")),
        "timer_advogado_start": _normalize_timestamp_for_response(extras.get("timer_advogado_start")),
        "timer_advogado_end": _normalize_timestamp_for_response(extras.get("timer_advogado_end"))
    })
    
    # Determinar fase atual diretamente
    fase_atual = "nao_enviado"
    if timers["advogado"]["ended_at"]:
        fase_atual = "finalizado"
    elif timers["advogado"]["started_at"]:
        fase_atual = "advogado"
    elif timers["anexos"]["ended_at"]:
        fase_atual = "aguardando_advogado"
    elif timers["anexos"]["started_at"]:
        fase_atual = "gerente_anexos"
    elif timers["assinatura"]["ended_at"]:
        fase_atual = "assinatura_concluida"
    elif timers["assinatura"]["started_at"]:
        fase_atual = "aguardando_assinatura"
    
    # Informações do processo completo
    result["processo_info"] = {
        "tempo_total": extras.get("tempo_total_processo"),
        "tempo_total_segundos": extras.get("tempo_total_segundos"),
        "finalizado": bool(extras.get("timer_advogado_ended_at")),
        "finalizado_at": extras.get("processo_finalizado_at"),
        "fase_atual": fase_atual
    }
    
    return result





@router.post("/admin/clear-all-timers")
def clear_all_timers(db: Session = Depends(get_db)):
    """Remove todos os campos timer_* dos extratos para reimplementação."""
    try:
        extratos = db.query(Extrato).all()
        cleared_count = 0
        
        for extrato in extratos:
            extras = extrato.extras or {}
            if isinstance(extras, str):
                try:
                    import json
                    extras = json.loads(extras)
                except:
                    extras = {}
            
            # Remover todos os campos timer_*
            timer_keys = [key for key in extras.keys() if key.startswith('timer_')]
            
            if timer_keys:
                for key in timer_keys:
                    del extras[key]
                
                extrato.extras = extras
                db.add(extrato)
                cleared_count += 1
        
        db.commit()
        
        return {
            "success": True,
            "message": f"Timers limpos de {cleared_count} extratos",
            "cleared_count": cleared_count
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": str(e)
        }

@router.post("/admin/debug-extrato/{extrato_id}")
def debug_extrato_timer(extrato_id: int, db: Session = Depends(get_db)):
    """Debug de um extrato específico."""
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        return {"error": "Extrato não encontrado"}
    
    extras_before = dict(extrato.extras or {})
    
    # Debug info
    debug_info = {
        "extrato_id": extrato.id,
        "nome_cliente": extrato.nome_cliente,
        "enviado_em": extrato.enviado_em,
        "criado_em": extrato.criado_em,
        "zapsign_signed_at": getattr(extrato, "zapsign_signed_at", None),
        "extras_before": extras_before,
        "extras_type": type(extrato.extras).__name__
    }
    
    # Aplicar normalização
    try:
        _update_process_timers_v2(extrato, db)
        extras_after = dict(extrato.extras or {})
        db.commit()
        
        debug_info["extras_after"] = extras_after
        debug_info["success"] = True
        
        # Comparar antes e depois
        changes = {}
        for key in extras_after:
            if key.startswith('timer_'):
                if extras_before.get(key) != extras_after.get(key):
                    changes[key] = {
                        "before": extras_before.get(key),
                        "after": extras_after.get(key)
                    }
        
        debug_info["changes"] = changes
        
    except Exception as e:
        db.rollback()
        debug_info["error"] = str(e)
        debug_info["success"] = False
    
    return debug_info

@router.post("/admin/reimplant-all-timers")
def reimplant_all_timers(db: Session = Depends(get_db)):
    """
    Reimplementa todos os timers usando a nova lógica robusta.
    """
    try:
        extratos = db.query(Extrato).all()
        total_processed = 0
        created_count = 0
        details = []
        
        for extrato in extratos:
            total_processed += 1
            extras_before = dict(extrato.extras or {})
            
            # Sempre aplicar a nova implementação
            _update_process_timers_v2(extrato, db)
            extras_after = dict(extrato.extras or {})
            
            # Verificar se algum timer foi criado
            timer_fields = [
                'timer_assinatura_start', 'timer_assinatura_end',
                'timer_gerente_start', 'timer_gerente_end', 
                'timer_advogado_start', 'timer_advogado_end'
            ]
            
            created_timers = []
            for field in timer_fields:
                if extras_after.get(field) and not extras_before.get(field):
                    created_timers.append(field)
            
            if created_timers:
                created_count += 1
                action = f"created: {', '.join(created_timers)}"
            else:
                action = "no_timers_applicable"
            
            details.append({
                "id": extrato.id,
                "nome_cliente": extrato.nome_cliente, 
                "action": action
            })
        
        db.commit()
        
        return {
            "success": True,
            "message": "Timers reimplementados com nova lógica robusta",
            "total_processed": total_processed,
            "created_count": created_count,
            "details": details
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": str(e),
            "total_processed": 0,
            "created_count": 0
        }

@router.post("/set-status/{extrato_id}")
def set_status_documento(
    extrato_id: int,
    status: str = Query(..., description="Status a ser definido: salvo, enviado, assinado, assinado_externo"),
    db: Session = Depends(get_db)
):
    """
    Atualiza o status_documento de um extrato.
    
    Status válidos:
    - "salvo": Quando documentos são salvos no modal
    - "enviado": Quando documento é enviado para assinatura
    - "assinado": Quando documento é assinado
    - "assinado_externo": Quando marcado como assinado externo no frontend
    """
    extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
    if not extrato:
        raise HTTPException(status_code=404, detail="Extrato não encontrado")
    
    # Validar status
    valid_statuses = ["salvo", "enviado", "assinado", "assinado_externo"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400, 
            detail=f"Status inválido. Use um dos: {', '.join(valid_statuses)}"
        )
    
    # Atualizar status
    extrato.status_documento = status
    
    # Se for "assinado_externo", marcar nos extras também
    if status == "assinado_externo":
        extras = extrato.extras or {}
        if isinstance(extras, str):
            try:
                import json
                extras = json.loads(extras)
            except:
                extras = {}
        if not isinstance(extras, dict):
            extras = {}
        
        # Marcar como assinado externo com timestamp
        import pytz
        SAO_TZ = pytz.timezone("America/Sao_Paulo")
        now_iso = datetime.now(SAO_TZ).isoformat()
        
        extras["signed_external"] = True
        extras["signed_external_at"] = now_iso
        
        extrato.extras = extras
    
    db.add(extrato)
    
    # Atualizar timers após mudança de status
    _update_process_timers(extrato, db)
    
    db.commit()
    
    return {
        "success": True,
        "extrato_id": extrato_id,
        "status_anterior": "desconhecido",  # Poderíamos logar o anterior
        "status_novo": status,
        "message": f"Status alterado para '{status}'"
    }

@router.post("/mark-salvo/{extrato_id}")
def mark_salvo_documento(extrato_id: int, db: Session = Depends(get_db)):
    """
    Marca um extrato como 'salvo' - baseado no padrão de mark_signed_external.
    """
    try:
        # Buscar o extrato (usa mesma lógica de mark_signed_external)
        extrato = db.query(Extrato).filter(Extrato.id == extrato_id).first()
        if not extrato:
            raise HTTPException(status_code=404, detail="Extrato não encontrado")
        
        # Atualizar diretamente via SQL (mesmo padrão usado)
        from sqlalchemy import text
        db.execute(
            text("UPDATE extratos SET status_documento = 'salvo', updated_at = CURRENT_TIMESTAMP WHERE id = :extrato_id"),
            {"extrato_id": extrato_id}
        )
        db.commit()
        
        return {
            "ok": True, 
            "extrato_id": extrato_id, 
            "status_documento": "salvo",
            "timestamp": _now_iso(),
            "message": "Documento marcado como salvo"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erro em mark_salvo_documento: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")

@router.post("/mark-assinado-externo/{extrato_id}")
def mark_assinado_externo(extrato_id: int, db: Session = Depends(get_db)):
    """
    Marca um extrato como 'assinado_externo' (quando marcado no frontend).
    """
    return set_status_documento(extrato_id, "assinado_externo", db)

@router.post("/admin/normalize-all-timers")
def normalize_all_timers(db: Session = Depends(get_db)):
    """
    Normaliza todos os timers dos extratos que ainda não foram processados.
    """
    try:
        extratos = db.query(Extrato).all()
        total_processed = 0
        updated_count = 0
        details = []
        
        for extrato in extratos:
            total_processed += 1
            extras_before = dict(extrato.extras or {})
            
            # Verificar se já tem timers normalizados
            has_normalized_timers = any([
                extras_before.get('timer_assinatura_start'),
                extras_before.get('timer_assinatura_end'), 
                extras_before.get('timer_gerente_start'),
                extras_before.get('timer_gerente_end'),
                extras_before.get('timer_advogado_start'),
                extras_before.get('timer_advogado_end')
            ])
            
            if not has_normalized_timers:
                # Aplicar normalização
                _update_process_timers(extrato, db)
                updated_count += 1
                
                details.append({
                    "id": extrato.id,
                    "nome_cliente": extrato.nome_cliente,
                    "action": "normalized"
                })
            else:
                details.append({
                    "id": extrato.id, 
                    "nome_cliente": extrato.nome_cliente,
                    "action": "already_normalized"
                })
        
        db.commit()
        
        return {
            "success": True,
            "total_processed": total_processed,
            "updated_count": updated_count,
            "details": details
        }
        
    except Exception as e:
        db.rollback()
        return {
            "success": False,
            "error": str(e),
            "total_processed": 0,
            "updated_count": 0
        }
