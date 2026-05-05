# Comissão Gerente

Quando um gerente entra em um extrato/processo e altera o status do resultado para "Acordo", a tela:

/gerencial/processos

deve exibir uma coluna chamada:

**Comissão Gerente**

A coluna fica entre:

Advogado | **Comissão Gerente** | Gerente

---

## Condições para exibir o valor

A comissão só deve aparecer quando **TODAS** as condições forem verdadeiras:

1. a linha possui número do processo/extrato (`numero_processo` não vazio e diferente de "None");
2. o Resultado é **"Acordo"** (`resultado_processo === "acordo"`);
3. o campo **"Honorários Hoje"** possui valor numérico válido e maior que zero.

Se qualquer condição faltar, exibir **"—"** (nunca zero enganoso).

---

## Fórmula

```
Comissão Gerente = Honorários Hoje ÷ 2 ÷ 12
```

- primeiro divide os honorários por 2;
- depois divide esse valor em 12 avos.

**Exemplo:**

```
Honorários Hoje = R$ 12.000,00

R$ 12.000,00 ÷ 2 = R$ 6.000,00
R$ 6.000,00 ÷ 12 = R$ 500,00

Comissão Gerente = R$ 500,00
```

---

## Campo de origem

`honorarios_hoje_total` — campo primário.  
Fallback: `honorarios_hoje_adv + honorarios_hoje_emp`.

O campo aceita número direto ou string no formato `R$ 1.234,56`.

---

## Restrições

- Não altera cálculo de honorários.
- Não altera status nem resultado.
- Não altera persistência — é um campo calculado apenas na exibição.
- Não altera regras existentes da tabela.

---

## Implementação

Arquivo: `frontend/src/app/gerencial/processos/page.tsx`

Função: `calcComissaoGerente(it: any): number | null`

Renderização: coluna somente leitura, alinhada à direita, formato `pt-BR` (`R$ 0.000,00`).
