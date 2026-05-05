// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  RefreshCw, Search, ChevronDown, ChevronUp, Download, Plus, ArrowLeft,
  AlertCircle , Paperclip, CheckCircle2, Trash2, FileText, CheckCircle
} from "lucide-react";
import { getLoggedUser, getToken, filterByScope } from "@/app/lib/auth";

/** ===================== Helpers ===================== */
function displayGerenteName(row: any): string {
  const v = row?.gerente_nome || row?.gerente?.nome || row?.criado_por_nome || row?.usuario_criador_nome || row?.responsavel_nome || '';
  return (typeof v === 'string' ? v : '');
}
function displayAdvogadoName(row: any): string {
  return (row?.advogado_nome || row?.advogado_usuario || '') || '';
}
function pickUidFromRow(row: any): string {
  const cand = [row?.gerente_id, row?.criado_por_id, row?.usuario_id, row?.gerente?.id];
  for (const v of cand) {
    if (v !== undefined && v !== null && (typeof v === 'number' || String(v).trim() !== '')) return String(v);
  }
  return '';
}
const toArr = (x:any) => Array.isArray(x) ? x : (x ? [x] : []);

/** ===================== Recursive detectors ===================== */
const ADDR_PATTERNS = [
  "comprovante_endereco","comprovante_de_endereco","comprovante_residencia","comprovante_de_residencia",
  "residencia","endereco","endereço","addr"
];
const ID_PATTERNS = [
  "documento_identidade","doc_identidade","identidade","rg","cnh","rg_cnh","id_document","id_doc"
];

function keyMatches(key:string, patterns:string[]) {
  const k = key.toLowerCase();
  return patterns.some(p => k.includes(p));
}
function collectCount(v:any): number {
  if (!v) return 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "string") return v ? 1 : 0;
  if (typeof v === "object") {
    return collectCount(v.frente) + collectCount(v.verso) + collectCount(v.completo) + collectCount(v.file) + collectCount(v.url);
  }
  return 0;
}
function deepScan(obj:any, patterns:string[], depth=0): number {
  if (!obj || typeof obj !== "object" || depth > 3) return 0;
  let total = 0;
  for (const [k,v] of Object.entries(obj)) {
    if (keyMatches(k, patterns)) total += collectCount(v);
    if (typeof v === "object") total += deepScan(v, patterns, depth+1);
  }
  return 0 + total;
}

/** ===================== Docs status (mínimos) ===================== */
function getDocsStatus(row: any): { hasAddr: boolean; hasId: boolean; count: number; needs: boolean } {
  // Mesmo se estiver assinado, vamos checar se tem os documentos
  const status = getDisplayStatus(row);

  const normalizeExtras = (raw: any) => {
    if (!raw) return {};
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return raw;
  };

  const extras = normalizeExtras(row?.extras);
  const statusExtras = normalizeExtras(extras?.status);
  const dbExtras = normalizeExtras(extras?.from_db?.extras);
  const fsStatus = normalizeExtras(extras?.from_filesystem);
  const fsRow = normalizeExtras(row?.from_filesystem);

  const collectStrings = (...items: any[]): string[] => {
    const bag: string[] = [];
    const pushVal = (val: any) => {
      if (!val) return;
      if (Array.isArray(val)) val.forEach(pushVal);
      else if (typeof val === "object") Object.values(val).forEach(pushVal);
      else if (typeof val === "string" && val.trim()) bag.push(val.trim());
    };
    items.forEach(pushVal);
    return bag;
  };

  const enderecoEntries = collectStrings(
    row?.comprovante_endereco_url
  );
  const docEntries = collectStrings(
    row?.documento_identidade_url
  );
  const outrosEntries = collectStrings(
    row?.outros_anexos_url,
    row?.comprovante_renda_url
  );

  const unique = (arr: string[]) => Array.from(new Set(arr));
  const addrList = unique(enderecoEntries);
  const docList = unique(docEntries);
  const outrosList = unique(outrosEntries);

  // 🔍 DEBUG: Ver de onde vêm os arquivos
  if (row?.id && (addrList.length > 0 || docList.length > 0 || outrosList.length > 0)) {
    console.log(`📎 Anexos ID ${row.id}:`, {
      endereco: addrList.length,
      docs: docList.length,
      outros: outrosList.length,
      total: addrList.length + docList.length + outrosList.length,
      enderecoRaw: enderecoEntries,
      docsRaw: docEntries,
      outrosRaw: outrosEntries
    });
  }

  // ✅ PRIORIZAR ARQUIVOS REAIS em vez de flags antigas
  let hasAddr = addrList.length > 0;
  let hasId = docList.length > 0;

  // ⚠️ Só confiar em flags se NÃO houver arquivos reais detectados
  if (!hasAddr || !hasId) {
    const minimosCandidates = [
      normalizeExtras(row?.minimos),
      normalizeExtras(extras?.minimos),
      normalizeExtras(statusExtras?.minimos),
      normalizeExtras(extras?.from_db?.minimos),
    ];

    for (const candidate of minimosCandidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const enderecoOK = candidate.endereco_ok ?? candidate.comprovante_endereco_ok ?? candidate.addr_ok;
      const identidadeOK = candidate.identidade_ok ?? candidate.doc_ok ?? candidate.id_ok;
      
      // ⚠️ Apenas atualizar se ainda não temos arquivos reais
      if (!hasAddr && enderecoOK === true) hasAddr = true;
      if (!hasId && identidadeOK === true) hasId = true;
      
      // Se ambos estão OK, parar de buscar
      if (hasAddr && hasId) break;
    }
  }

  const count = (hasAddr ? Math.max(addrList.length, 1) : 0) + docList.length + outrosList.length;
  return { hasAddr, hasId, count, needs: !(hasAddr && hasId) };
}

type Processo = {
  id: number;
  criado_em?: string;
  data_exportacao?: string;
  atualizado_em?: string;
  updated_at?: string;
  enviado_em?: string;
  status?: string;
  nome_cliente?: string;
  grupo?: string | number;
  cota?: string | number;
  administradora?: string;
  numero_processo?: string | null;
  extras?: Record<string, any> | null;
  valor_corrigido_hoje?: number | null;
  valor_corrigido_futuro?: number | null;
  valor_futuro?: number | null;
  advogado_nome?: string;
  advogado_usuario?: string;
  gerente_id?: number | string;
  gerente_nome?: string;
  criado_por_id?: number | string;
  honorarios_hoje_total?: number | null;
  honorarios_futuro_total?: number | null;
  honorarios_hoje_adv?: number | null;
  honorarios_hoje_emp?: number | null;
  honorarios_futuro_adv?: number | null;
  honorarios_futuro_emp?: number | null;
  liquido_hoje?: number | null;
  liquido_futuro?: number | null;
  resultado_processo?: string | null;
  tipo_pagamento?: string | null;
  valor_acordo?: number | null;
  valor_sentenca?: number | null;
  [key: string]: any;
};

const fmtBRL = (v: any) => {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
const fmtDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });
};
const fmtDateTime = (isoOrDate?: string|Date|null) => {
  if (!isoOrDate) return "";
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (!d || Number.isNaN(d.getTime())) return "";
  // Formato: DD/MM/YYYY HH:MM:SS (com segundos)
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};
  const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

