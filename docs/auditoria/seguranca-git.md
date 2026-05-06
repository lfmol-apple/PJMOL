# Auditoria de Seguranca Git - PJMOL

Data: 2026-05-05
Escopo: repositorio local `PJMOL`, branch `main`, sem deploy, sem alteracao em producao, sem banco, sem storage e sem `.env` real.

## 1. Comandos executados

```bash
git status
git log --oneline --max-count=20

grep -RInE "zapsign|secret|token|password|senha|api_key|apikey|private_key|webhook|smtp|imap|DATABASE_URL|SECRET_KEY" . \
  --exclude-dir=.git \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=venv \
  --exclude-dir=.venv \
  --exclude="*.db" \
  --exclude="*.sqlite" \
  --exclude="*.lock"

git grep -nE "zapsign|secret|token|password|senha|api_key|apikey|private_key|webhook|smtp|imap|DATABASE_URL|SECRET_KEY" $(git rev-list --all)

git ls-files | grep -Ei "\.env$|\.env\.|\.db$|\.sqlite|\.pickle|credentials\.json|token_drive|\.sql$|storage/|documentos_gerados/|uploads/|\.tar\.gz|\.zip"
```

Observacao: achados de segredo real foram registrados sem valores completos. Valores ja expostos devem ser considerados comprometidos.

## 2. Estado do Git

- Branch: `main`
- Ultimo commit antes desta auditoria: `3a96991 security: remove segredos hardcoded e proteger envs`
- Working tree antes dos ajustes desta auditoria: limpo.
- Apos a auditoria, foram redigidas copias antigas de docs com webhook/secret e movidas copias locais de `main.py.backup_*` para fora do repositorio.

## 3. Arquivos proibidos rastreados

Resultado do filtro de arquivos proibidos rastreados:

- `backend/app/.env.example`
- `backend/app/app/.env.example`
- `frontend/.env.example`
- `docs/storage/STORAGE_CLEANUP_FIX.md`
- `docs/storage/STORAGE_ORGANIZATION.md`

Classificacao:

- `.env.example`: permitido, arquivo de exemplo sem valores reais.
- `docs/storage/...`: falso positivo pelo nome `storage`; nao e diretorio de storage de usuario.

Conclusao: nao ha `.env` real, banco `.db`, dump `.sql`, `.pickle`, credencial Google, zip/tar ou upload/storage persistente rastreado pelo Git atual.

## 4. Working tree atual

### 4.1 Segredo real ainda no codigo atual

Nao encontrado nos padroes criticos conhecidos depois dos ajustes desta auditoria:

- chave ZapSign hardcoded;
- token fixo de webhook;
- webhook secret real;
- fallback dev de chave secreta;
- chave secreta exemplo antiga;
- senha fraca de basic auth antiga;
- senha fraca de seed admin antiga;
- senha fraca de seed usuario antiga;
- placeholder operacional antigo de API ZapSign.

### 4.2 Falsos positivos / documentacao segura

A busca generica ainda retorna muitas ocorrencias por nomes de variaveis, exemplos e codigo de autenticacao:

- `SECRET_KEY`, `DATABASE_URL`, `SMTP_*`, `IMAP_*`, `ZAPSIGN_*` em `.env.example`;
- funcoes e campos como `token`, `senha`, `senha_hash`, `api_key_zapsign`;
- documentacao com placeholders como `<WEBHOOK_PATH_TOKEN>` e `<ZAPSIGN_WEBHOOK_SECRET>`.

Classificacao: falso positivo ou documentacao segura, desde que os placeholders continuem sem valores reais.

## 5. Segredos removidos mas presentes no historico Git

O historico contem segredos ou valores sensiveis reais em commits antigos. Principais achados:

### 5.1 ZapSign API key

- Tipo: segredo real.
- Estado atual: removido do codigo atual.
- Local historico: `frontend/src/app/admin/advogados/page.tsx`
- Commits afetados incluem: `dc93cbd`, `fddd015`, `6f123da`, `82603cb`, `a0e49be`, `ca233b3`, `5a3830a`, `4676775`, `e2ae5bd`.
- Acao: rotacionar no painel ZapSign.

### 5.2 ZapSign webhook path token

- Tipo: segredo operacional / identificador sensivel.
- Estado atual: removido ou substituido por placeholder no codigo atual e docs atuais.
- Locais historicos: docs de webhook, `backend/app/routes/advogado.py`, `frontend/src/app/admin/advogados/page.tsx`.
- Commits afetados incluem commits desde o baseline `90a92c0` e posteriores.
- Acao: gerar novo token de caminho por advogado/webhook quando aplicavel.

### 5.3 ZapSign webhook secret

- Tipo: segredo real.
- Estado atual: removido ou substituido por placeholder no codigo atual e docs atuais.
- Locais historicos: `WEBHOOK_ZAPSIGN_TESTE.md`, `EMAILS_RESOLVIDO.md`, `docs/deploy/WEBHOOK_ZAPSIGN_TESTE.md`, `docs/historico/EMAILS_RESOLVIDO.md`.
- Commits afetados incluem commits desde o baseline `90a92c0` e posteriores.
- Acao: rotacionar `ZAPSIGN_WEBHOOK_SECRET`.

