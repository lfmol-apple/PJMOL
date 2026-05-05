# PJMOL — Relatório de Disco VPS (Somente Leitura)
**Data:** 2026-05-05  
**VPS:** root@72.60.245.82  
**Disco total:** 193 GB | **Usado:** 109 GB (57%) | **Livre:** 85 GB  

> ⚠️ Este relatório é somente de análise. Nada foi apagado ou alterado na VPS.

---

## 1. TOTAL USADO POR PARTIÇÃO

| Partição | Tamanho | Usado | Livre | % |
|---------|---------|-------|-------|---|
| `/dev/sda1` (raiz) | 193 GB | 109 GB | 85 GB | 57% |
| `/boot` | 881 MB | 119 MB | 700 MB | 15% |
| `/boot/efi` | 105 MB | 6.2 MB | 99 MB | 6% |

---

## 2. TOP 20 DIRETÓRIOS MAIS PESADOS

| Tamanho | Diretório |
|---------|-----------|
| 81 GB | `/root` |
| 48 GB | `/root/backups` |
| 34 GB | `/root/backups/diario` ← ⚠️ |
| 24 GB | `/var` |
| 20 GB | `/root/pjmol_snapshots` |
| 20 GB | `/var/www/pjmol` |
| 16 GB | `/var/www/pjmol/backend/app` |
| 15 GB | `/var/www/pjmol/backend/app/documentos_gerados` |
| 9.3 GB | `/root/pjmol_backups` |
| 5.3 GB | `/snap` |
| 4.8 GB | `/root/backups/3h` ← ⚠️ |
| 4 GB | `/usr` |
| 3.1 GB | `/root/pjmol-backup` |
| 1.9 GB | `/var/lib/snapd` |
| 1.9 GB | `/var/www/pjmol/backups` |
| 1.1 GB | `/root/backup_completo_20260113_115105` |
| 820 MB | `/var/www/pjmol/frontend/node_modules` |
| 722 MB | `/var/lib/apt` |
| 600 MB | `/var/www/pjmol/venv` |
| 435 MB | `/var/www/pjmol/backend/app/storage` |

---

## 3. TOP 30 ARQUIVOS MAIS PESADOS

| Tamanho | Arquivo |
|---------|---------|
| 3.5 GB | `/root/backups/diario/sistema_20260504.tar.gz` |
| 3.5 GB | `/root/backups/diario/sistema_20260503.tar.gz` |
| 3.5 GB | `/root/backups/diario/sistema_20260502.tar.gz` |
| 3.5 GB | `/root/backups/diario/sistema_20260501.tar.gz` |
| 3.5 GB | `/root/backups/diario/sistema_20260430.tar.gz` |
| 3.4 GB | `/root/pjmol_backups/pjmol_full_production_consistent_20260411_174049.tar.gz` |
| 3.4 GB | `/root/backups/diario/sistema_20260429.tar.gz` |
| 3.4 GB | `/root/backups/diario/sistema_20260428.tar.gz` |
| 3.4 GB | `/root/backups/diario/sistema_20260427.tar.gz` |
| 3.4 GB | `/root/backups/diario/sistema_20260426.tar.gz` |
| 3.4 GB | `/root/backups/diario/sistema_20260425.tar.gz` |
| 3.1 GB | `/root/pjmol-backup/pjmol-production-source-20260505-152150.tar.gz` |
| 2.7 GB | `/root/pjmol_backups/pjmol_full_production_20260411_173147.tar.gz` |
| 1.8 GB | `/var/www/pjmol/backups/pjmol_full_production_20260411_172924.tar.gz` |
| 1.8 GB | `/root/pjmol_snapshots/20260411_174049/pjmol/backups/…_172924.tar.gz` |
| 1.6 GB | `/root/pjmol_backups/pjmol_full_production_20260411_173719.tar.gz` |
| 1.3 GB | `/root/backups/arquivos_2025-12-07_03-00.tar.gz` |
| 1.2 GB | `/root/backups/arquivos_2025-12-06_03-00.tar.gz` |
| 1.2 GB | `/root/backups/arquivos_2025-12-05_03-00.tar.gz` |
| 1.2 GB | `/root/backups/arquivos_2025-12-04_03-00.tar.gz` |
| 486 MB | `/root/backups/3h/storage_20260505_150001.tar.gz` |
| 485 MB | `/root/backups/3h/storage_20260505_120001.tar.gz` |
| 484 MB | `/root/backups/3h/storage_20260505_090001.tar.gz` |
| 484 MB | `/root/backups/3h/storage_20260505_060001.tar.gz` |
| 57 MB | `/root/backups/storage_ANTES_RESTORE_20251207_161627.tar.gz` |
| 57 MB | `/root/backups/storage_POS_LIMPEZA_20251207_152730.tar.gz` |
| 57 MB | `/root/backups/storage_ANTES_LIMPEZA_20251207_150429.tar.gz` |
| 43 MB | `/var/www/pjmol/backups/storage_.tar.gz` |
| 11 MB | `/root/backups/pre_correcao_porto_20260401_152954.tar.gz` |

