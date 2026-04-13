"""
Sistema de Detecção de Layouts e Estratégias de Extração

Identifica diferentes layouts de PDF da mesma administradora e aplica
a estratégia correta de extração para cada um.
"""

import re
import logging
from typing import Dict, List, Optional, Tuple, Any

logger = logging.getLogger(__name__)


class DetectorLayout:
    """Detecta e classifica layouts de PDF"""
    
    # Assinaturas conhecidas de layouts problemáticos
    LAYOUTS_PORTO_SEGURO = {
        "LAYOUT_OUVIDORIA": {
            "palavras_chave": ["OUVIDORIA", "SAC", "0800"],
            "caracteristicas": ["nome_perto_ouvidoria", "sem_cpf_visivel", "tabela_simples"],
            "descricao": "Layout antigo com Ouvidoria no topo, nome mal posicionado"
        },
        "LAYOUT_PADRAO": {
            "palavras_chave": ["EXTRATO", "POSIÇÃO DA COTA"],
            "caracteristicas": ["cpf_presente", "tabela_completa"],
            "descricao": "Layout padrão com todas informações"
        }
    }
    
    @staticmethod
    def detectar_layout_porto(texto: str) -> Tuple[str, Dict[str, Any]]:
        """
        Detecta qual layout de Porto Seguro está sendo usado
        
        Returns:
            (nome_layout, informacoes_detectadas)
        """
        texto_upper = texto.upper()
        primeiras_linhas = "\n".join(texto.split('\n')[:30])
        
        # Detecta Layout Ouvidoria (problemático)
        if "OUVIDORIA" in primeiras_linhas[:500]:
            # Verifica se nome está perto de "Ouvidoria"
            ouvidoria_pos = texto_upper.find("OUVIDORIA")
            
            # Procura nome nas primeiras 500 chars após "Porto Seguro"
            inicio_busca = max(0, texto_upper.find("PORTO SEGURO"))
            trecho_nome = texto[inicio_busca:inicio_busca + 500]
            
            return "LAYOUT_OUVIDORIA", {
                "tem_ouvidoria_visivel": True,
                "posicao_ouvidoria": ouvidoria_pos,
                "trecho_para_nome": trecho_nome,
                "dificuldade": "ALTA"
            }
        
        # Layout padrão
        return "LAYOUT_PADRAO", {
            "tem_ouvidoria_visivel": False,
            "dificuldade": "BAIXA"
        }
    
    @staticmethod
    def detectar_layout_generico(texto: str, administradora: str) -> Dict[str, Any]:
        """
        Detecta características gerais de qualquer layout
        
        Returns:
            Dicionário com características detectadas
        """
        caracteristicas = {
            "administradora": administradora,
            "tem_cpf": False,
            "tem_cnpj": False,
            "formato_tabela": "desconhecido",
            "num_colunas_detectadas": 0,
            "palavras_chave_encontradas": []
        }
        
        # CPF
        if re.search(r'\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2}\b', texto):
            caracteristicas["tem_cpf"] = True
        
        # CNPJ
        if re.search(r'\b\d{2}[.\-]?\d{3}[.\-]?\d{3}[/]?\d{4}[.\-]?\d{2}\b', texto):
            caracteristicas["tem_cnpj"] = True
        
        # Número de colunas (pela linha com mais valores)
        max_colunas = 0
        for linha in texto.split('\n')[:50]:
            valores = re.findall(r'\d{1,3}(?:[.,]\d{3})*[.,]\d{2}', linha)
            max_colunas = max(max_colunas, len(valores))
        
        caracteristicas["num_colunas_detectadas"] = max_colunas
        
        if max_colunas >= 8:
            caracteristicas["formato_tabela"] = "complexa"
        elif max_colunas >= 4:
            caracteristicas["formato_tabela"] = "media"
        elif max_colunas >= 2:
            caracteristicas["formato_tabela"] = "simples"
        
        # Palavras-chave importantes
        keywords = ["EXTRATO", "DEMONSTRATIVO", "PARCELA", "PAGAMENTO", 
                   "ASSEMBLEIA", "CONTEMPLAÇÃO", "GRUPO", "COTA"]
        
        for kw in keywords:
            if kw in texto.upper():
                caracteristicas["palavras_chave_encontradas"].append(kw)
        
        return caracteristicas


