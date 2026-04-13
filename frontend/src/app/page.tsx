"use client";

import axios from "axios";
import ModalDocumentos from "@/app/components/ModalDocumentos";
import toast from "react-hot-toast";
import { formatarParaBR } from "@/utils/datas";
import { NumericFormat, PatternFormat } from "react-number-format";
import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";

// 🧠 Imports para sistema de aprendizado automático
import { useAprendizadoMensagens } from "@/hooks/useAprendizadoMensagens";
import { useAprendizadoCorrecao } from "@/hooks/useAprendizadoCorrecao";
import AprendizadoMensagens from "@/components/AprendizadoMensagens";
import { MLStatusIndicator } from "@/components/MLStatusIndicator";
import "@/styles/aprendizado.css";

const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");



// normaliza identificadores de usuário (email/username/nome)
function normalizeUser(v: any): string {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageContent />
    </Suspense>
  );
}
// === usuario-based role helpers ===
function readUsuario(): string | null {
  try {
    const k = ["usuario", "user", "username", "currentUser", "advogado", "login", "email", "emailUsuario", "nomeUsuario", "nome", "name"];
    const stores: any[] = [];
    try { if (typeof localStorage !== "undefined") stores.push(localStorage); } catch { }
    try { if (typeof sessionStorage !== "undefined") stores.push(sessionStorage); } catch { }
    for (const store of stores) {
      for (const key of k) {
        const v = store.getItem(key);
        if (v) {
          try {
            const obj = JSON.parse(v);
            if (obj && typeof obj === "object" && (obj.usuario || obj.username || obj.user || obj.email || obj.login || obj.nomeUsuario || obj.nome || obj.name)) {
              const found = obj.usuario || obj.username || obj.user || obj.email || obj.login || obj.nomeUsuario || obj.nome || obj.name;
              return String(found).trim().toLowerCase();
            }
          } catch { }
          return String(v).trim().toLowerCase();
        }
      }
    }
    if (typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^|; )usuario=([^;]+)/);
      if (m) return decodeURIComponent(m[1]).trim().toLowerCase();
    }
  } catch { }
  return null;
}
function parseUserList(envVal?: string): Set<string> {
  return new Set(String(envVal || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean));
}
const ADMIN_USERS = parseUserList(process.env.NEXT_PUBLIC_ADMIN_USERS as any);
const GERENTE_USERS = parseUserList(process.env.NEXT_PUBLIC_GERENTE_USERS as any);
// ✅ Lista canônica para garantir comportamento mesmo sem envs ou com perfil salvo errado
const HARDCODE_ADMINS = new Set([
  "leonardofmol@gmail.com",
  "henriquefmol@yahoo.com.br",
  "leonardo",
  "henrique",
  "leonardo de freitas mol",
  "leonardo freitas mol",
  "henrique de freitas mol",
  "henrique mol"
]);
const HARDCODE_GERENTES = new Set(["breno.gontijo@pjmol.com.br","marcel.lopes@pjmol.com.br","breno","marcel","breno gontijo barbosa","marcel lopes mol"]);

const CARD_BASE_CLASS = "rounded-3xl border border-slate-200/70 bg-white/95 shadow-sm backdrop-blur";
const CARD_PADDING_CLASS = "p-5 lg:p-6";
const CARD_STACK_CLASS = "space-y-5";
const INPUT_FOCUS_WRAPPER = "group flex flex-col gap-1";
const SECTION_TITLE_CLASS = "text-lg font-semibold text-slate-800";
const SECTION_SUBTITLE_CLASS = "text-sm font-medium text-slate-500";
const REQUIRED_LABEL_CLASS = "block text-sm font-medium text-slate-700 after:ml-1 after:align-super after:text-rose-500 after:content-['*']";

type Papel = "admin" | "gerente" | "usuario" | "advogado";

interface Advogado {
  id?: number;
  nome_completo: string;
  usuario: string;
  oab?: string;
  email?: string;
  telefone?: string;
  ativo?: boolean; // Campo para controlar se o advogado está ativo
}
function roleFromUsuario(u?: string | null): Papel {
  const user = normalizeUser(u || "");
  if (HARDCODE_ADMINS.has(user) || ADMIN_USERS.has(user) || user === "admin") return "admin";
  if (HARDCODE_GERENTES.has(user) || GERENTE_USERS.has(user) || user === "gerente") return "gerente";
  return "usuario";
}
// === end usuario-based role helpers ===
if (!(globalThis as any).__role) {
  (globalThis as any).__role = (() => {
    const normalize = (raw: any): string => {
      const p = String(raw || "")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim()
        .toLowerCase();
      if (["admin", "administrador", "adm", "super", "root"].includes(p)) return "admin";
      if (["gerente", "manager"].includes(p)) return "gerente";
      return p;
    };
    const readStorage = (keys: string[]): string | null => {
      const stores: any[] = [];
      try { if (typeof localStorage !== "undefined") stores.push(localStorage); } catch { }
      try { if (typeof sessionStorage !== "undefined") stores.push(sessionStorage); } catch { }
      for (const store of stores) {
        for (const k of keys) {
          const v = store.getItem(k);
          if (v) return v;
        }
        for (const k of ["user", "usuario", "currentUser"]) {
          const raw = store.getItem(k);
          if (!raw) continue;
          try { const obj = JSON.parse(raw); for (const kk of keys) if (obj && obj[kk]) return obj[kk]; } catch { }
        }
      }
      return null;
    };
    const readCookie = (keys: string[]): string | null => {
      try {
        const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
        for (const k of keys) {
          let m = cookie.match(new RegExp("(?:^|; )" + k + "=([^;]+)"));
        if (!m && (k === "usuario" || k === "email" || k === "emailUsuario")) m = cookie.match(/(?:^|; )(usuario|email|emailUsuario)=([^;]+)/);
          if (m) return decodeURIComponent(m[1]);
        }
      } catch { }
      return null;
    };
    const roleFromJwt = (): string | null => {
      try {
        const tok = readStorage(["token", "access_token", "accessToken", "jwt", "authToken", "Authorization"]) || "";
        if (!tok) return null;
        const jwt = tok.replace(/^Bearer\s+/i, "");
        const part = jwt.split(".")[1];
        if (!part) return null;
        const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
        return json.role || json.perfil || json.nivel || null;
      } catch { return null; }
    };
    const effectiveRole = (): string | null => {
      const raw = roleFromJwt()
        ?? readStorage(["perfil", "perfilUsuario", "role", "papel", "tipo", "nivel"])
        ?? readCookie(["perfil", "perfilUsuario", "role", "papel", "tipo", "nivel"]);
      return normalize(raw);
    };
    return { effectiveRole, normalize };
  })();
}
// === end role helpers ===
// @ts-ignore
if (typeof normalizeRole === "undefined") {
  // @ts-ignore
  var normalizeRole = function (raw: any): string {
    try {
      // @ts-ignore
      const g = (globalThis as any).__role;
      if (g && typeof g.normalize === "function") return g.normalize(raw);
    } catch { }
    const p = String(raw || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLowerCase();
    if (["admin", "administrador", "adm", "super", "root"].includes(p)) return "admin";
    if (["gerente", "manager"].includes(p)) return "gerente";
    return p;
  };
}

function pickFromCookies(keys: string[]): string | null {
  const cookie = typeof document !== "undefined" ? document.cookie || "" : "";
  for (const k of keys) {
    const m = cookie.match(new RegExp(`(?:^|; )${k}=([^;]+)`));
    if (m) {
      const v = decodeURIComponent(m[1]);
      return v.startsWith("Bearer ") ? v.replace(/^Bearer\s+/, "") : v;
    }
  }
  return null;
}

function getToken(): string | null {
  const keys = ["token", "access_token", "accessToken", "jwt", "authToken", "Authorization", "authorization"];
  const stores = [typeof localStorage !== "undefined" ? localStorage : null,
  typeof sessionStorage !== "undefined" ? sessionStorage : null].filter(Boolean) as Storage[];
  for (const store of stores) {
    for (const k of keys) {
      const raw = store.getItem(k);
      if (raw) return raw.startsWith("Bearer ") ? raw.replace(/^Bearer\s+/, "") : raw;
    }
  }
  return pickFromCookies(keys);
}

function getPerfil(): string | null {// 1) tenta storage/cookies, mas NÃO confia cegamente (pode ter ficado "gerente" de sessão anterior)
const keys = ["perfil", "perfilUsuario", "role", "papel", "tipo", "nivel"];
const stores = [typeof localStorage !== "undefined" ? localStorage : null,
typeof sessionStorage !== "undefined" ? sessionStorage : null].filter(Boolean) as Storage[];
let stored: string | null = null;
for (const store of stores) {
  for (const k of keys) {
    const v = store.getItem(k);
    if (v) { stored = normalizeRole(v); break; }
  }
  if (stored) break;
  for (const k of ["user", "usuario", "currentUser"]) {
    const raw = store.getItem(k);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        for (const kk of keys) if (obj && obj[kk]) { stored = normalizeRole(obj[kk]); break; }
      } catch {}
    }
    if (stored) break;
  }
}
if (!stored) {
  const cookieVal = pickFromCookies(keys);
  if (cookieVal) stored = normalizeRole(cookieVal);
}

// 2) resolve usuário textual (email/username) para checar whitelist fixa
const u = normalizeUser(readUsuario() || "");
const isAdminWL = u && (HARDCODE_ADMINS.has(u) || ADMIN_USERS.has(u));
const isGerenteWL = u && (HARDCODE_GERENTES.has(u) || GERENTE_USERS.has(u));

// 3) prioridade: Admin > Gerente > valor salvo
if (isAdminWL) return "admin";
if (isGerenteWL) return "gerente";
return stored ? normalizeRole(stored) : null;
}

const CargoPillInline = dynamic(() => import("@/components/CargoPillInline"), { ssr: false });

// 🧠 Funções utilitárias

function formatarComarca(comarca: string | undefined): string {
  if (!comarca) return "";
  return comarca.replace(/^COMARCA DE\s+/i, "").trim();
}

function limparComarcaTexto(comarca: string | undefined | null): string {
  if (!comarca) return "";
  return String(comarca).replace(/^COMARCA DE\s+/i, "").trim();
}

// Nova função: formata comarca para o padrão CIDADE - ESTADO
function aplicarMascaraComarca(texto: string): string {
  if (!texto) return "";
  
  // Remove "COMARCA DE" se existir
  let limpo = texto.replace(/^COMARCA DE\s+/i, "").trim().toUpperCase();
  
  // Se já tem o formato CIDADE - UF, retorna como está
  if (/^[A-Z\s]+ - [A-Z]{2}$/.test(limpo)) {
    return limpo;
  }
  
  // Se tem hífen mas sem espaços corretos, ajusta
  if (limpo.includes("-")) {
    const partes = limpo.split("-").map(p => p.trim());
    if (partes.length === 2 && partes[1].length === 2) {
      return `${partes[0]} - ${partes[1]}`;
    }
  }
  
  // Retorna o texto como está (usuário ainda digitando)
  return limpo;
}

function normalizarComarcaParaComparacao(comarca: string | undefined | null): string {
  return limparComarcaTexto(comarca)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toUpperCase();
}

function comarcasCorrespondem(a?: string | null, b?: string | null): boolean {
  const normA = normalizarComarcaParaComparacao(a);
  const normB = normalizarComarcaParaComparacao(b);
  if (!normA || !normB) return false;
  return normA === normB || normA.includes(normB) || normB.includes(normA);
}

function normalizarData(data: string): string {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-");
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

function getCorComarcaPeloTexto(comarca: string | undefined, selecionada: boolean, existeSelecao: boolean = false): string {
  const risco = classificarRiscoPelaComarca(comarca);
  const apagar = existeSelecao && !selecionada; // quando há uma selecionada, a outra fica "cinza claro"

  const base = ["border", "p-2", "rounded", "cursor-pointer", "transition", "duration-150", "ease-in-out", "select-none"];

  if (apagar) {
    return [
      ...base,
      "bg-gray-100",
      "border-gray-300",
      "text-gray-600",
    ].join(" ");
  }

  return [
    ...base,
    risco === "bom" && "bg-green-100 border-green-400",
    risco === "ruim" && "bg-red-100 border-red-400",
    risco === "neutro" && "border-gray-300",
    selecionada && "ring-2 ring-blue-500",
  ].filter(Boolean).join(" ");
}

function classificarRiscoPelaComarca(comarca: string | undefined): "bom" | "ruim" | "neutro" {
  if (!comarca) return "neutro";
  const texto = comarca.toUpperCase();
  if (texto.includes("RJ") || texto.includes("MATO GROSSO") || texto.includes("MT")) {
    return "ruim";
  }
  return "bom";
}

function aplicarMascara(campo: string, valor: string): string {
  const numeros = valor.replace(/\D/g, "");

  switch (campo) {
    case "cpf":
      return numeros
        .slice(0, 11)
        .replace(/(\d{3})(\d{0,3})(\d{0,3})(\d{0,2})/, (_, a, b, c, d) =>
          [a, b, c].filter(Boolean).join(".") + (d ? `-${d}` : "")
        );

    case "cnpj":
      return numeros
        .slice(0, 14)
        .replace(/(\d{2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2})/, (_, a, b, c, d, e) =>
          `${a}.${b}.${c}/${d}-${e}`.replace(/[-/.]+$/, "")
        );

    case "cpf_cnpj":
      return numeros.length <= 11
        ? aplicarMascara("cpf", numeros)
        : aplicarMascara("cnpj", numeros);

    case "cep":
      return numeros
        .slice(0, 8)
        .replace(/(\d{5})(\d{0,3})/, (_, a, b) => (b ? `${a}-${b}` : a));

    case "telefone":
      return numeros
        .slice(0, 11)
        .replace(/^(\d{2})(\d{0,5})(\d{0,4})/, (_, a, b, c) =>
          `(${a}) ${b}${c ? `-${c}` : ""}`
        );

    default:
      return valor;
  }
}

// ✅ CORREÇÃO: Função única e robusta para converter datas para o formato AAAA-MM-DD
function converterParaInputDate(input: any): string {
  if (!input) return "";

  // Se já for AAAA-MM-DD, retorna diretamente
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  // Tenta converter de outros formatos
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    // Se a conversão automática falhar, tenta o formato DD/MM/AAAA
    if (typeof input === 'string' && input.includes('/')) {
      const parts = input.split('/');
      if (parts.length === 3) {
        const [dia, mes, ano] = parts;
        if (dia && mes && ano && ano.length === 4) {
          // Recria a data de forma segura para evitar problemas de fuso horário
          const d2 = new Date(`${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T12:00:00Z`);
          if (!isNaN(d2.getTime())) {
            const z = (n: number) => String(n).padStart(2, "0");
            return `${d2.getFullYear()}-${z(d2.getMonth() + 1)}-${z(d2.getDate())}`;
          }
        }
      }
    }
    return ""; // Retorna vazio se tudo falhar
  }

  // Se a conversão automática funcionar
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}


interface Advogado {
  id: number;
  nome_completo: string;
  usuario: string;
  oab: string;
}

function PageContent() {
  // === Handler: Baixar anexos/assinaturas/extratos (.zip) ===
// === Handler: Baixar anexos/assinaturas/extratos (.zip) ===
// === Handler: Baixar anexos/assinaturas/extratos (.zip) ===
const handleBaixarArquivosExtrato = async () => {
  const toastId = typeof window !== "undefined" ? (toast?.loading?.("Gerando ZIP…") as any) : null;

  try {
    // 1) extratoId (usa search params, dataset e fallback)
    const usp = new URLSearchParams(window.location.search);
    const pathId = window.location.pathname
      .split("/")
      .filter(Boolean)
      .reverse()
      .find((segment) => /^\d+$/.test(segment)) || "";
    const extratoId =
      usp.get("extratoId") ||
      usp.get("extrato_id") ||
      usp.get("id") ||
      (window as any).__EXTRATO_ID__ ||
      document?.body?.dataset?.extratoId ||
      pathId ||
      "";

    if (!extratoId) {
      if (toastId) toast.dismiss(toastId);
      console.warn("[ZIP] Extrato não identificado; cancelando geração do arquivo.");
      return;
    }

    // 2) base do backend
    const API_BASE =
      (process.env.NEXT_PUBLIC_BACKEND_URL as string) ||
      (process.env.NEXT_PUBLIC_API_BASE as string) ||
      (process.env.NEXT_PUBLIC_API as string) ||
      "http://127.0.0.1:8000";

    // 3) headers (mantém compat com backend)
    const headers: HeadersInit = { Accept: "application/zip,application/octet-stream" };
    try {
      const perfil = (typeof getPerfil === "function" ? getPerfil() : null) || "";
      const mode = (new URLSearchParams(window.location.search).get("mode") || "").toLowerCase();
      if (perfil === "advogado" || mode === "adv") (headers as any)["X-Perfil"] = "advogado";

      const uid =
        new URLSearchParams(window.location.search).get("usuarioId") ||
        localStorage.getItem("usuarioId") ||
        sessionStorage.getItem("usuarioId") || "";
      if (uid) (headers as any)["X-Usuario-Id"] = uid;
    } catch {}

    // 4) chama SOMENTE o endpoint canônico
    const url = `${API_BASE.replace(/\/+$/, "")}/extratos/${encodeURIComponent(
      String(extratoId)
    )}/download-zip?folders=anexos,assinaturas,extratos`;

    const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`(${res.status}) ${txt || "Falha ao gerar ZIP"}`);
    }

    // 5) baixa blob e nomeia arquivo
    const blob = await res.blob();

    // tenta aproveitar o nome sugerido pelo backend
    let filename = "";
    const disp = res.headers.get("Content-Disposition") || "";
    const m = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (m) filename = decodeURIComponent(m[1]);

    if (!filename) {
      // fallback local
      const nomeCliente =
        (typeof dadosBasicos !== "undefined" && (dadosBasicos as any)?.nome_cliente) || "extrato";
      filename = `anexos_${String(nomeCliente).replace(/[^\p{L}\p{N}_-]+/gu, "_")}_${extratoId}.zip`;
    }

    const urlBlob = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = urlBlob;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(urlBlob);

    if (toastId) toast.dismiss(toastId);
    toast?.success?.("ZIP gerado com sucesso!");
  } catch (e: any) {
    if (toastId) toast.dismiss(toastId);
    toast?.error?.(`Erro ao gerar ZIP: ${e?.message || e}`);
  }
};



  const search = useSearchParams();
  const sp = useMemo(() => Object.fromEntries(search.entries()), [search]);
  const isAdv = String(sp?.mode || "").toLowerCase() === "adv";
  const hasExtratoId = Boolean((sp as any)?.extratoId || (sp as any)?.extrato_id || (sp as any)?.id);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [dataExtenso, setDataExtenso] = useState<string>("");
  useEffect(() => {
    try {
      const d = new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
      setDataExtenso(d);
    } catch { }
  }, []);


  const [isAdvMode, setIsAdvMode] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsAdvMode((params.get("mode") || "").toLowerCase() == "adv");
    }
  }, []);
  const [ehAdvogado, setEhAdvogado] = useState(false);
  const [papel, setPapel] = useState<Papel>("usuario");
  
  useEffect(() => {
    try {
      const p = getPerfil();
      const roleNorm = normalizeRole(p);
      const isAdv_ = roleNorm === "advogado" || roleNorm === "gerente" || roleNorm === "admin" || isAdvMode;
      setEhAdvogado(isAdv_);
      setPapel(p as Papel);
    } catch {
      setEhAdvogado(isAdvMode);
      setPapel((isAdvMode ? "advogado" : "usuario") as Papel);
    }
  }, [isAdvMode]);

  // Mantém sempre o padrão "valor pago"
