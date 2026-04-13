# -*- coding: utf-8 -*-
"""
🚀 INTEGRAÇÃO ML: Administradoras + Extratos
Conecta o sistema de administradoras com machine learning de extratos
"""

import re
from typing import Dict, Any, Optional
from app.utils.gerenciador_administradoras import gerenciador_administradoras
from app.aprendizado.correcao_automatica import aprendizado_correcao

class MLExtratoAdministradora:
    """Integra dados de administradoras com ML de extratos"""
    
    def __init__(self):
        self.gerenciador = gerenciador_administradoras
        self.ml_correcao = aprendizado_correcao
    
    def extrair_cnpj_do_texto(self, texto: str) -> Optional[str]:
        """Extrai CNPJ do texto do extrato"""
        # Padrões de CNPJ: 12.345.678/0001-90 ou 12345678000190
        padroes = [
            r'\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b',  # Formatado
            r'\b\d{14}\b'  # Sem formatação
        ]
        
        for padrao in padroes:
            matches = re.findall(padrao, texto)
            for match in matches:
                cnpj_limpo = ''.join(filter(str.isdigit, match))
                if len(cnpj_limpo) == 14:
                    return cnpj_limpo
        return None
    
    def enriquecer_extrato_com_dados_administradora(self, dados_extrato: Dict[str, Any]) -> Dict[str, Any]:
        """
        🧠 TURBOCHARGE: Enriquece dados do extrato com informações de administradora
        """
        texto_extrato = dados_extrato.get("texto_bruto", "")
        
        # 1. Busca CNPJ no texto
        cnpj_encontrado = self.extrair_cnpj_do_texto(texto_extrato)
        
        if cnpj_encontrado:
            # 2. Busca dados da administradora
            dados_admin = self.gerenciador.buscar_por_cnpj(cnpj_encontrado)
            
            if dados_admin:
                # 3. ENRIQUECE os dados do extrato
                dados_extrato.update({
                    "administradora_detectada": dados_admin["nome"],
                    "cnpj_detectado": dados_admin["cnpj"], 
                    "cep_administradora": dados_admin.get("cep"),
                    "contexto_geografico": self._obter_contexto_geografico(dados_admin.get("cep")),
                    "fonte_deteccao": "ml_automatico"
                })
                
                # 4. APRENDE automaticamente no sistema de correção
                self._registrar_aprendizado_automatico(dados_admin, dados_extrato)
                
                print(f"🎯 ML: Extrato enriquecido com {dados_admin['nome']}")
                
        return dados_extrato
    
    def _obter_contexto_geografico(self, cep: str) -> Dict[str, Any]:
        """Obtém contexto geográfico do CEP"""
        if not cep:
            return {}
            
        try:
            import requests
            resp = requests.get(f"http://localhost:8000/comarca-por-cep/{cep}", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "comarca": data.get("comarca"),
                    "uf": data.get("comarca", "").split(" - ")[-1] if " - " in data.get("comarca", "") else None
                }
        except:
            pass
        
        return {}
    
    def _registrar_aprendizado_automatico(self, dados_admin: Dict, dados_extrato: Dict):
        """Registra no sistema de ML como aprendizado automático"""
        try:
            contexto = {
                "cnpj": dados_admin["cnpj"],
                "cep": dados_admin.get("cep"),
                "fonte": "deteccao_automatica_cnpj",
                "tipo": "enriquecimento_extrato"
            }
            
            # Registra aprendizado de administradora
            self.ml_correcao.capturar_correcao(
                administradora=dados_admin["nome"],
                campo="administradora_auto",
                valor_original="NAO_DETECTADO",
                valor_corrigido=dados_admin["nome"],
                contexto=contexto
            )
            
            # Se tem comarca, registra também
            comarca = dados_extrato.get("contexto_geografico", {}).get("comarca")
            if comarca:
                self.ml_correcao.capturar_correcao(
                    administradora=dados_admin["nome"],
                    campo="comarca_auto", 
                    valor_original="NAO_DETECTADO",
                    valor_corrigido=comarca,
                    contexto=contexto
                )
                
        except Exception as e:
            print(f"[ML] Erro ao registrar aprendizado: {e}")
    
    def detectar_e_corrigir_campo_comarca(self, dados_extrato: Dict[str, Any]) -> Dict[str, Any]:
        """
        🎯 CORREÇÃO AUTOMÁTICA: Detecta e corrige comarca automaticamente
        """
        cnpj = dados_extrato.get("cnpj_detectado")
        if not cnpj:
            return dados_extrato
            
        # Busca administradora
        dados_admin = self.gerenciador.buscar_por_cnpj(cnpj)
        if not dados_admin or not dados_admin.get("cep"):
            return dados_extrato
            
        # Busca comarca pelo CEP
        contexto_geo = self._obter_contexto_geografico(dados_admin["cep"])
        comarca_correta = contexto_geo.get("comarca")
        
        if comarca_correta:
            comarca_atual = dados_extrato.get("comarca", "")
            
            # Se comarca atual está vazia ou diferente, corrige automaticamente
            if not comarca_atual or comarca_atual != comarca_correta:
                dados_extrato["comarca"] = comarca_correta
                dados_extrato["comarca_corrigida_automaticamente"] = True
                
                print(f"🔧 ML: Comarca corrigida automaticamente para {comarca_correta}")
                
                # Registra como correção automática no ML
                if comarca_atual:
                    self.ml_correcao.capturar_correcao(
                        administradora=dados_admin["nome"],
                        campo="comarca",
                        valor_original=comarca_atual,
                        valor_corrigido=comarca_correta,
                        contexto={"fonte": "correcao_automatica_cep"}
                    )
        
        return dados_extrato

# Instância global
ml_extrato_admin = MLExtratoAdministradora()