class ExtracaoPortoSeguroLayoutOuvidoria:
    """Estratégia específica para layout problemático da Porto Seguro"""
    
    @staticmethod
    def extrair_nome(texto: str, texto_ocr: str = "") -> Optional[str]:
        """
        Extrai nome do cliente no layout Ouvidoria (difícil!)
        
        Estratégia:
        1. Procura depois de "PORTO SEGURO" e antes de "OUVIDORIA"
        2. Pega linha que parece nome (maiúsculas, sem números)
        3. Valida que não é "OUVIDORIA" nem outros campos
        """
        texto_busca = texto_ocr if texto_ocr else texto
        linhas = texto_busca.split('\n')
        
        # Procura entre "PORTO SEGURO" e "OUVIDORIA"
        porto_idx = -1
        ouvidoria_idx = -1
        
        for i, linha in enumerate(linhas[:40]):  # Primeiras 40 linhas
            linha_upper = linha.upper().strip()
            
            if "PORTO SEGURO" in linha_upper and porto_idx == -1:
                porto_idx = i
            
            if "OUVIDORIA" in linha_upper and ouvidoria_idx == -1:
                ouvidoria_idx = i
                break
        
        # Se encontrou ambos, procura nome entre eles
        if porto_idx >= 0 and ouvidoria_idx > porto_idx:
            for i in range(porto_idx + 1, ouvidoria_idx):
                linha = linhas[i].strip()
                
                # Nome geralmente: só letras maiúsculas, espaços, min 10 chars
                if (len(linha) >= 10 and 
                    linha.isupper() and 
                    re.match(r'^[A-ZÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜ\s]+$', linha)):
                    
                    # Valida que não é palavra-chave
                    palavras_invalidas = ["OUVIDORIA", "SAC", "ADMINISTRADORA", 
                                         "CONSÓRCIO", "EXTRATO", "CLIENTE", "CPF"]
                    
                    if not any(inv in linha for inv in palavras_invalidas):
                        logger.info(f"✅ Nome extraído (Layout Ouvidoria): {linha}")
                        return linha
        
        logger.warning("⚠️ Não conseguiu extrair nome no Layout Ouvidoria")
        return None
    
    @staticmethod
    def extrair_cpf(texto: str, texto_ocr: str = "") -> Optional[str]:
        """
        Extrai CPF no layout Ouvidoria
        
        Neste layout, CPF pode estar escondido ou formatado diferente
        """
        texto_busca = texto_ocr if texto_ocr else texto
        
        # Busca padrões de CPF
        patterns = [
            r'CPF[:\s]*(\d{3}[.\-]?\d{3}[.\-]?\d{3}[.\-]?\d{2})',
            r'\b(\d{3}[.\-]\d{3}[.\-]\d{3}[.\-]\d{2})\b',
            r'\b(\d{11})\b'  # CPF sem formatação
        ]
        
        for pattern in patterns:
            match = re.search(pattern, texto_busca, re.IGNORECASE)
            if match:
                cpf = re.sub(r'[^\d]', '', match.group(1))
                if len(cpf) == 11:
                    cpf_formatado = f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"
                    logger.info(f"✅ CPF extraído (Layout Ouvidoria): {cpf_formatado}")
                    return cpf_formatado
        
        logger.warning("⚠️ CPF não encontrado no Layout Ouvidoria")
        return None
    
    @staticmethod
    def extrair_parcelas(texto: str, texto_ocr: str = "") -> List[Dict[str, Any]]:
        """
        Extrai parcelas no layout Ouvidoria
        
        Este layout tem tabela mais simples, geralmente:
        Data | Valor ou Data Valor na mesma linha
        """
        texto_busca = texto_ocr if texto_ocr else texto
        linhas = texto_busca.split('\n')
        
        parcelas = []
        
        # Padrão: procura linhas com data + valor próximos
        for linha in linhas:
            # Busca data (DD/MM/YYYY ou DD/MM/YY)
            data_match = re.search(r'(\d{2}/\d{2}/\d{2,4})', linha)
            
            if data_match:
                data = data_match.group(1)
                
                # Busca valores após a data
                pos_data = data_match.end()
                resto_linha = linha[pos_data:]
                
                valores = re.findall(r'\d{1,3}(?:[.,]\d{3})*[.,]\d{2}', resto_linha)
                
                if valores:
                    # Pega o primeiro valor que parece razoável
                    for val_str in valores:
                        try:
                            valor = float(val_str.replace(".", "").replace(",", "."))
                            
                            # Valida que não é percentual
                            if valor > 1.0:
                                parcela = {
                                    "data_pagamento": data,
                                    "valor_pago": valor
                                }
                                parcelas.append(parcela)
                                break
                        except ValueError:
                            continue
        
        if parcelas:
            logger.info(f"✅ Extraiu {len(parcelas)} parcelas (Layout Ouvidoria)")
        else:
            logger.warning("⚠️ Nenhuma parcela extraída no Layout Ouvidoria")
        
        return parcelas


# Função auxiliar para escolher estratégia
def escolher_estrategia_extracao(administradora: str, texto: str, 
                                 texto_ocr: str = "") -> Dict[str, Any]:
    """
    Escolhe a estratégia de extração baseada no layout detectado
    
    Returns:
        Dicionário com funções de extração específicas e informações do layout
    """
    resultado = {
        "layout_detectado": "DESCONHECIDO",
        "estrategia": None,
        "info_layout": {},
        "funcoes_customizadas": {}
    }
    
    # Porto Seguro tem múltiplos layouts conhecidos
    if "PORTO SEGURO" in administradora.upper():
        layout_nome, layout_info = DetectorLayout.detectar_layout_porto(texto)
        
        resultado["layout_detectado"] = layout_nome
        resultado["info_layout"] = layout_info
        
        if layout_nome == "LAYOUT_OUVIDORIA":
            resultado["estrategia"] = "CUSTOM_OUVIDORIA"
            resultado["funcoes_customizadas"] = {
                "extrair_nome": ExtracaoPortoSeguroLayoutOuvidoria.extrair_nome,
                "extrair_cpf": ExtracaoPortoSeguroLayoutOuvidoria.extrair_cpf,
                "extrair_parcelas": ExtracaoPortoSeguroLayoutOuvidoria.extrair_parcelas
            }
            logger.info("🎯 Usando estratégia customizada para Layout Ouvidoria da Porto Seguro")
    
    # Outras administradoras: detecção genérica
    else:
        info = DetectorLayout.detectar_layout_generico(texto, administradora)
        resultado["layout_detectado"] = "GENERICO"
        resultado["info_layout"] = info
        resultado["estrategia"] = "PADRAO"
    
    return resultado
