# 🔍 DIAGNÓSTICO: Problemas com Envio de Emails

## ❌ Problemas Identificados

### 1. **Email ao Gerente NÃO foi enviado após assinatura**
- ✅ Webhook funcionou (extrato 16 foi atualizado para "assinado")
- ✅ Gerente tem email cadastrado: `leonardofmol@gmail.com`
- ❌ **PROBLEMA**: O código do webhook tem o envio de email ao gerente, mas não foi enviado

**Extrato 16 (Assinado):**
- Cliente: NURY VIEIRA ALCANTARA
- Status: assinado
- Gerente: Leonardo (ID 5) - `leonardofmol@gmail.com`
- Advogado ID: **NULL** ⚠️ (Extrato não tem advogado associado!)

### 2. **Campo "Envio ao Advogado" mostra "Ainda não foi enviado"**
- ✅ Popup mostrou "enviado"
- ❌ Campo no banco não foi atualizado
- **Causa**: O campo precisa verificar `extras.adv_email_last_sent_at`

### 3. **Extrato sem Advogado Associado**
- O extrato 16 tem `advogado_id = NULL`
- Isso pode estar causando problemas no fluxo de notificações

---

## 🔧 SOLUÇÕES

### ✅ Solução 1: Verificar por que email ao gerente não foi enviado

**Arquivo**: `backend/app/routes/webhook_zapsign.py` (linhas 480-527)

O código está tentando enviar email ao gerente, mas pode estar falhando silenciosamente. Vamos adicionar logs melhores:

```python
# Linha ~495
if gerente_email:
    print(f"[webhook_zapsign] Tentando enviar email ao gerente: {gerente_email}")
    try:
        send_email(recipients=gerente_email, subject=assunto, body_html=html)
        print(f"[webhook_zapsign] ✅ Email enviado ao gerente com sucesso")
    except Exception as e:
        print(f"[webhook_zapsign] ❌ Erro ao enviar email ao gerente: {e}")
else:
    print(f"[webhook_zapsign] ⚠️  Gerente não tem email cadastrado (usuario_id={extrato.usuario_id})")
```

**Ação**: Adicionar logs detalhados e testar novamente

---

### ✅ Solução 2: Corrigir exibição "Envio ao Advogado"

O frontend está verificando o campo errado. Deve verificar `extras.adv_email_last_sent_at`.

**Onde está o problema?**
Provavelmente no frontend em `src/components/` ou similar.

**Correção necessária:**
```typescript
// Antes (errado):
if (extrato.advogado_email_enviado_em) { ... }

// Depois (correto):
const extras = extrato.extras ? JSON.parse(extrato.extras) : {};
if (extras.adv_email_last_sent_at) {
  // Mostra "Enviado em {data}"
} else {
  // Mostra "Ainda não foi enviado"
}
```

---

### ✅ Solução 3: Garantir que extrato tem advogado antes de enviar

**Problema**: Extrato 16 não tem `advogado_id` associado

**Onde associar?**
- Quando o usuário envia para assinatura
- No formulário de cadastro/edição do extrato
- Na tela de anexos (antes de notificar advogado)

---

## 🧪 TESTES A FAZER

### Teste 1: Verificar se SMTP está funcionando

```bash
cd /Users/leonardomol/Jao/105\ 19
source .venv/bin/activate
python3 << 'EOF'
import sys
sys.path.insert(0, 'backend/app')

from utils.mailer import send_email

print("🧪 Testando envio de email...")
resultado = send_email(
    recipients="leonardofmol@gmail.com",
    subject="[TESTE] Sistema PJMOL",
    body_html="<h3>✅ Email de teste</h3><p>Se você recebeu isso, SMTP está OK!</p>"
)

if resultado:
    print("✅ Email enviado com sucesso!")
else:
    print("❌ Falha ao enviar")
EOF
```

### Teste 2: Simular novo documento assinado

1. Envie outro documento para assinatura
2. **IMPORTANTE**: Escolha um advogado antes de enviar
3. Assine o documento
4. Verifique se:
   - ✅ Email ao gerente chega
   - ✅ Email ao advogado pode ser enviado
   - ✅ Campo "Envio ao Advogado" atualiza no frontend

### Teste 3: Monitorar logs em tempo real

```bash
# Terminal 1: Reiniciar backend com logs visíveis
cd /Users/leonardomol/Jao/105\ 19
./start_backend_simple.sh

# Terminal 2: Monitorar ngrok
open http://localhost:4040

# Assinar documento e ver logs ao vivo
```

---

## 📝 CHECKLIST DE CORREÇÕES

### Backend (Urgente):
- [ ] Adicionar logs detalhados no webhook (email ao gerente)
- [ ] Verificar se `send_email()` está retornando True/False corretamente
- [ ] Adicionar tratamento de erro mais robusto no webhook
- [ ] Garantir que email ao gerente sempre tenta enviar (mesmo se falhar)

### Frontend (Importante):
- [ ] Corrigir exibição "Envio ao Advogado" para ler `extras.adv_email_last_sent_at`
- [ ] Mostrar data/hora do último envio
- [ ] Adicionar indicador visual se email falhou vs não foi enviado

### Fluxo (Recomendado):
- [ ] Tornar obrigatório escolher advogado antes de enviar para assinatura
- [ ] Adicionar validação: "Selecione um advogado para continuar"
- [ ] Mostrar aviso se advogado não tem email cadastrado

---

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

1. **AGORA**: Testar se SMTP está funcionando (Teste 1)
2. **DEPOIS**: Adicionar logs no webhook e reiniciar backend
3. **ENTÃO**: Enviar novo documento com advogado associado
4. **VERIFICAR**: Emails chegando + Frontend atualizando

---

## 💡 EXPLICAÇÃO TÉCNICA

### Por que o email ao gerente não foi enviado?

**Hipóteses:**
1. ✅ **Mais provável**: Exceção silenciosa no `try/except` (linha 523-527)
   - O código tem `except Exception as e: print(...)` que pode estar escondendo o erro
   - Sem logs, não sabemos se tentou enviar

2. ⚠️  **Possível**: Credenciais SMTP expiradas/inválidas
   - Mas então NENHUM email funcionaria
   - Teste 1 vai confirmar isso

3. ⚠️  **Possível**: Email caiu no SPAM
   - Improvável, mas verificar pasta SPAM de `leonardofmol@gmail.com`

### Por que o popup mostra "enviado" mas campo não atualiza?

**Causa**: Dessincronia entre:
- **Backend**: Salva em `extras.adv_email_last_sent_at` ✅
- **Frontend**: Lê de campo diferente (provavelmente `advogado_email_enviado_em`) ❌

**Solução**: Frontend precisa ler do lugar certo.

---

## 📧 Configurações SMTP Atuais

✅ **Tudo configurado no .env:**
```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SSL=true
SMTP_USERNAME=gerenciamento@pjmol.com.br
SMTP_PASSWORD=A85jj6d4...
MAIL_FROM=gerenciamento@pjmol.com.br
```

**Status**: ✅ Configurado | ⚠️ Precisa testar se funciona

---

## 🚀 Ação Imediata

**Vamos fazer agora:**
1. Testar SMTP com código de teste
2. Ver se email chega
3. Se chegar: problema é nos logs/exceções do webhook
4. Se não chegar: problema é nas credenciais SMTP
