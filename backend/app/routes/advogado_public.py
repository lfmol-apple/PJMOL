# app/routes/advogado_public.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from database import get_db
from app.models.advogado import Advogado
from app.models.extrato import Extrato

# Reutiliza a sua chave/algoritmo do projeto
try:
    from app.auth_utils import SECRET_KEY, ALGORITHM
except Exception:
    # Fallback dev: não usar em produção
    SECRET_KEY = "dev-secret-change-me"
    ALGORITHM = "HS256"

router = APIRouter(prefix="/public/advogado", tags=["Public | Advogado"])


# --------- Helpers ---------
def _decode_magic(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.")

    if payload.get("purpose") != "adv_open" or payload.get("role") != "advogado":
        raise HTTPException(status_code=401, detail="Token não autorizado para esta ação.")

    # Verifica expiração apenas se o campo "exp" existir (tokens antigos têm, novos não)
    exp = payload.get("exp")
    if exp and datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(tz=timezone.utc):
        raise HTTPException(status_code=401, detail="Token expirado.")
    return payload


def _get_advogado_by_token(db: Session, data: dict) -> Advogado:
    """
    Aceita tokens SEM adv_id (usa e-mail). Mantém compat. com tokens antigos.
    """
    adv_email = (data.get("sub") or "").strip().lower()
    if not adv_email:
        raise HTTPException(status_code=401, detail="Token incompleto (sem e-mail).")

    adv_id = data.get("adv_id")
    if adv_id:
        adv = (
            db.query(Advogado)
            .filter(Advogado.id == adv_id, Advogado.email.ilike(adv_email))
            .first()
        )
        if adv:
            return adv

    # fallback: localizar somente por e-mail
    adv = db.query(Advogado).filter(Advogado.email.ilike(adv_email)).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Advogado não encontrado para este token.")
    return adv


def _assert_vinculo_extrato_advogado(ex: Extrato, adv: Advogado):
    """
    Flexibiliza o vínculo:
      - Se extrato.advogado_id existir, deve bater com adv.id
      - Senão, se extrato.advogado_email existir, deve bater com adv.email
      - Senão, permite (considera sem vínculo explícito, mas token do advogado é válido)
    """
    if getattr(ex, "advogado_id", None):
        if ex.advogado_id != adv.id:
            raise HTTPException(status_code=403, detail="Extrato não pertence a este advogado (id).")
        return

    extrato_email = (getattr(ex, "advogado_email", None) or "").strip().lower()
    if extrato_email:
        if extrato_email != (adv.email or "").strip().lower():
            raise HTTPException(status_code=403, detail="Extrato não pertence a este advogado (e-mail).")
        return
    # Sem vínculo explícito: permitir (útil em migração). Se quiser, você pode bloquear aqui.


# --------- Schemas ---------
class NumeroProcessoIn(BaseModel):
    numero_processo: str

    @field_validator("numero_processo")
    @classmethod
    def _valida_numero(cls, v: str) -> str:
        if v is None:
            raise ValueError("Informe 'numero_processo'.")
        v = v.strip()
        if not v:
            raise ValueError("Informe 'numero_processo'.")
        return v


# --------- Rotas públicas ---------
@router.get("/open/{extrato_id}/{token}")
def abrir_por_token(extrato_id: int, token: str, db: Session = Depends(get_db)):
    """
    Valida o token de acesso direto do advogado e retorna payload mínimo
    para o frontend iniciar sessão MODO ADVOGADO nesse extrato.
    Agora aceita token sem adv_id (usa e-mail).
    """
    data = _decode_magic(token)

    if int(data.get("extrato_id", -1)) != int(extrato_id):
        raise HTTPException(status_code=403, detail="Token não corresponde a este extrato.")

    adv = _get_advogado_by_token(db, data)

    ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    _assert_vinculo_extrato_advogado(ex, adv)

    return {
        "ok": True,
        "advogado": {
            "id": adv.id,
            "nome": getattr(adv, "nome_completo", None) or getattr(adv, "nome", "") or "",
            "email": adv.email,
            "perfil": "advogado",
        },
        "extrato": {
            "id": ex.id,
            "numero_processo": ex.numero_processo,
        },
        # o próprio token servirá como Bearer para as ações públicas deste modo
        "bearer": token,
    }


@router.post("/extratos/{extrato_id}/numero-processo")
def set_numero_processo(
    extrato_id: int,
    body: NumeroProcessoIn,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Permite ao advogado (via link mágico) gravar/atualizar o número do processo
    SOMENTE do extrato vinculado ao token. Aceita token sem adv_id (usa e-mail).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token ausente.")
    token = authorization.split(None, 1)[1]

    data = _decode_magic(token)

    if int(data.get("extrato_id", -1)) != int(extrato_id):
        raise HTTPException(status_code=403, detail="Token não corresponde a este extrato.")

    adv = _get_advogado_by_token(db, data)

    ex = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")

    _assert_vinculo_extrato_advogado(ex, adv)

    ex.numero_processo = body.numero_processo  # já veio validado/stripado
    
    # Atualiza timestamp do número do processo (finaliza timer do advogado)
    from app.routes.uploads_clean import _set_numero_processo_timestamp
    _set_numero_processo_timestamp(ex, db)
    
    db.add(ex)
    db.commit()

    return {"ok": True, "extrato_id": ex.id, "numero_processo": ex.numero_processo}
