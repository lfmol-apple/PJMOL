// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";
import { useRouter } from "next/navigation";
import { getLoggedUser } from "@/app/lib/auth";

type Perfil = "advogado" | "usuario" | "gerente" | "admin";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");

// ===== Guard: somente ADMIN pode acessar esta página =====
function useAdminGate() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    try {
      const u = getLoggedUser();
      const perfil = (u?.perfil || "").toLowerCase();
      if (perfil !== "admin") {
        router.replace("/gerencial/processos");
      } else {
        setAllowed(true);
      }
    } catch {
      router.replace("/gerencial/processos");
    }
  }, [router]);

  return allowed;
}

// Helpers
const soDigitos = (s: string) => s.replace(/\D+/g, "");

// Constrói SEMPRE no padrão "AA 000.000" (2 letras maiúsculas + até 6 dígitos)
const buildOAB = (raw: string) => {
  const letters = (raw.match(/[A-Za-z]/g) || []).join("").toUpperCase().slice(0, 2);
  const digits  = (raw.match(/\d/g) || []).join("").slice(0, 6);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  let out = letters;
  if (p1) out += (out ? " " : "") + p1;
  if (p2) out += "." + p2;
  return out;
};

export default function CadastroPessoa() {
  // 1) Roda o guard (hook)
  const allowed = useAdminGate();

  // 2) Declare TODOS os demais hooks ANTES de qualquer return condicional
  // perfil
  const [perfil, setPerfil] = useState<Perfil>("advogado");

  // campos comuns
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");

  // campos de usuário/advogado
  const [senha, setSenha] = useState("");

  // campos de advogado
  const [oab, setOab] = useState("");
  const [usuario, setUsuario] = useState("");
  const [apiKeyZapsign, setApiKeyZapsign] = useState("");
  const [contrato, setContrato] = useState<File | null>(null);
  const [procuracao, setProcuracao] = useState<File | null>(null);

  // ui
  const [msg, setMsg] = useState("");   // sucesso → verde
  const [erro, setErro] = useState(""); // erro    → vermelho
  const [loading, setLoading] = useState(false);

  // 3) Só agora podemos interromper a renderização se não estiver allowed
  if (!allowed) return null;

  const limpar = () => {
    setNome(""); setEmail(""); setTelefone("");
    setSenha("");
    setOab(""); setUsuario(""); setApiKeyZapsign("");
    setContrato(null); setProcuracao(null);
  };

  const onTrocarPerfil = (p: Perfil) => {
    setPerfil(p);
    setMsg(""); setErro("");
    if (p !== "advogado") {
      setOab("");
      setUsuario("");
      setApiKeyZapsign("");
      setContrato(null);
      setProcuracao(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErro("");
    setLoading(true);

    try {
      if (perfil === "advogado") {
        // === CADASTRO DE ADVOGADO (multipart) ===
        const fd = new FormData();
        fd.append("nome_completo", nome.trim().toUpperCase());
        fd.append("oab", buildOAB(oab)); // garante "AA 000.000"
        fd.append("email", email.trim().toLowerCase());
        fd.append("telefone", soDigitos(telefone));
        fd.append("usuario", usuario.trim().toLowerCase());
        fd.append("senha", senha);
        fd.append("api_key_zapsign", apiKeyZapsign.trim());
        if (contrato) fd.append("contrato", contrato);
        if (procuracao) fd.append("procuracao", procuracao);

        const { data } = await axios.post(`${API_BASE}/advogados/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        setMsg(data?.mensagem || "Advogado cadastrado com sucesso!");
        limpar();
      } else {
        // === CADASTRO DE USUÁRIO/GERENTE/ADMIN (JSON) ===
        const payload = {
          perfil, // agora pode ser "usuario" | "gerente" | "admin"
          nome: nome.trim().toUpperCase(),
          email: email.trim().toLowerCase(),
          telefone: soDigitos(telefone),
          senha,
        };

        const { data } = await axios.post(`${API_BASE}/usuarios/`, payload, {
          headers: { "Content-Type": "application/json" },
        });

        const who =
          perfil === "admin" ? "Administrador" :
          perfil === "gerente" ? "Gerente" : "Usuário";
        setMsg(data?.mensagem || `${who} cadastrado com sucesso!`);
        limpar();
      }
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        console.error("AXIOS ERROR:", {
          url: err.config?.url,
          method: err.config?.method,
          status: err.response?.status,
          data: err.response?.data,
          message: err.message,
        });
        const detail =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          "Erro desconhecido";
        setErro(`${err.response?.status ?? ""} ${detail}`);
      } else {
        console.error(err);
        setErro(String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const ehAdvogado = perfil === "advogado";

  return (
    <div
      className={`min-h-screen p-6 transition-all ${
        msg ? "bg-green-100" : erro ? "bg-red-100" : "bg-gray-50"
      }`}
    >
      <div className="max-w-3xl mx-auto bg-white rounded shadow-md border border-gray-200 p-6">
        <div className="flex justify-end gap-4 mb-4">
          <a href="/" className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded transition">
            Home
          </a>
          <a href="/usuarios" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded transition">
            Ver Usuários
          </a>
          <a href="/advogados" className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded transition">
            Ver Advogados
          </a>
        </div>

        <h1 className="text-3xl font-bold mb-6 text-center text-gray-800">
          Cadastro
        </h1>

        {/* Banners */}
        {msg && (
          <div className="mb-4 text-center font-semibold px-4 py-2 rounded border border-green-200 bg-green-50 text-green-700">
            {msg}
          </div>
        )}
        {erro && (
          <div className="mb-4 text-center font-semibold px-4 py-2 rounded border border-red-200 bg-red-50 text-red-700">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Perfil */}
          <div className="md:col-span-2">
            <label className="block font-semibold text-gray-700">Perfil:</label>
            <select
              value={perfil}
              onChange={(e) => onTrocarPerfil(e.target.value as Perfil)}
              className="border rounded p-2 w-full"
            >
              <option value="advogado">Advogado</option>
              <option value="usuario">Usuário</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          {/* Nome / Email */}
          <div>
            <label className="block font-semibold text-gray-700">Nome:</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value.toUpperCase())}
              className="border rounded p-2 w-full uppercase"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700">E-mail:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              className="border rounded p-2 w-full lowercase"
              required
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="block font-semibold text-gray-700">Telefone:</label>
            <PatternFormat
              format="(##) #####-####"
              mask="_"
              value={telefone}
              onValueChange={(val) => setTelefone(val.formattedValue)}
              className="border rounded p-2 w-full"
              allowEmptyFormatting
            />
          </div>

          {/* Senha */}
          <div>
            <label className="block font-semibold text-gray-700">Senha:</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="border rounded p-2 w-full"
              required
            />
          </div>

          {/* Campos específicos de advogado */}
          {ehAdvogado && (
            <>
              <div>
                <label className="block font-semibold text-gray-700">OAB:</label>
                <input
                  type="text"
                  value={oab}
                  onChange={(e) => setOab(buildOAB(e.target.value))}
                  placeholder="MG 123.456"
                  className="border rounded p-2 w-full uppercase"
                  required={ehAdvogado}
                  inputMode="text"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700">Usuário (login):</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value.toLowerCase())}
                  className="border rounded p-2 w-full lowercase"
                  required={ehAdvogado}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block font-semibold text-gray-700">API Key ZapSign:</label>
                <input
                  type="text"
                  value={apiKeyZapsign}
                  onChange={(e) => setApiKeyZapsign(e.target.value)}
                  className="border rounded p-2 w-full"
                  required={ehAdvogado}
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700">Modelo de Contrato (DOCX):</label>
                <label className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 cursor-pointer border border-blue-300 px-4 py-2 rounded text-blue-800">
                  📎 Escolher Arquivo
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setContrato(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {contrato && <p className="text-sm text-gray-600 mt-1">{contrato.name}</p>}
              </div>

              <div>
                <label className="block font-semibold text-gray-700">Modelo de Procuração (DOCX):</label>
                <label className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 cursor-pointer border border-blue-300 px-4 py-2 rounded text-blue-800">
                  📎 Escolher Arquivo
                  <input
                    type="file"
                    accept=".docx"
                    onChange={(e) => setProcuracao(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {procuracao && <p className="text-sm text-gray-600 mt-1">{procuracao.name}</p>}
              </div>
            </>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full text-white font-semibold py-3 rounded transition duration-200 ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {loading
                ? (perfil === "advogado" ? "Enviando (Advogado)..." : "Enviando (Usuário/Gerente/Admin)...")
                : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
