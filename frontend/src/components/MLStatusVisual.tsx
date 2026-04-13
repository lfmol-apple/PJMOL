"use client";

import { useEffect, useState } from "react";

interface MLStatus {
  sucesso: boolean;
  status: {
    sistema_ml_ativo: boolean;
    total_administradoras_treinadas?: number;
    total_campos_automatizados?: number;
    funcionando?: boolean;
  };
}

export function MLStatusVisual() {
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchMLStatus = async () => {
    try {
      const response = await fetch("/api/ml/status");
      const data = await response.json();
      setMlStatus(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Erro ao buscar status ML:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMLStatus();
    const interval = setInterval(fetchMLStatus, 10000); // Atualiza a cada 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-blue-700 text-sm">Verificando ML...</span>
        </div>
      </div>
    );
  }

  if (!mlStatus?.sucesso || !mlStatus.status.sistema_ml_ativo) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
          <span className="text-gray-600 text-sm">ML Inativo</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-green-800 font-medium text-sm">🤖 ML Ativo</span>
          </div>
          
          {mlStatus.status.total_administradoras_treinadas && (
            <div className="text-green-700 text-xs">
              {mlStatus.status.total_administradoras_treinadas} admins • {mlStatus.status.total_campos_automatizados} campos
            </div>
          )}
        </div>
        
        <div className="text-green-600 text-xs">
          Atualizado: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>
      
      <div className="mt-2 text-green-700 text-xs">
        ✨ Sistema aprendendo e melhorando extrações automaticamente
      </div>
    </div>
  );
}
