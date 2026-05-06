# 📁 Organização da Storage

## Estrutura Atual

```
storage/
├── anexos/                    # Arquivos anexados pelos usuários
│   └── {extrato_id}/         # Organizado por ID do extrato
│       ├── comprovante_endereco/
│       ├── comprovante_renda/
│       ├── documento_identidade/
│       ├── extrato/          # PDF original do extrato
│       ├── contrato/         # Arquivos de contrato
│       ├── procuracao/       # Arquivos de procuração  
│       ├── sentenca/         # Arquivos de sentença
│       └── termo_acordo/     # Termos de acordo
├── assinaturas/              # Documentos assinados via ZapSign
│   └── {extrato_id}/         # Organizado por ID do extrato
│       └── {zapsign_id}/     # UUID do documento no ZapSign
│           └── documento_assinado.pdf
└── extratos/                 # PDFs gerados automaticamente
    └── {extrato_id}/         # Organizado por ID do extrato  
        └── Extr._{NOME_CLIENTE}.pdf
```

## ✅ Melhorias Implementadas

### 1. Limpeza de Duplicatas
- ✅ Removidas 6 duplicatas identificadas por hash MD5
- ✅ Eliminada inconsistência de nomenclatura (Extrato vs extratos)
- ✅ Removidas pastas vazias desnecessárias

### 2. Organização por ID de Extrato
- ✅ Todos os arquivos organizados por ID do extrato no banco
- ✅ Estrutura consistente em anexos/, assinaturas/ e extratos/
- ✅ Fácil localização e cleanup de arquivos por extrato

### 3. Storage Antiga Removida
- ✅ `/Users/leonardomol/Jao/105 7/backend/app/storage` → backup (97MB)
- ✅ `/Users/leonardomol/Jao/105 7/backend/storage` → backup (2.2MB)  
- ✅ `/Users/leonardomol/Jao/105 19/backend/storage` → backup (2.2MB)
- ✅ Total liberado: ~101MB de storage duplicada

### 4. Scripts de Manutenção
- ✅ `organize_storage.py` - Remove duplicatas e organiza arquivos
- ✅ `maintenance_storage.py` - Manutenção periódica e relatórios

## 📊 Estatísticas Atuais

- **Tamanho total**: 10.9 MB
- **Arquivos únicos**: 27 arquivos
- **Diretórios**: 31 pastas organizadas
- **Extratos ativos**: 6 (IDs: 7, 9, 10, 12, 13, 14)

### Por Tipo:
- **Anexos**: 0.7 MB (15 arquivos, 4 extratos)
- **Assinaturas**: 10.1 MB (6 arquivos, 3 extratos)  
- **Extratos**: 0.1 MB (6 arquivos, 4 extratos)

## 🔧 Manutenção

Execute periodicamente:

```bash
# Limpeza de duplicatas
python backend/organize_storage.py

# Manutenção completa (remove órfãos)
python backend/maintenance_storage.py
```

## 🛡️ Sistema de Cleanup Automático

O sistema agora conta com cleanup automático:

1. **Ao deletar extrato**: Remove todos os arquivos associados
2. **Funcionalidades implementadas**:
   - `cleanup_extrato_storage()` em `utils/cleanup_storage.py`
   - Integração com rotas de delete em `routes/extratos.py`
   - Prevenção de URLs antigas reaparecerem

## 📝 Notas Importantes

- Storage está no `.gitignore` - não é versionada
- Backups das storages antigas foram preservados com timestamp
- Sistema de cleanup previne acúmulo de arquivos órfãos
- Scripts de manutenção validam integridade contra banco de dados