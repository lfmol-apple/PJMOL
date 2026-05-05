#!/usr/bin/env python3
# backend/test_all_functions.py
"""
Script para testar todas as funcionalidades críticas do backend localmente
antes de fazer deploy para o servidor.
"""

import os
import sys
import tempfile
import requests
import json
from pathlib import Path

# Adiciona o diretório do app ao Python path
backend_dir = Path(__file__).parent
sys.path.append(str(backend_dir))

def test_paths():
    """Testa se todos os caminhos são criados corretamente"""
    print("🔍 Testando caminhos...")
    
    try:
        from app.utils.paths import (
            get_backend_root, get_app_root, get_documentos_dir,
            get_temp_uploads_dir, get_modelos_dir, get_static_dir,
            get_storage_dir, ensure_all_dirs
        )
        
        # Testa se todas as funções retornam caminhos válidos
        paths = {
            "Backend root": get_backend_root(),
            "App root": get_app_root(),
            "Documentos": get_documentos_dir(),
            "Temp uploads": get_temp_uploads_dir(),
            "Modelos": get_modelos_dir(),
            "Static": get_static_dir(),
            "Storage": get_storage_dir()
        }
        
        for name, path in paths.items():
            if os.path.exists(path):
                print(f"  ✅ {name}: {path}")
            else:
                print(f"  ❌ {name}: {path} (não existe)")
                return False
        
        ensure_all_dirs()
        print("  ✅ Todas as pastas criadas com sucesso")
        return True
        
    except Exception as e:
        print(f"  ❌ Erro ao testar caminhos: {e}")
        return False

def test_imports():
    """Testa se todos os imports críticos funcionam"""
    print("🔍 Testando imports...")
    
    try:
        # Testa imports principais
        from app.main import app
        print("  ✅ app.main importado")
        
        from app.extracao.leitura_pdf import extrair_dados_pdf
        print("  ✅ extrair_dados_pdf importado")
        
        from app.routes.documentos import router as docs_router
        print("  ✅ routes.documentos importado")
        
        from app.routes.uploads import router as uploads_router
        print("  ✅ routes.uploads importado")
        
        from app.routes.advogado import router as advogado_router
        print("  ✅ routes.advogado importado")
        
        return True
        
    except Exception as e:
        print(f"  ❌ Erro ao importar: {e}")
        return False

def test_pdf_processing():
    """Testa processamento básico de PDF"""
    print("🔍 Testando processamento de PDF...")
    
    try:
        from app.extracao.leitura_pdf import extrair_dados_pdf
        
        # Cria um arquivo de teste (não é PDF real, mas testa o fluxo)
        temp_file = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        temp_file.write(b'%PDF-1.4\nTest PDF content')
        temp_file.close()
        
        # Tenta processar (esperamos que falhe graciosamente)
        try:
            result = extrair_dados_pdf(temp_file.name, debug=False)
            print("  ✅ Função de extração executou sem erro fatal")
        except Exception as e:
            # É esperado que falhe com PDF inválido, mas deve ser erro controlado
            if "PDF" in str(e) or "invalid" in str(e).lower():
                print("  ✅ Erro controlado para PDF inválido")
            else:
                print(f"  ❌ Erro inesperado: {e}")
                return False
        finally:
            os.unlink(temp_file.name)
        
        return True
        
    except Exception as e:
        print(f"  ❌ Erro ao testar PDF: {e}")
        return False

def test_document_generation():
    """Testa geração de documentos"""
    print("🔍 Testando geração de documentos...")
    
    try:
        from app.utils.paths import get_documentos_dir, get_modelos_dir
        
        docs_dir = get_documentos_dir()
        modelos_dir = get_modelos_dir()
        
        # Verifica se as pastas existem
        if not os.path.exists(docs_dir):
            print(f"  ❌ Pasta de documentos não existe: {docs_dir}")
            return False
            
        if not os.path.exists(modelos_dir):
            print(f"  ❌ Pasta de modelos não existe: {modelos_dir}")
            return False
        
        # Testa se consegue criar arquivo de teste
        test_file = os.path.join(docs_dir, "teste.txt")
        with open(test_file, 'w') as f:
            f.write("teste")
        
        if os.path.exists(test_file):
            os.remove(test_file)
            print("  ✅ Consegue criar arquivos na pasta de documentos")
        else:
            print("  ❌ Não consegue criar arquivos na pasta de documentos")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Erro ao testar geração de documentos: {e}")
        return False

def test_file_operations():
    """Testa operações de arquivo (upload, etc)"""
    print("🔍 Testando operações de arquivo...")
    
    try:
        from app.utils.paths import get_temp_uploads_dir, get_storage_dir
        
        temp_dir = get_temp_uploads_dir()
        storage_dir = get_storage_dir()
        
        # Testa criação de arquivo temporário
        test_file = os.path.join(temp_dir, "teste_upload.txt")
        with open(test_file, 'w') as f:
            f.write("teste upload")
        
        if os.path.exists(test_file):
            print("  ✅ Consegue criar arquivos em temp_uploads")
            os.remove(test_file)
        else:
            print("  ❌ Não consegue criar arquivos em temp_uploads")
            return False
        
        # Testa storage
        test_storage = os.path.join(storage_dir, "teste_storage.txt")
        with open(test_storage, 'w') as f:
            f.write("teste storage")
        
        if os.path.exists(test_storage):
            print("  ✅ Consegue criar arquivos em storage")
            os.remove(test_storage)
        else:
            print("  ❌ Não consegue criar arquivos em storage")
            return False
        
        return True
        
    except Exception as e:
        print(f"  ❌ Erro ao testar operações de arquivo: {e}")
        return False

def main():
    """Executa todos os testes"""
    print("🚀 Iniciando testes do backend local...")
    print("=" * 50)
    
    tests = [
        ("Caminhos", test_paths),
        ("Imports", test_imports),
        ("Processamento PDF", test_pdf_processing),
        ("Geração de documentos", test_document_generation),
        ("Operações de arquivo", test_file_operations),
    ]
    
    results = []
    for name, test_func in tests:
        print(f"\n📋 {name}")
        result = test_func()
        results.append((name, result))
    
    print("\n" + "=" * 50)
    print("📊 RESUMO DOS TESTES:")
    
    all_passed = True
    for name, passed in results:
        status = "✅ PASSOU" if passed else "❌ FALHOU"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False
    
    if all_passed:
        print("\n🎉 TODOS OS TESTES PASSARAM!")
        print("✅ Backend está pronto para deploy!")
        return 0
    else:
        print("\n❌ ALGUNS TESTES FALHARAM!")
        print("🔧 Corrija os problemas antes do deploy!")
        return 1

if __name__ == "__main__":
    sys.exit(main())