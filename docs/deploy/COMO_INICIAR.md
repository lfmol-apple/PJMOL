# 🚀 COMO INICIAR O SISTEMA

## ✅ ÚNICO COMANDO NECESSÁRIO

```bash
./start_full_stack.sh
```

Esse é o **ÚNICO** script de inicialização do projeto.

## 🛑 Para Parar Tudo

```bash
pkill -f uvicorn && pkill -f next
```

## 📋 O que o script faz:

1. ✅ Mata processos anteriores
2. ✅ Ativa ambiente virtual Python
3. ✅ Inicia backend (porta 8000)
4. ✅ Verifica se backend subiu
5. ✅ Inicia frontend (porta 3000)
6. ✅ Verifica se frontend subiu
7. ✅ Mostra status e URLs

## 🌐 URLs de Acesso

Após executar o script:

- **Backend API:** http://localhost:8000
- **Documentação:** http://localhost:8000/docs
- **Frontend:** http://localhost:3000

## 📝 Logs

Se algo der errado, verifique:

- Backend: `backend/app/backend.log`
- Frontend: `frontend/frontend.log`

## ⚠️ Outros Scripts (NÃO são para inicialização)

- `cleanup.sh` - Limpa arquivos temporários
- `cleanup_tests.sh` - Remove arquivos de teste
- `verify_database.sh` - Verifica integridade do banco
- `setup_ngrok.sh` - Configura testes com ngrok

## 🎯 Resumo

**Script de inicialização:** `start_full_stack.sh` ✅  
**Scripts de inicialização antigos:** REMOVIDOS ❌  
**Comando único:** `./start_full_stack.sh`
