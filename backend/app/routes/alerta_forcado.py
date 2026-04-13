from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from app.core.time import now_sp

router = APIRouter(prefix="/alerta-forcado", tags=["AlertaForcado"])

# Leonardo (5), Henrique (8) e Marco (11) podem disparar
_DISPARADORES = {5, 8, 11}


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

    # Usa tabela usuarios para armazenar o último disparo (coluna extra em JSON simples)
    # Para evitar migração pesada, guardamos em campo generico extras_json, se existir;
    # caso não exista, ignoramos o armazenamento detalhado e apenas retornamos horário.
    payload = {"last_forced_at": agora.isoformat(), "autor_id": x_usuario_id, "autor_nome": autor.nome if autor else ""}

    try:
        if hasattr(autor, "extras"):
            extras = getattr(autor, "extras") or {}
            if not isinstance(extras, dict):
                extras = {}
            extras["daily_alert_forced"] = payload
            setattr(autor, "extras", extras)
            db.add(autor)
            db.commit()
    except Exception:
        # fallback silencioso: ainda assim devolve horário
        pass

    return payload


@router.get("/")
async def obter_alerta_forcado(db: Session = Depends(get_db)):
    """Retorna o último alerta forçado (se existir)."""
    from app.models.usuario import Usuario

    try:
        autor = db.query(Usuario).filter(Usuario.id.in_(_DISPARADORES)).order_by(Usuario.id.asc()).first()
    except Exception:
        autor = None

    if not autor or not hasattr(autor, "extras"):
        return {"last_forced_at": None, "autor_id": None, "autor_nome": ""}

    extras = getattr(autor, "extras") or {}
    if not isinstance(extras, dict):
        extras = {}

    data = extras.get("daily_alert_forced") or {}
    return {
        "last_forced_at": data.get("last_forced_at"),
        "autor_id": data.get("autor_id"),
        "autor_nome": data.get("autor_nome", ""),
    }
