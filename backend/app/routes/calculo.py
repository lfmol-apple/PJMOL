# backend/app/routes/calculo.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from datetime import datetime

from app.calculos.config_calculo import ConfigCalculo, IndiceCorrecao
from app.calculos.calculos_valores_backend import calcular_valores_completos

router = APIRouter()

class Parcela(BaseModel):
    data_pagamento: date
    valor_pago: float
    tipo: str = "parcela"

class DadosBasicos(BaseModel):
    grupo: str
    cota: str
    nome_cliente: str
    cpf_cnpj: str
    tipo_documento: str
    taxa_adm_percentual: float
    total_parcelas_plano: int
    data_encerramento: str
    valor_total_pago_extrato: float
    administradora: str
    cep: Optional[str] = None
    cidade: Optional[str] = None
    estado: Optional[str] = None
    valor_corrigido: Optional[str] = None
    valor_futuro: Optional[str] = None

class ConfiguracaoInput(BaseModel):
    houve_sentenca: bool
    data_sentenca: Optional[date] = None
    indice_ate_sentenca: IndiceCorrecao
    usar_ipca_pos_tjmg: bool
    percentual_ipca_estimado: float
    aplicar_juros_mora: bool
    percentual_juros_mora_anual: float
    data_inicio_juros: Optional[date] = None
    percentual_honorarios: float
    outros_custos: float
    taxa_administracao_percentual_total: float

class CalculoInput(BaseModel):
    dados_basicos: DadosBasicos
    parcelas: List[Parcela]
    configuracao: ConfiguracaoInput

from datetime import datetime

def converter_iso_para_br(data_iso: str) -> str:
    try:
        dt = datetime.strptime(data_iso, "%Y-%m-%d")
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return data_iso

@router.post("/calcular")
def calcular_valores(input: CalculoInput):
    try:
        config = ConfigCalculo(
            houve_sentenca=input.configuracao.houve_sentenca,
            data_sentenca=input.configuracao.data_sentenca,
            indice_ate_sentenca=input.configuracao.indice_ate_sentenca,
            usar_ipca_pos_tjmg=input.configuracao.usar_ipca_pos_tjmg,
            percentual_ipca_estimado=input.configuracao.percentual_ipca_estimado,
            aplicar_juros_mora=input.configuracao.aplicar_juros_mora,
            percentual_juros_mora_anual=input.configuracao.percentual_juros_mora_anual,
            data_inicio_juros=input.configuracao.data_inicio_juros,
            percentual_honorarios=input.configuracao.percentual_honorarios,
            outros_custos=input.configuracao.outros_custos,
            taxa_administracao_percentual_total=input.configuracao.taxa_administracao_percentual_total,
            total_parcelas_plano=input.dados_basicos.total_parcelas_plano,
            estado=input.dados_basicos.estado or "",
        )

        resultado = calcular_valores_completos(
            parcelas=input.parcelas,
            dados_basicos=input.dados_basicos,
            config=config,
        )

        return resultado

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
