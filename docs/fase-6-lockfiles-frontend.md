# Fase 6 - Lockfiles e previsibilidade do frontend

Data: 2026-04-13
Branch analisada: `chore/organizacao-inicial`

## Objetivo

Remover a ambiguidade de workspace root no build do frontend sem alterar
dependencias, codigo de produto, backend ou comportamento do sistema.

## Diagnostico

O `npm run build` passava, mas o Next exibia aviso de multiplos lockfiles:

- `/Users/leonardomol/package-lock.json`
- `/Users/leonardomol/PJMOL - PRODUCAO/frontend/package-lock.json`

O lockfile em `/Users/leonardomol/package-lock.json` pertence a outro contexto
(`petmol-monorepo`) e esta fora deste repositorio PJMOL.

O lockfile fonte de verdade para este frontend e:

```text
frontend/package-lock.json
```

Nao foi removido nem alterado o lockfile externo, porque ele fica fora do
repositorio atual e pode pertencer a outro projeto.

## Correcao aplicada

Em `frontend/next.config.ts`, foi definido explicitamente:

```ts
outputFileTracingRoot: __dirname
```

Isso fixa o root de tracing/build no diretorio do frontend, evitando que o Next
suba ate `/Users/leonardomol` e use o lockfile externo para inferir o workspace.

Nao houve alteracao em:

- `frontend/package.json`
- `frontend/package-lock.json`
- dependencias
- rotas
- JSX/renderizacao
- chamadas de API
- backend

## Convencao operacional

Para instalar e validar o frontend:

```bash
cd frontend
npm install --include=optional
npm exec tsc -- --noEmit
npm run build
```

Nao rodar `npm audit fix` junto com fases de organizacao/limpeza, porque isso
pode atualizar dependencias e alterar comportamento.

## Validacao

- `npm run build`: passou e nao exibiu mais o aviso de multiplos lockfiles.
- `npm exec tsc -- --noEmit`: passou quando executado depois do build.
- `git diff --check`: passou.

Observacao: executar `tsc` em paralelo com `next build` pode falhar lendo
arquivos temporarios em `.next/types`. As validacoes devem rodar em sequencia.

## Proximo alvo recomendado

Avaliar a rota experimental `frontend/src/app/gerencial/processos/test-redesigned`
e o arquivo `page-redesigned.tsx`. Eles foram preservados por referencia real,
mas ainda parecem uma variante experimental dentro da arvore de rotas.
