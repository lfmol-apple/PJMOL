"use client";

import { useMLMensagens } from "@/hooks/useMLMensagens";
import { useEffect } from "react";

export function MLMensagens() {
  const { mensagens, adicionarMensagem } = useMLMensagens();

  // Simular mensagens ML para demonstração
  useEffect(() => {
    const demos = [
      { texto: "🧠 Analisando padrões em extratos KSK...", tipo: "aprendizado" as const },
      { texto: "✨ Nome empresarial detectado automaticamente", tipo: "melhoria" as const },
      { texto: "📊 Melhorando extração de valores Porto Seguro", tipo: "aprendizado" as const },
      { texto: "🎯 Administradora detectada: 95% confiança", tipo: "processo" as const },
      { texto: "🔍 Aprendendo novo padrão de parcela", tipo: "aprendizado" as const }
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < demos.length) {
        adicionarMensagem(demos[index].texto, demos[index].tipo);
        index++;
      } else {
        // Reiniciar depois de mostrar todas
        setTimeout(() => { index = 0; }, 10000);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [adicionarMensagem]);

  if (mensagens.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {mensagens.map((mensagem) => (
        <div
          key={mensagem.id}
          className={`p-3 rounded-lg shadow-lg border animate-slide-in-right ${
            mensagem.tipo === "aprendizado" 
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : mensagem.tipo === "melhoria"
              ? "bg-green-50 border-green-200 text-green-800"  
              : "bg-purple-50 border-purple-200 text-purple-800"
          }`}
        >
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${
              mensagem.tipo === "aprendizado" 
                ? "bg-blue-500"
                : mensagem.tipo === "melhoria"
                ? "bg-green-500"
                : "bg-purple-500"
            }`}></div>
            <span className="text-sm font-medium">{mensagem.texto}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