useEffect(() => { setValorSelecionado("valor_pago_extrato"); }, [ehAdvogado]);
const [usuario, setUsuario] = useState<string | null>(null);
  useEffect(() => {
    const u = readUsuario();
    setUsuario(u);
  }, []);
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  // snapshot do banco p/ campos que não podem perder valor
const [dbSnapshot, setDbSnapshot] = useState<{
  advogado_nome?: string;
  advogado_oab?: string;
  advogado_email?: string;
  advogado_telefone?: string;
  comarca_escolhida_nome?: string;
  comarca_escolhida_uf?: string;
  endereco?: {
    rua?: string | null;
    numero?: string | null;
    bairro?: string | null;
    complemento?: string | null;
    cidade?: string | null;
    estado?: string | null;
    cep?: string | null;
  };
}>({});
  const [etapa, setEtapa] = useState("upload");
  const [listaAdvogados, setListaAdvogados] = useState<Advogado[]>([]);

  // ✅ CORREÇÃO: Hook movido para o corpo do componente
  useEffect(() => {
    async function buscarAdvogados() {
      try {
        const res = await axios.get(`${API_BASE}/advogados/`);
        setListaAdvogados(res.data);
      } catch (error) {
        console.error("Erro ao buscar advogados:", error);
      }
    }
    buscarAdvogados();
  }, []);

  useEffect(() => {
    const perfil = localStorage.getItem("perfilUsuario");

    if (perfil === "advogado") {
      const nome = localStorage.getItem("nomeAdvogado") || "";
      const oab = localStorage.getItem("oabAdvogado") || "";
      const email = localStorage.getItem("emailAdvogado") || "";

      setDadosManuais((prev) => ({
        ...prev,
        nome_advogado: nome,
        oab_advogado: oab,
        email_advogado: email,
      }));
    }
  }, []);

  useEffect(() => {
    const perfil = localStorage.getItem("perfilUsuario");
    if (!perfil) {
      router.push("/login");
    } else {
      setCarregando(false);
    }
  }, []);

  const formatarReais = (valor: number | string | undefined): string => {
    const numero = Number(valor);
    if (isNaN(numero)) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numero);
  };

  function camposObrigatoriosFaltando(
    dadosBasicos: any,
    dadosManuais: any,
    parcelas: any[]
  ): string[] {
    const faltando: string[] = [];

    const nome = dadosBasicos.nome_cliente?.trim();
    const cpf = dadosBasicos.cpf_cnpj?.replace(/\D/g, "");
    const telefoneNumeros = (dadosManuais.telefone || "").replace(/\D/g, "");
    const honorarios = dadosManuais.honorarios_percentual;
    const comarca = dadosManuais.comarca_escolhida?.trim();
    const dataEncerramento = dadosBasicos.data_encerramento;

    if (!nome) faltando.push("Nome");
    if (!cpf || cpf.length < 11) faltando.push("CPF/CNPJ");
    if (!dataEncerramento) faltando.push("Data de Encerramento");
    if (!telefoneNumeros || telefoneNumeros.length < 10 || telefoneNumeros.length > 11) {
      faltando.push("Telefone");
    }
    if (!honorarios || Number(honorarios) <= 0) faltando.push("Honorários");
    if (!comarca) faltando.push("Comarca");

    const somaParcelas = parcelas.reduce((acc, p) => acc + Number(p.valor_pago || 0), 0);
    const total = Number(dadosBasicos.valor_total_pago_extrato || 0);
    if (Math.abs(total - somaParcelas) > 0.01) {
      faltando.push("Soma das parcelas não confere com o valor do extrato");
    }

    return [...new Set(faltando)];
  }

  function verificarCamposObrigatoriosDOM(): string[] {
    const camposObrigatorios = document.querySelectorAll("[data-obrigatorio]");
    const camposIncompletos: string[] = [];

    camposObrigatorios.forEach((campo) => {
      const input = campo as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const nomeCampo = input.closest("div")?.querySelector("label")?.innerText || "Campo obrigatório";

      const valor = (input.value || "").trim();
      const tipo = input.getAttribute("type");
      const minimo = input.getAttribute("minlength");

      if (
        !valor ||
        (tipo === "number" && Number(valor) <= 0) ||
        (minimo && valor.length < parseInt(minimo))
      ) {
        camposIncompletos.push(nomeCampo.replace("*", "").trim());
      }
    });

    return [...new Set(camposIncompletos)];
  }


  const [dadosAdvogado, setDadosAdvogado] = useState<{ nome_completo?: string }>({});

  useEffect(() => {
    const nomeElement = document.querySelector("strong.text-gray-900");
    if (nomeElement) {
      const nome = nomeElement.textContent?.trim() || "";
      const usuario = nome.split(" ")[0].toLowerCase();

      localStorage.setItem("nomeAdvogado", nome);
      localStorage.setItem("usuarioAdvogado", usuario);

      console.log("✅ Advogado identificado:", nome, "→", usuario);
    } else {
      console.warn("⚠️ Elemento com o nome do advogado não encontrado.");
    }
  }, []);

  const [documentosGerados, setDocumentosGerados] = useState<{
    contrato_pdf: string;
    procuracao_pdf: string;
    nome_cliente: string;
    telefone_cliente: string;
    usuario_advogado: string;
    payloadEnvio?: any;
  } | null>(null);

  useEffect(() => {
    const advogadoId = localStorage.getItem("advogadoId");
    if (!advogadoId) return;

    axios.get(`${API_BASE}/advogados/${advogadoId}`)
      .then((res) => {
        setDadosAdvogado(res.data);
        setDadosManuais((prev) => ({
          ...prev,
          advogado: res.data.nome_completo,
        }));
      })
      .catch((err) => {
        console.error("Erro ao buscar dados do advogado:", err);
      });
  }, []);

  const [parcelas, setParcelas] = useState<{
    data_pagamento: string;
    valor_pago: number;
    tipo?: string;
    valor_corrigido_hoje?: number;
    valor_corrigido_futuro?: number;
    taxa_adm_parcela?: number;
  }[]>([]);

  const [filtro, setFiltro] = useState("");
  const [novaParcela, setNovaParcela] = useState({ data_pagamento: "", valor_pago: "", tipo: "parcela" });
  const [resultadoJurosHoje, setResultadoJurosHoje] = useState<number | null>(null);
  const [resultadoJurosFuturo, setResultadoJurosFuturo] = useState<number | null>(null);
  const [resultadoTaxaAdmDevidaValor, setResultadoTaxaAdmDevidaValor] = useState<number | null>(null);
  const [resultadoTaxaAdmDevidaPercentual, setResultadoTaxaAdmDevidaPercentual] = useState<number | null>(null);
  const [precisaCalcular, setPrecisaCalcular] = useState(false);
  const [indiceAteHoje, setIndiceAteHoje] = useState("TJMG");
  const [indiceFuturo, setIndiceFuturo] = useState("IPCA");

const [dadosManuais, setDadosManuais] = useState({
    telefone: "",
    advogado: "",
    nacionalidade: "",
    numero_processo: "",
    usuario_advogado: "",
    honorarios_percentual: "",
    fase_processo: "",
    magistrado: "",
    valor_corrigido: "",
    valor_corrigido_futuro: "",
    data_inicio_juros: "",
    taxa_juros_percentual: "",
    houve_sentenca: false,
    data_sentenca: "",
    valor_outros_custos: "0",
    taxa_administracao_deduzida: "0",
    justica_gratuita: false,
    renda_mensal: 0,
    comprovante_renda: null,
    comprovante_endereco: null,
    documento_identidade: null,
    observacoes: "",
    tipo_justica: "juizado especial",
    ganho_sucumbencia: "",
    perda_sucumbencia: "",
    comarca_escolhida: "",
    indice_corrigido_hoje: indiceAteHoje,
    indice_corrigido_futuro: indiceFuturo,
});
const [comarcaSelecionada, setComarcaSelecionada] = useState<"cliente" | "administradora" | null>(null);
const [dadosBasicos, setDadosBasicos] = useState({
  grupo: "",
  cota: "",
  nome_cliente: "",
  cpf_cnpj: "",
  tipo_documento: "",
  taxa_adm_percentual: 0,
  total_parcelas_plano: 0,
  data_encerramento: "",
  data_primeira_assembleia: "",
  valor_total_pago_extrato: 0,
  valor_credito: 0,
  administradora: "",
  cep: "",
  cidade: "",
  estado: "",
  rua: "",
  numero: "",
  bairro: "",
  complemento: "",
  nacionalidade: "",
  comarca_cliente: "",
  comarca_administradora: "",
  taxa_adm_cobrada_valor: 0,
  percentual_taxa_adm_cobrada: 0,
  valor_taxa_adm_cobrada: 0,
  fundo_comum: 0,
  fundo_reserva: 0,
  seguros: 0,
  multas: 0,
  juros: 0,
  adesao: 0,
  outros_valores: 0,
  cnpj_administradora: "",
  numero_contrato: "",
});

// 🧠 Hooks para sistema de aprendizado automático
const { mensagens: mensagensAprendizado, adicionarMensagem: adicionarMensagemAprendizado, removerMensagem: removerMensagemAprendizado } = useAprendizadoMensagens();
const { registrarValorOriginal, detectarCorrecao, aplicarCorrecoesAutomaticas, limparValoresOriginais } = useAprendizadoCorrecao({
  administradora: dadosBasicos?.administradora || "",
  onMensagemAprendizado: adicionarMensagemAprendizado
});

