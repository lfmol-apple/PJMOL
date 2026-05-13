"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend);

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");

const fmtBRL = (v: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—";

const CORES = ["#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#6366f1"];

function KpiCard({ label, value, sub, color = "indigo" }: { label: string; value: string; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
  };
  return (
    <div className={`rounded-xl border-2 px-5 py-4 ${colors[color] || colors.indigo}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs opacity-60">{sub}</div>}
    </div>
  );
}

function BarraHorizontal({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="w-36 shrink-0 truncate text-right text-xs font-medium text-slate-700" title={label}>{label}</div>
      <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
        <div className="h-full rounded-full flex items-center pl-2" style={{ width: `${pct}%`, backgroundColor: color }}>
          <span className="text-[10px] font-bold text-white whitespace-nowrap">{value}</span>
        </div>
      </div>
      {sub && <div className="w-24 shrink-0 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  );
}

function Insight({ emoji, titulo, texto, cor }: { emoji: string; titulo: string; texto: string; cor: string }) {
  const bgs: Record<string, string> = {
    indigo: "bg-indigo-50 border-indigo-200",
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    sky: "bg-sky-50 border-sky-200",
    rose: "bg-rose-50 border-rose-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${bgs[cor] || bgs.indigo}`}>
      <div className="flex items-start gap-2">
        <span className="text-xl">{emoji}</span>
        <div>
          <div className="font-semibold text-slate-800 text-sm">{titulo}</div>
          <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{texto}</div>
        </div>
      </div>
    </div>
  );
}

type Rec = { emoji: string; cor: string; titulo: string; texto: string };

function gerarRecomendacoes(data: any): Rec[] {
  const adms: any[]       = data.por_administradora || [];
  const estados: any[]    = data.por_estado || [];
  const faixas: any[]     = data.por_faixa || [];
  const meses: any[]      = [...(data.por_mes || [])].reverse();
  const matriz: any[]     = data.matriz_adm_estado || [];
  const resultados: any[] = data.resultados || [];
  const advogados: any[]       = data.por_advogado || [];
  const comarcas: any[]        = data.por_comarca || [];
  const concAdmAdv: any[]      = data.concentracao_adm_adv || [];
  const t = data.totais || {};
  const total = t.total_processos || 1;
  const recs: Rec[] = [];

  // 1. Nicho principal: top combo adm × estado
  const topCombo = matriz[0];
  if (topCombo) {
    recs.push({
      emoji: "🎯", cor: "indigo",
      titulo: `Nicho #1: ${topCombo.adm} em ${topCombo.estado} — ${topCombo.total} processos`,
      texto: `Maior concentração da base. Ticket médio ${fmtBRL(topCombo.avg_causa)}. Representa ${((topCombo.total / total) * 100).toFixed(1)}% da carteira total.`,
    });
  }

  // 2. Segundo nicho relevante
  const combo2 = matriz.find((m: any) => !(m.adm === topCombo?.adm && m.estado === topCombo?.estado));
  if (combo2) {
    recs.push({
      emoji: "🥈", cor: "sky",
      titulo: `Nicho #2: ${combo2.adm} em ${combo2.estado} — ${combo2.total} processos`,
      texto: `Ticket médio ${fmtBRL(combo2.avg_causa)}. Representa ${((combo2.total / total) * 100).toFixed(1)}% da carteira. Segundo maior combinação adm × estado.`,
    });
  }

  // 3. Oportunidade de alto ticket
  const premiumCombos = [...matriz].sort((a: any, b: any) => b.avg_causa - a.avg_causa);
  const premium = premiumCombos.find((m: any) => m.avg_causa > 40000 && m.total >= 5);
  if (premium) {
    recs.push({
      emoji: "💎", cor: "sky",
      titulo: `Alto valor: ${premium.adm} / ${premium.estado} — ticket médio ${fmtBRL(premium.avg_causa)}`,
      texto: `${premium.total} processos nesse nicho. Ticket acima da média geral (${fmtBRL(t.ticket_medio)}). Honorários potenciais mais elevados por caso.`,
    });
  }

  // 4. Faixa de valor dominante
  const topFaixa = [...faixas].sort((a: any, b: any) => b.total - a.total)[0];
  if (topFaixa) {
    const pct = ((topFaixa.total / total) * 100).toFixed(0);
    const segunda = [...faixas].sort((a: any, b: any) => b.total - a.total)[1];
    recs.push({
      emoji: "📦", cor: "emerald",
      titulo: `${pct}% da carteira está na faixa ${topFaixa.faixa}`,
      texto: `${topFaixa.total} processos nessa faixa (média ${topFaixa.avg_pct_honor}% de honorários).${segunda ? ` Segunda faixa mais comum: ${segunda.faixa} com ${segunda.total} processos.` : ""}`,
    });
  }

  // 5. Tendência mensal
  if (meses.length >= 3) {
    const ult3 = meses.slice(-3);
    const ant3 = meses.length >= 6 ? meses.slice(-6, -3) : [];
    const mediaUlt = ult3.reduce((s: number, m: any) => s + m.novos, 0) / ult3.length;
    const mediaAnt = ant3.length ? ant3.reduce((s: number, m: any) => s + m.novos, 0) / ant3.length : mediaUlt;
    const delta = mediaAnt > 0 ? ((mediaUlt - mediaAnt) / mediaAnt) * 100 : 0;
    const dir = delta > 10 ? "📈 crescendo" : delta < -10 ? "📉 desacelerando" : "➡️ estável";
    const msg = delta > 10
      ? `Alta de ${delta.toFixed(0)}% em relação ao período anterior. Média dos últimos 3 meses: ${Math.round(mediaUlt)} processos/mês vs ${Math.round(mediaAnt)} no período anterior.`
      : delta < -10
      ? `Queda de ${Math.abs(delta).toFixed(0)}% em relação ao período anterior. Média dos últimos 3 meses: ${Math.round(mediaUlt)} processos/mês vs ${Math.round(mediaAnt)} no período anterior.`
      : `Ritmo consistente. Média dos últimos 3 meses: ${Math.round(mediaUlt)} processos/mês. Variação de ${delta.toFixed(0)}% em relação ao período anterior.`;
    recs.push({
      emoji: "📅", cor: "amber",
      titulo: `Captação ${dir} — média ${Math.round(mediaUlt)} proc./mês (últimos 3 meses)`,
      texto: msg,
    });
  }

  // 6. Estado subexplorado
  const sub = estados.slice(2, 10).find((e: any) => e.total >= 10);
  if (sub) {
    const top2pct = ((estados.slice(0, 2).reduce((s: number, e: any) => s + e.total, 0) / total) * 100).toFixed(0);
    recs.push({
      emoji: "🗺️", cor: "sky",
      titulo: `${sub.estado}: ${sub.total} processos — concentração fora dos 2 principais`,
      texto: `${top2pct}% da base está nos 2 estados principais. ${sub.estado} tem ${sub.total} processos com ticket médio de ${fmtBRL(sub.avg_causa)}. Taxa de acordo: ${sub.taxa_acordo ?? "—"}%.`,
    });
  }

  // 7. Concentração de advogado por administradora → risco de enrolação
  const admGroups: Record<string, any[]> = {};
  for (const row of concAdmAdv) {
    if (!admGroups[row.adm_nome]) admGroups[row.adm_nome] = [];
    admGroups[row.adm_nome].push(row);
  }
  let worstAdm = "";
  let worstAdv = "";
  let worstPct = 0;
  let worstTotal = 0;
  for (const [adm, rows] of Object.entries(admGroups)) {
    const admTotal = rows.reduce((s: number, r: any) => s + r.total, 0);
    if (admTotal < 5) continue;
    const top = rows[0];
    const pct = (top.total / admTotal) * 100;
    if (pct > worstPct) { worstPct = pct; worstAdm = adm; worstAdv = top.advogado_nome; worstTotal = admTotal; }
  }
  if (worstPct >= 60) {
    recs.push({
      emoji: "⚠️", cor: "rose",
      titulo: `Concentração: ${Math.round(worstPct)}% dos processos da ${worstAdm} com um único advogado`,
      texto: `${nomeAdv(worstAdv)} tem ${Math.round(worstPct)}% dos ${worstTotal} processos da ${worstAdm}. Administradoras identificam esse padrão e tendem a dificultar negociações. Distribuir entre mais advogados reduz a exposição.`,
    });
  }

  // 8. Administradora emergente
  const adm2 = adms[1];
  if (adm2 && adms[0]) {
    const razao = adm2.total / adms[0].total;
    if (razao < 0.4) {
      recs.push({
        emoji: "🚀", cor: "emerald",
        titulo: `${nomeAdm(adm2.administradora)}: ${adm2.total} processos — ${(razao * 100).toFixed(0)}% do volume da líder`,
        texto: `Segunda maior administradora na base. Ticket médio de ${fmtBRL(adm2.avg_causa)}. ${adm2.acordos} acordos fechados (${adm2.taxa_acordo}% de taxa).`,
      });
    }
  }

  // 9. Advogado com melhor taxa de acordo
  const advTop = advogados.filter((a: any) => a.acordos >= 5).sort((a: any, b: any) => b.taxa_acordo - a.taxa_acordo)[0];
  const advVolume = advogados[0];
  if (advTop && advVolume && advTop.advogado_nome !== advVolume.advogado_nome) {
    recs.push({
      emoji: "⚖️", cor: "indigo",
      titulo: `${nomeAdv(advTop.advogado_nome)}: melhor taxa de acordo — ${advTop.taxa_acordo}%`,
      texto: `${advTop.acordos} acordos em ${advTop.total} processos. ${advTop.em_andamento ?? "—"} casos ainda em andamento. Ticket médio ${fmtBRL(advTop.avg_causa)}.`,
    });
  }

  // 10. Comarca com melhor taxa de acordo
  const comarcaTop = comarcas.filter((c: any) => c.total >= 10).sort((a: any, b: any) => b.taxa_acordo - a.taxa_acordo)[0];
  const comarcaMaior = comarcas[0];
  if (comarcaTop && comarcaTop.comarca !== comarcaMaior?.comarca) {
    const baixaTaxa = comarcas.filter((c: any) => c.total >= 10 && c.taxa_acordo < 5);
    recs.push({
      emoji: "🏛️", cor: "emerald",
      titulo: `${comarcaTop.comarca}: ${comarcaTop.taxa_acordo}% de taxa de acordo`,
      texto: `${comarcaTop.acordos} acordos em ${comarcaTop.total} processos. Ticket médio ${fmtBRL(comarcaTop.avg_causa)}.${baixaTaxa.length > 0 ? ` Comarcas com taxa abaixo de 5%: ${baixaTaxa.map((c: any) => c.comarca.split(" —")[0].split(" -")[0]).join(", ")}.` : ""}`,
    });
  }

  return recs;
}

function nomeAdv(n: string): string {
  if (!n) return "—";
  const parts = n.trim().split(/\s+/);
  if (parts.length <= 2) return n;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function nomeAdm(a: string): string {
  if (!a) return "—";
  return a
    .replace(/ADMINISTRADORA DE CONSORCIO.*$/i, "")
    .replace(/ADMINISTRADORA DE CONSORCIOS.*$/i, "")
    .replace(/ADMINISTRADORA DE CONS.*$/i, "")
    .replace(/LTDA\.?$/i, "")
    .replace(/S\.?A\.?$/i, "")
    .trim()
    .split(" ").slice(0, 3).join(" ");
}

export default function DashboardCampanha() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [atualizado, setAtualizado] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API_BASE}/analytics/campanha`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setAtualizado(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Analisando base de dados...</p>
      </div>
    </div>
  );

  if (err) return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center text-red-600">
        <p className="font-bold">Erro ao carregar dados</p>
        <p className="text-sm mt-1">{err}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Tentar novamente</button>
      </div>
    </div>
  );

  const t = data.totais;
  const adms: any[]      = data.por_administradora || [];
  const estados: any[]   = data.por_estado || [];
  const cidades: any[]   = data.por_cidade || [];
  const faixas: any[]    = data.por_faixa || [];
  const meses: any[]     = [...(data.por_mes || [])].reverse();
  const matriz: any[]    = data.matriz_adm_estado || [];
  const resultados: any[] = data.resultados || [];
  const advogados: any[] = data.por_advogado || [];
  const comarcas: any[]          = data.por_comarca || [];
  const gerentes: any[]          = data.por_gerente || [];
  const velAdm: any[]            = data.velocidade_adm || [];
  const velEstado: any[]         = data.velocidade_estado || [];
  const tempoAdordAdm: any[]     = data.tempo_ate_acordo_adm || [];
  const tempoAcordAdv: any[]     = data.tempo_ate_acordo_adv || [];
  const distTempo: any[]         = data.dist_tempo_acordo || [];
  const advDisp: any[]           = data.advogados_disponiveis || [];

  const maxAdm = Math.max(...adms.map((a: any) => a.total), 1);
  const maxEst = Math.max(...estados.map((e: any) => e.total), 1);
  const maxCid = Math.max(...cidades.map((c: any) => c.total), 1);
  const maxAdv = Math.max(...advogados.map((a: any) => a.total), 1);
  const maxComarca = Math.max(...comarcas.map((c: any) => c.total), 1);

  // Doughnut - administradoras
  const doughnutData = {
    labels: adms.slice(0, 7).map((a: any) => nomeAdm(a.administradora)),
    datasets: [{
      data: adms.slice(0, 7).map((a: any) => a.total),
      backgroundColor: CORES,
      borderWidth: 2,
      borderColor: "#fff",
    }],
  };

  // Line - meses
  const lineData = {
    labels: meses.map((m: any) => {
      const [ano, mes] = m.mes.split("-");
      return `${mes}/${ano.slice(2)}`;
    }),
    datasets: [{
      label: "Novos processos",
      data: meses.map((m: any) => m.novos),
      borderColor: "#4f46e5",
      backgroundColor: "rgba(79,70,229,0.1)",
      fill: true,
      tension: 0.4,
      pointBackgroundColor: "#4f46e5",
    }],
  };

  // Bar - faixas
  const barFaixaData = {
    labels: faixas.map((f: any) => f.faixa),
    datasets: [{
      label: "Processos",
      data: faixas.map((f: any) => f.total),
      backgroundColor: ["#94a3b8","#4f46e5","#0ea5e9","#10b981","#f59e0b","#ef4444"],
      borderRadius: 6,
    }],
  };

  // Doughnut - resultados
  const resLabels = resultados.map((r: any) => r.resultado || "Em andamento");
  const resCores: Record<string, string> = {
    "Em andamento": "#94a3b8", "Acordo": "#10b981", "Ganhamos": "#4f46e5",
    "Sem Julgamento": "#f59e0b", "Perdemos": "#ef4444",
  };
  const doughnutRes = {
    labels: resLabels,
    datasets: [{
      data: resultados.map((r: any) => r.total),
      backgroundColor: resLabels.map((l: string) => resCores[l] || "#6366f1"),
      borderWidth: 2, borderColor: "#fff",
    }],
  };

  // Matriz prioridade: estados top com avg_causa e volume
  const matrizEstados = estados.slice(0, 12).map((e: any) => {
    const score = (e.total / maxEst) * 60 + Math.min((e.avg_causa || 0) / 100000, 1) * 40;
    return { ...e, score: Math.round(score) };
  }).sort((a: any, b: any) => b.score - a.score);

  const prioridade = (score: number) => {
    if (score >= 50) return { label: "Alta", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
    if (score >= 25) return { label: "Média", cls: "bg-amber-100 text-amber-800 border-amber-300" };
    return { label: "Baixa", cls: "bg-slate-100 text-slate-700 border-slate-300" };
  };

  const chartOpts = (title: string) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: false } },
    scales: { x: { grid: { display: false } }, y: { grid: { color: "#f1f5f9" } } },
  });

  const donutOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" as const, labels: { boxWidth: 12, font: { size: 11 } } } } };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Dashboard Tático de Campanha</h1>
          <p className="text-sm text-slate-500 mt-0.5">Onde e como concentrar recursos no Instagram · Atualizado: {atualizado}</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          ↻ Atualizar dados
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total de processos" value={String(t.total_processos)} color="indigo" />
        <KpiCard label="Ticket médio" value={fmtBRL(t.ticket_medio)} color="sky" />
        <KpiCard label="Carteira total" value={fmtBRL(t.carteira_total)} color="emerald" />
        <KpiCard label="Acordos fechados" value={String(t.total_acordos)} sub={`${((t.total_acordos/t.total_processos)*100).toFixed(1)}% de conversão`} color="purple" />
        <KpiCard label="Administradoras" value={String(t.total_adms)} color="amber" />
      </div>

      {/* Linha 1: Administradoras + Resultados */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Administradoras — volume de processos</h2>
          <p className="text-xs text-slate-500 mb-4">Concentre criativos nas marcas com mais clientes na base</p>
          <div className="space-y-1">
            {adms.slice(0, 10).map((a: any, i: number) => (
              <BarraHorizontal
                key={a.administradora}
                label={nomeAdm(a.administradora)}
                value={a.total}
                max={maxAdm}
                color={CORES[i % CORES.length]}
                sub={`${a.acordos ?? 0} acordos (${a.taxa_acordo ?? 0}%)`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Status da carteira</h2>
          <p className="text-xs text-slate-500 mb-3">Para prova social nas campanhas</p>
          <div className="h-52">
            <Doughnut data={doughnutRes} options={donutOpts} />
          </div>
          <div className="mt-3 space-y-1">
            {resultados.map((r: any) => (
              <div key={r.resultado} className="flex justify-between text-xs">
                <span className="text-slate-600">{r.resultado || "Em andamento"}</span>
                <span className="font-semibold text-slate-800">{r.total} · {fmtBRL(r.avg_causa)} méd.</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 2: Estados + Cidades */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Estados — volume × ticket médio</h2>
          <p className="text-xs text-slate-500 mb-4">Priorize onde há massa + valor por processo</p>
          <div className="space-y-1">
            {estados.slice(0, 12).map((e: any, i: number) => (
              <BarraHorizontal
                key={e.estado}
                label={e.estado || "N/I"}
                value={e.total}
                max={maxEst}
                color={CORES[i % CORES.length]}
                sub={`${e.acordos ?? 0} acordos (${e.taxa_acordo ?? 0}%)`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Cidades — top 15</h2>
          <p className="text-xs text-slate-500 mb-4">Segmentação geográfica precisa no Meta Ads</p>
          <div className="space-y-1">
            {cidades.slice(0, 15).map((c: any, i: number) => (
              <BarraHorizontal
                key={`${c.cidade}-${c.estado}`}
                label={`${c.cidade} / ${c.estado}`}
                value={c.total}
                max={maxCid}
                color={CORES[i % CORES.length]}
                sub={fmtBRL(c.avg_causa) + " méd."}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Linha 3: Faixas + Tendência mensal */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Faixa de valor da causa</h2>
          <p className="text-xs text-slate-500 mb-4">Orienta linguagem e promessa do criativo</p>
          <div className="h-52">
            <Bar data={barFaixaData} options={{ ...chartOpts("faixas"), plugins: { legend: { display: false } } } as any} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {faixas.map((f: any) => (
              <div key={f.faixa} className="rounded-lg bg-slate-50 p-2 text-center">
                <div className="text-xs text-slate-500">{f.faixa}</div>
                <div className="font-bold text-slate-800">{f.total}</div>
                <div className="text-[10px] text-slate-400">{f.avg_pct_honor}% honor.</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Captação mensal</h2>
          <p className="text-xs text-slate-500 mb-4">Sazonalidade orienta quando investir mais verba</p>
          <div className="h-52">
            <Line data={lineData} options={{ ...chartOpts("meses"), plugins: { legend: { display: false } } } as any} />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-600 flex-wrap">
            {meses.slice(-3).reverse().map((m: any) => (
              <div key={m.mes} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-center">
                <div className="font-bold text-indigo-700">{m.novos} proc.</div>
                <div className="text-slate-500">{m.mes}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Linha 3b: Em andamento vs Concluídos */}
      {(() => {
        const emAndamento = resultados.find((r: any) => !r.resultado || r.resultado === "Em andamento");
        const qtdAndamento = emAndamento?.total ?? 0;
        const concluidos = resultados.filter((r: any) => r.resultado && r.resultado !== "Em andamento");
        const qtdConcluidos = concluidos.reduce((s: number, r: any) => s + r.total, 0);
        const total = qtdAndamento + qtdConcluidos;
        const pctAndamento = total > 0 ? (qtdAndamento / total) * 100 : 0;
        const pctConcluidos = 100 - pctAndamento;

        const corRes: Record<string, string> = {
          Acordo: "#10b981",
          Ganhamos: "#4f46e5",
          "Sem Julgamento": "#f59e0b",
          Perdemos: "#ef4444",
        };

        return (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Em andamento × Desfecho</h2>
            <p className="text-xs text-slate-500 mb-5">Proporção da carteira ativa vs processos já encerrados — referência para prova social e capacidade operacional</p>

            {/* Barra empilhada */}
            <div className="mb-5">
              <div className="flex h-10 w-full rounded-xl overflow-hidden shadow-inner">
                <div className="flex items-center justify-center text-white text-xs font-bold" style={{ width: `${pctAndamento}%`, backgroundColor: "#94a3b8" }}>
                  {pctAndamento >= 10 && `${pctAndamento.toFixed(0)}%`}
                </div>
                {concluidos.map((r: any) => {
                  const pct = total > 0 ? (r.total / total) * 100 : 0;
                  return (
                    <div key={r.resultado} className="flex items-center justify-center text-white text-xs font-bold" style={{ width: `${pct}%`, backgroundColor: corRes[r.resultado] || "#6366f1" }}>
                      {pct >= 5 && `${pct.toFixed(0)}%`}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#94a3b8" }} />Em andamento</span>
                {concluidos.map((r: any) => (
                  <span key={r.resultado} className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: corRes[r.resultado] || "#6366f1" }} />{r.resultado}
                  </span>
                ))}
              </div>
            </div>

            {/* Cards de detalhe */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-center">
                <div className="text-2xl font-extrabold text-slate-700">{qtdAndamento}</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">Em andamento</div>
                <div className="text-xs text-slate-400 mt-0.5">{pctAndamento.toFixed(1)}% da carteira</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">{fmtBRL(emAndamento?.avg_causa ?? 0)} méd.</div>
              </div>
              {concluidos.map((r: any) => {
                const pct = total > 0 ? (r.total / total) * 100 : 0;
                const cor = corRes[r.resultado] || "#6366f1";
                return (
                  <div key={r.resultado} className="rounded-xl border-2 p-4 text-center" style={{ borderColor: cor + "60", backgroundColor: cor + "0d" }}>
                    <div className="text-2xl font-extrabold" style={{ color: cor }}>{r.total}</div>
                    <div className="text-xs font-semibold text-slate-600 mt-0.5">{r.resultado}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{pct.toFixed(1)}% da carteira</div>
                    <div className="text-xs text-slate-500 mt-1 font-medium">{fmtBRL(r.avg_causa ?? 0)} méd.</div>
                  </div>
                );
              })}
            </div>

          </div>
        );
      })()}

      {/* Linha 4: Matriz de prioridade */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Matriz de prioridade geográfica</h2>
        <p className="text-xs text-slate-500 mb-4">Score = volume (60%) + ticket médio (40%) · Foca verba onde ambos são altos</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Estado</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Processos</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Ticket médio</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Carteira</th>
                <th className="text-center py-2 px-3 font-semibold text-slate-600">Score</th>
                <th className="text-center py-2 px-3 font-semibold text-slate-600">Prioridade</th>
              </tr>
            </thead>
            <tbody>
              {matrizEstados.map((e: any) => {
                const p = prioridade(e.score);
                return (
                  <tr key={e.estado} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3 font-semibold text-slate-800">{e.estado}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{e.total}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtBRL(e.avg_causa)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-600">{fmtBRL(e.sum_causa)}</td>
                    <td className="py-2 px-3 text-center">
                      <div className="mx-auto w-24 rounded-full bg-slate-100 h-2 overflow-hidden">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${e.score}%` }} />
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{e.score}/100</div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${p.cls}`}>{p.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Linha 5: Matriz ADM × Estado */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Top combinações Administradora × Estado</h2>
        <p className="text-xs text-slate-500 mb-4">Cada célula = um nicho de anúncio específico (ex: "Tem Embracon em SP?") — quanto maior o volume, mais relevante o criativo</p>
        <div className="overflow-x-auto">
          <div className="flex flex-wrap gap-2">
            {matriz.slice(0, 30).map((m: any, i: number) => {
              const intensidade = Math.min(m.total / 30, 1);
              const bg = intensidade > 0.6 ? "bg-indigo-600 text-white" : intensidade > 0.3 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-700";
              return (
                <div key={`${m.adm}-${m.estado}-${i}`} className={`rounded-xl px-3 py-2 text-center min-w-[100px] ${bg}`}>
                  <div className="text-[11px] font-bold">{m.adm}</div>
                  <div className="text-[10px] opacity-80">{m.estado}</div>
                  <div className="text-base font-extrabold">{m.total}</div>
                  <div className="text-[10px] opacity-70">{fmtBRL(m.avg_causa)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Linha 6: Advogados × Comarcas */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Eficiência por Advogado — tabela + racional de alocação */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Eficiência por Advogado</h2>
          <p className="text-xs text-slate-500 mb-3">Taxa de acordo × exposição atual — base para o racional de alocação diária</p>

          {/* Padrão detectado: novos advogados fecham mais */}
          {(() => {
            const novos = advogados.filter((a: any) => {
              if (!a.primeiro_caso) return false;
              const d = new Date(a.primeiro_caso);
              return d >= new Date("2025-11-15") && a.taxa_acordo >= 20;
            });
            const antigos = advogados.filter((a: any) => {
              if (!a.primeiro_caso) return false;
              const d = new Date(a.primeiro_caso);
              return d < new Date("2025-11-15") && a.taxa_acordo < 5 && a.total >= 30;
            });
            if (novos.length > 0 && antigos.length > 0) {
              const mediaNovas = (novos.reduce((s: number, a: any) => s + a.taxa_acordo, 0) / novos.length).toFixed(0);
              const mediaAntigas = (antigos.reduce((s: number, a: any) => s + a.taxa_acordo, 0) / antigos.length).toFixed(1);
              return (
                <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
                  <strong>⚠️ Padrão identificado:</strong> Advogados que entraram antes de 15/nov/25 têm taxa média de {mediaAntigas}% de acordo — os que entraram depois: {mediaNovas}%. As administradoras provavelmente identificaram os advogados de maior volume e estão sistematicamente atrasando os processos deles. <strong>Priorize alocar novos casos nos advogados com maior taxa.</strong>
                </div>
              );
            }
            return null;
          })()}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 font-semibold text-slate-600">Advogado</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600">Vigentes</th>
                  <th className="text-right py-2 px-2 font-semibold text-slate-600">Acordos</th>
                  <th className="text-center py-2 px-2 font-semibold text-slate-600">Taxa</th>
                  <th className="text-center py-2 px-2 font-semibold text-slate-600">Alocar?</th>
                </tr>
              </thead>
              <tbody>
                {[...advogados].sort((a: any, b: any) => {
                  const scoreA = a.taxa_acordo * 0.7 + Math.max(0, 1 - a.em_andamento / 50) * 30;
                  const scoreB = b.taxa_acordo * 0.7 + Math.max(0, 1 - b.em_andamento / 50) * 30;
                  return scoreB - scoreA;
                }).map((a: any, i: number) => {
                  const taxa = a.taxa_acordo ?? 0;
                  const score = taxa * 0.7 + Math.max(0, 1 - (a.em_andamento ?? 0) / 50) * 30;
                  const recAlocar = taxa >= 20 && (a.em_andamento ?? 0) < 50;
                  const saturado = taxa < 5 && (a.total ?? 0) >= 30;
                  const txCls = taxa >= 20 ? "text-emerald-700 bg-emerald-100" : taxa >= 10 ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-100";
                  return (
                    <tr key={a.advogado_nome} className={`border-b border-slate-100 hover:bg-slate-50 ${recAlocar && i === 0 ? "bg-emerald-50" : saturado ? "bg-rose-50/50" : ""}`}>
                      <td className="py-2 px-2 font-medium text-slate-800 max-w-[130px] truncate" title={a.advogado_nome}>{nomeAdv(a.advogado_nome)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-slate-600">{a.em_andamento ?? "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold text-emerald-700">{a.acordos}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${txCls}`}>{taxa}%</span>
                      </td>
                      <td className="py-2 px-2 text-center text-[11px] font-semibold">
                        {recAlocar ? <span className="text-emerald-700">✓ Sim</span> : saturado ? <span className="text-rose-600">✗ Saturado</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] text-slate-400">Score = taxa acordo (70%) + folga de capacidade (30%) · saturado = &lt;5% com ≥30 casos</p>
        </div>

        {/* Por Comarca */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Comarcas — volume × taxa de acordo</h2>
          <p className="text-xs text-slate-500 mb-4">Onde há mais clientes e onde fechar acordo é mais fácil — oriente criativos por praça</p>
          <div className="space-y-2">
            {comarcas.map((c: any, i: number) => {
              const taxa = c.taxa_acordo ?? 0;
              const txCls = taxa >= 20 ? "text-emerald-700 bg-emerald-100" : taxa >= 10 ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-100";
              return (
                <div key={c.comarca} className="flex items-center gap-2">
                  <div className="w-40 shrink-0 truncate text-right text-xs font-medium text-slate-700" title={c.comarca}>{c.comarca}</div>
                  <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                    <div className="h-full rounded-full flex items-center pl-2" style={{ width: `${Math.max(4, (c.total / maxComarca) * 100)}%`, backgroundColor: CORES[i % CORES.length] }}>
                      <span className="text-[10px] font-bold text-white whitespace-nowrap">{c.total}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${txCls}`}>{taxa}%</span>
                  <span className="shrink-0 text-[10px] text-slate-400 w-16 text-right tabular-nums">{fmtBRL(c.avg_causa)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />≥20% acordo</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />10–19%</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-300" />&lt;10%</span>
          </div>
        </div>
      </div>

      {/* Linha 7b: Gráfico advogados — vigentes × acordos + racional do dia */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Processos vigentes × Acordos por advogado</h2>
            <p className="text-xs text-slate-500">Volume ativo (cinza) vs acordos fechados (verde) — saturação indica que a adm já mapeou o advogado</p>
          </div>
          {/* Racional do dia */}
          {(() => {
            const ranked = [...advogados].sort((a: any, b: any) => {
              const sA = a.taxa_acordo * 0.7 + Math.max(0, 1 - a.em_andamento / 50) * 30;
              const sB = b.taxa_acordo * 0.7 + Math.max(0, 1 - b.em_andamento / 50) * 30;
              return sB - sA;
            });
            const top = ranked.filter((a: any) => a.taxa_acordo >= 20)[0];
            const evitar = ranked.filter((a: any) => a.taxa_acordo < 5 && a.total >= 30);
            if (!top) return null;
            return (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 max-w-sm text-xs">
                <div className="font-bold text-emerald-800 mb-1">📋 Racional do dia</div>
                <div className="text-emerald-900">
                  <strong>Priorize:</strong> {nomeAdv(top.advogado_nome)} — {top.taxa_acordo}% de acordo, {top.em_andamento} vigentes
                </div>
                {evitar.length > 0 && (
                  <div className="mt-1 text-rose-700">
                    <strong>Evite novos casos:</strong> {evitar.slice(0, 2).map((a: any) => nomeAdv(a.advogado_nome)).join(", ")} — 0% com ≥30 vigentes
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        <div className="h-64">
          <Bar
            data={{
              labels: [...advogados].sort((a: any, b: any) => b.em_andamento - a.em_andamento).map((a: any) => nomeAdv(a.advogado_nome)),
              datasets: [
                {
                  label: "Vigentes",
                  data: [...advogados].sort((a: any, b: any) => b.em_andamento - a.em_andamento).map((a: any) => a.em_andamento ?? 0),
                  backgroundColor: "rgba(148,163,184,0.7)",
                  borderRadius: 4,
                },
                {
                  label: "Acordos",
                  data: [...advogados].sort((a: any, b: any) => b.em_andamento - a.em_andamento).map((a: any) => a.acordos),
                  backgroundColor: "rgba(16,185,129,0.85)",
                  borderRadius: 4,
                },
              ],
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: true, position: "top" as const, labels: { boxWidth: 12, font: { size: 11 } } } },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
              },
            } as any}
          />
        </div>
      </div>

      {/* Advogados disponíveis (sem processos) */}
      {advDisp.filter((a: any) => a.total_processos === 0).length > 0 && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-emerald-900 mb-1">Advogados sem exposição — completamente desconhecidos pelas administradoras</h2>
          <p className="text-xs text-emerald-700 mb-4">Esses advogados ainda não têm nenhum processo no sistema. As administradoras não os identificaram — ideais para casos em administradoras onde os outros já estão saturados.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {advDisp.filter((a: any) => a.total_processos === 0).map((a: any) => (
              <div key={a.id} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs">
                <div className="font-semibold text-slate-800 truncate" title={a.nome_completo}>{nomeAdv(a.nome_completo)}</div>
                <div className="text-slate-400 mt-0.5">{a.oab}</div>
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">🟢 Zero processos</div>
              </div>
            ))}
          </div>
          {advDisp.filter((a: any) => a.total_processos > 0 && a.total_processos <= 5).length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-emerald-800 mb-2">Baixa exposição (1–5 processos)</div>
              <div className="flex flex-wrap gap-2">
                {advDisp.filter((a: any) => a.total_processos > 0 && a.total_processos <= 5).map((a: any) => (
                  <div key={a.id} className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs flex items-center gap-2">
                    <span className="font-medium text-slate-700">{nomeAdv(a.nome_completo)}</span>
                    <span className="text-amber-700 font-bold">{a.total_processos} proc.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Análise por Gerente */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Análise por Gerente</h2>
        <p className="text-xs text-slate-500 mb-4">Volume, taxa de acordo e carteira por responsável pelo processo</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Gerente</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Total</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Acordos</th>
                <th className="text-center py-2 px-3 font-semibold text-slate-600">Taxa</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Ticket méd.</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Carteira</th>
              </tr>
            </thead>
            <tbody>
              {gerentes.map((g: any) => {
                const taxa = g.taxa_acordo ?? 0;
                const txCls = taxa >= 20 ? "text-emerald-700 bg-emerald-100" : taxa >= 10 ? "text-amber-700 bg-amber-100" : "text-slate-500 bg-slate-100";
                const primeiroPeriodo = g.primeiro_processo ? new Date(g.primeiro_processo) < new Date("2025-11-15") : false;
                return (
                  <tr key={g.gerente} className={`border-b border-slate-100 hover:bg-slate-50 ${primeiroPeriodo && taxa < 5 ? "bg-rose-50/40" : ""}`}>
                    <td className="py-2 px-3 font-medium text-slate-800">{g.gerente?.split(" ").slice(0, 2).join(" ")}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-600">{g.total}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">{g.acordos}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${txCls}`}>{taxa}%</span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">{fmtBRL(g.avg_causa)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">{fmtBRL(g.carteira)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DNA do Acordo */}
      {(() => {
        const gerenteDados: any[] = data.por_gerente || [];
        const admPerfil: any[] = data.adm_acordo_perfil || [];
        const abusiv: any[] = data.abusividade_vs_acordo || [];
        const combos: any[] = data.gerente_adv_combos || [];
        const faixaValor: any[] = data.faixa_valor_acordo || [];

        const totalAcordos = data.totais?.total_acordos || 65;
        const embraconAcordos = admPerfil.find((a: any) => a.adm === "Embracon")?.acordos ?? 0;
        const psAcordos = admPerfil.find((a: any) => a.adm === "Porto Seguro")?.acordos ?? 0;
        const admsZero = admPerfil.filter((a: any) => a.taxa === 0).map((a: any) => a.adm);
        const abusivaRow = abusiv.find((a: any) => a.situacao?.includes("Abusiva"));
        const dentroRow = abusiv.find((a: any) => a.situacao?.includes("Dentro"));
        const faixaSweet = [...faixaValor].sort((a: any, b: any) => b.taxa - a.taxa)[0];
        const topGer = [...gerenteDados].sort((a: any, b: any) => b.acordos - a.acordos)[0];
        const pctTop2adm = totalAcordos > 0 ? (((embraconAcordos + psAcordos) / totalAcordos) * 100).toFixed(0) : "—";

        return (
          <div className="mb-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🧬</span>
              <div>
                <h2 className="text-sm font-extrabold text-emerald-900">DNA do Acordo — padrões dos {totalAcordos} fechamentos</h2>
                <p className="text-xs text-emerald-700">Variáveis que distinguem casos que fecharam acordo dos demais</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
              <div className="rounded-xl bg-white border border-emerald-200 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">100%</div>
                <div className="text-[11px] font-semibold text-slate-600 mt-0.5">Honorários = 30%</div>
                <div className="text-[10px] text-slate-400 mt-0.5">todos os acordos</div>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">{pctTop2adm}%</div>
                <div className="text-[11px] font-semibold text-slate-600 mt-0.5">Embracon + Porto Seguro</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{embraconAcordos}+{psAcordos} acordos</div>
              </div>
              <div className="rounded-xl bg-white border border-emerald-200 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">76%</div>
                <div className="text-[11px] font-semibold text-slate-600 mt-0.5">Fecham em &lt; 60 dias</div>
                <div className="text-[10px] text-slate-400 mt-0.5">janela de oportunidade</div>
              </div>
              {faixaSweet && (
                <div className="rounded-xl bg-white border border-emerald-200 px-3 py-3 text-center">
                  <div className="text-2xl font-extrabold text-emerald-700">{faixaSweet.taxa}%</div>
                  <div className="text-[11px] font-semibold text-slate-600 mt-0.5">Faixa {faixaSweet.faixa}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">melhor taxa de acordo</div>
                </div>
              )}
              {abusivaRow && dentroRow && (
                <div className="rounded-xl bg-white border border-rose-200 px-3 py-3 text-center">
                  <div className="text-2xl font-extrabold text-rose-700">2×</div>
                  <div className="text-[11px] font-semibold text-slate-600 mt-0.5">ADM cobrando acima</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{abusivaRow.taxa}% vs {dentroRow.taxa}%</div>
                </div>
              )}
            </div>

            {admsZero.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-700">
                <span className="font-bold text-rose-700">⛔ Zero acordos históricos:</span> {admsZero.join(", ")} — estratégia processual diferente necessária para essas administradoras
              </div>
            )}
          </div>
        );
      })()}

      {/* Combos vencedores Gerente × Advogado */}
      {(() => {
        const combos: any[] = data.gerente_adv_combos || [];
        const topCombos = combos.filter((c: any) => c.taxa >= 20);
        if (topCombos.length === 0) return null;
        return (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 mb-1">Combinações Gerente × Advogado — taxa de acordo</h2>
            <p className="text-xs text-slate-500 mb-4">Pares com ≥5 processos em comum · taxa de acordo ≥20% destacada · {combos.length} combinações analisadas</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Gerente</th>
                    <th className="text-left py-2 px-3 font-semibold text-slate-600">Advogado</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Total</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Acordos</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-600">Taxa</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Dias méd.</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-600">Ticket méd.</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c: any, i: number) => {
                    const taxa = c.taxa ?? 0;
                    const txBg = taxa >= 40 ? "bg-emerald-600 text-white" : taxa >= 20 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600";
                    return (
                      <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 ${taxa >= 40 ? "bg-emerald-50/60" : taxa >= 20 ? "bg-emerald-50/30" : ""}`}>
                        <td className="py-2 px-3 font-medium text-slate-800">{c.gerente?.split(" ")[0]}</td>
                        <td className="py-2 px-3 text-slate-600 max-w-[150px] truncate" title={c.advogado_nome}>{nomeAdv(c.advogado_nome)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500">{c.total}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">{c.acordos}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${txBg}`}>{taxa}%</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500">{c.avg_dias_acordo != null ? `${c.avg_dias_acordo}d` : "—"}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-slate-500">{fmtBRL(c.avg_causa)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Faixa de valor vs acordo + ADM abusividade */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Faixa de valor × taxa de acordo</h2>
          <p className="text-xs text-slate-500 mb-4">Qual valor de causa tem mais chance de fechar e em quanto tempo</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-600">Faixa</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Total</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Acordos</th>
                  <th className="text-center py-2 px-3 font-semibold text-slate-600">Taxa</th>
                  <th className="text-right py-2 px-3 font-semibold text-slate-600">Dias méd.</th>
                </tr>
              </thead>
              <tbody>
                {(data.faixa_valor_acordo || []).map((f: any) => {
                  const taxa = f.taxa ?? 0;
                  const isSweet = taxa === Math.max(...(data.faixa_valor_acordo || []).map((x: any) => x.taxa ?? 0));
                  return (
                    <tr key={f.faixa} className={`border-b border-slate-100 hover:bg-slate-50 ${isSweet ? "bg-emerald-50" : ""}`}>
                      <td className="py-2 px-3 font-medium text-slate-800">{f.faixa} {isSweet && <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-bold">sweet spot</span>}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500">{f.total}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">{f.acordos}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${taxa >= 12 ? "bg-emerald-100 text-emerald-800" : taxa >= 8 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{taxa}%</span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums text-slate-500">{f.avg_dias_acordo != null ? `${f.avg_dias_acordo}d` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Taxa ADM cobrada vs taxa contratada</h2>
          <p className="text-xs text-slate-500 mb-4">Casos onde a ADM cobra acima do contrato têm maior probabilidade de acordo — mais exposição jurídica da administradora</p>
          <div className="space-y-3">
            {(data.abusividade_vs_acordo || []).filter((a: any) => a.situacao !== "Sem dados").map((a: any) => {
              const taxa = a.taxa ?? 0;
              const cor = taxa >= 10 ? "#10b981" : taxa >= 5 ? "#f59e0b" : "#94a3b8";
              const pctBar = Math.max(4, (taxa / 15) * 100);
              return (
                <div key={a.situacao}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-slate-700">{a.situacao}</span>
                    <span className="text-slate-500">{a.total} casos · {a.acordos} acordos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div className="h-full rounded-full flex items-center pl-2" style={{ width: `${pctBar}%`, backgroundColor: cor }}>
                        <span className="text-[10px] font-bold text-white">{taxa}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[10px] text-slate-400 border-t border-slate-100 pt-3">ADM abusiva = cobrando mais de 1pp acima da taxa contratada · fonte: campo percentual_cobrada_calculado vs taxa_adm_contratada_percentual</p>
        </div>
      </div>

      {/* Padrão temporal dos acordos */}
      <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Distribuição tempo até acordo + por adm */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Tempo até o acordo (dias no sistema)</h2>
          <p className="text-xs text-slate-500 mb-3">Da entrada no PJMOL até o fechamento — 76% fecham em até 60 dias</p>

          {/* Distribuição em barras */}
          <div className="space-y-2 mb-4">
            {distTempo.map((d: any) => {
              const maxAcordos = Math.max(...distTempo.map((x: any) => x.acordos), 1);
              const pct = (d.acordos / maxAcordos) * 100;
              const cor = d.ordem <= 2 ? "#10b981" : d.ordem <= 3 ? "#f59e0b" : "#ef4444";
              return (
                <div key={d.faixa} className="flex items-center gap-3">
                  <div className="w-24 shrink-0 text-right text-xs font-medium text-slate-600">{d.faixa}</div>
                  <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
                    <div className="h-full rounded-full flex items-center pl-2" style={{ width: `${Math.max(8, pct)}%`, backgroundColor: cor }}>
                      <span className="text-[10px] font-bold text-white">{d.acordos}</span>
                    </div>
                  </div>
                  <div className="w-16 text-xs text-slate-400 text-right">{((d.acordos / 65) * 100).toFixed(0)}%</div>
                </div>
              );
            })}
          </div>

          {/* Por administradora */}
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-slate-600 mb-2">Média por administradora</div>
            <div className="space-y-1">
              {tempoAdordAdm.map((a: any) => (
                <div key={a.adm_nome} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700 font-medium">{a.adm_nome}</span>
                  <span className="text-slate-500">{a.acordos} acordos</span>
                  <span className="font-bold text-indigo-700">{a.avg_dias}d méd. <span className="text-slate-400 font-normal">({a.min_dias}–{a.max_dias}d)</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Velocidade de assinatura por gerente */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 mb-1">Velocidade de assinatura por gerente</h2>
          <p className="text-xs text-slate-500 mb-4">Dias médios entre envio do contrato e assinatura do cliente — quanto mais frio, mais rápido</p>
          <div className="space-y-4">
            {gerentes
              .filter((g: any) => g.avg_dias_assinar != null)
              .sort((a: any, b: any) => a.avg_dias_assinar - b.avg_dias_assinar)
              .map((g: any) => {
                const dias = g.avg_dias_assinar ?? 0;
                const maxDias = Math.max(...gerentes.filter((x: any) => x.avg_dias_assinar != null).map((x: any) => x.avg_dias_assinar), 1);
                const pct = Math.max(4, (dias / maxDias) * 100);
                const cor = dias < 3 ? { bg: "#0ea5e9", label: "Frio", badge: "bg-sky-100 text-sky-700 border-sky-200" }
                  : dias < 6 ? { bg: "#10b981", label: "Ideal", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" }
                  : dias < 10 ? { bg: "#f59e0b", label: "Morno", badge: "bg-amber-100 text-amber-700 border-amber-200" }
                  : { bg: "#ef4444", label: "Quente", badge: "bg-rose-100 text-rose-700 border-rose-200" };
                const firstName = g.gerente?.split(" ")[0] ?? g.gerente;
                return (
                  <div key={g.gerente}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">{firstName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800 tabular-nums">{dias}d</span>
                        <span className={`text-[10px] font-semibold border rounded-full px-2 py-0.5 ${cor.badge}`}>{cor.label}</span>
                      </div>
                    </div>
                    {/* Tubo do termômetro */}
                    <div className="relative h-5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cor.bg }}
                      />
                      {/* Escala de referência */}
                      <div className="absolute inset-0 flex items-center">
                        {[25, 50, 75].map((p) => (
                          <div key={p} className="absolute h-full border-l border-white/40" style={{ left: `${p}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-300 mt-0.5 px-0.5">
                      <span>0d</span>
                      <span>{(maxDias * 0.25).toFixed(0)}d</span>
                      <span>{(maxDias * 0.5).toFixed(0)}d</span>
                      <span>{(maxDias * 0.75).toFixed(0)}d</span>
                      <span>{maxDias}d</span>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="mt-4 flex gap-3 text-[10px] flex-wrap">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-sky-400"/>Frio &lt;3d</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-emerald-500"/>Ideal 3–6d</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-amber-400"/>Morno 6–10d</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-2 rounded-sm bg-rose-500"/>Quente &gt;10d</span>
          </div>
        </div>
      </div>

      {/* Tempo até acordo por advogado */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 mb-1">Velocidade de acordo por advogado</h2>
        <p className="text-xs text-slate-500 mb-4">Dias entre entrada no sistema e fechamento do acordo — advogados mais novos tendem a fechar mais rápido</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-semibold text-slate-600">Advogado</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Acordos</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Dias méd.</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Mais rápido</th>
                <th className="text-right py-2 px-3 font-semibold text-slate-600">Ticket méd.</th>
              </tr>
            </thead>
            <tbody>
              {tempoAcordAdv.map((a: any, i: number) => {
                const rapidoCls = a.avg_dias < 30 ? "text-emerald-700 font-bold" : a.avg_dias < 60 ? "text-amber-700" : "text-slate-500";
                return (
                  <tr key={a.advogado_nome} className={`border-b border-slate-100 hover:bg-slate-50 ${i === 0 ? "bg-emerald-50" : ""}`}>
                    <td className="py-2 px-3 font-medium text-slate-800">{nomeAdv(a.advogado_nome)}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-emerald-700">{a.acordos}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${rapidoCls}`}>{a.avg_dias}d</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-400">{a.min_dias}d</td>
                    <td className="py-2 px-3 text-right tabular-nums text-slate-500">{fmtBRL(a.avg_causa)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">Mín. 2 acordos para aparecer · ordenado do mais rápido para o mais lento</p>
      </div>

      {/* ===== APROFUNDAMENTO TEMPO ATÉ ACORDO ===== */}
      {(() => {
        const quartis: any[] = data.quartis_tempo_acordo || [];
        const admAdvTempo: any[] = data.adm_adv_tempo || [];
        const sazonalidade: any[] = data.sazonalidade_acordo || [];
        const diaSemana: any[] = data.dia_semana_acordo || [];
        const MESES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const maxAcordosDow = Math.max(...diaSemana.map((d: any) => d.acordos), 1);
        const maxAcordosMes = Math.max(...sazonalidade.map((s: any) => s.acordos), 1);
        return (
          <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Quartis: o que diferencia acordos rápidos dos lentos */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-1">O que separa acordos rápidos dos lentos</h2>
              <p className="text-xs text-slate-500 mb-4">Comparação por velocidade de fechamento — Embracon%, honorários e valor médio</p>
              <div className="space-y-3">
                {quartis.map((q: any) => {
                  const cor = q.ord === 1 ? { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800", icon: "⚡" }
                    : q.ord === 2 ? { bar: "bg-sky-400", badge: "bg-sky-100 text-sky-800", icon: "✓" }
                    : q.ord === 3 ? { bar: "bg-amber-400", badge: "bg-amber-100 text-amber-800", icon: "~" }
                    : { bar: "bg-rose-500", badge: "bg-rose-100 text-rose-800", icon: "!" };
                  return (
                    <div key={q.quartil} className="flex items-start gap-3">
                      <span className={`mt-0.5 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${cor.badge}`}>{cor.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-800">{q.quartil}</span>
                          <span className="text-xs text-slate-500">{q.n} acordo{q.n !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          <span>Embracon: <b className="text-slate-700">{q.pct_embracon}%</b></span>
                          <span>Honorários: <b className="text-slate-700">{q.avg_honor}%</b></span>
                          <span>Ticket: <b className="text-slate-700">{fmtBRL(q.avg_causa)}</b></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Casos com valores muito altos (&gt;50k) tendem a levar mais tempo para fechar</p>
            </div>

            {/* Combos ADM × Advogado mais rápidos */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Combinações mais rápidas — ADM × Advogado</h2>
              <p className="text-xs text-slate-500 mb-4">Pares com ≥3 acordos, ordenados pelo menor tempo médio de fechamento</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-600">ADM</th>
                      <th className="text-left py-1.5 px-2 font-semibold text-slate-600">Advogado</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-600">N</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-600">Méd.</th>
                      <th className="text-right py-1.5 px-2 font-semibold text-slate-600">Mín.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admAdvTempo.map((r: any, i: number) => {
                      const rapidoCls = r.avg_dias < 30 ? "text-emerald-700 font-bold" : r.avg_dias < 60 ? "text-amber-700" : "text-rose-600";
                      return (
                        <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 ${i === 0 ? "bg-emerald-50" : ""}`}>
                          <td className="py-1.5 px-2 text-slate-600">{r.adm}</td>
                          <td className="py-1.5 px-2 font-medium text-slate-800">{nomeAdv(r.adv)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-500">{r.n}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums ${rapidoCls}`}>{r.avg_dias}d</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-slate-400">{r.min_dias}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sazonalidade: mês de criação vs tempo */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Padrão sazonal — mês de entrada vs velocidade</h2>
              <p className="text-xs text-slate-500 mb-4">Casos criados em cada mês: quantos viraram acordo e em quanto tempo</p>
              <div className="space-y-2">
                {sazonalidade.map((s: any) => {
                  const pct = (s.acordos / maxAcordosMes) * 100;
                  const rapidoCls = s.avg_dias < 30 ? "text-emerald-700 font-bold" : s.avg_dias < 60 ? "text-amber-700" : "text-rose-600";
                  return (
                    <div key={s.mes} className="flex items-center gap-3">
                      <span className="w-7 text-xs font-medium text-slate-500 shrink-0">{MESES[s.mes]}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-indigo-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-xs tabular-nums text-right text-slate-600">{s.acordos}</span>
                      <span className={`w-12 text-xs tabular-nums text-right ${rapidoCls}`}>{s.avg_dias}d</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Mar/Abr têm o maior volume e menor tempo médio · Dez tende a ser mais lento</p>
            </div>

            {/* Dia da semana: quando acordos são fechados */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Dia da semana — quando os acordos fecham</h2>
              <p className="text-xs text-slate-500 mb-4">Distribuição de acordos por dia da semana (data de atualização para acordo)</p>
              <div className="flex items-end gap-3 h-28 mt-2">
                {["Dom","Seg","Ter","Qua","Qui","Sex","Sab"].map((d, idx) => {
                  const row = diaSemana.find((x: any) => x.dow === idx);
                  const n = row?.acordos ?? 0;
                  const h = n > 0 ? Math.max(8, (n / maxAcordosDow) * 100) : 0;
                  const isTop = n === maxAcordosDow && n > 0;
                  return (
                    <div key={d} className="flex-1 flex flex-col items-center gap-1">
                      {n > 0 && <span className={`text-[10px] tabular-nums font-semibold ${isTop ? "text-emerald-700" : "text-slate-500"}`}>{n}</span>}
                      <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${n === 0 ? "bg-slate-100" : isTop ? "bg-emerald-500" : "bg-indigo-300"}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{d}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Qua–Sex concentram ~90% dos fechamentos · acordos praticamente não acontecem no fim de semana</p>
            </div>

          </div>
        );
      })()}

      {/* Linha 8: Recomendações táticas dinâmicas */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-slate-800">Recomendações táticas para Instagram</h2>
          <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">gerado em tempo real · atualiza com os dados</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">Calculadas automaticamente com base na composição atual da carteira</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {gerarRecomendacoes(data).map((r, i) => (
            <Insight key={i} emoji={r.emoji} cor={r.cor} titulo={r.titulo} texto={r.texto} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 pb-4">
        Dados extraídos da base PJMOL · {t.total_processos} processos analisados · Gerado em {atualizado}
      </div>
    </div>
  );
}
