"use client"

import { useCallback, useRef } from 'react'
import { aprendizadoAPI } from '@/services/aprendizadoAPI'

interface UseAprendizadoCorrecaoProps {
  administradora: string
  onMensagemAprendizado?: (mensagem: string) => void
}

export const useAprendizadoCorrecao = ({ 
  administradora, 
  onMensagemAprendizado 
}: UseAprendizadoCorrecaoProps) => {
  const valoresOriginais = useRef<Record<string, string>>({})
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null)

  const registrarValorOriginal = useCallback((campo: string, valor: string) => {
    valoresOriginais.current[campo] = valor
  }, [])

  const detectarCorrecao = useCallback(async (campo: string, novoValor: string, contexto?: Record<string, any>) => {
    const valorOriginal = valoresOriginais.current[campo]
    
    // Só processa se houve mudança significativa
    if (!valorOriginal || valorOriginal === novoValor || !novoValor.trim()) {
      return
    }

    // Debounce para evitar múltiplas chamadas
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current)
    }

    debounceTimeout.current = setTimeout(async () => {
      try {
        const response = await aprendizadoAPI.capturarCorrecao({
          administradora,
          campo,
          valor_original: valorOriginal,
          valor_corrigido: novoValor,
          contexto
        })

        if (response.sucesso && response.mensagem && onMensagemAprendizado) {
          onMensagemAprendizado(response.mensagem)
        }

        // Atualiza o valor original para o corrigido
        valoresOriginais.current[campo] = novoValor
      } catch (error) {
        console.error('Erro ao capturar correção:', error)
      }
    }, 1000) // Aguarda 1 segundo após a última mudança
  }, [administradora, onMensagemAprendizado])

  const aplicarCorrecoesAutomaticas = useCallback(async (dadosExtraidos: Record<string, any>) => {
    if (!administradora || !dadosExtraidos) {
      return { dadosCorrigidos: dadosExtraidos, mensagens: [] }
    }

    try {
      const response = await aprendizadoAPI.aplicarCorrecoes({
        administradora,
        dados_extraidos: dadosExtraidos
      })

      if (response.sucesso) {
        // Aplica as correções nos dados
        const dadosCorrigidos = { ...dadosExtraidos, ...response.correcoes_aplicadas }
        
        // Registra valores originais dos campos corrigidos
        Object.entries(response.correcoes_aplicadas).forEach(([campo, valorCorrigido]) => {
          valoresOriginais.current[campo] = valorCorrigido as string
        })

        // Mostra mensagens de aprendizado aplicado
        response.mensagens_aprendizado.forEach(mensagem => {
          if (onMensagemAprendizado) {
            onMensagemAprendizado(mensagem)
          }
        })

        return {
          dadosCorrigidos,
          mensagens: response.mensagens_aprendizado,
          totalCorrecoes: response.total_correcoes
        }
      }
    } catch (error) {
      console.error('Erro ao aplicar correções automáticas:', error)
    }

    return { dadosCorrigidos: dadosExtraidos, mensagens: [] }
  }, [administradora, onMensagemAprendizado])

  const limparValoresOriginais = useCallback(() => {
    valoresOriginais.current = {}
  }, [])

  return {
    registrarValorOriginal,
    detectarCorrecao,
    aplicarCorrecoesAutomaticas,
    limparValoresOriginais
  }
}