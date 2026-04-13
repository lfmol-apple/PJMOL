#!/usr/bin/env python3
"""
Script de manutenção periódica da storage.
- Remove arquivos órfãos de extratos deletados
- Limpa pastas vazias
- Gera relatório de integridade
"""

import os
import sys
import requests
from pathlib import Path
import json

def get_active_extratos():
    """Busca IDs dos extratos ativos no banco."""
    try:
        response = requests.get("http://localhost:8000/extratos")
        response.raise_for_status()
        extratos = response.json()
        return [str(extrato['id']) for extrato in extratos]
    except Exception as e:
        print(f"❌ Erro ao buscar extratos ativos: {e}")
        return []

def cleanup_orphaned_files():
    """Remove arquivos de extratos que não existem mais no banco."""
    storage_path = Path("/Users/leonardomol/Jao/105 19/backend/app/storage")
    active_extratos = get_active_extratos()
    
    if not active_extratos:
        print("⚠️ Não foi possível obter lista de extratos ativos. Abortando limpeza.")
        return 0, 0
    
    print(f"📋 Extratos ativos: {', '.join(active_extratos)}")
    
    orphaned_files = 0
    orphaned_dirs = 0
    
    # Limpar anexos órfãos
    anexos_path = storage_path / "anexos"
    if anexos_path.exists():
        for extrato_folder in anexos_path.iterdir():
            if extrato_folder.is_dir() and extrato_folder.name not in active_extratos:
                print(f"🗑️ Removendo anexos órfãos do extrato {extrato_folder.name}")
                # Contar arquivos antes de remover
                for root, dirs, files in os.walk(extrato_folder):
                    orphaned_files += len(files)
                    orphaned_dirs += len(dirs)
                
                import shutil
                shutil.rmtree(extrato_folder)
                orphaned_dirs += 1
    
    # Limpar extratos órfãos
    extratos_path = storage_path / "extratos"
    if extratos_path.exists():
        for extrato_folder in extratos_path.iterdir():
            if extrato_folder.is_dir() and extrato_folder.name not in active_extratos:
                print(f"🗑️ Removendo extratos órfãos do ID {extrato_folder.name}")
                # Contar arquivos antes de remover
                for root, dirs, files in os.walk(extrato_folder):
                    orphaned_files += len(files)
                
                import shutil
                shutil.rmtree(extrato_folder)
                orphaned_dirs += 1
    
    # Limpar assinaturas órfãs
    assinaturas_path = storage_path / "assinaturas"
    if assinaturas_path.exists():
        for extrato_folder in assinaturas_path.iterdir():
            if extrato_folder.is_dir() and extrato_folder.name not in active_extratos:
                print(f"🗑️ Removendo assinaturas órfãs do extrato {extrato_folder.name}")
                # Contar arquivos antes de remover
                for root, dirs, files in os.walk(extrato_folder):
                    orphaned_files += len(files)
                    orphaned_dirs += len(dirs)
                
                import shutil
                shutil.rmtree(extrato_folder)
                orphaned_dirs += 1
    
    return orphaned_files, orphaned_dirs

def generate_integrity_report():
    """Gera relatório de integridade da storage."""
    storage_path = Path("/Users/leonardomol/Jao/105 19/backend/app/storage")
    
    if not storage_path.exists():
        print("❌ Pasta storage não encontrada!")
        return
    
    print("\n" + "="*60)
    print("📊 RELATÓRIO DE INTEGRIDADE DA STORAGE")
    print("="*60)
    
    # Estatísticas gerais
    total_size = 0
    total_files = 0
    total_dirs = 0
    
    for root, dirs, files in os.walk(storage_path):
        total_dirs += len(dirs)
        for file in files:
            file_path = Path(root) / file
            total_files += 1
            total_size += file_path.stat().st_size
    
    print(f"📁 Total de diretórios: {total_dirs}")
    print(f"📄 Total de arquivos: {total_files}")
    print(f"💾 Tamanho total: {total_size / (1024*1024):.1f} MB")
    
    # Estatísticas por tipo
    for storage_type in ["anexos", "extratos", "assinaturas"]:
        type_path = storage_path / storage_type
        if type_path.exists():
            type_files = 0
            type_size = 0
            extratos_count = len([d for d in type_path.iterdir() if d.is_dir()])
            
            for root, dirs, files in os.walk(type_path):
                for file in files:
                    file_path = Path(root) / file
                    type_files += 1
                    type_size += file_path.stat().st_size
            
            print(f"\n{storage_type.upper()}:")
            print(f"  📊 Extratos: {extratos_count}")
            print(f"  📄 Arquivos: {type_files}")
            print(f"  💾 Tamanho: {type_size / (1024*1024):.1f} MB")
    
    print("\n" + "="*60)

def main():
    print("🔧 MANUTENÇÃO DA STORAGE")
    print("="*40)
    
    # Limpeza de arquivos órfãos
    orphaned_files, orphaned_dirs = cleanup_orphaned_files()
    
    if orphaned_files > 0 or orphaned_dirs > 0:
        print(f"\n✅ Limpeza concluída:")
        print(f"🗑️ Arquivos órfãos removidos: {orphaned_files}")
        print(f"📁 Diretórios órfãos removidos: {orphaned_dirs}")
    else:
        print(f"\n✅ Nenhum arquivo órfão encontrado!")
    
    # Remover pastas vazias
    import subprocess
    result = subprocess.run([
        "find", "/Users/leonardomol/Jao/105 19/backend/app/storage", 
        "-type", "d", "-empty", "-delete"
    ], capture_output=True)
    
    # Relatório de integridade
    generate_integrity_report()

if __name__ == "__main__":
    main()