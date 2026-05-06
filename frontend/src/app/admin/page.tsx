// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

const API_BASE = "/api";

interface Stats {
  totalUsuarios: number;
  totalAdvogados: number;
  ultimoUsuario?: string;
  ultimoAdvogado?: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalUsuarios: 0,
    totalAdvogados: 0,
  });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const carregarStats = async () => {
      setErro("");
      try {
        const [usuariosRes, advogadosRes] = await Promise.all([
          axios.get(`${API_BASE}/usuarios/`, { timeout: 15000 }),
          axios.get(`${API_BASE}/advogados/`, { timeout: 15000 }),
        ]);

        const usuarios = Array.isArray(usuariosRes.data) ? usuariosRes.data : [];
        const advogados = Array.isArray(advogadosRes.data) ? advogadosRes.data : [];

        setStats({
          totalUsuarios: usuarios.length,
          totalAdvogados: advogados.length,
          ultimoUsuario: usuarios[usuarios.length - 1]?.nome,
          ultimoAdvogado: advogados[advogados.length - 1]?.nome_completo,
        });
      } catch (err: any) {
        console.error("Erro ao carregar stats:", err);
        setErro(
          err?.response?.data?.detail ||
          err?.message ||
          "Erro ao carregar estatísticas"
        );
      } finally {
        setLoading(false);
      }
    };

    carregarStats();
  }, []);

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
        <p className="mt-2 text-gray-600">
          Gerencie usuários, advogados e configurações do sistema
        </p>
      </div>

      {/* Erro */}
      {erro && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          ⚠️ {erro}
        </div>
      )}

      {/* Grid de Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Card: Usuários */}
          <Link href="/admin/usuarios">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total de Usuários</p>
                  <p className="text-4xl font-bold text-blue-600 mt-2">
                    {stats.totalUsuarios}
                  </p>
                  {stats.ultimoUsuario && (
                    <p className="text-xs text-gray-500 mt-2">
                      Último: {stats.ultimoUsuario}
                    </p>
                  )}
                </div>
                <div className="text-4xl">👤</div>
              </div>
            </div>
          </Link>

          {/* Card: Advogados */}
          <Link href="/admin/advogados">
            <div className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer border-l-4 border-green-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm">Total de Advogados</p>
                  <p className="text-4xl font-bold text-green-600 mt-2">
                    {stats.totalAdvogados}
                  </p>
                  {stats.ultimoAdvogado && (
                    <p className="text-xs text-gray-500 mt-2">
                      Último: {stats.ultimoAdvogado}
                    </p>
                  )}
                </div>
                <div className="text-4xl">⚖️</div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Ações Rápidas */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/admin/usuarios">
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors">
              ➕ Novo Usuário
            </button>
          </Link>
          <Link href="/admin/advogados">
            <button className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors">
              ➕ Novo Advogado
            </button>
          </Link>
        </div>
      </div>

      {/* Info */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
        💡 <strong>Dica:</strong> Use o menu acima para acessar a gerência completa de usuários
        e advogados.
      </div>
    </div>
  );
}