// 🔵 INÍCIO: status do documento (ZapSign)
function normalizeDocStatus(raw?: string): string {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  if (["enviado","enviada","enviados","sent","enviado_para_assinatura"].includes(s)) return "Enviado";
  if (["assinado","assinada","signed","finalizado","concluido","concluído"].includes(s)) return "Assinado";
  if (["cancelado","rejeitado","recusado"].includes(s)) return "Cancelado";
  if (["salvo","salva","saved","criado","criada"].includes(s)) return "Salvo";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
function getDisplayStatus(row: any): string {
  // 🎯 PRIORIDADE 1: Se tem número de processo → CONCLUÍDO
  const numeroProc = (row?.numero_processo ?? row?.numeroProcesso ?? row?.processo_numero ?? "").toString().trim();
  if (numeroProc && numeroProc !== "None" && numeroProc !== "") {
    return "Concluído";
  }

  // Verifica se foi marcado como assinado externamente
  const extras = row?.extras || {};
  if (extras.signed_external === true) {
    return "Assinado (fora)";
  }

  // O banco é a fonte da verdade - usa status_documento primeiro
  const status_doc = row?.status_documento;
  if (status_doc) {
    const normalized = normalizeDocStatus(status_doc);
    if (normalized) return normalized;
  }

  // Fallback para outros campos se status_documento estiver vazio
  const cand = [
    row?.status_doc,
    row?.zapsign_status,
    row?.status_nome_documento,
    row?.status,
  ];
  for (const c of cand) {
    const v = normalizeDocStatus(c as any);
    if (v) return v;
  }
  
  // Se não tem status definido mas tem criado_em, significa que foi salvo
  if (row?.criado_em) {
    return "Salvo";
  }
  
  return "—";
}
// 🔵 FIM

const isAvista = (s?: string | null) =>
  ["avista","a vista","à vista","a_vista","a-vista"].includes(String(s||"").toLowerCase());

function getResultadoLabel(it: any): string {
  const r = String(it?.resultado_processo || "").toLowerCase();
  if (r === "acordo") return "Acordo";
  if (r === "ganhamos" && isAvista(it?.tipo_pagamento)) return "Sentença à Vista";
  if (r === "ganhamos") return "Sentença Futura";
  if (r === "perdemos") return "Perdemos";
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return "Sem Julgamento";
}
function resultadoPillClass(label: string): string {
  if (label === "Acordo" || label === "Sentença à Vista")
    return "bg-indigo-100 text-indigo-700 ring-indigo-600/20";
  if (label === "Sentença (Futuro)")
    return "bg-red-100 text-red-700 ring-red-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
}

const valorHojeDisplay = (it: any) => {
  const r = String(it?.resultado_processo || "").toLowerCase();
  if (it?.valor_corrigido_hoje != null) return it.valor_corrigido_hoje;
  if (r === "acordo" && it?.valor_acordo != null) return it.valor_acordo;
  if (r === "ganhamos" && isAvista(it?.tipo_pagamento) && it?.valor_sentenca != null) {
    return it.valor_sentenca;
  }
  return null;
};

import { StatusColumn } from "@/components/StatusColumn";

function getTimestampForStatus(row: any): string | null {
  const status = getDisplayStatus(row);
  
  // Mapear cada status para seu timestamp correspondente
  switch (status) {
    case 'Enviado':
      return row?.enviado_em || row?.timer_event_at || null;
    
    case 'Assinado':
    case 'Assinado (fora)':
      return row?.zapsign_signed_at || row?.enviado_em || null;
    
    case 'Não enviado':
    case 'Aguardando assinatura':
      return row?.criado_em || row?.created_at || null;
    
    case 'Em Andamento':
      return row?.atualizado_em || row?.updated_at || row?.criado_em || null;
      
    default:
      // Para qualquer outro status, tentar criado_em ou atualizado_em
      return row?.atualizado_em || row?.updated_at || row?.criado_em || row?.created_at || null;
  }
}

function extractItems(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const key of ['items','data','results','extratos','processos']) {
    if (Array.isArray((json as any)[key])) return (json as any)[key];
  }
  const firstArray = Object.values(json).find((v) => Array.isArray(v)) as any[] | undefined;
  return firstArray || [];
}

const rawBackend = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000");
const API_BASE = rawBackend.endsWith("/") ? rawBackend.slice(0, -1) : rawBackend;
const PAGE_SIZE = 15;

