"use client";

import { useState, useEffect, useCallback } from "react";

interface MLMensagem {
  id: string;
  texto: string;
  tipo: "aprendizado" | "melhoria" | "processo";
  timestamp: number;
}

export function useMLMensagens() {
  const [mensagens, setMensagens] = useState<MLMensagem[]>([]);

  const adicionarMensagem = useCallback((texto: string, tipo: "aprendizado" | "melhoria" | "processo" = "processo") => {
    const novaMensagem: MLMensagem = {
      id: Date.now().toString(),
      texto,
      tipo,
      timestamp: Date.now()
    };
    
    setMensagens(prev => [novaMensagem, ...prev.slice(0, 4)]); // Manter apenas 5 mensagens
    
    // Remover mensagem após 8 segundos
    setTimeout(() => {
      setMensagens(prev => prev.filter(m => m.id !== novaMensagem.id));
    }, 8000);
  }, []);

  const limparMensagens = useCallback(() => {
    setMensagens([]);
  }, []);

  return {
    mensagens,
    adicionarMensagem,
    limparMensagens
  };
}
