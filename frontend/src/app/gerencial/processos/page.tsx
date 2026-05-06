// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  RefreshCw, Search, ChevronDown, ChevronUp, Download, Plus, ArrowLeft,
  AlertCircle , Paperclip, CheckCircle2, Trash2, FileText, CheckCircle, BarChart3
} from "lucide-react";
import { getLoggedUser, getToken, filterByScope } from "@/app/lib/auth";
import { logoutCurrentSession } from "@/app/lib/sessionPresence";
import { AlertModalContent } from "@/components/DailyAlertModal";

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

/** ===================== Formatar Número do Processo CNJ ===================== */
function formatarNumeroProcesso(valor: string): string {
  if (!valor) return "";
  // Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
  // Exemplo: 5006269-27.2025.8.13.0431
  let v = valor.replace(/\D/g, "").slice(0, 20);
  if (v.length <= 7) return v;
  
  let formatted = v.slice(0, 7) + '-';  // NNNNNNN-
  if (v.length <= 9) return formatted + v.slice(7);
  
  formatted += v.slice(7, 9) + '.';  // NNNNNNN-DD.
  if (v.length <= 13) return formatted + v.slice(9);
  
  formatted += v.slice(9, 13) + '.';  // NNNNNNN-DD.AAAA.
  if (v.length <= 14) return formatted + v.slice(13);
  
  formatted += v.slice(13, 14) + '.';  // NNNNNNN-DD.AAAA.J.
  if (v.length <= 16) return formatted + v.slice(14);
  
  formatted += v.slice(14, 16) + '.';  // NNNNNNN-DD.AAAA.J.TR.
  formatted += v.slice(16, 20);  // NNNNNNN-DD.AAAA.J.TR.OOOO
  
  return formatted;
}

/** ===================== Timezone Helper ===================== */
function applyBrazilTimezoneForSent(isoString: string | null, status: string): string | null {
  if (!isoString) return null;
  
  // Aplicar correção de timezone apenas para status "Enviado"
  if (status === "Enviado") {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    
    // Subtrair 3 horas para converter de UTC para timezone brasileiro (UTC-3)
    const brazilTime = new Date(d.getTime() - (3 * 60 * 60 * 1000));
    return brazilTime.toISOString();
  }
  
  // Para outros status, retornar sem alteração
  return isoString;
}

