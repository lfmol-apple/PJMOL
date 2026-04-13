# Fase 2 - Inventario de organizacao controlada

Data: 2026-04-13
Branch analisada: `chore/organizacao-inicial`

## Decisao desta fase

Esta fase manteve o comportamento do sistema intacto. Nao foram movidos arquivos
de runtime, rotas, modulos de ML, autenticacao, banco, credenciais, tokens ou
dados operacionais.

## Classificacao objetiva

### Runtime principal

Arquivos e pastas que devem permanecer onde estao nesta fase:

- `backend/app/main.py`
- `backend/app/routes/`
- `backend/app/api/`
- `backend/app/core/`
- `backend/app/models/`
- `backend/app/services/`
- `backend/app/calculos/`
- `backend/app/extracao/`
- `backend/app/dados/`
- `frontend/src/app/`
- `frontend/src/components/`
- `frontend/src/hooks/`
- `frontend/src/lib/`
- `frontend/src/services/`
- `frontend/src/store/`
- `frontend/src/styles/`
- `frontend/public/`

### Auxiliares uteis

Arquivos que parecem auxiliares, operacionais ou utilitarios. Alguns tem
referencias internas e nao devem ser movidos sem uma checagem dedicada de
imports e execucao:

- `backend/app/atualizar_todos_ceps.py`
- `backend/app/audit.py`
- `backend/app/busca_dados_pj.py`
- `backend/app/buscar_ceps_robusto.py`
- `backend/app/buscar_ceps_todas_administradoras.py`
- `backend/app/cache_extratos.py`
- `backend/app/corretor_administradora.py`
- `backend/app/exportar.py`
- `backend/app/fix_all_numero_processo.py`
- `backend/app/fix_all_timers.py`
- `backend/app/fix_all_timezones.py`
- `backend/app/fix_timezone_extras.py`
- `backend/app/importadores/importar_usuarios.py`
- `backend/app/startup_timezone_fix.py`
- `backend/app/test_env_vars.py`
- `backend/app/teste_email_agora.py`

Observacoes de risco:

- `backend/app/corretor_administradora.py`, `backend/app/busca_dados_pj.py` e
  `backend/app/exportar.py` aparecem referenciados por outros modulos.
- `backend/app/cache_extratos.py` nao apareceu como referencia textual simples,
  mas o nome e a localizacao sugerem utilitario de runtime. Deve ficar parado
  ate haver mapa de imports mais rigoroso.
- Scripts `fix_*`, `test_*`, `teste_*` e `buscar_ceps_todas_administradoras.py`
  parecem candidatos a `scripts/` ou `maintenance/`, mas nao foram movidos nesta
  fase para evitar risco operacional.

### Backups e copias historicas rastreadas

Arquivos rastreados que parecem historicos de trabalho manual ou variantes:

- `backend/app/api/comarca_backup.py`
- `frontend/src/app/dashboard-relatorio/page-backup-errors.tsx`
- `frontend/src/app/dashboard-relatorio/page-backup-seguranca-20251101-172709.tsx`
- `frontend/src/app/dashboard-relatorio/page-complete.tsx`
- `frontend/src/app/dashboard-relatorio/page-current-broken.tsx`
- `frontend/src/app/dashboard-relatorio/page-simple-backup.tsx`
- `frontend/src/app/dashboard-relatorio/page-test-working.tsx`
- `frontend/src/app/extratos/page-backup-antes-ml.tsx`
- `frontend/src/app/gerencial/processos/page-backup-cards-20251028-090431.tsx`
- `frontend/src/app/gerencial/processos/page-backup-cards-visual-20251028-114344.tsx`
- `frontend/src/app/gerencial/processos/page-backup-mobile-20251028-111341.tsx`
- `frontend/src/app/gerencial/processos/page-backup-mobile-cards-final-20251028-121341.tsx`
- `frontend/src/app/gerencial/processos/page-backup-mobile-cards-final-20251028-121350.tsx`
- `frontend/src/app/gerencial/processos/page-backup-mobile-redesign-20251028-111126.tsx`
- `frontend/src/app/gerencial/processos/page.tsx.new`
- `frontend/src/app/page.tsx.bak_20251101_210412`

