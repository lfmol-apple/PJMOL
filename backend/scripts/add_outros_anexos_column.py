"""
Adiciona a coluna outros_anexos_url na tabela extratos
"""
import sqlite3
import os

# Caminho do banco de dados
DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")

def migrate():
    print(f"🔧 Conectando ao banco de dados: {DB_PATH}")
    
    if not os.path.exists(DB_PATH):
        print(f"❌ Banco de dados não encontrado: {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Verificar se a coluna já existe
        cursor.execute("PRAGMA table_info(extratos)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'outros_anexos_url' in columns:
            print("✅ Coluna 'outros_anexos_url' já existe no banco de dados")
        else:
            print("📝 Adicionando coluna 'outros_anexos_url'...")
            cursor.execute("""
                ALTER TABLE extratos 
                ADD COLUMN outros_anexos_url TEXT
            """)
            conn.commit()
            print("✅ Coluna 'outros_anexos_url' adicionada com sucesso!")
        
        # Verificar novamente
        cursor.execute("PRAGMA table_info(extratos)")
        columns = [row[1] for row in cursor.fetchall()]
        print(f"\n📊 Total de colunas na tabela extratos: {len(columns)}")
        
        if 'outros_anexos_url' in columns:
            print("✅ Migração concluída com sucesso!")
        else:
            print("❌ Erro: Coluna não foi adicionada")
            
    except Exception as e:
        print(f"❌ Erro durante a migração: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
