"""
API para estatísticas e gerenciamento do ML de Templates
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
import logging

from app.ml_templates_administradoras import extrator_templates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml-templates", tags=["ML Templates"])


@router.get("/estatisticas")
async def get_estatisticas_ml() -> Dict[str, Any]:
    """
    Retorna estatísticas dos templates aprendidos pelo ML
    
    Returns:
        - total_administradoras: número total de administradoras com templates
        - administradoras: lista com detalhes de cada administradora
    """
    try:
        stats = extrator_templates.get_estatisticas()
        return {
            "sucesso": True,
            "dados": stats
        }
    except Exception as e:
        logger.error(f"Erro ao buscar estatísticas ML: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/template/{administradora}")
async def get_template_administradora(administradora: str) -> Dict[str, Any]:
    """
    Retorna detalhes do template de uma administradora específica
    """
    try:
        admin_key = administradora.upper().strip()
        
        if admin_key not in extrator_templates.templates:
            return {
                "sucesso": False,
                "mensagem": f"Nenhum template encontrado para {administradora}"
            }
        
        template = extrator_templates.templates[admin_key]
        
        return {
            "sucesso": True,
            "administradora": template["nome"],
            "extratos_processados": template["total_extratos_processados"],
            "ultima_atualizacao": template["ultima_atualizacao"],
            "padroes": {
                "parcelas": len(template["padroes"]["parcelas"]),
                "valores": len(template["padroes"]["valores"]),
                "estrutura_tabela": template["padroes"].get("estrutura_tabela", {})
            }
        }
    except Exception as e:
        logger.error(f"Erro ao buscar template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/template/{administradora}")
async def limpar_template_administradora(administradora: str) -> Dict[str, Any]:
    """
    Remove o template de uma administradora específica
    """
    try:
        admin_key = administradora.upper().strip()
        
        if admin_key in extrator_templates.templates:
            del extrator_templates.templates[admin_key]
            extrator_templates._salvar_templates()
            
            return {
                "sucesso": True,
                "mensagem": f"Template de {administradora} removido com sucesso"
            }
        else:
            return {
                "sucesso": False,
                "mensagem": f"Nenhum template encontrado para {administradora}"
            }
    except Exception as e:
        logger.error(f"Erro ao limpar template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/resetar")
async def resetar_todos_templates() -> Dict[str, Any]:
    """
    Remove todos os templates aprendidos (CUIDADO!)
    """
    try:
        total_antes = len(extrator_templates.templates)
        extrator_templates.templates = {}
        extrator_templates._salvar_templates()
        
        return {
            "sucesso": True,
            "mensagem": f"Todos os {total_antes} templates foram removidos"
        }
    except Exception as e:
        logger.error(f"Erro ao resetar templates: {e}")
        raise HTTPException(status_code=500, detail=str(e))
