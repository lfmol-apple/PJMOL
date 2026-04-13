#!/usr/bin/env python3
"""
Script de Correção Completa de Timezone
Corrige todos os campos de timestamp no banco de dados
"""

import sqlite3
import json
from datetime import datetime
import pytz

DB_PATH = "database.db"
SP_TZ = pytz.timezone('America/Sao_Paulo')

def fix_timezone_in_string(timestamp_str):
    """Adiciona timezone a timestamp sem timezone"""
    if not timestamp_str:
        return timestamp_str
    
    # Se já tem timezone, não mexe
    if '+' in timestamp_str or timestamp_str.endswith('Z'):
        return timestamp_str
    
    # Se tem 'T' é ISO format
    if 'T' in timestamp_str:
        try:
            # Parse como naive datetime
            dt_naive = datetime.fromisoformat(timestamp_str.replace('Z', ''))
            # Adiciona timezone SP
            dt_aware = SP_TZ.localize(dt_naive)
            return dt_aware.isoformat()
        except:
            return timestamp_str
    
    return timestamp_str

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("=" * 80)
    print("CORREÇÃO COMPLETA DE TIMEZONE - TODOS OS CAMPOS")
    print("=" * 80)
    print()
    
    # Buscar todos os extratos
    cursor.execute("SELECT id, nome_cliente, extras, enviado_em FROM extratos")
    rows = cursor.fetchall()
    
    corrections = []
    
    for row in rows:
        extrato_id, nome, extras_json, enviado_em = row
        changed = False
        
        # 1. Corrigir campo enviado_em (coluna direta)
        if enviado_em and 'T' in enviado_em and '+' not in enviado_em and not enviado_em.endswith('Z'):
            new_enviado_em = fix_timezone_in_string(enviado_em)
            if new_enviado_em != enviado_em:
                cursor.execute(
                    "UPDATE extratos SET enviado_em = ? WHERE id = ?",
                    (new_enviado_em, extrato_id)
                )
                corrections.append({
                    'id': extrato_id,
                    'nome': nome,
                    'campo': 'enviado_em',
                    'antes': enviado_em,
                    'depois': new_enviado_em
                })
                changed = True
        
        # 2. Corrigir campo extras (JSON)
        if extras_json:
            try:
                extras = json.loads(extras_json)
                extras_changed = False
                
                # Verificar todos os campos do extras
                for key, value in extras.items():
                    if isinstance(value, str) and 'T' in value:
                        new_value = fix_timezone_in_string(value)
                        if new_value != value:
                            extras[key] = new_value
                            corrections.append({
                                'id': extrato_id,
                                'nome': nome,
                                'campo': f'extras.{key}',
                                'antes': value,
                                'depois': new_value
                            })
                            extras_changed = True
                
                # Se houve mudanças no extras, atualizar
                if extras_changed:
                    cursor.execute(
                        "UPDATE extratos SET extras = ? WHERE id = ?",
                        (json.dumps(extras, ensure_ascii=False), extrato_id)
                    )
                    changed = True
                    
            except json.JSONDecodeError:
                pass
        
        if changed:
            conn.commit()
    
    # Exibir correções
    if corrections:
        print(f"✅ {len(corrections)} CORREÇÃO(ÕES) APLICADA(S):")
        print()
        
        for c in corrections:
            print(f"ID {c['id']} - {c['nome']}")
            print(f"  Campo: {c['campo']}")
            print(f"  Antes: {c['antes']}")
            print(f"  Depois: {c['depois']}")
            print()
    else:
        print("✅ NENHUMA CORREÇÃO NECESSÁRIA")
        print("Todos os timestamps já estão corretos!")
    
    conn.close()
    
    print("=" * 80)
    print(f"TOTAL: {len(corrections)} campo(s) corrigido(s)")
    print("=" * 80)

if __name__ == "__main__":
    main()
