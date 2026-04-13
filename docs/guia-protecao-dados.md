# Guia de Proteção de Dados e Restauração — PJMOL

> Última revisão: 2026-04-13  
> Rodada: Hardening Final

---

## 1. O Que É Crítico para Backup

### Dados Irreversíveis (NUNCA apagar sem aprovação)

| Item | Localização | Criticidade |
|------|-------------|-------------|
| Banco SQLite principal | `backend/app/database.db` | **MÁXIMA** |
| Storage de documentos de clientes | `backend/app/storage/` (~342MB) | **MÁXIMA** |
| Backup de storage | `backend/app/storage_backup_*/` | Alta |
| `.env` de produção | `backend/app/.env` | Alta |
| Credenciais Google Cloud | `backend/credentials.json`, `backend/global-course-*.json` | Alta |

### Dados que Podem Ser Regenerados

| Item | Como regenerar |
|------|----------------|
| `documentos_gerados/` | Re-gerado automaticamente pela aplicação |
| `temp_uploads/` | Temporário — limpo pelo scheduler a cada hora |
| `frontend/.next/` | `npm run build` |
| `__pycache__/` | Python regenera automaticamente |
| Arquivos `.db-wal` e `.db-shm` | Artefatos de runtime do SQLite WAL |

---

## 2. O Que Nunca Deve Ser Apagado Sem Aprovação

- `backend/app/database.db` — é o banco de dados de produção com todos os processos.
- `backend/app/storage/` — contém PDFs e documentos de clientes. Não há outra cópia.
- `backend/app/.env` — contém chaves reais. Perder exige regenerar tokens e reconfigurar integrações.
- `backend/credentials.json` — credenciais Google Cloud para OCR/Visão. Revogar e reemitir via GCP Console se perdido.

---

## 3. Classificação de Arquivos

### Código (versionado)
```
backend/app/main.py
backend/app/routes/
backend/app/models/
backend/app/services/
backend/app/core/
backend/app/utils/
backend/app/calculos/
backend/app/extracao/
backend/app/indices/
frontend/src/
frontend/package.json
```

### Dados (NÃO versionados — apenas locais/produção)
```
backend/app/database.db       ← banco principal
backend/app/storage/          ← documentos de clientes (342MB)
backend/app/documentos_gerados/ ← docs temporários gerados
backend/app/temp_uploads/     ← uploads temporários (< 24h)
```

### Configuração (NÃO versionada — sensível)
```
backend/app/.env              ← configuração ativa
backend/credentials.json      ← credencial Google
backend/global-course-*.json  ← credencial GCP
```

### Artefatos Locais (ignorados, descartáveis)
```
backend/app/__pycache__/
backend/app/database.db-wal
backend/app/database.db-shm
frontend/.next/
frontend/node_modules/
.venv/
```

---

## 4. Como Testar Localmente Sem Usar Dados Reais

### Opção A — Banco de Teste Separado
```bash
# Criar banco de teste isolado
cp backend/app/database.db backend/app/database.test.db

# Setar variável de ambiente para usar banco de teste
export DATABASE_URL=sqlite:///./app/database.test.db

# Subir o backend apontando para banco de teste
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

### Opção B — .env Local de Teste
```bash
# Criar .env de teste que aponta para banco e storage de teste
cp backend/app/.env backend/app/.env.test
# Editar .env.test:
#   DATABASE_URL=sqlite:///./app/database.test.db
#   STORAGE_ROOT=/tmp/pjmol-test-storage
#   ENVIRONMENT=development

# Setar variável para carregar .env de teste
export DOTENV_PATH=app/.env.test
```

**Nunca use o banco de produção para testar funcionalidades destrutivas.**

---

## 5. Como Restaurar o Ambiente em Caso de Erro

### 5.1 Restaurar o Banco de Dados
```bash
# Parar o backend primeiro
# Identificar o backup mais recente
ls -lt backend/app/database.db.backup_*

# Restaurar
cp backend/app/database.db backend/app/database.db.antes_restauracao_$(date +%Y%m%d_%H%M%S)
cp backend/app/database.db.backup_YYYYMMDD_HHMMSS backend/app/database.db

