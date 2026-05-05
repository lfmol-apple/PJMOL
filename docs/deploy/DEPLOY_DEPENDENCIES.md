# 📦 DEPENDÊNCIAS PARA DEPLOY EM PRODUÇÃO

**Data**: 27 de Outubro de 2025  
**Servidor**: VPS para www.pjmol.com.br

---

## 🐍 PYTHON

**Versão Atual do Projeto**: Python 3.13.5
**Recomendado**: Python 3.9+ ou 3.10+ (maior compatibilidade)

```bash
# Ubuntu/Debian - Instalar Python 3.10
sudo apt update
sudo apt install -y python3.10 python3.10-venv python3.10-dev
```

---

## 📚 DEPENDÊNCIAS DO SISTEMA OPERACIONAL

### Ubuntu/Debian (VPS)

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Pacotes essenciais
sudo apt install -y \
    build-essential \
    python3.10 \
    python3.10-venv \
    python3.10-dev \
    python3-pip \
    git \
    curl \
    nginx \
    supervisor

# Dependências para PDF (CRÍTICO - usado pelo projeto)
sudo apt install -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-por

# Verificar instalação
poppler --version
tesseract --version
```

---

## 📄 DEPENDÊNCIAS PDF - DETALHAMENTO

### 1. poppler-utils
**Usado por**: `pdf2image` (linha 47 requirements.txt)  
**Função**: Converte PDFs em imagens PNG para processamento  
**Arquivo**: `backend/app/extracao/leitura_pdf.py` linha 35

```python
from pdf2image import convert_from_path  # Requer poppler-utils
```

**Teste**:
```bash
pdftoppm -v
```

### 2. tesseract-ocr
**Usado por**: `pytesseract` (linha 52 requirements.txt)  
**Função**: OCR (reconhecimento de texto em imagens)  
**Idiomas**: Português (tesseract-ocr-por)

**Teste**:
```bash
tesseract --version
tesseract --list-langs | grep por
```

---

## 🚀 SERVIDOR DE APLICAÇÃO

### Opção 1: Uvicorn (Atual - OK para produção leve)
```bash
# Já está no requirements.txt
uvicorn==0.38.0
```

**Comando de produção**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Opção 2: Gunicorn + Uvicorn Workers (RECOMENDADO para produção)
```bash
# Adicionar ao requirements.txt
gunicorn==23.0.0
```

**Comando de produção**:
```bash
gunicorn main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120 \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log
```

**Vantagens Gunicorn**:
- ✅ Gerenciamento robusto de workers
- ✅ Restart automático de workers problemáticos
- ✅ Melhor para produção com carga
- ✅ Logs separados

---

## 🔒 NGINX (Proxy Reverso)

```nginx
# /etc/nginx/sites-available/pjmol

server {
    listen 80;
    server_name www.pjmol.com.br pjmol.com.br;

    # Redirecionar para HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name www.pjmol.com.br pjmol.com.br;

    # SSL - Configurar com Let's Encrypt
    ssl_certificate /etc/letsencrypt/live/www.pjmol.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.pjmol.com.br/privkey.pem;

    # Upload máximo (PDFs grandes)
    client_max_body_size 50M;

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }

    # Frontend Next.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 🔐 SSL/HTTPS (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obter certificado
sudo certbot --nginx -d www.pjmol.com.br -d pjmol.com.br

# Renovação automática (já configurado pelo certbot)
sudo certbot renew --dry-run
```

---

## 🎛️ SUPERVISOR (Gerenciamento de Processos)

```ini
# /etc/supervisor/conf.d/pjmol_backend.conf

[program:pjmol_backend]
directory=/home/deploy/pjmol/backend/app
command=/home/deploy/pjmol/.venv/bin/gunicorn main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 \
    --timeout 120
user=deploy
autostart=true
autorestart=true
stderr_logfile=/var/log/pjmol/backend.err.log
stdout_logfile=/var/log/pjmol/backend.out.log
environment=PATH="/home/deploy/pjmol/.venv/bin"
```

```ini
# /etc/supervisor/conf.d/pjmol_frontend.conf

