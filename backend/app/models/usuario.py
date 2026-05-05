# app/models/usuario.py
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base
from app.core.time import now_sp  # ✅ timestamps no fuso America/Sao_Paulo

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Dados principais
    nome = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)

    # Autenticação
    senha_hash = Column(String(255), nullable=False)

    # Contato / permissões
    telefone = Column(String(32), nullable=True)
    is_admin = Column(Boolean, nullable=False, server_default="0")
    perfil = Column(String(20), nullable=True, server_default="'usuario'")

    # Timestamps (timezone-aware em São Paulo)
    created_at = Column(DateTime(timezone=True), default=now_sp, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=now_sp, onupdate=now_sp)

    # Sem FK física; join explícito + delete-orphan correto
    extratos = relationship(
        "Extrato",
        back_populates="usuario",
        primaryjoin="Usuario.id==Extrato.usuario_id",
        foreign_keys="[Extrato.usuario_id]",
        cascade="all, delete-orphan",
        single_parent=True,   # importante p/ delete-orphan
        lazy="selectin",
    )

# Índices adicionais (opcional, além de unique/index no email)
Index("ix_usuarios_nome", Usuario.nome)
