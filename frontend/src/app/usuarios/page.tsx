// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";
import { useRouter } from "next/navigation";
import { getLoggedUser } from "@/app/lib/auth";

/** ===== Gate sem mudar ordem de hooks da página ===== */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    try {
      const u = getLoggedUser();
      const perfil = (u?.perfil || "").toLowerCase();
      if (perfil === "admin") setOk(true);
      else router.replace("/gerencial/processos");
    } catch {
      router.replace("/gerencial/processos");
    }
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}

type Tipo = "admin" | "usuario";

interface UsuarioUI {
  id: number;
  nome: string;
  email: string;
  telefone?: string;
  tipo: Tipo;
  criado_em?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");

export default function GerenciarUsuarios() {
  // 🔽 Hooks da página permanecem exatamente como já estavam
  const [usuarios, setUsuarios] = useState<UsuarioUI[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [erro, setErro] = useState<string>("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoDados, setEditandoDados] = useState<Partial<UsuarioUI>>({});
  const [senhaNova, setSenhaNova] = useState<string>(""); // ✅ NOVO

  const mapearUsuarios = (data: any[]): UsuarioUI[] =>
    (data || []).map((u: any) => ({
      id: u.id,
      nome: u.nome ?? "",
      email: u.email ?? "",
      telefone: u.telefone ?? "",
      tipo: (u.tipo as Tipo) ?? (u.is_admin === true ? "admin" : "usuario"),
      criado_em: u.criado_em,
    }));

  const carregarUsuarios = async () => {
    setErro("");
    setLoading(true);
    const url = `${API_BASE}/usuarios/`; // <- COM BARRA para bater na rota exata
    try {
      const { data } = await axios.get(url, { timeout: 15000 });
      if (!Array.isArray(data)) throw new Error("Resposta inesperada da API (esperado array).");
      setUsuarios(mapearUsuarios(data));
    } catch (e: any) {
      let extra = "";
      try { extra = JSON.stringify(e.toJSON ? e.toJSON() : {}, null, 2); } catch {}
      console.error("GET /usuarios ERROR →", {
        url,
        message: e?.message,
        code: e?.code,
        responseStatus: e?.response?.status,
        responseData: e?.response?.data,
        extra,
      });
      setErro(
        e?.response?.data?.detail
          ? `Erro: ${e.response.data.detail}`
          : e?.message || "Falha ao carregar usuários."
      );
    } finally {
      setLoading(false);
    }
  };

  const deletarUsuario = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    try {
      await axios.delete(`${API_BASE}/usuarios/id/${id}`);
      await carregarUsuarios();
    } catch (e: any) {
      console.error("DELETE usuario ERROR →", e?.response || e);
      alert(e?.response?.data?.detail || e?.message || "Falha ao excluir usuário.");
    }
  };

  const salvarEdicao = async (id: number) => {
    try {
      const fd = new FormData();
      if (editandoDados.nome !== undefined) fd.append("nome", (editandoDados.nome || "").trim());
      if (editandoDados.email !== undefined) fd.append("email", (editandoDados.email || "").trim().toLowerCase());
      if (editandoDados.telefone !== undefined)
        fd.append("telefone", (editandoDados.telefone || "").replace(/\D+/g, ""));
      // ✅ Envia senha só se preenchida
      if (senhaNova && senhaNova.trim()) fd.append("senha", senhaNova.trim());

      await axios.put(`${API_BASE}/usuarios/${id}`, fd);
      setEditandoId(null);
      setEditandoDados({});
      setSenhaNova(""); // ✅ limpa campo
      await carregarUsuarios();
    } catch (e: any) {
      console.error("PUT /usuarios/{id} ERROR →", e?.response || e);
      alert(e?.response?.data?.detail || e?.message || "Falha ao salvar alterações.");
    }
  };

  useEffect(() => {
    console.log("NEXT_PUBLIC_BACKEND_URL =", process.env.NEXT_PUBLIC_BACKEND_URL);
    carregarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminOnly>
      <div className="max-w-5xl mx-auto mt-10 p-6 bg-white shadow rounded">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Usuários Cadastrados</h2>
          <div className="flex gap-3">
            <a href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Home</a>
            <button onClick={() => window.history.back()} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">Voltar</button>
            <button onClick={carregarUsuarios} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded">Recarregar</button>
          </div>
        </div>

        {loading && <div className="text-gray-600">Carregando...</div>}

        {erro && !loading && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{erro}</div>
        )}

        {!loading && !erro && usuarios.length === 0 && (
          <div className="rounded border p-4 text-gray-600">Nenhum usuário cadastrado.</div>
        )}

        {!loading && !erro && usuarios.map((u) => {
          const emEdicao = editandoId === u.id;
          return (
            <div key={u.id} className="border p-4 rounded mb-4">
              {emEdicao ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={editandoDados.nome ?? u.nome}
                    onChange={(e) => setEditandoDados({ ...editandoDados, nome: e.target.value })}
                    className="border p-2 rounded"
                    placeholder="Nome"
                  />
                  <input
                    type="email"
                    value={editandoDados.email ?? u.email}
                    onChange={(e) => setEditandoDados({ ...editandoDados, email: e.target.value })}
                    className="border p-2 rounded lowercase"
                    placeholder="E-mail"
                  />
                  <PatternFormat
                    format="(##) #####-####"
                    mask="_"
                    value={editandoDados.telefone ?? u.telefone ?? ""}
                    onValueChange={(val) => setEditandoDados({ ...editandoDados, telefone: val.formattedValue })}
                    className="border p-2 rounded"
                    allowEmptyFormatting
                    placeholder="Telefone"
                  />
                  <input
                    type="text"
                    value={u.tipo === "admin" ? "administrador" : "usuario"}
                    readOnly
                    className="border p-2 rounded bg-gray-100 text-gray-600"
                  />

                  {/* ✅ Nova senha (opcional) */}
                  <div className="md:col-span-2">
                    <input
                      type="password"
                      value={senhaNova}
                      onChange={(e) => setSenhaNova(e.target.value)}
                      className="border p-2 rounded w-full"
                      placeholder="Nova senha (opcional)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Deixe em branco para manter a senha atual.
                    </p>
                  </div>

                  <div className="col-span-1 md:col-span-2 flex gap-3">
                    <button onClick={() => salvarEdicao(u.id)} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Salvar</button>
                    <button
                      onClick={() => { setEditandoId(null); setEditandoDados({}); setSenhaNova(""); }}
                      className="bg-gray-400 text-white px-4 py-2 rounded"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center flex-col md:flex-row gap-4">
                  <div className="text-center md:text-left">
                    <p className="font-bold text-lg">{u.nome || "-"}</p>
                    <p>Email: {u.email || "-"}</p>
                    <p>Telefone: {u.telefone || "-"}</p>
                    <p>Tipo: {u.tipo === "admin" ? "administrador" : "usuario"}</p>
                    {u.criado_em && (
                      <p className="text-gray-500 text-sm">Criado em: {String(u.criado_em).replace("T", " ").slice(0, 19)}</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEditandoId(u.id); setEditandoDados(u); setSenhaNova(""); }}
                      className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
                    >
                      Editar
                    </button>
                    <button onClick={() => deletarUsuario(u.id)} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">Excluir</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AdminOnly>
  );
}
