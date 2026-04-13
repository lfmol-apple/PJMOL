import { useState, useCallback } from 'react';

// URL base do backend
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface CorrecaoML {
  administradora: string;
  campo: string;
  valor_original?: string;
  valor_corrigido: string;
  texto_pdf?: string;
}

interface CorrecaoMultipla {
  administradora: string;
  dados_originais: Record<string, any>;
  dados_corrigidos: Record<string, any>;
  texto_pdf?: string;
}

interface EstatisticasML {
  administradoras_com_ml?: number;
  campos_com_padroes_aprendidos?: number;
  total_padroes_regex?: number;
  campos_automatizaveis?: string[];
  campos_mais_extraidos?: string[];
  ultima_atualizacao?: string;
  total_extratos_processados?: number;
  taxa_sucesso_extracao?: number;
  administradoras_detectadas?: number;
  melhorias_automaticas?: number;
  status?: string;
}

interface StatusML {
  sistema_ml_ativo?: boolean;
  total_administradoras_treinadas?: number;
  total_campos_automatizados?: number;
  campos_disponiveis?: string[];
  ultima_atualizacao?: string;
  status?: string;
}

interface UseMLAprendizadoReturn {
  // Estado
  carregando: boolean;
  erro: string | null;
  
  // Funções para capturar correções
  capturarCorrecao: (correcao: CorrecaoML) => Promise<{ sucesso: boolean; mensagem: string }>;
  capturarCorrecoesMultiplas: (correcao: CorrecaoMultipla) => Promise<{ sucesso: boolean; mensagem: string }>;
  
  // Funções para estatísticas
  obterEstatisticas: () => Promise<EstatisticasML | null>;
  obterStatus: () => Promise<StatusML | null>;
  obterPadroesAdministradora: (administradora: string) => Promise<any>;
  
  // Funções administrativas
  resetarML: () => Promise<boolean>;
}

/**
 * Hook para integração com o sistema de Machine Learning automático.
 * 
 * Permite capturar correções do usuário e treinar o ML para automatizar
 * a extração de dados de extratos sem intervenção manual.
 */
export function useMLAprendizado(): UseMLAprendizadoReturn {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const executarRequisicao = useCallback(async <T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    setCarregando(true);
    setErro(null);
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Erro desconhecido' }));
        throw new Error(errorData.detail || `Erro ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
      setErro(mensagemErro);
      console.error('Erro na requisição ML:', error);
      return null;
    } finally {
      setCarregando(false);
    }
  }, []);

  const capturarCorrecao = useCallback(async (correcao: CorrecaoML) => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/capturar-correcao`, {
      method: 'POST',
      body: JSON.stringify(correcao),
    });

    if (resultado?.sucesso) {
      return { sucesso: true, mensagem: resultado.mensagem };
    }
    
    return { sucesso: false, mensagem: erro || 'Erro ao capturar correção' };
  }, [executarRequisicao, erro]);

  const capturarCorrecoesMultiplas = useCallback(async (correcao: CorrecaoMultipla) => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/capturar-correcoes-multiplas`, {
      method: 'POST',
      body: JSON.stringify(correcao),
    });

    if (resultado?.sucesso) {
      return { sucesso: true, mensagem: resultado.mensagem };
    }
    
    return { sucesso: false, mensagem: erro || 'Erro ao capturar correções' };
  }, [executarRequisicao, erro]);

  const obterEstatisticas = useCallback(async (): Promise<EstatisticasML | null> => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/estatisticas`);
    return resultado?.estatisticas || null;
  }, [executarRequisicao]);

  const obterStatus = useCallback(async (): Promise<StatusML | null> => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/status`);
    return resultado?.status || null;
  }, [executarRequisicao]);

  const obterPadroesAdministradora = useCallback(async (administradora: string) => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/padroes/${encodeURIComponent(administradora)}`);
    return resultado?.padroes || null;
  }, [executarRequisicao]);

  const resetarML = useCallback(async (): Promise<boolean> => {
    const resultado = await executarRequisicao<any>(`${API_BASE}/api/ml/resetar-ml`, {
      method: 'DELETE',
    });
    return resultado?.sucesso || false;
  }, [executarRequisicao]);

  return {
    carregando,
    erro,
    capturarCorrecao,
    capturarCorrecoesMultiplas,
    obterEstatisticas,
    obterStatus,
    obterPadroesAdministradora,
    resetarML,
  };
}

/**
 * Hook para detectar e capturar correções automaticamente quando o usuário 
 * modifica campos de dados extraídos.
 */
export function useDetectorCorrecaoML() {
  const { capturarCorrecao, capturarCorrecoesMultiplas } = useMLAprendizado();
  const [dadosOriginais, setDadosOriginais] = useState<Record<string, any>>({});
  const [administradoraAtual, setAdministradoraAtual] = useState<string>('');
  const [textoPdfAtual, setTextoPdfAtual] = useState<string>('');

  // Define os dados originais após extração
  const definirDadosOriginais = useCallback((dados: Record<string, any>, administradora: string, textoPdf?: string) => {
    setDadosOriginais(dados);
    setAdministradoraAtual(administradora);
    setTextoPdfAtual(textoPdf || '');
  }, []);

  // Detecta uma correção individual
  const detectarCorrecao = useCallback(async (campo: string, novoValor: string) => {
    if (!administradoraAtual) return;
    
    const valorOriginal = String(dadosOriginais[campo] || '');
    const valorCorrigido = String(novoValor).trim();
    
    // Só captura se houve mudança real
    if (valorOriginal.trim() !== valorCorrigido && valorCorrigido) {
      await capturarCorrecao({
        administradora: administradoraAtual,
        campo,
        valor_original: valorOriginal,
        valor_corrigido: valorCorrigido,
        texto_pdf: textoPdfAtual,
      });
    }
  }, [administradoraAtual, dadosOriginais, textoPdfAtual, capturarCorrecao]);

  // Detecta múltiplas correções de uma vez
  const detectarCorrecoesMultiplas = useCallback(async (dadosCorrigidos: Record<string, any>) => {
    if (!administradoraAtual) return;
    
    // Filtra apenas campos que realmente mudaram
    const correcoes: Record<string, any> = {};
    let temCorrecoes = false;
    
    for (const [campo, novoValor] of Object.entries(dadosCorrigidos)) {
      const valorOriginal = String(dadosOriginais[campo] || '').trim();
      const valorCorrigido = String(novoValor || '').trim();
      
      if (valorOriginal !== valorCorrigido && valorCorrigido) {
        correcoes[campo] = valorCorrigido;
        temCorrecoes = true;
      }
    }
    
    if (temCorrecoes) {
      await capturarCorrecoesMultiplas({
        administradora: administradoraAtual,
        dados_originais: dadosOriginais,
        dados_corrigidos: correcoes,
        texto_pdf: textoPdfAtual,
      });
    }
  }, [administradoraAtual, dadosOriginais, textoPdfAtual, capturarCorrecoesMultiplas]);

  return {
    definirDadosOriginais,
    detectarCorrecao,
    detectarCorrecoesMultiplas,
    administradoraAtual,
    temDadosOriginais: Object.keys(dadosOriginais).length > 0,
  };
}