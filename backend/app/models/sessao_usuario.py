# app/models/sessao_usuario.py
from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base
from app.core.time import now_sp


class SessaoUsuario(Base):
    __tablename__ = "sessoes_usuarios"
    __table_args__ = (
        UniqueConstraint("usuario_id", "data_referencia", name="uq_sessoes_usuario_dia"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True, index=True)
    nome = Column(String(255), nullable=False)
    perfil = Column(String(50), nullable=False)
    data_referencia = Column(Date, nullable=False, index=True)  # dia civil (SP)
    login_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=False, default=now_sp)
    logout_at = Column(DateTime(timezone=True), nullable=True)

    usuario = relationship("Usuario", backref="sessoes")
