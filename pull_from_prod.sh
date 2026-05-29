#!/bin/bash
# Sincroniza o banco de dados de produção para o ambiente local.
# Uso: ./pull_from_prod.sh

set -e

PROJ_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_LOCAL="$PROJ_DIR/backend/app/database.db"
PROD_HOST="root@pjmol.com.br"
PROD_DB="/var/www/pjmol/backend/app/database.db"

echo "🔄 Sincronizando banco de produção → local..."

# Backup do banco local atual
if [ -f "$DB_LOCAL" ]; then
  BACKUP="$DB_LOCAL.bak_$(date +%Y%m%d_%H%M%S)"
  cp "$DB_LOCAL" "$BACKUP"
  echo "   Backup local salvo em: $(basename "$BACKUP")"
fi

# Copiar banco de produção
scp "$PROD_HOST:$PROD_DB" "$DB_LOCAL"

# Confirmar
COUNT=$(sqlite3 "$DB_LOCAL" 'SELECT COUNT(*) FROM extratos;' 2>/dev/null || echo "?")
echo "✅ Banco atualizado — $COUNT processos"
echo ""
echo "⚠️  Lembre: os arquivos de storage (PDFs, imagens) continuam em produção."
echo "   Uploads feitos localmente não vão aparecer em produção e vice-versa."
