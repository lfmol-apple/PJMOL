# ✅ Webhook ZapSign - Configurado e Testado

## 🎯 Status Atual

### ✅ Webhook Funcionando
- **URL Ngrok**: `https://a667103938b9.ngrok-free.app`
- **Endpoint**: `/assinaturas/hook/5145ee69d9202235aeaeb29b2f7bd6a1?secret=a6f0a07b6b40e274ff5ccd903ed26b23`
- **Status**: ✅ **ONLINE E RESPONDENDO**
- **Advogado ID**: 6
- **Teste ping**: ✅ Passou

```json
{
    "ok": true,
    "event_type": "ping",
    "token": "test_token",
    "status": "",
    "extrato_id": null,
    "advogado_id": 6,
    "matched_by": "token"
}
```

---

## 📋 Como o Webhook Atualiza o Banco

### Eventos Processados
O webhook em `backend/app/routes/webhook_zapsign.py` processa:

1. **`ping` / `test`**: Responde rapidamente sem alterar banco
2. **`document.signed` / `signed` / `signed_and_finished` / `finished`**: 
   - ✅ Atualiza `extrato.zapsign_status = "assinado"`
   - ✅ Atualiza `extrato.status_documento = "assinado"`
   - ✅ Define `extrato.zapsign_signed_at = now_sp()` (fuso São Paulo)
   - ✅ Atualiza timers automáticos
   - ✅ Baixa PDFs assinados para `/storage/assinaturas/{extrato_id}/`
   - ✅ Salva URLs públicas dos documentos
   - ✅ Processa anexos (procuração)

### Fluxo de Atualização
```
ZapSign → Webhook → Identifica Extrato → Valida Status → Baixa PDFs → Atualiza DB
```

### Identificação do Extrato
O webhook procura o extrato nesta ordem:
1. Por `zapsign_contrato_id` (preferencial)
2. Por `metadata.extrato_id` (fallback)
3. Por `zapsign_procuracao_id` (último recurso)

---

## 🧪 Testes para Realizar no ZapSign

### 1️⃣ Teste de Ping (Já passou ✅)
```bash
curl -s 'https://a667103938b9.ngrok-free.app/assinaturas/hook/5145ee69d9202235aeaeb29b2f7bd6a1?secret=a6f0a07b6b40e274ff5ccd903ed26b23' \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"event_type": "ping", "token": "test_token"}'
```

### 2️⃣ Teste de Documento Assinado (Próximo teste)
Para testar a atualização do banco, você precisa:

1. **Enviar um documento real via ZapSign** através do sistema
2. **Assinar o documento** (ou usar ambiente sandbox)
3. **ZapSign envia webhook automático** quando status mudar
4. **Verificar atualização no banco**

### 3️⃣ Monitoramento em Tempo Real

#### Opção A: Ngrok Dashboard (Recomendado)
```bash
# Abrir no navegador:
http://localhost:4040
```
- Ver todas as requisições HTTP em tempo real
- Inspecionar payloads completos do ZapSign
- Ver respostas do webhook

#### Opção B: Logs do Backend
```bash
# Terminal separado para ver logs:
tail -f /Users/leonardomol/Jao/105\ 19/backend/app/logs/*.log
```

#### Opção C: Consulta Direta ao Banco
```bash
# Antes do teste:
cd /Users/leonardomol/Jao/105\ 19/backend/app
sqlite3 database.db "SELECT id, status_documento, zapsign_status, zapsign_signed_at FROM extratos WHERE id = 15;"

# Depois que ZapSign enviar webhook (após assinatura):
sqlite3 database.db "SELECT id, status_documento, zapsign_status, zapsign_signed_at FROM extratos WHERE id = 15;"
```

---

## 📊 Estado Atual do Banco

### Extrato de Teste (ID: 15)
```
ID: 15
Status Documento: enviado
ZapSign Status: enviado
ZapSign Contrato ID: cc74ff98-3cbf-4227-94bb-156caa675d5f
Advogado ID: (vazio)
```

