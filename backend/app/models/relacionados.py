# app/models/relacionados.py
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Index
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime

from database import Base
from app.core.time import now_sp  # ✅ timestamps em America/Sao_Paulo

# Evitar import circular em tempo de import; usamos TYPE_CHECKING para type hints
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.extrato import Extrato  # pragma: no cover


class ParcelaExtrato(Base):
    __tablename__ = "parcelas_extrato"

    id = Column(Integer, primary_key=True, autoincrement=True)
    extrato_id = Column(Integer, ForeignKey("extratos.id", ondelete="CASCADE"), nullable=False)

    numero_parcela = Column(Integer, nullable=True)
    data_pagamento = Column(Date, nullable=True)
    valor_pago = Column(Float, nullable=True)
    valor_corrigido_hoje = Column(Float, nullable=True)
    valor_corrigido_futuro = Column(Float, nullable=True)
    tipo = Column(String(80), nullable=True)  # ex.: "RECBTO. PARCELA"

    # ✅ horário real de São Paulo (timezone-aware)
    created_at = Column(DateTime(timezone=True), default=now_sp, nullable=False)

    # backref definido no Extrato: parcelas = relationship("ParcelaExtrato", ...)
    extrato = relationship("Extrato", back_populates="parcelas")

    __table_args__ = (
        Index("ix_parcelas_extrato_extrato_id", "extrato_id"),
        Index("ix_parcelas_extrato_extrato_id_numero", "extrato_id", "numero_parcela"),
    )


class CustaExtrato(Base):
    __tablename__ = "custas_extrato"

    id = Column(Integer, primary_key=True, autoincrement=True)
    extrato_id = Column(Integer, ForeignKey("extratos.id", ondelete="CASCADE"), nullable=False)

    data = Column(Date, nullable=True)
    descricao = Column(Text, nullable=True)
    valor = Column(Float, nullable=True)

    # ✅ horário real de São Paulo (timezone-aware)
    created_at = Column(DateTime(timezone=True), default=now_sp, nullable=False)

    extrato = relationship("Extrato", back_populates="custas")

    __table_args__ = (
        Index("ix_custas_extrato_extrato_id", "extrato_id"),
    )


class AnexoExtrato(Base):
    __tablename__ = "anexos_extrato"

    id = Column(Integer, primary_key=True, autoincrement=True)
    extrato_id = Column(Integer, ForeignKey("extratos.id", ondelete="CASCADE"), nullable=False)

    original_name = Column(String(255), nullable=True)
    filename = Column(String(255), nullable=True)     # nome armazenado localmente
    mime_type = Column(String(100), nullable=True)
    size = Column(Integer, nullable=True)             # bytes
    url_publica = Column(Text, nullable=True)         # se usar CDN/Drive

    # ✅ horário real de São Paulo (timezone-aware)
    created_at = Column(DateTime(timezone=True), default=now_sp, nullable=False)

    extrato = relationship("Extrato", back_populates="anexos")

    __table_args__ = (
        Index("ix_anexos_extrato_extrato_id", "extrato_id"),
    )
