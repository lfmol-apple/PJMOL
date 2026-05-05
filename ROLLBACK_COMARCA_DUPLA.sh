#!/bin/bash
# Rollback para voltar ao estado anterior (comarca única)
echo '🔄 Iniciando rollback...'

# Restaurar arquivos
cd /var/www/pjmol
tar -xzf backup_antes_comarca_dupla_20251113_143750.tar.gz

# Restaurar banco (se necessário)
# cp backend/app/database.db.backup_antes_comarca_dupla_20251113_143758 backend/app/database.db

# Rebuild frontend
cd frontend
npm run build

# Restart serviços
systemctl restart pjmol-frontend
systemctl restart pjmol-backend

echo '✅ Rollback concluído!'
