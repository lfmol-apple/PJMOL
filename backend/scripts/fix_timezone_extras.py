#!/usr/bin/env python3
"""
Script para corrigir timezone nos campos de timer dentro do JSON 'extras'
Converte todos os timestamps para America/Sao_Paulo (-03:00)
"""

import sqlite3
import json
from datetime import datetime
import pytz

# Timezone correto
SP_TZ = pytz.timezone('America/Sao_Paulo')

def fix_timestamp(dt_str):
    """Converte timestamp para timezone de São Paulo"""
    if not dt_str:
        return dt_str
    
    try:
        # Parsear o timestamp
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        
        # Converter para SP timezone
        if dt.tzinfo:
            dt_sp = dt.astimezone(SP_TZ)
        else:
            # Se não tem timezone, assumir que já é SP
            dt_sp = SP_TZ.localize(dt)
        
        # Retornar no formato ISO com timezone
        return dt_sp.isoformat()
    except Exception as e:
        print(f'  ⚠️ Erro ao converter "{dt_str}": {e}')
        return dt_str

def main():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    
    print('=== CORREÇÃO DE TIMEZONE NO CAMPO EXTRAS ===\n')
    
    # Campos de timer que precisam ser corrigidos
    timer_fields = [
        'timer_assinatura_start',
        'timer_assinatura_end',
        'timer_anexos_started_at',
        'timer_anexos_ended_at',
        'timer_advogado_start',
        'timer_advogado_end',
        'timer_gerente_start',
        'timer_gerente_end'
    ]
    
    cursor.execute('SELECT id, nome_cliente, extras FROM extratos')
    rows = cursor.fetchall()
    
    corrigidos = 0
    
    for row in rows:
        id, nome, extras_raw = row
        
        if not extras_raw:
            continue
        
        try:
            extras = json.loads(extras_raw) if isinstance(extras_raw, str) else extras_raw
            modificado = False
            
            for field in timer_fields:
                if field in extras and extras[field]:
                    valor_original = extras[field]
                    valor_corrigido = fix_timestamp(valor_original)
                    
                    if valor_original != valor_corrigido:
                        print(f'ID {id} - {nome}')
                        print(f'  Campo: {field}')
                        print(f'  Antes: {valor_original}')
                        print(f'  Depois: {valor_corrigido}')
                        print()
                        
                        extras[field] = valor_corrigido
                        modificado = True
            
            if modificado:
                # Atualizar o registro
                extras_json = json.dumps(extras, ensure_ascii=False)
                cursor.execute('UPDATE extratos SET extras = ? WHERE id = ?', (extras_json, id))
                corrigidos += 1
        
        except Exception as e:
            print(f'❌ Erro ao processar ID {id}: {e}')
    
    if corrigidos > 0:
        conn.commit()
        print(f'\n✅ {corrigidos} registro(s) corrigido(s)!')
    else:
        print('\n✅ Nenhuma correção necessária!')
    
    conn.close()

if __name__ == '__main__':
    main()
