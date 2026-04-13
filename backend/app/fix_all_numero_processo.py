"""
Script para corrigir automaticamente TODOS os extratos que têm numero_processo
mas não têm numero_processo_inserted_at
"""
import json
from datetime import datetime
import pytz
from sqlalchemy.orm import Session
from database import SessionLocal, engine
from app.models import Extrato

def fix_all_numero_processo():
    """Corrige todos os extratos com numero_processo mas sem timestamp"""
    db = SessionLocal()
    sp_tz = pytz.timezone('America/Sao_Paulo')
    now = datetime.now(sp_tz).isoformat()
    
    try:
        # Buscar todos os extratos
        extratos = db.query(Extrato).all()
        fixed_count = 0
        
        for ex in extratos:
            # Verificar se tem numero_processo preenchido
            if not ex.numero_processo or not ex.numero_processo.strip():
                continue
            
            # Verificar extras
            extras = ex.extras if isinstance(ex.extras, dict) else {}
            
            # Se já tem timestamp, pular
            if extras.get('numero_processo_inserted_at'):
                continue
            
            # CORRIGIR: adicionar timestamp e parar timer
            extras['numero_processo_inserted_at'] = now
            extras['timer_advogado_end'] = now
            
            ex.extras = extras
            db.add(ex)
            fixed_count += 1
            
            print(f"✅ Extrato {ex.id}: numero_processo_inserted_at criado (numero: {ex.numero_processo})")
        
        db.commit()
        
        if fixed_count > 0:
            print(f"\n🎉 {fixed_count} extrato(s) corrigido(s) automaticamente!")
        else:
            print(f"\n✅ Nenhum extrato precisou de correção")
            
    except Exception as e:
        print(f"❌ Erro ao corrigir extratos: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("🔧 Iniciando correção automática de numero_processo...")
    fix_all_numero_processo()