---

## 4. CLASSIFICAÇÃO DOS DIRETÓRIOS

### ✅ ESSENCIAL — Nunca apagar

| Local | Motivo |
|-------|--------|
| `/var/www/pjmol/backend/app/documentos_gerados/` (15 GB) | Documentos gerados em produção — dados dos clientes |
| `/var/www/pjmol/backend/app/storage/` (435 MB) | Uploads reais de usuários (extratos, assinaturas, anexos) |
| `/var/www/pjmol/backend/app/database.db` | Banco de dados ativo |
| `/var/www/pjmol/frontend/` (código-fonte) | Aplicação em execução |
| `/var/www/pjmol/backend/app/` (código) | Backend em execução |

### ⚠️ PROVAVELMENTE DESCARTÁVEL — Libera ~60 GB

| Tamanho | Item | Ação sugerida |
|---------|------|---------------|
| 34 GB | `/root/backups/diario/` — 10 backups diários, 3.5 GB cada | Manter últimos 3, apagar os 7 anteriores |
| 19 GB | `/root/pjmol_snapshots/20260411_174049/` — snapshot de 24 de abril | Apagar (snapshot muito antigo) |
| 4.3 GB | `/root/pjmol_backups/pjmol_full_production_20260411_173147.tar.gz` + `173719.tar.gz` | Apagar (manter só o `consistent`) |
| 4.8 GB | `/root/backups/3h/` — 10 backups de 3 em 3 horas | Manter último, apagar os demais |
| 3.1 GB | `/root/pjmol-backup/pjmol-production-source-20260505-152150.tar.gz` | Avaliar se é necessário |
| 1.8 GB | `/var/www/pjmol/backups/pjmol_full_production_20260411_172924.tar.gz` | Apagar (duplicado no pjmol_snapshots) |
| 1.1 GB | `/root/backup_completo_20260113_115105/` | Apagar (backup de janeiro, muito antigo) |
| 3.7 GB | `/root/backups/arquivos_2025-12-*` (4 backups de Dez/2025) | Apagar (muito antigos) |
| 299 MB | `/root/.npm/_cacache` | Apagar com `npm cache clean --force` |
| 142 MB | `/root/.cache/pip` | Apagar com `pip cache purge` |

### 🔄 PODE RECRIAR — Libera ~1.6 GB adicional

| Tamanho | Item | Como recriar |
|---------|------|-------------|
| 820 MB | `/var/www/pjmol/frontend/node_modules/` | `cd /var/www/pjmol/frontend && npm install` |
| 600 MB | `/var/www/pjmol/venv/` | `python3 -m venv venv && pip install -r requirements.txt` |
| 180 MB | `/var/www/pjmol/frontend/.next/` | `npm run build` |

### ❓ PRECISA REVISAR

