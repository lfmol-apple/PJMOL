# 🌐 NGROK CONFIGURADO - URLs PARA TESTES

**Data**: 27 de Outubro de 2025  
**Status**: ✅ Ambientes rodando com ngrok

---

## 🔗 URLs PÚBLICAS NGROK

### Backend API
```
https://a667103938b9.ngrok-free.app
```

### Documentação da API
```
https://a667103938b9.ngrok-free.app/docs
```

### **WEBHOOK ZAPSIGN (Cole no site do ZapSign)**
```
https://a667103938b9.ngrok-free.app/api/webhooks/zapsign
```

### Frontend
```
http://localhost:3000
```
_(Frontend roda local, backend acessível publicamente)_

---

# URLs do Ngrok

## Última Atualização
29 de outubro de 2025 - 16:15

## URLs Ativas

### Backend API
- **URL**: https://d23728b12eec.ngrok-free.app
- **Porta Local**: 8000
- **Status**: ✅ Ativo

---

## 📋 WEBHOOK ZAPSIGN - CONFIGURAÇÃO

1. **Acesse**: https://app.zapsign.com.br/configuracoes/webhooks
2. **URL do Webhook**: `https://a667103938b9.ngrok-free.app/api/webhooks/zapsign`
3. **Eventos**: Selecione os eventos desejados
4. **Salvar**

---

## 🧪 TESTES A REALIZAR

### 1. Teste de Conectividade
- [ ] Acessar: https://a667103938b9.ngrok-free.app/docs
- [ ] Verificar Swagger UI carregando

### 2. Teste de Login
- [ ] Login via frontend (localhost:3000)
- [ ] Verificar autenticação JWT

### 3. Teste de Upload PDF
- [ ] Upload de extrato em PDF
- [ ] Verificar processamento

### 4. Teste de Geração de Documentos
- [ ] Gerar procuração
- [ ] Gerar contrato
- [ ] Verificar download

### 5. Teste de ZapSign
- [ ] Enviar documento para assinatura
- [ ] Verificar webhook recebendo eventos
- [ ] Verificar status da assinatura

### 6. Teste de Emails
- [ ] Envio de email
- [ ] Verificar recebimento

---

## 📊 STATUS DOS SERVIÇOS

```
Backend (Local):    http://localhost:8000 ✓
Backend (Ngrok):    https://a667103938b9.ngrok-free.app ✓
Frontend (Local):   http://localhost:3000 ✓
Ngrok Dashboard:    http://localhost:4040 ✓
```

---

## 🔍 MONITORAMENTO

### Logs Backend
```bash
tail -f backend/app/backend.log
```

### Logs Frontend
```bash
tail -f frontend/frontend.log
```

### Ngrok Inspector
```
http://localhost:4040
```
Ver todas requisições HTTP em tempo real

---

## ⚠️ IMPORTANTE

- Esta URL ngrok é **temporária** e muda a cada reinício
- Válida apenas durante esta sessão de testes
- Para produção, usar domínio fixo: www.pjmol.com.br
- Manter ngrok rodando durante todos os testes

---

## 🛑 PARA ENCERRAR

```bash
# Parar tudo
pkill -f uvicorn && pkill -f next && pkill ngrok
```

---

**Pronto para testes!** 🚀
