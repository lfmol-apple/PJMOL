#!/usr/bin/env python3
"""
Testa se as variáveis de ambiente estão sendo carregadas corretamente
"""
import os
from dotenv import load_dotenv

# Carregar .env
load_dotenv()

print("=" * 60)
print("VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE")
print("=" * 60)

# Lista de variáveis importantes
vars_to_check = [
    "PUBLIC_BASE_URL",
    "STORAGE_ROOT",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "MAIL_FROM",
    "ZAPSIGN_API_KEY_DEFAULT",
    "TZ"
]

print("\n📋 Variáveis Carregadas:\n")

for var in vars_to_check:
    value = os.getenv(var, "❌ NÃO CONFIGURADA")
    
    # Ocultar senhas
    if "PASSWORD" in var and value != "❌ NÃO CONFIGURADA":
        display_value = value[:3] + "*" * (len(value) - 3) if len(value) > 3 else "***"
    else:
        display_value = value
    
    status = "✅" if value != "❌ NÃO CONFIGURADA" else "❌"
    print(f"{status} {var:30} = {display_value}")

print("\n" + "=" * 60)

# Verificar SMTP
smtp_ok = all([
    os.getenv("SMTP_HOST"),
    os.getenv("SMTP_PORT"),
    os.getenv("SMTP_USERNAME"),
    os.getenv("SMTP_PASSWORD")
])

print("\n🔍 Diagnóstico:\n")
print(f"{'✅' if smtp_ok else '❌'} SMTP configurado: {'SIM' if smtp_ok else 'NÃO - Emails não serão enviados!'}")
print(f"{'✅' if os.getenv('STORAGE_ROOT') else '❌'} Storage configurado: {os.getenv('STORAGE_ROOT', 'NÃO')}")
print(f"{'✅' if os.getenv('PUBLIC_BASE_URL') else '❌'} URL pública configurada: {os.getenv('PUBLIC_BASE_URL', 'NÃO')}")

print("\n" + "=" * 60)
