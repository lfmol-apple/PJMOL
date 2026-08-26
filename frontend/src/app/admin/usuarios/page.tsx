// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";

const API_BASE = "/api";

type Perfil = "admin" | "gerente" | "usuario";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  telefone?: string;
  perfil: Perfil;
  is_admin?: boolean;
  criado_em?: string;
}

const PERFIL_PRIORITY: Record<Perfil, number> = {
  admin: 0,
  gerente: 1,
  usuario: 2,
};

function normalizePerfil(user: Partial<Usuario>): Perfil {
  const perfil = String(user.perfil || "").trim().toLowerCase();
  if (perfil === "admin" || perfil === "gerente" || perfil === "usuario") {
    return perfil as Perfil;
  }
  return user.is_admin ? "admin" : "usuario";
}

function sortUsuarios(items: Usuario[]): Usuario[] {
  return [...items].sort((a, b) => {
    const perfilDiff = PERFIL_PRIORITY[normalizePerfil(a)] - PERFIL_PRIORITY[normalizePerfil(b)];
    if (perfilDiff !== 0) return perfilDiff;
    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });
}

export default function AdminUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  
  // Form de criação
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    email: "",
    telefone: "",
    senha: "",
    perfil: "gerente" as Perfil,
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formErro, setFormErro] = useState("");

  // Edição
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoDados, setEditandoDados] = useState<Partial<Usuario>>({});

  // Carregar usuários
  const carregarUsuarios = async () => {
    setErro("");
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/usuarios/`, { timeout: 15000 });
      setUsuarios(sortUsuarios(Array.isArray(data) ? data : []));
    } catch (err: any) {
      console.error("Erro ao carregar usuários:", err);
      setErro(
        err?.response?.data?.detail || err?.message || "Falha ao carregar usuários"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarUsuarios();
  }, []);

  // Criar novo usuário
  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro("");
    setFormLoading(true);

    try {
      const payload = {
        nome: formData.nome.trim(),
        email: formData.email.trim().toLowerCase(),
        telefone: formData.telefone,
        senha: formData.senha,
        perfil: formData.perfil,
      };

      await axios.post(`${API_BASE}/usuarios/`, payload);
      
      setSucesso(`✅ Usuário "${payload.nome}" criado com sucesso!`);
      setFormData({
        nome: "",
        email: "",
        telefone: "",
        senha: "",
        perfil: "gerente",
      });
      setShowForm(false);

      // Recarregar lista
      setTimeout(() => {
        carregarUsuarios();
        setSucesso("");
      }, 2000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || "Erro ao criar usuário";
      setFormErro(msg);
    } finally {
      setFormLoading(false);
    }
  };

  // Deletar usuário
  const handleDeletarUsuario = async (id: number, nome: string) => {
    if (!confirm(`Deseja realmente deletar o usuário "${nome}"?`)) return;

    try {
      await axios.delete(`${API_BASE}/usuarios/id/${id}`);
      setSucesso(`✅ Usuário "${nome}" deletado com sucesso!`);
      carregarUsuarios();
      setTimeout(() => setSucesso(""), 3000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || "Erro ao deletar usuário";
      setErro(msg);
    }
  };

  // Atualizar usuário
  const handleAtualizar = async (id: number) => {
    if (!editandoDados.perfil) {
      setErro("Selecione um perfil");
      return;
    }

    try {
      const payload = {
        nome: editandoDados.nome,
        email: editandoDados.email,
        telefone: editandoDados.telefone,
        perfil: editandoDados.perfil,
      };

      await axios.put(`${API_BASE}/usuarios/${id}`, payload);
      setSucesso("✅ Usuário atualizado com sucesso!");
      setEditandoId(null);
      carregarUsuarios();
      setTimeout(() => setSucesso(""), 3000);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || err?.message || "Erro ao atualizar";
      setErro(msg);
    }
  };

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Usuários</h1>
          <p className="text-gray-600 mt-1">
            Crie, edite ou delete usuários administradores e gerentes com o mesmo padrão dos perfis já existentes
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          {showForm ? "❌ Fechar" : "➕ Novo Usuário"}
        </button>
      </div>

      {/* Mensagens */}
      {sucesso && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {sucesso}
        </div>
      )}
      {erro && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          ⚠️ {erro}
        </div>
      )}

      {/* Formulário de Criação */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-blue-500">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">
            Criar Novo Usuário
          </h2>
          <form onSubmit={handleCriarUsuario} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: João Silva"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex@email.com"
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone
                </label>
                <PatternFormat
                  format="+55 (##) #####-####"
                  mask="_"
                  value={formData.telefone}
                  onValueChange={(values) =>
                    setFormData({ ...formData, telefone: values.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Perfil */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Perfil *
                </label>
                <select
                  required
                  value={formData.perfil}
                  onChange={(e) =>
                    setFormData({ ...formData, perfil: e.target.value as Perfil })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin">Administrador</option>
                  <option value="gerente">Gerente</option>
                </select>
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senha *
              </label>
              <input
                type="password"
                required
                value={formData.senha}
                onChange={(e) =>
                  setFormData({ ...formData, senha: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            {/* Erro do form */}
            {formErro && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                ⚠️ {formErro}
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 pt-4">
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {formLoading ? "Criando..." : "✅ Criar Usuário"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded transition-colors"
              >
                ❌ Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : usuarios.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              <p>Nenhum usuário encontrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Nome
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Perfil
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {editandoId === user.id ? (
                        <input
                          type="text"
                          value={editandoDados.nome || ""}
                          onChange={(e) =>
                            setEditandoDados({
                              ...editandoDados,
                              nome: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        user.nome
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {editandoId === user.id ? (
                        <input
                          type="email"
                          value={editandoDados.email || ""}
                          onChange={(e) =>
                            setEditandoDados({
                              ...editandoDados,
                              email: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      ) : (
                        user.email
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editandoId === user.id ? (
                        <select
                          value={editandoDados.perfil || "usuario"}
                          onChange={(e) =>
                            setEditandoDados({
                              ...editandoDados,
                              perfil: e.target.value as Perfil,
                            })
                          }
                          className="px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="admin">Administrador</option>
                          <option value="gerente">Gerente</option>
                        </select>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            user.perfil === "admin"
                              ? "bg-red-100 text-red-800"
                              : user.perfil === "gerente"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {user.perfil === "admin"
                            ? "👤 Admin"
                            : user.perfil === "gerente"
                            ? "👥 Gerente"
                            : "👤 Usuário"}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {editandoId === user.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAtualizar(user.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs"
                          >
                            ✅ Salvar
                          </button>
                          <button
                            onClick={() => setEditandoId(null)}
                            className="bg-gray-400 hover:bg-gray-500 text-white px-3 py-1 rounded text-xs"
                          >
                            ❌ Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditandoId(user.id);
                              setEditandoDados(user);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleDeletarUsuario(user.id, user.nome)}
                            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
                          >
                            🗑️ Deletar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
