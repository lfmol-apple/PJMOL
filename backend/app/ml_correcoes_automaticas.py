# -*- coding: utf-8 -*-
"""
Sistema de Correções Automáticas Inteligentes
Aplica correções sem precisar de aprendizado prévio
"""

import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class CorrecaoAutomaticaInteligente:
    """
    Sistema que aplica correções óbvias automaticamente,
    sem precisar esperar o ML aprender.
    """
    
    def __init__(self):
        # Padrões conhecidos de erros comuns
        self.padroes_erros_conhecidos = {
            "timestamp_no_nome": r'\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2}',
            "data_no_nome": r'^\d{2}/\d{2}/\d{4}',
            "apenas_numeros_nome": r'^\d+$',
            "email_no_nome": r'@',
            "url_no_nome": r'https?://',
        }
        
        # Cidades sempre em Title Case
        self.cidades_brasil = self._carregar_cidades_brasil()
    
    def aplicar_correcoes_inteligentes(self, dados: Dict[str, Any]) -> Dict[str, Any]:
        """
        Aplica correções automáticas inteligentes sem precisar de ML.
        
        Returns:
            Dict com dados corrigidos e mensagens
        """
        dados_corrigidos = dados.copy()
        mensagens = []
        
        # 1. Corrige formatação de cidades (sempre Title Case)
        if "cidade" in dados_corrigidos and dados_corrigidos["cidade"]:
            cidade_original = dados_corrigidos["cidade"]
            cidade_corrigida = self._corrigir_cidade(cidade_original)
            
            if cidade_corrigida != cidade_original:
                dados_corrigidos["cidade"] = cidade_corrigida
                mensagens.append(f"🤖 Cidade formatada: {cidade_original} → {cidade_corrigida}")
        
        # 2. Detecta e corrige nome extraído errado
        campos_nome = ["nome", "nome_cliente", "consorciado"]
        for campo in campos_nome:
            if campo in dados_corrigidos and dados_corrigidos[campo]:
                nome_original = str(dados_corrigidos[campo])
                
                # Verifica se tem timestamp/data (erro comum)
                if self._eh_erro_extracao_nome(nome_original):
                    dados_corrigidos[campo] = ""  # Limpa para usuário preencher corretamente
                    mensagens.append(f"⚠️ Erro detectado em '{campo}': valor suspeito removido")
        
        # 3. Corrige estado (sempre maiúsculo, 2 letras)
        if "estado" in dados_corrigidos and dados_corrigidos["estado"]:
            estado_original = dados_corrigidos["estado"]
            estado_corrigido = self._corrigir_estado(estado_original)
            
            if estado_corrigido != estado_original:
                dados_corrigidos["estado"] = estado_corrigido
                mensagens.append(f"🤖 Estado formatado: {estado_original} → {estado_corrigido}")
        
        # 4. Corrige CEP (sempre 8 dígitos, sem hífen)
        campos_cep = ["cep", "administradora_cep"]
        for campo in campos_cep:
            if campo in dados_corrigidos and dados_corrigidos[campo]:
                cep_original = str(dados_corrigidos[campo])
                cep_corrigido = self._corrigir_cep(cep_original)
                
                if cep_corrigido != cep_original:
                    dados_corrigidos[campo] = cep_corrigido
                    mensagens.append(f"🤖 CEP formatado: {cep_original} → {cep_corrigido}")
        
        # 5. Corrige CNPJ (sempre 14 dígitos, sem formatação)
        campos_cnpj = ["cnpj", "cnpj_administradora", "cpf_cnpj"]
        for campo in campos_cnpj:
            if campo in dados_corrigidos and dados_corrigidos[campo]:
                doc_original = str(dados_corrigidos[campo])
                
                # Se parece com CNPJ (mais de 11 dígitos)
                apenas_digitos = re.sub(r'\D', '', doc_original)
                if len(apenas_digitos) >= 14:
                    doc_corrigido = self._corrigir_cnpj(doc_original)
                    
                    if doc_corrigido != doc_original:
                        dados_corrigidos[campo] = doc_corrigido
                        mensagens.append(f"🤖 CNPJ formatado: {campo}")
        
        # 6. Remove caracteres especiais de grupo/cota
        for campo in ["grupo", "cota"]:
            if campo in dados_corrigidos and dados_corrigidos[campo]:
                valor_original = str(dados_corrigidos[campo])
                valor_limpo = re.sub(r'[^\w\-]', '', valor_original)
                
                if valor_limpo != valor_original:
                    dados_corrigidos[campo] = valor_limpo
                    mensagens.append(f"🤖 {campo.title()} limpo: {valor_original} → {valor_limpo}")
        
        return {
            "dados": dados_corrigidos,
            "mensagens": mensagens,
            "correcoes_aplicadas": len(mensagens)
        }
    
    def _corrigir_cidade(self, cidade: str) -> str:
        """Corrige formatação de cidade para Title Case"""
        if not cidade:
            return cidade
        
        # Remove espaços extras
        cidade = cidade.strip()
        
        # Converte para Title Case (Primeira Letra Maiúscula)
        cidade_corrigida = cidade.title()
        
        # Exceções conhecidas
        excecoes = {
            "De": "de",
            "Do": "do",
            "Da": "da",
            "Das": "das",
            "Dos": "dos",
        }
        
        palavras = cidade_corrigida.split()
        palavras_corrigidas = []
        
        for i, palavra in enumerate(palavras):
            # Primeira palavra sempre maiúscula
            if i == 0:
                palavras_corrigidas.append(palavra)
            # Preposições em minúsculo
            elif palavra in excecoes:
                palavras_corrigidas.append(excecoes[palavra])
            else:
                palavras_corrigidas.append(palavra)
        
        return " ".join(palavras_corrigidas)
    
    def _eh_erro_extracao_nome(self, texto: str) -> bool:
        """Detecta se o nome extraído é na verdade um erro (timestamp, data, etc.)"""
        if not texto:
            return False
        
        # Verifica cada padrão de erro conhecido
        for padrao_nome, regex in self.padroes_erros_conhecidos.items():
            if re.search(regex, texto):
                logger.warning(f"⚠️ Erro detectado: {padrao_nome} em '{texto}'")
                return True
        
        # Se tem "Extrato", "Atualizado", etc (termos de sistema)
        termos_sistema = ["extrato", "atualizado", "gerado", "emitido", "página"]
        if any(termo in texto.lower() for termo in termos_sistema):
            return True
        
        return False
    
    def _corrigir_estado(self, estado: str) -> str:
        """Corrige formatação de estado (UF)"""
        if not estado:
            return estado
        
        # Remove espaços e converte para maiúsculo
        estado_corrigido = estado.strip().upper()
        
        # Valida se é UF válida (2 letras)
        if len(estado_corrigido) == 2 and estado_corrigido.isalpha():
            return estado_corrigido
        
        # Tenta extrair apenas as 2 primeiras letras
        apenas_letras = re.sub(r'[^A-Za-z]', '', estado)
        if len(apenas_letras) >= 2:
            return apenas_letras[:2].upper()
        
        return estado
    
    def _corrigir_cep(self, cep: str) -> str:
        """Corrige formatação de CEP (8 dígitos sem hífen)"""
        if not cep:
            return cep
        
        # Remove tudo que não é dígito
        apenas_digitos = re.sub(r'\D', '', cep)
        
        # Valida se tem 8 dígitos
        if len(apenas_digitos) == 8:
            return apenas_digitos
        
        return cep
    
    def _corrigir_cnpj(self, cnpj: str) -> str:
        """Corrige formatação de CNPJ (14 dígitos)"""
        if not cnpj:
            return cnpj
        
        # Remove tudo que não é dígito
        apenas_digitos = re.sub(r'\D', '', cnpj)
        
        # Valida se tem 14 dígitos
        if len(apenas_digitos) == 14:
            # Formata: 00.000.000/0000-00
            return f"{apenas_digitos[:2]}.{apenas_digitos[2:5]}.{apenas_digitos[5:8]}/{apenas_digitos[8:12]}-{apenas_digitos[12:]}"
        
        return cnpj
    
    def _carregar_cidades_brasil(self) -> set:
        """Carrega lista de cidades brasileiras (simplificado)"""
        # Top 100 cidades mais comuns em consórcios
        return {
            "são paulo", "rio de janeiro", "belo horizonte", "brasília",
            "salvador", "fortaleza", "curitiba", "recife", "porto alegre",
            "manaus", "belém", "goiânia", "campinas", "são luís",
            "são gonçalo", "maceió", "duque de caxias", "natal",
            "teresina", "campo grande", "nova iguaçu", "são bernardo do campo",
            "joão pessoa", "santo andré", "osasco", "jaboatão dos guararapes",
            "são josé dos campos", "ribeirão preto", "uberlândia", "sorocaba",
        }


# Instância global
correcao_inteligente = CorrecaoAutomaticaInteligente()
