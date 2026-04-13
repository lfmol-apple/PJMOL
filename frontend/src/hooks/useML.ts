import { useState, useEffect } from "react";

interface MLStatus {
  ml_ativo: boolean;
  ml_carregado: boolean;
  classe?: string;
  versao?: string;
  melhorias_total?: number;
}

export function useML() {
  const [mlStatus, setMLStatus] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const verificarML = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ml/status`);
      const data = await response.json();
      setMLStatus(data);
    } catch (error) {
      console.error("Erro ao verificar ML:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verificarML();
  }, []);

  return {
    mlStatus,
    loading,
    isMLActive: mlStatus?.ml_ativo && mlStatus?.ml_carregado,
    verificarML
  };
}
