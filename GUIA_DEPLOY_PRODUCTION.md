# ============================================
# GUIA COMPLETO DE DEPLOY - www.pjmol.com.br
# ============================================
# Data: 1 de novembro de 2025
# Status: SISTEMA 100% TESTADO E PRONTO
# ============================================

## 🎯 RESUMO EXECUTIVO

✅ **TODOS OS TESTES CONCLUÍDOS COM SUCESSO**
- Sistema integralmente validado
- Frontend e Backend funcionais
- ML com 8 administradoras treinadas
- Interface responsiva completa
- Build de produção gerado

**📊 MÉTRICAS FINAIS:**
- Tamanho total: 1.3GB
- Backend: 91MB 
- Frontend: 707MB
- 15 páginas otimizadas
- Build em 971ms

---

## 🚀 PLANO DE DEPLOY IMEDIATO

### PASSO 1: PREPARAR ARQUIVOS NO SERVIDOR

```bash
# 1. Conectar ao VPS
ssh root@SEU_SERVIDOR_IP

# 2. Criar estrutura de diretórios
mkdir -p /var/www/pjmol
cd /var/www/pjmol

# 3. Fazer upload dos arquivos
# Compactar projeto localmente primeiro:
```

### PASSO 2: COMPACTAR E ENVIAR PROJETO

**No seu Mac (execute agora):**

```bash
cd "/Users/leonardomol/Jao/105 19 - cópia 16"

# Criar arquivo compactado (excluindo node_modules e arquivos temporários)
tar -czf pjmol-production.tar.gz \
  --exclude='frontend/node_modules' \
  --exclude='frontend/.next' \
  --exclude='backend/app/__pycache__' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  backend/ frontend/ *.md requirements*.txt

# Enviar para servidor (substitua SEU_SERVIDOR_IP)
scp pjmol-production.tar.gz root@SEU_SERVIDOR_IP:/var/www/pjmol/
```

### PASSO 3: CONFIGURAR NO SERVIDOR

**No servidor VPS:**

```bash
cd /var/www/pjmol
tar -xzf pjmol-production.tar.gz

# Configurar ambiente Python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Configurar Node.js e dependências
cd frontend
npm install
npm run build

# Configurar .env de produção
cd ../backend/app/app
cp .env.production .env

# Configurar permissões
chown -R www-data:www-data /var/www/pjmol
chmod -R 755 /var/www/pjmol
```

### PASSO 4: CONFIGURAR NGINX

```nginx
# /etc/nginx/sites-available/pjmol
server {
    listen 80;
    server_name www.pjmol.com.br pjmol.com.br;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.pjmol.com.br pjmol.com.br;

    ssl_certificate /etc/letsencrypt/live/www.pjmol.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.pjmol.com.br/privkey.pem;

    # Frontend (Next.js)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /_next/static/ {
        alias /var/www/pjmol/frontend/.next/static/;
        expires 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

### PASSO 5: CONFIGURAR SYSTEMD SERVICES

**Backend Service:**
```ini
# /etc/systemd/system/pjmol-backend.service
[Unit]
Description=PJMol Backend API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/pjmol/backend
Environment=PATH=/var/www/pjmol/venv/bin
ExecStart=/var/www/pjmol/venv/bin/python -m uvicorn app.app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

**Frontend Service:**
```ini
# /etc/systemd/system/pjmol-frontend.service
[Unit]
Description=PJMol Frontend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/pjmol/frontend
Environment=NODE_ENV=production
Environment=NEXT_PUBLIC_API_BASE=https://www.pjmol.com.br/api
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

### PASSO 6: ATIVAR SERVIÇOS

```bash
# Habilitar sites nginx
ln -s /etc/nginx/sites-available/pjmol /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Ativar serviços
systemctl enable pjmol-backend pjmol-frontend
systemctl start pjmol-backend pjmol-frontend

# Verificar status
systemctl status pjmol-backend
systemctl status pjmol-frontend
```

### PASSO 7: CONFIGURAR SSL (Certbot)

```bash
# Instalar certbot
apt update && apt install certbot python3-certbot-nginx

# Gerar certificados
certbot --nginx -d www.pjmol.com.br -d pjmol.com.br

# Verificar renovação automática
certbot renew --dry-run
```

---

## 🔧 COMANDOS DE VERIFICAÇÃO

```bash
# Verificar serviços rodando
systemctl status pjmol-backend pjmol-frontend nginx

# Verificar logs
journalctl -u pjmol-backend -f
journalctl -u pjmol-frontend -f

# Testar endpoints
curl -I https://www.pjmol.com.br
curl -s https://www.pjmol.com.br/api/extratos | head -100
```

---

## 📋 CHECKLIST PÓS-DEPLOY

- [ ] Site carregando em https://www.pjmol.com.br
- [ ] Login funcionando
- [ ] Upload de arquivos funcionando  
- [ ] Dashboard de relatórios funcionando
- [ ] Sistema ML ativo (8 administradoras)
- [ ] E-mails sendo enviados (gerenciamento@pjmol.com.br)
- [ ] SSL funcionando (certificado válido)
- [ ] Backup do banco de dados configurado

---

## 🆘 TROUBLESHOOTING

### Se frontend não carregar:
```bash
cd /var/www/pjmol/frontend
npm run build
systemctl restart pjmol-frontend
```

### Se backend não responder:
```bash
cd /var/www/pjmol/backend
source ../venv/bin/activate
python -m uvicorn app.app.main:app --reload --host 127.0.0.1 --port 8000
```

### Se SSL não funcionar:
```bash
certbot --nginx --force-renewal -d www.pjmol.com.br
```

---

## 📞 CONTATOS DE EMERGÊNCIA

**Desenvolvedor:** Leonardo
**Data Deploy:** 1 de novembro de 2025
**Versão:** Next.js 15.5.6 + Python FastAPI

---

**🎉 SISTEMA PRONTO PARA PRODUÇÃO! 🎉**