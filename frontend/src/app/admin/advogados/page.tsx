// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";

const API_BASE = "/api";

// Padrão do escritório (Jaider) — aplicado automaticamente em todos os novos advogados
const DEFAULT_API_KEY_ZAPSIGN = "3fb8d0b6-cb8a-4362-87b1-93ee51c9e5079c159f10-2047-49ed-a459-e978082f9108";
const DEFAULT_WEBHOOK_PATH_TOKEN = "5145ee69d9202235aeaeb29b2f7bd6a1";

interface Advogado {
  id: number;
  nome_completo: string;
  usuario: string;
  oab: string;
  email: string;
  telefone: string;
  api_key_zapsign: string;
  ativo?: boolean;
}

interface FormData {
  nome_completo: string;
  usuario: string;
  oab: string;
  email: string;
  telefone: string;
  senha: string;
  genero: string;
}

const FORM_VAZIO: FormData = {
  nome_completo: "",
  usuario: "",
  oab: "",
  email: "",
  telefone: "",
  senha: "",
  genero: "M",
};

function slugifyPrimeiroNome(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function formatOAB(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const uf = clean.slice(0, 2).replace(/[^A-Z]/g, '');
  const num = clean.slice(2).replace(/[^0-9]/g, '').slice(0, 6);
  if (!uf) return '';
  if (!num) return uf;
  // Dot separates last 3 digits from the rest (like MG 96.343 or MG 196.986)
  const formatted = num.length > 3
    ? num.slice(0, num.length - 3) + '.' + num.slice(num.length - 3)
    : num;
  return `${uf} ${formatted}`;
}

function formatarTelefone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw || "—";
}

