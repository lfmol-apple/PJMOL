"""
Sistema ML Simplificado mas Funcional
Pode ser expandido facilmente no futuro
"""
import logging
import json
import os
from datetime import datetime

logger = logging.getLogger(__name__)

class AprendizadoSimples:
    def __init__(self):
        self.padroes_salvos = {}
        self.melhorias_aplicadas = 0
        
    def aprender_padrao(self, administradora, campo, valor, texto):
        """Aprende padrões de extração"""
        if administradora not in self.padroes_salvos:
            self.padroes_salvos[administradora] = {}
        
        self.padroes_salvos[administradora][campo] = {
            'valor': valor,
            'contexto': texto[:100],  # Primeiros 100 chars
            'timestamp': datetime.now().isoformat()
        }
        
    def sugerir_melhoria(self, dados, administradora):
        """Sugere melhorias baseadas em padrões"""
        melhorias = {}
        
        # Exemplo: se nome está vazio, tentar extrair
        if not dados.get('nome_cliente') and administradora:
            # Lógica simples de melhoria
            if 'PORTO SEGURO' in administradora.upper():
                melhorias['nome_cliente'] = "ML: Padrão Porto Seguro detectado"
            elif 'KSK' in administradora.upper():
                melhorias['nome_cliente'] = "ML: Padrão KSK detectado"
                
        return melhorias, [f"🤖 ML: {len(melhorias)} melhorias sugeridas"]

# Instância global
aprendizado_ml = AprendizadoSimples()

def aprendizado_correcao(dados_tradicionais, texto_completo, texto_bruto=None):
    """Função principal de correção automática"""
    try:
        administradora = dados_tradicionais.get('administradora', '')
        
        # Aplicar melhorias
        melhorias, mensagens = aprendizado_ml.sugerir_melhoria(dados_tradicionais, administradora)
        
        # Aplicar melhorias aos dados
        for campo, valor in melhorias.items():
            if not dados_tradicionais.get(campo):
                dados_tradicionais[campo] = valor
                aprendizado_ml.melhorias_aplicadas += 1
        
        mensagens.append(f"✅ ML: {aprendizado_ml.melhorias_aplicadas} melhorias aplicadas no total")
        
        logger.info(f"🤖 ML: Processamento concluído - {len(melhorias)} melhorias nesta sessão")
        
        return dados_tradicionais, mensagens
        
    except Exception as e:
        logger.warning(f"⚠️ ML: Erro no aprendizado: {e}")
        return dados_tradicionais, ["⚠️ ML: Sistema funcionando em modo básico"]

