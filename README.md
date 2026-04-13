# 🚀 BACKUP DEPLOY - 28 de Outubro de 2025

## ✅ Backup Funcional Testado e Aprovado

### 📦 Estrutura do Backup

```
Deploy_20251028/
├── README.md (este arquivo)
├── frontend/
│   ├── src/
│   │   └── app/gerencial/processos/page.tsx ⭐ PRINCIPAL (86 KB)
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── postcss.config.mjs
└── backend/
    ├── app/ (código completo + database.db)
    └── requirements.txt
```

### ✅ Melhorias Implementadas (Mobile)

1. **7 filtros completos** - Status, Resultado, Adm, Gerente, Advogado, De, Até
2. **Cards sempre visíveis** - Removido toggle Cards/Compacto no mobile
3. **Totais coloridos**:
   - 🟢 Verde para "Hoje"
   - 🟡 Âmbar para "Futuro"
4. **Botões aumentados** - Limpar | Novo | CSV
5. **Status inline** - Não empilha mais
6. **"Sem Julgamento"** - Ao invés de "—"
7. **"Sentença Futura"** - Renomeada
8. **Fontes aumentadas**:
   - Filtros: 12px
   - Nome: 18px
   - Processo: 16px
   - Totais: negrito
9. **Espaçamento 38% maior** - pt-[161px]
10. **FAB removido**
11. **Checkbox "Andamento" removido**

### 🔄 Como Restaurar

#### Frontend:
```bash
cd /seu/projeto
rm -rf frontend/src frontend/package.json frontend/next.config.ts
cp -r /Users/leonardomol/Jao/Deploy_20251028/frontend/* /seu/projeto/frontend/
cd frontend
npm install
npm run dev
```

#### Backend:
```bash
cd /seu/projeto
rm -rf backend/app
cp -r /Users/leonardomol/Jao/Deploy_20251028/backend/* /seu/projeto/backend/
cd backend
pip install -r requirements.txt
export TMPDIR=$HOME/.tmp && mkdir -p $TMPDIR
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### ✅ Testes Realizados

- ✅ Backend rodando (porta 8000)
- ✅ Frontend compilado (porta 3000)
- ✅ Database funcional
- ✅ Scheduler iniciado (4 jobs)
- ✅ 8 extratos atualizados
- ✅ TMPDIR configurado

### 📅 Data
28 de Outubro de 2025, 13:45

### ⚠️ IMPORTANTE
- Configure o .env antes de usar
- TMPDIR deve estar configurado
- Database incluída (desenvolvimento)
