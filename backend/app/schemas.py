from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import date, datetime

# =========================
# Usuário / Autenticação
# =========================

class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    senha: str


class UsuarioLogin(BaseModel):
    email: EmailStr
    senha: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginInput(BaseModel):
    email: EmailStr
    senha: str


class UsuarioOut(BaseModel):
    nome: str
    email: EmailStr

    class Config:
        orm_mode = True


# =========================
# Extrato (Schemas)
# =========================
# Regras aplicadas:
# - REMOVIDO: taxa_adm_percentual
# - REMOVIDO: comarca_cliente / comarca_administradora
# - ADICIONADO: comarca_escolhida_nome, comarca_escolhida_uf
# - MANTIDO: pagamentos (JSON)

class ExtratoBase(BaseModel):
    grupo: str
    cota: str
    nome_cliente: str
    email_cliente: Optional[EmailStr] = None
    cpf_cnpj: str
    tipo_documento: str
    administradora: str
    tipo_justica: Optional[str] = None
    valor_corrigido_futuro: Optional[float] = None

    cidade: Optional[str] = None
    estado: Optional[str] = None
    telefone: Optional[str] = None
    rua: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None

    data_adesao: Optional[date] = None

    # Mantemos apenas a COMARCA ESCOLHIDA
    comarca_escolhida_nome: Optional[str] = None
    comarca_escolhida_uf: Optional[str] = None

    total_parcelas_plano: int
    data_encerramento: date
    valor_total_pago_extrato: float

    # Campo JSON agregado de pagamentos
    pagamentos: Optional[Dict[str, Any]] = None

    # Índices para correção (mantidos conforme o seu schema)
    indice_corrigido_hoje: Optional[str] = "TJMG"
    indice_corrigido_futuro: Optional[str] = "TJMG"

    class Config:
        orm_mode = True
        extra = "ignore"   # ignora chaves antigas que ainda venham do frontend


class ExtratoCreate(ExtratoBase):
    """Schema de criação; herda de ExtratoBase."""
    pass


class ExtratoUpdate(BaseModel):
    # Todos opcionais para PATCH/PUT parcial
    grupo: Optional[str] = None
    cota: Optional[str] = None
    nome_cliente: Optional[str] = None
    email_cliente: Optional[EmailStr] = None
    cpf_cnpj: Optional[str] = None
    tipo_documento: Optional[str] = None
    administradora: Optional[str] = None

    cidade: Optional[str] = None
    estado: Optional[str] = None
    telefone: Optional[str] = None
    rua: Optional[str] = None
    numero: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None

    data_adesao: Optional[date] = None

    comarca_escolhida_nome: Optional[str] = None
    comarca_escolhida_uf: Optional[str] = None

    total_parcelas_plano: Optional[int] = None
    data_encerramento: Optional[date] = None
    valor_total_pago_extrato: Optional[float] = None

    pagamentos: Optional[Dict[str, Any]] = None

    indice_corrigido_hoje: Optional[str] = None
    indice_corrigido_futuro: Optional[str] = None

    class Config:
        orm_mode = True
        extra = "ignore"


class ExtratoOut(ExtratoBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True
        extra = "ignore"


# =========================
# Documentos / ZapSign
# =========================

class DocumentoURLRequest(BaseModel):
    nome_cliente: str
    telefone_cliente: str
    pdf1: str
    pdf2: str


class EnvioZapSignInput(BaseModel):
    extrato_id: int
    contrato_pdf: str
    procuracao_pdf: str
