// src/app/public/advogado/open/[extratoId]/[token]/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function AdvOpenPageContent() {
  const { extratoId, token } = useParams() as { extratoId: string; token: string };
  const router = useRouter();
  const qs = useSearchParams();
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        if (!extratoId || !token) {
          setErro("Link inválido.");
          return;
        }

        const url = `${API_BASE}/public/advogado/open/${extratoId}/${encodeURIComponent(token)}`;
        const resp = await fetch(url, { method: "GET" });

        if (!resp.ok) {
          if (resp.status === 401) setErro("Link expirado ou não autorizado.");
          else if (resp.status === 403) setErro("Este link não corresponde a este extrato.");
          else if (resp.status === 404) setErro("Extrato ou advogado não encontrado.");
          else setErro(`Falha ao validar (${resp.status}).`);
          return;
        }

        const data = await resp.json();

        // Sessão mínima MODO ADVOGADO (não mexe no seu login normal)
        if (typeof window !== "undefined") {
          localStorage.setItem("perfilUsuario", "advogado");
          localStorage.setItem("advogadoId", String(data?.advogado?.id || ""));
          localStorage.setItem("advogadoEmail", data?.advogado?.email || "");
          localStorage.setItem("advogadoNome", data?.advogado?.nome || "");
          // Bearer reutilizado para endpoints públicos (ex.: salvar número do processo)
          localStorage.setItem("advogadoBearer", data?.bearer || "");
        }

        // Preserva qualquer query extra (ex.: reload)
        const extra = qs?.toString();
        const suffix = extra ? `&${extra}` : "";

        // Redireciona para a tela principal no modo advogado
        router.replace(`/?extratoId=${encodeURIComponent(extratoId)}&mode=adv${suffix}`);
      } catch {
        setErro("Erro inesperado ao validar o link.");
      }
    })();
  }, [extratoId, token, router, qs]);

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold">Não foi possível abrir este link</h1>
          <p className="text-sm text-gray-500 mt-2">{erro}</p>
          <p className="text-xs text-gray-400 mt-3">Peça um novo link ao gerente, por favor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center text-sm text-gray-500">Validando acesso do advogado…</div>
    </div>
  );
}

export default function AdvOpenPage() {
  return (
    <Suspense fallback={null}>
      <AdvOpenPageContent />
    </Suspense>
  );
}