/** ===================== Timer helpers (d/h/m/s) ===================== */
function useTicker(ms: number = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
function parseDateMaybe(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ❌ formatDurationDHMS removida - não é mais usada no sistema simplificado
// ❌ ProcessTimeline removido - sistema mostra apenas status em outras seções

// ❌ FUNÇÕES ANTIGAS REMOVIDAS - Sistema simplificado usa apenas fase_atual
// computeProcessTimeline() e getProcessTimestamps() não são mais necessárias

/* ===== 🔵 COMARCA/UF helper (revisto) ===== */
function _pickUF(raw?: string): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const slash = s.match(/\/\s*([A-Za-z]{2})$/);
  if (slash) return slash[1].toUpperCase();
  const paren = s.match(/\(\s*([A-Za-z]{2})\s*\)$/);
  if (paren) return paren[1].toUpperCase();
  const uf = s.match(/\b([A-Za-z]{2})\b(?=[^A-Za-z]*$)/);
  return uf ? uf[1].toUpperCase() : "";
}
function _sanitizePrefix(raw: string): string {
  return raw.replace(/^\s*(comarca|foro)\s*(de|da|do)\s*/i, "").trim();
}
function _extractCityFromCombo(raw?: string, ufHint?: string): string {
  if (!raw) return "";
  let s = _sanitizePrefix(String(raw).trim());
  const combo = s.match(/^(.+?)\s*[\/,\-–]\s*([A-Za-z]{2})\s*$/);
  if (combo) {
    const city = combo[1].trim();
    const uf = combo[2].toUpperCase();
    if (!ufHint || ufHint === uf) return city;
  }
  s = s.replace(/\s*\(\s*[A-Za-z]{2}\s*\)\s*$/, "").trim();
  s = s.replace(/\s*\/\s*[A-Za-z]{2}\s*$/, "").trim();
  return s || "";
}
function _firstStr(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
function displayComarcaUF(it: any): string {
  const ex = (it?.extras && typeof it.extras === "object")
    ? it.extras
    : (() => { try { return JSON.parse(it?.extras || "{}"); } catch { return {}; } })();

  const ufRaw = _firstStr(it, [
    "estado_escolhido","uf_escolhida","uf_cliente","estado_cliente","uf_adm","estado_adm","uf","estado"
  ]) || _firstStr(ex, [
    "estado_escolhido","uf_escolhida","uf_cliente","estado_cliente","uf_adm","estado_adm","uf","estado"
  ]);
  let uf = _pickUF(ufRaw);

  const cityCandIt = _firstStr(it, [
    "comarca_escolhida","comarca_cliente","comarca_adm","comarca_nome","comarca",
    "cidade_comarca","comarca_cidade","cidade","municipio","municipío","municipio_cliente"
  ]);
  const cityCandEx = _firstStr(ex, [
    "comarca_escolhida","comarca_cliente","comarca_adm","comarca_nome","comarca",
    "cidade_comarca","comarca_cidade","cidade","municipio","municipío","municipio_cliente"
  ]);

  let city = _extractCityFromCombo(cityCandIt || cityCandEx, uf);

  if (!uf) {
    const fromCombo = (cityCandIt || cityCandEx);
    const ufFromCombo =
      _pickUF(fromCombo) ||
      _pickUF((fromCombo || "").split(/[\/,\-–]/).pop());
    if (ufFromCombo) uf = ufFromCombo;
    if (!city) city = _extractCityFromCombo(fromCombo, uf);
  }

  if (!city) {
    city = _sanitizePrefix(
      (cityCandIt || cityCandEx || "")
        .replace(/\s*\/\s*[A-Za-z]{2}\s*$/, "")
        .replace(/\s*\(\s*[A-Za-z]{2}\s*\)\s*$/, "")
        .trim()
    );
  }

  if (city && uf) return `${city} / ${uf}`;
  return city || uf || "";
}

function displayComarcaNome(it: any): string {
  const ex = (it?.extras && typeof it.extras === "object")
    ? it.extras
    : (() => { try { return JSON.parse(it?.extras || "{}"); } catch { return {}; } })();

  const nomeDirect =
    _firstStr(it, ["comarca_escolhida_nome"]) ||
    _firstStr(ex, ["comarca_escolhida_nome"]);

  if (nomeDirect) return _sanitizePrefix(nomeDirect);

  const nomeFallback =
    _firstStr(it, ["comarca_escolhida"]) ||
    _firstStr(ex, ["comarca_escolhida"]);

  return nomeFallback ? _sanitizePrefix(nomeFallback) : "";
}

/* ===== Tarja (inline) ===== */
function TarjaInline() {
  const [nome, setNome] = useState<string>("");
  const [perfil, setPerfil] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const read = (k: string) => (typeof window !== "undefined" ? (localStorage.getItem(k) || sessionStorage.getItem(k)) : null);
      const nomeAdv = read("nomeAdvogado") || "";
      const nomeUser = read("nomeUsuario") || "";
      const nomeExib = (nomeAdv || nomeUser || "").toString();
      const perfilRaw = ((read("perfil") || read("perfilUsuario") || read("role") || read("papel") || "") + "").toLowerCase();
      setNome(nomeExib || "Usuário");
      setPerfil(perfilRaw || "usuario");
    } catch {}
  }, []);

  if (!hydrated) return null;

  const isGerente = perfil === "gerente" || perfil === "admin";

  const sair = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = "usuario=; Max-Age=0; path=/";
      document.cookie = "token=; Max-Age=0; path=/";
    } catch {}
    window.location.href = "/login";
  };

  return (
    <div className="w-full border rounded-2xl px-3 py-2 bg-gray-50 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-200">👤</span>
        <div className="truncate font-semibold text-black">{nome}</div>
        {perfil && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-amber-700 border border-amber-300">
            {perfil.charAt(0).toUpperCase() + perfil.slice(1)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isGerente && (
          <a
            href="/gerencial/processos"
            className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            Gerenciar processos
          </a>
        )}
        <button
          onClick={sair}
          className="px-3 py-1.5 rounded-lg bg-white text-red-600 text-sm font-semibold border border-red-200 hover:bg-red-50"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/* ====== MOBILE components ====== */
function getPhaseLabel(it: any): string {
  const timestamps = getProcessTimestamps(it);
  const docs = getDocsStatus(it);
  const awaiting = docs.needs;
  
  if (timestamps.advogadoConcluiu) {
    return "Processo concluído";
  } else if (timestamps.enviadoAdvogado) {
    return "Aguardando Advogado";
  } else if (timestamps.assinaturaConcluida) {
    return awaiting ? "Gerente anexando" : "Aguardando Gerente";
  } else if (timestamps.startEnvio) {
    return "Aguardando Assinatura";
  }
  return "Fase inicial";
}

function MobileProcessCard({ it, compact=false, onToggleSignedExternal, onDelete }: { it: any; compact?: boolean; onToggleSignedExternal?: (p:any)=>void; onDelete?: (id:number)=>void; }) {
  const docs = getDocsStatus(it);
  const awaiting = docs.needs;
  const resLabel = getResultadoLabel(it);
  const pillCls = resultadoPillClass(resLabel);
  const numeroProc = (it.numero_processo ?? it.numeroProcesso ?? it.processo_numero ?? "").toString().trim();
  // const timeline = computeProcessTimeline(it, new Date()); // ❌ REMOVIDO - usa fase_atual agora
  const comarcaUF = displayComarcaUF(it); // 🔵 COMARCA/UF
  const comarcaNome = displayComarcaNome(it);
  const statusLabel = getDisplayStatus(it);
  const statusDateVal = parseDateMaybe(it?.enviado_em) || parseDateMaybe(it?.extras?.enviado_em) || parseDateMaybe(it?.zapsign_signed_at) || parseDateMaybe(it?.extras?.zapsign_signed_at) || parseDateMaybe(it?.updated_at) || null;

  return (
    <div
      className={cls(
        "rounded-2xl border p-3 bg-white shadow-sm",
        compact ? "py-2" : "py-3",
        awaiting ? "border-amber-300 bg-amber-50/70" : "border-slate-200"
      )}
    >
      {/* Linha superior: Nome + Status à esquerda, Anexos à direita */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <div className={cls("font-semibold text-slate-900 truncate", compact ? "text-base" : "text-lg")}>
            {it.nome_cliente || "—"}
          </div>
          <div className="shrink-0">
            <StatusColumn 
              status={statusLabel} 
              timestamp={statusDateVal ? statusDateVal.toISOString() : null}
              className="min-w-0! w-auto! items-start! text-left!"
            />
          </div>
        </div>
        
        <div className="shrink-0">
          {/* ✅ Href CONCRETA, sem [extratoId], sem onClick */}
          <Link
            href={`/anexos/${it.id}?uid=${pickUidFromRow(it)}&gname=${encodeURIComponent(displayGerenteName(it) || '')}`}
            prefetch={false}
            className={cls(
              "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap",
              awaiting && statusLabel !== "Assinado" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-700"
            )}
          >
            <Paperclip className="h-4 w-4" /> 
            {awaiting && statusLabel !== "Assinado" ? "Pendente" : "Anexos"}
            {docs.count > 0 && <span className="ml-1">({docs.count})</span>}
          </Link>
        </div>
      </div>

      {/* Restante das informações */}
      <div className="space-y-2">
        {/* Número do Processo */}
        <div className={cls("text-slate-600", compact ? "text-sm" : "text-base")}>
          <span className="text-slate-500">Proc.:</span>{" "}
          <span className="font-semibold text-slate-900">{numeroProc || "—"}</span>
        </div>

        {/* Informações em grid */}
        <div className={cls("grid grid-cols-2 gap-x-4 gap-y-1", compact ? "text-xs" : "text-sm")}>
          {comarcaUF && (
            <div className="text-slate-600">
              <span className="font-semibold uppercase tracking-wide text-[11px] text-slate-500">Cidade:</span>{" "}
              <span className="text-slate-700">{comarcaUF}</span>
            </div>
          )}
          {comarcaNome && (
            <div className="text-slate-600">
              <span className="font-semibold uppercase tracking-wide text-[11px] text-slate-500">Comarca:</span>{" "}
              <span className="text-slate-700">{comarcaNome}</span>
            </div>
          )}
          <div className="text-slate-600">
            <span className="text-slate-500">Grupo/Cota:</span>{" "}
            <span className="font-medium text-slate-900">{it.grupo ?? "—"}/{it.cota ?? "—"}</span>
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500 font-medium">Valor Hoje</div>
              <div className="text-base font-semibold tabular-nums">{fmtBRL(valorHojeDisplay(it))}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500 font-medium">Valor Futuro</div>
              <div className="text-base font-semibold tabular-nums">{fmtBRL((it.valor_futuro ?? it.valor_corrigido_futuro))}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500 font-medium">Honorários Hoje (tot.)</div>
              {(() => {
                const adv = Number(it.honorarios_hoje_adv||0); const emp = Number(it.honorarios_hoje_emp||0);
                const tot = Number((it.honorarios_hoje_total ?? (adv+emp)) ?? 0) || 0;
                return (
                  <div>
                    <div className="text-base font-semibold tabular-nums">{fmtBRL(tot)}</div>
                    <div className="text-[10px] text-slate-500">{fmtBRL(adv)} + {fmtBRL(emp)}</div>
                  </div>
                );
              })()}
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <div className="text-[11px] text-slate-500 font-medium">Honorários Futuro (tot.)</div>
              {(() => {
                const adv = Number(it.honorarios_futuro_adv||0); const emp = Number(it.honorarios_futuro_emp||0);
                const tot = Number((it.honorarios_futuro_total ?? (adv+emp)) ?? 0) || 0;
                return (
                  <div>
                    <div className="text-base font-semibold tabular-nums">{fmtBRL(tot)}</div>
                    <div className="text-[10px] text-slate-500">{fmtBRL(adv)} + {fmtBRL(emp)}</div>
                  </div>
                );
              })()}
            </div>
            <div className="rounded-xl bg-green-50 p-2.5 border border-green-200">
              <div className="text-[11px] text-green-700 font-semibold">💰 Líquido Hoje</div>
              {(() => {
                const valorHoje = valorHojeDisplay(it);
                const honHoje = Number((it.honorarios_hoje_total ?? (Number(it.honorarios_hoje_adv||0) + Number(it.honorarios_hoje_emp||0))) ?? 0) || 0;
                const liquido = valorHoje - honHoje;
                return (
                  <div className="text-base font-bold tabular-nums text-green-800">{fmtBRL(liquido)}</div>
                );
              })()}
            </div>
            <div className="rounded-xl bg-blue-50 p-2.5 border border-blue-200">
              <div className="text-[11px] text-blue-700 font-semibold">💰 Líquido Futuro</div>
              {(() => {
                const valorFuturo = Number(it.valor_futuro ?? it.valor_corrigido_futuro ?? 0);
                const honFuturo = Number((it.honorarios_futuro_total ?? (Number(it.honorarios_futuro_adv||0) + Number(it.honorarios_futuro_emp||0))) ?? 0) || 0;
                const liquido = valorFuturo - honFuturo;
                return (
                  <div className="text-base font-bold tabular-nums text-blue-800">{fmtBRL(liquido)}</div>
                );
              })()}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
            <div className="min-w-0">
              <div className="truncate" title={it.administradora || ''}><span className="text-slate-500">Adm:</span> {it.administradora || "—"}</div>
              <div className="truncate"><span className="text-slate-500">Adv.:</span> {displayAdvogadoName(it) || "—"}</div>
              <div className="truncate"><span className="text-slate-500">Ger.:</span> {displayGerenteName(it) || (it.gerente_id ? `#${it.gerente_id}` : "—")}</div>
            </div>
            <div className="shrink-0">
              <Link
                href={`/?extratoId=${it.id}&mode=adv&reload=${Date.now()}`}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                VER EXTRATO
              </Link>
            </div>
        </div>
      </>
    )}
  </div>
  );
}

/* ========= PAGE ========= */
export default function GerencialProcessosPage() {
  // Identidade e perfil
  const [perfil, setPerfil] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getLoggedUser> | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const u = getLoggedUser();
    setCurrentUser(u);
    setPerfil(u.perfil);
    setToken(getToken());
  }, []);

  // Dados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [items, setItems] = useState<Processo[]>([]);
  const [lastEndpoint, setLastEndpoint] = useState<string>("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Filtros UI
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [adm, setAdm] = useState<string>("");
  const [resultado, setResultado] = useState<string>("");
  const [gerenteFilter, setGerenteFilter] = useState<string>("");
  const [advogadoFilter, setAdvogadoFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [onlyLive, setOnlyLive] = useState<boolean>(false); // mostra apenas processos com timer rodando

  // Ordenação/Paginação
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  // Avoid accessing localStorage during SSR (Next.js). Initialize with defaults
  const [itemsPerPage, setItemsPerPage] = useState<number>(PAGE_SIZE);
  const [isCompactTable, setIsCompactTable] = useState<boolean>(true); // Inicia com tabela selecionada
  
  // Navegação por mouse
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Helper para classe de célula da tabela com modo compacto
  const tdClass = (additionalClasses = "") => `px-2.5 ${isCompactTable ? 'py-1' : 'py-1.5'} ${additionalClasses}`;



  // Read persisted preferences on client-side only
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedItems = localStorage.getItem('itemsPerPage');
      if (savedItems) setItemsPerPage(parseInt(savedItems, 10));
    } catch (err) {
      // ignore
    }
    try {
      const savedCompact = localStorage.getItem('tableCompactMode');
      setIsCompactTable(savedCompact === 'true');
    } catch (err) {
      // ignore
    }
  }, []);

  // Mobile UI state
  const [mobileMode, setMobileMode] = useState<"cards"|"compact">("cards"); // alterna visualização



  // Persistir preferências
  useEffect(() => {
    localStorage.setItem('itemsPerPage', String(itemsPerPage));
  }, [itemsPerPage]);

  useEffect(() => {
    localStorage.setItem('tableCompactMode', String(isCompactTable));
    if (isCompactTable) {
      document.body.classList.add('compact-table');
    } else {
      document.body.classList.remove('compact-table');
    }
  }, [isCompactTable]);

  // 🔵 re-render a cada 1s para o timer
  useTicker(1000);

  // 🔵 freeze_timer: evita spam de chamadas ao backend
  const freezeTriedRef = useRef<Set<number>>(new Set());

  // Funções de navegação por mouse drag 
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !tableContainerRef.current) return; // Apenas botão esquerdo
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setScrollStart({
      x: tableContainerRef.current.scrollLeft,
      y: tableContainerRef.current.scrollTop
    });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !tableContainerRef.current) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    tableContainerRef.current.scrollLeft = scrollStart.x - deltaX;
    tableContainerRef.current.scrollTop = scrollStart.y - deltaY;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseUp);
      return () => {
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('mouseleave', handleMouseUp);
      };
    }
  }, [isDragging]);



  const buildAuthHeaders = (extra?: Record<string,string>) => {
    const headers: Record<string,string> = {
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      ...(extra || {})
    };
    if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    if (currentUser?.id) headers["X-Usuario-Id"] = String(currentUser.id);
    return headers;
  };

  const tryFetch = async (endpoint: string) => {
    const headers = buildAuthHeaders();
    const bust = `_=${Date.now()}`;
    const url = `${API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}${bust}`;

    let res = await fetch(url, { headers, credentials: "include", cache: "no-store" });
    if (res.status === 401 && headers.Authorization) {
      const { Authorization, ...noAuth } = headers;
      res = await fetch(url, { headers: noAuth, credentials: "include", cache: "no-store" });
    }
    if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
    const json = await res.json();
    return extractItems(json);
  };

  const fetchData = async () => {
    setLoading(true); setError(""); setItems([]); setLastEndpoint("");
    try {
      const endpoints = ["/extratos", "/processos", "/api/extratos"];
      let loaded: any[] = []; let used = "";
      for (const ep of endpoints) {
        try {
          const arr = await tryFetch(ep);
          if (Array.isArray(arr)) { loaded = arr; used = ep; break; }
        } catch { /* tenta o próximo */ }
      }
      if (!used) throw new Error("Nenhum endpoint conhecido respondeu com dados de processos.");

      // 🔍 DEBUG: Log dos IDs recebidos da API
      console.log('🔍 IDs recebidos da API:', (loaded || []).map((it: any) => it.id));

      loaded = (loaded || []).map((it:any) => {
        const gNome = it.gerente_nome ?? it?.gerente?.nome ?? it?.gerente?.nome_completo ?? it?.criado_por_nome ?? it?.usuario_criador_nome ?? (it.gerente_id ? `#${it.gerente_id}` : null);
        // blindagem: extras como objeto
        let extras = it.extras;
        if (typeof extras === "string") {
          try { extras = JSON.parse(extras); } catch { extras = {}; }
        }
        if (!extras || typeof extras !== "object") extras = {};

        const docRaw = extras.documento_identidade;
        let docList: string[] = [];
        if (Array.isArray(docRaw)) {
          docList = docRaw.filter((x) => typeof x === "string" && x.trim());
        } else if (docRaw && typeof docRaw === "object") {
          const candidatura = (docRaw as any);
          if (Array.isArray(candidatura.lista)) docList = candidatura.lista.filter((x: any) => typeof x === "string" && x.trim());
          else if (Array.isArray(candidatura.completo)) docList = candidatura.completo.filter((x: any) => typeof x === "string" && x.trim());
        } else if (typeof docRaw === "string" && docRaw.trim()) {
          docList = [docRaw.trim()];
        }
        extras.documento_identidade = docList;

        // snapshot/ status de anexos minimamente salvos no backend
        if (!extras.endereco_snapshot && (it.rua || it.numero || it.bairro || it.cidade || it.estado || it.cep)) {
          extras.endereco_snapshot = {
            rua: it.rua || "",
            numero: it.numero || "",
            bairro: it.bairro || "",
            complemento: it.complemento || "",
            cidade: it.cidade || "",
            estado: it.estado || "",
            cep: it.cep || "",
          };
        }

        if (!extras.minimos) {
          const enderecoOk = Boolean(it.comprovante_endereco_url) || Boolean(extras?.comprovante_endereco_url);
          const docCount = docList.length + (extras?.documento_identidade_url ? 1 : 0) + (it.documento_identidade_url ? 1 : 0);
          const identidadeOk = docCount > 0;
          extras.minimos = {
            endereco_ok: enderecoOk,
            identidade_ok: identidadeOk,
            ok: enderecoOk && identidadeOk,
          };
        }

        return { ...it, gerente_nome: gNome, extras };
      });

      // 🔍 DEBUG: Log dos IDs após processamento
      console.log('🔍 IDs após processamento:', (loaded || []).map((it: any) => it.id));

      setItems(loaded);
      setLastEndpoint(`${API_BASE}${used}`);
    } catch (e: any) {
      setError(e?.message || "Erro inesperado ao buscar processos");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const onFocus = () => fetchData();
    const onVisible = () => { if (document.visibilityState === "visible") fetchData(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  // 🔵 freeze_timer
  useEffect(() => {
    const run = async () => {
      const headers = buildAuthHeaders({ "Content-Type": "application/json" });
      for (const it of items) {
        const id = Number(it?.id);
        if (!id || freezeTriedRef.current.has(id)) continue;

        const numero = (it?.numero_processo ?? it?.numeroProcesso ?? it?.processo_numero ?? "").toString().trim();
        const stopAt = it?.extras?.numero_processo_set_at ?? it?.numero_processo_set_at;
        if (numero && !stopAt) {
          freezeTriedRef.current.add(id);
          try {
            await fetch(`${API_BASE}/uploads/freeze_timer?extrato_id=${id}`, {
              method: "POST",
              headers,
              credentials: "include"
            });
          } catch { /* silencioso */ }
        }
      }
    };
    if (items?.length) run();
  }, [items]);

  const clearFilters = () => {
    setQ(""); setStatus(""); setAdm(""); setResultado(""); setGerenteFilter(""); setAdvogadoFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
  };

  const handleDeleteProcesso = async (proc: Processo) => {
    const id = Number(proc?.id);
    if (!id) {
      alert("ID do processo inválido.");
      return;
    }
    const nome = proc?.nome_cliente ? ` do cliente ${proc.nome_cliente}` : "";
    if (!confirm(`Tem certeza que deseja excluir o processo #${id}${nome}? Esta ação remove também anexos e dados relacionados.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const headers = buildAuthHeaders();
      if (proc?.usuario_id) headers["X-Usuario-Id"] = String(proc.usuario_id);
      const res = await fetch(`${API_BASE}/extratos/${id}`, {
        method: "DELETE",
        headers,
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const msg = await res.text();
        throw new Error(msg || `Falha ao excluir processo (${res.status}).`);
      }
      setItems(prev => prev.filter(item => Number(item.id) !== id));
    } catch (e: any) {
      console.error("Erro ao excluir processo:", e);
      alert(e?.message || "Erro ao excluir processo.");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteProcess = async (id: number) => {
    const proc = items.find(item => Number(item.id) === id);
    if (proc) {
      await handleDeleteProcesso(proc);
    }
  };

  const toggleSignedExternal = async (proc: Processo) => {
    console.log('toggleSignedExternal chamado para processo:', proc?.id);
    
    const id = Number(proc?.id);
    if (!id) return alert('ID inválido');
    
    const isCurrentlySigned = getDisplayStatus(proc) === 'Assinado (fora)';
    const action = isCurrentlySigned ? 'unmark' : 'mark';
    
    if (!confirm(`${isCurrentlySigned ? 'Remover marca' : 'Marcar'} processo #${id} como assinado fora da plataforma?`)) return;
    
    try {
      const headers = buildAuthHeaders({ 'Content-Type': 'application/json' });
      const endpoint = `${API_BASE}/uploads/${action}_signed_external/${id}`;
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      
      if (!res.ok) throw new Error(await res.text());
      await fetchData();
      
      alert(`Processo ${isCurrentlySigned ? 'desmarcado' : 'marcado'} como Assinado (fora).`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || `Erro ao ${isCurrentlySigned ? 'desmarcar' : 'marcar'} como assinado`);
    }
  };

  const uniqueStatuses = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const sv = getDisplayStatus(i);
      if (sv) set.add(sv);
    });
    return Array.from(set);
  }, [items]);

  const uniqueResultados = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(getResultadoLabel(i)));
    const arr = Array.from(set).filter(Boolean);
    const prio = (s:string) => (s==="Acordo" ? 0 : s==="Sentença à Vista" ? 1 : 2);
    return arr.sort((a,b)=> prio(a)-prio(b) || a.localeCompare(b));
  }, [items]);

  const uniqueAdms = useMemo(() => {
    const set = new Set<string>(); items.forEach((i) => i.administradora && set.add(i.administradora)); return Array.from(set);
  }, [items]);

  const uniqueGerentes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const n = displayGerenteName(i);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [items]);

  const uniqueAdvogados = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      const n = displayAdvogadoName(i);
      if (n) set.add(n);
    });
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    let arr = items.filter((it) => {
      const inText = (s?: any) => String(s || "").toLowerCase();
      const hay = [
        it.id, it.nome_cliente, getDisplayStatus(it), it.grupo, it.cota, it.administradora,
        it.advogado_nome, it.advogado_usuario, displayGerenteName(it), getResultadoLabel(it),
        it.numero_processo,
      ].map(inText).join(" ");
      if (query && !hay.includes(query)) return false;
      if (status && getDisplayStatus(it) !== status) return false;
      if (adm && (it.administradora || "") !== adm) return false;
      if (resultado && getResultadoLabel(it) !== resultado) return false;

      if (gerenteFilter) {
        const g = displayGerenteName(it) || "";
        if (g !== gerenteFilter) return false;
      }
      if (advogadoFilter) {
        const a = displayAdvogadoName(it) || "";
        if (a !== advogadoFilter) return false;
      }

      const d = new Date(it.criado_em || it.data_exportacao || "");
      if (dateFrom) { const df = new Date(dateFrom); if (!Number.isNaN(d.getTime()) && d < df) return false; }
      if (dateTo)   { const dt = new Date(dateTo);   if (!Number.isNaN(d.getTime()) && d > dt) return false; }
      return true;
    });

    arr = filterByScope(arr, perfil as any, currentUser as any);

    if (onlyLive) {
      arr = arr.filter(i => {
        try {
          const timestamps = getProcessTimestamps(i);
          // Se tem início mas não tem fim, está rodando
          return (timestamps.startEnvio && !timestamps.assinaturaConcluida) ||
                 (timestamps.assinaturaConcluida && !timestamps.enviadoAdvogado) ||
                 (timestamps.enviadoAdvogado && !timestamps.advogadoConcluiu);
        } catch { return false; }
      });
    }

    arr.sort((a: any, b: any) => {
      if (sortKey === "_resultado") {
        const sa = getResultadoLabel(a); const sb = getResultadoLabel(b);
        return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      }
      const av = a?.[sortKey], bv = b?.[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return sortAsc ? -1 : 1;
      if (bv == null) return sortAsc ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return sortAsc ? av - bv : bv - av;
      const sa2 = String(av), sb2 = String(bv);
      return sortAsc ? sa2.localeCompare(sb2) : sb2.localeCompare(sa2);
    });

    return arr;
  }, [items, q, status, adm, resultado, gerenteFilter, advogadoFilter, dateFrom, dateTo, sortKey, sortAsc, perfil, currentUser]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const onSort = (key: string) => {
    if (key === "id") { if (sortKey === "id") setSortAsc(s => !s); else { setSortKey("id"); setSortAsc(false); } return; }
    if (key === "_resultado") { if (sortKey === "_resultado") setSortAsc(s=>!s); else { setSortKey("_resultado"); setSortAsc(true);} return; }
    if (key === "numero_processo") { if (sortKey === "numero_processo") setSortAsc(s=>!s); else { setSortKey("numero_processo"); setSortAsc(true);} return; }
    if (key === sortKey) setSortAsc(s => !s); else { setSortKey(key); setSortAsc(true); }
  };

  const totals = useMemo(() => {
    const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const getFuturo = (i: any) => num((i.valor_futuro ?? i.valor_corrigido_futuro));
    const getHoje = (i: any) => num(i.valor_corrigido_hoje);

    const sumHoje = filtered.reduce((acc, i) => acc + getHoje(i), 0);
    const sumFuturo = filtered.reduce((acc, i) => acc + getFuturo(i), 0);

    const hHojeAdv = filtered.reduce((acc, i) => acc + num(i.honorarios_hoje_adv), 0);
    const hHojeEmp = filtered.reduce((acc, i) => acc + num(i.honorarios_hoje_emp), 0);
    const hHojeTot = hHojeAdv + hHojeEmp;

    const hFutAdv = filtered.reduce((acc, i) => acc + num(i.honorarios_futuro_adv), 0);
    const hFutEmp = filtered.reduce((acc, i) => acc + num(i.honorarios_futuro_emp), 0);
    const hFutTot = hFutAdv + hFutEmp;

    const liqHojeSum = filtered.reduce((acc, i) => {
      const tot = num(i.honorarios_hoje_total ?? (num(i.honorarios_hoje_adv) + num(i.honorarios_hoje_emp)));
      return acc + (num(i.liquido_hoje) || (num(i.valor_corrigido_hoje) - tot));
    }, 0);

    const liqFutSum = filtered.reduce((acc, i) => {
      const tot = num(i.honorarios_futuro_total ?? (num(i.honorarios_futuro_adv) + num(i.honorarios_futuro_emp)));
      const bruto = getFuturo(i);
      return acc + (num(i.liquido_futuro) || (bruto - tot));
    }, 0);

    return { sumHoje, sumFuturo, hHojeAdv, hHojeEmp, hHojeTot, hFutAdv, hFutEmp, hFutTot, liqHojeSum, liqFutSum,
      hasHoje: filtered.some(i => i.valor_corrigido_hoje != null),
      hasFuturo: filtered.some(i => (i.valor_futuro ?? i.valor_corrigido_futuro) != null),
    };
  }, [filtered]);

  const exportCSV = () => {
    const header = [
      "ID","Cliente","Status","Resultado","Grupo","Cota","Administradora","Número do Processo","Aguardando",
      "Valor Hoje","Valor Futuro","Honorários Hoje","Honorários Futuro","Líquido Hoje","Líquido Futuro","Advogado","Gerente","Criado em",
    ];
    const rows = filtered.map((it) => {
      const timestamps = getProcessTimestamps(it);
      let aguardandoLabel = "—";
      if (timestamps.advogadoConcluiu) {
        aguardandoLabel = "Processo concluído";
      } else if (timestamps.enviadoAdvogado) {
        aguardandoLabel = "Aguardando Advogado";
      } else if (timestamps.assinaturaConcluida) {
        aguardandoLabel = "Aguardando Gerente";
      } else if (timestamps.startEnvio) {
        aguardandoLabel = "Aguardando Assinatura";
      }
      return [
        it.id, it.nome_cliente || "", getDisplayStatus(it) || "", getResultadoLabel(it), it.grupo ?? "", it.cota ?? "", it.administradora || "",
        (it.numero_processo ?? "") || "",
        aguardandoLabel,
        String(valorHojeDisplay(it) ?? ""),
        String((it.valor_futuro ?? it.valor_corrigido_futuro) ?? ""),
        String(((it.honorarios_hoje_total ?? (Number(it.honorarios_hoje_adv||0)+Number(it.honorarios_hoje_emp||0))) || 0)),
        String(((it.honorarios_futuro_total ?? (Number(it.honorarios_futuro_adv||0)+Number(it.honorarios_futuro_emp||0))) || 0)),
        String((it.liquido_hoje ?? (Number(valorHojeDisplay(it)||0) - (((it.honorarios_hoje_total ?? (Number(it.honorarios_hoje_adv||0)+Number(it.honorarios_hoje_emp||0))) || 0))))),
        String((it.liquido_futuro ?? (Number((it.valor_futuro ?? it.valor_corrigido_futuro)||0) - (((it.honorarios_futuro_total ?? (Number(it.honorarios_futuro_adv||0)+Number(it.honorarios_futuro_emp||0))) || 0))))),
        it.advogado_nome || it.advogado_usuario || "", displayGerenteName(it) || String(it.gerente_id ?? ""), it.criado_em || it.data_exportacao || "",
      ];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], {type: "text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `processos_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };





  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="mx-auto max-w-none px-4 pt-2 sm:px-6 lg:px-8">
        <TarjaInline />
      </div>

      <header className="border-b bg-white">
        <div className="mx-auto max-w-none px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="hidden md:flex items-center gap-4">
              <div>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">Painel Gerencial – Processos</h1>
                <p className="text-xs text-slate-500 md:inline md:ml-2 md:before:content-['•'] md:before:mr-2">Visualize e filtre os processos cadastrados.</p>
              </div>
              {lastEndpoint && (
                <div className="hidden lg:block text-[11px] text-slate-400">
                  Fonte: <span className="font-mono">{lastEndpoint}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 md:ml-auto">
              {/* Toggle Cards/Tabela */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Cards</span>
                <button
                  onClick={() => setIsCompactTable(!isCompactTable)}
                  className={cls(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
                    !isCompactTable ? "bg-slate-300" : "bg-blue-600"
                  )}
                  title={!isCompactTable ? "Mudar para tabela" : "Mudar para cards"}
                >
                  <span
                    className={cls(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200",
                      !isCompactTable ? "translate-x-1" : "translate-x-6"
                    )}
                  />
                </button>
                <span className="text-xs font-medium text-slate-600">Tabela</span>
              </div>
              
              {perfil && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300">
                  {perfil}
                </span>
              )}
              <Link href="/" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50" title="Página principal">
                <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden md:inline">Início</span>
              </Link>
              <button onClick={fetchData} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50" title="Recarregar">
                <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden md:inline">Reload</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Erro */}
      {error && (
        <div className="mx-auto mt-4 max-w-none px-4 sm:px-6 lg:px-8">
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
            <div className="text-sm">
              <div className="font-semibold">Não consegui carregar os processos</div>
              <div className="mt-0.5 leading-relaxed">{String(error)}</div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE - Filtros fixos no topo (fora do main) */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-slate-50 shadow-md border-b border-slate-200">
        {/* Linha do usuário e botões */}
        <div className="px-4 py-2 bg-white border-b border-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 overflow-hidden">
              <TarjaInline />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/" className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm" title="Página principal">
                <ArrowLeft className="h-3 w-3" />
              </Link>
              <button onClick={fetchData} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 shadow-sm" title="Recarregar">
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-4 py-2 space-y-2">
          <div className="relative">
            <input
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm outline-none ring-0 focus:border-slate-400"
              placeholder="Buscar..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

        {/* Filtros em grid compacto */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={status} onChange={(e)=>{setStatus(e.target.value); setPage(1);}}>
            <option value="">Status</option>
            {uniqueStatuses.map((s)=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={resultado} onChange={(e)=>{setResultado(e.target.value); setPage(1);}}>
            <option value="">Resultado</option>
            {uniqueResultados.map((s)=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={adm} onChange={(e)=>{setAdm(e.target.value); setPage(1);}}>
            <option value="">Adm</option>
            {uniqueAdms.map((s)=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={gerenteFilter} onChange={(e)=>{setGerenteFilter(e.target.value); setPage(1);}}>
            <option value="">Gerente</option>
            {uniqueGerentes.map((s)=> <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={advogadoFilter} onChange={(e)=>{setAdvogadoFilter(e.target.value); setPage(1);}}>
            <option value="">Advogado</option>
            {uniqueAdvogados.map((s)=> <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={dateFrom} onChange={(e)=>{setDateFrom(e.target.value); setPage(1);}} placeholder="De" />
          <input type="date" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={dateTo} onChange={(e)=>{setDateTo(e.target.value); setPage(1);}} placeholder="Até" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearFilters} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
            <RefreshCw className="h-3.5 w-3.5"/> Limpar
          </button>
          <Link href="/" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm">
            <Plus className="h-3.5 w-3.5"/> Novo
          </Link>
          <button onClick={exportCSV} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 px-2 py-1.5 text-xs font-medium text-white shadow-sm">
            <Download className="h-3.5 w-3.5"/> CSV
          </button>
        </div>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="mx-auto max-w-none px-4 pb-24 sm:px-6 lg:px-8 md:pt-3 pt-[161px]">
        {/* 🔵 Filtros Desktop */}
        <div className="mb-4 space-y-4">
          {/* DESKTOP filtros compactos */}
          <div className="hidden md:block">
            {/* Linha 1: Busca e Ações */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 relative">
                <input
                  className="w-full rounded-lg border border-slate-300 bg-white px-9 py-2 text-sm outline-none ring-0 focus:border-slate-400"
                  placeholder="Buscar processos..."
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  title="Limpar filtros"
                >
                  <RefreshCw className="h-4 w-4" /> Limpar
                </button>
              </div>
            </div>
            
            {/* Linha 2: Filtros organizados */}
            <div className="grid grid-cols-8 gap-2">
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Status</option>
                {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={resultado} onChange={(e) => { setResultado(e.target.value); setPage(1); }}>
                <option value="">Resultado</option>
                {uniqueResultados.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="col-span-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={adm} onChange={(e) => { setAdm(e.target.value); setPage(1); }}>
                <option value="">Administradora</option>
                {uniqueAdms.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={gerenteFilter} onChange={(e) => { setGerenteFilter(e.target.value); setPage(1); }}>
                <option value="">Gerente</option>
                {uniqueGerentes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={advogadoFilter} onChange={(e) => { setAdvogadoFilter(e.target.value); setPage(1); }}>
                <option value="">Advogado</option>
                {uniqueAdvogados.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="De" />
              <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="Até" />
            </div>
          </div>
        </div>
        {/* Resumo compacto desktop */}
        <div className="hidden md:flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm mb-3">
          <div className="flex items-center gap-4 text-slate-700">
            <span><strong>{total}</strong> processo(s)</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-700 font-medium">
              {totals.hasHoje ? `Hoje: ${fmtBRL(totals.sumHoje)}` : "Hoje: —"}
            </span>
            <span className="text-blue-700 font-medium">
              {totals.hasFuturo ? `Futuro: ${fmtBRL(totals.sumFuturo)}` : "Futuro: —"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500"
              title="Cadastrar novo processo"
            >
              <Plus className="h-4 w-4" /> Novo
            </Link>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              title="Exportar CSV"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>

        {/* Resumo mobile (mantido original) */}
        <div className="md:hidden mb-3 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 sm:px-4 py-3 text-xs sm:text-sm shadow-sm">
          <div className="text-slate-700 text-center">
            Resultados filtrados: <span className="font-semibold">{total}</span> processo(s)
          </div>
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <span className="rounded-full border-2 border-green-300 bg-green-50 px-3 py-2 text-xs sm:text-sm font-bold text-green-800">
              {totals.hasHoje ? `Hoje: ${fmtBRL(totals.sumHoje)}` : "Hoje: —"}
            </span>
            <span className="rounded-full border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs sm:text-sm font-bold text-amber-800">
              {totals.hasFuturo ? `Futuro: ${fmtBRL(totals.sumFuturo)}` : "Futuro: —"}
            </span>
          </div>
        </div>

        {/* ====== MOBILE: Cards ou Tabela ====== */}
        <section className="md:hidden space-y-2">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-slate-500">Carregando processos…</div>
          )}
          {!loading && pageItems.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-slate-500">Nenhum processo encontrado.</div>
          )}
          
          {/* Mobile sempre mostra cards */}
          {!loading && pageItems.map((it)=> (
            <MobileProcessCard key={it.id} it={it} compact={false} onToggleSignedExternal={toggleSignedExternal} onDelete={deleteProcess} />
          ))}
        </section>

        {/* ====== DESKTOP: Tabela ampla ou Cards ====== */}
        {isCompactTable ? (
          // Modo tabela compacta
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div 
              ref={tableContainerRef}
              className={`overflow-auto transition-all ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} compact-table`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              style={{ 
                userSelect: isDragging ? 'none' : 'auto',
                scrollBehavior: isDragging ? 'auto' : 'smooth'
              }}
              title="Arrastar para navegar na tabela"
            >
              <div className="flex-1">
                <table className="min-w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[90px]" />
                  <col className="w-[140px]" />
                  <col className="w-20" />
                  <col className="min-w-[220px]" />
                  <col className="w-[90px]" />
                  <col className="w-[90px]" />
                  <col className="min-w-[200px]" />
                  <col className="min-w-[180px]" />
                  <col className="w-[180px]" />
                  <col className="w-[140px]" />
                  <col className="w-[140px]" />
                  <col className="w-[140px]" />
                  <col className="w-[170px]" />
                  <col className="w-[180px]" />
                  <col className="w-[140px]" />
                  <col className="w-[150px]" />
                  <col className="min-w-[180px]" />
                  <col className="min-w-40" />
                  <col className="w-[130px]" />
                  <col className="w-[120px]" />
                </colgroup>
                <thead className="text-xs">
                  <tr className="bg-white sticky top-0 z-10 border-b text-slate-600">
                    {[
                      { key: "anexos", label: "Anexos", w: "w-[90px]" },
                      { key: "status", label: "Status", w: "w-[140px]" },
                      { key: "id", label: "ID", w: "w-[80px]" },
                      { key: "nome_cliente", label: "Cliente", w: "min-w-[220px]" },
                      { key: "grupo", label: "Grupo", w: "w-[90px]" },
                      { key: "cota", label: "Cota", w: "w-[90px]" },
                      { key: "administradora", label: "Administradora", w: "min-w-[200px]" },
                      { key: "numero_processo", label: "Número do Processo", w: "min-w-[180px]" },
                      { key: "_resultado", label: "Resultado", w: "w-[140px]" },
                      { key: "valor_corrigido_hoje", label: "Valor Hoje", w: "w-[140px]" },
                      { key: "valor_futuro", label: "Valor Futuro", w: "w-[140px]" },
                      { key: "honorarios_hoje_total", label: "Honorários Hoje", w: "w-[170px]" },
                      { key: "honorarios_futuro_total", label: "Honorários Futuro", w: "w-[180px]" },
                      { key: "liquido_hoje", label: "Líquido Hoje", w: "w-[140px]" },
                      { key: "liquido_futuro", label: "Líquido Futuro", w: "w-[150px]" },
                      { key: "advogado_nome", label: "Advogado", w: "min-w-[180px]" },
                      { key: "gerente_nome", label: "Gerente", w: "min-w-[160px]" },
                      { key: "criado_em", label: "Criado em", w: "w-[130px]" },
                      { key: "acoes", label: "Ações", w: "w-[120px]" },
                    ].map((col) => (
                      <th key={col.key} className={cls(`px-2.5 ${isCompactTable ? 'py-1' : 'py-1.5'} font-semibold whitespace-nowrap`, col.w)}>
                        <button
                          onClick={() => !["acoes","anexos","_aguardando_adv"].includes(col.key) && onSort(col.key)}
                          className={cls("group inline-flex items-center gap-1", !["acoes","anexos","_aguardando_adv"].includes(col.key) && "hover:underline")}
                        >
                          {col.label}
                          {sortKey === col.key && (
                            sortAsc ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={20} className="px-4 py-10 text-center text-slate-500">Carregando processos…</td>
                    </tr>
                  )}
                  {!loading && pageItems.length === 0 && (
                    <tr>
                      <td colSpan={20} className="px-4 py-10 text-center text-slate-500">Nenhum processo encontrado.</td>
                    </tr>
                  )}
                  {!loading && pageItems.map((it) => {
                    const docs = getDocsStatus(it);
                    const awaiting = docs.needs;
                    const resLabel = getResultadoLabel(it);
                    const statusLabel = getDisplayStatus(it);
                    const pillCls = resultadoPillClass(resLabel);
                    const numeroProc = (it.numero_processo ?? it.numeroProcesso ?? it.processo_numero ?? "").toString().trim();
                    // const timeline = computeProcessTimeline(it, new Date()); // ❌ REMOVIDO - usa fase_atual agora
                    const comarcaUF = displayComarcaUF(it); // 🔵 COMARCA/UF
                    const comarcaNome = displayComarcaNome(it);

                    return (
                      <tr
                        key={it.id}
                        className={cls(
                          "border-t border-slate-100 hover:bg-slate-50 transition-colors",
                          awaiting ? "bg-amber-50/70 ring-1 ring-amber-300" : "odd:bg-white even:bg-slate-50/40"
                        )}
                        title={awaiting ? "Aguardando anexar comprovante de residência e identidade" : ""}
                      >
                        {/* Anexos */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          {/* ✅ Href CONCRETA, sem [extratoId], sem onClick */}
                          <Link
                            href={`/anexos/${it.id}?uid=${pickUidFromRow(it)}&gname=${encodeURIComponent(displayGerenteName(it) || '')}`}
                            prefetch={false}
                            className={cls(
                              "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium",
                              awaiting
                                ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            )}
                            title="Abrir tela de anexos"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {awaiting ? (
                              <>
                                <span>Pendente</span>
                                <AlertCircle className="h-3.5 w-3.5" />
                              </>
                            ) : (
                              <>
                                <span>Anexos</span>
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              </>
                            )}
                          </Link>
                          <div className={cls("mt-0.5 text-[11px]", awaiting ? "text-amber-700" : "text-slate-500")}>
                            {docs.count > 0 ? `${docs.count} arquivo(s)` : "nenhum arquivo"}
                          </div>
                        </td>

                        {/* Status */}
                        <td className={tdClass("text-center")}>
                          <div>
                            <StatusColumn 
                              status={statusLabel}
                              timestamp={getTimestampForStatus(it)}
                            />
                          </div>
                        </td>

                        {/* ID */}
                        <td className={tdClass("font-medium text-slate-900 whitespace-nowrap")}>{it.id}</td>

                        {/* Cliente */}
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-60" title={it.nome_cliente || ""}>{it.nome_cliente || "—"}</div>
                          {comarcaUF && (
                            <div className="mt-0.5 text-[11px] text-slate-500 truncate" title={comarcaUF}>
                              <span className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 mr-1">
                                Cidade:
                              </span>
                              {comarcaUF}
                            </div>
                          )}
                        </td>

                        {/* Grupo / Cota */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{it.grupo ?? "—"}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{it.cota ?? "—"}</td>

                        {/* Administradora */}
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-60" title={it.administradora || ""}>{it.administradora || "—"}</div>
                        </td>

                        {/* Número do processo — negrito + COMARCA/UF abaixo */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{numeroProc || "—"}</span>
                          {/* 🔵 Comarca sob o número do processo */}
                          {comarcaNome && (
                            <div className="mt-0.5 text-[11px] text-slate-600 truncate" title={comarcaNome}>
                              <span className="font-semibold uppercase tracking-wide text-[10px] text-slate-500 mr-1">
                                Comarca:
                              </span>
                              {comarcaNome}
                            </div>
                          )}
                        </td>

                        {/* Resultado */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className={cls("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pillCls)}>
                            {resLabel}
                          </span>
                        </td>

                        {/* Valor Hoje */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-slate-100">
                          <div className="flex flex-col items-end">
                            <div>{fmtBRL(valorHojeDisplay(it))}</div>
                          </div>
                        </td>

                        {/* Valor Futuro */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtBRL((it.valor_futuro ?? it.valor_corrigido_futuro))}</td>

                        {/* Honorários Hoje */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-slate-100">
                          {(() => { const adv = Number(it.honorarios_hoje_adv||0); const emp = Number(it.honorarios_hoje_emp||0); const tot = Number((it.honorarios_hoje_total ?? (adv+emp)) ?? 0) || 0; return (<div className="flex flex-col items-end"><div>{fmtBRL(tot)}</div><div className="text-[11px] text-slate-500">{fmtBRL(adv)} (adv.) + {fmtBRL(emp)} (emp.)</div></div>); })()}
                        </td>

                        {/* Honorários Futuro */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {(() => { const adv = Number(it.honorarios_futuro_adv||0); const emp = Number(it.honorarios_futuro_emp||0); const tot = Number((it.honorarios_futuro_total ?? (adv+emp)) ?? 0) || 0; return (<div className="flex flex-col items-end"><div>{fmtBRL(tot)}</div><div className="text-[11px] text-slate-500">{fmtBRL(adv)} (adv.) + {fmtBRL(emp)} (emp.)</div></div>); })()}
                        </td>

                        {/* Líquido Hoje */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap border-l border-slate-100">
                          {fmtBRL((it.liquido_hoje ?? (Number(valorHojeDisplay(it) || 0) - (Number((it.honorarios_hoje_total ?? (Number(it.honorarios_hoje_adv || 0) + Number(it.honorarios_hoje_emp || 0)))) || 0))))}
                        </td>

                        {/* Líquido Futuro */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {fmtBRL((it.liquido_futuro ?? (Number((it.valor_futuro ?? it.valor_corrigido_futuro) || 0) - (Number((it.honorarios_futuro_total ?? (Number(it.honorarios_futuro_adv || 0) + Number(it.honorarios_futuro_emp || 0)))) || 0))))}
                        </td>

                        {/* Advogado / Gerente */}
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-[200px]" title={displayAdvogadoName(it)}>
                            {displayAdvogadoName(it) || "—"}
                          </div>
                        </td>
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-[200px]" title={displayGerenteName(it) || (it.gerente_id ? `#${it.gerente_id}` : "")}>
                            {displayGerenteName(it) || (it.gerente_id ? `#${it.gerente_id}` : "—")}
                          </div>
                        </td>

                        {/* Criado em / Ações */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{fmtDate(it.criado_em || it.data_exportacao)}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/?extratoId=${it.id}&mode=adv&reload=${Date.now()}`}
                              className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              VER EXTRATO
                            </Link>
                            <button
                              onClick={() => toggleSignedExternal(it)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 ${
                                getDisplayStatus(it) === 'Assinado (fora)' 
                                  ? 'bg-slate-500 hover:bg-slate-600' 
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                              title={getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover marca de assinado fora' : 'Marcar como assinado fora'}
                            >
                              {getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover Assinado Fora' : 'Assinado Fora'}
                            </button>
                            <button
                              onClick={() => handleDeleteProcesso(it)}
                              disabled={deletingId === it.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                              title="Excluir processo e anexos"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingId === it.id ? "Excluindo..." : "Excluir"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t text-sm">
                  <tr className="text-slate-700">
                    <td className="px-2.5 py-1.5 font-semibold" colSpan={10}>Totais (filtro)</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">{totals.hasHoje ? fmtBRL(totals.sumHoje) : "—"}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">{totals.hasFuturo ? fmtBRL(totals.sumFuturo) : "—"}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">
                      <div className="flex flex-col items-end">
                        <div>{fmtBRL(totals.hHojeTot)}</div>
                        <div className="text-[11px] text-slate-500">{fmtBRL(totals.hHojeAdv)} (adv.) + {fmtBRL(totals.hHojeEmp)} (emp.)</div>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">
                      <div className="flex flex-col items-end">
                        <div>{fmtBRL(totals.hFutTot)}</div>
                        <div className="text-[11px] text-slate-500">{fmtBRL(totals.hFutAdv)} (adv.) + {fmtBRL(totals.hFutEmp)} (emp.)</div>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">{fmtBRL(totals.liqHojeSum)}</td>
                    <td className="px-2.5 py-1.5 text-right font-semibold">{fmtBRL(totals.liqFutSum)}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Paginação desktop */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div>
              Página <span className="font-semibold">{page}</span> de <span className="font-semibold">{totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className={cls("rounded-lg border px-3 py-1.5",
                  page <= 1 ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-white")}>
                Anterior
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className={cls("rounded-lg border px-3 py-1.5",
                  page >= totalPages ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-white")}>
                Próxima
              </button>
            </div>
          </div>
        </div>
        ) : (
          // Modo cards
          <div className="hidden md:block space-y-4">
            {loading && (
              <div className="text-center py-10 text-slate-500">Carregando processos…</div>
            )}
            {!loading && pageItems.length === 0 && (
              <div className="text-center py-10 text-slate-500">Nenhum processo encontrado.</div>
            )}
            {!loading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {pageItems.map((it) => (
                  <MobileProcessCard key={it.id} it={it} compact={false} onToggleSignedExternal={toggleSignedExternal} onDelete={deleteProcess} />
                ))}
              </div>
            )}

            {/* Resumo e paginação para cards */}
            <div className="border-t border-slate-200 bg-white rounded-xl px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <div className="space-y-1">
                  <div>
                    Página <span className="font-semibold">{page}</span> de <span className="font-semibold">{totalPages}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {totals.hasHoje && `Hoje: ${fmtBRL(totals.sumHoje)}`}
                    {totals.hasHoje && totals.hasFuturo && ' • '}
                    {totals.hasFuturo && `Futuro: ${fmtBRL(totals.sumFuturo)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                    className={cls("rounded-lg border px-3 py-1.5",
                      page <= 1 ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-white")}>
                    Anterior
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                    className={cls("rounded-lg border px-3 py-1.5",
                      page >= totalPages ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 hover:bg-white")}>
                    Próxima
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===== MOBILE: Bottom Bar ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 border-t bg-white">
        <div className="mx-auto max-w-none px-4 py-2 flex items-center justify-between text-xs text-slate-700">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className={cls("rounded-lg border px-3 py-2",
              page <= 1 ? "cursor-not-allowed border-slate-2 00 text-slate-300" : "border-slate-300 text-slate-700 bg-white")}>
            Anterior
          </button>
          <div className="font-semibold">Página {page}/{totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className={cls("rounded-lg border px-3 py-2",
              page >= totalPages ? "cursor-not-allowed border-slate-200 text-slate-300" : "border-slate-300 text-slate-700 bg-white")}>
            Próxima
          </button>
        </div>
      </div>


    </div>
  );
}
