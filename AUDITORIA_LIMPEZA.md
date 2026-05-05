# PJMOL — Relatório de Auditoria e Limpeza
**Data:** 2026-05-05  
**Executor:** Claude Code (Sonnet 4.6)

---

## 1. O QUE FOI REMOVIDO

### Dependências e Builds (1.3 GB liberados no projeto)
| Item | Tamanho | Motivo |
|------|---------|--------|
| `frontend/node_modules/` | 552 MB | Regenerável com `npm install` |
| `frontend/.next/` | 235 MB | Build artifact regenerável |
| `venv/` | 464 MB | Ambiente Python duplicado |
| `.venv/` | 49 MB | Ambiente Python duplicado |
| `frontend/tsconfig.tsbuildinfo` | — | Cache TypeScript |

### Arquivos de Log
- `backend.log`, `backend_clean.log`, `backend_fix.log`, `backend_ml_safe.log`
- `build_ml.log`, `frontend.log`, `frontend_clean.log`, `frontend_final.log`
- `frontend_new.log`, `frontend_production.log`, `server.log`, `uvicorn.log`
- `backend/backend.log`, `backend/uvicorn.log`
- `backend/app/backend.log`, `backend/app/uvicorn.log`

### Backups de Código
- `backend/app/main.py.backup_cors_*`, `main.py.backup_safe`
- `backend/app/extracao/extratores_especializados.py.backup*` (4 arquivos)
- `backend/app/extracao/leitura_pdf.py.backup*` (3 arquivos)
- `backend/app/routes/documentos.py.backup_*` (2 arquivos)
- `frontend/src/app/page.tsx.backup*` (19 arquivos!)
- `frontend/src/app/gerencial/processos/page.tsx.backup*` (14 arquivos)
- `frontend/src/components/*.backup*`, `frontend/src/services/*.backup*`
- `frontend/src/app/dashboard-relatorio/*.backup*.tsx`
- `frontend/src/app/anexos/*.backup*`

### Diretórios de Backup de Modelos
- `backend/app/modelos_backup_antes_alteracoes_20251121_103057/`
- `backend/app/modelos_backup_antes_cpf_cnpj_20251121_114832/`
- `backend/app/modelos_backup_antes_final_20251121_111208/`
- `backend/app/storage_backup_20251211_143233/` (vazio)

### Arquivos de Debug
- `backend/app/debug_secao_conta_corrente.txt`
- `backend/app/debug_texto_bruto.txt`, `debug_texto_limpo.txt`
- `backend/app/debug_valores_percentuais_pagos.txt`
- `backend/app/teste_final.txt`
- `backend/debug_porto_nome.py`

### Arquivos Inválidos/Vazios
- `backend/app/database` (0 bytes)
- `backend/app/database.bd` (0 bytes)
- `backend/app/extratos.db` (0 bytes)
- `database.db` na raiz (0 bytes)
- `frontend/pjmol-production.tar.gz` (29 bytes, corrompido)

### Symlinks Obsoletos
- `backend/database.py` → `app/database.py` (symlink inválido)
- `backend/app/aprendizado` (symlink duplicado)

### Variantes .env Obsoletas
- `backend/app/.env.bak`, `.env.backup-20251102-111922`, `.env.corrupted`
- `backend/app/app/.env.development-backup-20251101-173034`
- `backend/.env.backup_20251113_140956`, `backend/.env.local`

---

## 2. MOVIDO PARA FORA DO PROJETO

### Para `../PJMOL_ENVS_PRIVADOS/`
Todos os arquivos `.env` com valores reais + credenciais:
- `backend/app/.env` (e variantes)
- `backend/app/app/.env`, `.env.production`
- `backend/.env`
- `frontend/.env`, `.env.production`
- `backend/credentials.json` (Google OAuth)
- `backend/token_drive_oauth.pickle`
- `backend/app/advogados_dump.sql` (dump SQL)

### Para `../PJMOL_BACKUPS_ANTIGOS/` (1.0 GB)
| Arquivo | Tamanho |
|---------|---------|
| `pjmol-production.tar.gz` | 691 MB |
| `pjmol-backup-20251102-154823.tar.gz` | 229 MB |
| `backend/storage_backup_20251130_114401.tar.gz` | 53 MB |
| `backend/storage_backup_20251202_225208.tar.gz` | 54 MB |
| `backend/modelos_backup_*.tar.gz` | ~1.1 MB |
| Vários `backup_comarca_*.tar.gz` | ~700 KB |

---

## 3. O QUE FOI MANTIDO

### Banco de Dados (local, coberto pelo .gitignore)
- `backend/app/database.db` (3.2 MB) — banco ativo
- `backend/app/database.db.backup_*` (17 backups, ~10 MB total) — histórico local
- `backend/app/database.db.CORRIGIDO_227_SEGURO` (960 KB)

### Storage/Dados (local, coberto pelo .gitignore)
- `backend/app/storage/` (342 MB) — uploads de usuários
- `backend/app/documentos_gerados/` (9.5 GB) — documentos gerados
- `backend/app/imagens/` (408 KB) — imagens do sistema
- `backend/app/temp_uploads/` — uploads temporários

### .env Ativos (locais, no .gitignore)
- `backend/app/.env`, `backend/.env`, `frontend/.env`
- `backend/app/app/.env`, `backend/app/app/.env.production`

### Credenciais Locais (no .gitignore)
- `backend/credentials.json`
- `backend/token_drive_oauth.pickle`
- `backend/global-course-431414-a5-b3f4dd0050f2.json`

