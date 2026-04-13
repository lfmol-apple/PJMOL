"""
Sistema ML Completo e Funcional
Versão simplificada que funciona sem dependências complexas
"""
import logging
import re
import json
from datetime import datetime
from .aprendizado_simples import aprendizado_ml

logger = logging.getLogger(__name__)

class MLExtratorAutomatico:
    """
    Extrator ML que FUNCIONA de verdade
    Pode ser expandido facilmente
    """
    
    def __init__(self):
        self.versao = "1.0.0"
        self.melhorias_sessao = 0
        self.padroes_detectados = {}
        logger.info("🚀 ML Sistema inicializado com sucesso!")
        
    def detectar_administradora(self, texto):
        """Detecta administradora no texto"""
        texto_upper = texto.upper()
        
        if "PORTO SEGURO" in texto_upper:
            return "PORTO SEGURO"
        elif "KSK" in texto_upper:
            return "KSK"
        elif "SANTANDER" in texto_upper:
            return "SANTANDER"
        elif "BRADESCO" in texto_upper:
            return "BRADESCO"
        
        return "DESCONHECIDA"
        
    def extrair_nome_inteligente(self, texto, administradora):
        """Extração inteligente de nomes"""
        
        # Padrões específicos por administradora
        if "PORTO SEGURO" in administradora.upper():
            # Padrão Grupo:XXX Cota:XXX NOME Contrato:
            match = re.search(r'Grupo:\s*[A-Z0-9]+\s+Cota:\s*[0-9-]+\s+([A-ZÀ-ÿ0-9\s]{5,60}?)\s+Contrato:', texto, re.IGNORECASE)
            if match:
                return match.group(1).strip()
                
        elif "KSK" in administradora.upper():
            # Padrão específico KSK
            match = re.search(r'Nome:\s*([A-ZÀ-ÿa-z\s]{5,50})', texto, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        
        return None
        
    def melhorar_extracao_com_ml(self, dados_tradicionais, texto_completo, texto_bruto=None):
        """
        Método principal de melhoria ML
        ESTE É O MÉTODO QUE O SISTEMA CHAMA!
        """
        try:
            logger.info("🤖 ML: Iniciando análise inteligente...")
            
            dados_melhorados = dados_tradicionais.copy()
            mensagens_ml = []
            
            # Detectar administradora
            admin_detectada = self.detectar_administradora(texto_completo)
            if admin_detectada != "DESCONHECIDA":
                mensagens_ml.append(f"🎯 ML: {admin_detectada} detectada")
            
            # Melhorar nome se estiver vazio
            if not dados_melhorados.get('nome_cliente'):
                nome_ml = self.extrair_nome_inteligente(texto_completo, admin_detectada)
                if nome_ml:
                    dados_melhorados['nome_cliente'] = nome_ml
                    mensagens_ml.append(f"✅ ML: Nome extraído - {nome_ml[:30]}...")
                    self.melhorias_sessao += 1
            
            # Aplicar correções automáticas
            dados_com_correcoes, msgs_correcao = aprendizado_ml.sugerir_melhoria(dados_melhorados, admin_detectada)
            mensagens_ml.extend(msgs_correcao)
            
            # Atualizar dados
            dados_melhorados.update(dados_com_correcoes)
            
            mensagens_ml.append(f"📊 ML: {self.melhorias_sessao} melhorias nesta sessão")
            logger.info(f"🎯 ML: Processamento concluído - {len(mensagens_ml)} ações realizadas")
            
            return dados_melhorados, mensagens_ml
            
        except Exception as e:
            logger.error(f"❌ ML: Erro no processamento: {e}")
            return dados_tradicionais, ["⚠️ ML: Erro no processamento, usando dados originais"]
    
    def extrair_com_ml(self, dados_tradicionais, texto_bruto, texto_limpo):
        """
        Método de extração com ML
        """
        return self.melhorar_extracao_com_ml(dados_tradicionais, texto_limpo, texto_bruto)
    
    def aprender_de_extracao(self, dados_finais, texto_original):
        """Aprende com os resultados finais"""
        try:
            admin = dados_finais.get('administradora', '')
            nome = dados_finais.get('nome_cliente', '')
            
            if admin and nome:
                aprendizado_ml.aprender_padrao(admin, 'nome_cliente', nome, texto_original)
                logger.info(f"🧠 ML: Padrão aprendido para {admin}")
                
        except Exception as e:
            logger.warning(f"⚠️ ML: Erro no aprendizado: {e}")

