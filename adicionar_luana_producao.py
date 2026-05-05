#!/usr/bin/env python3
"""Script para adicionar Luana no servidor de produção."""

import sys
from pathlib import Path

backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.usuario import Usuario
from app.utils.security import gerar_hash_senha

# Conexão com banco de produção
DATABASE_URL = "sqlite:////var/www/pjmol/backend/app/database.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def criar_luana_producao():
    """Cria a usuária Luana no banco de produção."""
    
    nome = "LUANA DOS SANTOS ROCHA"
    email = "luanadsrocha12@gmail.com"
    telefone = "31983962641"
    senha = "A85jj6d4"
    perfil = "gerente"
    is_admin = False
    
    print("\n" + "="*60)
    print("  ADICIONANDO LUANA NO SERVIDOR DE PRODUÇÃO")
    print("="*60 + "\n")
    
    db = SessionLocal()
    try:
        # Verifica se já existe
        usuario_existente = db.query(Usuario).filter(Usuario.email == email.lower()).first()
        if usuario_existente:
            print(f"⚠️  Usuária já existe no servidor de produção!")
            print(f"   ID: {usuario_existente.id}")
            print(f"   Nome: {usuario_existente.nome}")
            return
        
        # Cria a usuária
        nova_usuario = Usuario(
            nome=nome,
            email=email.lower(),
            telefone=telefone,
            senha_hash=gerar_hash_senha(senha),
            is_admin=is_admin
        )
        
        db.add(nova_usuario)
        db.commit()
        db.refresh(nova_usuario)
        
        # Atualiza perfil se existir
        if hasattr(Usuario, 'perfil'):
            nova_usuario.perfil = perfil
            db.commit()
        
        print("✅ USUÁRIA ADICIONADA COM SUCESSO NO SERVIDOR!")
        print(f"\n  ID: {nova_usuario.id}")
        print(f"  Nome: {nome}")
        print(f"  E-mail: {email}")
        print(f"  Perfil: GERENTE")
        print("\n" + "="*60 + "\n")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erro: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    criar_luana_producao()
