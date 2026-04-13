# Reorganizacao minima segura

Data: 2026-04-13
Branch analisada: `chore/organizacao-inicial`

## Escopo desta rodada

Este documento registra uma primeira analise tecnica conservadora do repositorio.
O objetivo desta rodada e reduzir risco operacional sem alterar comportamento em
producao. Nenhum arquivo de runtime foi movido, nenhum import foi alterado e
nenhuma rota foi refatorada.

## Diagnostico objetivo

- O projeto esta separado em `backend/` e `frontend/`, mas ainda existem muitos
  artefatos operacionais na raiz e dentro de `backend/app`.
- O backend FastAPI concentra muito comportamento em `backend/app/main.py`, com
  criacao de tabelas, carga de JSON, middlewares, eventos de startup e registro
  de rotas no mesmo arquivo.
- O frontend Next usa `frontend/src/app`, mas ha copias e backups rastreados
  dentro de pastas de rotas, o que aumenta ruido e risco de manutencao.
- Ha muitos arquivos locais sensiveis ou pesados no workspace, como `.env`,
  bancos SQLite, logs, tokens, credenciais Google, backups `.tar.gz`, storages e
  documentos gerados. Eles nao apareceram como rastreados pelo Git nesta checagem,
  mas precisam continuar fora do fluxo principal.
- O `.gitignore` atual protege varios artefatos criticos, mas tambem ignora
  `*.json` de forma ampla. Isso evita vazamento acidental, mas pode esconder
  arquivos JSON legitimos de configuracao/dados que deveriam passar por review.
- Existe um arquivo nao rastreado antes desta rodada: `CORRECOES_DEPLOY.md`
  (exibido pelo Git como `CORRE\303\207OES_DEPLOY.md`). Ele foi preservado.

## Problemas priorizados

1. **Dados locais e sensiveis no workspace**
   - Exemplos encontrados: `backend/.env`, `backend/app/.env`,
     `backend/credentials.json`, `backend/token_drive_oauth.pickle`,
     `backend/*.db`, `backend/app/*.db`, `frontend/.env` e `frontend/.env.production`.
   - Risco: vazamento em zip/manual deploy, restauracao errada ou confusao entre
     ambiente local e producao.
   - Acao segura agora: documentar e manter ignorado.
   - Proximo slice: criar checklist de sanitizacao antes de zip/deploy.

2. **Backups e dumps misturados ao codigo**
   - Exemplos encontrados: arquivos `.tar.gz` na raiz e em `backend/`, varios
     `database.db.backup_*` em `backend/app`, e arquivos `*.backup*` no frontend.
   - Risco: peso excessivo, revisoes ruidosas e dificuldade para saber qual
     versao e fonte de verdade.
   - Acao segura agora: documentar; nao remover nesta rodada.
   - Proximo slice: mover somente arquivos nao rastreados para uma area local
     fora do repositorio, com validacao previa.

3. **Arquivos de backup rastreados em rotas do frontend**
   - Exemplos rastreados: `frontend/src/app/dashboard-relatorio/page-backup-*.tsx`,
     `frontend/src/app/gerencial/processos/page-backup-*.tsx`,
     `frontend/src/app/page.tsx.bak_20251101_210412`.
   - Risco: confusao de manutencao e aumento de superficie para alteracoes
     acidentais.
   - Acao segura agora: documentar; nao mover porque pode afetar historico e
     revisao.
   - Proximo slice: mover para `docs/archive/frontend/` ou remover apos confirmar
     que nao sao usados.

4. **Acoplamento alto no backend**
   - `backend/app/main.py` mistura bootstrap, migracoes leves, rotas, carga de
     dados, recalc diario e handlers.
   - Risco: pequenas mudancas no bootstrap podem afetar todo o servidor.
   - Acao segura agora: nenhuma alteracao funcional.
   - Proximo slice: apenas extrair registro de rotas para funcao local testavel,
     sem mudar imports publicos.

5. **Estrutura duplicada ou ambigua no backend**
   - Existe `backend/app/app/aprendizado`, alem de `backend/app/aprendizado_*` e
     `backend/app/api/ml_aprendizado.py`.
   - Risco: imports ambiguos, duplicacao de responsabilidades e dificuldade para
     decidir onde novas regras de aprendizado devem entrar.
   - Acao segura agora: documentar.
   - Proximo slice: mapear imports reais antes de mover qualquer modulo.

## Estrutura-alvo minima sugerida

Backend:

```text
backend/
  app/
    main.py                 # entrada FastAPI fina
    api/                    # routers HTTP e endpoints
    core/                   # config, scheduler, tempo, middlewares
    models/                 # modelos SQLAlchemy
    schemas.py              # schemas Pydantic, quando aplicavel
    services/               # regras de negocio
    calculos/               # dominio de calculo
    extracao/               # OCR/leitura de PDFs
    dados/                  # dados versionados pequenos e revisados
    utils/                  # utilitarios realmente compartilhados
  scripts/                  # scripts operacionais versionados e seguros
  tests/                    # testes futuros
```

Frontend:

```text
frontend/
  src/
    app/                    # rotas Next ativas
    components/             # componentes compartilhados
    hooks/                  # hooks compartilhados
    lib/                    # clientes e helpers base
    services/               # integracao HTTP/domino frontend
    store/                  # estado global
    styles/                 # CSS compartilhado
    utils/                  # utilitarios puros
  public/                   # assets publicos versionados
```

Fora do fluxo principal:

```text
_local/                     # opcional, ignorado, para artefatos locais
backups/                    # ignorado; nao usar como fonte de verdade
docs/archive/               # somente se backups rastreados forem mantidos
```

## Primeira rodada aplicada

- Criado este documento em `docs/reorganizacao-minima-segura.md`.
- Adicionado `_local/` ao `.gitignore` para reservar uma area local ignorada
  para artefatos fora do fluxo principal.
- Nenhum arquivo de producao foi movido.
- Nenhum import, rota, schema, modelo, build ou configuracao de runtime foi
  alterado.

## Proximos slices pequenos recomendados

1. Criar `docs/checklist-sanitizacao.md` para zip/deploy, listando o que nunca
   deve sair do ambiente local.
2. Classificar arquivos rastreados com nome de backup/copia e decidir entre
   `docs/archive/` ou remocao em PR separado.
3. Revisar o uso de JSONs locais de aprendizado antes de ajustar o `*.json` do
   `.gitignore`.
4. Mapear imports de `backend/app/app/aprendizado` e `backend/app/aprendizado_*`
   antes de qualquer movimentacao.
5. Separar `backend/app/main.py` em passos minimos, com um commit por extracao.