// 🧠 Função para capturar correções do usuário
const handleCampoChange = (campo: string, novoValor: string) => {
  // Atualiza o estado
  setDadosBasicos(prev => ({ ...prev, [campo]: novoValor }));
  
  // Detecta se houve correção e aprende
  detectarCorrecao(campo, novoValor, {
    grupo: dadosBasicos.grupo,
    cota: dadosBasicos.cota,
    administradora: dadosBasicos.administradora
  });
};

  // ✅ Seleciona automaticamente o card da comarca ao hidratar do backend/URL
  useEffect(() => {
    try {
      const origemManual = (dadosManuais as any)?.comarca_escolhida;
      const origemSnapshot = dbSnapshot?.comarca_escolhida_nome;
      const candidata = origemManual || origemSnapshot || "";
      const cliente = (dadosBasicos as any)?.comarca_cliente;
      const administradora = (dadosBasicos as any)?.comarca_administradora;

      let destino: typeof comarcaSelecionada = null;
      if (comarcasCorrespondem(candidata, cliente)) {
        destino = "cliente";
      } else if (comarcasCorrespondem(candidata, administradora)) {
        destino = "administradora";
      }

      setComarcaSelecionada(prev => (prev === destino ? prev : destino));
    } catch (e) {
      console.warn("auto select comarca failed:", e);
    }
  }, [
    (dadosManuais as any)?.comarca_escolhida,
    (dadosBasicos as any)?.comarca_cliente,
    (dadosBasicos as any)?.comarca_administradora,
    dbSnapshot?.comarca_escolhida_nome,
  ]);




  const getCorComarca = (origem: "cliente" | "administradora") => {
    const risco = classificarRiscoEstado(dadosBasicos.estado);
    const selecionada = comarcaSelecionada === origem;

    return [
      "border p-2 rounded cursor-pointer transition duration-150 ease-in-out",
      risco === "bom" && "bg-green-100 border-green-400",
      risco === "ruim" && "bg-red-100 border-red-400",
      risco === "neutro" && "border-gray-300",
      selecionada && "ring-2 ring-blue-500"
    ].filter(Boolean).join(" ");
  };

  const classificarRiscoEstado = (estado: string): "bom" | "ruim" | "neutro" => {
    const estadosBons = ["MG", "SP", "PR"];
    const estadosRuins = ["RJ", "AM", "PA"];

    if (estadosBons.includes(estado)) return "bom";
    if (estadosRuins.includes(estado)) return "ruim";
    return "neutro";
  };

  const handleEnviarDocumentos = async () => {
    try {
      toast.loading("Enviando para assinatura...");

      const response = await axios.post(`${API_BASE}/gerar_documentos`, {
        contrato_pdf: documentosGerados?.contrato_pdf,
        procuracao_pdf: documentosGerados?.procuracao_pdf,
      });

      toast.dismiss();
      toast.success("📨 Documento enviado para assinatura!");

      console.log("Resposta ZapSign:", response.data);
    } catch (error) {
      toast.dismiss();
      toast.error("Erro ao enviar para o ZapSign.");
      console.error("Erro no envio:", error);
    }
  };

  const handleUploadContrato = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("arquivo", file);

    try {
      const response = await fetch(`${API_BASE}/extrair-contato-contrato`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Erro ao extrair dados do contrato");
      }

      const data = await response.json();
      if (data.telefone) {
        setTelefoneCliente(data.telefone);
        setTelefoneHabilitado(true);
      }
      if (data.email) {
        setEmailCliente(data.email);
        setEmailClienteHabilitado(true);
      }
    } catch (err) {
      console.error(err);
      alert("Não foi possível extrair telefone ou e-mail do contrato.");
    }
  };
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [telefoneHabilitado, setTelefoneHabilitado] = useState(false);
  const [emailClienteHabilitado, setEmailClienteHabilitado] = useState(false);
  const [emailInvalido, setEmailInvalido] = useState(false);
  const [telefoneInvalido, setTelefoneInvalido] = useState(false);
  const [houveAcordo, setHouveAcordo] = useState(false);
  const [valorAcordo, setValorAcordo] = useState("");
  const [houveSentenca, setHouveSentenca] = useState(false);
  const [tipoSentenca, setTipoSentenca] = useState("");
  const [valorSentenca, setValorSentenca] = useState("");
  const [custasProcessuais, setCustasProcessuais] = useState<
    { id: string; data: string; valor: number; descricao?: string }[]
  >([]);
  const [valoresCalculados, setValoresCalculados] = useState(false);
  const [valorSelecionado, setValorSelecionado] = useState<string>("valor_pago_extrato");
  const [advogados, setAdvogados] = useState<any[]>([]);
  const [advogadoSelecionado, setAdvogadoSelecionado] = useState<string>("");

  useEffect(() => {
    const usuarioLogado = JSON.parse(localStorage.getItem("usuarioLogado") || "{}");

    if (usuarioLogado.tipo === "advogado") {
      setAdvogados([
        {
          nome_completo: usuarioLogado.nome,
          usuario: usuarioLogado.usuario,
          oab: usuarioLogado.oab,
        },
      ]);
      setAdvogadoSelecionado(usuarioLogado.usuario);
      localStorage.setItem(
        "advogadoSelecionado",
        JSON.stringify({
          nome_completo: usuarioLogado.nome,
          usuario: usuarioLogado.usuario,
          oab: usuarioLogado.oab,
        })
      );
    } else {
      axios.get(`${API_BASE}/advogados`)
        .then((response) => {
          const data = response.data;
          // Garante que sempre seja um array
          if (Array.isArray(data)) {
            setAdvogados(data);
          } else if (data && typeof data === 'object') {
            // Se for um objeto, tenta extrair array dele
            setAdvogados(Array.isArray(data.advogados) ? data.advogados : []);
          } else {
            setAdvogados([]);
          }
        })
        .catch((error) => {
          console.error("Erro ao carregar advogados:", error);
          setAdvogados([]); // Garante que seja array mesmo em erro
        });
    }
  }, []);




  const [mostrarModal, setMostrarModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const extratoId = params.get("extratoId") || params.get("extrato_id");
    if (!extratoId) return;

    const API = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

    (async () => {
      try {
        const headers: Record<string, string> = {};
        const modeParam =
          ((sp as any)?.get?.("mode") ||
            (typeof window !== "undefined"
              ? new URLSearchParams(window.location.search || "").get("mode")
              : "") ||
            "")
            .toString()
            .toLowerCase();
        const perfilEfetivo = (() => {
          try {
            return normalizeRole(getPerfil() || (isAdvMode ? "advogado" : ""));
          } catch {
            return "";
          }
        })();
        const resolveUsuarioId = () => {
          let uid = "";
          try {
            uid =
              (sp as any)?.get?.("usuarioId") ||
              (sp as any)?.get?.("usuario_id") ||
              (sp as any)?.get?.("uid") ||
              "";
          } catch {}
          if (!uid && typeof window !== "undefined") {
            const up = new URLSearchParams(window.location.search || "");
            uid = up.get("usuarioId") || up.get("usuario_id") || up.get("uid") || "";
            if (!uid) {
              try {
                uid =
                  localStorage.getItem("usuarioId") ||
                  sessionStorage.getItem("usuarioId") ||
                  "";
              } catch {}
            }
          }
          return uid;
        };
        const uidHeader = resolveUsuarioId();
        if (perfilEfetivo === "admin" || perfilEfetivo === "gerente") {
          headers["X-Perfil"] = perfilEfetivo;
        } else if (perfilEfetivo === "advogado" || isAdvMode || modeParam === "adv") {
          headers["X-Perfil"] = "advogado";
        } else if (uidHeader) {
          headers["X-Usuario-Id"] = uidHeader;
        }
        
        // Fallback: Se mode=adv ou isAdvMode, sempre tentar como advogado
        if ((modeParam === "adv" || isAdvMode) && !headers["X-Perfil"]) {
          headers["X-Perfil"] = "advogado";
        }
        const reqInit: RequestInit = {
          cache: "no-store",
          headers,
        };
        let data: any = null;
        try {
          const res = await fetch(`${API}/extratos/${encodeURIComponent(extratoId)}`, reqInit);
          if (res.ok) data = await res.json();
        } catch { }
        if (!data) {
          const alt = await fetch(`${API}/extratos?id=${encodeURIComponent(extratoId)}`, reqInit);
          if (alt.ok) {
            const j = await alt.json();
            data = Array.isArray(j) ? j[0] : j;
          }
        }
        // Fallback final: tentar como admin se todas as outras tentativas falharam
        if (!data) {
          try {
            const adminHeaders = { ...headers, "X-Perfil": "admin" };
            const adminReqInit = { ...reqInit, headers: adminHeaders };
            const adminRes = await fetch(`${API}/extratos/${encodeURIComponent(extratoId)}`, adminReqInit);
            if (adminRes.ok) data = await adminRes.json();
          } catch { }
        }
        if (!data) return;
        // Snapshot do banco para campos sensíveis
        try {
          const nomeParsed = (() => {
  const raw = String(data?.advogado || "").trim();
  if (!raw) return (data?.advogado_nome || "");
  const parts = raw.split(/\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*/i);
  return (parts[0] || raw).trim();
})();
setDbSnapshot({
  advogado_nome: data?.advogado_nome || nomeParsed || undefined,
  advogado_oab: data?.advogado_oab || undefined,
  advogado_email: data?.advogado_email || undefined,
  advogado_telefone: data?.advogado_telefone || undefined,
  comarca_escolhida_nome: data?.comarca_escolhida_nome || data?.comarca_escolhida || data?.comarca || undefined,
  comarca_escolhida_uf: data?.comarca_escolhida_uf || data?.estado || undefined,
  endereco: data?.extras?.endereco_snapshot || {
    rua: data?.rua,
    numero: data?.numero,
    bairro: data?.bairro,
    complemento: data?.complemento,
    cidade: data?.cidade,
    estado: data?.estado,
    cep: data?.cep,
  },
});
        } catch {}


        const brl = (v: any) => {
          if (v == null) return 0;
          if (typeof v === "number") return v;
          const s = String(v).replace(/\./g, "").replace(",", ".");
          const n = Number(s.replace(/[^\d.-]/g, ""));
          return Number.isFinite(n) ? n : 0;
        };
        const pct = (v: any) => {
          if (v == null) return 0;
          if (typeof v === "number") return v;
          const s = String(v).replace("%", "").replace(",", ".");
          const n = Number(s);
          return Number.isFinite(n) ? n : 0;
        };
        const maskCpfCnpj = (v: any) => {
          const s = String(v || "").replace(/\D/g, "");
          if (s.length <= 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
          return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
        };

        const lista = Array.isArray(data.parcelas) ? data.parcelas : [];
        const parcelasNormalizadas = lista.map((p: any) => ({
          data_pagamento: p.data_pagamento || p.data || "",
          valor_pago: brl(p.valor_pago ?? p.valor ?? 0),
          tipo: p.tipo || "parcela",
          valor_corrigido_hoje: brl(p.corrigido_hoje ?? p.valor_corrigido_hoje ?? 0),
          valor_corrigido_futuro: brl(p.corrigido_futuro ?? p.valor_corrigido_futuro ?? 0),
        }));
        // Sempre setar parcelas, mesmo que seja array vazio, para garantir que dados anteriores sejam limpos
        setParcelas(parcelasNormalizadas);

        setDadosBasicos((prev) => ({
          ...prev,
          grupo: data.grupo ?? prev.grupo,
          cota: data.cota ?? prev.cota,
          nome_cliente: data.nome_cliente ?? prev.nome_cliente,
          cpf_cnpj: data.cpf_cnpj ? maskCpfCnpj(data.cpf_cnpj) : prev.cpf_cnpj,
          tipo_documento: data.tipo_documento ?? prev.tipo_documento,
          taxa_adm_percentual: pct(data.taxa_adm_percentual ?? data.taxa_adm_contratada_percentual ?? data.taxa_adm_contratada ?? prev.taxa_adm_percentual),
          total_parcelas_plano: Number(data.total_parcelas_plano ?? prev.total_parcelas_plano ?? 0),
          data_encerramento: converterParaInputDate(data.data_encerramento) ?? prev.data_encerramento,
          data_primeira_assembleia: converterParaInputDate(data.data_primeira_assembleia) ?? prev.data_primeira_assembleia,
          valor_total_pago_extrato: brl(data.valor_pago_extrato ?? data.valor_total_pago_extrato ?? prev.valor_total_pago_extrato),
          valor_credito: brl(data.valor_credito ?? prev.valor_credito),
          administradora: data.administradora ?? prev.administradora,
          cep: data.cep ?? data?.extras?.endereco_snapshot?.cep ?? prev.cep,
          cidade: data.cidade ?? data?.extras?.endereco_snapshot?.cidade ?? prev.cidade,
          estado: data.estado ?? data?.extras?.endereco_snapshot?.estado ?? prev.estado,
          rua: data.rua ?? data?.extras?.endereco_snapshot?.rua ?? prev.rua,
          numero: data.numero ?? data?.extras?.endereco_snapshot?.numero ?? prev.numero,
          bairro: data.bairro ?? data?.extras?.endereco_snapshot?.bairro ?? prev.bairro,
          complemento: data.complemento ?? data?.extras?.endereco_snapshot?.complemento ?? prev.complemento,
          nacionalidade: data.nacionalidade ?? prev.nacionalidade,
          comarca_cliente: data.comarca_cliente ?? data.comarca_cliente_nome ?? data.comarca ?? prev.comarca_cliente,
          comarca_administradora:
            data.comarca_administradora ??
            (data as any).comarca_adm ??
            (data as any).comarca_administradora_nome ??
            prev.comarca_administradora,
          percentual_taxa_adm_cobrada: pct(data.percentual_taxa_adm_cobrada ?? data.percentual_cobrada_calculado ?? prev.percentual_taxa_adm_cobrada),
          taxa_adm_cobrada_valor: brl(data.valor_total_taxa_cobrada ?? data.valor_total_taxa_adm_cobrada ?? data.taxa_adm_cobrada_valor ?? prev.taxa_adm_cobrada_valor),
          fundo_comum: brl(data.fundo_comum ?? prev.fundo_comum),
          fundo_reserva: brl(data.fundo_reserva ?? prev.fundo_reserva),
          seguros: brl(data.seguros ?? prev.seguros),
          multas: brl(data.multas ?? prev.multas),
          juros: brl(data.juros ?? prev.juros),
          adesao: brl(data.adesao ?? prev.adesao),
          outros_valores: brl(data.outros_valores ?? prev.outros_valores),
          cnpj_administradora: data.cnpj_administradora ?? prev.cnpj_administradora,
          numero_contrato: data.numero_contrato ?? data.n_contrato ?? prev.numero_contrato,
        }));


setDadosManuais((prev) => {
          const fase = (data as any).resultado_processo ?? (data as any).fase_processo ?? prev.fase_processo;
          const comarcaEscolhidaData =
            (data as any).comarca_escolhida_nome ??
            (data as any).comarca_escolhida ??
            (data as any).comarca ??
            prev.comarca_escolhida;
          return {
            ...prev,
            telefone: (data as any).telefone ?? (data as any).telefone_cliente ?? prev.telefone,
            advogado: (data as any).advogado ?? prev.advogado,
            nacionalidade: (data as any).nacionalidade ?? prev.nacionalidade,
            numero_processo: (data as any).numero_processo ?? prev.numero_processo,
            usuario_advogado: (data as any).usuario_advogado ?? prev.usuario_advogado,
            honorarios_percentual: String(pct(((data as any).honorarios_percentual ?? prev.honorarios_percentual ?? 0))),
            fase_processo: fase,
            magistrado: (data as any).magistrado ?? prev.magistrado,
            observacoes: (data as any).observacoes ?? prev.observacoes,
            valor_corrigido: prev.valor_corrigido,
            valor_corrigido_futuro: ((String((fase||"")).toLowerCase()==="perdemos" || houveAcordo || (houveSentenca && tipoSentenca==="avista")) ? "0" : String(brl(((data as any).valor_corrigido_futuro ?? (data as any).valor_corrigido_futuro ?? 0)))),
            data_inicio_juros: converterParaInputDate((data as any).inicio_juros) ?? prev.data_inicio_juros,
            taxa_juros_percentual: String(pct(((data as any).taxa_juros_percentual ?? prev.taxa_juros_percentual ?? 0))),
            houve_sentenca: Boolean((data as any).houve_sentenca ?? prev.houve_sentenca ?? false),
            data_sentenca: converterParaInputDate((data as any).data_sentenca) ?? prev.data_sentenca,
            valor_outros_custos: String(brl(((data as any).valor_outros_custos ?? prev.valor_outros_custos ?? 0))),
            taxa_administracao_deduzida: String(brl(((((data as any)['taxa_' + 'ad' + 'min' + 'istracao_deduzida']) ?? ((prev as any)['taxa_' + 'ad' + 'min' + 'istracao_deduzida']) ?? 0)))),
            justica_gratuita: Boolean((data as any).justica_gratuita ?? prev.justica_gratuita ?? false),
            renda_mensal: brl(((data as any).renda_mensal ?? prev.renda_mensal ?? 0)),
            indice_corrigido_hoje: prev.indice_corrigido_hoje || "TJMG",
            indice_corrigido_futuro: prev.indice_corrigido_futuro || "IPCA",
            comarca_escolhida: limparComarcaTexto(comarcaEscolhidaData),
          };
        });

        // Sincroniza controles específicos
        try {
          const fase = (data as any).resultado_processo ?? (data as any).fase_processo;
          const tp = ((data as any).tipo_pagamento || "").toString();
          if (fase === "Acordo") {
            setHouveAcordo(true);
            setHouveSentenca(false);
            const vA = brl((data as any).valor_acordo);
            if (typeof vA === "number") setValorAcordo(String(vA));
          } else if (fase === "Ganhamos") {
            setHouveSentenca(true);
            setHouveAcordo(false);
            if (tp === "À Vista") {
              setTipoSentenca("avista");
              const vS = brl((data as any).valor_sentenca);
              if (typeof vS === "number") setValorSentenca(String(vS));
            } else if (tp === "Futuro") {
              setTipoSentenca("futuro");
            }
          }
        } catch {}


        try { setEtapa("analise"); } catch { }

        (window as any).__EXTRATO_ID__ = String(extratoId);
        if (document?.body) (document.body as any).dataset.extratoId = String(extratoId);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      "input[data-obrigatorio], select[data-obrigatorio], textarea[data-obrigatorio]"
    );

    inputs.forEach((el) => {
      const valor = (el.value || "").trim();
      const tipo = el.getAttribute("type");
      const minimo = el.getAttribute("minlength");

      const invalido =
        !valor ||
        (tipo === "number" && Number(valor) <= 0) ||
        (minimo && valor.length < Number(minimo));

      el.dataset.requiredState = invalido ? "empty" : "filled";
    });
  }, [dadosBasicos, dadosManuais, parcelas]);

  // Estado para controle de retry limitado
  const [comarcaManualAtiva] = useState(true); // Sempre permite edição manual
  const [isSearchingComarca, setIsSearchingComarca] = useState(false);
  const [lastCepSearched, setLastCepSearched] = useState("");
  const cepTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset do lastCepSearched quando CEP muda significativamente ou é limpo
  useEffect(() => {
    const cepLimpo = dadosBasicos.cep?.replace(/\D/g, "");
    
    // Se CEP foi limpo ou mudou drasticamente, reset o controle
    if (!cepLimpo || (lastCepSearched && cepLimpo.length < 6)) {
      setLastCepSearched("");
    }
  }, [dadosBasicos.cep, lastCepSearched]);

  useEffect(() => {
    // Limpa timeout anterior se existir
    if (cepTimeoutRef.current) {
      clearTimeout(cepTimeoutRef.current);
    }

    const cepLimpo = dadosBasicos.cep?.replace(/\D/g, "");
    const cnpjLimpo = dadosBasicos.cpf_cnpj?.replace(/\D/g, "");
    
    // Validações básicas
    if (!cepLimpo || cepLimpo.length !== 8) {
      return;
    }
    
    if (isSearchingComarca) {
      return;
    }
    
    // Se o CEP for diferente do último pesquisado, permite nova busca
    if (cepLimpo === lastCepSearched) {
      return;
    }
    
    // Debounce de 1 segundo para evitar múltiplas requisições
    cepTimeoutRef.current = setTimeout(() => {
      console.log('� Iniciando busca de comarca para CEP:', cepLimpo);
      setIsSearchingComarca(true);
      setLastCepSearched(cepLimpo);
      
      // Busca comarca independente do modo
      fetch(`${API_BASE}/comarca-por-cep/${cepLimpo}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.comarca) {
            console.log('✅ Comarca encontrada:', data.comarca);
            setDadosBasicos((prev) => ({
              ...prev,
              comarca_cliente: data.comarca.replace(/^COMARCA DE\s*/i, ""),
            }));
          } else {
            console.log('⚠️ Comarca não encontrada para este CEP');
          }
        })
        .catch((error) => {
          console.warn("❌ Erro ao buscar comarca por CEP:", error);
        })
        .finally(() => {
          setIsSearchingComarca(false);
        });
    }, 1000);

    // Cleanup function
    return () => {
      if (cepTimeoutRef.current) {
        clearTimeout(cepTimeoutRef.current);
      }
    };
  }, [dadosBasicos.cep, isSearchingComarca, lastCepSearched]);

  useEffect(() => {
    const nome = dadosBasicos.administradora?.trim();
    const cnpjVazio = !dadosBasicos.cnpj_administradora;

    if (nome && cnpjVazio) {
      // Em mode=adv: busca CNPJ do banco
      if (isAdvMode) {
        console.log('� Mode ADV: Buscando CNPJ da administradora no banco...');
        fetch(`${API_BASE}/cnpj-por-administradora`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome_administradora: nome }),
        })
          .then((res) => res.json())
          .then((data) => {
            const cnpj = data?.cnpj?.replace(/\D/g, "");
            if (cnpj?.length === 14) {
              const formatado = aplicarMascara("cnpj", cnpj);
              console.log('✅ CNPJ do banco:', formatado);
              setDadosBasicos((prev) => ({
                ...prev,
                cnpj_administradora: formatado,
              }));
            } else {
              console.log('⚠️ CNPJ não encontrado no banco para esta administradora');
            }
          })
          .catch((err) => {
            console.warn("⚠️ Erro ao buscar CNPJ da administradora:", err);
          });
      } else {
        // Mode normal: comportamento original
        fetch(`${API_BASE}/cnpj-por-administradora`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome_administradora: nome }),
        })
          .then((res) => res.json())
          .then((data) => {
            const cnpj = data?.cnpj?.replace(/\D/g, "");
            if (cnpj?.length === 14) {
              const formatado = aplicarMascara("cnpj", cnpj);
              setDadosBasicos((prev) => ({
                ...prev,
                cnpj_administradora: formatado,
              }));
            }
          })
          .catch((err) => {
            console.warn("⚠️ Erro ao buscar CNPJ da administradora:", err);
          });
      }
    }
  }, [dadosBasicos.administradora, isAdvMode]);

  // Busca administradora e comarca pelo CNPJ (com 3 tentativas)
  useEffect(() => {
    const cnpj = dadosBasicos.cnpj_administradora?.replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      if (cnpj && cnpj.length > 0) {
        console.log(`⏳ CNPJ incompleto: ${cnpj} (${cnpj.length}/14 dígitos)`);
      }
      return;
    }

    console.log('🔍 CNPJ completo detectado:', cnpj);
    
    let tentativasRestantes = 3;
    let tentouBuscar = false;
    
    // Função de busca com até 3 tentativas
    const buscarDadosAdministradora = async (tentativa: number) => {
      if (tentouBuscar) return; // Evita múltiplas execuções simultâneas
      
      console.log(`🔄 Tentativa ${tentativa}/3: Buscando dados da administradora...`);
      tentouBuscar = true;
      
      try {
        const res = await fetch(`${API_BASE}/administradora-por-cnpj/${cnpj}`);
        const data = await res.json();
        
        console.log('📦 Resposta da API:', JSON.stringify(data, null, 2));
        
        const updates: any = {};
        
        // Preenche administradora se encontrada
        if (data.administradora) {
          console.log('✅ Nome administradora encontrado:', data.administradora);
          updates.administradora = data.administradora;
        }
        
        // Verifica comarca - SEMPRE tenta buscar se não temos comarca_administradora
        if (data.comarca) {
          console.log('✅ Comarca da administradora encontrada:', data.comarca);
          updates.comarca_administradora = data.comarca.replace(/^COMARCA DE\s*/i, "");
        } else if (data.comarca === null) {
          console.log('⚠️ Administradora encontrada mas sem comarca no banco');
          
          // Se não encontrou comarca e ainda tem tentativas, tenta novamente
          if (tentativa < 3) {
            console.log(`⏳ Aguardando 2s para tentar novamente...`);
            setTimeout(() => {
              tentouBuscar = false;
              buscarDadosAdministradora(tentativa + 1);
            }, 2000);
            return;
          }
        }
        
        // Atualiza estado se encontrou algo
        if (Object.keys(updates).length > 0) {
          setDadosBasicos((prev) => ({
            ...prev,
            ...updates,
          }));
          console.log('✅ Dados da administradora atualizados:', updates);
        } else if (tentativa >= 3) {
          console.warn('⚠️ Não foi possível obter comarca da administradora após 3 tentativas');
        }
        
      } catch (err) {
        console.error(`❌ Erro na tentativa ${tentativa}:`, err);
        
        // Se deu erro e ainda tem tentativas, tenta novamente
        if (tentativa < 3) {
          console.log(`⏳ Aguardando 2s para tentar novamente...`);
          setTimeout(() => {
            tentouBuscar = false;
            buscarDadosAdministradora(tentativa + 1);
          }, 2000);
        }
      }
    };
    
    // Debounce de 500ms antes da primeira tentativa
    const timer = setTimeout(() => {
      buscarDadosAdministradora(1);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [dadosBasicos.cnpj_administradora, isAdvMode]);


  useEffect(() => {
    if (etapa === "analise") {
      setPrecisaCalcular(true);
    }
  }, [JSON.stringify(dadosManuais), JSON.stringify(dadosBasicos)]);

  useEffect(() => {
    if (!precisaCalcular || etapa !== "analise") return;

    const timeout = setTimeout(() => {
      try {
        calcularValores();
        setPrecisaCalcular(false);
      } catch (erro) {
        console.error("❌ Erro ao calcular automaticamente:", erro);
      }
    }, 600);
    return () => clearTimeout(timeout);
  }, [precisaCalcular, etapa]);

  useEffect(() => {
    if (etapa === "analise") {
      setPrecisaCalcular(true);
    }
  }, [JSON.stringify(parcelas)]);

  useEffect(() => {
    const perfil = localStorage.getItem("perfil");
    const nomeAdvogado = localStorage.getItem("nomeAdvogado") || "";
    const oabAdvogado = localStorage.getItem("oabAdvogado") || "";

    if (perfil === "advogado") {
      setDadosManuais((prev) => ({
        ...prev,
        advogado: nomeAdvogado,
        advogado_oab: oabAdvogado,
      }));
    }
  }, []);

  useEffect(() => {
    // Aplica máscaras apenas se os valores mudaram realmente
    const cpfCnpjFormatted = aplicarMascara("cpf_cnpj", dadosBasicos.cpf_cnpj || "");
    const cepFormatted = aplicarMascara("cep", dadosBasicos.cep || "");
    
    if (dadosBasicos.cpf_cnpj !== cpfCnpjFormatted || dadosBasicos.cep !== cepFormatted) {
      setDadosBasicos((prev) => ({
        ...prev,
        cpf_cnpj: cpfCnpjFormatted,
        cep: cepFormatted,
      }));
    }
  }, []);

  useEffect(() => {
    // Aplica máscara de telefone apenas se necessário
    const telefoneFormatted = aplicarMascara("telefone", dadosManuais.telefone || "");
    if (dadosManuais.telefone !== telefoneFormatted) {
      setDadosManuais((prev) => ({
        ...prev,
        telefone: telefoneFormatted,
      }));
    }
  }, []);

  useEffect(() => {
    const deveZerarCustas =
      dadosManuais.tipo_justica !== "Justiça Comum" || dadosManuais.justica_gratuita;

    if (deveZerarCustas && custasProcessuais.length > 0) {
      setCustasProcessuais([]);
    }
  }, [dadosManuais.tipo_justica, dadosManuais.justica_gratuita]);

  useEffect(() => {
    const perfil = localStorage.getItem("perfil");
    const nomeAdvogado = localStorage.getItem("nomeAdvogado") ?? "";
    const oabAdvogado = localStorage.getItem("oabAdvogado") ?? "";

    if (perfil === "advogado") {
      setDadosManuais((prev) => ({
        ...prev,
        advogado: nomeAdvogado,
        advogado_oab: oabAdvogado,
      }));
    }
  }, []);

  useEffect(() => {
    // 🚫 Não busca endereço automaticamente em mode=adv
    if (isAdvMode) {
      console.log('🔒 Mode ADV: Busca de endereço por CEP desabilitada');
      return;
    }

    const cepLimpo = dadosBasicos.cep?.replace(/\D/g, "");
    if (cepLimpo?.length === 8) {
      // Debounce: só busca se for um CEP diferente do último pesquisado
      const lastSearchedCep = sessionStorage.getItem('lastSearchedCep');
      if (lastSearchedCep === cepLimpo) {
        return; // Evita buscar o mesmo CEP novamente
      }
      
      sessionStorage.setItem('lastSearchedCep', cepLimpo);
      console.log('🌐 Buscando endereço para CEP:', cepLimpo);
      
      setDadosBasicos((prev) => ({
        ...prev,
        rua: "",
        bairro: "",
        cidade: "",
        estado: "",
        comarca_cliente: "",
      }));

      fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.erro) {
            setDadosBasicos((prev) => ({
              ...prev,
              rua: data.logradouro || "",
              bairro: data.bairro || "",
              cidade: data.localidade || "",
              estado: data.uf || "",
            }));
            
            // Busca comarca apenas se não foi buscada recentemente
            const lastComarcaSearch = sessionStorage.getItem('lastComarcaSearch');
            const currentTime = Date.now();
            if (!lastComarcaSearch || (currentTime - parseInt(lastComarcaSearch)) > 30000) { // 30 segundos
              sessionStorage.setItem('lastComarcaSearch', currentTime.toString());
              fetch(`${API_BASE}/comarca-por-cep/${cepLimpo}`)
                .then((res) => res.json())
                .then((comarcaData) => {
                  if (comarcaData.comarca) {
                    setDadosBasicos((prev) => ({
                      ...prev,
                      comarca_cliente: comarcaData.comarca,
                    }));
                  }
                })
                .catch(() => console.warn("❌ Erro ao buscar comarca por CEP"));
            }
          }
        })
        .catch(() => {
          setDadosBasicos((prev) => ({
            ...prev,
            rua: "",
            bairro: "",
            cidade: "",
            estado: "",
            comarca_cliente: "",
          }));
          console.warn("❌ Erro ao buscar endereço pelo CEP");
        });
    } else {
      // Limpa cache se CEP for inválido
      sessionStorage.removeItem('lastSearchedCep');
    }
  }, [dadosBasicos.cep, isAdvMode]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    // Timeout de 5 minutos para processamento de PDF complexos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos

    try {
      const response = await fetch(`${API_BASE}/extrair`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const resultado = await response.json();
      const dadosConvertidos = { ...resultado.dados_basicos };

      [
        "fundo_comum",
        "fundo_reserva",
        "seguros",
        "multas",
        "juros",
        "adesao",
        "outros_valores",
        "taxa_adm_cobrada_valor",
        "percentual_taxa_adm_cobrada",
        "valor_taxa_adm_cobrada",
      ].forEach((campo) => {
        dadosConvertidos[campo] = Number(dadosConvertidos[campo] || 0);
      });

      setDadosBasicos((prev) => ({
        ...prev,
        ...dadosConvertidos,
      }));

      setParcelas(resultado.parcelas);
      setEtapa("analise");
      setTimeout(() => {
        if (etapa === "analise") {
          try {
            calcularValores();
          } catch (erro) {
            console.error("❌ Erro ao calcular após extrair:", erro);
          }
        }
      }, 300);
    } catch (erro) {
      clearTimeout(timeoutId);
      if (erro instanceof Error && erro.name === 'AbortError') {
        console.error("❌ Timeout ao processar PDF (5 minutos excedidos)");
        alert("⏱️ O processamento do PDF demorou muito. Tente com um arquivo menor ou mais simples.");
      } else {
        console.error("❌ Erro ao processar PDF:", erro);
        alert("❌ Erro ao processar o PDF. Verifique o console para detalhes.");
      }
    }
  };

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [links, setLinks] = useState<{ pdf?: string; json?: string; excel?: string }>({});
  
  // 👁️ Estado para controlar visualização do PDF durante preenchimento
  const [mostrarPdfViewer, setMostrarPdfViewer] = useState(false);
  const [pdfUrlViewer, setPdfUrlViewer] = useState<string | null>(null);

  // 👁️ Cria URL do PDF para visualização quando arquivo é selecionado
  useEffect(() => {
    if (arquivo) {
      const url = URL.createObjectURL(arquivo);
      setPdfUrlViewer(url);
      return () => URL.revokeObjectURL(url); // Limpa quando componente desmonta ou arquivo muda
    } else {
      setPdfUrlViewer(null);
    }
  }, [arquivo]);

  const enviarPDF = async () => {
    if (!arquivo) return;

    setEtapa("upload");
    setLinks({});
    setMensagem("⏳ Processando PDF...");
    setParcelas([]);

    setDadosBasicos({
      grupo: "",
      cota: "",
      nome_cliente: "",
      cpf_cnpj: "",
      tipo_documento: "",
      taxa_adm_percentual: 0,
      total_parcelas_plano: 0,
      data_encerramento: "",
      data_primeira_assembleia: "",
      valor_total_pago_extrato: 0,
      valor_credito: 0,
      administradora: "",
      cep: "",
      cidade: "",
      estado: "",
      rua: "",
      numero: "",
      bairro: "",
      complemento: "",
      nacionalidade: "",
      comarca_cliente: "",
      comarca_administradora: "",
      taxa_adm_cobrada_valor: 0,
      percentual_taxa_adm_cobrada: 0,
      valor_taxa_adm_cobrada: 0,
      fundo_comum: 0,
      fundo_reserva: 0,
      seguros: 0,
      multas: 0,
      juros: 0,
      adesao: 0,
      outros_valores: 0,
      cnpj_administradora: '',
      numero_contrato: "",
    });

    setDadosManuais({
      telefone: "",
      advogado: "",
      nacionalidade: "",
      numero_processo: "",
      usuario_advogado: "",
      honorarios_percentual: "",
      fase_processo: "",
      magistrado: "",
      valor_corrigido: "",
      valor_corrigido_futuro: "",
      data_inicio_juros: "",
      taxa_juros_percentual: "",
      houve_sentenca: false,
      data_sentenca: "",
      valor_outros_custos: "0",
      taxa_administracao_deduzida: "0",
      justica_gratuita: false,
      renda_mensal: 0,
      comprovante_renda: null,
      comprovante_endereco: null,
      documento_identidade: null,
      observacoes: "",
      tipo_justica: "juizado especial",
      ganho_sucumbencia: "",
      perda_sucumbencia: "",
      comarca_escolhida: "",
      indice_corrigido_hoje: indiceAteHoje,
      indice_corrigido_futuro: indiceFuturo,
    });

    const formData = new FormData();
    formData.append("file", arquivo);

    // Timeout de 5 minutos para processamento de PDF complexos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos
    console.log("🚀 Enviando PDF com timeout de 5 minutos...");

    try {
      const resposta = await fetch(`${API_BASE}/extrair`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const resultado = await resposta.json();
      console.log("🔍 Resultado do backend:", resultado);

      if (resposta.ok) {
        setMensagem("✅ PDF processado!");
        const parcelasComTipo = (resultado.parcelas || []).map((p: any) => ({ ...p, tipo: "parcela" }));
        setParcelas(parcelasComTipo);
        
        // 🧠 Processa mensagens de aprendizado automático
        if (resultado.mensagens_aprendizado && Array.isArray(resultado.mensagens_aprendizado)) {
          resultado.mensagens_aprendizado.forEach((mensagem: string) => {
            adicionarMensagemAprendizado(mensagem);
          });
        }
        
        // Aplica dados básicos e registra valores originais para detecção de correções
        const novosBasicos = {
          ...resultado.dados_basicos,
          cpf_cnpj: aplicarMascara("cpf_cnpj", resultado.dados_basicos?.cpf_cnpj || ""),
          cep: aplicarMascara("cep", resultado.dados_basicos?.cep || ""),
        };
        
        setDadosBasicos((prev) => ({
          ...prev,
          ...novosBasicos,
        }));
        
        // 🧠 Registra valores originais para detectar correções futuras
        Object.entries(novosBasicos).forEach(([campo, valor]) => {
          if (valor && typeof valor === 'string') {
            registrarValorOriginal(campo, valor);
          }
        });
        
        setEtapa("analise");
        setResultadoJurosHoje(null);
        setResultadoJurosFuturo(null);
      } else {
        setMensagem("❌ Erro: " + resultado.detail);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        console.error("❌ Timeout ao processar PDF (5 minutos excedidos)");
        setMensagem("⏱️ O processamento do PDF demorou muito. Tente com um arquivo menor ou mais simples.");
      } else {
        console.error(e);
        setMensagem("❌ Falha ao conectar com o backend.");
      }
    }
  };

  const calcularValores = async () => {
    setMensagem("⏳ Calculando valores...");
    try {
      const resposta = await fetch(`${API_BASE}/calcular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcelas,
          dados_basicos: dadosBasicos,
          dados_manuais: dadosManuais,
        }),
      });

      const resultado = await resposta.json();
      console.log("Resposta do backend /calcular:", resultado);


      if (!resposta.ok) {
        const erroDetalhado = resultado.detail || JSON.stringify(resultado);
        setMensagem("❌ Erro no cálculo: " + erroDetalhado);
        return;
      }

      if (resultado.parcelas_corrigidas) {
        setMensagem("✅ Valores calculados!");

        const zeraFuturo = houveAcordo || (houveSentenca && tipoSentenca === "avista") || dadosManuais.fase_processo === "Perdemos";
        const zeraTudo = dadosManuais.fase_processo === "Perdemos" || houveAcordo || (houveSentenca && tipoSentenca === "avista");
        const parcelasAtualizadas = parcelas.map((p, i) => {
          const corrigidoHoje = resultado.parcelas_corrigidas[i]?.valor_corrigido_hoje || 0;
          const corrigidoFuturo = resultado.parcelas_corrigidas[i]?.valor_corrigido_futuro || 0;
          return {
            ...p,
            valor_corrigido_hoje: zeraTudo ? 0 : corrigidoHoje,
            valor_corrigido_futuro: zeraTudo ? 0 : (zeraFuturo ? 0 : corrigidoFuturo),
          };
        });
setParcelas(parcelasAtualizadas);

        const valorHoje = (zeraTudo ? "0" : (resultado.valor_corrigido_hoje_liquido?.toString() || ""));
        const valorFuturo = (zeraTudo ? "0" : (resultado.valor_corrigido_futuro_liquido?.toString() || ""));

        const taxaAdm = resultado.taxa_administracao_deduzida?.toString() || "0";

        setDadosManuais((dm) => ({
          ...dm,
          valor_corrigido: valorHoje,
          valor_corrigido_futuro: valorFuturo,
          taxa_administracao_deduzida: taxaAdm,
        }));

        const valorRestituir =
          dadosBasicos.valor_total_pago_extrato - (resultado.taxa_adm_devida_valor || 0);

        setDadosBasicos((prev) => ({
          ...prev,
          valor_a_restituir: valorRestituir,
        }));

        setResultadoJurosHoje(resultado.valor_com_juros_hoje || 0);
        setResultadoJurosFuturo(resultado.valor_com_juros_futuro || 0);
        console.log("✅ Resultado backend:", resultado);
        setResultadoTaxaAdmDevidaValor(resultado.taxa_adm_devida_valor || 0);
        setResultadoTaxaAdmDevidaPercentual(resultado.taxa_adm_devida_percentual || 0);
      } else {
        setMensagem("❌ Erro ao calcular: dados incompletos.");
      }
    } catch (e: any) {
      console.error(e);
      setMensagem("❌ Falha ao conectar com o backend.");
    }
  }

  // 🔄 Restaura valores reais quando volta a "Sem Julgamento/Em andamento"
  async function restoreSemJulgamentoValues() {
    try {
      const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const extratoId = params.get('extratoId') || params.get('extrato_id');
      if (!extratoId) return;

      const API =
        process.env.NEXT_PUBLIC_API_BASE ||
        process.env.NEXT_PUBLIC_API ||
        'http://127.0.0.1:8000';

      try { await axios.post(`${API}/extratos/${encodeURIComponent(String(extratoId))}/recalcular`); } catch {}

      try {
        const fres = await axios.get(`${API}/extratos/${encodeURIComponent(String(extratoId))}`);
        const d: any = (fres?.data ?? {}) as any;

        try { setResultadoJurosHoje(Number(d?.valor_corrigido_hoje ?? d?.valor_hoje ?? 0)); } catch {}
        try { setResultadoJurosFuturo(Number(d?.valor_corrigido_futuro ?? d?.valor_corrigido_futuro ?? 0)); } catch {}

        try {
          if (Array.isArray(d?.parcelas)) {
            const toNum = (v: any) => typeof v === 'number'
              ? v
              : Number(String(v ?? '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0;

            setParcelas(d.parcelas.map((p: any) => ({
              ...p,
              valor_corrigido_hoje: toNum(p?.valor_corrigido_hoje ?? p?.corrigido_hoje ?? 0),
              valor_corrigido_futuro: toNum(p?.valor_corrigido_futuro ?? p?.corrigido_futuro ?? 0),
            })));
          }
        } catch {}
        return; // sucesso — não cai no fallback
      } catch {}

      // Fallback: recalcula em memória
      try {
        if (typeof calcularValores === 'function') {
          await calcularValores();
        }
      } catch {}
    } catch (e) {
      console.warn('restoreSemJulgamentoValues falhou', e);
    }
  }
;


  const novaConsulta = () => {
    setEtapa("upload");
    setParcelas([]);
    setDadosBasicos({
      grupo: "",
      cota: "",
      nome_cliente: "",
      cpf_cnpj: "",
      tipo_documento: "",
      taxa_adm_percentual: 0,
      total_parcelas_plano: 0,
      data_encerramento: "",
      data_primeira_assembleia: "",
      valor_total_pago_extrato: 0,
      valor_credito: 0,
      administradora: "",
      cep: "",
      cidade: "",
      estado: "",
      rua: "",
      numero: "",
      bairro: "",
      complemento: "",
      nacionalidade: "",
      comarca_cliente: "",
      comarca_administradora: "",
      taxa_adm_cobrada_valor: 0,
      percentual_taxa_adm_cobrada: 0,
      valor_taxa_adm_cobrada: 0,
      fundo_comum: 0,
      fundo_reserva: 0,
      seguros: 0,
      multas: 0,
      juros: 0,
      adesao: 0,
      outros_valores: 0,
      cnpj_administradora: '',
      numero_contrato: "",
    });
    setMensagem("");
    setLinks({});
    setArquivo(null);
    setDadosManuais({
      telefone: "",
      advogado: "",
      nacionalidade: "",
      numero_processo: "",
      usuario_advogado: "",
      honorarios_percentual: "",
      fase_processo: "",
      magistrado: "",
      valor_corrigido: "",
      valor_corrigido_futuro: "",
      data_inicio_juros: "",
      taxa_juros_percentual: "",
      houve_sentenca: false,
      data_sentenca: "",
      valor_outros_custos: "0",
      taxa_administracao_deduzida: "0",
      justica_gratuita: false,
      renda_mensal: 0,
      comprovante_renda: null,
      comprovante_endereco: null,
      documento_identidade: null,
      observacoes: "",
      tipo_justica: "juizado especial",
      ganho_sucumbencia: "",
      perda_sucumbencia: "",
      comarca_escolhida: "",
      indice_corrigido_hoje: indiceAteHoje,
      indice_corrigido_futuro: indiceFuturo,
    });
  };

  const montarEnderecoCliente = (dadosBasicos: any) => {
    const rua = dadosBasicos.rua || "";
    const numero = dadosBasicos.numero || "";
    const complemento = dadosBasicos.complemento || "";
    const bairro = dadosBasicos.bairro || "";
    const cidade = dadosBasicos.cidade || "";
    const estado = dadosBasicos.estado || "";
    const cep = dadosBasicos.cep || "";
    return `${rua}, ${numero}${complemento ? " - " + complemento : ""} - ${bairro} - ${cidade}/${estado} - CEP ${cep}`;
  };


// ✅ Garante data_encerramento válida (tenta várias fontes; fallback = hoje)
function computeEncerramento(): string {
  const c = (v:any) => converterParaInputDate(v);
  const picks: string[] = [];

  // fontes diretas
  try { picks.push(...[c((dadosBasicos as any)?.data_encerramento), c((dadosManuais as any)?.data_encerramento), c((dadosManuais as any)?.dataVencimento), c((dadosManuais as any)?.dataDoContrato)].filter(Boolean) as string[]); } catch {}

  // parcelas: pega a mais recente
  try {
    const cand = (parcelas || [])
      .map((p:any)=> c(p?.data_pagamento) || c(p?.data_vencimento) || c(p?.vencimento) || c(p?.data))
      .filter(Boolean) as string[];
    picks.push(...cand); // merged candidates from parcelas
  } catch {}

  picks.sort();
  if (picks.length) return picks[picks.length-1];

  // fallback: hoje
  const d = new Date(); const pad=(n:number)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

  // ✅ CORREÇÃO: A função buildExtratoPayload agora aceita os estados como parâmetros.
  const buildExtratoPayload = (
    currentDadosBasicos: any,
    currentDadosManuais: any,
    currentParcelas: any,
    currentValorSelecionado: string | null,
    currentResultadoTaxaAdmDevidaValor: number | null,
    currentResultadoJurosHoje: number | null,
    currentResultadoJurosFuturo: number | null,
    currentHouveAcordo: boolean,
    currentValorAcordo: string,
    currentHouveSentenca: boolean,
    currentTipoSentenca: string,
    currentValorSentenca: string,
    currentCustasProcessuais: any,
    currentEmailCliente: string,
    metadeHonorarioHoje: number,
    metadeHonorarioFuturo: number,
    diferenca: number,
    totalHonorariosHoje: number,
    totalHonorariosFuturo: number,
    totalCustasProcessuais: number,
    isAdvMode: boolean  // 🔐 NOVO: para preservar email do ZapSign
  ) => {

/* JAOPATCH: force zero corrigidos when ganho à vista ou acordo */
const __num = (v: any) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};
const __temValorAcordo = __num(currentValorAcordo) != null && Number(__num(currentValorAcordo)) > 0;
const __temValorSentencaAvista = __num(currentValorSentenca) != null && Number(__num(currentValorSentenca)) > 0 && String(currentTipoSentenca).toLowerCase() === "avista";
const __fase = String((currentDadosManuais as any)?.fase_processo || "").toLowerCase();
const forceZeroCorrigidos = (__fase === "ganhamos" && __temValorSentencaAvista) || (__fase === "acordo" && __temValorAcordo) || (__fase === "perdemos");
const num = (v: any) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number") return v;
      const s = String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };
    const onlyDigits = (s: any) => String(s || "").replace(/\D+/g, "");

    const parcelasPagas = (currentParcelas || []).filter((p: any) => num(p.valor_pago) && num(p.valor_pago) !== 0).length;
    const somaPag = (currentParcelas || []).reduce((acc: number, p: any) => acc + (num(p.valor_pago) || 0), 0);

    let advSel: any = null;
    try { 
      // 🔧 CORREÇÃO FINAL: usar dbSnapshot se existir (evita "efeito cola")
      advSel = dbSnapshot?.advogado_nome 
        ? { nome: dbSnapshot.advogado_nome }
        : JSON.parse(localStorage.getItem("advogadoSelecionado") || "null"); 
    } catch { }
    const advogadoNome = advSel?.nome || advSel?.nome_completo || currentDadosManuais?.advogado || "";
    const advogadoOab = advSel?.oab || "";
    const advogadoEmail = advSel?.email || "";
    const advogadoTelefone = advSel?.telefone || "";

    const tipoPagamento = currentDadosManuais?.fase_processo === "Ganhamos"
      ? (currentTipoSentenca === "avista" ? "À Vista" : "Futuro")
      : null;
    const valorSentencaNum = currentValorSentenca ? num(currentValorSentenca) : null;

    let valorCausaOpcao: any = null, valorCausa: any = null;
    valorCausaOpcao = "Valor Pago no Extrato";
    valorCausa = num(currentDadosBasicos?.valor_total_pago_extrato) || 0;

    const cpfcnpj = onlyDigits(currentDadosBasicos?.cpf_cnpj);
    const telefoneNum = onlyDigits(currentDadosManuais?.telefone);
    const enc = computeEncerramento();

    const limpaComarca = (v: any) => String(v || "").replace(/^COMARCA DE\s+/i, "").trim();
    const comarcaClienteNome = limpaComarca((currentDadosBasicos as any)?.comarca_cliente);
    const comarcaAdmNome = limpaComarca((currentDadosBasicos as any)?.comarca_administradora);
    const comarcaEscolhidaNome = limpaComarca((currentDadosManuais as any)?.comarca_escolhida);

    const percentCobrada = (num(currentDadosBasicos?.taxa_adm_cobrada_valor) && num(currentDadosBasicos?.valor_total_pago_extrato))
      ? (Number(num(currentDadosBasicos?.taxa_adm_cobrada_valor)) / Number(num(currentDadosBasicos?.valor_total_pago_extrato))) * 100
      : null;
    const valorBaseHoje = currentHouveAcordo
      ? parseFloat(currentValorAcordo || "0")
      : currentHouveSentenca && currentTipoSentenca === "avista"
        ? parseFloat(currentValorSentenca || "0")
        : currentResultadoJurosHoje || 0;

    const valorBaseFuturo = currentHouveAcordo || (currentHouveSentenca && currentTipoSentenca === "avista")
      ? 0
      : currentResultadoJurosFuturo || 0;


    // --- Robustez: usar DB snapshot quando vazio ---
    const adv_nome_final = advogadoNome || (dbSnapshot?.advogado_nome || "") || undefined;
    const adv_oab_final = advogadoOab || (dbSnapshot?.advogado_oab || "") || undefined;
    const adv_email_final = advogadoEmail || (dbSnapshot?.advogado_email || "") || undefined;
    const adv_tel_final = advogadoTelefone || (dbSnapshot?.advogado_telefone || "") || undefined;

    const comarca_nome_final = (currentDadosManuais as any)?.comarca_escolhida || dbSnapshot?.comarca_escolhida_nome || undefined;
    const comarca_uf_final = currentDadosBasicos?.estado || dbSnapshot?.comarca_escolhida_uf || undefined;

    const __payload = {
      valor_acordo: null,
      grupo: currentDadosBasicos?.grupo,
      cota: currentDadosBasicos?.cota,
      nome_cliente: currentDadosBasicos?.nome_cliente || (currentDadosBasicos as any)?.nome || "",
      cpf_cnpj: cpfcnpj,
      tipo_documento: currentDadosBasicos?.tipo_documento || (cpfcnpj?.length > 11 ? "CNPJ" : "CPF"),
      administradora: currentDadosBasicos?.administradora,
      taxa_adm_percentual: num(currentDadosBasicos?.taxa_adm_percentual) || 0,
      total_parcelas_plano: parseInt(String(currentDadosBasicos?.total_parcelas_plano || "0"), 10),
      data_encerramento: enc,
      valor_total_pago_extrato: num(currentDadosBasicos?.valor_total_pago_extrato) || 0,
      parcelas_pagas: parcelasPagas,
      soma_valores_pagos: Number(somaPag.toFixed(2)),
      cidade: currentDadosBasicos?.cidade,
      estado: currentDadosBasicos?.estado,
      telefone: telefoneNum,
      valor_credito: num(currentDadosBasicos?.valor_credito),
      valor_pago_extrato: num(currentDadosBasicos?.valor_total_pago_extrato),
      fundo_comum: num((currentDadosBasicos as any)?.fundo_comum),
      fundo_reserva: num((currentDadosBasicos as any)?.fundo_reserva),
      seguros: num((currentDadosBasicos as any)?.seguros),
      multas: num((currentDadosBasicos as any)?.multas),
      juros: num((currentDadosBasicos as any)?.juros),
      adesao: num((currentDadosBasicos as any)?.adesao),
      outros_valores: num((currentDadosBasicos as any)?.outros_valores),
      valor_total_taxa_adm_cobrada: num((currentDadosBasicos as any)?.taxa_adm_cobrada_valor),
      percentual_cobrada_calculado: percentCobrada ? Number(percentCobrada.toFixed(4)) : null,
      taxa_adm_contratada_percentual: num(currentDadosBasicos?.taxa_adm_percentual),
      valor_taxa_adm_devida: currentResultadoTaxaAdmDevidaValor ?? null,
      justica_gratuita: !!(currentDadosManuais as any)?.justica_gratuita,
      tipo_justica: (currentDadosManuais as any)?.tipo_justica || null,
      inicio_juros: (currentDadosManuais as any)?.data_inicio_juros || null,
      taxa_juros_percentual: num((currentDadosManuais as any)?.taxa_juros_percentual),
      custas_processuais: (currentCustasProcessuais && currentCustasProcessuais.length) ? currentCustasProcessuais : null,
      indice_ate_hoje: (currentDadosManuais as any)?.indice_corrigido_hoje || null,
      indice_ate_futuro: (currentDadosManuais as any)?.indice_corrigido_futuro || null,
      advogado_nome: adv_nome_final,
      advogado_oab: adv_oab_final,
      advogado_email: adv_email_final,
      advogado_telefone: adv_tel_final,
      comarca_cliente_nome: comarcaClienteNome || null,
      comarca_cliente_uf: currentDadosBasicos?.estado || null,
      comarca_adm_nome: comarcaAdmNome || null,
      comarca_adm_uf: currentDadosBasicos?.estado || null,
      resultado_processo: (currentDadosManuais as any)?.fase_processo || null,
      tipo_pagamento: tipoPagamento,
      valor_sentenca: tipoPagamento === "À Vista" ? (valorSentencaNum || null) : null,
      valor_causa_opcao: valorCausaOpcao,
      valor_causa: valorCausa,
      percentual_honorarios: (currentDadosManuais as any)?.honorarios_percentual || null,
      rua: (currentDadosBasicos as any)?.rua,
      numero: (currentDadosBasicos as any)?.numero,
      bairro: (currentDadosBasicos as any)?.bairro,
      complemento: (currentDadosBasicos as any)?.complemento,
      nacionalidade: (currentDadosBasicos as any)?.nacionalidade,
      cnpj_administradora: (currentDadosBasicos as any)?.cnpj_administradora,
      numero_contrato: (currentDadosBasicos as any)?.numero_contrato,
      endereco_cliente: (currentDadosBasicos as any)?.endereco_cliente,
      cidade_estado_cliente: `${currentDadosBasicos?.cidade || ""}/${currentDadosBasicos?.estado || ""}`,
      cep: currentDadosBasicos?.cep || null,
      // 🔐 CORREÇÃO: Em mode=adv, não sobrescrever email capturado pelo ZapSign se campo estiver vazio
      ...((() => {
        // Se não estamos em modo avançado, usar lógica normal
        if (!isAdvMode) return { email_cliente: currentEmailCliente || null };
        
        // Em modo avançado: só incluir email_cliente se há email digitado
        if (currentEmailCliente && currentEmailCliente.trim()) {
          return { email_cliente: currentEmailCliente.trim() };
        }
        
        // Campo vazio em mode=adv: não incluir email_cliente no payload (mantém valor do ZapSign)
        return {};
      })()),
      observacoes: currentDadosManuais?.observacoes || null,
      parcelas: currentParcelas || null,
      comarca_escolhida_nome: (comarca_nome_final || undefined),
      comarca_escolhida_uf: (comarca_uf_final || undefined),
      fase_processo: currentDadosManuais?.fase_processo || null,
      numero_processo: (currentDadosManuais?.numero_processo || '').trim() || null,
      nome_magistrado: currentDadosManuais?.magistrado || null,
      juros_mora_percentual: Number((currentDadosManuais?.taxa_juros_percentual || '0').toString().replace(',', '.')) || 0,
      valor_corrigido_hoje: (forceZeroCorrigidos ? 0 : (currentResultadoJurosHoje ?? Number(currentDadosManuais?.valor_corrigido || 0))),
      valor_corrigido_futuro: (forceZeroCorrigidos ? 0 : (currentResultadoJurosFuturo ?? Number(currentDadosManuais?.valor_corrigido_futuro || 0))),
      honorarios_percentual: Number((currentDadosManuais?.honorarios_percentual || '0').toString().replace('%', '').replace(',', '.')) || 0,
      honorarios_hoje_adv: metadeHonorarioHoje || 0,
      honorarios_hoje_emp: metadeHonorarioHoje || 0,
      honorarios_futuro_adv: metadeHonorarioFuturo || 0,
      honorarios_futuro_emp: metadeHonorarioFuturo || 0,
      ganho_sucumbencia: Number(currentDadosManuais?.ganho_sucumbencia || 0),
      perda_sucumbencia: Number(currentDadosManuais?.perda_sucumbencia || 0),
      reembolso_custas: (currentDadosManuais?.fase_processo === 'Ganhamos' ? totalCustasProcessuais : 0),
      valor_pg_liquido: (Number(currentDadosBasicos?.valor_total_pago_extrato || 0) - (currentResultadoTaxaAdmDevidaValor || 0)),
      valor_diferenca: diferenca,
      liquido_hoje: (((currentHouveAcordo ? parseFloat(currentValorAcordo || '0') : (currentHouveSentenca && currentTipoSentenca === 'avista' ? parseFloat(currentValorSentenca || '0') : (currentResultadoJurosHoje || 0))) - totalHonorariosHoje - Number(currentDadosManuais?.taxa_administracao_deduzida || 0) - Number(currentDadosManuais?.valor_outros_custos || 0) + (currentDadosManuais?.fase_processo === 'Ganhamos' ? totalCustasProcessuais : 0) + (currentDadosManuais?.fase_processo === 'Ganhamos' ? Number(currentDadosManuais?.ganho_sucumbencia || 0) : 0))),
      liquido_futuro: ((((currentHouveAcordo || (currentHouveSentenca && currentTipoSentenca === 'avista')) ? 0 : (currentResultadoJurosFuturo || 0)) - totalHonorariosFuturo - Number(currentDadosManuais?.taxa_administracao_deduzida || 0) - Number(currentDadosManuais?.valor_outros_custos || 0) + (currentDadosManuais?.fase_processo === 'Ganhamos' ? totalCustasProcessuais : -totalCustasProcessuais) + (currentDadosManuais?.fase_processo === 'Ganhamos' ? Number(currentDadosManuais?.ganho_sucumbencia || 0) : 0))),
      liquido_corrigido_hoje: undefined,
      liquido_corrigido_futuro: undefined,
    };

    // JAOPATCH: regras finais – acordo / à vista / perdemos / sem julgamento
{
  const fase = String((currentDadosManuais?.fase_processo || '')).toLowerCase();

  const numSafe = (v: any) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const temValorAcordo   = numSafe(currentValorAcordo)   != null && Number(numSafe(currentValorAcordo))   > 0;
  const temValorSentenca = numSafe(currentValorSentenca) != null && Number(numSafe(currentValorSentenca)) > 0;
  const eAvista          = String(currentTipoSentenca || '').toLowerCase() === 'avista';

  const houveAcordo    = !!currentHouveAcordo && temValorAcordo;
  const sentencaAvista = !!currentHouveSentenca && eAvista && temValorSentenca;
  const onlyPerdemos   = (fase === 'perdemos');
  const mustZeroFuturo = onlyPerdemos || houveAcordo || sentencaAvista;

  // 👇 ADICIONE ESTA LINHA para enviar valor_acordo no payload
(__payload as any).valor_acordo = houveAcordo ? Number(numSafe(currentValorAcordo) || 0) : null;

  // Futuro sempre zerado em: acordo / à vista / perdemos
  if (mustZeroFuturo) {
    __payload.valor_corrigido_futuro             = 0;
    (__payload as any).valor_corrigido_futuro   = 0;
    __payload.honorarios_futuro_adv    = 0;
    __payload.honorarios_futuro_emp    = 0;
    __payload.liquido_futuro           = 0;
  }

  // Hoje: perde zera tudo; acordo/à vista mantém hoje e seta pelo valor informado
  if (onlyPerdemos) {
    __payload.valor_corrigido_hoje = 0;
    __payload.honorarios_hoje_adv  = 0;
    __payload.honorarios_hoje_emp  = 0;
    __payload.liquido_hoje         = 0;
  } else if (houveAcordo) {
    __payload.valor_corrigido_hoje = Number(numSafe(currentValorAcordo) || 0);
  } else if (sentencaAvista) {
    __payload.valor_corrigido_hoje = Number(numSafe(currentValorSentenca) || 0);
  }
}
return __payload;
    ;
  };

  const gerarDocumentosWord = async () => {
    try {
      const errosEstado = camposObrigatoriosFaltando(dadosBasicos, dadosManuais, parcelas);
      const errosDOM = verificarCamposObrigatoriosDOM();

      const usuarioPapel = getPerfil();

      if ((usuarioPapel === "gerente" || usuarioPapel === "admin") && !advogadoSelecionado) {
        alert("⚠️ Por favor, selecione um advogado antes de gerar os documentos.");
        return;
      }

      const erros = [...errosEstado, ...errosDOM];
      if (erros.length > 0) {
        alert("⚠️ Os seguintes campos estão incompletos:\n\n- " + erros.join("\n- "));
        return;
      }

      // 🧠 APRENDIZADO AUTOMÁTICO: Captura todas as correções feitas pelo usuário
      // Compara dados atuais com valores originais registrados durante a extração
      if (dadosBasicos?.administradora) {
        const camposParaVerificar = [
          'nome_cliente', 'cpf_cnpj', 'grupo', 'cota', 'numero_contrato',
          'valor_credito', 'data_encerramento', 'data_primeira_assembleia',
          'total_parcelas_plano', 'taxa_adm_percentual', 'valor_total_pago_extrato',
          'cep', 'rua', 'numero', 'bairro', 'cidade', 'estado', 'complemento',
          'nacionalidade'
        ];

        // Captura correções de forma assíncrona sem bloquear a geração dos documentos
        camposParaVerificar.forEach(campo => {
          const valorAtual = dadosBasicos[campo as keyof typeof dadosBasicos];
          if (valorAtual) {
            detectarCorrecao(campo, String(valorAtual), {
              grupo: dadosBasicos.grupo,
              cota: dadosBasicos.cota,
              administradora: dadosBasicos.administradora
            });
          }
        });
      }

      // Salva as alterações no extrato antes de gerar os documentos (mantém endereço manual)
      // Removido: salvar antes de gerar não faz sentido enquanto o extrato ainda está em edição.

      // ✅ CORREÇÃO: A função handleSalvar foi mantida na tela do advogado, mas para este fluxo, não há salvamento.
      // O código abaixo apenas gerará o documento com os dados da tela.
      const dataExtenso = new Date().toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      const montarEnderecoCliente = () => {
        const rua = dadosBasicos.rua || "";
        const numero = dadosBasicos.numero || "";
        const complemento = dadosBasicos.complemento || "";
        const bairro = dadosBasicos.bairro || "";
        const cidade = dadosBasicos.cidade || "";
        const estado = dadosBasicos.estado || "";
        const cep = dadosBasicos.cep || "";

        return `${rua}, ${numero}${complemento ? " - " + complemento : ""} - ${bairro} - ${cidade}/${estado} - CEP ${cep}`;
      };

      if (!dadosManuais.comarca_escolhida) {
        alert("⚠️ Por favor, selecione a comarca.");
        return;
      }
      function isoParaBR(dataIso: string | undefined): string {
        if (!dataIso) return "";
        const partes = dataIso.split("-");
        if (partes.length !== 3) return "";
        const [ano, mes, dia] = partes;
        return `${dia}/${mes}/${ano}`;
      }
      const advogado = dbSnapshot?.advogado_nome 
        ? { nome: dbSnapshot.advogado_nome }
        : JSON.parse(localStorage.getItem("advogadoSelecionado") || "{}");


      const obterUsuarioAdvogado = () => {
        try {
          const perfil = localStorage.getItem("perfilUsuario");
          if (perfil === "advogado") {
            return localStorage.getItem("usuarioAdvogado") || "";
          }
          const selecionado = dbSnapshot?.advogado_nome 
            ? { usuario: dbSnapshot.advogado_nome.split(" ")[0].toLowerCase() }
            : JSON.parse(localStorage.getItem("advogadoSelecionado") || "{}");
          if (selecionado && selecionado.usuario) return selecionado.usuario;
        } catch { }
        return localStorage.getItem("usuarioAdvogado") || "";
      };
      const usuarioAdvogadoFinal = obterUsuarioAdvogado();
      const payload = {
        nome: dadosBasicos.nome_cliente,
        cpf: dadosBasicos.cpf_cnpj,
        endereco_cliente: montarEnderecoCliente(),
        cidade: dadosBasicos.cidade,
        estado: dadosBasicos.estado,
        cidade_estado_cliente: `${dadosBasicos.cidade}/${dadosBasicos.estado}`,
        comarca: dadosManuais.comarca_escolhida,
        comarca_escolhida: dadosManuais.comarca_escolhida,
        comarca_cliente: dadosBasicos.comarca_cliente,
        comarca_administradora: dadosBasicos.comarca_administradora,
        telefone: dadosManuais.telefone,
        nacionalidade: dadosBasicos.nacionalidade || "Brasileiro",
        advogado_nome: advogado.nome_completo || dadosManuais.advogado,
        advogado_oab: advogado.oab || "",
        percentual_honorarios: dadosManuais.honorarios_percentual + "%",
        data_contrato: dataExtenso,
        data_procuracao: dataExtenso,
        administradora: dadosBasicos.administradora,
        data_encerramento: isoParaBR(dadosBasicos.data_encerramento),
        usuario_advogado: advogado.usuario || "",

        email: emailCliente,
      };

      console.log("📦 Payload enviado:", payload);

      try {
        const resposta = await fetch(`${API_BASE}/gerar-documentos-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const resultado = await resposta.json();

        if (!resposta.ok) {
          console.error("❌ Erro no backend (preview):", resultado);
          alert("Erro ao gerar documentos (preview): " + (resultado?.detail || "Erro desconhecido."));
          return;
        }

        const obrigatorios = {
          grupo: dadosBasicos.grupo || "—",
          cota: dadosBasicos.cota || "—",
          nome_cliente: dadosBasicos.nome_cliente || (dadosBasicos as any)?.nome || "" || "—",
          cpf_cnpj: (dadosBasicos.cpf_cnpj || "").replace(/\D/g, ""),
          tipo_documento: dadosBasicos.tipo_documento || ((dadosBasicos.cpf_cnpj || "").replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"),
          administradora: dadosBasicos.administradora || "—",
          taxa_adm_percentual: Number(dadosBasicos.taxa_adm_percentual || 0),
          total_parcelas_plano: Number(dadosBasicos.total_parcelas_plano || 0),
          data_encerramento: (dadosBasicos.data_encerramento || "").slice(0, 10),
          valor_total_pago_extrato: Number(dadosBasicos.valor_total_pago_extrato || 0),
        };

        // DEBUG: Verificar valores das comarcas
        console.log('🔍 DEBUG COMARCAS antes de setDocumentosGerados:', {
          comarca_cliente: dadosBasicos?.comarca_cliente,
          comarca_administradora: dadosBasicos?.comarca_administradora,
          comarca_escolhida: dadosManuais?.comarca_escolhida,
        });

        setDocumentosGerados({
          contrato_pdf: resultado.contrato_pdf,
          procuracao_pdf: resultado.procuracao_pdf,
          nome_cliente: payload.nome,
          telefone_cliente: payload.telefone,
          usuario_advogado: payload.usuario_advogado,
          payloadEnvio: {
            ...buildExtratoPayload(dadosBasicos, dadosManuais, parcelas, valorSelecionado, resultadoTaxaAdmDevidaValor, resultadoJurosHoje, resultadoJurosFuturo, houveAcordo, valorAcordo, houveSentenca, tipoSentenca, valorSentenca, custasProcessuais, emailCliente, metadeHonorarioHoje, metadeHonorarioFuturo, diferenca, totalHonorariosHoje, totalHonorariosFuturo, totalCustasProcessuais, isAdvMode),
            cep: dadosBasicos?.cep,
            rua: dadosBasicos?.rua,
            numero: dadosBasicos?.numero,
            bairro: dadosBasicos?.bairro,
            complemento: dadosBasicos?.complemento,
            email_cliente: emailCliente,
            numero_contrato: dadosBasicos?.numero_contrato,
            cnpj_administradora: (dadosBasicos?.cnpj_administradora || '').replace(/\D/g, ''),
            comarca_escolhida: dadosManuais?.comarca_escolhida,
            comarca_cliente: dadosBasicos?.comarca_cliente,
            comarca_administradora: dadosBasicos?.comarca_administradora,
            parcelas: (parcelas ?? []).map((p: any) => ({
              numero_parcela: p?.numero_parcela ?? p?.numero ?? undefined,
              data_pagamento: p?.data_pagamento ?? p?.data,
              valor_pago: p?.valor_pago ?? p?.valor,
              valor_corrigido_hoje: p?.valor_corrigido_hoje,
              valor_corrigido_futuro: p?.valor_corrigido_futuro,
              tipo: p?.tipo || "RECBTO. PARCELA",
            })),
            custas: (custasProcessuais ?? []).map((c: any) => ({
              data: c?.data,
              descricao: c?.descricao ?? c?.desc,
              valor: c?.valor,
            })),
            nacionalidade: dadosBasicos?.nacionalidade,
            observacoes: dadosManuais?.observacoes || undefined,
            tipo_justica: (dadosManuais?.tipo_justica && String(dadosManuais?.tipo_justica).trim().length > 0) ? dadosManuais?.tipo_justica : "juizado especial",
            valor_corrigido_futuro: (dadosManuais?.houve_sentenca && (tipoSentenca === "avista"))
              ? (resultadoJurosHoje ?? Number(dadosManuais?.valor_corrigido || 0))
              : (resultadoJurosFuturo ?? Number(dadosManuais?.valor_corrigido_futuro || 0) ?? (Array.isArray(parcelas) ? parcelas.reduce((a: number, p: any) => a + Number(p?.valor_corrigido_futuro || 0), 0) : undefined)),
          },
        });
        setMostrarModal(true);
      } catch (erro) {
        console.error("Erro inesperado (preview):", erro);
        alert("Erro inesperado ao gerar documentos (preview).");
        return;
      }
    } catch (erro) {
      console.error("❌ Erro inesperado:", erro);
      alert("Erro inesperado ao gerar documentos.");
    }
  };

  const salvarEAvaliar = () => setEtapa("analise");

  const excluirParcela = (index: number) => {
    setParcelas(parcelas.filter((_, i) => i !== index));
  };

  const alterarParcela = (index: number, campo: string, valor: string) => {
    setParcelas((prev) => {
      const novas = [...prev];
      novas[index] = {
        ...novas[index],
        [campo]: campo === "valor_pago" ? parseFloat(valor.replace(",", ".")) : valor,
      };
      return novas;
    });
  };

  const incluirParcela = () => {
    if (!novaParcela.data_pagamento || !novaParcela.valor_pago) return;
    const novaPar = {
      numero_parcela: null,
      data_pagamento: novaParcela.data_pagamento,
      valor_pago: parseFloat(novaParcela.valor_pago.replace(",", ".")),
      valor_corrigido_hoje: 0,
      valor_corrigido_futuro: 0,
      tipo: novaParcela.tipo || "parcela",
    };
    console.log("[DEBUG] Incluindo nova parcela:", novaPar);
    setParcelas((prev) => [...prev, novaPar]);
    setNovaParcela({ data_pagamento: "", valor_pago: "", tipo: "parcela" });
  };

  const soma = parcelas.reduce((acc, p) => acc + Number(p.valor_pago || 0), 0);
  const diferenca = parseFloat((dadosBasicos.valor_total_pago_extrato - soma).toFixed(2));
  const parcelasRealmentePagas = parcelas.filter((p) => p.tipo === "parcela").length;
  const parcelasFiltradas = parcelas.filter((p) => p.data_pagamento && p.data_pagamento.includes(filtro));

  const totalCorrigidoHoje = parcelas.reduce((acc, p) => acc + (p.valor_corrigido_hoje || 0), 0);
  const totalCorrigidoFuturo = parcelas.reduce((acc, p) => acc + (p.valor_corrigido_futuro || 0), 0);
  const totalTaxaAdmParcela = parcelas.reduce((acc, p) => acc + (p.taxa_adm_parcela || 0), 0);

  const honorarioPercentual = parseFloat(String(dadosManuais.honorarios_percentual || "0").replace("%", "")) || 0;
  const baseHoje = houveAcordo
    ? parseFloat(valorAcordo || "0")
    : houveSentenca && tipoSentenca === "avista"
      ? parseFloat(valorSentenca || "0")
      : resultadoJurosHoje || 0;

  const baseFuturo = houveAcordo || (houveSentenca && tipoSentenca === "avista")
    ? 0
    : resultadoJurosFuturo || 0;

  const valorBaseHoje = houveAcordo
    ? parseFloat(valorAcordo || "0")
    : houveSentenca && tipoSentenca === "avista"
      ? parseFloat(valorSentenca || "0")
      : resultadoJurosHoje || 0;

  const valorBaseFuturo = houveAcordo || (houveSentenca && tipoSentenca === "avista")
    ? 0
    : resultadoJurosFuturo || 0;

  const totalHonorariosHoje = valorBaseHoje * (honorarioPercentual / 100);
  const totalHonorariosFuturo = valorBaseFuturo * (honorarioPercentual / 100);
  const totalCustasProcessuais =
    dadosManuais.tipo_justica === "Justiça Comum" && !dadosManuais.justica_gratuita
      ? custasProcessuais.reduce((acc, c) => acc + c.valor, 0)
      : 0;

  const metadeHonorarioHoje = totalHonorariosHoje / 2;
  const metadeHonorarioFuturo = totalHonorariosFuturo / 2;

  const toUpper = (texto: string): string => {
    return texto.toUpperCase();
  };

  const formatarNumeroProcesso = (valor: string) => {
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
  };

  // ✅ CORREÇÃO: Função handleSalvar restaurada e corrigida

const handleSalvar = async ({ silent = false }: { silent?: boolean } = {}) => {
    const toastId = silent ? null : toast.loading("Salvando alterações…");
    try {
      // extratoId via query (sp) + fallbacks (URL e window)
      const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search || "") : null;
      let extratoId = "";
      try {
        const qFromSp = (sp as any)?.extratoId || (sp as any)?.extrato_id || (sp as any)?.id;
        if (qFromSp) extratoId = String(qFromSp);
      } catch {}
      if (!extratoId && params) {
        extratoId =
          params.get("extratoId") ||
          params.get("extrato_id") ||
          params.get("id") ||
          ((window as any)?.extratoId ? String((window as any).extratoId) : "");
      }
      if (!extratoId && typeof window !== "undefined") {
        const pathId = window.location.pathname
          .split("/")
          .filter(Boolean)
          .reverse()
          .find((segment) => /^\d+$/.test(segment));
        if (pathId) extratoId = pathId;
      }
      if (!extratoId) {
        console.warn("[Docs] Extrato não identificado; seguindo sem persistência.");
      }

      const API_BASE = ((process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API || "http://127.0.0.1:8000") as string).replace(/\/+$/,""
      );
      const url = `${API_BASE}/extratos/${encodeURIComponent(String(extratoId))}`;

      // payload com estados ATUAIS
      const payload = buildExtratoPayload(
        dadosBasicos, dadosManuais, parcelas, valorSelecionado,
        resultadoTaxaAdmDevidaValor, resultadoJurosHoje, resultadoJurosFuturo,
        houveAcordo, valorAcordo, houveSentenca, tipoSentenca, valorSentenca,
        custasProcessuais, emailCliente, metadeHonorarioHoje, metadeHonorarioFuturo,
        diferenca, totalHonorariosHoje, totalHonorariosFuturo, totalCustasProcessuais,
        isAdvMode  // 🔐 Preservar email do ZapSign em mode=adv
      );

      console.log("[DEBUG SAVE] Parcelas no payload:", payload.parcelas);

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // identificar usuarioId (query/local/session)
      let usuarioId = "";
      try {
        const qUser = (sp as any)?.usuarioId || (sp as any)?.usuario_id || (sp as any)?.uid;
        if (qUser) usuarioId = String(qUser);
      } catch {}
      if (!usuarioId && typeof window !== "undefined") {
        const up = new URLSearchParams(window.location.search || "");
        usuarioId = up.get("usuarioId") || up.get("usuario_id") || up.get("uid") || "";
        if (!usuarioId) {
          try {
            usuarioId = localStorage.getItem("usuarioId") || sessionStorage.getItem("usuarioId") || "";
          } catch {}
        }
      }


      // perfil efetivo
      let perfilEfetivo: string = "";
      try { perfilEfetivo = normalizeRole(getPerfil() || (isAdvMode ? "advogado" : "")); } catch {}

      if (perfilEfetivo === "advogado" || isAdvMode || String(sp?.mode || "").toLowerCase() === "adv") {
        headers["X-Perfil"] = "advogado";
      } else if ((perfilEfetivo === "admin" || perfilEfetivo === "gerente") && usuarioId) {
        headers["X-Usuario-Id"] = String(usuarioId);
      } else if (usuarioId) {
        headers["X-Usuario-Id"] = String(usuarioId);
      }

      await axios.put(url, payload, { headers });

      if (!silent) toast.success("Alterações salvas com sucesso!");
    } catch (e: any) {
      console.error("Erro ao salvar:", e?.response?.data || e);
      const status = e?.response?.status;
      const msg = (e?.response?.data?.detail || e?.response?.data?.message || e?.message || "").toString();

      if (status === 401 || status === 403) {
        if (!silent) toast.error("Sem permissão para salvar (401/403).");
      } else if (/duplic/i.test(msg) && /(grupo|cota)/i.test(msg)) {
        if (!silent) toast.error("Duplicidade detectada: já existe extrato com o mesmo grupo e cota.");
      } else {
        if (!silent) toast.error("Falha ao salvar. Verifique os campos e tente novamente.");
      }
      throw e;
    } finally {
      if (toastId) toast.dismiss(toastId);
    }
  };


  useEffect(() => {
    if (typeof window === "undefined") return;

    // ✅ CORREÇÃO: Lógica para exibir o botão de salvar apenas na tela do advogado
    const isAdvScreen = window.location.search.includes('extratoId');
    const isGerenteOuAdmin = papel === "gerente" || papel === "admin";

    // O botão de salvar só deve ser exibido na tela de edição do extrato.
    // O botão "Gerar Procuração" deve existir apenas na tela de upload/análise.
    if (isAdvScreen && (ehAdvogado || isGerenteOuAdmin)) {
      const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      const match = (b: HTMLButtonElement) =>
        /Gerar\s+Procura[cç][aã]o|Gerar\s+Contrato|Procura[cç][aã]o\/Contrato/i.test(b.innerText || "");

      const visibles = btns.filter(b => match(b) && b.offsetParent !== null);
      let inserted: HTMLButtonElement | null = null;
      const hidden: HTMLButtonElement[] = [];

      if (visibles.length) {
        const classes = visibles[0].className || "";
        visibles.forEach(b => { b.style.display = "none"; hidden.push(b); });

        const clone = document.createElement("button");
        clone.type = "button";
        clone.className = classes;
        clone.setAttribute("data-btn-salvar-alteracoes", "1");
        clone.innerText = "💾 Salvar alterações";
        clone.addEventListener("click", () => { try { (handleSalvar as any)(); } catch {} });

        visibles[0].parentElement?.insertBefore(clone, visibles[0].nextSibling);
        inserted = clone;
      }

      return () => {
        hidden.forEach(b => { b.style.display = ""; });
        if (inserted && inserted.parentElement) inserted.parentElement.removeChild(inserted);
      };
    }

  }, [papel, ehAdvogado, dadosBasicos, dadosManuais, parcelas, valorSelecionado, resultadoTaxaAdmDevidaValor, resultadoJurosHoje, resultadoJurosFuturo, houveAcordo, valorAcordo, houveSentenca, tipoSentenca, valorSentenca, custasProcessuais, emailCliente, metadeHonorarioHoje, metadeHonorarioFuturo, diferenca, totalHonorariosHoje, totalHonorariosFuturo, totalCustasProcessuais]);


  // Quando snapshot do banco chega, completa dadosManuais se estiverem vazios
  useEffect(() => {
    if (!dbSnapshot) return;
    setDadosManuais(prev => {
      const next = { ...prev };
      if (!next.comarca_escolhida && dbSnapshot.comarca_escolhida_nome) next.comarca_escolhida = dbSnapshot.comarca_escolhida_nome;
      if (!next.advogado && dbSnapshot.advogado_nome) next.advogado = dbSnapshot.advogado_nome;
      if (!(next as any).advogado_oab && dbSnapshot.advogado_oab) (next as any).advogado_oab = dbSnapshot.advogado_oab;
      if (!(next as any).advogado_email && dbSnapshot.advogado_email) (next as any).advogado_email = dbSnapshot.advogado_email;
      if (!(next as any).advogado_telefone && dbSnapshot.advogado_telefone) (next as any).advogado_telefone = dbSnapshot.advogado_telefone;
      return next;
    });
  }, [dbSnapshot]);

  return (
    <>
      <main 
        data-enhanced 
        className="w-full mx-auto px-4 pb-32 space-y-8 lg:px-8 lg:space-y-10 transition-all duration-300"
        style={mostrarPdfViewer ? {
          marginRight: 'calc(40vw + 1rem)',
          maxWidth: 'calc(60vw - 2rem)'
        } : {
          maxWidth: '1280px'
        }}
      >
      {hydrated && (
        (() => {
          const nomeAdvogado = localStorage.getItem("nomeAdvogado");
          const oabAdvogado = localStorage.getItem("oabAdvogado");
          const nomeUsuario = localStorage.getItem("nomeUsuario");

          const nomeExibido = nomeAdvogado || nomeUsuario;
          const oabExibida = nomeAdvogado ? ` – OAB ${oabAdvogado}` : "";

          if (!nomeExibido) return null;

          return (
            <div
              className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-sm font-medium text-slate-800 shadow-lg`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-lg text-white shadow-lg shadow-slate-900/20">
                  👤
                </span>
                <div className="flex flex-col gap-1">
                  <strong className="text-base font-semibold text-slate-900">{nomeExibido}</strong>
                  {oabExibida && <span className="text-sm text-slate-500">{oabExibida}</span>}
                  <CargoPillInline />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                {(() => {
                  const read = (k: string) => (typeof localStorage !== "undefined" ? localStorage.getItem(k) : null);
                  const raw =
                    (typeof getPerfil === "function" ? (getPerfil() as any) : null) ??
                    read("perfil") ?? read("perfilUsuario") ?? read("role") ?? read("papel") ?? read("tipo") ?? read("nivel");
                  const norm = (s: any) => {
                    const p = String(s || "")
                      .normalize("NFD")
                      .replace(/\p{Diacritic}/gu, "")
                      .trim()
                      .toLowerCase();
                    if (["administrador", "adm", "super", "root"].includes(p)) return "admin";
                    if (["gerente", "manager"].includes(p)) return "gerente";
                    return p;
                  };
                  const role = norm(raw);
                  const showGerenciar = role === "admin" || role === "gerente";
                  if (!showGerenciar) return null;
                  return (
                    <Link
                      href="/gerencial/processos"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800"
                    >
                      Gerenciar processos
                    </Link>
                  );
                })()}


                {hasExtratoId && (ehAdvogado || papel === "gerente" || papel === "admin") && (
                  <button
                    data-btn-download-anexos
                    onClick={handleBaixarArquivosExtrato}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-900/10 bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800"
                    title="Baixar Anexos/Assinaturas/Extratos em ZIP"
                    type="button"
                  >
                    ⬇️ Baixar anexos do extrato
                  </button>
                )}
                <button
                  onClick={() => {
                    localStorage.clear();
                    window.location.href = "/login";
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-100 hover:text-red-700"
                >
                  Sair
                </button>
              </div>
            </div>
          );
        })()
      )}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Extrato de Consórcio</h1>
          {/* 🤖 Status do ML - Sistema de Aprendizado Automático */}
          <MLStatusIndicator />
        </div>
        
        {/* 👁️ Botão para visualizar PDF durante preenchimento */}
        {(arquivo || pdfUrlViewer) && (
          <button
            onClick={() => setMostrarPdfViewer(!mostrarPdfViewer)}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 whitespace-nowrap ${
              mostrarPdfViewer
                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
            title={mostrarPdfViewer ? "Ocultar PDF" : "Visualizar PDF durante preenchimento"}
          >
            {mostrarPdfViewer ? '👁️ Ocultar' : '👁️ Ver PDF'}
          </button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 items-stretch">

        {!isAdvMode && (
          <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} ${CARD_STACK_CLASS} h-full`}>
            <h2 className="font-semibold text-lg">1. Enviar PDF do Extrato</h2>
            <div className="flex flex-col items-stretch gap-2">
              <label className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-blue-500 border-dashed bg-blue-50 px-6 py-6 text-blue-700 font-semibold text-base shadow-lg cursor-pointer transition-all duration-200 hover:bg-blue-100 hover:text-blue-900 hover:shadow-xl animate-pulse">
                <span className="flex items-center gap-2 text-lg">
                  <svg xmlns='http://www.w3.org/2000/svg' className='h-6 w-6 text-blue-500' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12' /></svg>
                  Escolher Arquivo
                </span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
              {arquivo && <span className="max-w-xs truncate text-sm text-slate-500 text-center mt-1">{arquivo.name}</span>}
            </div>
            <button
              onClick={enviarPDF}
              className={`w-full rounded-2xl px-4 py-3 font-semibold transition-all duration-200
                ${arquivo ? 'bg-blue-600 text-white hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
              disabled={!arquivo}
            >
              {arquivo ? 'Enviar e Processar PDF' : '1º Escolha o arquivo acima'}
            </button>
            
            {/* BOTÃO PARA PREENCHIMENTO MANUAL */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">ou</span>
              </div>
            </div>
            
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔍 Estado atual da etapa:', etapa);
                console.log('✏️ Mudando para etapa de ajuste manual (sem PDF)');
                alert('✅ Modo de preenchimento manual ativado!\n\nVocê será redirecionado para a tela de edição de parcelas.');
                setMensagem("✏️ Modo de preenchimento manual ativado");
                setEtapa("ajuste");
                console.log('✅ Etapa alterada para: ajuste');
                
                // Scroll suave para o topo após um breve delay
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 100);
              }}
              className="w-full rounded-2xl px-4 py-3 font-semibold transition-all duration-200 bg-green-600 text-white hover:-translate-y-0.5 hover:bg-green-700 hover:shadow-lg active:scale-95"
            >
              ✏️ Preencher Manualmente (sem PDF)
            </button>
            
            {mensagem && (
              <div className="mt-2 text-center text-sm font-medium text-green-700">{mensagem}</div>
            )}
            {etapa === "analise" && (
              <>
                <div className="w-full mt-10">

                  <div className="border-t border-gray-300 pt-6 mt-6">
                    <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm md:items-end">

                      <h3 className="text-lg font-semibold text-gray-700 w-full text-left">
                        ⚙️ Ações
                      </h3>

                      <button
                        className="hidden"
                        onClick={() => setEtapa("ajuste")}
                      >
                        ✏️ Editar Extrato
                      </button>

                      <select
                        className="border p-2 rounded w-full"
                        value={advogadoSelecionado}
                        onChange={(e) => {
                          const usuarioSelecionado = e.target.value;
                          setAdvogadoSelecionado(usuarioSelecionado);

                          const advogado = advogados.find((a) => a.usuario === usuarioSelecionado);
                          if (advogado) {
                            // Só gravar no localStorage se for extrato NOVO (evita "efeito cola")
                            if (!hasExtratoId) {
                              localStorage.setItem("advogadoSelecionado", JSON.stringify(advogado));
                            }
                          }
                        }}
                      >
                        <option value="">Selecione um advogado</option>
                        {Array.isArray(advogados) && advogados.map((adv) => {
                          const perfil = localStorage.getItem("perfilUsuario");
                          const usuarioLogado = localStorage.getItem("usuarioAdvogado");
                          const isOutroAdvogado = perfil === "advogado" && adv.usuario !== usuarioLogado;
                          const isInativo = adv.ativo === false;

                          return (
                            <option
                              key={adv.usuario}
                              value={adv.usuario}
                              disabled={isOutroAdvogado || isInativo}
                              style={isInativo ? { color: "#999", backgroundColor: "#f5f5f5", fontStyle: "italic" } : (isOutroAdvogado ? { color: "#999" } : {})}
                            >
                              {adv.nome_completo} ({adv.oab}){isInativo ? " - Inativo" : ""}
                            </option>
                          );
                        })}
                      </select>

                      <button
                        onClick={() => {
                          const errosEstado = camposObrigatoriosFaltando(dadosBasicos, dadosManuais, parcelas);
                          const errosDOM = verificarCamposObrigatoriosDOM();

                          const usuarioPapel = getPerfil();

                          if ((usuarioPapel === "gerente" || usuarioPapel === "admin") && !advogadoSelecionado) {
                            alert("⚠️ Por favor, selecione um advogado antes de gerar os documentos.");
                            return;
                          }

                          const erros = [...errosEstado, ...errosDOM];
                          if (erros.length > 0) {
                            alert("⚠️ Os seguintes campos estão incompletos:\n\n- " + erros.join("\n- "));
                            return;
                          }

                          let advogadoNome = "";
                          let advogadoEmail = "";
                          let advogadoOab = "";

                          if (usuarioPapel === "advogado") {
                            advogadoNome = localStorage.getItem("nomeAdvogado") || "";
                            advogadoEmail = localStorage.getItem("emailAdvogado") || "";
                            advogadoOab = localStorage.getItem("oabAdvogado") || "";
                          } else {
                            const selecionado = localStorage.getItem("advogadoSelecionado");
                            if (selecionado) {
                              try {
                                const adv = JSON.parse(selecionado);
                                advogadoNome = adv?.nome_completo || "";
                                advogadoEmail = adv?.email || "";
                                advogadoOab = adv?.oab || "";
                              } catch (e) {
                                console.warn("⚠️ Erro ao ler advogado selecionado:", e);
                              }
                            }
                          }

                          console.log("📌 Advogado usado:", {
                            advogadoNome,
                            advogadoEmail,
                            advogadoOab,
                          });

                          gerarDocumentosWord();
                        }}
                        className="hidden"
                      >
                        📄 Gerar Procuração/Contrato
                      </button></div></div></div></>
            )}
          </section>
        )}

        <div
          data-card
          className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} flex h-full flex-col justify-between bg-linear-to-br from-blue-50 via-white to-indigo-50`}
        >
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-blue-900">💰 Valores Corrigidos</h2>
            <button
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-lg"
              onClick={calcularValores}
              type="button"
            >
              Calcular valores
            </button>

            <div className="space-y-3 text-sm text-slate-800">
              <p>
                <strong>✔️ Valor Corrigido Hoje:</strong>{" "}
                {formatarReais(
                  dadosManuais.fase_processo === "Perdemos"
                    ? 0
                    : houveAcordo
                      ? parseFloat(valorAcordo || "0")
                      : houveSentenca && tipoSentenca === "avista"
                        ? parseFloat(valorSentenca || "0")
                        : resultadoJurosHoje || 0
                )}
              </p>

              <p>
                <strong>✔️ Valor Corrigido Futuro:</strong>{" "}
                {formatarReais(
                  dadosManuais.fase_processo === "Perdemos"
                    ? 0
                    : houveAcordo || (houveSentenca && tipoSentenca === "avista")
                      ? 0
                      : resultadoJurosFuturo || 0
                )}
              </p>

              {dadosManuais.fase_processo === "Ganhamos" && totalCustasProcessuais > 0 && (
                <p className="text-green-600 font-medium">
                  🔁 Reembolso de Custas: {formatarReais(totalCustasProcessuais)}
                </p>
              )}

              <p>
                <strong>(-) Honorários:</strong><br />
                Hoje: {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : totalHonorariosHoje)} = {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : metadeHonorarioHoje)} (adv.) + {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : metadeHonorarioHoje)} (emp.)<br />
                Futuro: {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : totalHonorariosFuturo)} = {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : metadeHonorarioFuturo)} (adv.) + {formatarReais(dadosManuais.fase_processo === "Perdemos" ? 0 : metadeHonorarioFuturo)} (emp.)
              </p>

              {dadosManuais.fase_processo !== "Ganhamos" && (
                <p>
                  <strong>(-) Custas Processuais:</strong> {formatarReais(totalCustasProcessuais)}
                </p>
              )}

              {dadosManuais.fase_processo === "Ganhamos" && (
                <p className="text-green-700">
                  (+) Ganho com Sucumbência: {formatarReais(parseFloat(dadosManuais.ganho_sucumbencia || "0"))}
                </p>
              )}
              {dadosManuais.fase_processo === "Perdemos" && (
                <p className="text-red-700">
                  (-) Perda com Sucumbência: {formatarReais(parseFloat(dadosManuais.perda_sucumbencia || "0"))}
                </p>
              )}

              <hr className="my-2" />

              <p className={`${dadosManuais.fase_processo === "Perdemos" ? "text-red-700" : "text-green-700"} font-bold`}>
                {dadosManuais.fase_processo === "Perdemos" ? "❌ Prejuízo: " : "✅ Líquido Hoje: "}
                {
                  formatarReais(
                    dadosManuais.fase_processo === "Perdemos"
                      ? (
                        totalCustasProcessuais +
                        parseFloat(dadosManuais.perda_sucumbencia || "0")
                      ) * -1
                      : valorBaseHoje
                      - totalHonorariosHoje
                      - parseFloat(dadosManuais.taxa_administracao_deduzida || "0")
                      - parseFloat(dadosManuais.valor_outros_custos || "0")
                      + (dadosManuais.fase_processo === "Ganhamos" ? totalCustasProcessuais : 0)
                      + (dadosManuais.fase_processo === "Ganhamos"
                        ? parseFloat(dadosManuais.ganho_sucumbencia || "0")
                        : 0)
                  )
                }
              </p>

              {!(houveAcordo || (houveSentenca && tipoSentenca === "avista") || dadosManuais.fase_processo === "Perdemos") && (
                <p className="text-green-700 font-bold">✅ Líquido Futuro: {
                  formatarReais(
                    valorBaseFuturo
                    - totalHonorariosFuturo
                    - parseFloat(dadosManuais.taxa_administracao_deduzida || "0")
                    - parseFloat(dadosManuais.valor_outros_custos || "0")
                    + (dadosManuais.fase_processo === "Ganhamos" ? totalCustasProcessuais : -totalCustasProcessuais)
                    + (dadosManuais.fase_processo === "Ganhamos"
                      ? parseFloat(dadosManuais.ganho_sucumbencia || "0")
                      : 0)
                  )
                }</p>
              )}
            </div></div>

          <div className="mt-6 space-y-3 text-sm text-slate-700">
            <div>
              <label className="block font-medium">Índice - até hoje</label>
              <select
                value={dadosManuais.indice_corrigido_hoje}
                onChange={(e) =>
                  setDadosManuais((prev) => ({
                    ...prev,
                    indice_corrigido_hoje: e.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm transition-all duration-200 focus:border-blue-500 focus:shadow-lg focus:outline-none"
              >
                <option value="TJMG">TJMG</option>
                <option value="IPCA">IPCA</option>
                <option value="INPC">INPC</option></select></div>

            <div>
              <label className="block font-medium">Índice - até o futuro</label>
              <select
                value={dadosManuais.indice_corrigido_futuro}
                onChange={(e) =>
                  setDadosManuais((prev) => ({
                    ...prev,
                    indice_corrigido_futuro: e.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm transition-all duration-200 focus:border-blue-500 focus:shadow-lg focus:outline-none"
              >
                <option value="TJMG">TJMG</option>
                <option value="IPCA">IPCA</option>
                <option value="INPC">INPC</option></select></div></div></div>
        <div
          data-card
          className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} h-full transition-colors duration-300 ${dadosManuais.fase_processo === "Ganhamos" || dadosManuais.fase_processo === "Acordo"
            ? "border-emerald-200 bg-linear-to-br from-emerald-50 via-white to-emerald-100"
            : dadosManuais.fase_processo === "Perdemos"
              ? "border-rose-200 bg-linear-to-br from-rose-50 via-white to-rose-100"
              : "border-slate-200 bg-slate-50"} ${!ehAdvogado ? "opacity-70" : ""}`}
        >
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">📌 Resultado do Processo</h2>

            <div className={INPUT_FOCUS_WRAPPER}>
              <label className="text-sm font-medium text-slate-700">Resultado do Processo</label>
              <select
                value={dadosManuais.fase_processo || "Sem Julgamento"}
                onChange={(e) => {
                  const fase = e.target.value;
                  setDadosManuais({ ...dadosManuais, fase_processo: fase });

                  if (fase === "Ganhamos") {
                    setHouveSentenca(true);
                    setHouveAcordo(false);
                  } else if (fase === "Acordo") {
                    setHouveAcordo(true);
                    setHouveSentenca(false);
                  } else {
                    setHouveAcordo(false);
                    setHouveSentenca(false);
                  }
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm transition-all duration-200 focus:border-blue-500 focus:shadow-lg focus:outline-none"
              >
                <option value="Sem Julgamento">Sem Julgamento</option>
                <option value="Acordo">Acordo</option>
                <option value="Ganhamos">Ganhamos</option>
                <option value="Perdemos">Perdemos</option>
              </select>
            </div>

            {dadosManuais.fase_processo === "Acordo" && (
              <div className={INPUT_FOCUS_WRAPPER}>
                <label className="text-sm font-medium text-slate-700">Valor do Acordo</label>
                <NumericFormat
                  value={valorAcordo}
                  onValueChange={(val) => setValorAcordo(val.value)}
                  prefix="R$ "
                  thousandSeparator="."
                  decimalSeparator="," 
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-right transition-all duration-200 focus:border-blue-500 focus:shadow-lg focus:outline-none"
                  allowNegative={false}
                />
              </div>
            )}

            {dadosManuais.fase_processo === "Ganhamos" && (
              <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-emerald-800">Tipo de Pagamento</span>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm shadow-sm">
                      <input
                        type="radio"
                        checked={tipoSentenca === "avista"}
                        onChange={() => setTipoSentenca("avista")}
                      />
                      À Vista
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm shadow-sm">
                      <input
                        type="radio"
                        checked={tipoSentenca === "futuro"}
                        onChange={() => setTipoSentenca("futuro")}
                      />
                      Futuro
                    </label>
                  </div>
                </div>

                {tipoSentenca === "avista" && (
                  <div className={INPUT_FOCUS_WRAPPER}>
                    <label className="text-sm font-medium text-slate-700">Valor da Sentença (à vista)</label>
                    <NumericFormat
                      value={valorSentenca}
                      onValueChange={(val) => setValorSentenca(val.value)}
                      prefix="R$ "
                      thousandSeparator="."
                      decimalSeparator="," 
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-right transition-all duration-200 focus:border-blue-500 focus:shadow-lg focus:outline-none"
                      allowNegative={false}
                    />
                  </div>
                )}

                <div className={INPUT_FOCUS_WRAPPER}>
                  <label className="text-sm font-medium text-emerald-800">💰 Ganho com Sucumbência (R$)</label>
                  <NumericFormat
                    value={dadosManuais.ganho_sucumbencia || ""}
                    onValueChange={(val) =>
                      setDadosManuais({
                        ...dadosManuais,
                        ganho_sucumbencia: val.value,
                      })
                    }
                    thousandSeparator="."
                    decimalSeparator="," 
                    prefix="R$ "
                    allowNegative={false}
                    placeholder="R$ 0,00"
                    className="w-full rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-sm text-right transition-all duration-200 focus:border-emerald-500 focus:shadow-lg focus:outline-none"
                  />
                </div>
              </div>
            )}

            {dadosManuais.fase_processo === "Perdemos" && (
              <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <div className={INPUT_FOCUS_WRAPPER}>
                  <label className="text-sm font-medium text-rose-700">💸 Perda com Sucumbência (R$)</label>
                  <NumericFormat
                    value={dadosManuais.perda_sucumbencia || ""}
                    onValueChange={(val) =>
                      setDadosManuais({
                        ...dadosManuais,
                        perda_sucumbencia: val.value,
                      })
                    }
                    thousandSeparator="."
                    decimalSeparator="," 
                    prefix="R$ "
                    allowNegative={false}
                    placeholder="R$ 0,00"
                    className="w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-right transition-all duration-200 focus:border-rose-500 focus:shadow-lg focus:outline-none"
                  />
                </div>

                <div className="rounded-2xl border border-rose-100 bg-white/80 p-3 text-sm text-rose-700">
                  Processo Perdido com sentença desfavorável.
                </div>

                {dadosManuais.tipo_justica === "Justiça Comum" ? (
                  <div className={INPUT_FOCUS_WRAPPER}>
                    <label className="text-sm font-medium text-rose-700">💼 Valor de Custas a Pagar</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="w-full rounded-2xl border border-rose-200 bg-white px-3 py-2 text-sm text-right transition-all duration-200 focus:border-rose-500 focus:shadow-lg focus:outline-none"
                      placeholder="0,00"
                    />
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">Juizado Especial: não há custas.</div>
                )}
              </div>
            )}
          </div>
        </div>

        </div>

      {etapa === "analise" && (
        <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} space-y-6`}>
          <div className="w-full max-w-7xl mx-auto px-4">
            <div className="w-full bg-blue-50 border border-blue-300 rounded-lg p-4 shadow space-y-6 text-xs text-gray-800">

              <h2 className="text-blue-800 font-semibold text-lg">📝 Análise Completa</h2>

              <div>
                <h3 className="text-gray-700 font-semibold text-sm mb-2">📄 Dados do Consorciado</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  <div className="md:col-span-3">
                    <label className={REQUIRED_LABEL_CLASS}>👤 Nome completo</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.nome_cliente}
                      onChange={(e) =>
                        setDadosBasicos({ ...dadosBasicos, nome_cliente: e.target.value })
                      }
                    />
                  </div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🌎 Nacionalidade</label>
                    <select
                      data-obrigatorio
                      className="border p-1 rounded w-full text-sm"
                      value={dadosBasicos.nacionalidade || ""}
                      onChange={(e) =>
                        setDadosBasicos({ ...dadosBasicos, nacionalidade: e.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="Brasileiro">Brasileiro</option>
                      <option value="Brasileira">Brasileira</option>
                      <option value="Brasileiro Trans">Brasileiro Trans</option>
                      <option value="Brasileira Trans">Brasileira Trans</option>
                      <option value="Não-binário">Não-binário</option>
                      <option value="Outro">Outro</option></select></div>

                  <div>
                    <label htmlFor="cpf_cnpj" className={`${REQUIRED_LABEL_CLASS} mb-1`}>🆔 CPF/CNPJ</label>
                    <input
                      data-obrigatorio
                      type="text"
                      id="cpf_cnpj"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.cpf_cnpj}
                      onChange={(e) =>
                        setDadosBasicos({
                          ...dadosBasicos,
                          cpf_cnpj: aplicarMascara("cpf_cnpj", e.target.value),
                        })
                      }
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📑 Tipo Documento</label>
                    <select
                      data-obrigatorio
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.tipo_documento}
                      onChange={(e) =>
                        setDadosBasicos({ ...dadosBasicos, tipo_documento: e.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option></select></div>

                  <div className="md:col-span-2">
                    <label className={REQUIRED_LABEL_CLASS}>🏠 Rua</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.rua}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, rua: e.target.value })}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🔢 Número</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.numero || ""}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, numero: e.target.value })}
                    /></div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-600">🏢 Complemento (opcional)</label>
                    <input
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.complemento || ""}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, complemento: e.target.value })}
                    /></div>
                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🏘️ Bairro</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.bairro}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, bairro: e.target.value })}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🏙️ Cidade</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.cidade}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, cidade: e.target.value })}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🌎 Estado</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.estado}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, estado: e.target.value })}
                    /></div>

                  <div>
                    <label htmlFor="cep" className={`${REQUIRED_LABEL_CLASS} mb-1`}>📮 CEP</label>
                    <input
                      data-obrigatorio
                      type="text"
                      id="cep"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.cep}
                      onChange={(e) => {
                        const cepMascarado = aplicarMascara("cep", e.target.value);
                        setDadosBasicos({ ...dadosBasicos, cep: cepMascarado });

                        if (cepMascarado.replace(/\D/g, "").length === 8) {
                          fetch(`https://viacep.com.br/ws/${cepMascarado.replace(/\D/g, "")}/json/`)
                            .then((res) => res.json())
                            .then((data) => {
                              if (!data.erro) {
                                setDadosBasicos((prev) => ({
                                  ...prev,
                                  rua: data.logradouro || prev.rua,
                                  bairro: data.bairro || prev.bairro,
                                  cidade: data.localidade || prev.cidade,
                                  estado: data.uf || prev.estado,
                                }));
                              }
                            })
                            .catch((error) => {
                              console.error("Erro ao buscar CEP:", error);
                            });
                        }
                      }}
                      placeholder="00000-000"
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📞 Telefone do cliente</label>
                    <PatternFormat
                      format="(##) #####-####"
                      mask="_"
                      value={dadosManuais.telefone}
                      onValueChange={(val) =>
                        setDadosManuais((prev) => ({
                          ...prev,
                          telefone: val.value,
                        }))
                      }
                      className={`border p-1 rounded w-full ${dadosManuais.telefone?.replace(/\D/g, "").length === 11
                        ? ""
                        : "border-red-500 focus:border-red-500 focus:ring-red-500"
                        }`}
                      placeholder="(31) 91234-5678"
                      data-obrigatorio
                    /></div>
                  <div>
                    <label className={emailClienteHabilitado ? REQUIRED_LABEL_CLASS : "block text-sm font-medium text-slate-600"}>📧 E-mail do cliente</label>
                    <input
                      type="email"
                      value={emailCliente}
                      onChange={(e) => {
                        setEmailCliente(e.target.value);
                        setEmailInvalido(false);
                      }}
                      onBlur={() => {
                        if (emailClienteHabilitado) {
                          const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailCliente);
                          setEmailInvalido(!valido);
                        }
                      }}
                      className={`border p-1 rounded w-full ${emailClienteHabilitado && (emailInvalido || emailCliente === "")
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                        : ""
                        }`}
                      placeholder="cliente@email.com"
                      disabled={!emailClienteHabilitado}
                      {...(emailClienteHabilitado ? { "data-obrigatorio": true } : {})}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🧾 Nº Contrato</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.numero_contrato}
                      onChange={(e) => handleCampoChange('numero_contrato', e.target.value)}
                    /></div>
                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📌 Grupo</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.grupo}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, grupo: e.target.value })}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📌 Cota</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.cota}
                      onChange={(e) => setDadosBasicos({ ...dadosBasicos, cota: e.target.value })}
                    /></div>

                  <div className="md:col-span-2">
                    <label className={REQUIRED_LABEL_CLASS}>🏢 Administradora</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.administradora}
                      onChange={(e) => handleCampoChange('administradora', e.target.value)}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🔢 CNPJ da Administradora</label>
                    <input
                      data-obrigatorio
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.cnpj_administradora}
                      onChange={(e) => handleCampoChange('cnpj_administradora', e.target.value)}
                    /></div></div></div>

              <div className="mt-6">
                <h3 className="text-gray-700 font-semibold text-sm mb-1">💰 Informações Financeiras</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📅 Total Parcelas Plano</label>
                    <input
                      data-obrigatorio
                      type="number"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.total_parcelas_plano}
                      onChange={(e) =>
                        setDadosBasicos({ ...dadosBasicos, total_parcelas_plano: Number(e.target.value) })
                      }
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📦 Parcelas Pagas</label>
                    <input
                      data-obrigatorio
                      type="number"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100"
                      value={parcelasRealmentePagas}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📆 Encerramento</label>
                    <input
                      data-obrigatorio
                      type="date"
                      className="border p-1 rounded w-full"
                      value={converterParaInputDate(dadosBasicos.data_encerramento)}
                      onChange={(e) =>
                        setDadosBasicos({ ...dadosBasicos, data_encerramento: e.target.value })
                      }
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>💰 Valor Pago Extrato</label>
                    <input
                      data-obrigatorio
                      type="text"
                      inputMode="numeric"
                      className="border p-1 rounded w-full"
                      value={formatarReais(dadosBasicos.valor_total_pago_extrato)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        const valor = parseFloat(raw) / 100;
                        setDadosBasicos({ ...dadosBasicos, valor_total_pago_extrato: isNaN(valor) ? 0 : valor });
                      }}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>💳 Valor do Crédito</label>
                    <input
                      data-obrigatorio
                      type="text"
                      inputMode="numeric"
                      className="border p-1 rounded w-full"
                      value={formatarReais(dadosBasicos.valor_credito || 0)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        const valor = parseFloat(raw) / 100;
                        setDadosBasicos({ ...dadosBasicos, valor_credito: isNaN(valor) ? 0 : valor });
                      }}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>➕ Soma Pagamentos</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100"
                      value={formatarReais(soma)}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>🔻 Diferença</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className={`border p-1 rounded w-full bg-gray-100 ${diferenca !== 0 ? "text-red-600 font-bold" : ""}`}
                      value={formatarReais(diferenca)}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📉 Taxa Adm. Contratada (%)</label>
                    <input
                      data-obrigatorio
                      type="number"
                      step="0.0001"
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.taxa_adm_percentual || ""}
                      onChange={(e) => {
                        const valor = parseFloat(e.target.value.replace(",", "."));
                        setDadosBasicos({ ...dadosBasicos, taxa_adm_percentual: isNaN(valor) ? 0 : valor });
                      }}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>✅ Taxa Adm. Devida (%)</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100"
                      value={
                        typeof resultadoTaxaAdmDevidaPercentual === "number"
                          ? `${resultadoTaxaAdmDevidaPercentual.toFixed(4)}%`
                          : "0.0000%"
                      }
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>💸 Valor Total Taxa Adm. Cobrada</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100 font-semibold"
                      value={formatarReais(dadosBasicos.taxa_adm_cobrada_valor || 0)}
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>📊 Percentual Cobrada (calculado)</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100"
                      value={
                        dadosBasicos.percentual_taxa_adm_cobrada
                          ? `${(dadosBasicos.percentual_taxa_adm_cobrada).toFixed(4)}%`
                          : "0.0000%"
                      }
                    /></div>

                  <div>
                    <label className={REQUIRED_LABEL_CLASS}>✅ Valor Taxa Adm. Devida (R$)</label>
                    <input
                      data-obrigatorio
                      type="text"
                      disabled
                      className="border p-1 rounded w-full bg-gray-100"
                      value={formatarReais(resultadoTaxaAdmDevidaValor ?? 0)}
                    /></div></div>
                <button
                  onClick={() => setEtapa("ajuste")}
                  className="mt-4 px-4 py-2 rounded-lg bg-gray-700 text-white font-medium hover:bg-gray-800 transition shadow-sm"
                >
                  ✏️ Editar Extrato
                </button></div>

