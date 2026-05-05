"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function GerenciarButton() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    // Lê o perfil salvo no login
    const p = (localStorage.getItem("perfil") || "").toLowerCase();
    setVisivel(p === "admin" || p === "gerente");
  }, []);

  if (!visivel) return null;

  return (
    <Link
      href="/gerencial/processos"
      className="inline-flex items-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      aria-label="Ir para o painel gerencial de processos"
    >
      Gerenciar processos
    </Link>
  );
}
