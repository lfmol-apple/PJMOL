# backend/app/audit.py
from __future__ import annotations

from typing import Optional, Any, Dict
from datetime import datetime

from fastapi import APIRouter, Depends, Request, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, JSON, Index, func
)
from sqlalchemy.orm import Session

# Reaproveita a infra do projeto
from database import get_db
from app.models.base import Base  # Se seu Base estiver noutro arquivo, ajuste o import.


# ===========================
# Modelo de Log (SQLAlchemy)
# ===========================
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True)

    # Quem fez (headers do frontend costumam trazer X-Usuario-Id/Nome/Perfil)
    actor_id = Column(Integer, nullable=True, index=True)
    actor_name = Column(String(255), nullable=True)
    actor_role = Column(String(50), nullable=True)

    # Contexto do PJMOL
    extrato_id = Column(Integer, nullable=True, index=True)
    entity = Column(String(100), nullable=True)     # ex.: "extrato", "upload", "zapsign"
    entity_id = Column(Integer, nullable=True)

    # O que aconteceu
    action = Column(String(100), nullable=False)    # ex.: "uploads.notify", "extratos.update"
    message = Column(Text, nullable=True)

    # Extra: request info e payloads
    method = Column(String(10), nullable=True)
    path = Column(String(500), nullable=True)
    ip = Column(String(100), nullable=True)
    user_agent = Column(Text, nullable=True)

    payload = Column(JSON, nullable=True)           # qualquer dict/JSON

# Índices auxiliares
Index("ix_audit_logs_extrato_created", AuditLog.extrato_id, AuditLog.created_at.desc())


# ===========================
# Função ÚNICA para logar
# ===========================
def log_event(
    db: Session,
    *,
    action: str,
    message: str = "",
    request: Optional[Request] = None,
    extrato_id: Optional[int] = None,
    entity: Optional[str] = None,
    entity_id: Optional[int] = None,
    actor_id: Optional[int] = None,
    actor_name: Optional[str] = None,
    actor_role: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    """Registra um evento no banco (uma linha na tabela audit_logs)."""
    ip = None
    ua = None
    method = None
    path = None

    # Coleta infos do Request (se disponível)
    if request is not None:
        method = request.method
        path = str(request.url.path)
        # Tenta extrair IP
        ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.client.host if request.client else None
        ua = request.headers.get("User-Agent")

        # Se não veio actor_* explícito, tenta dos headers padrão do teu frontend
        actor_id = actor_id or _coerce_int(request.headers.get("X-Usuario-Id"))
        actor_name = actor_name or request.headers.get("X-Usuario-Nome")
        actor_role = actor_role or request.headers.get("X-Usuario-Perfil")

    log = AuditLog(
        actor_id=actor_id,
        actor_name=actor_name,
        actor_role=actor_role,
        extrato_id=extrato_id,
        entity=entity,
        entity_id=entity_id,
        action=action,
        message=message,
        method=method,
        path=path,
        ip=ip,
        user_agent=ua,
        payload=payload or {},
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def _coerce_int(val: Any) -> Optional[int]:
    try:
        if val is None:
            return None
        return int(str(val).strip())
    except Exception:
        return None


# ===========================
# Router opcional p/ consulta
# ===========================
audit_router = APIRouter()

class AuditOut(BaseModel):
    id: int
    created_at: datetime
    actor_id: Optional[int] = None
    actor_name: Optional[str] = None
    actor_role: Optional[str] = None
    extrato_id: Optional[int] = None
    entity: Optional[str] = None
    entity_id: Optional[int] = None
    action: str
    message: Optional[str] = None
    method: Optional[str] = None
    path: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    payload: dict

    class Config:
        from_attributes = True


@audit_router.get("/audit", response_model=list[AuditOut])
def list_audit_logs(
    request: Request,
    extrato_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
    if extrato_id is not None:
        q = q.filter(AuditLog.extrato_id == extrato_id)
    rows = q.offset(offset).limit(limit).all()
    return rows


@audit_router.get("/audit/{log_id}", response_model=AuditOut)
def get_audit_log(log_id: int, db: Session = Depends(get_db)):
    row = db.query(AuditLog).filter(AuditLog.id == log_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Log não encontrado")
    return row
