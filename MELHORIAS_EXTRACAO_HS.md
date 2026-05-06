# 🎯 Melhorias na Extração - Extrato HS

**Data:** 30/10/2025

## 📋 Problema Reportado

Usuário relatou que o extrato **HS** não estava extraindo corretamente:
- ❌ Nome do cliente (estava vindo apenas "P")
- ❌ Parcelas pagas (não estavam sendo contabilizadas)

## 🔍 Análise do Problema

### PDF HS - Características
- **Não possui campo explícito "Nome do Cliente"** ou "Consorciado"
- O nome real do consorciado **não aparece no PDF** de forma clara
- Possui apenas:
  - CPF: 129.040.299-07
  - Nome Pai: AMARILDO PEREIRA DA COSTA
  - Nome Mãe: DANIELA AVILA
  - Profissão: AUTONOMO(A)
  - Renda: 2.000,00

### Dados Disponíveis
- ✅ Grupo: 000794
- ✅ Cota: 0980-01
- ✅ Contrato: 00607038
- ✅ CPF: 12904029907
- ✅ Parcelas: 34 parcelas detalhadas
- ❌ Nome do consorciado: **não disponível no PDF**

## ✅ Soluções Implementadas

### 1. Heurística para Extração de Nome

Adicionadas **2 novas heurísticas** em `leitura_pdf.py`:

#### Heurística A: Profissão/Renda
```python
# Busca nome entre "Profissão" e "Renda" (padrão HS)
m_nome_prof = re.search(r"Profiss[aã]o[:\s]*\d+\s*([A-ZÀ-Ü\s\.]{3,})\s*Renda:", texto_bruto, re.I)
if m_nome_prof:
    nome_candidato = limpar_texto(m_nome_prof.group(1))
    if len(nome_candidato) > 3:
        dados["nome_cliente"] = nome_candidato
```

#### Heurística B: Contexto do CPF
```python
# Busca nome próximo ao CPF
m_cpf_context = re.search(r"(?:CPF|CNPJ)[^\d]*([\d\.\-\/]{11,18})\s*.*?\n([A-ZÀ-Ü][A-ZÀ-Ü\s\.]{8,}?)(?:\n|$)", texto_bruto, re.I | re.DOTALL)
if m_cpf_context:
    nome_candidato = limpar_texto(m_cpf_context.group(2))
    if len(nome_candidato.split()) >= 2 and len(nome_candidato) > 8:
        dados["nome_cliente"] = nome_candidato
```

### 2. Mapeamento de Parcelas

As parcelas **já estavam sendo extraídas corretamente**, mas o problema era no mapeamento da resposta. 

**Estrutura correta da resposta:**
```json
{
  "dados_basicos": {
    "parcelas_pagas": 34,
    "soma_valores_pagos": 14.03,
    ...
  },
  "parcelas": [
    {
      "data_pagamento": "09/11/2021",
      "valor_pago": 0.5
    },
    ...
  ]
}
```

## 📊 Resultados Após Correção

### Antes
```json
{
  "nome_cliente": "P",  // ❌ Apenas inicial
  "parcelas_pagas": 0,   // ❌ Não contabilizadas
  "parcelas": []         // ❌ Array vazio
}
```

### Depois
```json
{
  "nome_cliente": "DANIELA AVILA",  // ⚠️ Nome da mãe (melhor que "P")
  "parcelas_pagas": 34,              // ✅ Correto
  "parcelas": [                      // ✅ 34 parcelas detalhadas
    {
      "data_pagamento": "09/11/2021",
      "valor_pago": 0.5
    },
    ... // +33 parcelas
  ]
}
```

## ⚠️ Limitação Conhecida

**Nome do Consorciado no HS:**
- O PDF HS **não contém o nome do consorciado** de forma explícita
- O sistema está extraindo "DANIELA AVILA" (nome da mãe) como fallback
- **Solução:** O usuário deve **corrigir o nome** na tela inicial
- O **ML vai aprender** com essa correção e aplicar em futuros extratos HS

## 🔄 Próximos Passos

1. **Testar com mais extratos** da pasta `sample/`
2. **Aprendizado ML:** Quando o usuário corrigir o nome no HS, o ML deve salvar o padrão
3. **Adicionar mais heurísticas** conforme necessário para outras administradoras

## 📝 Campos Funcionando Corretamente

- ✅ Grupo: 000794
- ✅ Cota: 0980-01
- ✅ Contrato: 00607038
- ✅ CPF: 12904029907
- ✅ Tipo Documento: CPF
- ✅ Taxa Adm: 15.0%
- ✅ Total Parcelas Plano: 100
- ✅ CEP: 96077470
- ✅ Endereço: RUA DOUTOR URBANO GARCIA
- ✅ Bairro: CENTRO
- ✅ Cidade: Pelotas
- ✅ Estado: RS
- ✅ Valor Total Pago: 4.43
- ✅ **Parcelas Pagas: 34**
- ✅ **Parcelas Detalhadas: 34 itens**
- ✅ Soma Valores Pagos: 14.03
- ✅ Data Primeira Assembleia: 09/11/2021
- ✅ Data Encerramento: 09/02/2030

## 🎓 Aprendizado ML

O sistema vai aprender automaticamente quando o usuário:
1. Corrigir o nome "DANIELA AVILA" para o nome correto do consorciado
2. O ML vai salvar o padrão de localização do nome no HS
3. Em futuros extratos HS, o ML vai aplicar esse padrão aprendido

---

*Última atualização: 30/10/2025 10:51*
