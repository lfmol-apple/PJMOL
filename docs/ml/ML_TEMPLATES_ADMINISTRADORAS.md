# 🧠 Sistema de Machine Learning por Administradora

## O que é?

Um sistema inteligente que **aprende automaticamente** os padrões de extração de cada administradora e aplica esse conhecimento em novos extratos.

## Como funciona?

### 1. **Aprendizado Automático** 📚

Sempre que um extrato é processado **com sucesso**, o sistema:

- ✅ Analisa onde as **parcelas** estão localizadas
- ✅ Detecta a **estrutura da tabela** (quantas colunas, quais valores)
- ✅ Identifica **padrões de regex** para data + valor
- ✅ Aprende onde ficam os **valores principais** (Total Pago, Valor do Bem, etc.)
- ✅ Salva tudo em `templates_administradoras.json`

### 2. **Aplicação Inteligente** 🎯

Quando um **novo extrato da mesma administradora** chega:

1. Sistema detecta a administradora (HS, Yamaha, Santander, etc.)
2. **ANTES** de tentar extrair do zero, verifica se tem template aprendido
3. Se tem, **aplica o template** primeiro:
   - Usa os padrões de regex aprendidos
   - Procura nas mesmas posições da tabela
   - Extrai valores nos mesmos lugares
4. Se o template funcionar, usa os dados extraídos
5. Se não funcionar, usa o método tradicional como fallback

### 3. **Melhoria Contínua** 📈

- A cada novo extrato processado, o template é **atualizado**
- Os padrões ficam mais precisos com o tempo
- Não há limite de administradoras suportadas

## Benefícios

### ✅ **Mais Rápido**
- Não precisa testar múltiplas heurísticas
- Vai direto no padrão que já funciona

### ✅ **Mais Preciso**
- Usa conhecimento de extratos reais
- Menos chance de pegar valores errados

### ✅ **Auto-Aprendizado**
- Não precisa programar regras novas
- Sistema aprende sozinho com o uso

### ✅ **Específico por Administradora**
- HS usa padrão HS
- Yamaha usa padrão Yamaha
- Cada uma tem seu template otimizado

## Estatísticas Atuais

Acesse: `GET /ml-templates/estatisticas`

```json
{
  "total_administradoras": 6,
  "administradoras": [
    {
      "nome": "YAMAHA ADMINISTRADORA DE CONSÓRCIO LTDA",
      "extratos_processados": 1,
      "padroes_parcelas": 0,
      "padroes_valores": 0,
      "tem_estrutura_tabela": true
    },
    ...
  ]
}
```

## APIs Disponíveis

### 1. Estatísticas Gerais
```bash
GET /ml-templates/estatisticas
```

### 2. Detalhes de uma Administradora
```bash
GET /ml-templates/template/{nome_administradora}
```

### 3. Limpar Template de uma Administradora
```bash
DELETE /ml-templates/template/{nome_administradora}
```

### 4. Resetar Todos os Templates
```bash
POST /ml-templates/resetar
```
⚠️ **CUIDADO**: Remove todo o aprendizado!

## Exemplo Prático

### Primeiro Extrato HS
1. Sistema extrai usando métodos tradicionais
2. Descobre que HS tem:
   - Tabela com 11 colunas
   - Valores pagos na coluna 8 (segunda do final)
   - Datas no formato DD/MM/YYYY
3. **Salva esse padrão**

### Segundo Extrato HS
1. Sistema detecta: "É HS!"
2. **Aplica template HS** aprendido
3. Vai direto na coluna 8 para pegar valores
4. Usa regex específico de HS
5. ✅ Extração mais rápida e precisa

### Terceiro Extrato HS
1. Usa template
2. **Confirma** que padrão funciona
3. **Reforça** o aprendizado
4. Cada vez mais confiável

## Arquivos

- **Template Storage**: `backend/app/extracao/dados/templates_administradoras.json`
- **Lógica ML**: `backend/app/ml_templates_administradoras.py`
- **API**: `backend/app/api/ml_templates.py`
- **Integração**: `backend/app/extracao/leitura_pdf.py` (linhas 1320-1340 e 1505-1515)

## Logs

O sistema gera logs informativos:

```
🎯 Aplicando template de HS ADMINISTRADORA DE CONSÓRCIOS LTDA (baseado em 3 extratos)
✅ Extraiu 15 parcelas usando template
🎓 ML aprendeu padrões de HS ADMINISTRADORA DE CONSÓRCIOS LTDA
```

## Roadmap Futuro

- [ ] Dashboard visual de templates
- [ ] Comparação de precisão (template vs tradicional)
- [ ] Export/import de templates
- [ ] Versionamento de templates
- [ ] Confiança por padrão (score)

## Resultado

🎉 **Sistema totalmente autônomo que melhora sozinho a cada extrato processado!**

Não é mais necessário programar regras específicas para cada administradora - o ML aprende automaticamente! 🚀