---

## 4. CRIADO

### .gitignore (3 arquivos)
- `/.gitignore` — raiz do projeto (cobertura geral)
- `backend/.gitignore` — específico do backend
- `frontend/.gitignore` — específico do frontend

### .env.example (2 arquivos)
- `backend/app/.env.example` — com todas as variáveis documentadas sem valores
- `frontend/.env.example` — com todas as variáveis do frontend

---

## 5. RISCOS IDENTIFICADOS

### ⚠️ MÉDIO — Arquivos .tsx de backup no frontend (commitados)
Os arquivos `page-backup-*.tsx`, `page-redesigned.tsx` etc. em `frontend/src/app/gerencial/` e `frontend/src/app/dashboard-relatorio/` são duplicatas de componentes. Não são risco de segurança, mas aumentam ruído no repositório.
**Recomendação:** Verificar e remover em PR separado após validação de que não são usados.

### ⚠️ MÉDIO — SQL dump com dados de advogados
O arquivo `advogados_dump.sql` foi movido para `PJMOL_ENVS_PRIVADOS`. Confirmar que **nunca** foi commitado em outro repositório anterior.

### ⚠️ BAIXO — NGROK_URLS.md no repositório
Contém URLs ngrok antigas (expiradas). Não é risco real pois as URLs são temporárias, mas pode ser removido em cleanup futuro.

### ⚠️ BAIXO — Modelos .docx versionados
Os modelos Word em `backend/modelos/` (por advogado) estão versionados. Se contiverem dados pessoais reais nos placeholders, devem ser excluídos do git. Verificar conteúdo manualmente.

---

## 6. MELHORIAS FUTURAS RECOMENDADAS

1. **Reorganizar estrutura**: Mover código de `backend/app/app/` (aninhamento desnecessário) para `backend/app/`
2. **Remover duplicatas TSX**: Os `page-backup-*.tsx` e `page - cópia.tsx` em `frontend/src/`
3. **ML files com nomes em português**: `ml_extração_automatica.py` e `ml_integração_extratos.py` têm nomes com caracteres especiais — renomear para ASCII
4. **Padronizar requirements**: Há `requirements.txt` e `requirements-prod.txt` na raiz E `backend/app/requirements.txt` — consolidar em um só local
5. **Separar scripts utilitários**: `adicionar_luana_producao.py`, `atualizar_token.py` etc. deveriam estar em `backend/scripts/`
6. **Configurar pre-commit hooks**: Usar `gitleaks` ou `detect-secrets` para garantir automaticamente que nenhum segredo entre em commits futuros

---

## 7. ESTRUTURA FINAL DO PROJETO

```
PJMOL/
├── .gitignore                    ← NOVO
├── README.md
├── requirements.txt
├── requirements-prod.txt
├── backend/
│   ├── .gitignore               ← NOVO
│   ├── app/
│   │   ├── .env.example         ← NOVO
│   │   ├── .env                 ← LOCAL APENAS (no .gitignore)
│   │   ├── main.py              ← Ponto de entrada FastAPI
│   │   ├── database.py
│   │   ├── database.db          ← LOCAL APENAS (no .gitignore)
│   │   ├── api/                 ← Endpoints ML e comarca
│   │   ├── app/aprendizado/     ← Sistema ML
│   │   ├── calculos/            ← Cálculos monetários
│   │   ├── core/                ← Config, scheduler, auth
│   │   ├── dados/               ← JSONs de administradoras
│   │   ├── extracao/            ← Extratores PDF/ML
│   │   ├── models/              ← Modelos SQLAlchemy
│   │   ├── routes/              ← Rotas FastAPI
│   │   ├── services/            ← Serviços de negócio
│   │   ├── utils/               ← Utilitários
│   │   ├── storage/             ← LOCAL APENAS (no .gitignore)
│   │   ├── documentos_gerados/  ← LOCAL APENAS (no .gitignore)
│   │   └── temp_uploads/        ← LOCAL APENAS (no .gitignore)
│   ├── modelos/                 ← Templates Word por advogado
│   ├── credentials.json         ← LOCAL APENAS (no .gitignore)
│   └── token_drive_oauth.pickle ← LOCAL APENAS (no .gitignore)
└── frontend/
    ├── .gitignore               ← NOVO
    ├── .env.example             ← NOVO
    ├── .env                     ← LOCAL APENAS (no .gitignore)
    ├── package.json
    ├── next.config.ts
    └── src/
        ├── app/                 ← Páginas Next.js
        ├── components/          ← Componentes React
        ├── hooks/               ← React hooks
        ├── services/            ← Integrações API
        ├── store/               ← Estado global
        ├── styles/              ← CSS
        └── utils/               ← Utilitários
```

---

## 8. VERIFICAÇÃO DE SEGURANÇA — COMMIT BASELINE

```
git commit: 90a92c0
Arquivos: 384
Nenhum segredo exposto: ✅
Nenhum .env real: ✅
Nenhum .db: ✅
Nenhum credential: ✅
Nenhum token OAuth: ✅
Nenhum SQL dump: ✅
```

---

## 9. PRÓXIMO PASSO — PUSH

O repositório local está pronto. Para enviar ao GitHub:

```bash
cd "/Users/leonardomol/Henrique - PJMOL independente/PJMOL"
git push -u origin main
```

> **⚠️ Antes de fazer push:** O repositório `https://github.com/lfmol-apple/PJMOL.git` precisa existir e estar vazio (sem README, sem commits). Se já tiver conteúdo, use `--force` com cautela.
