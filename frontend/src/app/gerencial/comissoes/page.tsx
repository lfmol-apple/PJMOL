"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Manrope, Source_Sans_3 } from "next/font/google";
import {
  ArrowLeft, Calendar, CheckSquare, ChevronLeft, ChevronRight,
  RefreshCw, Search, Square, User2, X,
} from "lucide-react";
import { canSeeAll, getLoggedUser, getToken } from "@/app/lib/auth";

const headingFont = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"] });
const bodyFont = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"] });

const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/+$/, "");

function fmtBRL(v: number | string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
}
function isoToDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function startOfMonth(d: Date): string {
  return isoToDate(new Date(d.getFullYear(), d.getMonth(), 1));
}
function endOfMonth(d: Date): string {
  return isoToDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function fmtDataBR(iso: string): string {
  try {
    const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
    return d.toLocaleDateString("pt-BR");
  } catch { return iso; }
}

function fmtHoraBR(iso: string): string {
  try {
    const d = iso.includes("T") ? new Date(iso) : new Date(iso + "T12:00:00");
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

type Registro = {
  extrato_id: number;
  cliente?: string | null;
  grupo?: string | number | null;
  cota?: string | number | null;
  administradora?: string | null;
  gerente_nome?: string | null;
  inserido_por_usuario_id?: number | null;
  inserido_por_nome?: string | null;
  data_valor_acordo: string;
  data_estimada?: boolean;
  data_recebimento_acordo?: string | null;
  comprovante_recebimento_acordo_url?: string | null;
  valor_acordo: number;
  valor_comissao: number;
  percentual: number;
};

type PorUsuario = {
  usuario_id: number | null;
  usuario_nome?: string | null;
  quantidade: number;
  valor_acordo_total: number;
  valor_comissao_total: number;
};

type Relatorio = {
  periodo: { data_inicial: string; data_final: string };
  resumo: {
    quantidade: number;
    valor_acordo_total: number;
    valor_comissao_total: number;
    percentual_medio: number;
  };
  registros: Registro[];
  por_usuario?: PorUsuario[];
};

export default function ExtratoCFechamentoPage() {
  const user = useMemo(() => getLoggedUser(), []);
  const isAdmin = canSeeAll(user?.perfil);

  const now = new Date();
  const [dataInicial, setDataInicial] = useState(() => startOfMonth(now));
  const [dataFinal, setDataFinal] = useState(() => endOfMonth(now));
  const [usuarioFiltro, setUsuarioFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  // IDs dos registros selecionados para o "a pagar"
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [comprovanteModal, setComprovanteModal] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<string>("data_valor_acordo");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchRelatorio = async () => {
    try {
      setLoading(true);
      setErro("");
      setSelecionados(new Set());
      const token = getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Perfil": String(user?.perfil || ""),
      };
      if (user?.id != null) headers["X-Usuario-Id"] = String(user.id);
      if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

      const params = new URLSearchParams({ data_inicial: dataInicial, data_final: dataFinal });
      if (isAdmin && usuarioFiltro) params.set("usuario_id", usuarioFiltro);

      const res = await fetch(`${API_BASE}/relatorios/producao/comissoes?${params}`, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await res.text());
      setRelatorio(await res.json());
    } catch (e: any) {
      setErro(e?.message || "Falha ao carregar extrato.");
      setRelatorio(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRelatorio(); }, []);

  useEffect(() => {
    if (!relatorio) return;
    fetchRelatorio();
  }, [usuarioFiltro]);

  const navegarMes = (delta: number) => {
    const [y, m] = dataInicial.split("-").map(Number);
    const ref = new Date(y, m - 1 + delta, 1);
    setDataInicial(startOfMonth(ref));
    setDataFinal(endOfMonth(ref));
  };

  // Registros filtrados pela busca
  const registrosFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const todos = relatorio?.registros || [];
    if (!q) return todos;
    return todos.filter((r) =>
      [r.cliente, r.grupo, r.cota, r.administradora, r.gerente_nome, r.inserido_por_nome]
        .join(" ").toLowerCase().includes(q)
    );
  }, [relatorio, busca]);

  const sortedRegistros = useMemo(() => {
    if (!sortCol) return registrosFiltrados;
    return [...registrosFiltrados].sort((a, b) => {
      let va: any, vb: any;
      if (sortCol === "cliente") { va = (a.cliente || "").toLowerCase(); vb = (b.cliente || "").toLowerCase(); }
      else if (sortCol === "responsavel") { va = (a.inserido_por_nome || a.gerente_nome || "").toLowerCase(); vb = (b.inserido_por_nome || b.gerente_nome || "").toLowerCase(); }
      else if (sortCol === "administradora") { va = (a.administradora || "").toLowerCase(); vb = (b.administradora || "").toLowerCase(); }
      else if (sortCol === "data_valor_acordo") { va = a.data_valor_acordo || ""; vb = b.data_valor_acordo || ""; }
      else if (sortCol === "data_recebimento_acordo") { va = a.data_recebimento_acordo || ""; vb = b.data_recebimento_acordo || ""; }
      else if (sortCol === "valor_acordo") { va = a.valor_acordo; vb = b.valor_acordo; }
      else if (sortCol === "valor_comissao") { va = a.valor_comissao; vb = b.valor_comissao; }
      else { va = ""; vb = ""; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [registrosFiltrados, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Totais da seleção
  const totaisSelecionados = useMemo(() => {
    const lista = registrosFiltrados.filter((r) => selecionados.has(r.extrato_id));
    return {
      quantidade: lista.length,
      valor_acordo: lista.reduce((s, r) => s + r.valor_acordo, 0),
      valor_comissao: lista.reduce((s, r) => s + r.valor_comissao, 0),
    };
  }, [selecionados, registrosFiltrados]);

  const todosSelec = sortedRegistros.length > 0 && sortedRegistros.every((r) => selecionados.has(r.extrato_id));
  const algumSelec = sortedRegistros.some((r) => selecionados.has(r.extrato_id));

  const toggleAll = () => {
    if (todosSelec) {
      setSelecionados((prev) => {
        const next = new Set(prev);
        sortedRegistros.forEach((r) => next.delete(r.extrato_id));
        return next;
      });
    } else {
      setSelecionados((prev) => {
        const next = new Set(prev);
        sortedRegistros.forEach((r) => next.add(r.extrato_id));
        return next;
      });
    }
  };

  const toggleRow = (id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
    <div className={`${bodyFont.className} min-h-screen bg-linear-to-b from-stone-100 via-slate-50 to-slate-100 text-slate-900`}>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">

        {/* ── Cabeçalho ── */}
        <div className="mb-4 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                href="/gerencial/processos"
                className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                <ArrowLeft className="h-4 w-4" /> Voltar para processos
              </Link>
              <h1 className={`${headingFont.className} text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl`}>
                {isAdmin ? "Extrato de Fechamento" : "Extrato de Comissões"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {isAdmin
                  ? <>Comissões calculadas pela <strong>data de inserção do valor do acordo</strong>. Filtre por pessoa abaixo.</>
                  : <>Seus acordos fechados e o valor que você tem <strong>direito a receber</strong>, pela data em que o acordo foi registrado. Selecione os acordos para calcular o pagamento exato.</>
                }
              </p>
              {!isAdmin && user?.nome && (
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800">
                  <User2 className="h-3.5 w-3.5" /> {user.nome}
                </div>
              )}
            </div>

            {/* Controles de período */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {/* Navegação por mês */}
              <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-1.5">
                <button onClick={() => navegarMes(-1)} className="rounded-lg p-1 hover:bg-slate-200">
                  <ChevronLeft className="h-4 w-4 text-slate-500" />
                </button>
                <span className={`${headingFont.className} min-w-40 text-center text-sm font-bold text-slate-800`}>
                  {monthLabel(dataInicial)}
                </span>
                <button onClick={() => navegarMes(1)} className="rounded-lg p-1 hover:bg-slate-200">
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex">
                <label className="text-xs font-semibold text-slate-600">
                  <div className="mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> De</div>
                  <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  <div className="mb-1 flex items-center gap-1"><Calendar className="h-3 w-3" /> Até</div>
                  <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                </label>
              </div>

              <button
                onClick={fetchRelatorio}
                className={`${headingFont.className} inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700`}
              >
                <RefreshCw className="h-4 w-4" /> Gerar
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-base font-semibold text-slate-500">
            Gerando extrato…
          </div>
        )}
        {!loading && erro && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {erro}
          </div>
        )}

        {!loading && relatorio && (
          <div className="space-y-5">

            {/* ── Resumo do período ── */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                <div className={`${headingFont.className} text-xs font-bold uppercase tracking-widest text-emerald-700`}>
                  {isAdmin ? "Total a pagar no período" : "Você tem direito a receber"}
                </div>
                <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-emerald-950`}>
                  {fmtBRL(relatorio.resumo.valor_comissao_total)}
                </div>
                <div className="mt-1 text-xs font-semibold text-emerald-700">
                  base de {fmtBRL(relatorio.resumo.valor_acordo_total)} em acordos
                </div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <div className={`${headingFont.className} text-xs font-bold uppercase tracking-widest text-sky-700`}>
                  {isAdmin ? "Acordos fechados" : "Seus acordos fechados"}
                </div>
                <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-sky-950`}>
                  {relatorio.resumo.quantidade}
                </div>
                <div className="mt-1 text-xs font-semibold text-sky-700">
                  registrados em {monthLabel(dataInicial)}
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <div className={`${headingFont.className} text-xs font-bold uppercase tracking-widest text-amber-700`}>
                  Taxa média de honorários
                </div>
                <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-amber-950`}>
                  {relatorio.resumo.percentual_medio.toFixed(1)}%
                </div>
                <div className="mt-1 text-xs font-semibold text-amber-700">
                  sobre os valores dos acordos
                </div>
              </div>
            </div>

            {/* ── Admin: por responsável ── */}
            {isAdmin && relatorio.por_usuario && relatorio.por_usuario.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-3">
                  <div className={`${headingFont.className} text-sm font-bold text-slate-800`}>
                    Por responsável pelo registro
                  </div>
                  <p className="text-xs text-slate-400">Clique para filtrar os acordos abaixo</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {relatorio.por_usuario.map((u) => {
                    const active = usuarioFiltro === String(u.usuario_id || "");
                    const pct = u.valor_acordo_total > 0
                      ? (u.valor_comissao_total / u.valor_acordo_total * 100).toFixed(1)
                      : "0.0";
                    return (
                      <button
                        key={u.usuario_id ?? u.usuario_nome}
                        type="button"
                        onClick={() => setUsuarioFiltro(active ? "" : String(u.usuario_id || ""))}
                        className={`w-full px-5 py-3 text-left transition hover:bg-slate-50 ${active ? "bg-emerald-50" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-extrabold ${active ? "bg-emerald-600" : "bg-slate-300 text-slate-700"}`}>
                            <User2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-extrabold text-slate-950">
                              {u.usuario_nome || `Usuário #${u.usuario_id}`}
                            </div>
                            <div className="text-xs font-semibold text-slate-400">
                              {u.quantidade} acordo(s) · {fmtBRL(u.valor_acordo_total)} em acordos · taxa {pct}%
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className={`${headingFont.className} text-sm font-extrabold text-emerald-800`}>
                              {fmtBRL(u.valor_comissao_total)}
                            </div>
                            <div className="text-[10px] font-semibold text-slate-400">comissão</div>
                          </div>
                          {active && (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              filtrado
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {usuarioFiltro && (
                  <div className="border-t border-slate-100 px-5 py-2">
                    <button onClick={() => setUsuarioFiltro("")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-900">
                      <X className="h-3 w-3" /> Limpar filtro
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Tabela de acordos com seleção ── */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              {/* Toolbar */}
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className={`${headingFont.className} text-sm font-bold text-slate-800`}>
                    Acordos fechados no período
                  </div>
                  <p className="text-xs text-slate-400">
                    Selecione os acordos para calcular o valor exato a pagar.
                  </p>
                </div>
                <div className="relative w-full sm:min-w-60">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setSelecionados(new Set()); }}
                    placeholder="Buscar cliente, grupo, cota…"
                    className="h-9 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Barra de "a pagar" — aparece quando há seleção */}
              {algumSelec && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                      {totaisSelecionados.quantidade} selecionado{totaisSelecionados.quantidade !== 1 ? "s" : ""}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      Base: <strong>{fmtBRL(totaisSelecionados.valor_acordo)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`${headingFont.className} text-lg font-extrabold text-emerald-900`}>
                      A pagar: {fmtBRL(totaisSelecionados.valor_comissao)}
                    </div>
                    <button
                      onClick={() => setSelecionados(new Set())}
                      className="rounded-lg border border-emerald-300 px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                    >
                      Limpar seleção
                    </button>
                  </div>
                </div>
              )}

              {/* Cards — mobile only */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {registrosFiltrados.map((r) => {
                  const sel = selecionados.has(r.extrato_id);
                  return (
                    <div
                      key={`m-${r.extrato_id}-${r.data_valor_acordo}`}
                      onClick={() => toggleRow(r.extrato_id)}
                      className={`cursor-pointer select-none p-4 transition ${sel ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {sel
                            ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                            : <Square className="h-4 w-4 text-slate-300" />
                          }
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-bold text-slate-950">
                                {r.cliente || `Extrato #${r.extrato_id}`}
                              </div>
                              <div className="text-xs font-semibold text-slate-400">
                                Gr. {r.grupo || "–"} · Cota {r.cota || "–"}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`${headingFont.className} font-extrabold text-emerald-800`}>
                                {fmtBRL(r.valor_comissao)}
                              </div>
                              <div className="text-[10px] font-semibold text-slate-400">{r.percentual.toFixed(1)}%</div>
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="font-semibold text-slate-500">{r.administradora || "–"}</span>
                            <span className="text-slate-500">{fmtDataBR(r.data_valor_acordo)}</span>
                            <span className="font-bold text-slate-700">{fmtBRL(r.valor_acordo)}</span>
                            {isAdmin && (
                              <span className="text-slate-500">{r.inserido_por_nome || r.gerente_nome || "–"}</span>
                            )}
                          </div>
                          {r.data_estimada && (
                            <div className="mt-1 text-[10px] font-semibold text-amber-600">data estimada</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {registrosFiltrados.length === 0 && (
                  <div className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                    Nenhum acordo fechado encontrado para o período selecionado.
                  </div>
                )}
                {registrosFiltrados.length > 0 && (
                  <div className="flex items-center justify-between border-t-2 border-slate-200 bg-slate-50 px-4 py-3 text-sm font-extrabold text-slate-900">
                    <span>{registrosFiltrados.length} acordo(s)</span>
                    <div className="text-right">
                      <div>{fmtBRL(registrosFiltrados.reduce((s, r) => s + r.valor_acordo, 0))}</div>
                      <div className="text-emerald-800">
                        {fmtBRL(registrosFiltrados.reduce((s, r) => s + r.valor_comissao, 0))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Header */}
                  <div className="grid items-center bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: isAdmin ? "2rem 1fr 1fr 1fr 1fr 1fr 2rem 1fr 1fr" : "2rem 1fr 1fr 1fr 1fr 2rem 1fr 1fr" }}>
                    <div className="flex items-center justify-center">
                      <button onClick={toggleAll} className="text-slate-400 hover:text-slate-700">
                        {todosSelec
                          ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                          : <Square className="h-4 w-4" />
                        }
                      </button>
                    </div>
                    {(["cliente","responsavel","administradora","data_valor_acordo","data_recebimento_acordo"] as const).map((col, i) => {
                      if (col === "responsavel" && !isAdmin) return null;
                      const labels: Record<string, string> = { cliente: "Cliente", responsavel: "Responsável", administradora: "Administradora", data_valor_acordo: "Reportado", data_recebimento_acordo: "Dt. pagamento" };
                      const active = sortCol === col;
                      return (
                        <button key={col} type="button" onClick={() => toggleSort(col)}
                          className={`flex items-center gap-0.5 text-left hover:text-slate-900 transition-colors ${active ? "text-emerald-700" : ""}`}
                          title={col === "data_valor_acordo" ? "Data em que o valor do acordo foi inserido" : col === "data_recebimento_acordo" ? "Data em que a administradora pagou o acordo" : undefined}
                        >
                          {labels[col]}
                          <span className="ml-0.5 text-[10px]">{active ? (sortDir === "asc" ? "↑" : "↓") : <span className="text-slate-300">↕</span>}</span>
                        </button>
                      );
                    })}
                    <div></div>
                    {(["valor_acordo","valor_comissao"] as const).map((col) => {
                      const active = sortCol === col;
                      return (
                        <button key={col} type="button" onClick={() => toggleSort(col)}
                          className={`flex items-center justify-end gap-0.5 w-full text-right hover:text-slate-900 transition-colors ${active ? "text-emerald-700" : ""}`}
                        >
                          {col === "valor_acordo" ? "Acordo" : "Comissão"}
                          <span className="text-[10px]">{active ? (sortDir === "asc" ? "↑" : "↓") : <span className="text-slate-300">↕</span>}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Linhas */}
                  <div className="max-h-[560px] divide-y divide-slate-100 overflow-auto bg-white">
                    {sortedRegistros.map((r) => {
                      const sel = selecionados.has(r.extrato_id);
                      return (
                        <div
                          key={`${r.extrato_id}-${r.data_valor_acordo}`}
                          onClick={() => toggleRow(r.extrato_id)}
                          className={`grid cursor-pointer items-center gap-2 px-4 py-1.5 text-sm transition select-none ${sel ? "bg-emerald-50" : "hover:bg-slate-50"}`} style={{ gridTemplateColumns: isAdmin ? "2rem 1fr 1fr 1fr 1fr 1fr 2rem 1fr 1fr" : "2rem 1fr 1fr 1fr 1fr 2rem 1fr 1fr" }}
                        >
                          <div className="flex items-center justify-center">
                            {sel
                              ? <CheckSquare className="h-4 w-4 text-emerald-600" />
                              : <Square className="h-4 w-4 text-slate-300" />
                            }
                          </div>
                          <div className="min-w-0" title={`Gr. ${r.grupo || "–"} · Cota ${r.cota || "–"}`}>
                            <div className="truncate text-xs font-bold text-slate-950">{r.cliente || `Extrato #${r.extrato_id}`}</div>
                          </div>
                          {isAdmin && (
                            <div className="min-w-0 truncate text-xs font-semibold text-slate-600">
                              {r.inserido_por_nome || r.gerente_nome || "–"}
                            </div>
                          )}
                          <div className="truncate text-xs font-semibold text-slate-500">
                            {r.administradora || "–"}
                          </div>
                          <div title="Data em que o valor do acordo foi inserido" className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-slate-700">{fmtDataBR(r.data_valor_acordo)}</span>
                            {r.data_estimada && <span className="text-[10px] font-semibold text-amber-500">·est</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            {r.data_recebimento_acordo
                              ? <span className="text-xs font-semibold text-slate-700">{fmtDataBR(r.data_recebimento_acordo)}</span>
                              : <span className="text-slate-300 text-xs">—</span>}
                          </div>
                          <div className="flex items-center">
                            {r.comprovante_recebimento_acordo_url
                              ? <button type="button" onClick={(e) => { e.stopPropagation(); setComprovanteModal(r.comprovante_recebimento_acordo_url!); }} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 underline transition-colors whitespace-nowrap">Ver comprovante</button>
                              : <span className="text-xs text-slate-400 whitespace-nowrap">Indisponível</span>}
                          </div>
                          <div className="text-right font-bold text-slate-800">
                            {fmtBRL(r.valor_acordo)}
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-extrabold text-emerald-800">{fmtBRL(r.valor_comissao)}</span>
                            <span className="text-[10px] font-semibold text-slate-400"> {r.percentual.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}

                    {sortedRegistros.length === 0 && (
                      <div className="px-4 py-12 text-center text-sm font-semibold text-slate-400">
                        Nenhum acordo fechado encontrado para o período selecionado.
                      </div>
                    )}
                  </div>

                  {/* Totalizador do rodapé */}
                  {sortedRegistros.length > 0 && (
                    <div className="grid items-center border-t-2 border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-extrabold text-slate-900" style={{ gridTemplateColumns: isAdmin ? "2rem 1fr 1fr 1fr 1fr 1fr 2rem 1fr 1fr" : "2rem 1fr 1fr 1fr 1fr 2rem 1fr 1fr" }}>
                      <div />
                      <div>{sortedRegistros.length} acordo(s)</div>
                      {isAdmin && <div />}
                      <div />
                      <div />
                      <div />
                      <div />
                      <div className="text-right">
                        {fmtBRL(sortedRegistros.reduce((s, r) => s + r.valor_acordo, 0))}
                      </div>
                      <div className="text-right text-emerald-800">
                        {fmtBRL(sortedRegistros.reduce((s, r) => s + r.valor_comissao, 0))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Resumo fixo do "a pagar" selecionado ── */}
            {algumSelec && (
              <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5 shadow-sm">
                <div className={`${headingFont.className} mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700`}>
                  {isAdmin ? "Resumo de pagamento — seleção atual" : "Seus direitos — seleção atual"}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold text-emerald-700">Acordos selecionados</div>
                    <div className={`${headingFont.className} text-2xl font-extrabold text-emerald-950`}>
                      {totaisSelecionados.quantidade}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-700">Valor base (acordos)</div>
                    <div className={`${headingFont.className} text-2xl font-extrabold text-emerald-950`}>
                      {fmtBRL(totaisSelecionados.valor_acordo)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-700">Total a pagar (comissão)</div>
                    <div className={`${headingFont.className} text-3xl font-extrabold text-emerald-800`}>
                      {fmtBRL(totaisSelecionados.valor_comissao)}
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>

    {comprovanteModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setComprovanteModal(null)}>
        <div className="relative w-full h-full bg-white flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <span className="text-sm font-semibold text-slate-700">Comprovante de pagamento</span>
            <button type="button" onClick={() => setComprovanteModal(null)} className="text-slate-400 hover:text-slate-700 text-xl font-bold leading-none">×</button>
          </div>
          <div className="flex-1 overflow-auto">
            {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(comprovanteModal)
              ? <img src={comprovanteModal} alt="Comprovante" className="w-full h-auto" />
              : <iframe src={comprovanteModal} className="w-full h-full" title="Comprovante" />}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
