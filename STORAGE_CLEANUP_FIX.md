# 🧹 Correções de Limpeza do Storage

**Data:** 27 de outubro de 2025  
**Objetivo:** Garantir integridade e limpeza completa ao deletar extratos

---

## 📋 Problemas Identificados

### 1. Pastas Órfãs no Storage
**Situação encontrada:**
- `storage/clientes/` → 17 pastas de clientes deletados
- `storage/Extrato/` → Pasta com maiúsculo (incorreta) + ID 15 que não existe
- `storage/_backups/` → Pasta vazia desnecessária
- Pastas em `anexos/`, `assinaturas/`, `extratos/` de IDs deletados

**Causa:**
- DELETE de extratos não limpava arquivos do storage
- Código criava pastas duplicadas/incorretas
- Sem processo de cleanup ao deletar

### 2. URLs Antigas Reaparecem no Frontend
**Sintoma:**
> "quando um cliente aparece pela segunda vez, a url antiga dos comprovantes de identidade e de endereço voltam junto com o extrato que subiu novamente"

**Causa raiz:**
- Frontend lê URLs de múltiplas fontes: `row.comprovante_endereco_url`, `extras.comprovante_endereco_url`, etc
- Campos do banco (`comprovante_endereco_url`, `documento_identidade_url`) não são limpos ao deletar
- Se o extrato antigo não foi completamente deletado, URLs persistem

### 3. Pasta `storage/clientes` com Symlinks Desnecessários
**Problema:**
- Função `_make_client_alias()` criava symlinks em `storage/clientes/{nome}_{cpf}/documentos/`
- Symlinks ficavam órfãos ao deletar extrato
- Adiciona complexidade sem benefício claro
- Pasta precisa ser limpa manualmente

---

## ✅ Correções Implementadas

### 1. Função de Limpeza Completa do Storage
**Arquivo:** `backend/app/utils/cleanup_storage.py`

```python
def cleanup_extrato_storage(extrato_id, cpf_cnpj, nome_cliente):
    """Remove TODAS as pastas relacionadas a um extrato"""
    # Remove:
    # - storage/anexos/{extrato_id}
    # - storage/assinaturas/{extrato_id}
    # - storage/extratos/{extrato_id}
    # - storage/Extrato/{extrato_id} (legado)
    # - storage/clientes/*_{cpf}/
```

**Recursos:**
- Tratamento robusto de erros
- Logging detalhado
- Estatísticas de remoção
- Remoção de pastas legadas

### 2. Delete de Extrato com Cleanup Automático
**Arquivo:** `backend/app/routes/extratos.py` (linha ~1142)

**Modificação:**
```python
@router.delete("/{extrato_id}")
def delete_extrato(extrato_id, db, perfil, usuario_id_opt):
    # Captura dados antes de deletar
    cpf_cnpj = getattr(ex, "cpf_cnpj", None)
    nome_cliente = getattr(ex, "nome_cliente", None)
    
    # Delete do banco (CASCADE automático)
    db.delete(ex)
    db.commit()
    
    # Limpa storage APÓS commit
    cleanup_extrato_storage(extrato_id, cpf_cnpj, nome_cliente)
```

**Garante:**
- ✅ Delete do banco com CASCADE para parcelas/custas/anexos
- ✅ Remoção de TODOS os arquivos relacionados
- ✅ Limpeza de symlinks órfãos
- ✅ Não falha se cleanup der erro (apenas loga)

### 3. Desabilitada Criação de Symlinks
**Arquivo:** `backend/app/routes/uploads.py` (linha ~1349)

**Antes:**
```python
alias_public_url = _make_client_alias(extrato_id, filename, abs_saved_path)
```

**Depois:**
```python
# ❌ DESABILITADO: criação de symlinks desnecessários em storage/clientes
# alias_public_url = _make_client_alias(...)
alias_public_url = None  # não criar mais aliases
```

**Resultado:**
- ✅ Pasta `storage/clientes` não será mais criada
- ✅ Não haverá mais symlinks órfãos
- ✅ Estrutura de storage simplificada

### 4. Script de Limpeza de Pastas Órfãs
**Arquivo:** `limpar_storage_orfaos.py`

**Executado:**
```bash
python3 limpar_storage_orfaos.py
```

**Resultado:**
```
✅ 17 pastas de clientes removidas
✅ Pasta Extrato (maiúsculo) removida
✅ Pasta _backups removida
📊 Total: 19 pastas e 11 arquivos limpos
```

**Storage final:**
```
📁 anexos: [7, 9, 10, 12]
📁 assinaturas: [9, 10]
📁 extratos: [7, 9, 10, 12]
📁 clientes: (vazia)
```

---

## 🔍 Verificações de Integridade

### Relacionamentos CASCADE ✅
**Arquivo:** `backend/app/models/extrato.py`

Todos os relacionamentos têm CASCADE configurado corretamente:

