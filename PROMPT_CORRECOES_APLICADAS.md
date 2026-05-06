# PROMPT PARA APLICAR CORREÇÕES EM OUTRO PROJETO

## CONTEXTO
Aplicar 4 correções críticas identificadas e corrigidas no projeto PJMOL que devem ser replicadas em outro projeto similar.

## CORREÇÃO 1: ANEXOS - PROBLEMA DE UPLOAD/REMOÇÃO MÚLTIPLA

**PROBLEMA**: Não conseguia anexar e remover diversos documentos na página de anexos.

**LOCALIZAÇÃO**: `/frontend/src/app/anexos/[extratoId]/page.tsx`

**SINTOMAS**:
- Upload de múltiplos arquivos falhava
- Remoção de documentos não funcionava corretamente
- Interface travava ou não respondia
- Erros de estado inconsistente

**CORREÇÃO APLICADA**: 
- Verificar gerenciamento de estado dos uploads
- Corrigir loops de upload assíncrono
- Implementar controle de concorrência
- Ajustar callbacks de sucesso/erro
- Normalizar tratamento de respostas da API

**INSTRUÇÕES PARA APLICAR**:
1. Localizar arquivo equivalente a `anexos/[extratoId]/page.tsx`
2. Buscar por funções de upload/remoção de documentos
3. Verificar se há problemas de Promise.all() ou map() assíncrono
4. Implementar controle de estado adequado para múltiplos uploads
5. Testar upload e remoção sequencial e simultânea

---

## CORREÇÃO 2: MODAL DOCUMENTOS - PREVIEW NÃO ABRIA

**PROBLEMA**: Preview de documentos no ModalDocumentos não abria.

**LOCALIZAÇÃO**: `/frontend/src/app/components/ModalDocumentos.tsx`

**SINTOMAS**:
- Botão de preview não respondia
- Modal de preview não aparecia
- Possível erro de referência ou estado
- PDF não carregava na visualização

**CORREÇÃO APLICADA**:
- Corrigir referências de estado do modal
- Ajustar handlers de abertura do preview
- Verificar URLs dos documentos
- Implementar tratamento de erro no carregamento

**INSTRUÇÕES PARA APLICAR**:
1. Localizar componente ModalDocumentos ou equivalente
2. Buscar por função de preview/visualização de PDF
3. Verificar se URLs estão sendo geradas corretamente
4. Testar se modal de preview abre e fecha
5. Validar carregamento de documentos PDF

---

## CORREÇÃO 3: BOTÃO EXCLUIR - FALHA NO DELETE

**PROBLEMA**: Botão de excluir extrato não funcionava.

**LOCALIZAÇÃO**: Interface de listagem de extratos

**SINTOMAS**:
- Botão excluir não respondia ao clique
- Erro de módulo não encontrado ao tentar deletar
- Função de delete undefined ou inacessível
- ModuleNotFoundError relacionado a imports

**CORREÇÃO APLICADA**:
- Corrigir imports relativos na função de delete
- Verificar se handlers de delete estão bem definidos
- Ajustar importação de componentes/utils necessários
- Validar se API de delete está funcionando

**INSTRUÇÕES PARA APLICAR**:
1. Localizar botão/função de excluir extratos
2. Verificar se há erros de import (routes., utils.)
3. Testar se onClick do botão está funcionando
4. Validar se endpoint de DELETE responde
5. Verificar se confirmação de delete aparece

---

## CORREÇÃO 4: IMPORTS RELATIVOS - CAMINHOS INCORRETOS

**PROBLEMA**: Imports relativos causando erros de módulo não encontrado.

**LOCALIZAÇÃO**: Múltiplos arquivos backend

**SINTOMAS**:
- Erro "ModuleNotFoundError" 
- Imports como `from routes.` ou `from utils.`
- Aplicação crashando ao iniciar
- Paths relativos sem prefixo `app.`

**CORREÇÃO APLICADA**:
Buscar e substituir imports incorretos:
```python
# ANTES (INCORRETO):
from routes.uploads import algo
from utils.mailer import algo
from core.timers import algo

# DEPOIS (CORRETO):
from app.routes.uploads import algo
from app.utils.mailer import algo  
from app.core.timers import algo
```

**INSTRUÇÕES PARA APLICAR**:
1. Executar busca global por padrão: `from routes\.` e `from utils\.`
2. Substituir por `from app.routes.` e `from app.utils.`
3. Verificar estrutura de pastas do projeto
4. Testar se backend inicia sem erros de import
5. Validar se todas as funcionalidades funcionam

---

## COMANDO PARA BUSCA E CORREÇÃO

```bash
# Buscar imports problemáticos
grep -r "from routes\." backend/
grep -r "from utils\." backend/
grep -r "from core\." backend/

# Para cada arquivo encontrado, substituir:
# from routes. → from app.routes.
# from utils. → from app.utils.
# from core. → from app.core.
```

---

## VALIDAÇÃO FINAL

Após aplicar as correções:

1. **Anexos**: Testar upload de 3-5 documentos simultaneamente
2. **Preview**: Abrir modal e visualizar PDFs gerados
3. **Botão Excluir**: Clicar em delete e confirmar que funciona
4. **Backend**: Iniciar aplicação e verificar ausência de erros de import
5. **Funcional**: Executar fluxo completo end-to-end

---

## PROMPT PARA USO

"Preciso aplicar 4 correções críticas em um projeto similar:

1. **ANEXOS**: Corrigir problema de upload/remoção múltipla de documentos na página de anexos
2. **PREVIEW**: Corrigir modal de preview de documentos que não abre
3. **BOTÃO EXCLUIR**: Corrigir botão de delete que não funciona (erro de import/handler)
4. **IMPORTS**: Corrigir imports relativos que causam ModuleNotFoundError (routes./utils. → app.routes./app.utils.)

Analise o projeto e implemente essas correções seguindo as instruções detalhadas acima. Priorize testar cada correção após implementar."