from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from app.models.usuario import Usuario
from app.services.production_report import ADMIN_IDS, build_production_report

router = APIRouter(prefix="/relatorios/producao", tags=["Relatorios Producao"])


def _parse_uid(x_usuario_id: Optional[str] = Header(None, alias="X-Usuario-Id")) -> Optional[int]:
    if not x_usuario_id:
        return None
    try:
        return int(x_usuario_id)
    except Exception:
        return None


def _parse_perfil(x_perfil: Optional[str] = Header(None, alias="X-Perfil")) -> Optional[str]:
    return (x_perfil or "").strip().lower() or None


def _require_admin(
    db: Session,
    uid: Optional[int],
    perfil: Optional[str],
) -> None:
    if perfil == "admin":
        return
    if uid in ADMIN_IDS:
        return
    if uid is not None:
        user = db.query(Usuario).filter(Usuario.id == uid).first()
        if user and (bool(getattr(user, "is_admin", False)) or str(getattr(user, "perfil", "") or "").strip().lower() == "admin"):
            return
    raise HTTPException(status_code=403, detail="Relatório restrito aos administradores.")


@router.get("")
def obter_relatorio_producao(
    data_inicial: date = Query(...),
    data_final: date = Query(...),
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    _require_admin(db, uid, perfil)
    if data_final < data_inicial:
        raise HTTPException(status_code=400, detail="data_final não pode ser anterior à data_inicial.")
    return build_production_report(db, data_inicial, data_final)