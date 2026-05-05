# -*- coding: utf-8 -*-
"""
ml_extração_automatica.py - Sistema de Machine Learning para Extração Automática de Extratos

Integra com o sistema de aprendizado existente para automatizar a leitura completa de PDFs:
- Detecta padrões por administradora baseado em correções do usuário
- Aplica ML adaptativo para todos os campos do extrato
- Mantém fallback para extração tradicional
- Aprende continuamente com cada correção manual
"""

import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from decimal import Decimal
import difflib

# Imports do sistema existente
from aprendizado.correcao_automatica import aprendizado_correcao
# TODO: Corrigir import ML
# from ml_integração_extratos import ml_extrato_admin
from app.utils.utils import limpar_texto

# 🆕 NOVOS SISTEMAS INTELIGENTES
try:
    from busca_dados_pj import busca_dados_pj
    from corretor_administradora import corretor_administradora
    BUSCA_PJ_DISPONIVEL = True
    logger_temp = logging.getLogger(__name__)
    logger_temp.info("✅ Sistemas de busca PJ e corretor de administradora carregados")
except ImportError as e:
    BUSCA_PJ_DISPONIVEL = False
    logger_temp = logging.getLogger(__name__)
    logger_temp.warning(f"⚠️ Sistemas inteligentes não disponíveis: {e}")

logger = logging.getLogger(__name__)