### 5.4 Basic auth antiga

- Tipo: credencial fraca hardcoded.
- Estado atual: removida do codigo atual; agora depende de `BASIC_AUTH_USER` e `BASIC_AUTH_PASSWORD`.
- Local historico: `backend/app/main.py`.
- Acao: se essa rota estiver acessivel em producao ou tiver sido usada, definir nova credencial via ambiente e nao reutilizar a antiga.

### 5.5 Senhas seed de usuarios

- Tipo: credenciais fracas de seed/importador.
- Estado atual: removidas do codigo atual; agora dependem de `SEED_ADMIN_PASSWORD` e `SEED_USER_PASSWORD`.
- Local historico: `backend/app/importadores/importar_usuarios.py`.
- Acao: garantir que usuarios criados por seed antiga tenham senha trocada/desativada.

### 5.6 SECRET_KEY fraca / fallbacks dev

- Tipo: segredo fraco / fallback inseguro.
- Estado atual: removido do codigo atual; `SECRET_KEY`/`JWT_SECRET_KEY` agora e obrigatorio.
- Locais historicos: `backend/app/auth_utils.py`, `backend/app/routes/advogado_public.py`, `backend/app/routes/uploads.py`.
- Acao: rotacionar `SECRET_KEY` de producao se houver chance de ter sido igual ou derivada dos valores antigos. Isso invalidara tokens JWT antigos.

### 5.7 Placeholder de API ZapSign usado como fallback

- Tipo: fallback inseguro, nao necessariamente segredo real.
- Estado atual: removido do codigo atual; agora falha se `ZAPSIGN_API_KEY_DEFAULT` nao estiver configurada.
- Locais historicos: `backend/app/routes/assinaturas.py`, `backend/app/routes/webhook_zapsign.py`.
- Acao: confirmar `ZAPSIGN_API_KEY_DEFAULT` real no ambiente, sem commitar.

## 6. Credenciais a rotacionar

Checklist para executar nos paineis corretos, sem inventar chaves no codigo:

- ZapSign API key exposta historicamente.
- ZapSign webhook secret exposto historicamente.
- ZapSign webhook path token usado nos exemplos antigos.
- `SECRET_KEY`/`JWT_SECRET_KEY` se houver qualquer chance de reutilizacao com valor antigo/fraco.
- `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` se a rota basica ainda for mantida.
- Senhas de usuarios criados por seed antiga (`admin@pjmol.com`, `usuario@pjmol.com`) se existirem.
- SMTP/IMAP: nao encontrei valores reais no Git atual; rotacionar somente se confirmar que apareceram em historico fora dos padroes auditados ou em clones antigos.
- Google credentials/token Drive: nao estao rastreados no Git atual; arquivos locais foram movidos para fora do repo. Rotacionar se esses arquivos tiverem sido compartilhados fora do ambiente local.

## 7. Opcoes para historico

### Opcao A - Recomendada agora

Rotacionar todas as credenciais expostas e manter o historico Git.

Vantagens:

- Menor risco operacional.
- Nao exige force push.
- Nao quebra clones existentes.
- Resolve o risco real quando as credenciais antigas deixam de funcionar.

Desvantagem:

- O historico continua contendo valores antigos, mas eles ficam inutilizados apos rotacao.

### Opcao B - Mais rigorosa

Reescrever historico com `git filter-repo` ou BFG e fazer force push.

Passos de alto nivel:

- Backup completo do repositorio local e remoto.
- Definir arquivo de substituicoes/redacoes.
- Rodar ferramenta de reescrita.
- Conferir novamente todo o historico.
- Force push protegido.
- Invalidar clones antigos e orientar todos a reclonar.

Riscos:

- Alto risco operacional.
- Pode quebrar clones, branches e referencias antigas.
- Nao substitui rotacao: mesmo apos reescrever, credenciais ja expostas devem ser rotacionadas.

Nao executar sem autorizacao expressa.

## 8. Deploy futuro seguro

Antes de qualquer deploy:

- Garantir que credenciais expostas foram rotacionadas.
- Garantir que producao possui `.env` proprio com `SECRET_KEY`, `ZAPSIGN_API_KEY_DEFAULT`, `ZAPSIGN_WEBHOOK_SECRET` e demais variaveis necessarias.
- Nao copiar `.env` local para producao.
- Nao sobrescrever banco, uploads, storage ou documentos.
- Rodar build local.
- Rodar testes/smoke checks locais.
- Criar backup novo da producao.
- Fazer deploy controlado apenas dos arquivos necessarios.

## 9. Conclusao

O codigo atual ficou substancialmente mais seguro: nao ha arquivos proibidos rastreados e os segredos hardcoded conhecidos foram removidos do working tree. O risco principal restante e historico: segredos reais ja passaram pelo GitHub. A recomendacao pragmatica e Opcao A agora: rotacionar credenciais expostas, manter historico e so considerar Opcao B se houver exigencia formal de remocao do historico.
