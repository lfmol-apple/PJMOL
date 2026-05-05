#!/usr/bin/env python3
"""
Script para corrigir TODOS os timers de processos
"""

import sqlite3
import json
from datetime import datetime
import pytz

DB_PATH = "database.db"
SP_TZ = pytz.timezone('America/Sao_Paulo')

def corrigir_timezone_utc_para_sp(timestamp_str):
    """Converte timestamp de UTC para SP (subtrai 3 horas)"""
    if not timestamp_str:
        return timestamp_str
    
    dt = datetime.fromisoformat(timestamp_str.replace('+00:00', '').replace('-03:00', ''))
    # Subtrair 3 horas
    dt = dt.replace(hour=max(0, dt.hour - 3))
    # Adicionar timezone SP
    dt_aware = SP_TZ.localize(dt)
    return dt_aware.isoformat()

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("=" * 80)
    print("CORREÇÃO AUTOMÁTICA DE TODOS OS TIMERS")
    print("=" * 80)
    print()
    
    cursor.execute("SELECT id, nome_cliente, zapsign_status, extras FROM extratos ORDER BY id")
    rows = cursor.fetchall()
    
    total_correcoes = 0
    
    for row in rows:
        extrato_id, nome, zapsign_status, extras_json = row
        extras = json.loads(extras_json) if extras_json else {}
        
        print(f"ID {extrato_id} - {nome}")
        
        mudou = False
        
        assinatura_start = extras.get('timer_assinatura_start')
        assinatura_end = extras.get('timer_assinatura_end')
        
        # CORREÇÃO 1: Remover timer_assinatura_end se status != 'assinado'
        if zapsign_status != 'assinado' and assinatura_end:
            print(f"  ✅ Removendo timer_assinatura_end (status: {zapsign_status})")
            del extras['timer_assinatura_end']
            # Remover também timer_gerente_start se existir
            if 'timer_gerente_start' in extras:
                del extras['timer_gerente_start']
            mudou = True
            total_correcoes += 1
        
        # CORREÇÃO 2: Corrigir datas invertidas (START > END) - problema de timezone
        assinatura_start = extras.get('timer_assinatura_start')
        assinatura_end = extras.get('timer_assinatura_end')
        
        if assinatura_start and assinatura_end:
            dt_start = datetime.fromisoformat(assinatura_start)
            dt_end = datetime.fromisoformat(assinatura_end)
            
            if dt_start > dt_end:
                print(f"  ✅ Corrigindo timer_assinatura_start (UTC → SP)")
                extras['timer_assinatura_start'] = corrigir_timezone_utc_para_sp(assinatura_start)
                mudou = True
                total_correcoes += 1
        
        # CORREÇÃO 3: Iniciar timer_anexos_started_at se assinado e não iniciado
        assinatura_end = extras.get('timer_assinatura_end')
        anexos_start = extras.get('timer_anexos_started_at')
        
        if zapsign_status == 'assinado' and assinatura_end and not anexos_start:
            print(f"  ✅ Iniciando timer_anexos_started_at (processo assinado)")
            extras['timer_anexos_started_at'] = assinatura_end
            mudou = True
            total_correcoes += 1
        
        if mudou:
            cursor.execute(
                "UPDATE extratos SET extras = ? WHERE id = ?",
                (json.dumps(extras, ensure_ascii=False), extrato_id)
            )
            conn.commit()
        else:
            print(f"  OK - Nenhuma correção necessária")
        
        print()
    
    conn.close()
    
    print("=" * 80)
    print(f"✅ TOTAL DE CORREÇÕES: {total_correcoes}")
    print("=" * 80)

if __name__ == "__main__":
    main()
