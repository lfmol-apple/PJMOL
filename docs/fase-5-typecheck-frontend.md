# Fase 5 - Typecheck do frontend

Data: 2026-04-13
Branch analisada: `chore/organizacao-inicial`

## Objetivo

Corrigir o erro de typecheck em `frontend/src/app/page.tsx` sem alterar
comportamento visual, fluxo, payload ou contrato de API.

## Erro encontrado

`npm exec tsc -- --noEmit` falhava com erros em `id` e `oab`:

- `All declarations of 'id' must have identical modifiers.`
- `Subsequent property declarations must have the same type.`
- `All declarations of 'oab' must have identical modifiers.`

## Causa

O arquivo tinha duas declaracoes da mesma interface `Advogado`:

- A primeira declarava `id?: number` e `oab?: string`.
- A segunda declarava `id: number` e `oab: string`.

TypeScript mescla interfaces com o mesmo nome, mas propriedades repetidas
precisam manter o mesmo tipo e o mesmo modificador opcional/obrigatorio.

## Correcao aplicada

Removida a segunda declaracao de `interface Advogado`, que era redundante e mais
estreita. A primeira declaracao foi preservada porque ja continha os mesmos
campos e tambem cobria `email`, `telefone` e `ativo`.

Nao houve alteracao em:

- JSX/renderizacao.
- Estados React.
- Nomes de campos.
- Payloads.
- Chamadas de API.
- Validacao de negocio.

## Validacao

- `npm exec tsc -- --noEmit`: passou.
- `npm run build`: passou.
- `git diff --check`: passou.

Observacao: `npm run build` ainda mostra aviso sobre multiplos lockfiles, mas
isso nao bloqueia o build e nao foi tratado nesta fase.

## Proximo alvo recomendado

Investigar o aviso de multiplos lockfiles do Next, sem alterar dependencias de
produto. O objetivo seria tornar o workspace root explicito ou remover a causa
externa do aviso, se for seguro.
