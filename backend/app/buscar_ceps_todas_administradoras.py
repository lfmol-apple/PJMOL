#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para buscar CEPs de todas as administradoras automaticamente
"""

import sys
import os
import time
import requests
from pathlib import Path

# Adiciona o diretório app ao path
sys.path.append(str(Path(__file__).parent))

from app.utils.gerenciador_administradoras import gerenciador_administradoras

def buscar_ceps_automatico():
    """Busca CEPs de todas as administradoras que não têm CEP"""
    print("🚀 Iniciando busca automática de CEPs...")
    
    dados = gerenciador_administradoras.carregar_dados()
    total = len(dados)
    sem_cep = []
    
    # Identifica administradoras sem CEP
    for nome, info in dados.items():
        if not info.get("cep"):
            cnpj_limpo = ''.join(filter(str.isdigit, info["cnpj"]))
            sem_cep.append({
                "nome": nome,
                "cnpj": cnpj_limpo
            })
    
    print(f"📊 Total de administradoras: {total}")
    print(f"📍 Sem CEP: {len(sem_cep)}")
    print(f"✅ Com CEP: {total - len(sem_cep)}")
    print()
    
    if not sem_cep:
        print("🎉 Todas as administradoras já têm CEP!")
        return
    
    sucesso = 0
    falhas = 0
    
    for i, admin in enumerate(sem_cep, 1):
        nome = admin["nome"]
        cnpj = admin["cnpj"]
        
        print(f"[{i}/{len(sem_cep)}] 🔍 Buscando CEP para {nome[:50]}...")
        
        try:
            # Busca na BrasilAPI
            resposta = requests.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}", timeout=10)
            
            if resposta.status_code == 200:
                dados_api = resposta.json()
                cep = dados_api.get("cep", "").strip()
                nome_oficial = dados_api.get("razao_social", "").strip()
                
                if cep:
                    # Salva no sistema
                    gerenciador_administradoras.adicionar_ou_atualizar(
                        cnpj, nome_oficial or nome, cep, fonte="busca_automatica"
                    )
                    print(f"   ✅ CEP encontrado: {cep}")
                    sucesso += 1
                else:
                    print(f"   ⚠️  API retornou dados mas sem CEP")
                    falhas += 1
                    
            elif resposta.status_code == 429:
                print(f"   ⏸️  Rate limit - aguardando 5 segundos...")
                time.sleep(5)
                continue
                
            else:
                print(f"   ❌ API falhou: {resposta.status_code}")
                falhas += 1
                
        except Exception as e:
            print(f"   ❌ Erro: {str(e)}")
            falhas += 1
        
        # Pausa entre requisições para não sobrecarregar a API
        if i < len(sem_cep):
            time.sleep(2)
    
    print()
    print("📈 RELATÓRIO FINAL:")
    print(f"✅ Sucessos: {sucesso}")
    print(f"❌ Falhas: {falhas}")
    print(f"📊 Taxa de sucesso: {(sucesso/(sucesso+falhas)*100):.1f}%" if (sucesso+falhas) > 0 else "0%")
    
    if sucesso > 0:
        print()
        print("🎯 CEPs encontrados foram salvos automaticamente!")
        print("📄 Verifique o arquivo administradoras.json para confirmar")

if __name__ == "__main__":
    try:
        buscar_ceps_automatico()
    except KeyboardInterrupt:
        print("\n⏹️  Operação cancelada pelo usuário")
    except Exception as e:
        print(f"\n💥 Erro inesperado: {e}")