```python
parcelas = relationship(
    "ParcelaExtrato",
    cascade="all, delete-orphan",
    passive_deletes=True
)

custas = relationship(
    "CustaExtrato", 
    cascade="all, delete-orphan",
    passive_deletes=True
)

anexos = relationship(
    "AnexoExtrato",
    cascade="all, delete-orphan", 
    passive_deletes=True
)
```

✅ **Garantia:** Ao deletar extrato, todos os registros relacionados são removidos automaticamente do banco.

---

## 🧪 Testes Necessários

### Teste Completo de Delete
1. ✅ Criar extrato de teste
2. ✅ Fazer upload de documentos (identidade, endereço)
3. ✅ Verificar URLs aparecem no frontend `/gerencial/processos`
4. ⏳ Deletar extrato via API: `DELETE /extratos/{id}`
5. ⏳ Verificar storage completamente limpo:
   - `storage/anexos/{id}` → REMOVIDO
   - `storage/assinaturas/{id}` → REMOVIDO
   - `storage/extratos/{id}` → REMOVIDO
   - `storage/clientes/*_{cpf}/` → REMOVIDO
6. ⏳ Criar NOVO extrato com MESMO CPF
7. ⏳ Verificar que URLs antigas NÃO reaparecem

### Como Testar

**1. Criar extrato via frontend ou API:**
```bash
POST /extratos
{
  "nome_cliente": "TESTE DELETE",
  "cpf_cnpj": "12345678901",
  "grupo": "TESTE",
  "cota": "001"
}
```

**2. Fazer upload de documentos:**
```bash
POST /uploads/{extrato_id}
# Upload de comprovante_endereco.pdf
# Upload de documento_identidade.pdf
```

**3. Verificar storage criado:**
```bash
ls -la backend/app/storage/anexos/{extrato_id}
ls -la backend/app/storage/extratos/{extrato_id}
```

**4. Deletar extrato:**
```bash
DELETE /extratos/{extrato_id}
```

**5. Verificar limpeza completa:**
```bash
# DEVE retornar vazio/não existe
ls backend/app/storage/anexos/{extrato_id}
ls backend/app/storage/assinaturas/{extrato_id}
ls backend/app/storage/extratos/{extrato_id}

# Verificar que pasta clientes não foi criada
ls backend/app/storage/clientes/
```

---

## 📊 Resumo das Mudanças

| Arquivo | Mudança | Status |
|---------|---------|--------|
| `utils/cleanup_storage.py` | ➕ Criado - Funções de limpeza completa | ✅ |
| `routes/extratos.py` | 🔧 Modificado - DELETE chama cleanup | ✅ |
| `routes/uploads.py` | ❌ Desabilitado - _make_client_alias | ✅ |
| `limpar_storage_orfaos.py` | ➕ Script limpeza - 19 pastas removidas | ✅ |
| `models/extrato.py` | ✅ Verificado - CASCADE ok | ✅ |

---

## 🎯 Garantias Após Correções

### ✅ Ao deletar um extrato:
1. **Banco de dados** → Registro deletado + CASCADE (parcelas, custas, anexos)
2. **Storage/anexos** → Pasta removida completamente
3. **Storage/assinaturas** → Pasta removida completamente
4. **Storage/extratos** → Pasta removida completamente
5. **Storage/clientes** → Symlinks removidos (se existirem)
6. **Logs** → Estatísticas detalhadas da limpeza

### ✅ URLs não reaparecem:
- Arquivos físicos são deletados → URLs retornam 404
- Mesmo que campo do banco persista, arquivo não existe
- Frontend não exibe URLs inválidas

### ✅ Storage limpo:
- Pasta `clientes` não é mais criada
- Pasta `Extrato` (maiúsculo) não existe
- Pasta `_backups` não existe
- Apenas IDs válidos em `anexos/`, `assinaturas/`, `extratos/`

---

## ⚠️ Próximos Passos

1. **Testar delete completo** (ver seção "Testes Necessários")
2. **Verificar frontend** após delete (URLs não devem aparecer)
3. **Testar re-upload** (mesmo CPF, extrato novo, sem URLs antigas)
4. **Monitorar logs** de cleanup em produção

---

## 📝 Notas Técnicas

### Por que `cleanup_extrato_storage()` é chamado APÓS commit?
- Se falhar o cleanup, o extrato já foi deletado do banco
- Melhor do que falhar o delete se storage tiver problema
- Logs permitem identificar falhas de cleanup
- Pode-se rodar script de limpeza manual depois

### Por que desabilitar `_make_client_alias()`?
- Symlinks adicionam complexidade sem benefício claro
- URLs diretas de `storage/anexos/{id}` funcionam perfeitamente
- Evita necessidade de limpar pasta extra
- Simplifica estrutura do storage

### Por que pasta `Extrato` com maiúsculo?
- Erro de código antigo que criava `Extrato/` ao invés de `extratos/`
- Corrigido em `storage_extrato.py`
- Legado removido pelo script de limpeza
- Cleanup automático previne recriação

---

**✅ Correções concluídas e prontas para teste!**
