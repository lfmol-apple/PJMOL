"use client";

import { useEffect, useState } from 'react';
import { useMLAprendizado } from '@/hooks/useMLAprendizado';

interface MLStatusIndicatorProps {
  className?: string;
}

/**
 * Indicador compacto do status do ML para mostrar na navbar/header
 */
export function MLStatusIndicator({ className = '' }: MLStatusIndicatorProps) {
  const { obterStatus } = useMLAprendizado();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarStatus = async () => {
      setLoading(true);
      const data = await obterStatus();
      setStatus(data);
      setLoading(false);
    };

    carregarStatus();
    // Atualiza a cada 30 segundos
    const interval = setInterval(carregarStatus, 30000);
    return () => clearInterval(interval);
  }, [obterStatus]);

  if (loading || !status) {
    return null;
  }

  if (!status.sistema_ml_ativo) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs ${className}`}>
        <span className="w-2 h-2 rounded-full bg-gray-400"></span>
        <span>ML Inativo</span>
      </div>
    );
  }

  const percentualTreinamento = status.total_administradoras_treinadas
    ? Math.round((status.total_campos_automatizados / (status.total_administradoras_treinadas * 8)) * 100)
    : 0;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium ${className}`}>
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
      <span>ML Ativo</span>
      <span className="text-green-600">•</span>
      <span>{status.total_administradoras_treinadas} admins treinadas</span>
      {percentualTreinamento > 0 && (
        <>
          <span className="text-green-600">•</span>
          <span>{percentualTreinamento}% automatizado</span>
        </>
      )}
    </div>
  );
}