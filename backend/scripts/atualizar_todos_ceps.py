#!/usr/bin/env python3
"""
🚀 COMANDO SIMPLES: Buscar todos os CEPs de uma vez

Execute: python atualizar_todos_ceps.py

O que faz:
- ✅ Busca CEP de TODAS as administradoras sem CEP
- ✅ Salva automaticamente no arquivo JSON  
- ✅ Integra com sistema de Machine Learning
- ✅ Usa retry inteligente (3 tentativas por CNPJ)
- ✅ Pausa entre requisições para não sobrecarregar API
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent))

import requests
import time
from app.utils.gerenciador_administradoras import gerenciador_administradoras

def main():
    print("🚀 BUSCANDO TODOS OS CEPs...")
    
    dados = gerenciador_administradoras.carregar_dados()
    sem_cep = [(nome, ''.join(filter(str.isdigit, info["cnpj"]))) 
               for nome, info in dados.items() if not info.get("cep")]
    
    print(f"📊 {len(sem_cep)} administradoras precisam de CEP")
    
    sucessos = 0
    for i, (nome, cnpj) in enumerate(sem_cep, 1):
        print(f"[{i}/{len(sem_cep)}] {nome[:40]}...")
        
        # 3 tentativas por CNPJ
        for tentativa in range(1, 4):
            try:
                resp = requests.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}", timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    cep = data.get("cep", "").strip()
                    nome_oficial = data.get("razao_social", "").strip()
                    
                    if cep:
                        gerenciador_administradoras.adicionar_ou_atualizar(
                            cnpj, nome_oficial or nome, cep, "busca_automatica"
                        )
                        print(f"  ✅ CEP: {cep}")
                        sucessos += 1
                        break
                    else:
                        print(f"  ⚠️  Sem CEP na resposta")
                        break
                else:
                    print(f"  ❌ Status {resp.status_code} (tentativa {tentativa})")
                    
            except Exception as e:
                print(f"  ❌ Erro tentativa {tentativa}: {str(e)[:50]}")
                
            if tentativa < 3:
                time.sleep(2)  # Pausa entre tentativas
        
        time.sleep(1)  # Pausa entre CNPJs
    
    print(f"\n🎯 CONCLUÍDO: {sucessos}/{len(sem_cep)} CEPs encontrados!")
    print("📄 Dados salvos automaticamente em administradoras.json")

if __name__ == "__main__":
    main()