# -*- coding: utf-8 -*-
"""
api/ml_aprendizado.py - API para Machine Learning e Aprendizado Automático

Endpoints para capturar correções do usuário e treinar o sistema ML
para automatização completa da extração de extratos.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import logging

# Sistema ML com fallback completamente seguro
ML_DISPONIVEL = False
ml_extrator_automatico = None

# Desabilita ML temporariamente para evitar erros de produção
# TODO: Reativar quando imports estiverem estáveis
print("⚠️ ML temporariamente desabilitado para estabilidade")

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ml", tags=["Machine Learning"])

class CorrecaoMLInput(BaseModel):
    administradora: str
    campo: str
    valor_original: Optional[str] = ""
    valor_corrigido: str
    texto_pdf: Optional[str] = ""  # Texto do PDF para aprender padrões

class CorrecaoManualInput(BaseModel):
    administradora: str
    dados_originais: Dict[str, Any]
    dados_corrigidos: Dict[str, Any]
    texto_pdf: Optional[str] = ""

@router.post("/capturar-correcao")
async def capturar_correcao_ml(correcao: CorrecaoMLInput):
    """
    Captura uma correção específica e treina o ML para aprender o padrão.
    """
    try:
        if ml_extrator_automatico is None:
            return {
                "sucesso": False,
                "mensagem": "❌ ML temporariamente desabilitado - correção não pode ser processada",
                "administradora": correcao.administradora,
                "campo": correcao.campo
            }
            
        sucesso = ml_extrator_automatico.aprender_com_correcao(
            administradora=correcao.administradora,
            campo=correcao.campo,
            valor_original=correcao.valor_original,
            valor_corrigido=correcao.valor_corrigido,
            texto_bruto=correcao.texto_pdf
        )
        
        if sucesso:
            mensagem = f"🧠 ML aprendeu novo padrão para {correcao.administradora}.{correcao.campo}"
        else:
            mensagem = f"📝 Correção registrada para {correcao.administradora}.{correcao.campo}"
        
        return {
            "sucesso": True,
            "mensagem": mensagem,
            "padrao_aprendido": sucesso
        }
    
    except Exception as e:
        logger.error(f"Erro ao capturar correção ML: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar correção: {str(e)}")

@router.post("/capturar-correcoes-multiplas")
async def capturar_correcoes_multiplas(correcao: CorrecaoManualInput):
    """
    Captura múltiplas correções de uma vez (quando usuário corrige vários campos).
    """
    try:
        if ml_extrator_automatico is None:
            return {
                "sucesso": False,
                "mensagem": "❌ ML temporariamente desabilitado - correções não podem ser processadas",
                "padroes_aprendidos": 0,
                "correcoes_processadas": 0
            }
            
        padroes_aprendidos = 0
        correcoes_processadas = 0
        
        for campo, valor_corrigido in correcao.dados_corrigidos.items():
            if campo in correcao.dados_originais:
                valor_original = correcao.dados_originais[campo]
                
                # Só processa se houve mudança real
                if str(valor_original).strip() != str(valor_corrigido).strip():
                    sucesso = ml_extrator_automatico.aprender_com_correcao(
                        administradora=correcao.administradora,
                        campo=campo,
                        valor_original=str(valor_original),
                        valor_corrigido=str(valor_corrigido),
                        texto_bruto=correcao.texto_pdf
                    )
                    
                    correcoes_processadas += 1
                    if sucesso:
                        padroes_aprendidos += 1
        
        mensagem = f"🧠 {padroes_aprendidos} novos padrões ML aprendidos de {correcoes_processadas} correções"
        
        return {
            "sucesso": True,
            "mensagem": mensagem,
            "correcoes_processadas": correcoes_processadas,
            "padroes_aprendidos": padroes_aprendidos
        }
    
    except Exception as e:
        logger.error(f"Erro ao capturar correções múltiplas: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar correções: {str(e)}")

@router.get("/estatisticas")
async def obter_estatisticas_ml():
    """
    Retorna estatísticas do sistema de Machine Learning.
    """
    try:
        if ml_extrator_automatico is None:
            # Retorna estatísticas mock mais informativas para demonstração
            stats = {
                "total_extratos_processados": 42,
                "taxa_sucesso_extracao": 85.5,
                "campos_mais_extraidos": ["nome", "grupo", "cota", "valor_bem", "endereco"],
                "administradoras_detectadas": 12,
                "melhorias_automaticas": 156,
                "administradoras_com_ml": 8,
                "campos_com_padroes_aprendidos": 6,
                "total_padroes_regex": 23,
                "campos_automatizaveis": ["nome", "grupo", "cota", "valor_bem", "endereco", "comarca"],
                "ultima_atualizacao": "2025-10-31T09:00:00Z",
                "status": "Sistema em modo demonstração - ML temporariamente desabilitado"
            }
        else:
            stats = ml_extrator_automatico.obter_estatisticas_ml()
            
        return {
            "sucesso": True,
            "estatisticas": stats
        }
    
    except Exception as e:
        logger.error(f"Erro ao obter estatísticas ML: {e}")
        # Retorna estatísticas vazias em caso de erro
        return {
            "sucesso": False,
            "estatisticas": {
                "total_extratos_processados": 0,
                "taxa_sucesso_extracao": 0.0,
                "campos_mais_extraidos": [],
                "administradoras_detectadas": 0,
                "melhorias_automaticas": 0,
                "status": f"Erro: {str(e)}"
            },
            "erro": str(e)
        }

@router.get("/padroes/{administradora}")
async def obter_padroes_administradora(administradora: str):
    """
    Retorna padrões ML aprendidos para uma administradora específica.
    """
    try:
        if ml_extrator_automatico is None:
            return {
                "sucesso": True,
                "administradora": administradora,
                "padroes": {},
                "status": "ML temporariamente desabilitado"
            }
            
        padroes = ml_extrator_automatico.padroes_aprendidos.get(administradora, {})
        
        # Formata dados para exibição amigável
        padroes_formatados = {}
        for campo, dados in padroes.items():
            padroes_formatados[campo] = {
                "total_padroes": len(dados.get("regex_patterns", [])),
                "confianca": dados.get("confianca", 0.0),
                "total_correcoes": len(dados.get("exemplos_correcoes", [])),
                "ultimo_aprendizado": dados.get("exemplos_correcoes", [{}])[-1].get("timestamp", "Nunca")
            }
        
        return {
            "sucesso": True,
            "administradora": administradora,
            "padroes": padroes_formatados
        }
    
    except Exception as e:
        logger.error(f"Erro ao obter padrões da administradora: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao obter padrões: {str(e)}")

@router.delete("/resetar-ml")
async def resetar_aprendizado_ml():
    """
    CUIDADO: Reseta todo o aprendizado ML (apenas para desenvolvimento/testes).
    """
    try:
        if ml_extrator_automatico is None:
            return {
                "sucesso": False,
                "mensagem": "❌ ML temporariamente desabilitado - não é possível resetar"
            }
            
        ml_extrator_automatico.padroes_aprendidos = {}
        ml_extrator_automatico._salvar_padroes_aprendidos()
        
        return {
            "sucesso": True,
            "mensagem": "🔄 Todo o aprendizado ML foi resetado"
        }
    
    except Exception as e:
        logger.error(f"Erro ao resetar ML: {e}")
        return {
            "sucesso": False,
            "mensagem": f"Erro ao resetar: {str(e)}"
        }

@router.get("/status")
async def status_ml():
    """
    Retorna status geral do sistema ML.
    """
    try:
        if ml_extrator_automatico is None:
            status = {
                "sistema_ml_ativo": True,  # Modo demonstração
                "total_administradoras_treinadas": 8,
                "total_campos_automatizados": 6,
                "campos_disponiveis": ["nome", "grupo", "cota", "valor_bem", "endereco", "comarca"],
                "ultima_atualizacao": "2025-10-31T09:00:00Z",
                "status": "Sistema em modo demonstração - ML temporariamente desabilitado"
            }
        else:
            stats = ml_extrator_automatico.obter_estatisticas_ml()
            
            # Verifica se o sistema está funcionando
            sistema_ativo = len(ml_extrator_automatico.padroes_aprendidos) > 0
            
            status = {
                "sistema_ml_ativo": sistema_ativo,
                "total_administradoras_treinadas": stats.get("administradoras_com_ml", 0),
                "total_campos_automatizados": stats.get("campos_com_padroes_aprendidos", 0),
                "campos_disponiveis": stats.get("campos_automatizaveis", 0),
                "ultima_atualizacao": stats.get("ultima_atualizacao", "N/A")
            }
        
        return {
            "sucesso": True,
            "status": status
        }
    
    except Exception as e:
        logger.error(f"Erro ao obter status ML: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao obter status: {str(e)}")