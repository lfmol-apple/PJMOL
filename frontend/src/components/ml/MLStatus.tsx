"use client";
import { useEffect, useState } from "react";

interface MLStatusData {
  ml_ativo: boolean;
  ml_carregado: boolean;
  timestamp: string;
  mensagem: string;
  classe?: string;
  versao?: string;
  melhorias_total?: number;
  capacidades?: string[];
  administradoras_suportadas?: string[];
  status_detalhado?: string;
}

interface MLTeste {
  teste_realizado: boolean;
  dados_originais?: any;
  dados_melhorados?: any;
  mensagens_ml?: string[];
  sucesso: boolean;
  erro?: string;
}

export default function MLStatus() {
  const [mlStatus, setMLStatus] = useState<MLStatusData | null>(null);
  const [mlTeste, setMLTeste] = useState<MLTeste | null>(null);
  const [loading, setLoading] = useState(true);
  const [testando, setTestando] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const buscarStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ml/status`);
      const data = await response.json();
      setMLStatus(data);
    } catch (error) {
      console.error("Erro ao buscar status ML:", error);
    } finally {
      setLoading(false);
    }
  };

  const testarML = async () => {
    setTestando(true);
    try {
      const response = await fetch(`${API_BASE}/api/ml/teste`);
      const data = await response.json();
      setMLTeste(data);
    } catch (error) {
      console.error("Erro ao testar ML:", error);
    } finally {
      setTestando(false);
    }
  };

  useEffect(() => {
    buscarStatus();
    const interval = setInterval(buscarStatus, 30000); // Atualiza a cada 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="animate-pulse flex space-x-4">
          <div className="rounded-full bg-blue-300 h-10 w-10"></div>
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 bg-blue-300 rounded w-3/4"></div>
            <div className="h-4 bg-blue-300 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Principal */}
      <div className={`border rounded-lg p-6 ${
        mlStatus?.ml_ativo && mlStatus?.ml_carregado 
          ? "bg-green-50 border-green-200" 
          : "bg-red-50 border-red-200"
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-4 h-4 rounded-full ${
              mlStatus?.ml_ativo && mlStatus?.ml_carregado ? "bg-green-500" : "bg-red-500"
            }`}></div>
            <h3 className="text-lg font-semibold">Sistema ML (Machine Learning)</h3>
          </div>
          <button
            onClick={testarML}
            disabled={testando || !mlStatus?.ml_carregado}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
          >
            {testando ? "Testando..." : "Testar ML"}
          </button>
        </div>

        {mlStatus?.ml_ativo && mlStatus?.ml_carregado ? (
          <div>
            <div className="text-green-700 text-2xl mb-2">🎉 {mlStatus.status_detalhado}</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <strong>Classe:</strong> {mlStatus.classe}
              </div>
              <div>
                <strong>Versão:</strong> {mlStatus.versao}
              </div>
              <div>
                <strong>Melhorias Total:</strong> {mlStatus.melhorias_total}
              </div>
              <div>
                <strong>Status:</strong> ✅ Operacional
              </div>
            </div>
            
            <div className="mb-4">
              <strong>Capacidades ML:</strong>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {mlStatus.capacidades?.map((cap, idx) => (
                  <li key={idx} className="text-green-700">• {cap}</li>
                ))}
              </ul>
            </div>

            <div>
              <strong>Administradoras Suportadas:</strong>
              <div className="flex flex-wrap gap-2 mt-2">
                {mlStatus.administradoras_suportadas?.map((admin, idx) => (
                  <span key={idx} className="px-3 py-1 bg-green-200 text-green-800 rounded-full text-sm">
                    {admin}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-red-700">
            <div className="text-xl mb-2">❌ ML não está funcionando</div>
            <div>Status: ML_ATIVO = {mlStatus?.ml_ativo ? "✅" : "❌"}, Carregado = {mlStatus?.ml_carregado ? "✅" : "❌"}</div>
          </div>
        )}
      </div>

      {/* Resultado do Teste */}
      {mlTeste && (
        <div className={`border rounded-lg p-4 ${
          mlTeste.sucesso ? "bg-blue-50 border-blue-200" : "bg-yellow-50 border-yellow-200"
        }`}>
          <h4 className="font-semibold mb-3">🧪 Resultado do Teste ML</h4>
          
          {mlTeste.sucesso ? (
            <div className="space-y-3">
              <div>
                <strong>Dados Originais:</strong>
                <pre className="bg-gray-100 p-2 rounded text-sm mt-1">
                  {JSON.stringify(mlTeste.dados_originais, null, 2)}
                </pre>
              </div>
              
              <div>
                <strong>Dados Melhorados pelo ML:</strong>
                <pre className="bg-green-100 p-2 rounded text-sm mt-1">
                  {JSON.stringify(mlTeste.dados_melhorados, null, 2)}
                </pre>
              </div>
              
              <div>
                <strong>Mensagens ML:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {mlTeste.mensagens_ml?.map((msg, idx) => (
                    <li key={idx} className="text-blue-700">🤖 {msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-red-700">
              ❌ Erro no teste: {mlTeste.erro}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Última atualização: {mlStatus?.timestamp}
      </div>
    </div>
  );
}
