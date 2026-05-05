# 🗄️ Configuração do Banco de Dados

## ✅ BANCO OFICIAL ÚNICO

**Caminho absoluto:** `/Users/leonardomol/Jao/105 19/backend/app/database.db`

### Status Atual
- ✅ Tamanho: 176 KB
- ✅ Integridade: OK
- ✅ Tabelas: 8 (advogados, anexos_extrato, audit_logs, custas_extrato, extratos, job_executions, parcelas_extrato, usuarios)
- ✅ Última modificação: 27 Out 2025, 15:03

## 🚫 Bancos Removidos

Os seguintes bancos duplicados foram **ELIMINADOS**:
1. `backend/database.db` (92 KB) - Duplicata desatualizada
2. `backend/app/database - cópia.db` (92 KB) - Cópia antiga

## 🔧 Como o Sistema Funciona

### Arquivo: `backend/app/database.py`

```python
from pathlib import Path

# Diretório deste arquivo (app/)
_THIS_DIR = Path(__file__).resolve().parent

# Arquivo do banco na pasta app/: app/database.db
_DB_FILE = (_THIS_DIR / "database.db").resolve()

# Permite sobrescrever por variável de ambiente
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_DB_FILE}")
```

**Resultado:** O sistema **SEMPRE** usa `/Users/leonardomol/Jao/105 19/backend/app/database.db`

## 🛡️ Proteções Implementadas

### 1. `.gitignore` atualizado
```
*.db
*.db.bak*
*cópia*.db
```
- Previne commit de bancos duplicados
- Protege backups acidentais

### 2. Script de Verificação
Execute `./verify_database.sh` para:
- ✅ Verificar se banco oficial existe
- ✅ Procurar bancos duplicados
- ✅ Testar integridade do SQLite
- ✅ Listar tabelas

## ⚠️ IMPORTANTE

### ✅ SEMPRE use este banco:
```
/Users/leonardomol/Jao/105 19/backend/app/database.db
```

### ❌ NUNCA crie bancos em:
- `backend/database.db` (diretório errado)
- `backend/app/database - cópia.db` (duplicata)
- Qualquer outro local

## 🔄 Para Deploy

No servidor de produção, ajuste apenas o `.env`:

```env
# Deixe vazio para usar caminho automático do database.py
# OU especifique caminho absoluto no servidor
DATABASE_URL=sqlite:////var/www/projeto/backend/app/database.db
```

O código em `database.py` **sempre** encontrará o banco corretamente usando caminhos relativos.

## 🧪 Testes

Execute para verificar:
```bash
./verify_database.sh
```

Deve retornar:
- ✅ Banco oficial encontrado
- ✅ Nenhum banco duplicado
- ✅ Integridade OK
- ✅ 8 tabelas listadas

---

**Última verificação:** 27 de outubro de 2025
**Status:** ✅ Configuração correta e única
