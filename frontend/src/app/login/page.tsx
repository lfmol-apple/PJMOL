"use client";

import React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutCurrentSession } from "@/app/lib/sessionPresence";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function Page() {
  const [usuario, setUsuario] = useState(""); // e-mail, usuário ou nome
  const [senha, setSenha] = useState("");    // senha
  const [erro, setErro] = useState("");      // mensagem de erro
  const router = useRouter();


  function normalizaPerfil(valor?: string): string {
    const v = String(valor || "").trim().toLowerCase();
    if (["adm", "administrador", "admin"].includes(v)) return "admin";
    if (["gerente", "manager"].includes(v)) return "gerente";
    if (["adv", "advogado"].includes(v)) return "advogado";
    if (["user", "usuario"].includes(v)) return "usuario";
    return v || "usuario";
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    const endpoint = `${API_BASE}/login/`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: usuario.trim(), senha }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({} as any));
        const detail = (errData && (errData.detail || errData.message)) || "Usuário não encontrado ou senha inválida.";
        throw new Error(detail);
      }

      const data = await res.json();

      // 🔄 Encerra a sessão anterior antes de trocar de usuário
      if (typeof window !== "undefined") logoutCurrentSession();

      // 🔎 Determina o perfil
      const rawPerfil = String(
        (data?.perfil || (data?.tipo === "admin" ? "admin" : data?.tipo) || "usuario")
      ).toLowerCase();
      const nome = (data?.nome || data?.usuario || data?.email || "").trim();
      const nomeLower = nome.toLowerCase();

      // Regra fixa: Breno e Marcel são GERENTES (mesmo que venham como "usuario")
      let perfil = normalizaPerfil(rawPerfil);
      if (perfil !== "advogado" && (nomeLower.includes("breno") || nomeLower.includes("marcel"))) {
        perfil = "gerente";
      }

      // 🚫 Gate: apenas GERENTE e ADMIN podem acessar pelo login
      const autorizado = perfil === "gerente" || perfil === "admin";
      if (!autorizado) {
        setErro("Acesso restrito: somente Gerentes e Administradores podem entrar nesta área.");
        return;
      }

      // Rótulo para o crachá (não rebaixa admin para gerente)
      const perfilOriginal = perfil;
      const rotulo = perfil === "admin" ? "Administrador" : "Gerente";

      // 🔐 Persiste sessão + registra login na API de sessões
      if (typeof window !== "undefined") {
        localStorage.setItem("usuarioId", String(data.id ?? ""));
        localStorage.setItem("nomeUsuario", data?.nome || "");
        localStorage.setItem("emailUsuario", data?.email || "");

        // chaves globais usadas no app
        localStorage.setItem("perfilUsuario", perfil);
        localStorage.setItem("usuarioLogado", "true");
        localStorage.setItem("dominio", "usuario"); // domínio lógico: usuarios
        localStorage.setItem("perfilOriginal", perfilOriginal);
        localStorage.setItem("perfil", perfil);
        localStorage.setItem("rotulo", rotulo);
        localStorage.setItem("nome", nome);

        // cookies úteis (SSR/middleware)
        // ⚠️ Se vier token do backend, guarda também
        const token = (data?.token || "").toString();
        const cookieOpts = "Path=/; SameSite=Lax";
        document.cookie = `perfilUsuario=${encodeURIComponent(perfil)}; ${cookieOpts}`;
        if (token) {
          document.cookie = `token=${encodeURIComponent(token)}; ${cookieOpts}`;
        }

        // Registra login na API de sessões (best effort)
        const uid = Number(data.id || 0);
        if (uid > 0) {
          fetch(`${API_BASE}/sessoes/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Usuario-Id": String(uid), "X-Perfil": perfil },
            body: JSON.stringify({ usuario_id: uid, nome, perfil }),
          }).catch(() => {});
        }
      }

      // redirect (→ gerencial)
      router.push("/gerencial/processos");
    } catch (err: any) {
      console.error("Login error:", err);
      setErro(err?.message || "Usuário não encontrado ou senha inválida.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-black via-gray-900 to-gray-800 px-4 text-white">
      {/* Título */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">
          PJMOL
        </h1>
        <p className="text-md md:text-lg mt-2">
          Programa Gerador de Ações Judiciais para Consórcios
        </p>
      </div>

      {/* Formulário de Login (sem opção de tipo — advogados não logam aqui) */}
      <div className="bg-white bg-opacity-10 backdrop-blur-md p-8 rounded-lg shadow-lg w-full max-w-sm">
        <h2 className="text-xl font-semibold mb-6 text-center text-black">
          🔒 Login
        </h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            placeholder="Usuário (e-mail ou nome)"
            className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white bg-opacity-90 text-black placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Senha"
            className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white bg-opacity-90 text-black placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />

          {erro && <p className="text-red-400 text-sm">{erro}</p>}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition"
          >
            Entrar
          </button>
        </form>

        <p className="text-sm mt-4 text-center text-black">
          Não tem conta?{" "}
          <a href="/criar-usuario" className="text-blue-400 hover:underline">
            Criar usuário
          </a>
        </p>

        <div className="text-xs text-gray-300 mt-4 text-center">
          Acesso exclusivo para <strong>Gerentes</strong> e <strong>Administradores</strong> (usuários).
        </div>
      </div>
    </div>
  );
}