class MLExtratorAutomatico:
    """
    Sistema de ML para automatizar extração completa de dados de extratos.
    Aprende padrões específicos por administradora e aplica automaticamente.
    """
    
    def __init__(self):
        self.padroes_aprendidos = self._carregar_padroes_aprendidos()
        
        # Campos básicos que o ML pode extrair
        self.campos_automatizaveis = [
            "nome", "grupo", "cota", "valor_bem", "prazo_meses",
            "data_primeira_assembleia", "data_encerramento", "endereco",
            "valor_total_pago_extrato", "numero_contrato", "comarca",
            "cnpj_administradora", "comarca_administradora", "administradora",
            "cpf_cnpj", "cep", "rua", "numero", "bairro", "cidade", "estado",
            "complemento", "nacionalidade"
        ]
        
        # 🧠 NOVOS RECURSOS DE APRENDIZADO AVANÇADO
        self.padroes_layout = {}  # Aprende estrutura visual do PDF por administradora
        self.padroes_posicionamento = {}  # Aprende onde cada campo aparece (linha, coluna)
        self.padroes_secoes = {}  # Aprende divisões do documento (cabeçalho, dados, parcelas)
        self.padroes_formatacao = {}  # Aprende como valores são formatados
        self.padroes_nomenclatura = {}  # Aprende sinônimos (Grupo = Grp = Group)
        self.padroes_validacao = {}  # Aprende regras de validação
        self.padroes_calculos = {}  # Aprende fórmulas matemáticas
        self.padroes_tabelas = {}  # Aprende estrutura de tabelas de parcelas
    
    def _carregar_padroes_aprendidos(self) -> Dict[str, Any]:
        """Carrega padrões ML aprendidos por administradora - TODOS OS PADRÕES"""
        try:
            with open("app/aprendizado/padroes_ml_extratos.json", "r", encoding="utf-8") as f:
                dados = json.load(f)
                
                # 🧠 Se for formato antigo (só padroes_aprendidos)
                if "padroes_layout" not in dados:
                    return dados  # Retorna só padroes_aprendidos (compatibilidade)
                
                # 🧠 Formato novo - carrega todos os padrões
                self.padroes_layout = dados.get("padroes_layout", {})
                self.padroes_posicionamento = dados.get("padroes_posicionamento", {})
                self.padroes_formatacao = dados.get("padroes_formatacao", {})
                
                # Converte listas de volta para sets
                nomenclatura = dados.get("padroes_nomenclatura", {})
                self.padroes_nomenclatura = {
                    admin: {campo: set(sinonimos) for campo, sinonimos in campos.items()}
                    for admin, campos in nomenclatura.items()
                }
                
                self.padroes_validacao = dados.get("padroes_validacao", {})
                self.padroes_calculos = dados.get("padroes_calculos", {})
                self.padroes_tabelas = dados.get("padroes_tabelas", {})
                
                logger.info(f"📂 Padrões ML carregados: {len(self.padroes_layout)} layouts, {sum(len(p) for p in self.padroes_posicionamento.values())} posicionamentos")
                
                return dados.get("padroes_aprendidos", {})
                
        except FileNotFoundError:
            return {}
        except Exception as e:
            logger.warning(f"Erro ao carregar padrões ML: {e}")
            return {}
    
    def _salvar_padroes_aprendidos(self):
        """Salva padrões ML aprendidos - TODOS OS PADRÕES"""
        try:
            # 🧠 Salva TODOS os padrões (tradicionais + autônomos)
            todos_padroes = {
                "padroes_aprendidos": self.padroes_aprendidos,
                "padroes_layout": self.padroes_layout,
                "padroes_posicionamento": self.padroes_posicionamento,
                "padroes_formatacao": self.padroes_formatacao,
                "padroes_nomenclatura": {
                    admin: {campo: list(sinonimos) for campo, sinonimos in campos.items()}
                    for admin, campos in self.padroes_nomenclatura.items()
                },  # Converte sets para listas
                "padroes_validacao": self.padroes_validacao,
                "padroes_calculos": self.padroes_calculos,
                "padroes_tabelas": self.padroes_tabelas
            }
            
            with open("app/aprendizado/padroes_ml_extratos.json", "w", encoding="utf-8") as f:
                json.dump(todos_padroes, f, ensure_ascii=False, indent=2)
                
            logger.info(f"💾 Padrões ML salvos: {len(self.padroes_layout)} layouts, {sum(len(p) for p in self.padroes_posicionamento.values())} posicionamentos")
        except Exception as e:
            logger.error(f"Erro ao salvar padrões ML: {e}")
    
    def extrair_com_ml(self, dados_tradicionais: Dict[str, Any], texto_bruto: str, 
                       texto_limpo: str) -> Tuple[Dict[str, Any], List[str]]:
        """
        Aplica ML para automatizar extração de todos os campos.
        
        Args:
            dados_tradicionais: Dados extraídos pelo sistema tradicional
            texto_bruto: Texto bruto do PDF
            texto_limpo: Texto limpo do PDF
        
        Returns:
            Tuple[dados_melhorados, mensagens_ml]
        """
        mensagens_ml = []
        dados_melhorados = dados_tradicionais.copy()
        
        # 1. Detecta administradora automaticamente (já integrado)
        try:
            # TODO: Corrigir import ML
            # dados_melhorados = ml_extrato_admin.enriquecer_extrato_com_dados_administradora(dados_melhorados)
            # dados_melhorados = ml_extrato_admin.detectar_e_corrigir_campo_comarca(dados_melhorados)
            pass  # temporário
        except Exception as e:
            logger.warning(f"Erro no enriquecimento administradora: {e}")
        
        administradora = (dados_melhorados.get("administradora", "") or 
                         dados_melhorados.get("administradora_detectada", "")).strip()
        
        if not administradora:
            return dados_melhorados, ["⚠️ ML: Administradora não detectada - usando extração tradicional"]
        
        # 2. Aplica padrões ML específicos da administradora
        padroes_admin = self.padroes_aprendidos.get(administradora, {})
        campos_melhorados = 0
        
        for campo in self.campos_automatizaveis:
            if campo in dados_melhorados and dados_melhorados[campo]:
                continue  # Campo já preenchido pelo sistema tradicional
            
            valor_ml = self._extrair_campo_com_ml(
                campo, administradora, texto_bruto, texto_limpo, padroes_admin
            )
            
            if valor_ml:
                dados_melhorados[campo] = valor_ml
                campos_melhorados += 1
                mensagens_ml.append(f"🤖 ML preencheu automaticamente: {campo}")
        
        # 3. Aplica correções aprendidas automaticamente
        try:
            resultado_correcoes = aprendizado_correcao.aplicar_correcoes_aprendidas(
                administradora=administradora,
                dados_extraidos=dados_melhorados
            )
            
            if resultado_correcoes["correcoes"]:
                for campo, valor_corrigido in resultado_correcoes["correcoes"].items():
                    dados_melhorados[campo] = valor_corrigido
                    campos_melhorados += 1
                
                mensagens_ml.extend(resultado_correcoes["mensagens"])
        
        except Exception as e:
            logger.warning(f"Erro ao aplicar correções automáticas: {e}")
        
        if campos_melhorados > 0:
            mensagens_ml.append(f"✨ ML automatizou {campos_melhorados} campos para {administradora}")
        
        # 4. 🆕 CORREÇÕES INTELIGENTES: Administradora e busca de PJ
        if BUSCA_PJ_DISPONIVEL:
            try:
                dados_melhorados, mensagens_correcoes = self._aplicar_correcoes_inteligentes(
                    dados_melhorados, texto_bruto
                )
                mensagens_ml.extend(mensagens_correcoes)
            except Exception as e:
                logger.warning(f"Erro ao aplicar correções inteligentes: {e}")
        
        # 5. 🧠 APRENDIZADO AUTÔNOMO: Aprende com os dados extraídos
        try:
            self._aprender_automaticamente(administradora, texto_bruto, dados_melhorados)
        except Exception as e:
            logger.warning(f"Erro no aprendizado automático: {e}")
        
        return dados_melhorados, mensagens_ml
    
    def _aplicar_correcoes_inteligentes(self, dados: Dict[str, Any], texto_bruto: str) -> Tuple[Dict[str, Any], List[str]]:
        """
        🎯 CORREÇÕES INTELIGENTES AUTOMÁTICAS
        
        1. Corrige nome e CNPJ da administradora usando arquivo de referência
        2. Busca dados de PJ na internet quando detecta CNPJ/razão social
        3. Melhora extração de taxa de administração
        """
        mensagens = []
        dados_corrigidos = dados.copy()
        
        # 1. CORRIGIR ADMINISTRADORA
        nome_admin = dados.get("administradora") or dados.get("nome_administradora")
        cnpj_admin = dados.get("cnpj_administradora")
        
        if nome_admin:
            logger.info(f"🔍 Corrigindo administradora: '{nome_admin}'")
            resultado = corretor_administradora.corrigir_administradora(nome_admin, cnpj_admin)
            
            if resultado.get("corrigido"):
                nome_correto = resultado["nome"]
                cnpj_correto = resultado["cnpj"]
                cep = resultado.get("cep")
                confianca = resultado.get("confianca", 0)
                
                # Aplica correções
                if nome_correto != nome_admin:
                    dados_corrigidos["administradora"] = nome_correto
                    mensagens.append(f"✅ Administradora corrigida: '{nome_admin}' → '{nome_correto}' (confiança {confianca:.0%})")
                
                if cnpj_correto and cnpj_correto != cnpj_admin:
                    dados_corrigidos["cnpj_administradora"] = cnpj_correto
                    mensagens.append(f"✅ CNPJ da administradora preenchido: {cnpj_correto}")
                
                if cep and not dados.get("cep_administradora"):
                    dados_corrigidos["cep_administradora"] = cep
                    mensagens.append(f"✅ CEP da administradora preenchido: {cep}")
        
        # 2. BUSCAR DADOS DE PJ (Cliente)
        cpf_cnpj_cliente = dados.get("cpf_cnpj") or dados.get("cpf") or dados.get("cnpj")
        
        if cpf_cnpj_cliente:
            # Remove formatação
            cnpj_limpo = re.sub(r'[^\d]', '', cpf_cnpj_cliente)
            
            # Se tem 14 dígitos, é CNPJ (PJ)
            if len(cnpj_limpo) == 14:
                logger.info(f"🔍 Cliente é PJ, buscando dados do CNPJ {cnpj_limpo}...")
                mensagens.append("⏳ Buscando dados da empresa na internet...")
                
                try:
                    dados_pj = busca_dados_pj.buscar_por_cnpj(cnpj_limpo)
                    
                    if dados_pj:
                        # Preenche dados que estão faltando
                        if not dados.get("nome") or not dados.get("nome_cliente"):
                            razao = dados_pj.get("razao_social") or dados_pj.get("nome_fantasia")
                            if razao:
                                dados_corrigidos["nome"] = razao
                                dados_corrigidos["nome_cliente"] = razao
                                mensagens.append(f"✅ Razão social preenchida: {razao}")
                        
                        endereco = dados_pj.get("endereco", {})
                        if endereco:
                            if not dados.get("cep") and endereco.get("cep"):
                                dados_corrigidos["cep"] = endereco["cep"]
                                mensagens.append(f"✅ CEP preenchido: {endereco['cep']}")
                            
                            if not dados.get("rua") and endereco.get("logradouro"):
                                dados_corrigidos["rua"] = endereco["logradouro"]
                                mensagens.append(f"✅ Logradouro preenchido")
                            
                            if not dados.get("numero") and endereco.get("numero"):
                                dados_corrigidos["numero"] = endereco["numero"]
                            
                            if not dados.get("bairro") and endereco.get("bairro"):
                                dados_corrigidos["bairro"] = endereco["bairro"]
                            
                            if not dados.get("cidade") and endereco.get("cidade"):
                                dados_corrigidos["cidade"] = endereco["cidade"]
                                mensagens.append(f"✅ Cidade preenchida: {endereco['cidade']}")
                            
                            if not dados.get("estado") and endereco.get("uf"):
                                dados_corrigidos["estado"] = endereco["uf"]
                        
                        if not dados.get("telefone") and dados_pj.get("telefone"):
                            dados_corrigidos["telefone"] = dados_pj["telefone"]
                        
                        mensagens.append(f"🎉 Dados da empresa preenchidos automaticamente (fonte: {dados_pj.get('fonte', 'API')})")
                    else:
                        mensagens.append("⚠️ Não foi possível buscar dados da empresa")
                        
                except Exception as e:
                    logger.warning(f"Erro ao buscar dados de PJ: {e}")
                    mensagens.append(f"⚠️ Erro ao buscar dados da empresa: {str(e)}")
        
        # 3. MELHORAR EXTRAÇÃO DE TAXA DE ADMINISTRAÇÃO
        if not dados.get("taxa_adm_percentual") or dados.get("taxa_adm_percentual") == 0:
            logger.info("🔍 Tentando extrair taxa de administração com padrões avançados...")
            taxa = self._extrair_taxa_administracao_avancada(texto_bruto)
            if taxa:
                dados_corrigidos["taxa_adm_percentual"] = taxa
                mensagens.append(f"✅ Taxa de administração detectada: {taxa}%")
        
        return dados_corrigidos, mensagens
    
    def _extrair_taxa_administracao_avancada(self, texto: str) -> Optional[float]:
        """
        Extrai taxa de administração com múltiplos padrões
        """
        padroes = [
            # Padrão comum: "Taxa de Administração: 15,00%"
            r"(?i)taxa\s+(?:de\s+)?administra[çc][ãa]o\s*[:\s]+([0-9]{1,2}[.,][0-9]{2,4})\s*%",
            # Quebra de linha: "Taxa de Administração\n15,00%"
            r"(?i)taxa\s+(?:de\s+)?administra[çc][ãa]o[\s\n]+([0-9]{1,2}[.,][0-9]{2,4})\s*%",
            # Com parênteses: "(Taxa Adm.: 15,00%)"
            r"(?i)\(?taxa\s+adm\.?:?\s*([0-9]{1,2}[.,][0-9]{2,4})\s*%\)?",
            # Sem espaço: "TaxaAdministração15,00%"
            r"(?i)taxaadministra[çc][ãa]o\s*([0-9]{1,2}[.,][0-9]{2,4})\s*%",
            # Em tabela: "Taxa Adm | 15,00%"
            r"(?i)taxa\s+adm\.?\s*[\|:]\s*([0-9]{1,2}[.,][0-9]{2,4})\s*%"
        ]
        
        for padrao in padroes:
            match = re.search(padrao, texto)
            if match:
                try:
                    valor_str = match.group(1).replace(".", "").replace(",", ".")
                    taxa = float(valor_str)
                    if 0 < taxa <= 50:  # Taxa razoável
                        logger.info(f"✅ Taxa extraída com padrão avançado: {taxa}%")
                        return taxa
                except Exception as e:
                    logger.warning(f"Erro ao converter taxa: {e}")
        
        return None
    
    def _aprender_automaticamente(self, administradora: str, texto_bruto: str, 
                                 dados_extraidos: Dict[str, Any]):
        """
        🧠 CORAÇÃO DO ML AUTÔNOMO: Aprende múltiplas dimensões do documento.
        """
        if not administradora or not dados_extraidos:
            return
        
        # Aprende layout do documento
        self.aprender_layout_documento(administradora, texto_bruto, dados_extraidos)
        
        # Aprende posicionamento de cada campo encontrado
        for campo, valor in dados_extraidos.items():
            if valor and campo in self.campos_automatizaveis:
                self.aprender_posicionamento_campos(administradora, texto_bruto, campo, str(valor))
                
                # Aprende formatação de valores numéricos
                if any(fmt in str(valor) for fmt in [",", ".", "R$"]):
                    self.aprender_formatacao_valores(administradora, campo, str(valor), str(valor))
        
        # Aprende estrutura de tabelas (se houver parcelas)
        if "parcelas" in dados_extraidos and isinstance(dados_extraidos["parcelas"], list):
            self.aprender_estrutura_tabelas(administradora, texto_bruto, dados_extraidos["parcelas"])
        
        # 💾 SALVA todos os padrões aprendidos
        self._salvar_padroes_aprendidos()
        
        logger.info(f"🧠 ML aprendeu automaticamente com documento de {administradora}")
    
    def _extrair_campo_com_ml(self, campo: str, administradora: str, 
                             texto_bruto: str, texto_limpo: str, 
                             padroes_admin: Dict[str, Any]) -> Optional[str]:
        """
        Extrai um campo específico usando ML adaptativo por administradora.
        """
        try:
            # Verifica se temos padrões aprendidos para este campo/administradora
            padroes_campo = padroes_admin.get(campo, {})
            
            if padroes_campo and "regex_patterns" in padroes_campo:
                # Aplica padrões regex aprendidos
                for pattern in padroes_campo["regex_patterns"]:
                    match = re.search(pattern, texto_bruto, re.IGNORECASE)
                    if match:
                        return self._limpar_valor_extraido(match.group(1) if match.groups() else match.group(0), campo)
            
            # Se não tem padrões específicos, usa heurísticas inteligentes
            return self._extrair_com_heuristicas(campo, administradora, texto_bruto, texto_limpo)
        
        except Exception as e:
            logger.warning(f"Erro na extração ML do campo {campo}: {e}")
            return None
    
    def _extrair_com_heuristicas(self, campo: str, administradora: str, 
                                texto_bruto: str, texto_limpo: str) -> Optional[str]:
        """
        Aplica heurísticas inteligentes para extração quando não há padrões específicos.
        """
        texto = texto_limpo or texto_bruto
        
        if campo == "nome":
            return self._extrair_nome_heuristica(texto)
        elif campo == "grupo":
            return self._extrair_grupo_heuristica(texto)
        elif campo == "cota":
            return self._extrair_cota_heuristica(texto)
        elif campo == "valor_bem":
            return self._extrair_valor_bem_heuristica(texto)
        elif campo == "prazo_meses":
            return self._extrair_prazo_heuristica(texto)
        elif campo == "numero_contrato":
            return self._extrair_contrato_heuristica(texto)
        elif campo == "endereco":
            return self._extrair_endereco_heuristica(texto)
        
        return None
    
    def _extrair_nome_heuristica(self, texto: str) -> Optional[str]:
        """Extrai nome do consorciado usando heurísticas"""
        patterns = [
            r"(?i)nome\s*[:;]\s*([A-ZÁÀÂÊÉÍÕÔÚÇ\s]+)(?:\n|$)",
            r"(?i)consorciado\s*[:;]\s*([A-ZÁÀÂÊÉÍÕÔÚÇ\s]+)(?:\n|$)",
            r"(?i)participante\s*[:;]\s*([A-ZÁÀÂÊÉÍÕÔÚÇ\s]+)(?:\n|$)",
            r"(?i)titular\s*[:;]\s*([A-ZÁÀÂÊÉÍÕÔÚÇ\s]+)(?:\n|$)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                nome = match.group(1).strip()
                if len(nome) > 3 and len(nome.split()) >= 2:  # Nome deve ter pelo menos 2 palavras
                    return nome.title()
        
        return None
    
    def _extrair_grupo_heuristica(self, texto: str) -> Optional[str]:
        """Extrai número do grupo usando heurísticas"""
        patterns = [
            r"(?i)grupo\s*[:;]?\s*(\d+)",
            r"(?i)gr\s*[:;]?\s*(\d+)",
            r"(?i)grupo\s*n[º°]?\s*(\d+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                return match.group(1)
        
        return None
    
    def _extrair_cota_heuristica(self, texto: str) -> Optional[str]:
        """Extrai número da cota usando heurísticas"""
        patterns = [
            r"(?i)cota\s*[:;]?\s*(\d+)",
            r"(?i)cota\s*n[º°]?\s*(\d+)",
            r"(?i)participação\s*[:;]?\s*(\d+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                return match.group(1)
        
        return None
    
    def _extrair_valor_bem_heuristica(self, texto: str) -> Optional[str]:
        """Extrai valor do bem usando heurísticas"""
        patterns = [
            r"(?i)valor\s+do?\s+bem\s*[:;]?\s*R?\$?\s*([\d.,]+)",
            r"(?i)bem\s*[:;]?\s*R?\$?\s*([\d.,]+)",
            r"(?i)cr[eé]dito\s*[:;]?\s*R?\$?\s*([\d.,]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                valor = match.group(1).replace(".", "").replace(",", ".")
                try:
                    return str(float(valor))
                except ValueError:
                    continue
        
        return None
    
    def _extrair_prazo_heuristica(self, texto: str) -> Optional[str]:
        """Extrai prazo em meses usando heurísticas"""
        patterns = [
            r"(?i)prazo\s*[:;]?\s*(\d+)\s*meses?",
            r"(?i)dura[çc][ãa]o\s*[:;]?\s*(\d+)\s*meses?",
            r"(?i)(\d+)\s*meses\s+de\s+prazo"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                return match.group(1)
        
        return None
    
    def _extrair_contrato_heuristica(self, texto: str) -> Optional[str]:
        """Extrai número do contrato usando heurísticas"""
        patterns = [
            r"(?i)contrato\s*[:;]?\s*n?[º°]?\s*([A-Z0-9\-/]+)",
            r"(?i)n[º°]?\s*contrato\s*[:;]?\s*([A-Z0-9\-/]+)",
            r"(?i)proposta\s*[:;]?\s*n?[º°]?\s*([A-Z0-9\-/]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                contrato = match.group(1).strip()
                if len(contrato) > 3:  # Contrato deve ter pelo menos 4 caracteres
                    return contrato
        
        return None
    
    def _extrair_endereco_heuristica(self, texto: str) -> Optional[str]:
        """Extrai endereço usando heurísticas"""
        patterns = [
            r"(?i)endere[çc]o\s*[:;]?\s*([^\n]+)",
            r"(?i)logradouro\s*[:;]?\s*([^\n]+)",
            r"(?i)rua\s*[:;]?\s*([^\n]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto)
            if match:
                endereco = match.group(1).strip()
                if len(endereco) > 10:  # Endereço deve ter pelo menos 10 caracteres
                    return endereco.title()
        
        return None
    
    def _limpar_valor_extraido(self, valor: str, campo: str) -> str:
        """Limpa e normaliza valor extraído"""
        if not valor:
            return ""
        
        valor = valor.strip()
        
        # Para valores monetários
        if campo in ["valor_bem", "valor_total_pago_extrato"]:
            # Remove caracteres não numéricos exceto vírgula e ponto
            valor = re.sub(r"[^\d.,]", "", valor)
            # Normaliza formato decimal brasileiro
            if "," in valor and "." in valor:
                valor = valor.replace(".", "").replace(",", ".")
            elif "," in valor:
                # Se tem vírgula mas não ponto, assume formato brasileiro
                if len(valor.split(",")[1]) <= 2:
                    valor = valor.replace(",", ".")
        
        # Para nomes, capitaliza adequadamente
        elif campo in ["nome", "endereco"]:
            valor = valor.title()
        
        # Para números, remove espaços e caracteres especiais
        elif campo in ["grupo", "cota", "prazo_meses"]:
            valor = re.sub(r"[^\d]", "", valor)
        
        return valor
    
    def aprender_com_correcao(self, administradora: str, campo: str, 
                             valor_original: str, valor_corrigido: str, 
                             texto_bruto: str) -> bool:
        """
        Aprende novos padrões baseado em correções do usuário.
        
        Args:
            administradora: Nome da administradora
            campo: Campo que foi corrigido
            valor_original: Valor extraído originalmente
            valor_corrigido: Valor corrigido pelo usuário
            texto_bruto: Texto original do PDF
        
        Returns:
            bool: True se conseguiu aprender um novo padrão
        """
        try:
            if administradora not in self.padroes_aprendidos:
                self.padroes_aprendidos[administradora] = {}
            
            if campo not in self.padroes_aprendidos[administradora]:
                self.padroes_aprendidos[administradora][campo] = {
                    "regex_patterns": [],
                    "exemplos_correcoes": [],
                    "confianca": 0.0
                }
            
            padroes_campo = self.padroes_aprendidos[administradora][campo]
            
            # Procura o valor corrigido no texto para criar um padrão
            novo_padrao = self._gerar_padrao_regex(valor_corrigido, texto_bruto, campo)
            
            if novo_padrao:
                if novo_padrao not in padroes_campo["regex_patterns"]:
                    padroes_campo["regex_patterns"].append(novo_padrao)
                    logger.info(f"🧠 Novo padrão ML aprendido para {administradora}.{campo}: {novo_padrao}")
            
            # Salva exemplo de correção
            exemplo = {
                "valor_original": valor_original,
                "valor_corrigido": valor_corrigido,
                "timestamp": datetime.now().isoformat()
            }
            padroes_campo["exemplos_correcoes"].append(exemplo)
            
            # Mantém apenas os últimos 10 exemplos
            padroes_campo["exemplos_correcoes"] = padroes_campo["exemplos_correcoes"][-10:]
            
            # Atualiza confiança baseado no número de correções
            padroes_campo["confianca"] = min(1.0, len(padroes_campo["exemplos_correcoes"]) * 0.1)
            
            # Salva padrões atualizados
            self._salvar_padroes_aprendidos()
            
            return novo_padrao is not None
        
        except Exception as e:
            logger.error(f"Erro ao aprender com correção: {e}")
            return False
    
    def _gerar_padrao_regex(self, valor_corrigido: str, texto_bruto: str, campo: str) -> Optional[str]:
        """
        Gera um padrão regex baseado no valor corrigido encontrado no texto.
        """
        try:
            # Escapa caracteres especiais do valor para busca
            valor_escaped = re.escape(valor_corrigido)
            
            # Procura o valor no texto com contexto
            linhas = texto_bruto.split('\n')
            
            for i, linha in enumerate(linhas):
                if re.search(valor_escaped, linha, re.IGNORECASE):
                    # Tenta criar um padrão baseado na linha onde encontrou o valor
                    padrao = self._criar_padrao_contextual(linha, valor_corrigido, campo)
                    if padrao:
                        return padrao
            
            return None
        
        except Exception as e:
            logger.warning(f"Erro ao gerar padrão regex: {e}")
            return None
    
    def _criar_padrao_contextual(self, linha: str, valor: str, campo: str) -> Optional[str]:
        """
        Cria um padrão regex baseado no contexto da linha onde o valor foi encontrado.
        """
        try:
            # Mapeamento de palavras-chave por campo
            keywords_campo = {
                "nome": ["nome", "consorciado", "participante", "titular"],
                "grupo": ["grupo", "gr"],
                "cota": ["cota", "participação"],
                "valor_bem": ["valor", "bem", "crédito"],
                "prazo_meses": ["prazo", "duração", "meses"],
                "numero_contrato": ["contrato", "proposta"],
                "endereco": ["endereço", "logradouro", "rua"]
            }
            
            keywords = keywords_campo.get(campo, [])
            
            for keyword in keywords:
                if re.search(rf"(?i)\b{keyword}\b", linha):
                    # Cria padrão que captura o valor após a palavra-chave
                    if campo in ["grupo", "cota", "prazo_meses"]:
                        # Para números
                        padrao = rf"(?i){keyword}\s*[:;]?\s*n?[º°]?\s*(\d+)"
                    elif campo in ["valor_bem"]:
                        # Para valores monetários
                        padrao = rf"(?i){keyword}[^R$]*R?\$?\s*([\d.,]+)"
                    else:
                        # Para texto geral
                        padrao = rf"(?i){keyword}\s*[:;]?\s*([^\n]+)"
                    
                    # Testa se o padrão funciona
                    match = re.search(padrao, linha)
                    if match and match.group(1).strip():
                        return padrao
            
            return None
        
        except Exception as e:
            logger.warning(f"Erro ao criar padrão contextual: {e}")
            return None
    
    # ==================== MÉTODOS DE APRENDIZADO AVANÇADO ====================
    
    def aprender_layout_documento(self, administradora: str, texto_bruto: str, 
                                  dados_extraidos: Dict[str, Any]):
        """
        🧠 Aprende a estrutura visual/layout do documento.
        Detecta assinaturas visuais únicas de cada administradora.
        """
        if not administradora:
            return
        
        if administradora not in self.padroes_layout:
            self.padroes_layout[administradora] = {
                "palavras_chave_identificacao": [],  # Palavras únicas dessa administradora
                "densidade_texto": 0,  # Média de caracteres por linha
                "comprimento_medio_linha": 0,
                "presenca_tabelas": False,
                "num_linhas_medio": 0
            }
        
        linhas = texto_bruto.split('\n')
        self.padroes_layout[administradora]["num_linhas_medio"] = len(linhas)
        self.padroes_layout[administradora]["comprimento_medio_linha"] = (
            sum(len(l) for l in linhas) / len(linhas) if linhas else 0
        )
        
        # Detecta palavras únicas (ex: "EMBRACON" sempre aparece, "ITAÚ" sempre aparece)
        palavras_frequentes = re.findall(r'\b[A-ZÁÀÂÊÉÍÕÔÚÇ]{3,}\b', texto_bruto)
        for palavra in set(palavras_frequentes[:10]):  # Top 10 palavras em caps
            if palavra not in self.padroes_layout[administradora]["palavras_chave_identificacao"]:
                self.padroes_layout[administradora]["palavras_chave_identificacao"].append(palavra)
        
        logger.info(f"✅ ML aprendeu layout de {administradora}")
    
    def aprender_posicionamento_campos(self, administradora: str, texto_bruto: str,
                                       campo: str, valor_encontrado: str):
        """
        🧠 Aprende onde cada campo aparece no documento (linha, posição).
        Ex: "grupo sempre na linha 3, coluna 20"
        """
        if not administradora or not valor_encontrado:
            return
        
        if administradora not in self.padroes_posicionamento:
            self.padroes_posicionamento[administradora] = {}
        
        if campo not in self.padroes_posicionamento[administradora]:
            self.padroes_posicionamento[administradora][campo] = {
                "linhas_encontradas": [],
                "posicoes_x": [],
                "linha_media": 0,
                "posicao_x_media": 0
            }
        
        linhas = texto_bruto.split('\n')
        for i, linha in enumerate(linhas):
            if valor_encontrado in linha:
                self.padroes_posicionamento[administradora][campo]["linhas_encontradas"].append(i)
                pos_x = linha.find(valor_encontrado)
                self.padroes_posicionamento[administradora][campo]["posicoes_x"].append(pos_x)
        
        # Calcula médias
        dados = self.padroes_posicionamento[administradora][campo]
        if dados["linhas_encontradas"]:
            dados["linha_media"] = sum(dados["linhas_encontradas"]) / len(dados["linhas_encontradas"])
        if dados["posicoes_x"]:
            dados["posicao_x_media"] = sum(dados["posicoes_x"]) / len(dados["posicoes_x"])
        
        logger.info(f"✅ ML aprendeu posicionamento de '{campo}' em {administradora}")
    
    def aprender_formatacao_valores(self, administradora: str, campo: str, 
                                    valor_original: str, valor_corrigido: str):
        """
        🧠 Aprende padrões de formatação de valores.
        Ex: EMBRACON usa "1.000,00", ITAÚ usa "1000.00"
        """
        if not administradora:
            return
        
        if administradora not in self.padroes_formatacao:
            self.padroes_formatacao[administradora] = {
                "separador_decimal": ",",
                "separador_milhar": ".",
                "prefixo_moeda": "R$",
                "formato_data": "DD/MM/YYYY"
            }
        
        # Detecta padrão de decimal
        if "," in valor_original and "." in valor_original:
            if valor_original.rfind(",") > valor_original.rfind("."):
                self.padroes_formatacao[administradora]["separador_decimal"] = ","
                self.padroes_formatacao[administradora]["separador_milhar"] = "."
            else:
                self.padroes_formatacao[administradora]["separador_decimal"] = "."
                self.padroes_formatacao[administradora]["separador_milhar"] = ","
        
        logger.info(f"✅ ML aprendeu formatação de valores de {administradora}")
    
    def aprender_sinonimos(self, administradora: str, campo: str, 
                          labels_encontrados: List[str]):
        """
        🧠 Aprende variações de nomenclatura.
        Ex: "Grupo" = "Grp" = "Group" = "Nr. Grupo"
        """
        if not administradora or not labels_encontrados:
            return
        
        if administradora not in self.padroes_nomenclatura:
            self.padroes_nomenclatura[administradora] = {}
        
        if campo not in self.padroes_nomenclatura[administradora]:
            self.padroes_nomenclatura[administradora][campo] = set()
        
        for label in labels_encontrados:
            self.padroes_nomenclatura[administradora][campo].add(label.lower().strip())
        
        logger.info(f"✅ ML aprendeu {len(labels_encontrados)} sinônimos de '{campo}' em {administradora}")
    
    def aprender_estrutura_tabelas(self, administradora: str, texto_bruto: str,
                                   parcelas: List[Dict[str, Any]]):
        """
        🧠 Aprende como tabelas de parcelas são estruturadas.
        Detecta colunas, separadores, headers.
        """
        if not administradora or not parcelas:
            return
        
        if administradora not in self.padroes_tabelas:
            self.padroes_tabelas[administradora] = {
                "colunas_identificadas": [],
                "separador": "|",
                "header_pattern": "",
                "num_colunas": 0
            }
        
        # Detecta padrão de tabela no texto
        linhas = texto_bruto.split('\n')
        for linha in linhas:
            if "|" in linha and any(p["numero_parcela"] in linha for p in parcelas if "numero_parcela" in p):
                self.padroes_tabelas[administradora]["separador"] = "|"
                colunas = [c.strip() for c in linha.split("|")]
                if len(colunas) > self.padroes_tabelas[administradora]["num_colunas"]:
                    self.padroes_tabelas[administradora]["colunas_identificadas"] = colunas
                    self.padroes_tabelas[administradora]["num_colunas"] = len(colunas)
                break
        
        logger.info(f"✅ ML aprendeu estrutura de tabelas de {administradora}")
    
    def obter_estatisticas_ml(self) -> Dict[str, Any]:
        """
        Retorna estatísticas do sistema de ML.
        """
        total_administradoras = len(self.padroes_aprendidos)
        total_campos_aprendidos = sum(
            len(campos) for campos in self.padroes_aprendidos.values()
        )
        total_padroes = sum(
            len(dados.get("regex_patterns", []))
            for admin_data in self.padroes_aprendidos.values()
            for dados in admin_data.values()
        )
        
        return {
            "administradoras_com_ml": total_administradoras,
            "campos_com_padroes_aprendidos": total_campos_aprendidos,
            "total_padroes_regex": total_padroes,
            "campos_automatizaveis": self.campos_automatizaveis,
            "padroes_layout_aprendidos": len(self.padroes_layout),
            "padroes_posicionamento_aprendidos": sum(len(p) for p in self.padroes_posicionamento.values()),
            "padroes_formatacao_aprendidos": len(self.padroes_formatacao),
            "padroes_nomenclatura_aprendidos": sum(len(p) for p in self.padroes_nomenclatura.values()),
            "padroes_tabelas_aprendidos": len(self.padroes_tabelas),
            "ultima_atualizacao": datetime.now().isoformat()
        }


# Instância global do extrator ML
ml_extrator_automatico = MLExtratorAutomatico()