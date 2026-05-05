"""
Sistema de ML para Templates de Extração por Administradora

Este módulo aprende padrões de extração específicos de cada administradora
e aplica automaticamente em novos extratos da mesma administradora.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Arquivo de templates aprendidos
TEMPLATES_FILE = Path(__file__).parent / "dados" / "templates_administradoras.json"


class TemplateExtrator:
    """Aprende e aplica padrões de extração por administradora"""
    
    def __init__(self):
        self.templates = self._carregar_templates()
    
    def _carregar_templates(self) -> Dict[str, Any]:
        """Carrega templates existentes"""
        if TEMPLATES_FILE.exists():
            try:
                with open(TEMPLATES_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Erro ao carregar templates: {e}")
        
        return {}
    
    def _salvar_templates(self):
        """Salva templates atualizados"""
        try:
            TEMPLATES_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(TEMPLATES_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.templates, f, indent=2, ensure_ascii=False)
            logger.info(f"✅ Templates salvos: {len(self.templates)} administradoras")
        except Exception as e:
            logger.error(f"❌ Erro ao salvar templates: {e}")
    
    def _detectar_assinatura_layout(self, texto: str) -> str:
        """
        Cria uma assinatura única do layout baseada em palavras-chave e estrutura
        
        Isso permite diferenciar layouts diferentes da mesma administradora
        """
        # Extrai primeiras 500 chars (cabeçalho geralmente tem diferenças)
        cabecalho = texto[:500].upper()
        
        # Características do layout
        caracteristicas = []
        
        # 1. Palavras-chave específicas no cabeçalho
        keywords = [
            "EXTRATO", "DEMONSTRATIVO", "POSIÇÃO", "COTA",
            "PARCELA", "PAGAMENTO", "ASSEMBLEIA", "CONTEMPLAÇÃO"
        ]
        for kw in keywords:
            if kw in cabecalho:
                caracteristicas.append(kw)
        
        # 2. Estrutura de tabela (número de colunas detectadas)
        linhas = texto.split('\n')[:30]  # Primeiras 30 linhas
        max_valores_por_linha = 0
        
        for linha in linhas:
            # Conta valores monetários
            valores = re.findall(r'\d{1,3}(?:[.,]\d{3})*[.,]\d{2}', linha)
            max_valores_por_linha = max(max_valores_por_linha, len(valores))
        
        if max_valores_por_linha > 0:
            caracteristicas.append(f"COL{max_valores_por_linha}")
        
        # 3. Formato de data predominante
        if re.search(r'\d{2}/\d{2}/\d{4}', texto[:1000]):
            caracteristicas.append("DATA_LONGA")
        elif re.search(r'\d{2}/\d{2}/\d{2}', texto[:1000]):
            caracteristicas.append("DATA_CURTA")
        
        # Cria hash das características
        assinatura = "_".join(sorted(caracteristicas))
        
        return assinatura if assinatura else "DEFAULT"
    
    def aprender_de_extracao(self, administradora: str, dados_extraidos: Dict[str, Any], 
                            texto_bruto: str, texto_ocr: str = ""):
        """
        Aprende padrões de um extrato processado com sucesso
        
        Args:
            administradora: Nome da administradora
            dados_extraidos: Dados extraídos com sucesso do PDF
            texto_bruto: Texto bruto do PDF
            texto_ocr: Texto OCR (se disponível)
        """
        if not administradora:
            return
        
        # Normaliza nome da administradora
        admin_key = administradora.upper().strip()
        
        # 🆕 Detecta variação de layout
        assinatura_layout = self._detectar_assinatura_layout(texto_bruto)
        
        # Inicializa template se não existir
        if admin_key not in self.templates:
            self.templates[admin_key] = {
                "nome": administradora,
                "total_extratos_processados": 0,
                "ultima_atualizacao": None,
                "layouts": {}  # 🆕 Múltiplos layouts por administradora
            }
        
        template = self.templates[admin_key]
        template["total_extratos_processados"] += 1
        
        # 🆕 Inicializa layout específico se não existir
        if assinatura_layout not in template["layouts"]:
            template["layouts"][assinatura_layout] = {
                "assinatura": assinatura_layout,
                "extratos_com_este_layout": 0,
                "padroes": {
                    "parcelas": [],
                    "valores": [],
                    "datas": [],
                    "regex_patterns": []
                }
            }
            logger.info(f"🆕 Novo layout detectado para {administradora}: {assinatura_layout}")
        
        # Trabalha com o layout específico
        layout = template["layouts"][assinatura_layout]
        layout["extratos_com_este_layout"] += 1
        template["ultima_atualizacao"] = datetime.now().isoformat()
        
        # Aprende padrão de parcelas (passa layout ao invés de template)
        if "parcelas" in dados_extraidos and dados_extraidos["parcelas"]:
            self._aprender_padrao_parcelas(layout, dados_extraidos["parcelas"], texto_bruto)
        
        # Aprende padrão de valores
        if "valor_total_pago" in dados_extraidos:
            self._aprender_padrao_valores(layout, dados_extraidos, texto_bruto)
        
        # Aprende padrão de estrutura de tabela
        self._aprender_estrutura_tabela(layout, texto_bruto, dados_extraidos)
        
        self._salvar_templates()
        
        logger.info(f"🧠 ML aprendeu padrões de {administradora} layout {assinatura_layout} ({layout['extratos_com_este_layout']} extratos deste layout)")
    
    def _aprender_padrao_parcelas(self, template: Dict, parcelas: List[Dict], texto: str):
        """Aprende onde as parcelas estão localizadas no texto"""
        
        # Busca padrões de data e valor nas parcelas
        for parcela in parcelas[:3]:  # Analisa primeiras 3 parcelas
            data = parcela.get("data_pagamento", "")
            valor = parcela.get("valor_pago", 0)
            
            if data and valor > 0:
                # Procura padrão no texto
                # Exemplo: "15/01/2024    197,20"
                valor_str = f"{valor:.2f}".replace(".", ",")
                
                # Tenta encontrar contexto ao redor
                pattern = rf"{re.escape(data)}.*?{re.escape(valor_str)}"
                match = re.search(pattern, texto, re.IGNORECASE | re.DOTALL)
                
                if match:
                    contexto = match.group(0)
                    # Armazena padrão encontrado
                    padrao = {
                        "tipo": "linha_parcela",
                        "exemplo_data": data,
                        "exemplo_valor": valor,
                        "contexto": contexto[:100],  # Primeiros 100 chars
                        "regex": pattern
                    }
                    
                    # Adiciona se não existir padrão similar
                    if not self._padrao_existe(template["padroes"]["parcelas"], padrao):
                        template["padroes"]["parcelas"].append(padrao)
    
    def _aprender_padrao_valores(self, template: Dict, dados: Dict, texto: str):
        """Aprende padrões de localização de valores monetários"""
        
        campos_valores = [
            ("valor_total_pago", "Total Pago"),
            ("valor_bem", "Valor do Bem"),
            ("valor_credito", "Crédito")
        ]
        
        for campo, label in campos_valores:
            if campo in dados and dados[campo]:
                valor = dados[campo]
                valor_str = f"{valor:.2f}".replace(".", ",")
                
                # Procura label + valor no texto
                pattern = rf"{label}.*?{re.escape(valor_str)}"
                match = re.search(pattern, texto, re.IGNORECASE | re.DOTALL)
                
                if match:
                    padrao = {
                        "campo": campo,
                        "label": label,
                        "exemplo": valor,
                        "contexto": match.group(0)[:100]
                    }
                    
                    if not self._padrao_existe(template["padroes"]["valores"], padrao):
                        template["padroes"]["valores"].append(padrao)
    
    def _aprender_estrutura_tabela(self, template: Dict, texto: str, dados: Dict):
        """Aprende a estrutura de tabelas de parcelas"""
        
        # Detecta se tem tabela com múltiplas colunas
        linhas = texto.split('\n')
        
        # Procura linhas com múltiplos valores numéricos (indicativo de tabela)
        padroes_tabela = []
        
        for linha in linhas[:50]:  # Analisa primeiras 50 linhas
            # Conta quantos valores monetários tem na linha
            valores = re.findall(r'\d{1,3}(?:[.,]\d{3})*[.,]\d{2}', linha)
            
            if len(valores) >= 3:  # Linha com 3+ valores = provável linha de tabela
                padroes_tabela.append({
                    "num_colunas": len(valores),
                    "exemplo_linha": linha[:200],
                    "valores_exemplo": valores[:5]
                })
        
        if padroes_tabela:
            # Guarda o padrão mais comum
            template["padroes"]["estrutura_tabela"] = {
                "tem_tabela": True,
                "colunas_detectadas": max(p["num_colunas"] for p in padroes_tabela),
                "exemplos": padroes_tabela[:3]
            }
    
    def _padrao_existe(self, lista_padroes: List[Dict], novo_padrao: Dict) -> bool:
        """Verifica se padrão similar já existe"""
        for padrao in lista_padroes:
            # Compara campos principais
            if padrao.get("tipo") == novo_padrao.get("tipo"):
                return True
            if padrao.get("campo") == novo_padrao.get("campo"):
                return True
        return False
    
    def aplicar_template(self, administradora: str, texto_bruto: str, 
                        texto_ocr: str = "") -> Optional[Dict[str, Any]]:
        """
        Aplica template aprendido para extrair dados
        
        Args:
            administradora: Nome da administradora
            texto_bruto: Texto do PDF
            texto_ocr: Texto OCR
            
        Returns:
            Dados extraídos usando template, ou None se não conseguir
        """
        admin_key = administradora.upper().strip()
        
        if admin_key not in self.templates:
            logger.info(f"ℹ️ Nenhum template aprendido ainda para {administradora}")
            return None
        
        template = self.templates[admin_key]
        logger.info(f"🎯 Aplicando template de {administradora} (baseado em {template['total_extratos_processados']} extratos)")
        
        dados_extraidos = {}
        
        # Tenta extrair parcelas usando padrões aprendidos
        if template["padroes"]["parcelas"]:
            parcelas = self._extrair_parcelas_por_template(template, texto_bruto)
            if parcelas:
                dados_extraidos["parcelas"] = parcelas
                logger.info(f"✅ Extraiu {len(parcelas)} parcelas usando template")
        
        # Tenta extrair valores usando padrões aprendidos
        if template["padroes"]["valores"]:
            valores = self._extrair_valores_por_template(template, texto_bruto)
            dados_extraidos.update(valores)
        
        # Usa estrutura de tabela aprendida
        if template["padroes"].get("estrutura_tabela", {}).get("tem_tabela"):
            dados_tabela = self._extrair_por_estrutura_tabela(template, texto_bruto)
            if dados_tabela:
                dados_extraidos.update(dados_tabela)
        
        return dados_extraidos if dados_extraidos else None
    
    def _extrair_parcelas_por_template(self, template: Dict, texto: str) -> List[Dict]:
        """Extrai parcelas usando padrões aprendidos"""
        parcelas = []
        
        for padrao in template["padroes"]["parcelas"]:
            # Usa regex aprendido
            regex = padrao.get("regex")
            if regex:
                matches = re.finditer(regex, texto, re.IGNORECASE | re.DOTALL)
                
                for match in matches:
                    # Extrai data e valor do match
                    texto_match = match.group(0)
                    
                    # Busca data (DD/MM/AAAA ou DD/MM/AA)
                    data_match = re.search(r'(\d{2}/\d{2}/\d{2,4})', texto_match)
                    
                    # Busca valor (formato brasileiro)
                    valor_match = re.search(r'(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})', texto_match)
                    
                    if data_match and valor_match:
                        valor_str = valor_match.group(1).replace(".", "").replace(",", ".")
                        
                        try:
                            parcela = {
                                "data_pagamento": data_match.group(1),
                                "valor_pago": float(valor_str)
                            }
                            parcelas.append(parcela)
                        except ValueError:
                            continue
        
        return parcelas
    
    def _extrair_valores_por_template(self, template: Dict, texto: str) -> Dict:
        """Extrai valores usando padrões aprendidos"""
        valores = {}
        
        for padrao in template["padroes"]["valores"]:
            campo = padrao.get("campo")
            label = padrao.get("label")
            
            if campo and label:
                # Busca label + valor
                pattern = rf"{re.escape(label)}[:\s]+(\d{{1,3}}(?:[.,]\d{{3}})*[.,]\d{{2}})"
                match = re.search(pattern, texto, re.IGNORECASE)
                
                if match:
                    valor_str = match.group(1).replace(".", "").replace(",", ".")
                    try:
                        valores[campo] = float(valor_str)
                    except ValueError:
                        continue
        
        return valores
    
    def _extrair_por_estrutura_tabela(self, template: Dict, texto: str) -> Dict:
        """Extrai dados usando estrutura de tabela aprendida"""
        estrutura = template["padroes"].get("estrutura_tabela", {})
        
        if not estrutura.get("tem_tabela"):
            return {}
        
        num_colunas = estrutura.get("colunas_detectadas", 0)
        
        # Procura linhas com o número esperado de colunas
        linhas = texto.split('\n')
        parcelas = []
        
        for linha in linhas:
            valores = re.findall(r'\d{1,3}(?:[.,]\d{3})*[.,]\d{2}', linha)
            
            if len(valores) >= num_colunas - 1:  # Tolerância de -1 coluna
                # Tenta extrair data
                data_match = re.search(r'(\d{2}/\d{2}/\d{2,4})', linha)
                
                if data_match and valores:
                    # Usa heurística: segundo valor do final geralmente é valor pago
                    try:
                        valor_str = valores[-2].replace(".", "").replace(",", ".")
                        parcela = {
                            "data_pagamento": data_match.group(1),
                            "valor_pago": float(valor_str)
                        }
                        parcelas.append(parcela)
                    except (ValueError, IndexError):
                        continue
        
        return {"parcelas": parcelas} if parcelas else {}
    
    def get_estatisticas(self) -> Dict[str, Any]:
        """Retorna estatísticas dos templates aprendidos"""
        stats = {
            "total_administradoras": len(self.templates),
            "administradoras": []
        }
        
        for admin_key, template in self.templates.items():
            stats["administradoras"].append({
                "nome": template["nome"],
                "extratos_processados": template["total_extratos_processados"],
                "ultima_atualizacao": template["ultima_atualizacao"],
                "padroes_parcelas": len(template["padroes"]["parcelas"]),
                "padroes_valores": len(template["padroes"]["valores"]),
                "tem_estrutura_tabela": bool(template["padroes"].get("estrutura_tabela"))
            })
        
        return stats


# Instância global
extrator_templates = TemplateExtrator()