| Item | Dúvida |
|------|--------|
| `/var/www/pjmol/backend/app/temp_uploads/` (63 MB) | Uploads temporários — verificar se há arquivos abandonados |
| `/var/www/pjmol/backend/app/storage_backup_20251211_143233/` (76 MB) | Backup interno de Dez/2025 — pode ser apagado |
| `/root/backups/backup_20251209_*/` (3 diretórios) | Backups de Dez/2025 — provavelmente dispensáveis |
| `/var/www/pjmol/backend/app/imagens/` | Verificar se as imagens são usadas pelo sistema |
| `/root/dados_atuais/` (58 MB) | Verificar se é cópia de dados ativos ou backup obsoleto |

### 🔴 PROIBIDO APAGAR

| Item | Motivo |
|------|--------|
| `/var/www/pjmol/backend/app/database.db` | Banco ativo |
| `/var/www/pjmol/backend/app/documentos_gerados/` | Documentos dos clientes |
| `/var/www/pjmol/backend/app/storage/` | Uploads dos usuários |
| O backup mais recente de cada tipo | Segurança mínima |

---

## 5. CAUSA RAIZ DO CRESCIMENTO — CRON SEM RETENÇÃO

```cron
*/5 * * * * /root/check_malware.sh
* * * * * /root/keep_system_alive.sh
0 */3 * * * /root/backup_3h.sh      ← gera ~484 MB a cada 3h = 4 GB/dia
0 20 * * * /root/backup_diario.sh   ← gera ~3.5 GB/dia
```

**Os scripts de backup estão funcionando, mas sem retenção (não apagam os backups antigos).**  
A cada dia acumulam +3.5 GB (diário) + até 8 × 484 MB (3h) = ~7.4 GB/dia.  
Em 2 semanas sem limpeza: **~100 GB acumulados.**

---

## 6. QUANTO PODE SER LIBERADO COM SEGURANÇA

| Ação | Estimativa | Risco |
|------|-----------|-------|
| Manter 3 backups diários, apagar 7 | ~25 GB | Zero |
| Apagar snapshot 20260411 (/root/pjmol_snapshots) | ~19 GB | Zero (snapshot antigo) |
| Manter 1 backup 3h, apagar demais | ~4 GB | Zero |
| Apagar pjmol_backups duplicados (2 de 3) | ~4.3 GB | Zero |
| Apagar pjmol-production-source do dia de hoje | 3.1 GB | Baixo |
| Apagar backups /var/www/pjmol/backups antigos | 1.8 GB | Zero |
| Apagar backup_completo Jan/2026 | 1.1 GB | Zero |
| Apagar arquivos_2025-12-* | 3.7 GB | Zero |
| npm cache, pip cache | 441 MB | Zero |
| **TOTAL** | **~62 GB** | **Baixo** |

---

## 7. AÇÃO RECOMENDADA (requer sua autorização)

**Passo 1** — Adicionar retenção nos scripts de backup:
```bash
# Em /root/backup_diario.sh — manter apenas os últimos 5 dias:
find /root/backups/diario -name "*.tar.gz" -mtime +5 -delete

# Em /root/backup_3h.sh — manter apenas os últimas 48h:
find /root/backups/3h -name "*.tar.gz" -mtime +2 -delete
find /root/backups/3h -name "*.db" -mtime +2 -delete
```

**Passo 2** — Liberar espaço dos backups acumulados (executar com cautela):
```bash
# Confirmar o que será apagado antes:
ls -lht /root/backups/diario/ | head -4   # manter os 3 mais recentes

# Depois de confirmar, com autorização:
# ls /root/backups/diario/ | sort | head -7 | while read f; do rm /root/backups/diario/$f; done
```

**Passo 3** — Opcional (recriar sob demanda):
```bash
# Economiza ~1.6 GB — só fazer em janela de manutenção
cd /var/www/pjmol/frontend && rm -rf node_modules .next
```

---

## 8. CONFIRMAÇÃO — NADA FOI ALTERADO NA VPS

Este relatório é 100% leitura. Nenhum arquivo foi apagado, movido ou modificado.
