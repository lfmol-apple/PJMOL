"use client"

import { useState, useCallback } from 'react'

interface MensagemAprendizado {
  id: string
  texto: string
  timestamp: number
}

export const useAprendizadoMensagens = () => {
  const [mensagens, setMensagens] = useState<MensagemAprendizado[]>([])

  const adicionarMensagem = useCallback((texto: string) => {
    const novaMensagem: MensagemAprendizado = {
      id: Date.now().toString(),
      texto,
      timestamp: Date.now()
    }

    setMensagens(prev => [...prev, novaMensagem])

    // Remove a mensagem após 5 segundos
    setTimeout(() => {
      setMensagens(prev => prev.filter(m => m.id !== novaMensagem.id))
    }, 5000)
  }, [])

  const removerMensagem = useCallback((id: string) => {
    setMensagens(prev => prev.filter(m => m.id !== id))
  }, [])

  return {
    mensagens,
    adicionarMensagem,
    removerMensagem
  }
}