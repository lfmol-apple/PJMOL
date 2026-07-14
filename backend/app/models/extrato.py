# app/models/extrato.py
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Boolean, Index
)
from sqlalchemy.orm import relationship
    # fmt: off
from sqlalchemy.sql import func
from database import Base
from app.core.time import now_sp  # ✅ usar horário real de São Paulo

# JSON no SQLite (armazenado como TEXT se o dialect não existir)
try:
    from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON  # type: ignore
except Exception:
    SQLITE_JSON = Text  # fallback

# evita import circular apenas para type-check
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.usuario import Usuario


class Extrato(Base):
    __tablename__ = "extratos"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Dono do registro
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    usuario = relationship("Usuario", back_populates="extratos", foreign_keys=[usuario_id])

    # ------------------ Identificação / cliente ------------------
    grupo = Column(String, nullable=False)
    cota = Column(String, nullable=False)
    nome_cliente = Column(String, nullable=False)
    email_cliente = Column(Text, nullable=True)
    telefone = Column(String, nullable=True)

    cpf_cnpj = Column(String, nullable=False)
    tipo_documento = Column(String, nullable=False)
    # 🔵 Novo campo
    nacionalidade = Column(String, nullable=True)

    # Endereço
    rua = Column(Text, nullable=True)
    numero = Column(Text, nullable=True)
    complemento = Column(Text, nullable=True)
    bairro = Column(Text, nullable=True)
    cep = Column(Text, nullable=True)
    cidade = Column(String, nullable=True)
    estado = Column(String, nullable=True)

    # ------------------ Administradora / contrato ------------------
    administradora = Column(String, nullable=False)
    cnpj_administradora = Column(Text, nullable=True)
    numero_contrato = Column(Text, nullable=True)

    # ------------------ Comarca (consolidada) ------------------
    comarca_escolhida_nome = Column(Text, nullable=True)
    comarca_escolhida_uf = Column(Text, nullable=True)

    # ------------------ Processo / metadados ------------------
    advogado_nome = Column(String, nullable=True)
    advogado_oab = Column(String, nullable=True)
    advogado_email = Column(String, nullable=True)
    advogado_telefone = Column(String, nullable=True)
    advogado_id = Column(Integer, ForeignKey("advogados.id", ondelete="SET NULL"), nullable=True)

    numero_processo = Column(String, nullable=True)
    nome_magistrado = Column(String, nullable=True)
    honorarios_percentual = Column(Float, nullable=True)
    resultado_processo = Column(String, nullable=True)
    tipo_pagamento = Column(String, nullable=True)

    # ------------------ Plano / encerramento ------------------
    total_parcelas_plano = Column(Integer, nullable=False)
    data_encerramento = Column(Date, nullable=False)

    # ------------------ Consolidados do extrato ------------------
    valor_total_pago_extrato = Column(Float, nullable=False)
    parcelas_pagas = Column(Integer, nullable=True)
    soma_valores_pagos = Column(Float, nullable=True)

    valor_pago_extrato = Column(Float, nullable=True)
    valor_pg_liquido = Column(Float, nullable=True)

    # ------------------ Detalhamento financeiro ------------------
    fundo_comum = Column(Float, nullable=True)
    fundo_reserva = Column(Float, nullable=True)
    seguros = Column(Float, nullable=True)
    multas = Column(Float, nullable=True)
    juros = Column(Float, nullable=True)
    adesao = Column(Float, nullable=True)
    outros_valores = Column(Float, nullable=True)

    valor_total_taxa_adm_cobrada = Column(Float, nullable=True)
    percentual_cobrada_calculado = Column(Float, nullable=True)
    taxa_adm_contratada_percentual = Column(Float, nullable=True)
    valor_taxa_adm_devida = Column(Float, nullable=True)

    # ------------------ Justiça / índices / juros ------------------
    indice_ate_hoje = Column(String, nullable=True)
    indice_ate_futuro = Column(String, nullable=True)

    inicio_juros = Column(Date, nullable=True)
    taxa_juros_percentual = Column(Float, nullable=True)

    justica_gratuita = Column(Boolean, default=False)
    tipo_justica = Column(Text, nullable=True)

    # ------------------ Cálculos/estados consolidados ------------------
    honorarios_hoje_adv = Column(Float, nullable=True)
    honorarios_hoje_emp = Column(Float, nullable=True)
    honorarios_futuro_adv = Column(Float, nullable=True)
    honorarios_futuro_emp = Column(Float, nullable=True)

    valor_corrigido_hoje = Column(Float, nullable=True)
    valor_corrigido_futuro = Column(Float, nullable=True)
    liquido_hoje = Column(Float, nullable=True)
    liquido_futuro = Column(Float, nullable=True)

    valor_credito = Column(Float, nullable=True)
    valor_sentenca = Column(Float, nullable=True)
    valor_acordo = Column(Float, nullable=True)  # ✅ novo (armazenar o valor do acordo)
    valor_acordo_inserido_em = Column(DateTime(timezone=True), nullable=True)
    valor_acordo_inserido_por_usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    resultado_acordo_em = Column(DateTime(timezone=True), nullable=True)  # quando resultado_processo foi trocado para "acordo" pela 1ª vez
    resultado_acordo_por_usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    data_recebimento_acordo = Column(Date, nullable=True)
    comprovante_recebimento_acordo_url = Column(String, nullable=True)
    ganho_sucumbencia = Column(Float, nullable=True)
    perda_sucumbencia = Column(Float, nullable=True)
    prejuizo = Column(Float, nullable=True)

    valor_causa_opcao = Column(String, nullable=True)
    valor_causa = Column(Float, nullable=True)

    # ------------------ Documentos / uploads ------------------
    extrato_pdf_url = Column(String, nullable=True)
    contrato_url = Column(String, nullable=True)
    procuracao_url = Column(String, nullable=True)
    termo_acordo_pdf_url = Column(String, nullable=True)
    sentenca_pdf_url = Column(String, nullable=True)

    contrato_assinado_url = Column(String, nullable=True)
    procuracao_assinada_url = Column(String, nullable=True)
    comprovante_renda_url = Column(String, nullable=True)
    comprovante_endereco_url = Column(String, nullable=True)
    documento_identidade_url = Column(String, nullable=True)
    outros_anexos_url = Column(String, nullable=True)  # Para anexos diversos

    # ------------------ ZapSign ------------------
    zapsign_bundle_id = Column(String, nullable=True)
    zapsign_contrato_id = Column(String, nullable=True)
    zapsign_procuracao_id = Column(String, nullable=True)
    zapsign_links = Column(SQLITE_JSON, nullable=True)
    zapsign_signed_files = Column(SQLITE_JSON, nullable=True)
    zapsign_status = Column(String, nullable=True)
    zapsign_signed_at = Column(DateTime(timezone=True), nullable=True)

    # ------------------ Status / observações / extras ------------------
    status_documento = Column(String, nullable=True)
    observacoes = Column(Text, nullable=True)
    extras = Column(SQLITE_JSON, nullable=True)

    # ------------------ Auditoria ------------------
    gerado_por_usuario_id = Column(Integer, nullable=True)
    enviado_por_usuario_id = Column(Integer, nullable=True)
    enviado_em = Column(DateTime(timezone=True), nullable=True)

    # ✅ passar a gravar no fuso de São Paulo (timezone-aware)
    criado_em = Column(DateTime(timezone=True), default=now_sp, nullable=False)
    atualizado_em = Column(DateTime(timezone=True), default=now_sp, onupdate=now_sp, nullable=False)

    # Campos legados que existem na tabela
    created_at = Column(Text, nullable=True)
    updated_at = Column(Text, nullable=True)
    data_exportacao = Column(DateTime(timezone=True), nullable=True)

    # ------------------ Relacionamentos ------------------
    parcelas = relationship(
        "ParcelaExtrato",
        back_populates="extrato",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    custas = relationship(
        "CustaExtrato",
        back_populates="extrato",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    anexos = relationship(
        "AnexoExtrato",
        back_populates="extrato",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Índice único (usuario_id + grupo + cota)
    __table_args__ = (
        Index("ux_extratos_usuario_grupo_cota", "usuario_id", "grupo", "cota", unique=True),
    )

    def __repr__(self):
        return f"<Extrato(grupo={self.grupo}, cota={self.cota}, cliente={self.nome_cliente})>"
