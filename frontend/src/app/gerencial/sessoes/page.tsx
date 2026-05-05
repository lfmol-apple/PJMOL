"use client";

import { useEffect, useState } from "react";
import { getLoggedUser } from "@/app/lib/auth";
import PushNotificationsControl from "@/components/PushNotificationsControl";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

interface Sessao {
  usuario_id: number;
  nome: string;
  perfil: string;
  data_referencia: string;
  login_at: string | null;
  last_seen_at: string | null;
  logout_at: string | null;
  online: boolean;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function MonitorSessoesPage() {
  const [dados, setDados] = useState<Sessao[]>([]);
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const user = getLoggedUser();
    const uid = Number(user.id);
    if (!Number.isFinite(uid) || uid <= 0) {
      setErro("Sessão não identificada. Faça login novamente.");
      return;
    }

    const perfil = String(user.perfil || localStorage.getItem("perfil") || localStorage.getItem("perfilUsuario") || "").toLowerCase();

    const fetchData = () => {
      fetch(`${API_BASE}/sessoes/status`, {
        headers: {
          "X-Usuario-Id": String(uid),
          ...(perfil ? { "X-Perfil": perfil } : {}),
        },
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) {
            const txt = await res.text();
            if (res.status === 403) {
              throw new Error("Acesso restrito. Apenas administradores autorizados podem ver este painel.");
            }
            throw new Error(txt || `HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((json: Sessao[]) => {
          setDados(json);
          setErro("");
        })
        .catch((e) => {
          console.error("Erro ao buscar sessões:", e);
          setErro("Não foi possível carregar as sessões.");
        });
    };

    fetchData();
    const id = window.setInterval(fetchData, 5_000);
    return () => window.clearInterval(id);
  }, []);

  if (erro && !dados.length) {
    return (
      <div className="p-6 text-sm text-red-600">{erro}</div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold mb-2">Monitor de Sessões (Hoje)</h1>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <PushNotificationsControl />
          <a
            href="/gerencial/processos"
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Voltar para Processos
          </a>
        </div>
      </div>
      {erro && <p className="text-xs text-red-500">{erro}</p>}
      <div className="overflow-x-auto border rounded-lg bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="px-3 py-2 text-left">Usuário</th>
              <th className="px-3 py-2 text-left">Perfil</th>
              <th className="px-3 py-2 text-left">Login</th>
              <th className="px-3 py-2 text-left">Última Atividade</th>
              <th className="px-3 py-2 text-left">Saída</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {dados.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-center text-slate-500" colSpan={6}>
                  Nenhuma sessão registrada hoje ainda.
                </td>
              </tr>
            )}
            {dados.map((s) => (
              <tr key={s.usuario_id} className="border-t text-slate-700">
                <td className="px-3 py-1.5 font-medium">{s.nome}</td>
                <td className="px-3 py-1.5 capitalize">{s.perfil}</td>
                <td className="px-3 py-1.5">{fmt(s.login_at)}</td>
                <td className="px-3 py-1.5">{fmt(s.last_seen_at)}</td>
                <td className="px-3 py-1.5">{fmt(s.logout_at)}</td>
                <td className="px-3 py-1.5">
                  {s.online ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">
                      <span className="h-2 w-2 rounded-full bg-green-500" /> Online
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      <span className="h-2 w-2 rounded-full bg-slate-400" /> Offline
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