# Verificar integridade
sqlite3 backend/app/database.db "PRAGMA integrity_check"
```

### 5.2 Restaurar o Storage
```bash
# O storage_backup_* contém snapshots anteriores
ls backend/app/storage_backup_*/

# Restaurar pasta específica
cp -r backend/app/storage_backup_20251211_143233/extratos/ID backend/app/storage/extratos/ID
```

### 5.3 Restaurar o Ambiente Python
```bash
cd "/Users/leonardomol/PJMOL - PRODUCAO"
python3.9 -m venv .venv
source .venv/bin/activate
cd backend
pip install -r requirements.txt
```

### 5.4 Restaurar o Frontend
```bash
cd "/Users/leonardomol/PJMOL - PRODUCAO/frontend"
npm install
npm run build  # validar antes de subir
```

### 5.5 Subir os Ambientes
```bash
# Backend (porta 8000)
cd "/Users/leonardomol/PJMOL - PRODUCAO/backend"
source "/Users/leonardomol/PJMOL - PRODUCAO/.venv/bin/activate"
TMPDIR=$HOME/.tmp uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (porta 3000) — em novo terminal
cd "/Users/leonardomol/PJMOL - PRODUCAO/frontend"
npm run dev
```

---

## 6. Como Fazer Mudanças Futuras Com Segurança

### Antes de Qualquer Mudança Significativa
1. **Criar branch** a partir da branch de trabalho atual (nunca direto na main)
2. **Fazer backup do banco**: `cp backend/app/database.db backend/app/database.db.backup_$(date +%Y%m%d_%H%M%S)`
3. **Testar com banco de teste** sempre que a mudança afetar banco/storage
4. **Usar commits pequenos** — máximo um slicepor commit

### Durante a Mudança
- Verificar `git diff` antes de cada commit
- Rodar `git check-ignore -v <arquivo>` antes de `git add` em arquivos sensíveis
- Nunca usar `git add .` sem revisar `git status` antes

### Depois da Mudança
- Rodar checklist pré-merge (seção 7)
- Validar que backend sobe: `curl http://localhost:8000/docs`
- Validar que frontend compila: `npm run build`
- Verificar logs do startup para ausência de erros ou avisos de configuração

---

## 7. Checklist Obrigatório Antes de Merge

```
[ ] git diff --check (sem trailing whitespace ou conflitos)
[ ] git status — nenhum arquivo sensível em staging
[ ] Confirmar que .db, .env, storage/ NÃO estão no git
[ ] Backend sobe sem erro: uvicorn app.main:app
[ ] Logs de startup sem AVISO de configuração (SECRET_KEY, STORAGE_ROOT)
[ ] Endpoint /docs responde (OpenAPI)
[ ] Frontend compila: npm run build (sem erros TypeScript)
[ ] Nenhum dado de cliente foi alterado sem trigger explícito
[ ] Nenhum arquivo de backup foi apagado
[ ] PR revisado por pelo menos 1 outro desenvolvedor (se aplicável)
```

---

## 8. Riscos Documentados (Não Corrigidos Nesta Rodada)

| Risco | Detalhe | Ação Recomendada |
|-------|---------|-----------------|
| M2 — Cleanup por CPF | `cleanup_extrato_storage` apaga pasta do cliente inteira se mesmo CPF tiver 2 extratos | Antes de deletar extrato, verificar se há outros extratos com mesmo CPF |
| B3 — Startup sync | Recálculo de 635 extratos roda no startup | Tornar assíncrono com timeout |
| M3 — CORS permissivo | `allow_methods=["*"]` e `allow_headers=["*"]` | Em produção, restringir a apenas os métodos/headers necessários |
| M1 — `.env` duplicados | `backend/app/app/` tem `.env.production` com configs reais | Manter como artefato histórico mas nunca carregar em runtime |
| A4 — Delete sem backup | Deleção de extrato não cria backup prévio do storage | Implementar soft-delete ou backup antes de cleanup |
