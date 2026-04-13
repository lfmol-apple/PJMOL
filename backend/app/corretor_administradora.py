# -*- coding: utf-8 -*-
"""
Corretor Automático de Administradora
Corrige nome e CNPJ da administradora usando o arquivo de referência
"""

import json
import re
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

class CorretorAdministradora:
    """Corrige automaticamente dados de administradora"""
    
    def __init__(self):
        self.arquivo_administradoras = Path("app/dados/administradoras_nova.json")
        self.administradoras = self._carregar_administradoras()
        self.cache_similaridade = {}
    
    def _carregar_administradoras(self) -> Dict[str, Dict[str, str]]:
        """Carrega lista de administradoras do arquivo"""
        try:
            with open(self.arquivo_administradoras, 'r', encoding='utf-8') as f:
                dados = json.load(f)
                logger.info(f"📂 {len(dados)} administradoras carregadas")
                return dados
        except Exception as e:
            logger.error(f"Erro ao carregar administradoras: {e}")
            return {}
    
    def corrigir_administradora(self, nome_extraido: str, cnpj_extraido: Optional[str] = None) -> Dict[str, any]:
        """
        Corrige nome e CNPJ da administradora
        
        Args:
            nome_extraido: Nome extraído do PDF
            cnpj_extraido: CNPJ extraído do PDF (opcional)
        
        Returns:
            Dict com nome correto, CNPJ, CEP e grau de confiança
        """
        if not nome_extraido:
            return {"corrigido": False, "motivo": "Nome vazio"}
        
        # 1. Se temos CNPJ, busca exata por CNPJ
        if cnpj_extraido:
            cnpj_limpo = re.sub(r'[^\d]', '', cnpj_extraido)
            resultado = self._buscar_por_cnpj(cnpj_limpo)
            if resultado:
                logger.info(f"✅ Administradora encontrada por CNPJ: {resultado['nome']}")
                return resultado
        
        # 2. Busca por similaridade de nome
        resultado = self._buscar_por_nome(nome_extraido)
        if resultado and resultado['confianca'] >= 0.75:
            logger.info(f"✅ Administradora encontrada por nome (confiança {resultado['confianca']:.0%}): {resultado['nome']}")
            return resultado
        
        # 3. Busca fuzzy (mais permissiva)
        resultado = self._buscar_fuzzy(nome_extraido)
        if resultado and resultado['confianca'] >= 0.60:
            logger.warning(f"⚠️ Administradora encontrada com baixa confiança ({resultado['confianca']:.0%}): {resultado['nome']}")
            return resultado
        
        logger.warning(f"❌ Administradora não encontrada: '{nome_extraido}'")
        return {
            "corrigido": False,
            "motivo": "Não encontrada no cadastro",
            "nome_original": nome_extraido,
            "cnpj_original": cnpj_extraido
        }
    
    def _buscar_por_cnpj(self, cnpj: str) -> Optional[Dict[str, any]]:
        """Busca administradora por CNPJ"""
        cnpj_formatado = self._formatar_cnpj(cnpj)
        
        for nome, dados in self.administradoras.items():
            if dados.get("cnpj") == cnpj_formatado:
                return {
                    "corrigido": True,
                    "nome": nome,
                    "cnpj": dados["cnpj"],
                    "cep": dados.get("cep"),
                    "confianca": 1.0,
                    "metodo": "cnpj_exato"
                }
        
        return None
    
    def _buscar_por_nome(self, nome: str) -> Optional[Dict[str, any]]:
        """Busca administradora por nome com normalização"""
        nome_normalizado = self._normalizar_nome(nome)
        
        melhor_match = None
        maior_confianca = 0
        
        for nome_cadastro, dados in self.administradoras.items():
            nome_cadastro_normalizado = self._normalizar_nome(nome_cadastro)
            
            # Match exato
            if nome_normalizado == nome_cadastro_normalizado:
                return {
                    "corrigido": True,
                    "nome": nome_cadastro,
                    "cnpj": dados["cnpj"],
                    "cep": dados.get("cep"),
                    "confianca": 1.0,
                    "metodo": "nome_exato"
                }
            
            # Verifica se um contém o outro
            if nome_normalizado in nome_cadastro_normalizado or nome_cadastro_normalizado in nome_normalizado:
                confianca = 0.9
                if confianca > maior_confianca:
                    maior_confianca = confianca
                    melhor_match = {
                        "corrigido": True,
                        "nome": nome_cadastro,
                        "cnpj": dados["cnpj"],
                        "cep": dados.get("cep"),
                        "confianca": confianca,
                        "metodo": "nome_contido"
                    }
        
        return melhor_match
    
    def _buscar_fuzzy(self, nome: str) -> Optional[Dict[str, any]]:
        """Busca fuzzy com similaridade de strings"""
        nome_normalizado = self._normalizar_nome(nome)
        
        melhor_match = None
        maior_similaridade = 0
        
        for nome_cadastro, dados in self.administradoras.items():
            nome_cadastro_normalizado = self._normalizar_nome(nome_cadastro)
            
            # Calcula similaridade
            similaridade = SequenceMatcher(None, nome_normalizado, nome_cadastro_normalizado).ratio()
            
            if similaridade > maior_similaridade:
                maior_similaridade = similaridade
                melhor_match = {
                    "corrigido": True,
                    "nome": nome_cadastro,
                    "cnpj": dados["cnpj"],
                    "cep": dados.get("cep"),
                    "confianca": similaridade,
                    "metodo": "fuzzy"
                }
        
        return melhor_match if maior_similaridade >= 0.60 else None
    
    def _normalizar_nome(self, nome: str) -> str:
        """Normaliza nome para comparação"""
        if not nome:
            return ""
        
        # Remove acentos
        nome = nome.upper()
        nome = re.sub(r'[ÁÀÂÃ]', 'A', nome)
        nome = re.sub(r'[ÉÈÊ]', 'E', nome)
        nome = re.sub(r'[ÍÌÎ]', 'I', nome)
        nome = re.sub(r'[ÓÒÔÕ]', 'O', nome)
        nome = re.sub(r'[ÚÙÛ]', 'U', nome)
        nome = re.sub(r'[Ç]', 'C', nome)
        
        # Remove pontuação e espaços extras
        nome = re.sub(r'[^\w\s]', ' ', nome)
        nome = re.sub(r'\s+', ' ', nome).strip()
        
        # Remove palavras comuns
        palavras_remover = ['ADMINISTRADORA', 'DE', 'CONSORCIO', 'CONSORCIOS', 'LTDA', 'S/A', 'SA']
        for palavra in palavras_remover:
            nome = nome.replace(palavra, '')
        
        nome = re.sub(r'\s+', ' ', nome).strip()
        
        return nome
    
    def _formatar_cnpj(self, cnpj: str) -> str:
        """Formata CNPJ no padrão 00.000.000/0000-00"""
        cnpj = re.sub(r'[^\d]', '', cnpj)
        if len(cnpj) == 14:
            return f"{cnpj[:2]}.{cnpj[2:5]}.{cnpj[5:8]}/{cnpj[8:12]}-{cnpj[12:]}"
        return cnpj
    
    def validar_cnpj(self, cnpj: str) -> bool:
        """Valida CNPJ"""
        cnpj = re.sub(r'[^\d]', '', cnpj)
        
        if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
            return False
        
        # Calcula dígitos verificadores
        def calcular_digito(cnpj_parcial, pesos):
            soma = sum(int(cnpj_parcial[i]) * pesos[i] for i in range(len(pesos)))
            resto = soma % 11
            return 0 if resto < 2 else 11 - resto
        
        pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        
        digito1 = calcular_digito(cnpj[:12], pesos1)
        digito2 = calcular_digito(cnpj[:13], pesos2)
        
        return cnpj[-2:] == f"{digito1}{digito2}"


# Instância global
corretor_administradora = CorretorAdministradora()
