import React, { useEffect, useState } from 'react';
import { useMLAprendizado } from '../hooks/useMLAprendizado';

interface EstatisticasMLProps {
  className?: string;
  showDetailed?: boolean;
}

// Importando interfaces do hook para evitar duplicação
interface StatusML {
  sistema_ml_ativo?: boolean;
  total_administradoras_treinadas?: number;
  total_campos_automatizados?: number;
  campos_disponiveis?: string[];
  ultima_atualizacao?: string;
  status?: string;
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

/**
 * Componente para exibir estatísticas do sistema de Machine Learning.
 * Mostra progresso do aprendizado e capacidades de automação atual.
 */
export function EstatisticasMLComponent({ className = '', showDetailed = false }: EstatisticasMLProps) {
  const { obterStatus, obterEstatisticas, carregando, erro } = useMLAprendizado();
  const [status, setStatus] = useState<StatusML | null>(null);
  const [estatisticas, setEstatisticas] = useState<EstatisticasML | null>(null);
  const [atualizado, setAtualizado] = useState<string>('');

  useEffect(() => {
    const carregarDados = async () => {
      const [statusData, statsData] = await Promise.all([
        obterStatus(),
        obterEstatisticas()
      ]);
      
      setStatus(statusData);
      setEstatisticas(statsData);
      
      if (statusData?.ultima_atualizacao) {
        const data = new Date(statusData.ultima_atualizacao);
        setAtualizado(data.toLocaleString('pt-BR'));
      }
    };

    carregarDados();
  }, [obterStatus, obterEstatisticas]);

  if (carregando) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-blue-600 font-medium">Carregando estatísticas ML...</span>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center space-x-2">
          <span className="text-red-600">⚠️</span>
          <span className="text-red-600 font-medium">Erro ao carregar estatísticas: {erro}</span>
        </div>
      </div>
    );
  }

  if (!status && !estatisticas) {
    return null;
  }

  const percentualTreinamento = (() => {
    if (!status?.total_administradoras_treinadas || status.total_administradoras_treinadas === 0) {
      return 0;
    }
    
    const total = status.total_administradoras_treinadas * 8;
    const atual = status.total_campos_automatizados || 0;
    
    return Math.round((atual / total) * 100);
  })();

  return (
    <div className={`bg-purple-50 border border-purple-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-purple-800 flex items-center space-x-2">
          <span>🤖</span>
          <span>Sistema de Machine Learning</span>
        </h3>
        
        {status?.sistema_ml_ativo ? (
          <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            ATIVO
          </span>
        ) : (
          <span className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            INATIVO
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg p-3 border border-purple-100">
          <div className="text-2xl font-bold text-purple-600">
            {status?.total_administradoras_treinadas || 0}
          </div>
          <div className="text-sm text-gray-600">
            Administradoras Treinadas
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-2xl font-bold text-blue-600">
            {status?.total_campos_automatizados || 0}
          </div>
          <div className="text-sm text-gray-600">
            Campos Automatizados
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 border border-green-100">
          <div className="text-2xl font-bold text-green-600">
            {percentualTreinamento}%
          </div>
          <div className="text-sm text-gray-600">
            Progresso Geral
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Capacidade de Automação</span>
          <span>{percentualTreinamento}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(percentualTreinamento, 100)}%` }}
          ></div>
        </div>
      </div>

      {showDetailed && estatisticas && (
        <div className="border-t border-purple-200 pt-4">
          <h4 className="font-medium text-purple-700 mb-3">Detalhes Técnicos</h4>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Padrões Regex Aprendidos:</span>
              <span className="ml-2 font-medium">{estatisticas?.total_padroes_regex || 0}</span>
            </div>
            
            <div>
              <span className="text-gray-600">Campos com Padrões:</span>
              <span className="ml-2 font-medium">{estatisticas?.campos_com_padroes_aprendidos || 0}</span>
            </div>
          </div>

          <div className="mt-3">
            <div className="text-gray-600 text-sm mb-1">Campos Automatizáveis:</div>
            <div className="flex flex-wrap gap-1">
              {(estatisticas?.campos_automatizaveis || estatisticas?.campos_mais_extraidos || []).map((campo) => (
                <span 
                  key={campo} 
                  className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full"
                >
                  {campo}
                </span>
              ))}
              {(!estatisticas?.campos_automatizaveis && !estatisticas?.campos_mais_extraidos) || 
               (estatisticas?.campos_automatizaveis?.length === 0 && estatisticas?.campos_mais_extraidos?.length === 0) ? (
                <span className="text-gray-500 text-sm italic">
                  {estatisticas?.status || "Nenhum campo disponível"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {atualizado && (
        <div className="text-xs text-gray-500 mt-3 text-center">
          Última atualização: {atualizado}
        </div>
      )}
    </div>
  );
}

/**
 * Versão compacta do componente para usar em dashboards
 */
export function EstatisticasMLCompacta({ className = '' }: { className?: string }) {
  return (
    <EstatisticasMLComponent 
      className={className} 
      showDetailed={false}
    />
  );
}

/**
 * Versão detalhada do componente para páginas de configuração
 */
export function EstatisticasMLDetalhada({ className = '' }: { className?: string }) {
  return (
    <EstatisticasMLComponent 
      className={className} 
      showDetailed={true}
    />
  );
}