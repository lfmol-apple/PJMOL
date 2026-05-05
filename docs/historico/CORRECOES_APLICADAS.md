# 🐛 Correções Aplicadas - Aguardando Restart

## ✅ Correção 1: Botão "Anexos" Verde Sem Arquivos

### Problema
O botão "Anexos" aparecia verde mesmo quando não havia arquivos anexados, pois a função `getDocsStatus` confiava cegamente em flags antigas `ok: true` nos `extras`.

### Solução Aplicada
Modificado `/frontend/src/app/gerencial/processos/page.tsx`:

**Antes**: Verificava flags `ok: true` primeiro e sobrescrevia tudo
**Depois**: Prioriza arquivos reais (`addrList.length > 0` e `docList.length > 0`)

Agora a lógica:
1. ✅ Verifica se existem arquivos reais primeiro
2. ⚠️ Só consulta flags antigas se NÃO houver arquivos detectados
3. ✅ Flags antigas servem apenas como fallback

### Teste Necessário
1. Recarregar a página de processos
2. Verificar se processos SEM anexos mostram botão "Pendente" (amarelo)
3. Verificar se processos COM anexos mostram botão "Anexos" (cinza/branco)

---

## 🔍 Investigação 2: Extratos Órfãos

### Problema Reportado
- Usuário ID 14 (Julio): mostra 4 extratos mas deveria ter 2
- Usuário ID 9: mostra 6 extratos mas deveria ter 4

### Descoberta no Banco de Dados
```sql
SELECT id, nome_cliente, usuario_id FROM extratos WHERE usuario_id = 9;
-- Resultado: 0 linhas (VAZIO!)

SELECT id, nome_cliente, usuario_id FROM extratos WHERE usuario_id = 14;
-- Resultado: 0 linhas (VAZIO!)
```

**Conclusão**: Esses usuários NÃO TÊM nenhum extrato no banco de dados!

### Possíveis Causas
1. **Cache do navegador** - Frontend mostrando dados antigos do localStorage/sessionStorage
2. **Dados de teste/desenvolvimento** - Extratos foram deletados do BD mas permanecem em cache
3. **Bug no filtro `filterByScope`** - Mostrando extratos de outros usuários

### Próximas Investigações (quando subir backend)
1. Verificar o que `/extratos` retorna (com autenticação)
2. Verificar localStorage/sessionStorage do navegador
3. Testar com usuário ID 9 e 14 logados
4. Comparar lista do BD com lista do frontend

### Solução Temporária
Limpar cache do navegador:
```javascript
// No console do navegador
localStorage.clear();
sessionStorage.clear();
location.reload();
```

---

## 📋 Tarefas Pendentes (Antes de Subir)

### Pré-Requisitos
- [ ] Iniciar ngrok na porta 8000
- [ ] Atualizar URL do ngrok no `.env` se mudou
- [ ] Subir backend (porta 8000)
- [ ] Subir frontend (porta 3000)

### Testes a Executar
1. **Botão Anexos**:
   - [ ] Criar processo novo SEM anexos → Botão deve estar "Pendente" (amarelo)
   - [ ] Fazer upload de documentos → Botão deve mudar para "Anexos" (cinza)
   - [ ] Processos antigos → Verificar se status está correto

2. **Extratos Órfãos**:
   - [ ] Logar como usuário ID 9 ou 14
   - [ ] Verificar quantos extratos aparecem
   - [ ] Comparar com consulta no BD
   - [ ] Se ainda aparecerem órfãos: limpar cache do navegador

3. **"Outros Anexos"**:
   - [ ] Upload em "Outros Anexos"
   - [ ] Verificar pasta `/storage/anexos/{id}/outros/` criada
   - [ ] Verificar arquivo salvo com sucesso

4. **Email**:
   - [ ] Clicar em "Notificar Advogado"
   - [ ] Verificar se NÃO aparece erro SMTP
   - [ ] Confirmar envio de email

---

## 🔧 Comandos para Subir Tudo

```bash
# Terminal 1 - Ngrok
ngrok http 8000

# Terminal 2 - Backend (após atualizar URL do ngrok no .env)
cd "/Users/leonardomol/Jao/105 19/backend/app"
source ../../.venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &

# Terminal 3 - Frontend
cd "/Users/leonardomol/Jao/105 19/frontend"
npm run dev &
```

## 📊 Status
- ✅ Correção do botão "Anexos" aplicada (aguardando teste)
- 🔍 Investigação de órfãos iniciada (precisa backend rodando)
- ⏸️ Backend e frontend desligados (aguardando restart)
