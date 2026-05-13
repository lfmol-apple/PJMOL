from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from app.models.usuario import Usuario
from app.services.production_report import ADMIN_IDS, build_commission_report, build_production_report

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
    if uid in ADMIN_IDS:
        return
    if uid is not None:
        user = db.query(Usuario).filter(Usuario.id == uid).first()
        if user and (bool(getattr(user, "is_admin", False)) or str(getattr(user, "perfil", "") or "").strip().lower() == "admin"):
            return
    raise HTTPException(status_code=403, detail="Relatório restrito aos administradores.")


def _resolve_user(db: Session, uid: Optional[int], perfil: Optional[str]) -> tuple[bool, Optional[int]]:
    """Returns (is_admin, resolved_uid). Raises 401 if not authenticated."""
    if uid is None:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    is_admin = uid in ADMIN_IDS
    if not is_admin:
        user = db.query(Usuario).filter(Usuario.id == uid).first()
        if user and (bool(getattr(user, "is_admin", False)) or str(getattr(user, "perfil", "") or "").strip().lower() == "admin"):
            is_admin = True
    return is_admin, uid


@router.get("/comissoes")
def obter_comissoes(
    data_inicial: date = Query(...),
    data_final: date = Query(...),
    usuario_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    is_admin, caller_uid = _resolve_user(db, uid, perfil)
    if data_final < data_inicial:
        raise HTTPException(status_code=400, detail="data_final não pode ser anterior à data_inicial.")
    # Admins can filter by any user; gerentes always see only their own data
    filter_uid = usuario_id if is_admin else caller_uid
    return build_commission_report(db, data_inicial, data_final, usuario_id=filter_uid, is_admin=is_admin)


@router.get("")
def obter_relatorio_producao(
    data_inicial: date = Query(...),
    data_final: date = Query(...),
    acordo_inserido_por_usuario_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    uid: Optional[int] = Depends(_parse_uid),
    perfil: Optional[str] = Depends(_parse_perfil),
):
    _require_admin(db, uid, perfil)
    if data_final < data_inicial:
        raise HTTPException(status_code=400, detail="data_final não pode ser anterior à data_inicial.")
    return build_production_report(db, data_inicial, data_final, acordo_inserido_por_usuario_id)
