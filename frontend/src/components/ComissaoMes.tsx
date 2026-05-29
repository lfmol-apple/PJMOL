"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function mesAtual(): { ini: string; fim: string } {
  const now = new Date();
  const ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { ini, fim };
}

function lerAuth(): { uid: string; perfil: string; token: string } | null {
  if (typeof window === "undefined") return null;
  const read = (k: string) =>
    localStorage.getItem(k) || sessionStorage.getItem(k) || "";
  const uid =
    read("usuarioId") || read("userId") || read("id") || read("usuario_id");
  const perfil = (
    read("perfil") || read("perfilUsuario") || read("perfilOriginal") || read("role")
  ).toLowerCase().trim();
  const token =
    read("token") || read("access_token") || read("accessToken") || read("jwt") || read("authToken");
  if (!uid && !perfil) return null;
  return { uid, perfil, token };
}

type Resumo = {
  quantidade: number;
  valor_comissao_total: number;
  valor_acordo_total: number;
};

/** Pill compacto com a comissão do mês corrente do usuário logado. */
export default function ComissaoMes() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const auth = lerAuth();
    if (!auth) return;

    const { ini, fim } = mesAtual();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth.uid) headers["X-Usuario-Id"] = auth.uid;
    if (auth.perfil) headers["X-Perfil"] = auth.perfil;
    if (auth.token) {
      headers["Authorization"] = auth.token.startsWith("Bearer ")
        ? auth.token
        : `Bearer ${auth.token}`;
    }

    const params = new URLSearchParams({ data_inicial: ini, data_final: fim });

    fetch(`${API}/relatorios/producao/comissoes?${params}`, {
      headers,
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setResumo({
          quantidade: data.resumo?.quantidade ?? 0,
          valor_comissao_total: data.resumo?.valor_comissao_total ?? 0,
          valor_acordo_total: data.resumo?.valor_acordo_total ?? 0,
        });
        setOk(true);
      })
      .catch(() => {});
  }, []);

  if (!ok || !resumo) return null;

  const temComissao = resumo.valor_comissao_total > 0;

  return (
    <Link
      href="/gerencial/comissoes"
      title="Ver extrato de comissões"
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold transition hover:opacity-80 ${
        temComissao
          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span>💰</span>
      {temComissao ? (
        <>
          <span>{fmtBRL(resumo.valor_comissao_total)}</span>
          <span className="font-semibold opacity-50">comissão</span>
          {resumo.valor_acordo_total > 0 && (
            <>
              <span className="opacity-30">·</span>
              <span className="opacity-80">{fmtBRL(resumo.valor_acordo_total)}</span>
              <span className="font-semibold opacity-50">acordos ({resumo.quantidade})</span>
            </>
          )}
        </>
      ) : (
        <span>Sem comissão este mês</span>
      )}
    </Link>
  );
}
