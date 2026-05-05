"use client"

import React from 'react'
import { useAprendizadoMensagens } from '@/hooks/useAprendizadoMensagens'

interface MensagemAprendizadoProps {
  id: string
  texto: string
  onRemover: (id: string) => void
}

const MensagemAprendizado: React.FC<MensagemAprendizadoProps> = ({ id, texto, onRemover }) => {
  return (
    <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-2 rounded-r shadow-lg animate-slide-in-right">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-blue-700 font-medium">{texto}</span>
        </div>
        <button
          onClick={() => onRemover(id)}
          className="text-blue-400 hover:text-blue-600 ml-4"
        >
          ×
        </button>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-1 mt-2">
        <div className="bg-blue-500 h-1 rounded-full animate-progress-bar"></div>
      </div>
    </div>
  )
}

interface AprendizadoMensagensProps {
  mensagens: Array<{ id: string; texto: string; timestamp: number }>
  onRemoverMensagem: (id: string) => void
}

export const AprendizadoMensagens: React.FC<AprendizadoMensagensProps> = ({
  mensagens,
  onRemoverMensagem
}) => {
  if (mensagens.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      {mensagens.map((mensagem) => (
        <MensagemAprendizado
          key={mensagem.id}
          id={mensagem.id}
          texto={mensagem.texto}
          onRemover={onRemoverMensagem}
        />
      ))}
    </div>
  )
}

export default AprendizadoMensagens