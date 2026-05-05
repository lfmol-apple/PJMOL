# ⏰ Scheduler - Atualização Automática de Índices

## 📋 Resumo da Configuração

O sistema está configurado para atualizar **TODOS OS ÍNDICES DIARIAMENTE** de forma automática.

## 🕐 Jobs Programados

### 1. **Atualização de Índices** 
- **Frequência**: Todo dia às 02:00 BRT
- **Job ID**: `atualizacao_indices_diaria`
- **Índices atualizados**:
  - ✅ TJMG (Tabela TJMG)
  - ✅ TJSP (Tabela TJSP)
  - ✅ IPCA
  - ✅ IPCA-E
  - ✅ INPC
  - ✅ IGP-M
  - ✅ SELIC
  - ✅ POUPANÇA

### 2. **Recálculo de Extratos**
- **Frequência**: Todo dia às 03:00 BRT
- **Job ID**: `recalculo_diario`
- **Ação**: Recalcula todos os extratos cadastrados com os novos índices

### 3. **Limpeza de Documentos Gerados**
- **Frequência**: Último dia do mês às 23:45 BRT
- **Job ID**: `limpeza_mensal_documentos`
- **Ação**: Remove todos os documentos gerados para liberar espaço

### 4. **Limpeza de Uploads Temporários**
- **Frequência**: A cada hora
- **Job ID**: `limpeza_temp_uploads_hourly`
- **Ação**: Remove arquivos temporários com mais de 24 horas

## 🔄 Fluxo de Atualização

```
02:00 → Atualiza TODOS os índices (TJMG, TJSP, IPCA, IPCA-E, INPC, IGP-M, SELIC, POUPANÇA)
   ↓
03:00 → Recalcula TODOS os extratos com os novos índices
   ↓
        Sistema atualizado e pronto para uso
```

## 📊 Registro de Status

Todos os jobs são registrados na tabela `job_state` do banco de dados:
- ✅ Sucesso: `mark_success()`
- ❌ Falha: `mark_failure()` com mensagem de erro

## 🚀 Execução Manual

Para testar a atualização manualmente, execute:

```bash
cd "/Users/leonardomol/Jao/105 19/backend"
source ../.venv/bin/activate

# Atualizar índices individualmente
python indices/baixar_tjmg.py
python indices/baixar_tjsp.py
python indices/baixar_ipca.py
python indices/baixar_ipcae.py
python indices/baixar_inpc.py
python indices/baixar_igpm.py
python indices/baixar_selic.py
python indices/baixar_poupanca.py
```

## 📝 Logs

Os logs aparecem no console do backend:
- `[Scheduler] ✅` = Sucesso
- `[Scheduler] ❌` = Erro

## ⚙️ Arquivo de Configuração

Localização: `/backend/app/core/scheduler.py`

## 🎯 Status Atual

✅ **ATIVO** - Todos os índices são atualizados automaticamente TODO DIA às 02:00 BRT
✅ **COMPLETO** - 8 índices configurados (TJMG, TJSP, IPCA, IPCA-E, INPC, IGP-M, SELIC, POUPANÇA)
✅ **MONITORADO** - Erros são registrados no banco de dados

---

**Última atualização**: 28/10/2025
**Configurado por**: Sistema automático
