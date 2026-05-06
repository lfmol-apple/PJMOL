# 🧠 Sistema de Aprendizado Automático de Extratos

## ❓ O Sistema Aprende Automaticamente?

**SIM! O sistema possui aprendizado automático incremental.**

## 🎯 Como Funciona

### 1. **Aprendizado Por Uso** (Automático)

Cada vez que você processa um extrato, o sistema:

✅ **Salva automaticamente**:
- Quais campos foram extraídos com sucesso
- Qual administradora foi identificada
- Se usou IA (Google AI) como fallback
- Data de encerramento identificada
- Timestamp de processamento

✅ **Melhora progressivamente**:
- Aprende padrões específicos de cada administradora
- Armazena exemplos de sucesso
- Mantém histórico dos últimos 5 processamentos
- Incrementa contador de sucessos/falhas

### 2. **Treinamento em Lote** (Manual/Configurável)

Você pode treinar o sistema com vários PDFs de uma vez:

```bash
cd "/Users/leonardomol/Jao/105 19/backend/app"
source ../../.venv/bin/activate

# Processar PDFs da pasta extratos/sample
python -m extracao.treinador_lote

# Ou especificar outra pasta
python -m extracao.treinador_lote --pasta /caminho/para/pdfs

# Sobrescrever exemplos existentes
python -m extracao.treinador_lote --sobrescrever

# Limitar quantidade
python -m extracao.treinador_lote --limite 10
```

## 📊 O Que é Armazenado

### Arquivo de Aprendizado (por administradora)

Localização: `/backend/app/aprendizado/dados/{administradora}.json`

Exemplo de conteúdo:
```json
{
  "total_processados": 15,
  "com_sucesso": 14,
  "falha": 1,
  "usou_ia": 3,
  "ultimos_5": [
    {
      "sucesso": true,
      "usou_ia": false,
      "data_encerramento_via": "regex",
      "timestamp": "2025-10-28T18:30:00-03:00"
    }
  ],
  "campos_aprendidos": {
    "ultimo_modelo": "extrato_bradesco_exemplo.pdf",
    "exemplo_salvo": "bradesco/extrato_bradesco_exemplo.json",
    "campos_extraidos": [
      "administradora",
      "cnpj_administradora",
      "grupo",
      "cota",
      "data_encerramento",
      "valor_total"
    ]
  }
}
```

### Exemplos Estruturados

Localização: `/backend/app/aprendizado/exemplos/{slug_administradora}/`

Cada PDF processado gera um JSON com:
- **Dados extraídos**: Todos os campos identificados
- **Parcelas**: Lista completa de parcelas com valores
- **Arquivo original**: Nome do PDF fonte
- **Administradora**: Nome identificado

## 🔄 Fluxo de Processamento

```
1. Upload do PDF
   ↓
2. Extração com PDFPlumber (texto nativo)
   ↓
3. Se faltar campos críticos → OCR (Tesseract)
   ↓
4. Se ainda faltar dados → Google AI (fallback inteligente)
   ↓
5. SALVA AUTOMATICAMENTE os campos aprendidos
   ↓
6. Na próxima extração, usa o conhecimento acumulado
```

## 🎓 Tipos de Aprendizado

### A. **Aprendizado Baseado em Regras** (Ativo)
- Regex patterns específicos por administradora
- Seções conhecidas do PDF
- Padrões de formatação

### B. **Aprendizado Incremental** (Ativo)
- Cada extração bem-sucedida alimenta a base
- Sistema reconhece padrões recorrentes
- Melhora a taxa de sucesso ao longo do tempo

### C. **Machine Learning** (Não Implementado)
- ❌ Não há modelos de ML treinados
- ✅ Mas a estrutura permite adicionar no futuro
- 💡 Os exemplos salvos podem ser usados para treinar ML

## 📈 Estatísticas Por Administradora

Você pode consultar o aprendizado:

```python
from aprendizado.aprendizado import ler_aprendizado

# Ver estatísticas de uma administradora
stats = ler_aprendizado("BRADESCO")
print(f"Processados: {stats['total_processados']}")
print(f"Taxa de sucesso: {stats['com_sucesso']/stats['total_processados']*100:.1f}%")
```

## 🚀 Como Melhorar o Aprendizado

### 1. **Adicionar Exemplos Manualmente**

Coloque PDFs em `/extratos/sample/` e rode:
```bash
python -m extracao.treinador_lote
```

### 2. **Processar Lote de PDFs Históricos**

```bash
python -m extracao.treinador_lote --pasta /pasta/com/pdfs/antigos
```

### 3. **Corrigir e Reprocessar**

Se um extrato foi processado com erro, corrija e reprocesse:
```bash
python -m extracao.treinador_lote --sobrescrever
```

## 📁 Estrutura de Diretórios

```
backend/app/
├── aprendizado/
│   ├── aprendizado.py          # Lógica de salvamento
│   ├── dados/                   # JSONs por administradora
│   │   ├── bradesco.json
│   │   ├── caixa.json
│   │   └── ...
│   └── exemplos/                # Exemplos estruturados
│       ├── bradesco/
│       │   ├── exemplo1.json
│       │   └── exemplo2.json
│       └── ...
├── extracao/
│   ├── leitura_pdf.py          # Extração principal
│   ├── treinador_lote.py       # Processamento em lote
│   └── extrair_inteligente.py  # IA fallback
└── dados/
    └── administradoras.json    # Mapa CNPJ → Nome
```

## 🎯 Resumo

| Aspecto | Status | Descrição |
|---------|--------|-----------|
| **Aprendizado Automático** | ✅ ATIVO | Salva automaticamente cada processamento |
| **Treinamento em Lote** | ✅ DISPONÍVEL | Via `treinador_lote.py` |
| **Histórico por Admin** | ✅ ATIVO | Mantém estatísticas e exemplos |
| **Fallback Inteligente** | ✅ ATIVO | OCR → Google AI |
| **Machine Learning** | ❌ NÃO | Mas estrutura permite implementar |

## ⚙️ Configuração Necessária

**Nenhuma!** O sistema já está 100% configurado e funcional.

Ele aprende automaticamente a cada extrato processado. Você só precisa:

1. ✅ Fazer upload do PDF (já funciona)
2. ✅ O sistema processa e aprende automaticamente
3. ✅ Cada novo extrato melhora a taxa de sucesso

## 📊 Verificar Aprendizado Atual

```bash
cd "/Users/leonardomol/Jao/105 19/backend/app"
ls -la aprendizado/dados/

# Ver conteúdo de uma administradora específica
cat aprendizado/dados/bradesco.json | python -m json.tool
```

---

**Última atualização**: 28/10/2025
**Status**: ✅ Sistema de aprendizado ATIVO e funcional
