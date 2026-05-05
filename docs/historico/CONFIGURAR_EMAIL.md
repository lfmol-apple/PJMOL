# 📧 Configuração de Email (SMTP)

## ⚠️ IMPORTANTE: Configure o Email para Envio de Notificações

Atualmente os emails **NÃO ESTÃO SENDO ENVIADOS** porque as credenciais SMTP não estão configuradas.

Você verá este erro nos logs:
```
[mailer] erro: SMTP_USERNAME/SMTP_PASSWORD não configurados no ambiente.
```

## 🔧 Como Configurar

### Passo 1: Edite o arquivo `.env`

Abra o arquivo `/backend/app/.env` e configure suas credenciais de email:

```bash
# Email SMTP - CONFIGURE AQUI SUAS CREDENCIAIS
SMTP_HOST=smtp.hostinger.com           # Servidor SMTP do seu provedor
SMTP_PORT=465                           # Porta SMTP (465 para SSL, 587 para TLS)
SMTP_STARTTLS=false                     # true para TLS, false para SSL
SMTP_SSL=true                           # true para SSL (porta 465)
SMTP_USERNAME=seu-email@dominio.com     # ⚠️ ALTERE AQUI
SMTP_PASSWORD=sua-senha                 # ⚠️ ALTERE AQUI
MAIL_FROM=seu-email@dominio.com         # Email remetente
MAIL_FROM_NAME="Sistema de Consórcios"  # Nome do remetente
```

### Passo 2: Escolha seu Provedor de Email

#### Hostinger (configuração atual)
```bash
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SSL=true
SMTP_STARTTLS=false
```

#### Gmail
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SSL=false
SMTP_STARTTLS=true
```
⚠️ **Nota Gmail**: Você precisa gerar uma "Senha de App" em vez de usar sua senha normal.
[Como gerar senha de app no Gmail](https://support.google.com/accounts/answer/185833)

#### Outlook/Hotmail
```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SSL=false
SMTP_STARTTLS=true
```

#### Office 365
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SSL=false
SMTP_STARTTLS=true
```

### Passo 3: Reinicie o Backend

Após configurar, reinicie o backend para carregar as novas variáveis:

```bash
# Matar o processo atual
lsof -ti:8000 | xargs kill -9

# Reiniciar
cd "/Users/leonardomol/Jao/105 19/backend/app"
source ../../.venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
```

## 📬 Emails que Serão Enviados

### 1. Email ao Advogado (quando clicar em "Notificar Advogado")
- **Para**: Email do advogado associado ao extrato
- **Assunto**: Documentos disponíveis para assinatura
- **Conteúdo**: Links para contrato e procuração

### 2. Email ao Gerente (webhook ZapSign)
- **Para**: Email do gerente responsável
- **Quando**: Quando documentos são assinados no ZapSign
- **Conteúdo**: Notificação de assinatura completa

## 🧪 Teste de Email

Para testar se o email está funcionando, você pode:

1. Acesse a tela de anexos de um extrato
2. Faça upload dos documentos obrigatórios (Identidade + Endereço)
3. Clique em "Notificar Advogado"
4. Verifique se o email foi enviado (sem erro nos logs)

## ❌ Solução de Problemas

### Erro: "SMTP_USERNAME/SMTP_PASSWORD não configurados"
- Verifique se editou o arquivo `.env` corretamente
- Reinicie o backend após editar o `.env`

### Erro: "Authentication failed"
- Verifique se usuário e senha estão corretos
- Para Gmail, certifique-se de usar "Senha de App"
- Para alguns provedores, pode ser necessário habilitar "Apps menos seguros"

### Erro: "Connection refused" ou "Timeout"
- Verifique se `SMTP_HOST` e `SMTP_PORT` estão corretos
- Verifique configuração de SSL/TLS (algumas portas exigem SSL=true)
- Verifique firewall/antivírus bloqueando conexões SMTP

### Emails não chegam (sem erro)
- Verifique pasta de SPAM do destinatário
- Certifique-se que `MAIL_FROM` é um email válido do seu domínio
- Alguns provedores bloqueiam emails de domínios não verificados

## 📝 Configuração Opcional: Salvar Emails Enviados (IMAP)

Se quiser que os emails enviados sejam salvos na pasta "Enviados" do seu servidor:

```bash
MAIL_SAVE_SENT=true
IMAP_HOST=imap.hostinger.com
IMAP_PORT=993
IMAP_USERNAME=seu-email@dominio.com
IMAP_PASSWORD=sua-senha
```

## 🔐 Segurança

⚠️ **NUNCA** commite o arquivo `.env` com senhas reais no Git!

O `.env` está no `.gitignore` por segurança. Use o `.env.example` como template.
