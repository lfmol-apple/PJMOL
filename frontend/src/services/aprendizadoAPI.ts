"use client"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface CapturarCorrecaoRequest {
  administradora: string
  campo: string
  valor_original: string
  valor_corrigido: string
  contexto?: Record<string, any>
}

export interface AplicarCorrecoesRequest {
  administradora: string
  dados_extraidos: Record<string, any>
}

export interface CorrecaoResponse {
  sucesso: boolean
  mensagem?: string
  detalhes?: string
}

export interface CorrecoesAplicadasResponse {
  sucesso: boolean
  correcoes_aplicadas: Record<string, string>
  mensagens_aprendizado: string[]
  total_correcoes: number
}

export const aprendizadoAPI = {
  /**
   * Captura uma correção feita pelo usuário
   */
  async capturarCorrecao(request: CapturarCorrecaoRequest): Promise<CorrecaoResponse> {
    try {
      const response = await fetch(`${API_BASE}/aprendizado/capturar-correcao`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Erro ao capturar correção:', error)
      throw error
    }
  },

  /**
   * Aplica correções aprendidas automaticamente
   */
  async aplicarCorrecoes(request: AplicarCorrecoesRequest): Promise<CorrecoesAplicadasResponse> {
    try {
      const response = await fetch(`${API_BASE}/aprendizado/aplicar-correcoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Erro ao aplicar correções:', error)
      throw error
    }
  },

  /**
   * Obtém estatísticas de aprendizado para uma administradora
   */
  async obterEstatisticas(administradora: string): Promise<any> {
    try {
      const response = await fetch(`${API_BASE}/aprendizado/estatisticas/${encodeURIComponent(administradora)}`)
      
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error)
      throw error
    }
  }
}