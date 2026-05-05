# -*- coding: utf-8 -*-
"""
API de Aprendizado por Correção
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import os
from pathlib import Path

router = APIRouter(prefix="/aprendizado", tags=["aprendizado"])

CORRECOES_DIR = Path(__file__).resolve().parent.parent / "aprendizado" / "correcoes"
CORRECOES_DIR.mkdir(parents=True, exist_ok=True)


class CorrecaoRequest(BaseModel):
    administradora: str
    campo: str
    valor_original: str
    valor_corrigido: str
    contexto: Optional[Dict[str, Any]] = None

class AplicarCorrecoesRequest(BaseModel):
    administradora: str
    dados_extraidos: Dict[str, Any]


def _slug(texto: str) -> str:
    import re
    return re.sub(r"[^a-z0-9_]", "_", texto.lower().strip())


def _carregar(administradora: str) -> dict:
    arquivo = CORRECOES_DIR / f"{_slug(administradora)}.json"
    if arquivo.exists():
        try:
            return json.loads(arquivo.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _salvar(administradora: str, dados: dict):
    arquivo = CORRECOES_DIR / f"{_slug(administradora)}.json"
    arquivo.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


@router.post("/capturar-correcao")
async def capturar_correcao(request: CorrecaoRequest):
    """Captura uma correção feita pelo usuário e aprende com ela."""
    try:
        from datetime import datetime
        dados = _carregar(request.administradora)
        if request.campo not in dados:
            dados[request.campo] = []
        dados[request.campo].append({
            "original": request.valor_original,
            "corrigido": request.valor_corrigido,
            "contexto": request.contexto,
            "timestamp": datetime.utcnow().isoformat(),
        })
        _salvar(request.administradora, dados)
        return {
            "sucesso": True,
            "mensagem": f"Correção registrada para '{request.campo}'",
            "detalhes": f"Administradora: {request.administradora}",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao capturar correção: {str(e)}")


@router.post("/aplicar-correcoes")
async def aplicar_correcoes(request: AplicarCorrecoesRequest):
    """Aplica automaticamente correções aprendidas nos dados extraídos."""
    try:
        dados_correcoes = _carregar(request.administradora)
        correcoes_aplicadas: Dict[str, str] = {}
        mensagens: List[str] = []

        for campo, valor in request.dados_extraidos.items():
            if campo in dados_correcoes and isinstance(valor, str):
                for entrada in reversed(dados_correcoes[campo]):
                    if entrada.get("original") == valor:
                        correcoes_aplicadas[campo] = entrada["corrigido"]
                        mensagens.append(f"✅ Corrigido '{campo}': '{valor}' → '{entrada['corrigido']}'")
                        break

        return {
            "sucesso": True,
            "correcoes_aplicadas": correcoes_aplicadas,
            "mensagens_aprendizado": mensagens,
            "total_correcoes": len(correcoes_aplicadas),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao aplicar correções: {str(e)}")


@router.get("/estatisticas/{administradora}")
async def estatisticas_aprendizado(administradora: str):
    """Retorna estatísticas do aprendizado para uma administradora."""
    try:
        correcoes = _carregar(administradora)
        total = sum(len(v) for v in correcoes.values())
        return {
            "administradora": administradora,
            "total_correcoes": total,
            "campos_aprendidos": len(correcoes),
            "correcoes_por_campo": {
                campo: {"total_correcoes": len(lista)}
                for campo, lista in correcoes.items()
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter estatísticas: {str(e)}")