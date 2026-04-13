"""Helpers centralizados para soft-delete de Extrato.

Toda lógica de exclusão lógica passa por aqui — não duplicar em rotas.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Query as SAQuery, Session

from app.models.extrato import Extrato


def extrato_ativo(query: SAQuery) -> SAQuery:
    """Restringe uma query SQLAlchemy para retornar apenas extratos não deletados."""
    return query.filter(Extrato.deleted_at.is_(None))


def get_extrato_or_404(db: Session, extrato_id: int) -> Extrato:
    """Retorna o Extrato ativo pelo ID ou levanta 404.

    Não considera extratos soft-deleted como existentes.
    """
    ex = extrato_ativo(db.query(Extrato)).filter(Extrato.id == extrato_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Extrato não encontrado.")
    return ex
