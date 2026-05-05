# 🚀 Guia de Deploy - www.pjmol.com.br

## 📋 FASES DO PROJETO

### ✅ FASE 1: Desenvolvimento Local (CONCLUÍDA)
- [x] Ambiente Python limpo com venv
- [x] Banco de dados único garantido
- [x] Projeto limpo e otimizado
- [x] Scripts de start automatizados
- [x] Documentação completa

### 🔄 FASE 2: Testes com Ngrok (ATUAL)
**Status:** Aguardando execução

**Objetivo:** Testar sistema completo com URL pública temporária

**Passos:**
1. Instalar ngrok: `brew install ngrok` (macOS)
2. Configurar túnel para backend (porta 8000)
3. Configurar túnel para frontend (porta 3000)
4. Atualizar `.env` temporariamente com URL do ngrok
5. Testar todas as funcionalidades:
   - [ ] Login/Autenticação
   - [ ] Upload de arquivos
   - [ ] Geração de documentos
   - [ ] Integração ZapSign
   - [ ] Envio de emails
   - [ ] Webhooks
   - [ ] Todas as rotas da API

**Arquivo de configuração para ngrok:**
```bash
# backend/app/app/.env (temporário para testes)
PUBLIC_BASE_URL=https://seu-id-ngrok.ngrok-free.app
CORS_ALLOW_ORIGINS=https://seu-id-ngrok.ngrok-free.app,http://localhost:3000
```

### 🎯 FASE 3: Deploy em Produção (FUTURO)
**Status:** Aguardando conclusão da Fase 2

**Domínio:** www.pjmol.com.br

**Ações necessárias:**

#### 1. Preparar Servidor VPS
- [ ] Contratar VPS (DigitalOcean, AWS, Contabo, etc.)
- [ ] Instalar Ubuntu Server 22.04 LTS
- [ ] Configurar firewall
- [ ] Instalar dependências:
  ```bash
  sudo apt update
  sudo apt install python3.9 python3.9-venv nginx certbot
  ```

#### 2. Configurar Domínio
- [ ] Apontar DNS de pjmol.com.br para IP do servidor
- [ ] Configurar registros A e CNAME
- [ ] Aguardar propagação DNS (até 48h)

#### 3. Certificado SSL
- [ ] Instalar Let's Encrypt:
  ```bash
  sudo certbot --nginx -d www.pjmol.com.br -d pjmol.com.br
  ```

#### 4. Deploy do Backend
- [ ] Clonar repositório no servidor
- [ ] Criar venv e instalar dependências
- [ ] Copiar `.env.production.example` → `backend/app/app/.env`
- [ ] Editar `.env` com configurações de produção
- [ ] Configurar systemd service
- [ ] Iniciar serviço

#### 5. Deploy do Frontend
- [ ] Escolher método:
  - **Opção A:** Vercel (recomendado, gratuito)
  - **Opção B:** Build local + nginx no mesmo servidor
- [ ] Atualizar URLs de API para produção
- [ ] Build: `npm run build`
- [ ] Deploy

#### 6. Configurar Nginx
- [ ] Proxy reverso para backend
- [ ] Servir frontend (se não usar Vercel)
- [ ] Configurar HTTPS
- [ ] Testar redirecionamentos

#### 7. Finalização
- [ ] Testar todas as funcionalidades em produção
- [ ] Configurar backup automático do database.db
- [ ] Configurar monitoramento
- [ ] Documentar credenciais de acesso

## 📁 Arquivos Importantes

### Para Desenvolvimento/Testes (USAR AGORA)
- `backend/app/app/.env` - Configuração atual (ngrok será adicionado aqui temporariamente)
- `.env.example` - Template de exemplo

### Para Produção (USAR DEPOIS)
- `.env.production.example` - Template para deploy final
- `DATABASE_CONFIG.md` - Documentação do banco
- `README.md` - Instruções completas

## ⚠️ IMPORTANTE

### ❌ NÃO FAÇA AGORA:
- Não altere `.env` para produção ainda
- Não crie novo `.env` de produção
- Não aponte para www.pjmol.com.br ainda

### ✅ FAÇA AGORA (Fase 2):
1. Configure ngrok
2. Teste exaustivamente
3. Documente problemas encontrados
4. Corrija bugs
5. Valide todas as features

### ✅ DEPOIS DOS TESTES (Fase 3):
1. Use `.env.production.example` como base
2. Ajuste todas as URLs para www.pjmol.com.br
3. Gere nova SECRET_KEY
4. Configure servidor de produção
5. Deploy final

## 🔧 Comandos Úteis

### Testar localmente (agora)
```bash
./start_full_stack.sh
```

### Verificar banco de dados
```bash
./verify_database.sh
```

### Limpar projeto
```bash
./cleanup.sh
```

### Preparar para deploy (depois)
```bash
# No servidor
git clone <repositorio>
cd projeto
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.production.example backend/app/app/.env
nano backend/app/app/.env  # Editar configurações
```

## 📊 Status Atual

- ✅ Projeto limpo e organizado
- ✅ Banco de dados único garantido
- ✅ Ambiente virtual funcionando
- ✅ Scripts automatizados
- ✅ Documentação completa
- ⏳ Aguardando testes com ngrok
- ⏳ Deploy em produção (após testes)

---

**Próximo passo:** Configurar e testar com ngrok
**Deploy final:** Após validação completa dos testes
