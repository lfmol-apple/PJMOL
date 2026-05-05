# 🤖 Sistema de Machine Learning para Extração Automática de Extratos

## Visão Geral

O sistema de Machine Learning foi desenvolvido para **automatizar completamente** a leitura de extratos de consórcio, eliminando a necessidade de intervenção manual. O sistema aprende com as correções do usuário e gradualmente automatiza todos os campos de dados.

## 🚀 Como Funciona

### 1. **Extração Automática Inteligente**

Quando você faz upload de um PDF:

```python
# Fluxo automatizado no endpoint /extrair
1. Extração tradicional (regex específicos por administradora)
2. 🧠 ML enriquece automaticamente com dados de administradora/comarca/CEP  
3. 🤖 ML aplica padrões aprendidos para preencher campos vazios
4. ✨ Sistema exibe mensagens de campos automatizados
```

### 2. **Aprendizado Contínuo**

Cada vez que você corrige um campo, o ML:

- **Analisa o contexto** onde o valor correto está no PDF
- **Cria padrões regex** baseados na posição e palavras-chave
- **Armazena o conhecimento** para próximas extrações
- **Aplica automaticamente** em futuros extratos da mesma administradora

### 3. **Campos Automatizáveis**

O sistema pode automatizar todos estes campos:

- ✅ `nome` - Nome do consorciado
- ✅ `grupo` - Número do grupo
- ✅ `cota` - Número da cota  
- ✅ `valor_bem` - Valor do bem
- ✅ `prazo_meses` - Prazo em meses
- ✅ `numero_contrato` - Número do contrato
- ✅ `endereco` - Endereço completo
- ✅ `valor_total_pago_extrato` - Valor total pago
- ✅ `comarca` - Comarca (já integrado)
- ✅ `data_primeira_assembleia` - Data da primeira assembleia
- ✅ `data_encerramento` - Data de encerramento

## 📡 APIs Disponíveis

### `/api/ml/estatisticas` (GET)
Retorna estatísticas do sistema ML:

```json
{
  "sucesso": true,
  "estatisticas": {
    "administradoras_com_ml": 5,
    "campos_com_padroes_aprendidos": 23,
    "total_padroes_regex": 15,
    "campos_automatizaveis": ["nome", "grupo", "cota", ...],
    "ultima_atualizacao": "2024-10-29T15:30:45"
  }
}
```

### `/api/ml/status` (GET)
Status geral do sistema:

```json
{
  "sucesso": true,
  "status": {
    "sistema_ml_ativo": true,
    "total_administradoras_treinadas": 5,
    "total_campos_automatizados": 23,
    "campos_disponiveis": ["nome", "grupo", ...],
    "ultima_atualizacao": "2024-10-29T15:30:45"
  }
}
```

### `/api/ml/capturar-correcao` (POST)
Treina o ML com uma correção específica:

```json
{
  "administradora": "EMBRACON",
  "campo": "nome",
  "valor_original": "",
  "valor_corrigido": "JOÃO DA SILVA",
  "texto_pdf": "texto completo do PDF..."
}
```

### `/api/ml/capturar-correcoes-multiplas` (POST)
Treina com múltiplas correções de uma vez:

```json
{
  "administradora": "EMBRACON", 
  "dados_originais": {"nome": "", "grupo": ""},
  "dados_corrigidos": {"nome": "JOÃO DA SILVA", "grupo": "123"},
  "texto_pdf": "texto completo do PDF..."
}
```

### `/api/ml/padroes/{administradora}` (GET)
Mostra padrões aprendidos para uma administradora:

```json
{
  "sucesso": true,
  "administradora": "EMBRACON",
  "padroes": {
    "nome": {
      "total_padroes": 3,
      "confianca": 0.8,
      "total_correcoes": 8,
      "ultimo_aprendizado": "2024-10-29T15:30:45"
    }
  }
}
```

## 🎯 Integração Frontend

### Hook `useMLAprendizado`

```typescript
import { useMLAprendizado } from '@/hooks/useMLAprendizado';

function MeuComponente() {
  const { 
    capturarCorrecao, 
    obterEstatisticas, 
    carregando 
  } = useMLAprendizado();
  
  // Captura correção quando usuário edita campo
  const handleCorrecao = async (campo: string, novoValor: string) => {
    const resultado = await capturarCorrecao({
      administradora: "EMBRACON",
      campo,
      valor_original: valorAnterior,
      valor_corrigido: novoValor,
      texto_pdf: textoPdf
    });
    
    if (resultado.sucesso) {
      console.log(resultado.mensagem); // "🧠 ML aprendeu novo padrão..."
    }
  };
}
```

### Hook `useDetectorCorrecaoML`

```typescript
import { useDetectorCorrecaoML } from '@/hooks/useMLAprendizado';

function FormularioExtrato() {
  const { 
    definirDadosOriginais, 
    detectarCorrecao 
  } = useDetectorCorrecaoML();
  
  // Define dados originais após extração
  useEffect(() => {
    if (dadosExtraidos) {
      definirDadosOriginais(
        dadosExtraidos, 
        administradora, 
        textoPdf
      );
    }
  }, [dadosExtraidos]);
  
  // Auto-detecta correções
  const handleInputChange = (campo: string, valor: string) => {
    setFormData(prev => ({ ...prev, [campo]: valor }));
    detectarCorrecao(campo, valor); // 🧠 Treina ML automaticamente
  };
}
```

