import json
import os
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from app.core.time import now_sp

router = APIRouter(prefix="/alerta-forcado", tags=["AlertaForcado"])

# Leonardo (5), Henrique (8) e Marco (11) podem disparar
_DISPARADORES = {5, 8, 11}

_ALERT_FILE = "/tmp/pjmol_forced_alert.json"



def _load() -> dict:
    try:
        with open(_ALERT_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}


def _save(data: dict) -> None:
    try:
        with open(_ALERT_FILE, "w") as f:
            json.dump(data, f)
    except Exception:
        pass


def _parse_uid(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> Optional[int]:
    if not x_usuario_id:
        return None
    try:
        return int(x_usuario_id)
    except Exception:
        return None


@router.post("/")
async def disparar_alerta_forcado(
    db: Session = Depends(get_db),
    x_usuario_id: Optional[int] = Depends(_parse_uid),
):
    if x_usuario_id not in _DISPARADORES:
        raise HTTPException(status_code=403, detail="Sem permissão para disparar alerta")

    from app.models.usuario import Usuario
    autor = db.query(Usuario).filter(Usuario.id == x_usuario_id).first()
    agora = now_sp()

    payload = {
        "last_forced_at": agora.isoformat(),
        "autor_id": x_usuario_id,
        "autor_nome": autor.nome if autor else "",
    }
    _save(payload)
    return payload


@router.get("/")
async def obter_alerta_forcado():
    data = _load()
    return {
        "last_forced_at": data.get("last_forced_at"),
        "autor_id": data.get("autor_id"),
        "autor_nome": data.get("autor_nome", ""),
    }
