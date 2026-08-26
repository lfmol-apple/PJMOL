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

interface Advogado {
  id: number;
  nome_completo: string;
  email: string;
  telefone: string;
  usuario: string;
  oab: string;
  api_key_zapsign?: string;
}

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");
const DEFAULT_API_KEY_ZAPSIGN = "e96e4e97-94c7-4fd6-b969-efb796f1cd52d24bb740-4a4f-4465-8c9f-656365b70ce5";

// ---------- helpers ----------
const normalizarTelefone = (t?: string) => (t ? t.replace(/\D+/g, "") : "");

// Constrói SEMPRE no padrão "AA 000.000" (letras maiúsculas + até 6 dígitos)
const buildOAB = (raw: string) => {
  const letters = (raw.match(/[A-Za-z]/g) || []).join("").toUpperCase().slice(0, 2);
  const digits  = (raw.match(/\d/g) || []).join("").slice(0, 6);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  let out = letters; // já MAIÚSCULAS
  if (p1) out += (out ? " " : "") + p1;
  if (p2) out += "." + p2;
  return out;
};

export default function GerenciarAdvogados() {
  const [advogados, setAdvogados] = useState<Advogado[]>([]);
  const [erro, setErro] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoDados, setEditandoDados] = useState<Partial<Advogado & { senha?: string }>>({});
  const [salvando, setSalvando] = useState<boolean>(false);

  const carregarAdvogados = async () => {
    setErro("");
    setLoading(true);
    try {
      // GET /advogados/
      const { data } = await axios.get(`${API_BASE}/advogados/`, { timeout: 15000 });
      setAdvogados(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErro(e?.response?.data?.detail || e?.message || "Falha ao carregar advogados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAdvogados();
  }, []);

  const deletarAdvogado = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este advogado?")) return;
    try {
      // DELETE /advogados/id/{id}
      await axios.delete(`${API_BASE}/advogados/id/${id}`);
      await carregarAdvogados();
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || "Falha ao excluir advogado.");
    }
  };

  const salvarEdicao = async (id: number) => {
    setSalvando(true);
    try {
      // PUT /advogados/{id}
      const payload: any = {
        nome_completo: (editandoDados.nome_completo ?? "").toString().trim(),
        email: (editandoDados.email ?? "").toString().trim().toLowerCase(),
        telefone: normalizarTelefone(editandoDados.telefone as string),
        usuario: (editandoDados.usuario ?? "").toString().trim().toLowerCase(),
        oab: buildOAB(editandoDados.oab as string), // garante padrão "AA 000.000"
        api_key_zapsign: DEFAULT_API_KEY_ZAPSIGN,
      };
      if ((editandoDados as any).senha && String((editandoDados as any).senha).trim() !== "") {
        payload.senha = String((editandoDados as any).senha).trim();
      }

      await axios.put(`${API_BASE}/advogados/${id}`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      setEditandoId(null);
      setEditandoDados({});
      await carregarAdvogados();
    } catch (e: any) {
      alert(e?.response?.data?.detail || e?.message || "Falha ao salvar alterações.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <AdminOnly>
      <div className="max-w-4xl mx-auto mt-10 p-6 bg-white shadow rounded">
        <div className="flex justify-end gap-4 mb-6">
          <a href="/" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded">
            Home
          </a>
          <button
            onClick={() => window.history.back()}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded"
          >
            Voltar
          </button>
        </div>

        <h2 className="text-2xl font-bold mb-4 text-gray-800">Advogados Cadastrados</h2>

        {loading && <div className="text-gray-600">Carregando...</div>}
        {erro && !loading && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{erro}</div>
        )}

        {!loading && !erro && advogados.length === 0 && (
          <div className="rounded border p-4 text-gray-600">Nenhum advogado cadastrado.</div>
        )}

        {!loading &&
          !erro &&
          advogados.map((a) => {
            const emEdicao = editandoId === a.id;
            return (
              <div key={a.id} className="border p-4 rounded mb-4">
                {emEdicao ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={(editandoDados.nome_completo ?? a.nome_completo) as string}
                      onChange={(e) => setEditandoDados({ ...editandoDados, nome_completo: e.target.value.toUpperCase() })}
                      className="border p-2 rounded uppercase"
                      placeholder="Nome completo"
                    />
                    <input
                      type="email"
                      value={(editandoDados.email ?? a.email) as string}
                      onChange={(e) => setEditandoDados({ ...editandoDados, email: e.target.value.toLowerCase() })}
                      className="border p-2 rounded lowercase"
                      placeholder="E-mail"
                    />

                    <PatternFormat
                      format="(##) #####-####"
                      mask="_"
                      value={(editandoDados.telefone ?? a.telefone) as string}
                      onValueChange={(val) => setEditandoDados({ ...editandoDados, telefone: val.formattedValue })}
                      className="border p-2 rounded"
                      allowEmptyFormatting
                      placeholder="Telefone"
                    />

                    <input
                      type="text"
                      value={(editandoDados.usuario ?? a.usuario) as string}
                      onChange={(e) => setEditandoDados({ ...editandoDados, usuario: e.target.value.toLowerCase() })}
                      className="border p-2 rounded lowercase"
                      placeholder="Usuário (login)"
                    />

                    {/* OAB com letras livres (sempre MAIÚSCULAS) + 6 dígitos => "AA 000.000" */}
                    <input
                      type="text"
                      value={(editandoDados.oab ?? buildOAB(a.oab)) as string}
                      onChange={(e) =>
                        setEditandoDados({
                          ...editandoDados,
                          oab: buildOAB(e.target.value), // formata enquanto digita
                        })
                      }
                      className="border p-2 rounded uppercase"
                      placeholder="OAB (ex.: MG 123.456)"
                      inputMode="text"
                    />

                    <input
                      type="text"
                      value={DEFAULT_API_KEY_ZAPSIGN}
                      readOnly
                      className="border p-2 rounded bg-gray-50 text-gray-600 font-mono text-xs"
                    />

                    <input
                      type="password"
                      value={(editandoDados as any).senha ?? ""}
                      onChange={(e) => setEditandoDados({ ...editandoDados, senha: e.target.value })}
                      className="border p-2 rounded"
                      placeholder="Nova senha (opcional)"
                    />

                    <div className="col-span-1 md:col-span-2 flex gap-3">
                      <button
                        onClick={() => salvarEdicao(a.id)}
                        disabled={salvando}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
                      >
                        {salvando ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        onClick={() => {
                          setEditandoId(null);
                          setEditandoDados({});
                        }}
                        className="bg-gray-400 text-white px-4 py-2 rounded"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-lg">{a.nome_completo}</p>
                      <p>Email: {a.email}</p>
                      <p>Telefone: {a.telefone}</p>
                      <p>Usuário: {a.usuario}</p>
                      <p>OAB: {buildOAB(a.oab)}</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setEditandoId(a.id);
                          setEditandoDados({ ...a, oab: buildOAB(a.oab) });
                        }}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => deletarAdvogado(a.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                      >
                        Excluir
                      </button>
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