export default function AdminAdvogados() {
  const [advogados, setAdvogados] = useState<Advogado[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(FORM_VAZIO);
  const [usuarioManual, setUsuarioManual] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formErro, setFormErro] = useState("");

  const carregarAdvogados = async () => {
    setErro("");
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/advogados/`, { timeout: 15000 });
      setAdvogados(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErro(err?.response?.data?.detail || err?.message || "Falha ao carregar advogados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregarAdvogados(); }, []);

  const fecharForm = () => {
    setShowForm(false);
    setForm(FORM_VAZIO);
    setUsuarioManual(false);
    setFormErro("");
  };

  // Ao digitar nome, auto-preenche usuario com primeiro nome (se não foi editado manualmente)
  const handleNomeChange = (valor: string) => {
    const upper = valor.toUpperCase();
    setForm(prev => ({
      ...prev,
      nome_completo: upper,
      usuario: usuarioManual ? prev.usuario : slugifyPrimeiroNome(valor),
    }));
  };

  const handleCriarAdvogado = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro("");
    setFormLoading(true);

    try {
      const payload = {
        nome_completo: form.nome_completo.trim(),
        usuario: form.usuario.trim().toLowerCase(),
        oab: form.oab.trim().toUpperCase(),
        email: form.email.trim().toLowerCase(),
        telefone: form.telefone,
        senha: form.senha,
        api_key_zapsign: DEFAULT_API_KEY_ZAPSIGN,
        webhook_path_token: DEFAULT_WEBHOOK_PATH_TOKEN,
        genero: form.genero,
      };

      if (!payload.nome_completo || !payload.usuario || !payload.oab || !payload.email || !payload.senha) {
        setFormErro("Preencha todos os campos obrigatórios");
        return;
      }

      const response = await axios.post(`${API_BASE}/advogados/com-template/`, payload);

      setSucesso(`✅ Advogado "${response.data.nome_completo}" cadastrado com sucesso!`);
      fecharForm();
      setTimeout(() => { carregarAdvogados(); setSucesso(""); }, 2500);
    } catch (err: any) {
      setFormErro(err?.response?.data?.detail || err?.message || "Erro ao criar advogado");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeletar = async (id: number, nome: string) => {
    if (!confirm(`Deseja realmente deletar "${nome}"?\n\n⚠️ Seus templates também serão removidos!`)) return;
    try {
      await axios.delete(`${API_BASE}/advogados/id/${id}`);
      setSucesso(`✅ Advogado "${nome}" deletado com sucesso!`);
      carregarAdvogados();
      setTimeout(() => setSucesso(""), 3000);
    } catch (err: any) {
      setErro(err?.response?.data?.detail || err?.message || "Erro ao deletar advogado");
    }
  };



  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gerenciar Advogados</h1>
          <p className="text-gray-600 mt-1">Crie advogados copiando templates de um advogado existente</p>
        </div>
        <button
          onClick={() => showForm ? fecharForm() : setShowForm(true)}
          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          {showForm ? "❌ Fechar" : "➕ Novo Advogado"}
        </button>
      </div>

      {/* Mensagens */}
      {sucesso && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 whitespace-pre-line">
          {sucesso}
        </div>
      )}
      {erro && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          ⚠️ {erro}
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow mb-8 border-l-4 border-green-500">
          <h2 className="text-xl font-semibold mb-1 text-gray-900">➕ Novo Advogado</h2>
          <p className="text-sm text-gray-500 mb-4">
            O usuário é preenchido automaticamente com o primeiro nome. API ZapSign e Webhook aplicados pelo padrão do escritório.
          </p>

          <form onSubmit={handleCriarAdvogado} className="space-y-4">

            {/* Gênero */}
            <div className="flex gap-6 items-center">
              <span className="text-sm font-medium text-gray-700">Gênero *</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="genero"
                  value="M"
                  checked={form.genero === "M"}
                  onChange={() => setForm({ ...form, genero: "M" })}
                  className="accent-green-600"
                />
                <span className="text-sm text-gray-700">Masculino (Dr.)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="genero"
                  value="F"
                  checked={form.genero === "F"}
                  onChange={() => setForm({ ...form, genero: "F" })}
                  className="accent-green-600"
                />
                <span className="text-sm text-gray-700">Feminino (Dra.)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Nome Completo — full width */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Completo *
                  <span className="ml-2 text-xs font-normal text-gray-400">salvo em maiúsculas</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.nome_completo}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  style={{ textTransform: "uppercase" }}
                  placeholder="Ex: VITOR FULVIO PELEGRINO SILVA"
                />
              </div>

              {/* Usuário */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usuário (login) *
                  <span className="ml-2 text-xs font-normal text-gray-400">auto: primeiro nome</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.usuario}
                  onChange={(e) => {
                    setUsuarioManual(true);
                    setForm({ ...form, usuario: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                  placeholder="Ex: vitor"
                />
              </div>

              {/* OAB */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OAB *</label>
                <input
                  type="text"
                  required
                  value={form.oab}
                  onChange={(e) => setForm({ ...form, oab: formatOAB(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono tracking-wide"
                  placeholder="MG 000.000"
                  maxLength={10}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="advogado@email.com"
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone
                  <span className="ml-2 text-xs font-normal text-gray-400">celular com DDD</span>
                </label>
                <PatternFormat
                  format="(##) #####-####"
                  mask="_"
                  value={form.telefone}
                  onValueChange={(values) => setForm({ ...form, telefone: values.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="(31) 99999-9999"
                />
              </div>

              {/* Senha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Mínimo 8 caracteres"
                />
              </div>

            </div>

            {/* Info ZapSign */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
              🔐 API ZapSign e Webhook Token serão configurados automaticamente com o padrão do escritório.
            </div>

            {formErro && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                ⚠️ {formErro}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {formLoading ? "Criando..." : "✅ Criar Advogado"}
              </button>
              <button
                type="button"
                onClick={fecharForm}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : advogados.length === 0 ? (
            <div className="text-center py-8 text-gray-600">Nenhum advogado encontrado</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Nome</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Usuário</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">OAB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Telefone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {advogados.map((adv) => (
                  <tr key={adv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{adv.nome_completo}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">
                      <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{adv.usuario}</code>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">{adv.oab}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{adv.email}</td>
                    <td className="px-6 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatarTelefone(adv.telefone)}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {adv.ativo !== false ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativo</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inativo</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        onClick={() => handleDeletar(adv.id, adv.nome_completo)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
                      >
                        Deletar
                      </button>
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
