"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Manrope, Source_Sans_3 } from "next/font/google";
import { ArrowLeft, Calendar, User2, Filter } from "lucide-react";
import { canSeeAll, getLoggedUser, getToken } from "@/app/lib/auth";

const headingFont = Manrope({ subsets: ["latin"], weight: ["600", "700", "800"] });
const bodyFont = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600", "700"] });

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/+$/, "");

function fmtDateInput(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function startOfCurrentMonth(): string {
  const now = new Date();
  return fmtDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
}

function today(): string {
  return fmtDateInput(new Date());
}

function fmtBRL(valor: number | string): string {
  const n = Number(valor || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

type StatusRow = {
  status: string;
  quantidade: number;
  valor_causa_total: number;
  acordo_provavel_total: number;
  valor_causa_total_fmt?: string;
  acordo_provavel_total_fmt?: string;
};

type AdministradoraRow = {
  administradora: string;
  quantidade: number;
  valor_causa_total: number;
  acordo_provavel_total: number;
  statuses: StatusRow[];
};

type AcordosRow = {
  quantidade: number;
  honorarios_total: number;
  honorarios_total_fmt: string;
  comissao_gerente: number;
  comissao_gerente_fmt: string;
};

type GerenteRow = {
  gerente_id: number;
  gerente_nome: string;
  gerente_email?: string | null;
  totais: {
    quantidade: number;
    valor_causa_total: number;
    acordo_provavel_total: number;
  };
  acordos: AcordosRow;
  statuses: StatusRow[];
  administradoras: AdministradoraRow[];
};

type ReportPayload = {
  periodo: { data_inicial: string; data_final: string };
  totais: { quantidade: number; valor_causa_total: number; acordo_provavel_total: number };
  acordos_geral: AcordosRow;
  resumo_assinaturas: {
    enviados: { quantidade: number; valor_causa_total: number; acordo_provavel_total: number };
    aguardando_assinatura: { quantidade: number; valor_causa_total: number; acordo_provavel_total: number };
    assinados: { quantidade: number; valor_causa_total: number; acordo_provavel_total: number };
    assinados_fora: { quantidade: number; valor_causa_total: number; acordo_provavel_total: number };
  };
  statuses: StatusRow[];
  administradoras: AdministradoraRow[];
  gerentes: GerenteRow[];
  recipients: {
    admins: Array<{ id: number | null; nome: string; email: string }>;
    gerentes: Array<{ id: number | null; nome: string; email: string }>;
  };
};

function normalizeStatusKey(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getStatusSummary(rows: StatusRow[], matchers: string[]): { quantidade: number; valor_causa_total: number; acordo_provavel_total: number } {
  return rows.reduce(
    (acc, row) => {
      const statusKey = normalizeStatusKey(row.status);
      if (!matchers.includes(statusKey)) {
        return acc;
      }
      acc.quantidade += Number(row.quantidade || 0);
      acc.valor_causa_total += Number(row.valor_causa_total || 0);
      acc.acordo_provavel_total += Number(row.acordo_provavel_total || 0);
      return acc;
    },
    { quantidade: 0, valor_causa_total: 0, acordo_provavel_total: 0 },
  );
}

export default function ProducaoMensalPage() {
  const user = useMemo(() => getLoggedUser(), []);
  const [dataInicial, setDataInicial] = useState(startOfCurrentMonth);
  const [dataFinal, setDataFinal] = useState(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportPayload | null>(null);

  const gerenteCards = useMemo(() => {
    if (!report) return [];

    return report.gerentes
      .map((gerente) => {
        const enviados = getStatusSummary(gerente.statuses, ["enviado", "assinado", "assinado (fora)"]);
        const aguardandoAssinatura = getStatusSummary(gerente.statuses, ["enviado"]);
        const assinados = getStatusSummary(gerente.statuses, ["assinado"]);
        const assinadosFora = getStatusSummary(gerente.statuses, ["assinado (fora)"]);

        return {
          ...gerente,
          enviados,
          aguardandoAssinatura,
          assinados,
          assinadosFora,
        };
      })
      .sort((a, b) => {
        const byValue = Number(b.totais.valor_causa_total || 0) - Number(a.totais.valor_causa_total || 0);
        if (byValue !== 0) return byValue;
        return Number(b.totais.quantidade || 0) - Number(a.totais.quantidade || 0);
      });
  }, [report]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError("");
      const token = getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Perfil": String(user?.perfil || ""),
      };
      if (user?.id != null) headers["X-Usuario-Id"] = String(user.id);
      if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;

      const params = new URLSearchParams({ data_inicial: dataInicial, data_final: dataFinal });
      const res = await fetch(`${API_BASE}/relatorios/producao?${params.toString()}`, {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      setReport(await res.json());
    } catch (err: any) {
      setError(err?.message || "Falha ao gerar relatório.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canSeeAll(user?.perfil)) {
      setLoading(false);
      setError("Relatório restrito aos administradores.");
      return;
    }
    fetchReport();
  }, []);

  if (!canSeeAll(user?.perfil)) {
    return (
      <div className={`${bodyFont.className} min-h-screen bg-slate-50 p-8 text-slate-700`}>
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Link href="/gerencial/processos" className="mb-4 inline-flex items-center gap-2 text-base font-semibold text-slate-700 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <div className={`${headingFont.className} text-xl font-bold text-slate-900`}>Relatório restrito aos administradores.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${bodyFont.className} min-h-screen bg-linear-to-b from-stone-100 via-amber-50/40 to-slate-100 text-slate-900`}>
      <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <div className="mb-4 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:mb-6 sm:rounded-[28px] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link href="/gerencial/processos" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950 sm:text-base">
                <ArrowLeft className="h-4 w-4" /> Voltar para processos
              </Link>
              <h1 className={`${headingFont.className} text-2xl font-extrabold tracking-tight text-slate-950 sm:text-4xl`}>Produção por Valor de Causa</h1>
              <p className="mt-2 max-w-3xl text-sm leading-5 text-slate-700 sm:text-lg sm:leading-6">Resumo da produção, envios e assinaturas, com os valores mantidos no período filtrado.</p>
            </div>
            <div className="grid gap-3 sm:flex sm:flex-row sm:items-end">
              <label className="text-sm font-semibold text-slate-700 sm:text-base">
                <div className="mb-1.5 flex items-center gap-2"><Calendar className="h-4 w-4" /> Data inicial</div>
                <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 sm:text-base" />
              </label>
              <label className="text-sm font-semibold text-slate-700 sm:text-base">
                <div className="mb-1.5 flex items-center gap-2"><Calendar className="h-4 w-4" /> Data final</div>
                <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 sm:text-base" />
              </label>
              <button onClick={fetchReport} className={`${headingFont.className} inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 text-sm font-bold text-slate-950 hover:bg-amber-400 sm:w-auto sm:text-base`}>
                <Filter className="h-4 w-4" /> Gerar na tela
              </button>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-lg font-semibold text-slate-700 shadow-sm">Gerando relatório...</div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-base font-semibold text-rose-700 shadow-sm">{error}</div>
        )}

        {!loading && report && (
          <div className="space-y-6">

            {/* ── Cards individuais por gerente ───────────────────────────── */}
            {gerenteCards.map((gerente) => (
              <section key={gerente.gerente_id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm sm:rounded-[28px]">
                <div className="bg-linear-to-r from-amber-100 via-orange-50 to-white px-4 py-4 sm:px-6 sm:py-5">
                  <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className={`${headingFont.className} flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-3xl`}>
                        <User2 className="h-5 w-5 text-amber-700 sm:h-6 sm:w-6" /> {gerente.gerente_nome}
                      </div>
                      {gerente.gerente_email && <div className="mt-1 text-sm font-semibold text-slate-700 sm:text-base">{gerente.gerente_email}</div>}
                    </div>
                    <div className={`${headingFont.className} w-fit rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-950 sm:px-4 sm:py-1.5 sm:text-sm`}>
                      Produção por gerente
                    </div>
                  </div>

                  {/* Totais principais */}
                  <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-slate-600`}>Processos no período</div>
                      <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-slate-950 sm:text-4xl`}>{gerente.totais.quantidade}</div>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-emerald-800`}>Produção total</div>
                      <div className={`${headingFont.className} mt-2 text-2xl font-extrabold leading-tight text-emerald-950 sm:text-3xl`}>{fmtBRL(gerente.totais.valor_causa_total)}</div>
                    </div>
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-sky-800`}>Acordo provável</div>
                      <div className={`${headingFont.className} mt-2 text-2xl font-extrabold leading-tight text-sky-950 sm:text-3xl`}>{fmtBRL(gerente.totais.acordo_provavel_total)}</div>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-amber-800`}>Enviados</div>
                      <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-amber-950 sm:text-4xl`}>{gerente.enviados.quantidade}</div>
                      <div className="mt-2 text-sm font-semibold text-amber-900 sm:text-base">Valor: {fmtBRL(gerente.enviados.valor_causa_total)}</div>
                    </div>
                    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-orange-800`}>Aguardando assinatura</div>
                      <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-orange-950 sm:text-4xl`}>{gerente.aguardandoAssinatura.quantidade}</div>
                      <div className="mt-2 text-sm font-semibold text-orange-900 sm:text-base">Valor: {fmtBRL(gerente.aguardandoAssinatura.valor_causa_total)}</div>
                    </div>
                    <div className="rounded-2xl border border-lime-200 bg-lime-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-lime-800`}>Assinados</div>
                      <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-lime-950 sm:text-4xl`}>{gerente.assinados.quantidade}</div>
                      <div className="mt-2 text-sm font-semibold text-lime-900 sm:text-base">Valor: {fmtBRL(gerente.assinados.valor_causa_total)}</div>
                    </div>
                    <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-cyan-800`}>Assinados fora</div>
                      <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-cyan-950 sm:text-4xl`}>{gerente.assinadosFora.quantidade}</div>
                      <div className="mt-2 text-sm font-semibold text-cyan-900 sm:text-base">Valor: {fmtBRL(gerente.assinadosFora.valor_causa_total)}</div>
                    </div>

                    {/* Acordos efetivos */}
                    {gerente.acordos && gerente.acordos.quantidade > 0 && (
                      <div className="rounded-2xl border border-green-300 bg-green-50 p-4 shadow-sm min-[420px]:col-span-2 xl:col-span-1">
                        <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-green-800`}>Acordos efetivos</div>
                        <div className={`${headingFont.className} mt-2 text-3xl font-extrabold text-green-950 sm:text-4xl`}>{gerente.acordos.quantidade}</div>
                        <div className="mt-2 text-sm font-semibold text-green-900 sm:text-base">Honorários: {fmtBRL(gerente.acordos.honorarios_total)}</div>
                      </div>
                    )}

                    {/* Comissão gerente */}
                    {gerente.acordos && gerente.acordos.quantidade > 0 && (
                      <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 shadow-sm min-[420px]:col-span-2 xl:col-span-1">
                        <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-violet-800`}>Comissão gerente</div>
                        <div className={`${headingFont.className} mt-2 text-2xl font-extrabold leading-tight text-violet-950 sm:text-3xl`}>{fmtBRL(gerente.acordos.comissao_gerente)}</div>
                        <div className="mt-2 text-sm font-semibold text-violet-900 sm:text-base">÷12 sobre honorários</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 bg-slate-50 p-4 sm:p-6 md:grid-cols-2">
                  <div className="rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 to-orange-100 p-5 shadow-sm">
                    <div className={`${headingFont.className} text-base font-bold text-amber-950`}>Enviados</div>
                    <div className="mt-3 space-y-1.5 text-sm font-semibold leading-6 text-slate-800 sm:text-base">
                      <div>Quantidade: <strong>{gerente.enviados.quantidade}</strong></div>
                      <div>Valor da causa: <strong>{fmtBRL(gerente.enviados.valor_causa_total)}</strong></div>
                      <div>Acordo provável: <strong>{fmtBRL(gerente.enviados.acordo_provavel_total)}</strong></div>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-orange-200 bg-linear-to-br from-orange-50 to-rose-100 p-5 shadow-sm">
                    <div className={`${headingFont.className} text-base font-bold text-orange-950`}>Aguardando assinatura</div>
                    <div className="mt-3 space-y-1.5 text-sm font-semibold leading-6 text-slate-800 sm:text-base">
                      <div>Quantidade: <strong>{gerente.aguardandoAssinatura.quantidade}</strong></div>
                      <div>Valor da causa: <strong>{fmtBRL(gerente.aguardandoAssinatura.valor_causa_total)}</strong></div>
                      <div>Acordo provável: <strong>{fmtBRL(gerente.aguardandoAssinatura.acordo_provavel_total)}</strong></div>
                    </div>
                  </div>
                </div>
              </section>
            ))}

            {!gerenteCards.length && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-lg font-semibold text-slate-700 shadow-sm">
                Nenhum gerente com produção no período informado.
              </div>
            )}

            {/* ── Total geral + Ranking (rodapé) ──────────────────────────── */}
            {gerenteCards.length > 0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6">
                <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.18em] text-slate-500`}>Resumo do período</div>
                <h2 className={`${headingFont.className} mt-2 text-xl font-extrabold tracking-tight text-slate-950 sm:text-3xl`}>Total geral e ranking de produção</h2>

                {/* Totais gerais */}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-slate-600`}>Processos</div>
                    <div className={`${headingFont.className} mt-2 text-4xl font-extrabold text-slate-950`}>{report.totais.quantidade}</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-emerald-800`}>Produção total</div>
                    <div className={`${headingFont.className} mt-2 text-3xl font-extrabold leading-tight text-emerald-950`}>{fmtBRL(report.totais.valor_causa_total)}</div>
                  </div>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-sky-800`}>Acordo provável</div>
                    <div className={`${headingFont.className} mt-2 text-3xl font-extrabold leading-tight text-sky-950`}>{fmtBRL(report.totais.acordo_provavel_total)}</div>
                  </div>
                  {report.acordos_geral && report.acordos_geral.quantidade > 0 && (
                    <div className="rounded-2xl border border-green-300 bg-green-50 p-4">
                      <div className={`${headingFont.className} text-sm font-bold uppercase tracking-[0.12em] text-green-800`}>Acordos efetivos</div>
                      <div className={`${headingFont.className} mt-2 text-4xl font-extrabold text-green-950`}>{report.acordos_geral.quantidade}</div>
                      <div className="mt-1 text-sm font-semibold text-green-900">Honorários: {fmtBRL(report.acordos_geral.honorarios_total)}</div>
                    </div>
                  )}
                </div>

                {/* Ranking */}
                <div className="mt-6 rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 via-orange-50 to-white p-4 shadow-sm">
                  <div className={`${headingFont.className} text-base font-bold uppercase tracking-[0.14em] text-amber-900`}>Ranking de produção</div>
                  <p className="mt-1 text-sm font-semibold text-slate-600">Ordenado pela maior produção total no período.</p>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-amber-100 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-amber-100 bg-amber-50">
                          <th className={`${headingFont.className} px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-amber-900`}>#</th>
                          <th className={`${headingFont.className} px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-amber-900`}>Gerente</th>
                          <th className={`${headingFont.className} px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-amber-900`}>Processos</th>
                          <th className={`${headingFont.className} px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-amber-900`}>Produção total</th>
                          <th className={`${headingFont.className} px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-amber-900`}>Acordo provável</th>
                          <th className={`${headingFont.className} px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-green-800`}>Comissão gerente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-50">
                        {gerenteCards.map((gerente, index) => (
                          <tr key={`ranking-${gerente.gerente_id}`} className={index % 2 === 0 ? "bg-white" : "bg-amber-50/40"}>
                            <td className={`${headingFont.className} px-4 py-3 font-extrabold text-amber-700`}>#{index + 1}</td>
                            <td className="px-4 py-3 font-bold text-slate-950">{gerente.gerente_nome}</td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-700">{gerente.totais.quantidade}</td>
                            <td className={`${headingFont.className} px-4 py-3 text-right font-extrabold text-emerald-900`}>{fmtBRL(gerente.totais.valor_causa_total)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-sky-900">{fmtBRL(gerente.totais.acordo_provavel_total)}</td>
                            <td className={`${headingFont.className} px-4 py-3 text-right font-extrabold text-green-800`}>
                              {gerente.acordos && gerente.acordos.quantidade > 0 ? fmtBRL(gerente.acordos.comissao_gerente) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-amber-200 bg-amber-100/70">
                          <td className={`${headingFont.className} px-4 py-3 font-extrabold text-amber-900`} colSpan={2}>Total</td>
                          <td className="px-4 py-3 text-right font-extrabold text-slate-900">{report.totais.quantidade}</td>
                          <td className={`${headingFont.className} px-4 py-3 text-right font-extrabold text-emerald-950`}>{fmtBRL(report.totais.valor_causa_total)}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-sky-950">{fmtBRL(report.totais.acordo_provavel_total)}</td>
                          <td className={`${headingFont.className} px-4 py-3 text-right font-extrabold text-green-900`}>
                            {report.acordos_geral && report.acordos_geral.quantidade > 0 ? fmtBRL(report.acordos_geral.comissao_gerente) : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
