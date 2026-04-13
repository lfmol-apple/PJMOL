from sqlalchemy import Column, Integer, String, UniqueConstraint
from database import Base

class Advogado(Base):
    __tablename__ = "advogados"

    id = Column(Integer, primary_key=True, index=True)
    nome_completo = Column(String, nullable=False)
    oab = Column(String, nullable=False)   # única!
    email = Column(String, nullable=False) # pode repetir
    telefone = Column(String, nullable=False)
    usuario = Column(String, nullable=False, unique=True)
    senha_hash = Column(String, nullable=False)
    api_key_zapsign = Column(String, nullable=True)

    # 🔵 NOVOS CAMPOS (multi-tenant webhook ZapSign)
    # Token no caminho da URL do webhook (único por advogado)
    webhook_path_token = Column(String, unique=True, index=True, nullable=True)
    # Opcional: segunda trava via querystring (?secret=...)
    webhook_secret = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("oab", name="uq_advogado_oab"),
    )
