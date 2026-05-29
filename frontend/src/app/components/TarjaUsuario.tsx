"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { logoutCurrentSession } from "@/app/lib/sessionPresence";

function read(k: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(k) || sessionStorage.getItem(k);
  } catch { return null; }
}

export default function TarjaUsuario() {
  const [nome, setNome] = useState<string>("");
  const [perfil, setPerfil] = useState<string>("");
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  useEffect(() => {
    const nomeAdv = read("nomeAdvogado") || "";
    const oab = read("oabAdvogado") || "";
    const nomeUser = read("nomeUsuario") || "";
    const nomeExib = nomeAdv || nomeUser || "";
    const perfilRaw = (read("perfil") || read("perfilUsuario") || "").toLowerCase();
    const uid = parseInt(read("usuarioId") || "0", 10) || null;
    setNome(nomeExib || "Usuário");
    setPerfil(perfilRaw || "usuario");
    setUsuarioId(uid);
  }, []);

  const isGerente = perfil === "gerente" || perfil === "admin";
  // Leonardo (ID 5) pode disparar o alerta para todos via URL
  const isLeonardo = usuarioId === 5;

  const sair = () => {
    logoutCurrentSession();
    window.location.href = "/login";
  };

  return (
    <div className="w-full border rounded-2xl px-3 py-2 bg-gray-50 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-200">👤</span>
        <div className="truncate font-semibold text-black">{nome}</div>
        {perfil && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-amber-700 border border-amber-300">
            {perfil.charAt(0).toUpperCase() + perfil.slice(1)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {isGerente && (
          <Link
            href="/gerencial/processos"
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            Gerenciar processos
          </Link>
        )}

        <button
          onClick={sair}
          className="px-3 py-1.5 rounded-lg bg-white text-red-600 text-sm font-semibold border border-red-200 hover:bg-red-50"
        >
          Sair
        </button>
      </div>

    </div>
  );
}
