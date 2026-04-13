# app/models/comunicado.py
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from app.core.time import now_sp


class Comunicado(Base):
    __tablename__ = "comunicados"

    id = Column(Integer, primary_key=True, autoincrement=True)
    numero_regra = Column(Integer, nullable=True)  # sequencial: Regra Nº X
    autor_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    autor_nome = Column(String(255), nullable=False)
    conteudo = Column(Text, nullable=False)
    fixado = Column(Boolean, default=False, nullable=False)
    ativo = Column(Boolean, default=True, nullable=False)
    criado_em = Column(DateTime(timezone=True), default=now_sp, nullable=False)
    atualizado_em = Column(DateTime(timezone=True), default=now_sp, onupdate=now_sp)