### Componente `EstatisticasML`

```typescript
import { EstatisticasMLDetalhada } from '@/components/EstatisticasML';

function Dashboard() {
  return (
    <div>
      <h2>Progresso do Machine Learning</h2>
      <EstatisticasMLDetalhada className="mb-6" />
    </div>
  );
}
```

## 📊 Exemplo de Uso Completo

### 1. **Primeira Extração** (sem ML treinado)

```bash
POST /extrair
# Upload: extrato_embracon.pdf

# Resposta:
{
  "dados_basicos": {
    "administradora": "EMBRACON",
    "nome": "",           # ❌ Vazio - ML não conhece padrão ainda
    "grupo": "",          # ❌ Vazio 
    "cota": "123",        # ✅ Regex tradicional funcionou
    "comarca": "OSASCO"   # ✅ ML automático já funcionando
  },
  "mensagens_aprendizado": [
    "🤖 ML detectou administradora: EMBRACON",
    "🤖 ML corrigiu comarca automaticamente: OSASCO"
  ]
}
```

### 2. **Usuário Corrige Campos**

```typescript
// Frontend detecta automaticamente e treina ML
handleInputChange("nome", "MARIA DA SILVA");
handleInputChange("grupo", "456");

// Ou captura múltiplas correções:
await capturarCorrecoesMultiplas({
  administradora: "EMBRACON",
  dados_originais: { nome: "", grupo: "" },
  dados_corrigidos: { nome: "MARIA DA SILVA", grupo: "456" },
  texto_pdf: textoPdf
});
```

### 3. **Próxima Extração** (com ML treinado)

```bash
POST /extrair  
# Upload: outro_extrato_embracon.pdf

# Resposta:
{
  "dados_basicos": {
    "administradora": "EMBRACON", 
    "nome": "JOÃO DOS SANTOS",    # ✅ ML automatizou!
    "grupo": "789",               # ✅ ML automatizou!
    "cota": "101",                # ✅ Regex tradicional
    "comarca": "OSASCO"           # ✅ ML automático
  },
  "mensagens_aprendizado": [
    "🤖 ML preencheu automaticamente: nome",
    "🤖 ML preencheu automaticamente: grupo", 
    "✨ ML automatizou 2 campos para EMBRACON"
  ]
}
```

## 🔧 Arquivos Principais

### Backend
- `ml_extração_automatica.py` - Core do sistema ML
- `api/ml_aprendizado.py` - APIs REST para ML
- `aprendizado/padroes_ml_extratos.json` - Padrões aprendidos (auto-gerado)
- `main.py` - Integração no endpoint `/extrair`

### Frontend  
- `hooks/useMLAprendizado.ts` - Hook principal para ML
- `components/EstatisticasML.tsx` - Componente de estatísticas
- Integração automática em formulários de extração

## 📈 Progressão do Aprendizado

### Fase 1: **Administradora/Comarca** (✅ Já implementado)
- Detecção automática de CNPJ → administradora  
- Resolução automática CNPJ → CEP → comarca
- 79% das administradoras já mapeadas

### Fase 2: **Campos Básicos** (🚀 Novo sistema)
- Nome, grupo, cota, contrato
- Aprendizado baseado em contexto e posição
- Padrões regex adaptativos por administradora

### Fase 3: **Campos Avançados** (🔄 Em evolução)
- Valores monetários com formatação inteligente
- Datas com múltiplos formatos
- Endereços completos estruturados

### Fase 4: **Automação Completa** (🎯 Meta)
- 100% dos campos automatizados
- Zero intervenção manual necessária
- ML aprende novos layouts automaticamente

## ⚠️ Considerações Importantes

### **Preservação de APIs Existentes**
- ✅ APIs de comarca/CEP/CNPJ mantidas intactas
- ✅ Sistema tradicional funciona como fallback
- ✅ Compatibilidade total com código existente

### **Segurança e Confiabilidade**
- 🔒 ML nunca substitui dados já preenchidos corretamente
- 🛡️ Fallback automático para métodos tradicionais se ML falhar
- 📝 Log detalhado de todas as operações ML

### **Performance**
- ⚡ ML aplicado de forma assíncrona
- 💾 Padrões armazenados em JSON para acesso rápido
- 🔄 Cache inteligente para otimização

## 🎉 Benefícios

1. **Para o Usuário**
   - ⏱️ Redução drástica do tempo de preenchimento
   - 🎯 Maior precisão na extração de dados
   - 📈 Melhoria contínua e automática

2. **Para o Sistema**
   - 🧠 Inteligência que cresce com o uso
   - 🔄 Adaptação automática a novos layouts
   - 📊 Métricas detalhadas de performance

3. **Para o Negócio**
   - 💰 Redução de custos operacionais
   - 🚀 Escalabilidade sem limites
   - 📈 ROI crescente com cada uso

---

**O sistema está pronto para uso e vai aprender automaticamente com cada extrato processado, eliminando gradualmente a necessidade de intervenção manual! 🚀**