[program:pjmol_frontend]
directory=/home/deploy/pjmol/frontend
command=/usr/bin/npm run start
user=deploy
autostart=true
autorestart=true
stderr_logfile=/var/log/pjmol/frontend.err.log
stdout_logfile=/var/log/pjmol/frontend.out.log
environment=NODE_ENV="production"
```

**Comandos**:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start pjmol_backend
sudo supervisorctl start pjmol_frontend
sudo supervisorctl status
```

---

## 🗄️ BANCO DE DADOS

**Atual**: SQLite (`backend/app/database.db`)

**Para produção**:
```bash
# Criar diretório com permissões corretas
sudo mkdir -p /var/lib/pjmol
sudo chown deploy:deploy /var/lib/pjmol
sudo chmod 755 /var/lib/pjmol

# Copiar database
cp backend/app/database.db /var/lib/pjmol/database.db
chmod 644 /var/lib/pjmol/database.db

# Atualizar .env.production
DB_FILE=/var/lib/pjmol/database.db
```

**Backup automático**:
```bash
# /etc/cron.daily/pjmol-backup
#!/bin/bash
cp /var/lib/pjmol/database.db /var/backups/pjmol/database-$(date +%Y%m%d).db
find /var/backups/pjmol -name "database-*.db" -mtime +30 -delete
```

---

## 📦 NODE.JS (Frontend)

```bash
# Instalar Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar
node --version  # v18.x.x
npm --version

# Build de produção do frontend
cd frontend
npm install
npm run build
npm run start  # Servidor de produção (porta 3000)
```

---

## 🔍 CHECKLIST FINAL PRÉ-DEPLOY

### Sistema Operacional
- [ ] Python 3.10+ instalado
- [ ] poppler-utils instalado e funcionando
- [ ] tesseract-ocr + tesseract-ocr-por instalados
- [ ] nginx instalado e configurado
- [ ] supervisor instalado
- [ ] certbot instalado para SSL

### Aplicação Python
- [ ] requirements.txt instalado no venv
- [ ] gunicorn adicionado ao requirements (opcional mas recomendado)
- [ ] .env.production configurado
- [ ] Database em local seguro com backup
- [ ] Logs configurados em /var/log/pjmol/

### Frontend Next.js
- [ ] Node.js 18 LTS instalado
- [ ] npm install executado
- [ ] npm run build executado
- [ ] Variáveis de ambiente configuradas

### Segurança
- [ ] SSL/HTTPS configurado
- [ ] Firewall configurado (portas 80, 443)
- [ ] SECRET_KEY único gerado para produção
- [ ] CORS configurado apenas para domínio oficial
- [ ] Credenciais sensíveis em .env (não commitado)

### DNS
- [ ] Domínio www.pjmol.com.br apontando para IP do servidor
- [ ] pjmol.com.br (sem www) também configurado
- [ ] Propagação DNS verificada

---

## 🧪 TESTES PÓS-DEPLOY

```bash
# 1. Teste de dependências do sistema
poppler --version
tesseract --version
tesseract --list-langs | grep por

# 2. Teste de processos
sudo supervisorctl status

# 3. Teste de portas
sudo netstat -tulpn | grep :8000
sudo netstat -tulpn | grep :3000

# 4. Teste de NGINX
sudo nginx -t
curl -I https://www.pjmol.com.br

# 5. Teste de API
curl https://www.pjmol.com.br/api/docs

# 6. Teste de Frontend
curl https://www.pjmol.com.br
```

---

## 📞 TROUBLESHOOTING

### Erro: "poppler not found"
```bash
sudo apt install -y poppler-utils
which pdftoppm  # Deve mostrar /usr/bin/pdftoppm
```

### Erro: "tesseract not found"
```bash
sudo apt install -y tesseract-ocr tesseract-ocr-por
tesseract --list-langs
```

### Erro: "Permission denied" no database
```bash
sudo chown deploy:deploy /var/lib/pjmol/database.db
sudo chmod 644 /var/lib/pjmol/database.db
```

### Erro: "502 Bad Gateway"
```bash
# Verificar se backend está rodando
sudo supervisorctl status pjmol_backend
# Verificar logs
tail -f /var/log/pjmol/backend.err.log
```

---

**Preparado por**: GitHub Copilot  
**Projeto**: Sistema de Extrato de Consórcio  
**Deploy Target**: www.pjmol.com.br
