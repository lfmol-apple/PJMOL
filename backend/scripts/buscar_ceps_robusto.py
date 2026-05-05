#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script ROBUSTO para buscar CEPs - usa múltiplas APIs como fallback
"""

import sys
import os
import time
import requests
from pathlib import Path

sys.path.append(str(Path(__file__).parent))
from app.utils.gerenciador_administradoras import gerenciador_administradoras

def buscar_cnpj_multiplas_apis(cnpj):
    """Tenta buscar CNPJ em múltiplas APIs"""
    apis = [
        {
            "nome": "BrasilAPI",
            "url": f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}",
            "extrator": lambda data: (data.get("cep", ""), data.get("razao_social", ""))
        },
        {
            "nome": "ReceitaWS",
            "url": f"https://www.receitaws.com.br/v1/cnpj/{cnpj}",
            "extrator": lambda data: (data.get("cep", ""), data.get("nome", ""))
        }
    ]
    
    for api in apis:
        try:
            print(f"   🔄 Tentando {api['nome']}...")
            resposta = requests.get(api["url"], timeout=10)
            
            if resposta.status_code == 200:
                dados = resposta.json()
                if "erro" not in dados and "error" not in dados:
                    cep, nome = api["extrator"](dados)
                    if cep and cep.strip():
                        print(f"   ✅ {api['nome']}: CEP {cep}")
                        return cep.strip(), nome.strip()
                    else:
                        print(f"   ⚠️  {api['nome']}: Sem CEP nos dados")
                else:
                    print(f"   ❌ {api['nome']}: Erro nos dados")
            else:
                print(f"   ❌ {api['nome']}: Status {resposta.status_code}")
                
        except Exception as e:
            print(f"   ❌ {api['nome']}: {str(e)}")
            
        time.sleep(1)  # Pausa entre APIs
    
    return None, None

def buscar_ceps_robusto():
    """Busca CEPs usando múltiplas APIs"""
    print("🚀 Busca ROBUSTA de CEPs (múltiplas APIs)...")
    
    dados = gerenciador_administradoras.carregar_dados()
    sem_cep = []
    
    for nome, info in dados.items():
        if not info.get("cep"):
            cnpj_limpo = ''.join(filter(str.isdigit, info["cnpj"]))
            sem_cep.append({"nome": nome, "cnpj": cnpj_limpo})
    
    print(f"📊 {len(sem_cep)} administradoras sem CEP")
    
    if not sem_cep:
        print("🎉 Todas já têm CEP!")
        return
    
    # Processar apenas as primeiras 10 para teste
    limite = min(10, len(sem_cep))
    print(f"🎯 Processando primeiras {limite} para teste...")
    
    sucesso = 0
    
    for i, admin in enumerate(sem_cep[:limite], 1):
        nome = admin["nome"]
        cnpj = admin["cnpj"]
        
        print(f"\n[{i}/{limite}] 🔍 {nome[:50]}...")
        
        cep, nome_oficial = buscar_cnpj_multiplas_apis(cnpj)
        
        if cep:
            gerenciador_administradoras.adicionar_ou_atualizar(
                cnpj, nome_oficial or nome, cep, fonte="busca_robusta"
            )
            sucesso += 1
            print(f"   🎉 SUCESSO! CEP {cep} salvo")
        else:
            print(f"   💔 Nenhuma API retornou CEP")
        
        time.sleep(3)  # Pausa entre CNPJs
    
    print(f"\n📈 RESULTADO: {sucesso}/{limite} sucessos!")

if __name__ == "__main__":
    try:
        buscar_ceps_robusto()
    except KeyboardInterrupt:
        print("\n⏹️  Cancelado")