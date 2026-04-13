"""
Sistema ML Simples e Funcional - SEM DEPENDÊNCIAS COMPLEXAS
"""
import logging
import re

logger = logging.getLogger(__name__)

class MLExtratorAutomatico:
    def __init__(self):
        self.versao = "1.0-SIMPLES"
        self.melhorias = 0
        logger.info("🚀 ML Simples iniciado!")
        
    def melhorar_extracao_com_ml(self, dados_tradicionais, texto_completo, texto_bruto=None):
        """Método principal - melhora dados com ML simples"""
        try:
            dados_ml = dados_tradicionais.copy()
            mensagens = []
            
            # ML 1: Extrair nome se estiver vazio (Porto Seguro)
            if not dados_ml.get("nome_cliente") and "PORTO SEGURO" in texto_completo.upper():
                match = re.search(r"Grupo:\s*[A-Z0-9]+\s+Cota:\s*[0-9-]+\s+([A-ZÀ-ÿ0-9\s]{5,60}?)\s+Contrato:", texto_completo, re.IGNORECASE)
                if match:
                    nome = match.group(1).strip()
                    dados_ml["nome_cliente"] = nome
                    mensagens.append(f"🤖 ML: Nome extraído - {nome}")
                    self.melhorias += 1
            
            # ML 2: Detectar administradora se não detectada
            if not dados_ml.get("administradora"):
                texto_upper = texto_completo.upper()
                if "PORTO SEGURO" in texto_upper:
                    dados_ml["administradora"] = "PORTO SEGURO ADMINISTRADORA"
                    mensagens.append("🎯 ML: Porto Seguro detectado")
                elif "KSK" in texto_upper:
                    dados_ml["administradora"] = "KSK ADMINISTRADORA"  
                    mensagens.append("🎯 ML: KSK detectado")
            
            mensagens.append(f"📊 ML: {self.melhorias} melhorias total")
            logger.info(f"🤖 ML: Processamento OK - {len(mensagens)} ações")
            
            return dados_ml, mensagens
            
        except Exception as e:
            logger.error(f"❌ ML: Erro {e}")
            return dados_tradicionais, ["⚠️ ML: Erro, usando dados originais"]
    
    def extrair_com_ml(self, dados_tradicionais, texto_bruto, texto_limpo):
        """Método alternativo"""
        return self.melhorar_extracao_com_ml(dados_tradicionais, texto_limpo, texto_bruto)
