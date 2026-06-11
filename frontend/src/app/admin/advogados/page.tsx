// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { PatternFormat } from "react-number-format";

const API_BASE = "/api";

const DEFAULT_API_KEY_ZAPSIGN = "068da606-d352-4630-8b35-6cb194faa674d7419744-ab96-468f-9fbd-66b3872d9ab0";
const DEFAULT_WEBHOOK_PATH_TOKEN = "5145ee69d9202235aeaeb29b2f7bd6a1";

const MODELOS = [
  {
    id: "julio",
    label: "01 — Modelo Júlio",
    descricao: "Escritório Júlio Camargos (Santos/SP)",
    email: "advocacia@juliocamargos.com",
    telefone: "13991711215",
    cor: "blue",
  },
  {
    id: "miguel",
    label: "02 — Modelo Miguel",
    descricao: "Escritório Júlio Camargos (Santos/SP)",
    email: "advocacia@juliocamargos.com",
    telefone: "13991711215",
    cor: "purple",
  },
] as const;

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
  api_key_zapsign: string;
}

const FORM_VAZIO: FormData = {
  nome_completo: "",
  usuario: "",
  oab: "",
  email: "",
  telefone: "",
  senha: "",
  genero: "M",
  api_key_zapsign: DEFAULT_API_KEY_ZAPSIGN,
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

function gerarUsuarioUnico(base: string, advogados: Advogado[]): string {
  const existentes = new Set(advogados.map(a => a.usuario.toLowerCase()));
  if (!existentes.has(base)) return base;
  let i = 2;
  while (existentes.has(`${base}${i}`)) i++;
  return `${base}${i}`;
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
  const [modeloSelecionado, setModeloSelecionado] = useState<string | null>(null);
  const [advogadoEditando, setAdvogadoEditando] = useState<Advogado | null>(null);

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
    setModeloSelecionado(null);
    setAdvogadoEditando(null);
  };

  const abrirCriacao = () => {
    if (showForm && !advogadoEditando) {
      fecharForm();
      return;
    }
    setForm(FORM_VAZIO);
    setUsuarioManual(false);
    setFormErro("");
    setModeloSelecionado(null);
    setAdvogadoEditando(null);
    setShowForm(true);
  };

  const abrirEdicao = (adv: Advogado) => {
    setAdvogadoEditando(adv);
    setUsuarioManual(true);
    setModeloSelecionado(null);
    setFormErro("");
    setShowForm(true);
    setForm({
      nome_completo: adv.nome_completo || "",
      usuario: adv.usuario || "",
      oab: adv.oab || "",
      email: adv.email || "",
      telefone: adv.telefone || "",
      senha: "",
      genero: "M",
      api_key_zapsign: adv.api_key_zapsign || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const aplicarModelo = (id: string) => {
    const m = MODELOS.find(m => m.id === id);
    if (!m) return;
    setModeloSelecionado(id);
    setForm(prev => ({ ...prev, email: m.email, telefone: m.telefone }));
  };

  // Ao digitar nome, auto-preenche usuario com primeiro nome (se não foi editado manualmente)
  const handleNomeChange = (valor: string) => {
    const upper = valor.toUpperCase();
    setForm(prev => ({
      ...prev,
      nome_completo: upper,
      usuario: usuarioManual ? prev.usuario : gerarUsuarioUnico(slugifyPrimeiroNome(valor), advogados),
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
        api_key_zapsign: form.api_key_zapsign || DEFAULT_API_KEY_ZAPSIGN,
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

  const handleAtualizarAdvogado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advogadoEditando) return;

    setFormErro("");
    setFormLoading(true);

    try {
      const payload: any = {
        nome_completo: form.nome_completo.trim(),
        usuario: form.usuario.trim().toLowerCase(),
        oab: form.oab.trim().toUpperCase(),
        email: form.email.trim().toLowerCase(),
        telefone: form.telefone,
        api_key_zapsign: form.api_key_zapsign.trim(),
      };

      if (form.senha.trim()) {
        payload.senha = form.senha;
      }

      if (!payload.nome_completo || !payload.usuario || !payload.oab || !payload.email) {
        setFormErro("Preencha todos os campos obrigatórios");
        return;
      }

      const response = await axios.put(`${API_BASE}/advogados/${advogadoEditando.id}`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      setSucesso(`✅ Advogado "${response.data.nome_completo}" atualizado com sucesso!`);
      setAdvogados((atuais) =>
        atuais.map((adv) =>
          adv.id === advogadoEditando.id ? { ...adv, ...response.data } : adv
        )
      );
      fecharForm();
      await carregarAdvogados();
      setTimeout(() => setSucesso(""), 3000);
    } catch (err: any) {
      setFormErro(err?.response?.data?.detail || err?.message || "Erro ao atualizar advogado");
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
          onClick={abrirCriacao}
          className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          {showForm && !advogadoEditando ? "❌ Fechar" : "➕ Novo Advogado"}
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
          <h2 className="text-xl font-semibold mb-1 text-gray-900">
            {advogadoEditando ? "Editar Advogado" : "➕ Novo Advogado"}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {advogadoEditando
              ? "Altere os dados cadastrais. Deixe a senha em branco para manter a senha atual."
              : "O usuário é preenchido automaticamente com o primeiro nome. API ZapSign e Webhook aplicados pelo padrão do escritório."}
          </p>

          {/* Seleção de modelo */}
          {!advogadoEditando && <div className="mb-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Usar modelo de escritório</p>
            <div className="flex gap-3">
              {MODELOS.map((m) => {
                const ativo = modeloSelecionado === m.id;
                const cores = m.cor === "blue"
                  ? { base: "border-blue-300 bg-blue-50 text-blue-800", ativo: "border-blue-600 bg-blue-100 ring-2 ring-blue-400" }
                  : { base: "border-purple-300 bg-purple-50 text-purple-800", ativo: "border-purple-600 bg-purple-100 ring-2 ring-purple-400" };
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => aplicarModelo(m.id)}
                    className={`flex-1 rounded-lg border-2 px-4 py-3 text-left transition-all ${ativo ? cores.ativo : cores.base} hover:opacity-90`}
                  >
                    <div className="font-bold text-sm">{m.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{m.descricao}</div>
                    {ativo && <div className="text-[10px] mt-1 font-semibold">✓ Selecionado — email e telefone preenchidos</div>}
                  </button>
                );
              })}
            </div>
          </div>}

          <form onSubmit={advogadoEditando ? handleAtualizarAdvogado : handleCriarAdvogado} className="space-y-4">

            {/* Gênero */}
            {!advogadoEditando && <div className="flex gap-6 items-center">
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
            </div>}

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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha {advogadoEditando ? "" : "*"}
                </label>
                <input
                  type="password"
                  required={!advogadoEditando}
                  minLength={8}
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder={advogadoEditando ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
                />
              </div>

              {/* API ZapSign */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Chave API ZapSign</label>
                <input
                  type="text"
                  value={form.api_key_zapsign}
                  onChange={(e) => setForm({ ...form, api_key_zapsign: e.target.value.trim() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-xs"
                  placeholder="Chave API ZapSign"
                />
              </div>

            </div>

            {/* Info ZapSign */}
            {!advogadoEditando && <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-500">
              🔐 API ZapSign e Webhook Token serão configurados automaticamente com o padrão do escritório.
            </div>}

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
                {formLoading ? (advogadoEditando ? "Salvando..." : "Criando...") : (advogadoEditando ? "Salvar alterações" : "✅ Criar Advogado")}
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
        <div className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : advogados.length === 0 ? (
            <div className="text-center py-8 text-gray-600">Nenhum advogado encontrado</div>
          ) : (
            <table className="w-full table-auto">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Nome</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Usuário</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">OAB</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Email</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Telefone</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Status</th>
                  <th className="px-2 lg:px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {advogados.map((adv) => (
                  <tr key={adv.id} className="hover:bg-gray-50">
                    <td className="px-2 lg:px-4 py-3 text-sm font-medium text-gray-900 break-words">{adv.nome_completo}</td>
                    <td className="px-2 lg:px-4 py-3 text-sm text-gray-600">
                      <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{adv.usuario}</code>
                    </td>
                    <td className="px-2 lg:px-4 py-3 text-sm text-gray-600">{adv.oab}</td>
                    <td className="px-2 lg:px-4 py-3 text-sm text-gray-600 break-all">{adv.email}</td>
                    <td className="px-2 lg:px-4 py-3 text-sm text-gray-600">
                      {formatarTelefone(adv.telefone)}
                    </td>
                    <td className="px-2 lg:px-4 py-3 text-sm">
                      {adv.ativo !== false ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Ativo</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Inativo</span>
                      )}
                    </td>
                    <td className="px-2 lg:px-4 py-3 text-sm">
                      <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(adv)}
                          className="inline-flex justify-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletar(adv.id, adv.nome_completo)}
                          className="inline-flex justify-center bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs font-medium"
                        >
                          Deletar
                        </button>
                      </div>
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
