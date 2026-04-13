# -*- coding: utf-8 -*-
"""
Busca Automática de Dados de Pessoa Jurídica
Busca CNPJ, endereço, razão social na internet com alta precisão
"""

import requests
import re
import logging
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class BuscaDadosPJ:
    """Busca dados de pessoa jurídica em APIs públicas"""
    
    def __init__(self):
        self.timeout = 10
        self.apis_cnpj = [
            "https://brasilapi.com.br/api/cnpj/v1/",
            "https://receitaws.com.br/v1/cnpj/"
        ]
    
    def buscar_por_cnpj(self, cnpj: str) -> Optional[Dict[str, Any]]:
        """
        Busca dados completos de uma empresa pelo CNPJ
        
        Args:
            cnpj: CNPJ da empresa (com ou sem formatação)
        
        Returns:
            Dict com dados da empresa ou None se não encontrar
        """
        cnpj_limpo = re.sub(r'[^\d]', '', cnpj)
        
        if len(cnpj_limpo) != 14:
            logger.warning(f"CNPJ inválido: {cnpj}")
            return None
        
        # Tenta BrasilAPI primeiro (mais rápida)
        logger.info(f"🔍 Buscando dados de CNPJ {cnpj_limpo} na BrasilAPI...")
        dados = self._buscar_brasilapi(cnpj_limpo)
        
        if dados:
            return self._padronizar_dados(dados, "brasilapi")
        
        # Se falhar, tenta ReceitaWS
        logger.info(f"🔍 Buscando dados de CNPJ {cnpj_limpo} na ReceitaWS...")
        dados = self._buscar_receitaws(cnpj_limpo)
        
        if dados:
            return self._padronizar_dados(dados, "receitaws")
        
        logger.warning(f"❌ Não foi possível buscar dados do CNPJ {cnpj}")
        return None
    
    def buscar_por_razao_social(self, razao_social: str, uf: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Busca CNPJ e dados de uma empresa pela razão social
        
        Args:
            razao_social: Nome da empresa
            uf: Estado (opcional, para filtrar)
        
        Returns:
            Dict com dados da empresa ou None
        """
        logger.info(f"🔍 Buscando CNPJ de '{razao_social}'...")
        
        # TODO: Implementar busca por razão social
        # Atualmente as APIs públicas não oferecem busca reversa
        # Pode usar Google Custom Search API ou scraping (cuidado com termos de uso)
        
        logger.warning("Busca por razão social ainda não implementada")
        return None
    
    def _buscar_brasilapi(self, cnpj: str) -> Optional[Dict[str, Any]]:
        """Busca na BrasilAPI"""
        try:
            url = f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
            response = requests.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            
            logger.warning(f"BrasilAPI retornou status {response.status_code}")
            return None
            
        except Exception as e:
            logger.warning(f"Erro na BrasilAPI: {e}")
            return None
    
    def _buscar_receitaws(self, cnpj: str) -> Optional[Dict[str, Any]]:
        """Busca na ReceitaWS"""
        try:
            url = f"https://receitaws.com.br/v1/cnpj/{cnpj}"
            response = requests.get(url, timeout=self.timeout)
            
            if response.status_code == 200:
                return response.json()
            
            logger.warning(f"ReceitaWS retornou status {response.status_code}")
            return None
            
        except Exception as e:
            logger.warning(f"Erro na ReceitaWS: {e}")
            return None
    
    def _padronizar_dados(self, dados: Dict[str, Any], fonte: str) -> Dict[str, Any]:
        """
        Padroniza dados de diferentes APIs para formato único
        
        Args:
            dados: Dados retornados pela API
            fonte: Nome da API (brasilapi ou receitaws)
        
        Returns:
            Dict padronizado
        """
        if fonte == "brasilapi":
            return {
                "cnpj": dados.get("cnpj"),
                "razao_social": dados.get("razao_social"),
                "nome_fantasia": dados.get("nome_fantasia"),
                "situacao": dados.get("descricao_situacao_cadastral"),
                "data_situacao": dados.get("data_situacao_cadastral"),
                "endereco": {
                    "cep": dados.get("cep"),
                    "logradouro": dados.get("descricao_tipo_logradouro", "") + " " + dados.get("logradouro", ""),
                    "numero": dados.get("numero"),
                    "complemento": dados.get("complemento"),
                    "bairro": dados.get("bairro"),
                    "cidade": dados.get("municipio"),
                    "uf": dados.get("uf"),
                },
                "telefone": self._formatar_telefone(dados.get("ddd_telefone_1")),
                "email": dados.get("email"),
                "natureza_juridica": dados.get("descricao_natureza_juridica"),
                "porte": dados.get("porte"),
                "capital_social": dados.get("capital_social"),
                "fonte": "BrasilAPI",
                "data_busca": datetime.now().isoformat()
            }
        
        elif fonte == "receitaws":
            return {
                "cnpj": dados.get("cnpj"),
                "razao_social": dados.get("nome"),
                "nome_fantasia": dados.get("fantasia"),
                "situacao": dados.get("situacao"),
                "data_situacao": dados.get("data_situacao"),
                "endereco": {
                    "cep": dados.get("cep"),
                    "logradouro": dados.get("logradouro"),
                    "numero": dados.get("numero"),
                    "complemento": dados.get("complemento"),
                    "bairro": dados.get("bairro"),
                    "cidade": dados.get("municipio"),
                    "uf": dados.get("uf"),
                },
                "telefone": dados.get("telefone"),
                "email": dados.get("email"),
                "natureza_juridica": dados.get("natureza_juridica"),
                "porte": dados.get("porte"),
                "capital_social": dados.get("capital_social"),
                "fonte": "ReceitaWS",
                "data_busca": datetime.now().isoformat()
            }
        
        return dados
    
    def _formatar_telefone(self, telefone: Optional[str]) -> Optional[str]:
        """Formata telefone"""
        if not telefone:
            return None
        
        # Remove caracteres não numéricos
        numeros = re.sub(r'[^\d]', '', telefone)
        
        if len(numeros) == 10:
            return f"({numeros[:2]}) {numeros[2:6]}-{numeros[6:]}"
        elif len(numeros) == 11:
            return f"({numeros[:2]}) {numeros[2:7]}-{numeros[7:]}"
        
        return telefone
    
    def validar_cnpj(self, cnpj: str) -> bool:
        """
        Valida CNPJ usando algoritmo oficial
        
        Args:
            cnpj: CNPJ para validar
        
        Returns:
            True se válido, False caso contrário
        """
        cnpj = re.sub(r'[^\d]', '', cnpj)
        
        if len(cnpj) != 14:
            return False
        
        # Verifica CNPJs inválidos conhecidos
        if cnpj == cnpj[0] * 14:
            return False
        
        # Calcula primeiro dígito verificador
        soma = 0
        peso = 5
        for i in range(12):
            soma += int(cnpj[i]) * peso
            peso -= 1
            if peso < 2:
                peso = 9
        
        digito1 = 11 - (soma % 11)
        if digito1 >= 10:
            digito1 = 0
        
        if int(cnpj[12]) != digito1:
            return False
        
        # Calcula segundo dígito verificador
        soma = 0
        peso = 6
        for i in range(13):
            soma += int(cnpj[i]) * peso
            peso -= 1
            if peso < 2:
                peso = 9
        
        digito2 = 11 - (soma % 11)
        if digito2 >= 10:
            digito2 = 0
        
        if int(cnpj[13]) != digito2:
            return False
        
        return True


# Instância global
busca_dados_pj = BuscaDadosPJ()