/** ===================== Process Timestamps Helper ===================== */
function getProcessTimestamps(item: any) {
  // Função básica para compatibilidade - retorna timestamps baseado no status/fase
  const status = item?.status || item?.fase_atual || '';
  const extras = item?.extras || {};
  
  return {
    advogadoConcluiu: status === 'Concluído' || status === 'Finalizado' || extras.advogado_concluiu,
    enviadoAdvogado: status === 'Enviado para Advogado' || status === 'Com Advogado' || extras.enviado_advogado,
    assinaturaConcluida: status === 'Assinado' || status === 'Assinatura Concluída' || extras.assinatura_concluida,
    startEnvio: status === 'Em Andamento' || status === 'Enviado' || extras.start_envio,
  };
}

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

  // ✅ CONTAR TODOS OS ARQUIVOS como a página de anexos faz
  const enderecoEntries = collectStrings(
    row?.comprovante_endereco_url,
    extras?.uploads?.comprovante_endereco,
    fsStatus?.comprovante_endereco,
    fsRow?.comprovante_endereco
  );
  const docEntries = collectStrings(
    row?.documento_identidade_url,
    extras?.uploads?.documento_identidade,
    fsStatus?.documento_identidade,
    fsRow?.documento_identidade
  );
  const outrosEntries = collectStrings(
    row?.outros_anexos_url,
    row?.comprovante_renda_url,
    extras?.uploads?.outros,
    fsStatus?.outros,
    fsRow?.outros
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
  // 🎯 PRIORIDADE 1: Verifica se foi marcado como assinado externamente
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
  if (r === "sem julgamento") return "Sem Julgamento";
  if (r) return r.charAt(0).toUpperCase() + r.slice(1);
  return "Sem Julgamento";
}
function calcComissaoGerente(it: any): number | null {
  const numeroProc = (it.numero_processo ?? it.numeroProcesso ?? it.processo_numero ?? "").toString().trim();
  if (!numeroProc || numeroProc === "None") return null;
  if (getResultadoLabel(it) !== "Acordo") return null;
  const raw = it.honorarios_hoje_total ?? (Number(it.honorarios_hoje_adv || 0) + Number(it.honorarios_hoje_emp || 0));
  const parseVal = (v: any): number => {
    if (typeof v === "number") return v;
    const s = String(v ?? "").replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(s);
  };
  const honor = parseVal(raw);
  if (!Number.isFinite(honor) || honor <= 0) return null;
  return honor / 12;
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
const PAGE_SIZE = 100; // Aumentado para mostrar mais processos inicialmente
const LIVE_REFRESH_MS = 2000;

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

function getSentAtDate(row: any): Date | null {
  const status = getDisplayStatus(row);
  const raw =
    applyBrazilTimezoneForSent(
      row?.enviado_em || row?.extras?.enviado_em || row?.timer_event_at || row?.updated_at || row?.atualizado_em || null,
      status,
    ) || row?.enviado_em || row?.extras?.enviado_em || row?.timer_event_at || row?.updated_at || row?.atualizado_em || null;
  return parseDateMaybe(raw || undefined);
}

function getDaysSince(date: Date | null, now = new Date()): number {
  if (!date) return 0;
  const diff = now.getTime() - date.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.floor(diff / 86400000);
}

function isAwaitingSignatureOverFiveDays(row: any, now = new Date()): boolean {
  if (getDisplayStatus(row) !== "Enviado") return false;
  const sentAt = getSentAtDate(row);
  return getDaysSince(sentAt, now) > 2;
}

function getAwaitingSignatureLabel(row: any, now = new Date()): string {
  const days = getDaysSince(getSentAtDate(row), now);
  if (days <= 0) return "Hoje";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}
const OVERDUE_SIGNATURE_DAYS = 2;

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
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [showDesempenho, setShowDesempenho] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const read = (k: string) => (typeof window !== "undefined" ? (localStorage.getItem(k) || sessionStorage.getItem(k)) : null);
      const nomeAdv = read("nomeAdvogado") || "";
      const nomeUser = read("nomeUsuario") || "";
      const nomeExib = (nomeAdv || nomeUser || "").toString();
      const perfilRaw = ((read("perfil") || read("perfilUsuario") || read("role") || read("papel") || "") + "").toLowerCase();
      const uidRaw = typeof window !== "undefined" ? localStorage.getItem("usuarioId") : null;
      setNome(nomeExib || "Usuário");
      setPerfil(perfilRaw || "usuario");
      setUsuarioId(uidRaw ? parseInt(uidRaw, 10) : null);
    } catch {}
  }, []);

  if (!hydrated) return null;

  const isGerente = perfil === "gerente" || perfil === "admin";
  const isGerenteSomente = perfil === "gerente";
  const isLeonardo = usuarioId === 5;
  const isUsuarioMonitor = usuarioId === 5 || usuarioId === 8 || usuarioId === 11;

  const sair = () => {
    logoutCurrentSession();
    window.location.href = "/login";
  };

  const dispararAlerta = () => {
    try {
      const rawId = typeof window !== "undefined" ? localStorage.getItem("usuarioId") || "" : "";
      const uid = parseInt(rawId, 10) || 0;
      fetch(`${API_BASE}/alerta-forcado/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(uid ? { "X-Usuario-Id": String(uid) } : {}),
        },
        credentials: "include",
      }).catch(() => {});
    } catch {}
  };

  return (
    <>
      {showDesempenho && (
        <AlertModalContent muted onClose={() => setShowDesempenho(false)} />
      )}
      <div className="w-full border rounded-2xl px-3 py-2 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-200">👤</span>
          <div className="truncate font-semibold text-black">{nome}</div>
          {perfil && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-amber-700 border border-amber-300">
              {perfil.charAt(0).toUpperCase() + perfil.slice(1)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
          {isGerenteSomente && (
            <button
              onClick={() => setShowDesempenho(true)}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
            >
              📊 Meu Desempenho
            </button>
          )}
          {isLeonardo && (
            <button
              onClick={dispararAlerta}
              className="inline-flex px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700"
            >
              <span className="sm:hidden">🚨 Alerta</span>
              <span className="hidden sm:inline">🚨 Disparar Alerta</span>
            </button>
          )}
          {isUsuarioMonitor && (
            <a
              href="/gerencial/sessoes"
              className="inline-flex px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              <span className="sm:hidden">Sessões</span>
              <span className="hidden sm:inline">Monitor de Sessões</span>
            </a>
          )}
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
    </>
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
  const haProcesso = numeroProc && numeroProc !== "None" && numeroProc !== "";
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
        haProcesso ? "border-emerald-300 bg-emerald-50/30" : (awaiting ? "border-amber-300 bg-amber-50/70" : "border-slate-200")
      )}
    >
      {/* Linha superior: Nome à esquerda, Anexos à direita */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className={cls("font-semibold text-slate-900 truncate", compact ? "text-base" : "text-lg")}>
          {it.nome_cliente || "—"}
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

      {/* Linha Ass. Manual + Status + Fluxo + ID */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          {onToggleSignedExternal && (
            <button
              onClick={() => onToggleSignedExternal(it)}
              className={`inline-flex items-center gap-1 rounded text-xs font-medium text-white hover:opacity-90 ${
                getDisplayStatus(it) === 'Assinado (fora)' 
                  ? 'bg-slate-500 hover:bg-slate-600 px-3 py-1' 
                  : 'bg-blue-600 hover:bg-blue-700 px-2 py-1'
              }`}
              title={getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover marca de assinado fora' : 'Marcar como assinado fora'}
            >
              {getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover Ass.' : 'Marcar Ass. Fora'}
            </button>
          )}
          <div className="shrink-0">
            <StatusColumn 
              status={statusLabel} 
              timestamp={statusDateVal ? applyBrazilTimezoneForSent(statusDateVal.toISOString(), statusLabel) : null}
              className="min-w-0! w-auto! items-start! text-left!"
            />
          </div>
          <div className="shrink-0">
            {(() => {
              const haProcesso = numeroProc && numeroProc !== "None" && numeroProc !== "";
              return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                  haProcesso 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {haProcesso ? 'Concluído' : 'Incompleto'}
                </span>
              );
            })()}
          </div>
        </div>
        <div className="text-sm text-slate-600 shrink-0">
          <span className="text-slate-500">ID:</span>{" "}
          <span className="font-semibold text-slate-900">{it.id}</span>
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
                EDITAR
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
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const u = getLoggedUser();
    setCurrentUser(u);
    setPerfil(u.perfil);
    setToken(getToken());
    setAuthReady(true);
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
  const [fluxoFilter, setFluxoFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [onlyLive, setOnlyLive] = useState<boolean>(false); // mostra apenas processos com timer rodando
  const [overdueSignatureOnly, setOverdueSignatureOnly] = useState<boolean>(false);
  const [overdueExpanded, setOverdueExpanded] = useState<boolean>(false);

  // Ordenação e Infinite Scroll
  const [sortKey, setSortKey] = useState<string>("id");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  // Mobile inicia com mais itens para melhor UX
  const [visibleItems, setVisibleItems] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return PAGE_SIZE * 4; // 60 itens inicial no mobile
    }
    return 999999;
  });
  // Manter page e totalPages para compatibilidade com cards/mobile (não usado na tabela)
  const [page, setPage] = useState(1);
  // Desktop sempre usa tabela - removido toggle de cards
  const isCompactTable = true;
  
  // Navegação por mouse
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const fetchInFlightRef = useRef(false);

  // Helper para classe de célula da tabela com modo compacto
  const tdClass = (additionalClasses = "") => `px-2.5 ${isCompactTable ? 'py-1' : 'py-1.5'} ${additionalClasses}`;



  // Read persisted preferences on client-side only
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
    if (perfil) headers["X-Perfil"] = perfil; // ✅ Adiciona perfil para autorização
    return headers;
  };

  const tryFetch = async (endpoint: string) => {
    const headers = buildAuthHeaders();
    const bust = `_=${Date.now()}`;
    const url = `${API_BASE}${endpoint}${endpoint.includes("?") ? "&" : "?"}${bust}`;

    console.log("[DEBUG tryFetch] API_BASE:", API_BASE);
    console.log("[DEBUG tryFetch] endpoint:", endpoint);
    console.log("[DEBUG tryFetch] Full URL:", url);
    console.log("[DEBUG tryFetch] Headers:", headers);

    let res = await fetch(url, { headers, credentials: "include", cache: "no-store" });
    console.log("[DEBUG tryFetch] Response status:", res.status);
    
    if (res.status === 401 && headers.Authorization) {
      console.log("[DEBUG tryFetch] Got 401, retrying without auth");
      const { Authorization, ...noAuth } = headers;
      res = await fetch(url, { headers: noAuth, credentials: "include", cache: "no-store" });
      console.log("[DEBUG tryFetch] Retry response status:", res.status);
    }
    if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
    const json = await res.json();
    console.log("[DEBUG tryFetch] Data received, items:", json?.length || Object.keys(json || {}).length);
    return extractItems(json);
  };

  const fetchData = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!silent) {
      setLoading(true);
      setError("");
      setItems([]);
      setLastEndpoint("");
    }
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
      if (silent) setError("");
    } catch (e: any) {
      if (!silent) {
        setError(e?.message || "Erro inesperado ao buscar processos");
        setItems([]);
      }
    } finally {
      if (!silent) setLoading(false);
      fetchInFlightRef.current = false;
    }
  };
  useEffect(() => {
    if (!authReady) return;
    fetchData();
  }, [authReady, token, perfil, currentUser?.id]);

  useEffect(() => {
    if (!authReady) return;
    const onFocus = () => fetchData({ silent: true });
    const onVisible = () => { if (document.visibilityState === "visible") fetchData({ silent: true }); };
    const onExtratoChanged = () => fetchData({ silent: true });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pjmol-extrato-created", onExtratoChanged);
    window.addEventListener("pjmol-extrato-updated", onExtratoChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pjmol-extrato-created", onExtratoChanged);
      window.removeEventListener("pjmol-extrato-updated", onExtratoChanged);
    };
  }, [authReady, token, perfil, currentUser?.id]);

  useEffect(() => {
    if (!authReady) return;
    const id = window.setInterval(() => {
      fetchData({ silent: true });
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [authReady, token, perfil, currentUser?.id]);

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
              method: "GET",
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
    setQ(""); setStatus(""); setAdm(""); setResultado(""); setFluxoFilter(""); setGerenteFilter(""); setAdvogadoFilter(""); setDateFrom(""); setDateTo(""); setOverdueSignatureOnly(false); setPage(1);
  };

  const applyOverdueSignatureFilter = (managerName?: string) => {
    setStatus("Enviado");
    setOverdueSignatureOnly(true);
    setGerenteFilter(managerName || "");
    setPage(1);
  };

  const handleDeleteProcesso = async (proc: Processo) => {
    const id = Number(proc?.id);
    if (!id) {
      alert("ID do processo inválido.");
      return;
    }
    const nome = proc?.nome_cliente ? ` do cliente ${proc.nome_cliente}` : "";
    
    // ⚠️ CONFIRMAÇÃO DUPLA ANTES DE EXCLUIR
    if (!confirm(`⚠️ ATENÇÃO! Tem certeza que deseja excluir o processo #${id}${nome}?\n\nEsta ação remove também anexos e dados relacionados.\n\n(Confirmação 1 de 2)`)) {
      return;
    }
    
    if (!confirm(`🚨 CONFIRMAÇÃO FINAL!\n\nÚltima chance! Confirma a EXCLUSÃO DEFINITIVA do processo #${id}${nome}?\n\nTodos os dados serão PERDIDOS PERMANENTEMENTE!\n\n(Confirmação 2 de 2)`)) {
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
      
      // Atualiza o estado local removendo o item
      setItems(prev => prev.filter(item => Number(item.id) !== id));
      
      // Recarrega a página após 500ms para garantir sincronização
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
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
      
      alert(`Processo ${isCurrentlySigned ? 'desmarcado' : 'marcado'} como Assinado (fora).`);
      
      // Recarrega a página após 300ms para mostrar as mudanças
      setTimeout(() => {
        window.location.reload();
      }, 300);
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

  const overdueSignatureSummary = useMemo(() => {
    const scoped = filterByScope(items, perfil as any, currentUser as any);
    const now = new Date();
    const grouped = new Map<string, { gerente: string; quantidade: number; maisAntigoDias: number; processos: Processo[] }>();

    scoped.forEach((item) => {
      if (!isAwaitingSignatureOverFiveDays(item, now)) return;
      const gerente = displayGerenteName(item) || (pickUidFromRow(item) ? `#${pickUidFromRow(item)}` : "Sem gerente");
      const dias = getDaysSince(getSentAtDate(item), now);
      const current = grouped.get(gerente) || { gerente, quantidade: 0, maisAntigoDias: 0, processos: [] };
      current.quantidade += 1;
      current.maisAntigoDias = Math.max(current.maisAntigoDias, dias);
      current.processos.push(item);
      grouped.set(gerente, current);
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
      if (b.maisAntigoDias !== a.maisAntigoDias) return b.maisAntigoDias - a.maisAntigoDias;
      return a.gerente.localeCompare(b.gerente);
    });
  }, [items, perfil, currentUser]);

  const overdueSignatureTotal = useMemo(
    () => overdueSignatureSummary.reduce((acc, item) => acc + item.quantidade, 0),
    [overdueSignatureSummary]
  );
  const awaitingSignatureTotal = useMemo(() => {
    const scoped = filterByScope(items, perfil as any, currentUser as any);
    return scoped.reduce((acc, item) => acc + (getDisplayStatus(item) === "Enviado" ? 1 : 0), 0);
  }, [items, perfil, currentUser]);
  const isAdminView = perfil === "admin";

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

      if (fluxoFilter) {
        const numeroProc = (it?.numero_processo ?? it?.numeroProcesso ?? it?.processo_numero ?? "").toString().trim();
        const haProcesso = numeroProc && numeroProc !== "None" && numeroProc !== "";
        const fluxoLabel = haProcesso ? "Concluído" : "Incompleto";
        if (fluxoLabel !== fluxoFilter) return false;
      }

      if (gerenteFilter) {
        const g = displayGerenteName(it) || "";
        if (g !== gerenteFilter) return false;
      }
      if (advogadoFilter) {
        const a = displayAdvogadoName(it) || "";
        if (a !== advogadoFilter) return false;
      }
      if (overdueSignatureOnly && !isAwaitingSignatureOverFiveDays(it)) return false;

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
  }, [items, q, status, adm, resultado, fluxoFilter, gerenteFilter, advogadoFilter, overdueSignatureOnly, dateFrom, dateTo, sortKey, sortAsc, perfil, currentUser, onlyLive]);

  const total = filtered.length;
  const visibleProcesses = filtered.slice(0, visibleItems);
  // Para compatibilidade com cards/mobile (não usado na tabela)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  // Infinite scroll handler - Desktop (tabela)
  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    if (!tableContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = tableContainer;
      
      // Se chegou perto do final (50px antes), carrega mais itens
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        setVisibleItems(total);
      }
    };

    tableContainer.addEventListener('scroll', handleScroll);
    return () => tableContainer.removeEventListener('scroll', handleScroll);
  }, [total]);

  // Infinite scroll handler - Mobile (window scroll)
  useEffect(() => {
    const handleWindowScroll = () => {
      // Detectar se está em mobile (md:hidden)
      const isMobile = window.innerWidth < 768;
      if (!isMobile) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      
      // Se chegou perto do final (200px antes), carrega mais itens
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        setVisibleItems(prev => {
          const newVal = total;
          return newVal;
        });
      }
    };

    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [total]);

  // Reset visible items when filter changes
  useEffect(() => {
    setVisibleItems(PAGE_SIZE);
  }, [q, status, adm, resultado, gerenteFilter, advogadoFilter, overdueSignatureOnly, dateFrom, dateTo, onlyLive]);

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
    const sumValorCausa = filtered.reduce((acc, i) => acc + num(i.valor_causa), 0);

    // 🆕 Acordo Provável = 70% do Valor da Causa
    const sumAcordoProvavel = sumValorCausa * 0.7;
    // 🆕 Expectativa de Honorários = 30% do Acordo Provável
    const sumExpectativaHonorarios = sumAcordoProvavel * 0.3;

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

    const sumComissaoGerente = filtered.reduce((acc, i) => {
      const v = calcComissaoGerente(i);
      return acc + (v !== null ? v : 0);
    }, 0);

    return { sumHoje, sumFuturo, sumValorCausa, sumAcordoProvavel, sumExpectativaHonorarios, hHojeAdv, hHojeEmp, hHojeTot, hFutAdv, hFutEmp, hFutTot, liqHojeSum, liqFutSum, sumComissaoGerente,
      hasHoje: filtered.some(i => i.valor_corrigido_hoje != null),
      hasFuturo: filtered.some(i => (i.valor_futuro ?? i.valor_corrigido_futuro) != null),
      hasValorCausa: filtered.some(i => i.valor_causa != null),
    };
  }, [filtered]);

  const exportCSV = () => {
    const header = [
      "ID","Cliente","Status","Resultado","Grupo","Cota","Administradora","Número do Processo","Valor da Causa","Aguardando",
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
        String(it.valor_causa ?? ""),
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
    
    // Recarrega a página após 1 segundo para atualizar os dados
    setTimeout(() => {
      window.location.reload();
    }, 1000);
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
              {/* Removido toggle Cards/Tabela - Desktop sempre usa tabela */}
              
              {perfil && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300">
                  {perfil}
                </span>
              )}
              {perfil === "admin" && (
                <Link href="/dashboard-relatorio/producao" className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-800 shadow-sm hover:bg-emerald-100" title="Relatório de produção">
                  <BarChart3 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Relatório Produção</span>
                </Link>
              )}
              {perfil === "admin" && (
                <Link href="/admin" className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2 py-1.5 text-xs font-medium text-blue-800 shadow-sm hover:bg-blue-100" title="Painel administrativo">
                  <span className="text-sm leading-none">Admin</span>
                </Link>
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
              {perfil === "admin" && (
                <Link href="/dashboard-relatorio/producao" className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 shadow-sm" title="Relatório de produção">
                  <BarChart3 className="h-3 w-3" />
                  <span>Produção</span>
                </Link>
              )}
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
          <select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs" value={fluxoFilter} onChange={(e)=>{setFluxoFilter(e.target.value); setPage(1);}}>
            <option value="">Fluxo</option>
            <option value="Concluído">Concluído</option>
            <option value="Incompleto">Incompleto</option>
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
          {perfil === "admin" ? (
            <Link href="/dashboard-relatorio/producao" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-slate-950 shadow-sm">
              <BarChart3 className="h-3.5 w-3.5"/> Produção
            </Link>
          ) : (
            <Link href="/dashboard-relatorio" className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-blue-500 px-2 py-1.5 text-xs font-medium text-white shadow-sm">
              <BarChart3 className="h-3.5 w-3.5"/> 📊
            </Link>
          )}
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
              <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={fluxoFilter} onChange={(e) => { setFluxoFilter(e.target.value); setPage(1); }}>
                <option value="">Fluxo</option>
                <option value="Concluído">Concluído</option>
                <option value="Incompleto">Incompleto</option>
              </select>
              <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="De" />
              <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="Até" />
            </div>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {overdueSignatureOnly && (
            <button
              type="button"
              onClick={() => { setOverdueSignatureOnly(false); setStatus(""); setGerenteFilter(""); setPage(1); }}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Remover filtro de assinatura
            </button>
          )}
        </div>
        <section className="mb-4 rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50 via-orange-50 to-white shadow-sm">
          {/* Header sempre visivel; expande corpo apenas quando ha mais de uma entrada */}
          <button
            type="button"
            onClick={() => setOverdueExpanded((v) => !v)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <div className="rounded-full bg-amber-100 p-1.5 text-amber-700">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold uppercase tracking-wide text-amber-950">
                Aguardando assinatura há mais de {OVERDUE_SIGNATURE_DAYS} dias
              </div>
            </div>
            {overdueSignatureSummary.length > 1 && (
              <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-sm font-extrabold text-amber-950">
                {overdueSignatureTotal}
              </div>
            )}
            {overdueSignatureSummary.length > 1 && (
              <div className="shrink-0 text-amber-700">
                {overdueExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            )}
          </button>

          {(overdueSignatureSummary.length <= 1 || overdueExpanded) && (
            <div className="border-t border-amber-200 p-4 pt-3">
              {overdueSignatureSummary.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-white px-4 py-4 text-sm font-medium text-slate-600">
                  Nenhum processo enviado há mais de {OVERDUE_SIGNATURE_DAYS} dias aguardando assinatura no momento.
                </div>
              ) : isAdminView ? (
                <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
                  <div className="divide-y divide-amber-100">
                    {overdueSignatureSummary.map((entry, index) => (
                      <button
                        key={entry.gerente}
                        type="button"
                        onClick={() => applyOverdueSignatureFilter(entry.gerente)}
                        className={cls(
                          "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-amber-50",
                          overdueSignatureOnly && gerenteFilter === entry.gerente ? "bg-amber-50" : "bg-white"
                        )}
                      >
                        <div className="w-12 shrink-0 text-xs font-bold uppercase tracking-wide text-amber-700">
                          #{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-slate-900">{entry.gerente}</div>
                          <div className="text-xs text-slate-600">
                            {entry.quantidade} aguardando assinatura • Mais antigo: {entry.maisAntigoDias} dias
                          </div>
                        </div>
                        <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1 text-lg font-extrabold text-amber-950 shadow-sm">
                          {entry.quantidade}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
                    Total aguardando assinatura no geral: <span className="font-extrabold">{awaitingSignatureTotal}</span> processo(s)
                  </div>
                </div>
              ) : (
                overdueSignatureSummary.map((entry) => (
                  <button
                    key={entry.gerente}
                    type="button"
                    onClick={() => applyOverdueSignatureFilter(entry.gerente)}
                    className={cls(
                      "w-full rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50",
                      overdueSignatureOnly ? "border-amber-400 ring-2 ring-amber-300" : "border-amber-200"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-900">{entry.gerente}</div>
                        <div className="text-xs text-slate-600">Você tem {entry.quantidade} aguardando assinatura • Mais antigo: {entry.maisAntigoDias} dias</div>
                      </div>
                      <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1 text-lg font-extrabold text-amber-950 shadow-sm">
                        {entry.quantidade}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </section>
        {/* Resumo compacto desktop */}
        <div className="hidden md:flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm mb-3">
          <div className="flex items-center gap-4 text-slate-700">
            <span><strong>{total}</strong> processo(s)</span>
            <span className="text-slate-500">•</span>
            <span className="text-purple-700 font-medium">
              {totals.hasValorCausa ? `Acordo Provável: ${fmtBRL(totals.sumAcordoProvavel)}` : "Acordo Provável: —"}
            </span>
            <span className="text-orange-700 font-medium">
              {totals.hasValorCausa ? `Expectativa Honorários: ${fmtBRL(totals.sumExpectativaHonorarios)}` : "Exp. Honorários: —"}
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-indigo-700 font-medium">
              {totals.hasValorCausa ? `Causas: ${fmtBRL(totals.sumValorCausa)}` : "Causas: —"}
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
            <Link
              href="/dashboard-relatorio"
              className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-600"
              title="Ver relatório completo"
            >
              <BarChart3 className="h-4 w-4" /> 
              <span className="hidden sm:inline">Relatório</span>
              <span className="sm:hidden">📊</span>
            </Link>
            <Link
              href="/ml-dashboard"
              className="hidden md:inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              title="Ver estatísticas do Machine Learning"
            >
              🤖 <span>ML Dashboard</span>
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

                {overdueSignatureOnly && (
                  <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                    Mostrando apenas processos com status Enviado aguardando assinatura há mais de {OVERDUE_SIGNATURE_DAYS} dias{gerenteFilter ? ` para ${gerenteFilter}` : ""}.
                  </div>
                )}
        <div className="md:hidden mb-3 flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 sm:px-4 py-3 text-xs sm:text-sm shadow-sm">
          <div className="text-slate-700 text-center">
            Resultados filtrados: <span className="font-semibold">{total}</span> processo(s)
          </div>
          <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            <span className="rounded-full border-2 border-purple-300 bg-purple-50 px-3 py-2 text-xs sm:text-sm font-bold text-purple-800">
              {totals.hasValorCausa ? `Acordo Provável: ${fmtBRL(totals.sumAcordoProvavel)}` : "Acordo Provável: —"}
            </span>
            <span className="rounded-full border-2 border-orange-300 bg-orange-50 px-3 py-2 text-xs sm:text-sm font-bold text-orange-800">
              {totals.hasValorCausa ? `Exp. Honorários: ${fmtBRL(totals.sumExpectativaHonorarios)}` : "Exp. Honorários: —"}
            </span>
            <span className="rounded-full border-2 border-blue-300 bg-blue-50 px-3 py-2 text-xs sm:text-sm font-bold text-blue-800">
              {totals.hasValorCausa ? `Causas: ${fmtBRL(totals.sumValorCausa)}` : "Causas: —"}
            </span>
          </div>
        </div>

        {/* ====== MOBILE: Cards ou Tabela ====== */}
        <section className="md:hidden space-y-2 pb-4">
          {loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-slate-500">Carregando processos…</div>
          )}
          {!loading && visibleProcesses.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-slate-500">Nenhum processo encontrado.</div>
          )}
          
          {/* Mobile sempre mostra cards */}
          {!loading && visibleProcesses.map((it)=> (
            <MobileProcessCard key={it.id} it={it} compact={false} onToggleSignedExternal={toggleSignedExternal} onDelete={deleteProcess} />
          ))}

          {/* Indicador de mais itens para carregar */}
          {!loading && visibleProcesses.length > 0 && visibleProcesses.length < total && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
              <div className="text-sm text-blue-700">
                Mostrando {visibleProcesses.length} de {total} processos
              </div>
              <div className="text-xs text-blue-600 mt-1">
                Role para carregar mais...
              </div>
            </div>
          )}
        </section>

        {/* ====== DESKTOP: Tabela ampla ou Cards ====== */}
        {isCompactTable ? (
          // Modo tabela compacta
          <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div 
              ref={tableContainerRef}
              className={`max-h-[70vh] overflow-auto transition-all ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} compact-table`}
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
                  <col className="w-[100px]" /> {/* PROCESSO */}
                  <col className="w-[90px]" /> {/* ANEXOS */}
                  <col className="w-[170px]" /> {/* ASS. MANUAL */}
                  <col className="w-[140px]" /> {/* STATUS */}
                  <col className="w-[110px]" /> {/* FLUXO */}
                  <col className="w-[50px]" /> {/* ID */}
                  <col className="w-[140px]" /> {/* RESULTADO */}
                  <col className="min-w-[180px]" /> {/* NÚMERO DO PROCESSO */}
                  <col className="min-w-[220px]" /> {/* CLIENTE */}
                  <col className="min-w-[200px]" /> {/* ADMINISTRADORA */}
                  <col className="w-[90px]" /> {/* GRUPO */}
                  <col className="w-[90px]" /> {/* COTA */}
                  <col className="w-[140px]" /> {/* VALOR DA CAUSA */}
                  <col className="w-[140px]" /> {/* ACORDO PROVÁVEL */}
                  <col className="w-[140px]" /> {/* EXP. HONORÁRIOS */}
                  <col className="w-[140px]" /> {/* VALOR HOJE */}
                  <col className="w-[140px]" /> {/* VALOR FUTURO */}
                  <col className="w-[170px]" /> {/* HONORÁRIOS HOJE */}
                  <col className="w-[180px]" /> {/* HONORÁRIOS FUTURO */}
                  <col className="w-[140px]" /> {/* LÍQUIDO HOJE */}
                  <col className="w-[150px]" /> {/* LÍQUIDO FUTURO */}
                  <col className="min-w-[180px]" /> {/* ADVOGADO */}
                  <col className="min-w-40" /> {/* GERENTE */}
                  <col className="w-[130px]" /> {/* CRIADO EM */}
                  <col className="w-[120px]" /> {/* AÇÕES */}
                </colgroup>
                <thead className="text-xs">
                  <tr className="bg-white sticky top-0 z-10 border-b text-slate-600">
                    {[
                      { key: "processo", label: "Processo", w: "w-[100px]", align: "text-center" },
                      { key: "anexos", label: "Anexos", w: "w-[90px]", align: "text-center" },
                      { key: "ass_manual", label: "Ass. Manual", w: "w-[170px]", align: "text-center" },
                      { key: "status", label: "Status", w: "w-[140px]", align: "text-center" },
                      { key: "fluxo", label: "Fluxo", w: "w-[110px]", align: "text-center" },
                      { key: "id", label: "ID", w: "w-[50px]", align: "text-center" },
                      { key: "_resultado", label: "Resultado", w: "w-[140px]", align: "text-center" },
                      { key: "numero_processo", label: "Número do Processo", w: "min-w-[180px]", align: "text-left" },
                      { key: "nome_cliente", label: "Cliente", w: "min-w-[220px]", align: "text-left" },
                      { key: "administradora", label: "Administradora", w: "min-w-[200px]", align: "text-left" },
                      { key: "grupo", label: "Grupo", w: "w-[90px]", align: "text-center" },
                      { key: "cota", label: "Cota", w: "w-[90px]", align: "text-center" },
                      { key: "valor_causa", label: "Valor da Causa", w: "w-[140px]", align: "text-right" },
                      { key: "acordo_provavel", label: "Acordo Provável", w: "w-[140px]", align: "text-right" },
                      { key: "expectativa_honorarios", label: "Exp. Honorários", w: "w-[140px]", align: "text-right" },
                      { key: "valor_corrigido_hoje", label: "Valor Hoje", w: "w-[140px]", align: "text-right" },
                      { key: "valor_futuro", label: "Valor Futuro", w: "w-[140px]", align: "text-right" },
                      { key: "honorarios_hoje_total", label: "Honorários Hoje", w: "w-[170px]", align: "text-right" },
                      { key: "honorarios_futuro_total", label: "Honorários Futuro", w: "w-[180px]", align: "text-right" },
                      { key: "liquido_hoje", label: "Líquido Hoje", w: "w-[140px]", align: "text-right" },
                      { key: "liquido_futuro", label: "Líquido Futuro", w: "w-[150px]", align: "text-right" },
                      { key: "advogado_nome", label: "Advogado", w: "min-w-[180px]", align: "text-left" },
                      { key: "comissao_gerente", label: "Comissão Gerente", w: "w-[160px]", align: "text-right" },
                      { key: "gerente_nome", label: "Gerente", w: "min-w-[160px]", align: "text-left" },
                      { key: "criado_em", label: "Criado em", w: "w-[130px]", align: "text-center" },
                      { key: "acoes", label: "Ações", w: "w-[120px]", align: "text-center" },
                    ].map((col) => (
                      <th key={col.key} className={cls(`px-2.5 ${isCompactTable ? 'py-1' : 'py-1.5'} font-semibold whitespace-nowrap`, col.w, col.align)}>
                        <button
                          onClick={() => !["acoes","anexos","_aguardando_adv","acordo_provavel","expectativa_honorarios","ass_manual","processo","fluxo"].includes(col.key) && onSort(col.key)}
                          className={cls("group inline-flex items-center gap-1 w-full", col.align === "text-center" ? "justify-center" : col.align === "text-right" ? "justify-end" : "justify-start", !["acoes","anexos","_aguardando_adv","acordo_provavel","expectativa_honorarios","ass_manual","processo","fluxo"].includes(col.key) && "hover:underline")}
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
                      <td colSpan={26} className="px-4 py-10 text-center text-slate-500">Carregando processos…</td>
                    </tr>
                  )}
                  {!loading && visibleProcesses.length === 0 && (
                    <tr>
                      <td colSpan={26} className="px-4 py-10 text-center text-slate-500">Nenhum processo encontrado.</td>
                    </tr>
                  )}
                  {!loading && visibleProcesses.map((it) => {
                    const docs = getDocsStatus(it);
                    const awaiting = docs.needs;
                    const resLabel = getResultadoLabel(it);
                    const statusLabel = getDisplayStatus(it);
                    const pillCls = resultadoPillClass(resLabel);
                    const numeroProc = (it.numero_processo ?? it.numeroProcesso ?? it.processo_numero ?? "").toString().trim();
                    const haProcesso = numeroProc && numeroProc !== "None" && numeroProc !== "";
                    // const timeline = computeProcessTimeline(it, new Date()); // ❌ REMOVIDO - usa fase_atual agora
                    const comarcaUF = displayComarcaUF(it); // 🔵 COMARCA/UF
                    const comarcaNome = displayComarcaNome(it);

                    return (
                      <tr
                        key={it.id}
                        className={cls(
                          "border-t border-slate-100 hover:bg-slate-50 transition-colors",
                          haProcesso ? "bg-white" : (awaiting ? "bg-amber-50/70 ring-1 ring-amber-300" : "odd:bg-white even:bg-slate-50/40")
                        )}
                        title={awaiting ? "Aguardando anexar comprovante de residência e identidade" : ""}
                      >
                        {/* Editar */}
                        <td className="px-2.5 py-1.5 text-center">
                          <Link
                            href={`/?extratoId=${it.id}&mode=adv&reload=${Date.now()}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                          >
                            EDITAR
                          </Link>
                        </td>

                        {/* Anexos */}
                        <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center">
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
                          </div>
                        </td>

                        {/* Ass. Manual */}
                        <td className="px-2.5 py-1.5 text-center">
                          <button
                            onClick={() => toggleSignedExternal(it)}
                            className={`inline-flex items-center gap-1 rounded text-[11px] font-medium text-white hover:opacity-90 whitespace-nowrap ${
                              getDisplayStatus(it) === 'Assinado (fora)' 
                                ? 'bg-slate-500 hover:bg-slate-600 px-3 py-1' 
                                : 'bg-blue-600 hover:bg-blue-700 px-2 py-1'
                            }`}
                            title={getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover marca de assinado fora' : 'Marcar como assinado fora'}
                          >
                            {getDisplayStatus(it) === 'Assinado (fora)' ? 'Remover Ass.' : 'Marcar Ass. Fora'}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="px-2.5 py-1.5 text-center">
                          <StatusColumn 
                            status={statusLabel}
                            timestamp={applyBrazilTimezoneForSent(getTimestampForStatus(it), statusLabel)}
                          />
                        </td>

                        {/* Fluxo */}
                        <td className="px-2.5 py-1.5 text-center">
                          {(() => {
                            const numeroProc = (it?.numero_processo ?? it?.numeroProcesso ?? it?.processo_numero ?? "").toString().trim();
                            const haProcesso = numeroProc && numeroProc !== "None" && numeroProc !== "";
                            
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                                haProcesso 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {haProcesso ? 'Concluído' : 'Incompleto'}
                              </span>
                            );
                          })()}
                        </td>

                        {/* ID */}
                        <td className="px-2.5 py-1.5 text-center font-medium text-slate-900 whitespace-nowrap">{it.id}</td>

                        {/* Resultado */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className={cls("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", pillCls)}>
                            {resLabel}
                          </span>
                        </td>

                        {/* Número do processo — negrito + COMARCA/UF abaixo */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{formatarNumeroProcesso(numeroProc) || "—"}</span>
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

                        {/* Cliente */}
                        <td className="px-2.5 py-1 text-left">
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

                        {/* Administradora */}
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-60" title={it.administradora || ""}>{it.administradora || "—"}</div>
                        </td>

                        {/* Grupo / Cota */}
                        <td className="px-2.5 py-1.5 text-center whitespace-nowrap">{it.grupo ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-center whitespace-nowrap">{it.cota ?? "—"}</td>

                        {/* Valor da Causa */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {it.valor_causa ? fmtBRL(it.valor_causa) : "—"}
                        </td>

                        {/* 🆕 Acordo Provável (70% do Valor da Causa) */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap bg-purple-50">
                          {it.valor_causa ? fmtBRL(it.valor_causa * 0.7) : "—"}
                        </td>

                        {/* 🆕 Expectativa de Honorários (30% do Acordo Provável) */}
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap bg-orange-50">
                          {it.valor_causa ? fmtBRL(it.valor_causa * 0.7 * 0.3) : "—"}
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

                        {/* Advogado / Comissão Gerente / Gerente */}
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-[200px]" title={displayAdvogadoName(it)}>
                            {displayAdvogadoName(it) || "—"}
                          </div>
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                          {(() => { const v = calcComissaoGerente(it); return v !== null ? fmtBRL(v) : "—"; })()}
                        </td>
                        <td className="px-2.5 py-1">
                          <div className="truncate max-w-[200px]" title={displayGerenteName(it) || (it.gerente_id ? `#${it.gerente_id}` : "")}>
                            {displayGerenteName(it) || (it.gerente_id ? `#${it.gerente_id}` : "—")}
                          </div>
                        </td>

                        {/* Criado em / Ações */}
                        <td className="px-2.5 py-1.5 whitespace-nowrap">{fmtDate(it.criado_em || it.data_exportacao)}</td>
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleDeleteProcesso(it)}
                            disabled={deletingId === it.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Excluir processo e anexos"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingId === it.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t text-sm">
                  <tr className="text-slate-700">
                    {/* Colunas 1-6: Processo, Anexos, Ass.Manual, Status, Fluxo, ID */}
                    <td className="px-2.5 py-1.5 font-semibold" colSpan={6}>Totais (filtro)</td>
                    {/* Coluna 7: Resultado (sem total) */}
                    <td className="px-2.5 py-1.5"></td>
                    {/* Coluna 8: Número do Processo (sem total) */}
                    <td className="px-2.5 py-1.5"></td>
                    {/* Colunas 9-12: Cliente, Administradora, Grupo, Cota (sem total) */}
                    <td className="px-2.5 py-1.5" colSpan={4}></td>
                    {/* Coluna 13: Valor da Causa */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">{totals.hasValorCausa ? fmtBRL(totals.sumValorCausa) : "—"}</td>
                    {/* Coluna 14: Acordo Provável */}
                    <td className="px-2.5 py-1.5 text-right font-semibold bg-purple-50">{totals.hasValorCausa ? fmtBRL(totals.sumAcordoProvavel) : "—"}</td>
                    {/* Coluna 15: Expectativa de Honorários */}
                    <td className="px-2.5 py-1.5 text-right font-semibold bg-orange-50">{totals.hasValorCausa ? fmtBRL(totals.sumExpectativaHonorarios) : "—"}</td>
                    {/* Coluna 16: Valor Hoje */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">{totals.hasHoje ? fmtBRL(totals.sumHoje) : "—"}</td>
                    {/* Coluna 17: Valor Futuro */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">{totals.hasFuturo ? fmtBRL(totals.sumFuturo) : "—"}</td>
                    {/* Coluna 18: Honorários Hoje */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">
                      <div className="flex flex-col items-end">
                        <div>{fmtBRL(totals.hHojeTot)}</div>
                        <div className="text-[11px] text-slate-500">{fmtBRL(totals.hHojeAdv)} (adv.) + {fmtBRL(totals.hHojeEmp)} (emp.)</div>
                      </div>
                    </td>
                    {/* Coluna 13: Honorários Futuro */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">
                      <div className="flex flex-col items-end">
                        <div>{fmtBRL(totals.hFutTot)}</div>
                        <div className="text-[11px] text-slate-500">{fmtBRL(totals.hFutAdv)} (adv.) + {fmtBRL(totals.hFutEmp)} (emp.)</div>
                      </div>
                    </td>
                    {/* Coluna 14: Líquido Hoje */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">{fmtBRL(totals.liqHojeSum)}</td>
                    {/* Coluna 15: Líquido Futuro */}
                    <td className="px-2.5 py-1.5 text-right font-semibold">{fmtBRL(totals.liqFutSum)}</td>
                    {/* Coluna 23: Advogado */}
                    <td></td>
                    {/* Coluna 24: Comissão Gerente */}
                    <td className="px-2.5 py-1.5 text-right font-semibold tabular-nums">{fmtBRL(totals.sumComissaoGerente)}</td>
                    {/* Colunas 25-27: Gerente, Criado em, Ações */}
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Indicador de infinite scroll */}
          <div className="flex items-center justify-center py-3 text-sm text-slate-500">
            <div>
              Mostrando {Math.min(visibleItems, total)} de {total} processo(s)
              {visibleItems < total && (
                <span className="ml-2 text-blue-600">• Role para ver mais</span>
              )}
            </div>
          </div>
        </div>
        ) : (
          // Modo cards (mantido inalterado)
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

    </div>
  );
}