Arquivos com cara de variante, mas que podem estar em uso:

- `frontend/src/app/gerencial/processos/page-redesigned.tsx`
- `frontend/src/app/gerencial/processos/test-redesigned/page.tsx`

Motivo para nao mover agora:

- `frontend/src/app/gerencial/processos/test-redesigned/page.tsx` importa
  `../page-redesigned`, entao ha uma referencia real entre arquivos de variante.
- Arquivos sob `frontend/src/app/` participam da arvore de rotas do Next. Mesmo
  quando parecem backup, mover sem testar pode alterar superficie de build ou
  discovery de rotas.

### Historicos e artefatos locais nao rastreados

Encontrados no workspace, mas fora do indice do Git ou protegidos por ignore:

- `.env` e `.env.*` em `backend/`, `backend/app/`, `backend/app/app/` e
  `frontend/`
- bancos locais e backups SQLite em `backend/` e `backend/app/`
- logs `*.log` na raiz e no backend
- `backend/credentials.json`
- `backend/token_drive_oauth.pickle`
- `backend/global-course-431414-a5-b3f4dd0050f2.json`
- backups `.tar.gz` na raiz e em `backend/`
- `frontend/node_modules/`
- `frontend/.next/`
- `venv/` e `.venv/`

Estes arquivos nao devem entrar no fluxo principal. Se precisarem ser
preservados, use backup externo ao repositorio ou uma area local ignorada.

## Organizacao minima proposta

Sem mover nada nesta fase, a estrutura-alvo segura para proximos slices e:

```text
docs/
  reorganizacao-minima-segura.md
  fase-2-inventario-organizacao.md
  archive/                 # somente se backups rastreados forem arquivados

scripts/
  maintenance/             # scripts operacionais depois de validar imports
  data/                    # importadores e atualizadores depois de validar uso

_local/                    # ignorado; artefatos locais fora do fluxo principal
```

## Mudancas aplicadas nesta fase

- Criado `docs/fase-2-inventario-organizacao.md`.
- Adicionados ao `.gitignore`:
  - `*.tsbuildinfo`
  - `*.old`
  - `*.new`

Esses ignores miram novos artefatos futuros. Eles nao removem nem alteram
arquivos ja rastreados.

## Candidatos para limpeza futura

Prioridade 1:

- Backups rastreados do frontend dentro de `frontend/src/app/`, porque aumentam
  ruido em revisoes e confundem a arvore de rotas.

Prioridade 2:

- Scripts `fix_*`, `test_*`, `teste_*` e importadores soltos em `backend/app/`,
  depois de mapear imports e modo de execucao.

Prioridade 3:

- Ajuste fino do `*.json` no `.gitignore`, apenas depois de classificar os JSONs
  de aprendizado/dados para nao expor dados operacionais por acidente.

## Primeiro alvo recomendado para proxima fase

**Limpeza de backups rastreados do frontend.**

Motivo: e o melhor equilibrio entre reducao de confusao e baixo risco funcional,
desde que feito com cuidado. O problema esta concentrado em uma area visivel,
com nomes claramente historicos (`page-backup-*`, `page-current-broken`,
`page-test-working`, `*.bak`, `*.new`), e pode ser tratado antes de refatorar
backend ou ML.

Abordagem segura:

1. Listar todos os backups rastreados em `frontend/src/app/`.
2. Confirmar quais sao rotas reais pelo padrao do Next e quais sao apenas
   historicos.
3. Rodar `npm run build` antes de qualquer movimento.
4. Mover um grupo pequeno por vez para `docs/archive/frontend/` ou remover em
   commit separado, conforme decisao de produto.
5. Rodar build novamente e revisar diff.