<div className="w-full lg:w-2/3">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">

    {/* CARD — Valor da causa (mesma altura) */}
  <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} space-y-4 h-full`}>
      <div className="mt-0">
        <h2 className="text-md font-semibold text-gray-700 mb-2">📌 Valor da Causa</h2>
        {!ehAdvogado && (
          <p className="text-sm text-gray-600 mb-2">
            Somente o advogado pode escolher o valor da causa. Os cartões estão desabilitados.
          </p>
        )}

        <div
          className={`rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md p-4 border shadow-sm ${!ehAdvogado ? "opacity-60 cursor-not-allowed" : ""} ${valorSelecionado === "valor_pago_extrato" ? "bg-blue-200 border-blue-500" : "bg-blue-100 border-blue-300"}`}
          title={undefined}
          onClick={undefined}
        >
          <label className="text-sm font-medium text-gray-600 block mb-1">
            💵 Valor Pago no Extrato (R$)
          </label>
          <p className="text-xl font-bold text-blue-800">
            R$ {formatarReais(dadosBasicos.valor_total_pago_extrato)}
          </p>
          {valorSelecionado === "valor_pago_extrato" && (
            <p className="text-xs mt-1 text-blue-900">Valor da causa selecionado</p>
          )}
        </div>
      </div>
    </section>

    {/* CARD — Arquivos do Extrato (mesma altura) */}
    {hasExtratoId && (ehAdvogado || papel === "gerente" || papel === "admin") && (
      <div className="bg-white shadow p-4 rounded-lg border border-gray-200 w-full h-full flex flex-col justify-between">
        <div>
          <h2 className="font-semibold text-lg text-gray-800 mb-2">📦 Arquivos do Extrato</h2>
          <p className="text-sm text-gray-600 mb-4">
            Baixe, em um único .zip, os anexos, documentos gerados e o próprio extrato.
          </p>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={handleBaixarArquivosExtrato}
            className="inline-flex items-center justify-center w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-600"
            data-btn-download-anexos
          >
            ⬇️ Baixar anexos e extratos (.zip)
          </button>
        </div>
      </div>
    )}

  </div>
</div>


              <div className="col-span-full mt-4">
                <h4 className="text-gray-700 font-semibold text-sm mb-1">📌 Valores Adicionais Detectados</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

                  <div>
                    <label>💼 Fundo Comum</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.fundo_comum ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, fundo_comum: val.floatValue ?? 0 })
                      }
                    /></div>


                  <div>
                    <label>🏦 Fundo de Reserva</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.fundo_reserva ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, fundo_reserva: val.floatValue ?? 0 })
                      }
                    /></div>

                  <div>
                    <label>🛡️ Seguros</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.seguros ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, seguros: val.floatValue ?? 0 })
                      }
                    /></div>

                  <div>
                    <label>⚠️ Multas</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.multas ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, multas: val.floatValue ?? 0 })
                      }
                    /></div>

                  <div>
                    <label>📈 Juros</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.juros ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, juros: val.floatValue ?? 0 })
                      }
                    /></div>

                  <div>
                    <label>📝 Adesão</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.adesao ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, adesao: val.floatValue ?? 0 })
                      }
                    /></div>

                  <div>
                    <label>🔍 Outros Valores</label>
                    <NumericFormat
                      className="border p-1 rounded w-full"
                      value={dadosBasicos.outros_valores ?? ""}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        setDadosBasicos({ ...dadosBasicos, outros_valores: val.floatValue ?? 0 })
                      }
                    /></div></div></div>

              <div>
                <h3 className="text-gray-700 font-semibold text-sm mb-1">⚖️ Dados do Processo</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="col-span-2 sm:col-span-3 md:col-span-4">
{false && (
                      <div className="col-span-full border border-yellow-400 rounded p-3 bg-yellow-50 space-y-2 mt-2">
                        <h4 className="font-semibold text-yellow-800">💰 Custas Processuais</h4>

                        {custasProcessuais.map((c, idx) => (
                          <div key={c.id || `custa-legacy-${idx}`} className="flex flex-wrap gap-2 items-center">
                            <input
                              type="date"
                              value={c.data}
                              onChange={(e) =>
                                setCustasProcessuais((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, data: e.target.value } : item
                                  )
                                )
                              }
                              className="border p-1 rounded"
                              disabled={!ehAdvogado}
                            />
                            <NumericFormat
                              value={c.valor}
                              thousandSeparator="."
                              decimalSeparator=","
                              prefix="R$ "
                              decimalScale={2}
                              fixedDecimalScale
                              allowNegative={false}
                              onValueChange={(val) =>
                                setCustasProcessuais((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, valor: val.floatValue ?? 0 } : item
                                  )
                                )
                              }
                              className="border p-1 rounded w-32"
                              disabled={!ehAdvogado}
                            />
                            <input
                              type="text"
                              placeholder="Descrição (opcional)"
                              className="border p-1 rounded flex-1"
                              value={c.descricao || ""}
                              onChange={(e) =>
                                setCustasProcessuais((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, descricao: e.target.value } : item
                                  )
                                )
                              }
                              disabled={!ehAdvogado}
                            />
                            <button
                              onClick={() =>
                                setCustasProcessuais((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-600 font-bold ml-2"
                              disabled={!ehAdvogado}
                            >
                              ❌
                            </button></div>
                        ))}

                        <button
                          onClick={() =>
                            setCustasProcessuais((prev) => [
                              ...prev,
                              { id: `custa-${Date.now()}-${Math.random()}`, data: "", valor: 0, descricao: "" },
                            ])
                          }
                          className="text-sm text-blue-700 hover:underline"
                          disabled={!ehAdvogado}
                        >
                          ➕ Adicionar Custa
                        </button></div>
                    )}
                  </div>

                  <div>
                    <label>⚖️ Tipo de Justiça</label>
                    <select
                      data-obrigatorio
                      className="border p-1 rounded w-full"
                      value={dadosManuais.tipo_justica || "Juizado Especial"}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, tipo_justica: e.target.value })
                      }
                    >
                      <option value="Juizado Especial">Juizado Especial</option>
                      <option value="Justiça Comum">Justiça Comum</option></select></div>
                  <div>
                    <label>📅 Início dos Juros</label>
                    <input
                      type="date"
                      className="border p-1 rounded w-full"
                      value={dadosManuais.data_inicio_juros}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, data_inicio_juros: e.target.value })
                      }
                    /></div>
                  <div>
                    <label>📈 Taxa de Juros (%)</label>
                    <input
                      type="number"
                      className="border p-1 rounded w-full"
                      value={dadosManuais.taxa_juros_percentual}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, taxa_juros_percentual: e.target.value })
                      }
                    /></div>
                  <div>
                    <label>💼 % de Honorários</label>
                    <input
                      data-obrigatorio
                      type="number"
                      className="border p-1 rounded w-full"
                      value={dadosManuais.honorarios_percentual}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, honorarios_percentual: e.target.value })
                      }
                      onWheel={(e) => e.currentTarget.blur()}
                    /></div>
                  <div>
                    <label>📁 Nº do Processo</label>
                    <input
                      type="text"
                      className="border p-1 rounded w-full"
                      value={formatarNumeroProcesso(dadosManuais.numero_processo)}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, numero_processo: e.target.value })
                      }
                    /></div>
                  <div>
                    <label>🧑‍⚖️ Magistrado</label>
                    <input
                      type="text"
                      className="border p-1 rounded w-full"
                      value={dadosManuais.magistrado}
                      onChange={(e) =>
                        setDadosManuais({ ...dadosManuais, magistrado: e.target.value })
                      }
                    /></div></div>



                <div className="md:col-span-4">
                  <label className="block text-sm font-semibold text-gray-800 mt-3">
                    📝 Observações
                  </label>
                  <textarea
                    className="border p-2 rounded w-full h-24 resize-none"
                    placeholder="Observações gerais sobre o processo"
                    value={dadosManuais.observacoes || ""}
                    onChange={(e) =>
                      setDadosManuais((prev: any) => ({
                        ...prev,
                        observacoes: e.target.value,
                      }))
                    }
                  /></div></div>
              <div className="col-span-full mt-6">
                <h3 className="text-sm font-semibold text-gray-800 mb-2">🏷️ Selecione a Comarca</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className={`${getCorComarcaPeloTexto(
                      dadosBasicos.comarca_cliente,
                      comarcaSelecionada === "cliente",
                      comarcaSelecionada !== null
                    )}transition-all duration-200 hover:scale-[1.01] shadow-md p-4 rounded-xl cursor-pointer`}
                    onClick={() => {
                      setComarcaSelecionada((prevSel) => {
                        const next = prevSel === "cliente" ? null : "cliente";
                        setDadosManuais((prev) => ({
                          ...prev,
                          comarca_escolhida:
                            next === "cliente"
                              ? limparComarcaTexto(dadosBasicos.comarca_cliente)
                              : "",
                        }));
                        return next;
                      });
                    }}
                  >
                    <label className="block font-semibold text-sm text-black">
                      🏠 Comarca do Cliente
                    </label>
                    <input
                      type="text"
                      className="border p-1 rounded w-full mt-1 bg-white cursor-text uppercase"
                      defaultValue={formatarComarca(dadosBasicos.comarca_cliente) || ""}
                      onInput={(e) => {
                        // Converte para maiúsculas em tempo real
                        const target = e.target as HTMLInputElement;
                        target.value = target.value.toUpperCase();
                      }}
                      onFocus={() => {
                        // 🔧 CORREÇÃO: Seleciona automaticamente ao focar no campo
                        if (comarcaSelecionada !== "cliente") {
                          setComarcaSelecionada("cliente");
                        }
                      }}
                      onBlur={(e) => {
                        // Aplica máscara ao sair do campo
                        const valorFormatado = aplicarMascaraComarca(e.target.value);
                        setDadosBasicos({ ...dadosBasicos, comarca_cliente: valorFormatado });
                        // 🔧 CORREÇÃO: Atualiza comarca_escolhida sempre que o campo tem valor
                        if (valorFormatado.trim()) {
                          setDadosManuais((prev) => ({
                            ...prev,
                            comarca_escolhida: limparComarcaTexto(valorFormatado)
                          }));
                        }
                      }}
                      onKeyDown={(e) => {
                        // Garante que espaço funciona
                        if (e.key === ' ') {
                          e.stopPropagation();
                        }
                      }}
                      onClick={(e) => {
                        // Impede propagação do click para o div pai para permitir edição
                        e.stopPropagation();
                      }}
                      placeholder="Ex: CONTAGEM - MG"
                    />
                    {comarcaSelecionada === "cliente" && (
                      <div className="mt-2 text-sm text-black font-medium">✅ Comarca Selecionada</div>
                    )}
                  </div>

                  <div
                    className={`${getCorComarcaPeloTexto(
                      dadosBasicos.comarca_administradora,
                      comarcaSelecionada === "administradora",
                      comarcaSelecionada !== null
                    )} transition-all duration-200 hover:scale-[1.01] shadow-md p-4 rounded-xl cursor-pointer`}
                    onClick={() => {
                      setComarcaSelecionada((prevSel) => {
                        const next = prevSel === "administradora" ? null : "administradora";
                        setDadosManuais((prev) => ({
                          ...prev,
                          comarca_escolhida:
                            next === "administradora"
                              ? limparComarcaTexto(dadosBasicos.comarca_administradora)
                              : "",
                        }));
                        return next;
                      });
                    }}
                  >
                    <label className="block font-semibold text-sm text-black">🏢 Comarca da Administradora</label>
                    <input
                      type="text"
                      className="border p-1 rounded w-full mt-1 bg-white cursor-text uppercase"
                      defaultValue={formatarComarca(dadosBasicos.comarca_administradora) || ""}
                      onInput={(e) => {
                        // Converte para maiúsculas em tempo real
                        const target = e.target as HTMLInputElement;
                        target.value = target.value.toUpperCase();
                      }}
                      onFocus={() => {
                        // 🔧 CORREÇÃO: Seleciona automaticamente ao focar no campo
                        if (comarcaSelecionada !== "administradora") {
                          setComarcaSelecionada("administradora");
                        }
                      }}
                      onBlur={(e) => {
                        // Aplica máscara ao sair do campo
                        const valorFormatado = aplicarMascaraComarca(e.target.value);
                        setDadosBasicos({ ...dadosBasicos, comarca_administradora: valorFormatado });
                        // 🔧 CORREÇÃO: Atualiza comarca_escolhida sempre que o campo tem valor
                        if (valorFormatado.trim()) {
                          setDadosManuais((prev) => ({
                            ...prev,
                            comarca_escolhida: limparComarcaTexto(valorFormatado)
                          }));
                        }
                      }}
                      onKeyDown={(e) => {
                        // Garante que espaço funciona
                        if (e.key === ' ') {
                          e.stopPropagation();
                        }
                      }}
                      onClick={(e) => {
                        // Impede propagação do click para o div pai para permitir edição
                        e.stopPropagation();
                      }}
                      placeholder="Ex: BELO HORIZONTE - MG ou preencha o CNPJ no campo acima"
                    />
                    {comarcaSelecionada === "administradora" && (
                      <div className="mt-2 text-sm text-black font-medium">✅ Comarca Selecionada</div>
                    )}
                  </div></div></div></div></div></section>
      )}

      <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} space-y-6 w-full`}>
        <h3 className="font-semibold">Parcelas</h3>

        <input
          type="search"
          className="border p-2 w-full bg-gray-100 rounded"
          placeholder="Filtrar por data (ex: 2024)"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border border-gray-300 rounded">
            <thead>
              <tr className="bg-gray-100 text-center">
                <th className="p-2 border border-gray-300">📅 Data de Pagamento</th>
                <th className="p-2 border border-gray-300">💵 Valor Pago</th>
                <th className="p-2 border border-gray-300">📈 Corrigido Hoje</th>
                <th className="p-2 border border-gray-300">📈 Corrigido Futuro</th></tr></thead>
            <tbody>
              {parcelasFiltradas.map((p, i) => (
                <tr key={i} className="text-center hover:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-1">
                    {formatarParaBR(p.data_pagamento) || "—"}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {formatarReais(p.valor_pago)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {formatarReais(p.valor_corrigido_hoje || 0)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {formatarReais(p.valor_corrigido_futuro || 0)}
                  </td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-bold text-center">
                <td className="border border-gray-300 px-2 py-1 text-right">Totais:</td>
                <td className="border border-gray-300 px-2 py-1">
                  {formatarReais(
                    parcelasFiltradas.reduce((acc, p) => acc + (p.valor_pago || 0), 0)
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {formatarReais(
                    parcelasFiltradas.reduce((acc, p) => acc + (p.valor_corrigido_hoje || 0), 0)
                  )}
                </td>
                <td className="border border-gray-300 px-2 py-1">
                  {formatarReais(
                    parcelasFiltradas.reduce((acc, p) => acc + (p.valor_corrigido_futuro || 0), 0)
                  )}
                </td></tr></tfoot></table></div></section>

      {etapa === "ajuste" && (
        <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} space-y-5`}>
          <h2 className="font-semibold text-lg">3. Ajustar Parcelas</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">📆 Data</th>
                <th className="text-left py-1">💵 Valor</th>
                <th className="text-left py-1">Tipo</th>
                <th></th></tr></thead>
            <tbody>
              {parcelas.map((p, index) => (
                <tr key={index} className="border-b">
                  <td>
                    <input
                      type="date"
                      className="w-full border px-2 py-1 rounded"
                      value={converterParaInputDate(p.data_pagamento)}
                      onChange={(e) => {
                        const novaData = normalizarData(e.target.value);
                        alterarParcela(index, "data_pagamento", novaData);
                      }}
                    /></td>
                  <td>
                    <NumericFormat
                      className="w-full border px-2 py-1 rounded text-right"
                      value={p.valor_pago}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      onValueChange={(val) =>
                        alterarParcela(index, "valor_pago", val.floatValue?.toString() || "0")
                      }
                    /></td>
                  <td>
                    <select
                      className="w-full"
                      value={p.tipo || "parcela"}
                      onChange={(e) => alterarParcela(index, "tipo", e.target.value)}
                    >
                      <option value="parcela">Parcela</option>
                      <option value="ajuste">Ajuste</option></select></td>
                  <td>
                    <button onClick={() => excluirParcela(index)} className="text-red-500">
                      ❌
                    </button></td></tr>
              ))}
            </tbody></table>

          <div className="flex flex-col sm:flex-row gap-2 items-center">
            <input
              type="date"
              className="border p-1 rounded w-full sm:w-auto"
              value={converterParaInputDate(novaParcela.data_pagamento)}
              onChange={(e) =>
                setNovaParcela({
                  ...novaParcela,
                  data_pagamento: normalizarData(e.target.value),
                })
              }
            />
            <NumericFormat
              className="border p-1 rounded text-right w-full sm:w-auto"
              placeholder="Valor"
              value={novaParcela.valor_pago}
              thousandSeparator="."
              decimalSeparator=","
              prefix="R$ "
              decimalScale={2}
              fixedDecimalScale
              allowNegative={false}
              onValueChange={(val) =>
                setNovaParcela({
                  ...novaParcela,
                  valor_pago: val.floatValue?.toString() || "0",
                })
              }
            />
            <select
              className="border p-1 w-full sm:w-auto"
              value={novaParcela.tipo}
              onChange={(e) => setNovaParcela({ ...novaParcela, tipo: e.target.value })}
            >
              <option value="parcela">Parcela</option>
              <option value="ajuste">Ajuste</option></select>
            <button className="bg-blue-600 text-white px-2 py-1 rounded" onClick={incluirParcela}>
              ➕ Incluir
            </button></div>

          <button
            onClick={() => {
              calcularValores();
              setEtapa("analise");
            }}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded shadow"
          >
            ✅ Salvar e voltar para análise
          </button></section>
      )}

      {etapa === "exportacao" && links.pdf && (
        <section data-card className={`${CARD_BASE_CLASS} ${CARD_PADDING_CLASS} space-y-4`}>
          <h2 className="text-lg font-semibold">✅ Arquivos Gerados</h2>
          <div className="space-y-1">
            <a href={`${API_BASE}/saida/${links.pdf}`} className="underline text-blue-600" target="_blank">📄 PDF</a><br />
            <a href={`${API_BASE}/saida/${links.excel}`} className="underline text-blue-600" target="_blank">📊 Excel</a><br />
            <a href={`${API_BASE}/saida/${links.json}`} className="underline text-blue-600" target="_blank">📄 JSON</a></div>
          <button className="bg-gray-500 text-white px-3 py-2 rounded mt-4" onClick={novaConsulta}>
            🔄 Novo Extrato
          </button></section>
      )}

      {mostrarModal && documentosGerados && (() => {
        // 🔧 CORREÇÃO: Usar advogado do extrato carregado em vez do localStorage quando visualizando extrato existente
        const usuarioAdvogado = dbSnapshot?.advogado_nome 
          ? dbSnapshot.advogado_nome.split(" ")[0].toLowerCase()
          : JSON.parse(localStorage.getItem("advogadoSelecionado") || "{}").usuario || localStorage.getItem("usuarioAdvogado") || "";

        return (
          <ModalDocumentos
            contratoPdf={documentosGerados.contrato_pdf}
            procuracaoPdf={documentosGerados.procuracao_pdf}
            nomeCliente={documentosGerados.nome_cliente}
            telefoneCliente={documentosGerados.telefone_cliente}
            emailCliente={emailCliente}
            usuarioAdvogado={usuarioAdvogado}
            payloadEnvio={documentosGerados?.payloadEnvio}
            onVoltar={() => {
              setMostrarModal(false);
              setEtapa("ajuste");
            }}

            arquivoExtrato={arquivo}
          />
        );
      })()}

      <div
        className="fixed left-0 right-0 px-4 lg:hidden z-40"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <button
          onClick={() => {
            const errosEstado = camposObrigatoriosFaltando(dadosBasicos, dadosManuais, parcelas);
            const errosDOM = verificarCamposObrigatoriosDOM();
            const usuarioPapel = getPerfil();

            const isGerenteOuAdmin = usuarioPapel === "gerente" || usuarioPapel === "admin";
            if (isGerenteOuAdmin && !advogadoSelecionado) {
              alert("⚠️ Por favor, selecione um advogado antes de gerar os documentos.");
              return;
            }

            const erros = [...errosEstado, ...errosDOM];
            if (erros.length > 0) {
              alert("⚠️ Os seguintes campos estão incompletos:\n\n- " + erros.join("\n- "));
              return;
            }
            gerarDocumentosWord();
          }}
          className="w-full py-3 rounded-xl shadow-lg font-semibold whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700"
        >
          📄 Gerar Procuração/Contrato
        </button></div>

      <div 
        className="hidden lg:block fixed top-1/2 -translate-y-1/2 z-40 transition-all duration-300"
        style={mostrarPdfViewer ? { right: 'calc(40vw + 1.5rem)' } : { right: '1.5rem' }}
      >
        <button
          onClick={() => {
            const errosEstado = camposObrigatoriosFaltando(dadosBasicos, dadosManuais, parcelas);
            const errosDOM = verificarCamposObrigatoriosDOM();
            const usuarioPapel = getPerfil();

            const isGerenteOuAdmin = usuarioPapel === "gerente" || usuarioPapel === "admin";
            if (isGerenteOuAdmin && !advogadoSelecionado) {
              alert("⚠️ Por favor, selecione um advogado antes de gerar os documentos.");
              return;
            }

            const erros = [...errosEstado, ...errosDOM];
            if (erros.length > 0) {
              alert("⚠️ Os seguintes campos estão incompletos:\n\n- " + erros.join("\n- "));
              return;
            }
            gerarDocumentosWord();
          }}
          className="px-5 py-3 rounded-xl shadow-lg font-semibold whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700"
        >
          📄 Gerar Procuração/Contrato
        </button>
      </div>

      {/* 👁️ Visualizador de PDF lateral - Responsivo */}
      {mostrarPdfViewer && pdfUrlViewer && (
        <>
          {/* Overlay escuro para mobile */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 sm:hidden"
            onClick={() => setMostrarPdfViewer(false)}
          />
          
          <div
            className="fixed top-0 right-0 h-screen z-50 shadow-2xl border-l border-slate-300 bg-white flex flex-col"
            style={{ width: '40vw' }}
          >
            {/* Header do viewer */}
          <div className="flex items-center justify-between bg-slate-900 text-white px-3 sm:px-4 py-2 sm:py-3">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-semibold text-xs sm:text-sm">Extrato PDF</span>
            </div>
            <button
              onClick={() => setMostrarPdfViewer(false)}
              className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-800 transition-colors"
              title="Fechar visualização"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* PDF iframe */}
          <div className="flex-1 overflow-auto bg-slate-100">
            <iframe
              src={`${pdfUrlViewer}#view=FitH&toolbar=1&navpanes=0&scrollbar=1`}
              className="w-full h-full border-0"
              title="Visualização do Extrato PDF"
              style={{ minHeight: '100%' }}
            />
          </div>

          {/* Footer com info */}
          <div className="bg-slate-50 px-4 py-2 text-xs text-slate-600 border-t border-slate-200">
            <div className="flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Confira os dados enquanto preenche o formulário</span>
            </div>
          </div>
          </div>
        </>
      )}
    </main>
    <style jsx global>{`
      main[data-enhanced] {
        scroll-behavior: smooth;
      }
      main[data-enhanced] [data-card] {
        border-radius: 1.5rem;
      }
      main[data-enhanced] input,
      main[data-enhanced] select,
      main[data-enhanced] textarea {
        border-radius: 0.9rem;
        border-color: rgba(148, 163, 184, 0.7);
        background-color: rgba(255, 255, 255, 0.95);
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease, font-size 0.2s ease;
      }
      main[data-enhanced] [data-obrigatorio][data-required-state="empty"] {
        border-color: rgba(248, 113, 113, 0.95);
        background: linear-gradient(135deg, rgba(248, 113, 113, 0.18), rgba(255, 255, 255, 0.9));
        box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.35);
      }
      main[data-enhanced] [data-obrigatorio][data-required-state="filled"] {
        border-color: rgba(37, 99, 235, 0.45);
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(255, 255, 255, 0.94));
      }
      main[data-enhanced] input:focus,
      main[data-enhanced] select:focus,
      main[data-enhanced] textarea:focus {
        border-color: #2563eb;
        box-shadow: 0 18px 35px -22px rgba(37, 99, 235, 0.65);
        transform: translateY(-1px) scale(1.02);
        background-color: #fff;
        font-size: 1.04rem;
      }
      main[data-enhanced] [data-obrigatorio][data-required-state="empty"]:focus {
        border-color: #dc2626;
        box-shadow: 0 22px 45px -22px rgba(220, 38, 38, 0.75);
      }
      main[data-enhanced] [data-obrigatorio][data-required-state="filled"]:focus {
        border-color: #1d4ed8;
        box-shadow: 0 20px 40px -22px rgba(29, 78, 216, 0.7);
      }
      main[data-enhanced] label {
        transition: color 0.2s ease;
      }
      main[data-enhanced] .group:focus-within label {
        color: #2563eb;
      }
      @media (max-width: 768px) {
        main[data-enhanced] {
          padding-bottom: 7rem;
        }
        main[data-enhanced] [data-card] {
          padding: 1.5rem;
        }
      }
    `}</style>
    
    {/* 🧠 Componente de mensagens de aprendizado automático */}
    <AprendizadoMensagens 
      mensagens={mensagensAprendizado}
      onRemoverMensagem={removerMensagemAprendizado}
    />
    </>
  );
}