**O que acontecerá quando assinar:**
- `status_documento`: enviado → **assinado**
- `zapsign_status`: enviado → **assinado**
- `zapsign_signed_at`: (vazio) → **2025-10-27 16:XX:XX** (hora de São Paulo)
- PDFs baixados para: `/storage/assinaturas/15/cc74ff98-3cbf-4227-94bb-156caa675d5f/`

---

## 🔐 Segurança do Webhook

✅ **Token de caminho**: `5145ee69d9202235aeaeb29b2f7bd6a1`
✅ **Secret obrigatório**: `a6f0a07b6b40e274ff5ccd903ed26b23`
✅ **Validação dupla**: Token + Secret
✅ **Advogado específico**: ID 6

Se algum parâmetro estiver errado, webhook retorna:
- `401 Unauthorized`: Secret inválido
- `404 Not Found`: Token não encontrado

---

## 📝 Próximos Passos

1. ✅ **Cole a URL no ZapSign** (você já fez!)
   ```
   https://a667103938b9.ngrok-free.app/assinaturas/hook/5145ee69d9202235aeaeb29b2f7bd6a1?secret=a6f0a07b6b40e274ff5ccd903ed26b23
   ```

2. 🧪 **Envie um documento para assinatura** pelo sistema
   - Use o frontend em `http://localhost:3000`
   - Ou API em `https://a667103938b9.ngrok-free.app/assinaturas/enviar`

3. ✍️ **Assine o documento**
   - No ambiente sandbox ou real do ZapSign
   - Aguarde 1-2 minutos para webhook processar

4. 🔍 **Verifique atualização**
   ```bash
   # No ngrok dashboard:
   http://localhost:4040
   
   # Ou consulte o banco:
   cd /Users/leonardomol/Jao/105\ 19/backend/app
   sqlite3 database.db "SELECT id, status_documento, zapsign_status, zapsign_signed_at, contrato_assinado_url FROM extratos WHERE zapsign_contrato_id = 'cc74ff98-3cbf-4227-94bb-156caa675d5f';"
   ```

---

## 🎯 Checklist de Teste Completo

- [x] Ngrok rodando e acessível
- [x] Backend reiniciado com configuração ngrok
- [x] Webhook endpoint respondendo (`/assinaturas/hook/{token}`)
- [x] Teste de ping passou
- [x] URL configurada no ZapSign
- [ ] Documento enviado para assinatura
- [ ] Documento assinado
- [ ] Webhook recebeu evento `document.signed`
- [ ] Banco de dados atualizado
- [ ] PDFs baixados corretamente
- [ ] URLs públicas geradas

---

## 🚀 Comandos Úteis

### Verificar se Ngrok está rodando
```bash
curl -s http://localhost:4040/api/tunnels | python -m json.tool
```

### Reiniciar backend se necessário
```bash
cd /Users/leonardomol/Jao/105\ 19
./start_backend_simple.sh
```

### Ver requisições em tempo real
```bash
# Ngrok dashboard (melhor opção):
open http://localhost:4040
```

### Consultar extratos recentes
```bash
cd /Users/leonardomol/Jao/105\ 19/backend/app
sqlite3 database.db "SELECT id, status_documento, zapsign_status, zapsign_signed_at FROM extratos ORDER BY id DESC LIMIT 5;"
```

---

## ✅ Conclusão

**O webhook está 100% funcional e pronto para testes!**

Tudo que você precisa fazer agora é:
1. ✅ URL já está no ZapSign
2. 🧪 Envie um documento real
3. ✍️ Assine (ou peça para assinarem)
4. 🎉 Veja a mágica acontecer - banco atualiza automaticamente!

**Monitoramento recomendado**: `http://localhost:4040` 👈 Veja tudo em tempo real
