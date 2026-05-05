# -*- coding: utf-8 -*-
"""
API de Aprendizado por Correção
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from app.aprendizado.correcao_automatica import aprendizado_correcao

router = APIRouter(prefix="/api/aprendizado", tags=["aprendizado"])

class CorrecaoRequest(BaseModel):
    administradora: str
    campo: str
    valor_original: str
    valor_corrigido: str
    contexto: Optional[Dict[str, Any]] = None

class AplicarCorrecoesRequest(BaseModel):
    administradora: str
    dados_extraidos: Dict[str, Any]

@router.post("/capturar-correcao")
async def capturar_correcao(request: CorrecaoRequest):
    """
    Captura uma correção feita pelo usuário e aprende com ela
    """
    try:
        mensagem = aprendizado_correcao.capturar_correcao(
            administradora=request.administradora,
            campo=request.campo,
            valor_original=request.valor_original,
            valor_corrigido=request.valor_corrigido,
            contexto=request.contexto
        )
        
        return {
            "sucesso": True,
            "mensagem": mensagem,
            "detalhes": f"Correção capturada para campo '{request.campo}'"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao capturar correção: {str(e)}")

@router.post("/aplicar-correcoes")
async def aplicar_correcoes(request: AplicarCorrecoesRequest):
    """
    Aplica automaticamente correções aprendidas nos dados extraídos
    """
    try:
        resultado = aprendizado_correcao.aplicar_correcoes_aprendidas(
            administradora=request.administradora,
            dados_extraidos=request.dados_extraidos
        )
        
        return {
            "sucesso": True,
            "correcoes_aplicadas": resultado["correcoes"],
            "mensagens_aprendizado": resultado["mensagens"],
            "total_correcoes": len(resultado["correcoes"])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao aplicar correções: {str(e)}")

@router.get("/estatisticas/{administradora}")
async def estatisticas_aprendizado(administradora: str):
    """
    Retorna estatísticas do aprendizado para uma administradora
    """
    try:
        from pathlib import Path
        arquivo_correcoes = Path(f"app/aprendizado/correcoes/{aprendizado_correcao._slug(administradora)}.json")
        
        if not arquivo_correcoes.exists():
            return {
                "administradora": administradora,
                "total_correcoes": 0,
                "campos_aprendidos": 0,
                "correcoes_por_campo": {}
            }
        
        correcoes = aprendizado_correcao._carregar_correcoes(arquivo_correcoes)
        total_correcoes = sum(len(lista) for lista in correcoes.values())
        campos_aprendidos = len(correcoes)
        
        correcoes_por_campo = {}
        for campo, lista in correcoes.items():
            aplicacoes_automaticas = sum(c.get("aplicado_automaticamente", 0) for c in lista)
            correcoes_por_campo[campo] = {
                "total_correcoes": len(lista),
                "aplicacoes_automaticas": aplicacoes_automaticas
            }
        
        return {
            "administradora": administradora,
            "total_correcoes": total_correcoes,
            "campos_aprendidos": campos_aprendidos,
            "correcoes_por_campo": correcoes_por_campo
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter estatísticas: {str(e)}")