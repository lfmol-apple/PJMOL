from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
from app.core.time import now_sp  # ✅ timestamps em America/Sao_Paulo

class Usuario(Base):
    __tablename__ = "usuarios"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    senha_hash = Column(String, nullable=False)
    criado_em = Column(DateTime(timezone=True), default=now_sp)  # ✅ fuso SP
    is_admin = Column(Boolean, default=False)

    extratos = relationship("Extrato", back_populates="usuario")

    def __repr__(self):
        return f"<Usuario(nome={self.nome}, email={self.email}, admin={self.is_admin})>"

class Extrato(Base):
    __tablename__ = "extratos"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    grupo = Column(String, nullable=False)
    cota = Column(String, nullable=False)
    nome_cliente = Column(String, nullable=False)
    cpf_cnpj = Column(String, nullable=False)
    tipo_documento = Column(String, nullable=False)
    administradora = Column(String, nullable=False)

    taxa_adm_percentual = Column(Float, nullable=False)
    total_parcelas_plano = Column(Integer, nullable=False)
    data_encerramento = Column(Date, nullable=False)
    valor_total_pago_extrato = Column(Float, nullable=False)

    parcelas_pagas = Column(Integer, nullable=True)
    soma_valores_pagos = Column(Float, nullable=True)

    cidade = Column(String, nullable=True)
    estado = Column(String, nullable=True)
    telefone = Column(String, nullable=True)

    email_cliente = Column(String, nullable=True)
    rua = Column(String, nullable=True)
    numero = Column(String, nullable=True)
    complemento = Column(String, nullable=True)
    bairro = Column(String, nullable=True)
    cep = Column(String, nullable=True)
    data_adesao = Column(Date, nullable=True)

    comarca_cliente = Column(String, nullable=True)
    comarca_administradora = Column(String, nullable=True)

    advogado = Column(String, nullable=True)
    numero_processo = Column(String, nullable=True)
    honorarios_percentual = Column(Float, nullable=True)
    fase_processo = Column(String, nullable=True)
    nome_magistrado = Column(String, nullable=True)

    valor_corrigido_hoje = Column(Float, nullable=True)
    valor_futuro = Column(Float, nullable=True)

    # Novos campos para seleção de índice
    indice_ate_hoje = Column(String, nullable=True)
    indice_futuro = Column(String, nullable=True)

    tipo_decisao = Column(String, nullable=True)
    tipo_pagamento = Column(String, nullable=True)
    sucumbencia = Column(Boolean, nullable=True)
    sentenca_anexada = Column(Boolean, default=False)
    sentenca_lida = Column(Boolean, default=False)

    # 🎯 SIMPLIFICAÇÃO: fase atual do processo (substitui timers complexos)
    fase_atual = Column(String, default="enviado", nullable=False)
    # Valores possíveis:
    # - "enviado": extrato enviado, aguardando assinatura
    # - "assinado": cliente assinou, gerente precisa anexar docs
    # - "com_advogado": documentos anexados, advogado trabalhando
    # - "finalizado": número do processo inserido

    usuario_id = Column(Integer, ForeignKey("usuarios.id"))
    usuario = relationship("Usuario", back_populates="extratos")

    data_exportacao = Column(DateTime(timezone=True), default=now_sp)  # ✅ fuso SP

    def __repr__(self):
        return f"<Extrato(grupo={self.grupo}, cota={self.cota}, cliente={self.nome_cliente})>"
