// @ts-nocheck
"use client";

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation"; // ⬅️ importado

type AnyObj = Record<string, any>;

interface ModalDocumentosProps {
  contratoPdf: string;
  procuracaoPdf: string;
  nomeCliente: string;
  telefoneCliente: string;
  emailCliente: string;
  /** usuário (ex.: "leonardo") – opcional; tenta pegar do localStorage se vier vazio */
  usuarioAdvogado?: string;
  /** Payload completo usado na PRÉ-VISUALIZAÇÃO (placeholders). Reaproveitamos no envio. */
  payloadEnvio?: AnyObj;
  onVoltar: () => void; // mantido por compat, mas não é mais usado

  /** ⬇️ NOVO: arquivo original do extrato, vindo da página principal */
  arquivoExtrato?: File | null;
}

/** Base do backend */
const API_BASE = (
  (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_BACKEND_URL) ||
  (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_API_BASE) ||
  "http://localhost:8000"
).replace(/\/$/, "");

/** ---- util: obter usuário atual para header ---- */
function getUsuarioIdAtual(): number {
  if (typeof window !== "undefined") {
    const v = window.localStorage.getItem("usuarioId");
    if (v && !Number.isNaN(Number(v))) return Number(v);
  }
  return 1;
}

/** ⬇️ NOVO: obter perfil atual (admin/gerente/usuario) */
function getPerfilUsuario(): string {
  if (typeof window === "undefined") return "";
  const direct =
    localStorage.getItem("perfil") ||
    localStorage.getItem("perfilUsuario") ||
    localStorage.getItem("usuarioPerfil") ||
    "";

  if (direct && direct.trim()) return direct.trim().toLowerCase();

  // tenta extrair do JWT (payload base64url)
  const token = localStorage.getItem("token") || localStorage.getItem("jwt") || "";
  if (token.includes(".")) {
    try {
      const [, payload] = token.split(".");
      const json = JSON.parse(
        atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const p = (json?.perfil || json?.role || json?.perfilUsuario || "").toString().toLowerCase();
      return p;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/** Helpers */
function onlyDigits(s: any): string | undefined {
  if (typeof s !== "string") return s;
  const d = s.replace(/\D+/g, "");
  return d || undefined;
}
function asNumber(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const s = v.replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".");
    const f = parseFloat(s);
    return Number.isFinite(f) ? f : undefined;
  }
  return undefined;
}
function asInt(v: any): number | undefined {
  const n = asNumber(v);
  return n !== undefined ? Math.trunc(n) : undefined;
}
function asDateISO(v: any): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return undefined;
}
function pick<T = any>(...vals: T[]): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null && (typeof v !== "string" || v.trim() !== "")) return v;
  }
  return undefined;
}
/** Absolutiza URL relativa (/documentos/...) */
const abs = (u?: string | null) =>
  u ? (u.startsWith("http") ? u : `${API_BASE}${u}`) : null;

/** Levanta campos de endereço vindos de vários formatos. */
function liftEndereco(base: AnyObj) {
  const enderecoRoot = (typeof base.endereco === "object" && base.endereco) || {};
  const extras = (typeof base.extras === "object" && base.extras) || {};
  const enderecoExtras = (typeof extras.endereco === "object" && extras.endereco) || {};

  const rua = pick(
    base.rua,
    enderecoRoot.rua,
    enderecoExtras.rua,
    base.logradouro,
    enderecoRoot.logradouro,
    enderecoExtras.logradouro,
    base.address,
    enderecoRoot.address
  );
  const numero = pick(
    base.numero,
    enderecoRoot.numero,
    enderecoExtras.numero,
    base.numero_endereco,
    enderecoRoot.numero_endereco,
    enderecoExtras.numero_endereco,
    base.num
  );
  const bairro = pick(
    base.bairro,
    enderecoRoot.bairro,
    enderecoExtras.bairro,
    base.bairro_endereco,
    enderecoRoot.bairro_endereco,
    enderecoExtras.bairro_endereco
  );
  const complemento = pick(
    base.complemento,
    enderecoRoot.complemento,
    enderecoExtras.complemento,
    base.compl,
    enderecoRoot.compl,
    enderecoExtras.compl,
    base.complemento_endereco,
    enderecoRoot.complemento_endereco,
    enderecoExtras.complemento_endereco
  );
  const cep = pick(base.cep, enderecoRoot.cep, enderecoExtras.cep);
  const nacionalidade = pick(
    base.nacionalidade,
    enderecoRoot.nacionalidade,
    enderecoExtras.nacionalidade,
    base.nacionalidade_cliente
  );

  return {
    rua,
    numero,
    bairro,
    complemento,
    cep: typeof cep === "string" ? onlyDigits(cep) : cep,
    nacionalidade,
  };
}

/** Mapeia o payload para o schema ExtratoIn do backend. */
function mapToExtratoIn(base: AnyObj): AnyObj {
  const parcelas = Array.isArray(base.parcelas)
    ? base.parcelas.map((p: any) => ({
        numero_parcela: asInt(p.numero_parcela),
        data_pagamento: asDateISO(p.data_pagamento),
        valor_pago: asNumber(p.valor_pago),
        valor_corrigido_hoje: asNumber(p.valor_corrigido_hoje),
        valor_corrigido_futuro: asNumber(p.valor_corrigido_futuro),
        tipo: p.tipo ?? undefined,
      }))
    : undefined;

  const custas = Array.isArray(base.custas)
    ? base.custas.map((c: any) => ({
        data: asDateISO(c.data),
        descricao: c.descricao ?? undefined,
        valor: asNumber(c.valor),
      }))
    : undefined;

  const anexos = Array.isArray(base.anexos)
    ? base.anexos.map((a: any) => ({
        original_name: a.original_name ?? a.nome ?? a.titulo ?? "",
        filename: a.filename ?? a.arquivo ?? "",
        mime_type: a.mime_type ?? a.contentType ?? "application/pdf",
        size: asInt(a.size) ?? 0,
        url_publica: a.url_publica ?? a.url ?? a.link ?? "",
      }))
    : undefined;

  const addr = liftEndereco(base);
  const extras: AnyObj = { ...(base.extras || {}) };

  const out: AnyObj = {
    // obrigatórios
    grupo: base.grupo ?? "",
    cota: base.cota ?? "",
    nome_cliente: base.nome_cliente ?? base.nome ?? "",
    cpf_cnpj: base.cpf_cnpj ?? "",
    tipo_documento: base.tipo_documento ?? "",
    administradora: base.administradora ?? "",
    taxa_adm_percentual: asNumber(base.taxa_adm_percentual),
    total_parcelas_plano: asInt(base.total_parcelas_plano),
    data_encerramento: asDateISO(base.data_encerramento),
    valor_total_pago_extrato: asNumber(base.valor_total_pago_extrato),

    // 11 campos topo
    rua: addr.rua ?? undefined,
    numero: addr.numero ?? undefined,
    bairro: addr.bairro ?? undefined,
    complemento: addr.complemento ?? undefined,
    cep: addr.cep ?? undefined,
    nacionalidade: addr.nacionalidade ?? undefined,
    numero_contrato: base.numero_contrato ?? undefined,
    cnpj_administradora: onlyDigits(base.cnpj_administradora) ?? undefined,
    comarca_escolhida_nome: base.comarca_escolhida_nome ?? base.comarca_escolhida ?? undefined,
    comarca_escolhida_uf: base.comarca_escolhida_uf ?? undefined,
    observacoes: base.observacoes ?? undefined,

    // listas
    parcelas,
    custas,
    anexos,

    // opcionais / snapshots
    telefone: base.telefone ?? undefined,
    email_cliente: base.email_cliente ?? base.email ?? undefined,
    endereco_cliente: base.endereco_cliente ?? undefined,
    cidade_estado_cliente: base.cidade_estado_cliente ?? undefined,
    cidade: base.cidade ?? undefined,
    estado: base.estado ?? undefined,
    advogado: base.advogado ?? undefined,
    numero_processo: base.numero_processo ?? undefined,
    honorarios_percentual: asNumber(base.honorarios_percentual ?? base.percentual_honorarios),
    fase_processo: base.fase_processo ?? undefined,
    nome_magistrado: base.nome_magistrado ?? undefined,
    valor_corrigido_hoje: asNumber(base.valor_corrigido_hoje),
    valor_corrigido_futuro: asNumber(base.valor_futuro),

    parcelas_pagas: asInt(base.parcelas_pagas),
    soma_valores_pagos: asNumber(base.soma_valores_pagos),
    tipo_justica:
      (base.tipo_justica && String(base.tipo_justica).trim().length > 0)
        ? base.tipo_justica
        : (base.dadosManuais?.tipo_justica && String(base.dadosManuais?.tipo_justica).trim().length > 0
            ? base.dadosManuais?.tipo_justica
            : "juizado especial"),
    valor_corrigido_futuro: asNumber(base.valor_corrigido_futuro),

    valor_credito: asNumber(base.valor_credito),
    valor_pago_extrato: asNumber(base.valor_pago_extrato),
    valor_pg_liquido: asNumber(base.valor_pg_liquido),
    fundo_comum: asNumber(base.fundo_comum),
    fundo_reserva: asNumber(base.fundo_reserva),
    seguros: asNumber(base.seguros),
    multas: asNumber(base.multas),
    juros: asNumber(base.juros),
    adesao: asNumber(base.adesao),
    outros_valores: asNumber(base.outros_valores),
    valor_total_taxa_adm_cobrada: asNumber(base.valor_total_taxa_adm_cobrada),
    percentual_cobrada_calculado: asNumber(base.percentual_cobrada_calculado),
    taxa_adm_contratada_percentual: asNumber(base.taxa_adm_contratada_percentual),
    valor_taxa_adm_devida: asNumber(base.valor_taxa_adm_devida),
    diferenca_valores: asNumber(base.diferenca_valores),
    justica_gratuita: base.justica_gratuita ?? undefined,
    inicio_juros: asDateISO(base.inicio_juros),
    taxa_juros_percentual: asNumber(base.taxa_juros_percentual),
    indice_ate_hoje: base.indice_ate_hoje ?? undefined,
    indice_ate_futuro: base.indice_ate_futuro ?? undefined,
    comprovante_renda_url: base.comprovante_renda_url ?? undefined,
    comprovante_endereco_url: base.comprovante_endereco_url ?? undefined,
    documento_identidade_url: base.documento_identidade_url ?? undefined,
    advogado_id: asInt(base.advogado_id),
    advogado_nome: base.advogado_nome ?? undefined,
    advogado_oab: base.advogado_oab ?? undefined,
    advogado_email: base.advogado_email ?? undefined,
    advogado_telefone: base.advogado_telefone ?? undefined,
    comarca_cliente_nome: base.comarca_cliente_nome ?? undefined,
    comarca_cliente_uf: base.comarca_cliente_uf ?? undefined,
    comarca_adm_nome: base.comarca_adm_nome ?? undefined,
    comarca_adm_uf: base.comarca_adm_uf ?? undefined,
    resultado_processo: base.resultado_processo ?? undefined,
    tipo_pagamento: base.tipo_pagamento ?? undefined,
    valor_sentenca: asNumber(base.valor_sentenca),
    ganho_sucumbencia: asNumber(base.ganho_sucumbencia),
    perda_sucumbencia: asNumber(base.perda_sucumbencia),
    honorarios_hoje_adv: asNumber(base.honorarios_hoje_adv),
    honorarios_hoje_emp: asNumber(base.honorarios_hoje_emp),
    honorarios_futuro_adv: asNumber(base.honorarios_futuro_adv),
    honorarios_futuro_emp: asNumber(base.honorarios_futuro_emp),
    liquido_hoje: asNumber(base.liquido_hoje),
    liquido_futuro: asNumber(base.liquido_futuro),
    liquido_corrigido_hoje: asNumber(base.liquido_corrigido_hoje ?? base.liquido_hoje),
    liquido_corrigido_futuro: asNumber(base.liquido_corrigido_futuro ?? base.liquido_futuro),
    prejuizo: asNumber(base.prejuizo),
    valor_causa_opcao: base.valor_causa_opcao ?? undefined,
    valor_causa: asNumber(base.valor_causa),
    valor_diferenca: asNumber(base.valor_diferenca),

    extrato_pdf_url: base.extrato_pdf_url ?? undefined,
    contrato_url: base.contrato_url ?? undefined,
    procuracao_url: base.procuracao_url ?? undefined,
    termo_acordo_pdf_url: base.termo_acordo_pdf_url ?? undefined,
    sentenca_pdf_url: base.sentenca_pdf_url ?? undefined,

    status_documento: base.status_documento ?? undefined,
    zapsign_bundle_id: base.zapsign_bundle_id ?? undefined,
    zapsign_contrato_id: base.zapsign_contrato_id ?? undefined,
    zapsign_procuracao_id: base.zapsign_procuracao_id ?? undefined,
    zapsign_links: base.zapsign_links ?? undefined,
    contrato_assinado_url: base.contrato_assinado_url ?? undefined,
    procuracao_assinada_url: base.procuracao_assinada_url ?? undefined,
    zapsign_signed_files: base.zapsign_signed_files ?? undefined,
    zapsign_status: base.zapsign_status ?? undefined,
    zapsign_signed_at: base.zapsign_signed_at ?? undefined,
    enviado_em: base.enviado_em ?? undefined,

    pagamento_admin_url: base.pagamento_admin_url ?? undefined,
    pagamento_admin_valor: asNumber(base.pagamento_admin_valor),
    pagamento_admin_data: asDateISO(base.pagamento_admin_data),
    pagamento_gerente_url: base.pagamento_gerente_url ?? undefined,
    pagamento_gerente_valor: asNumber(base.pagamento_gerente_valor),
    pagamento_gerente_data: asDateISO(base.pagamento_gerente_data),
    pagamentos: Array.isArray(base.pagamentos) ? base.pagamentos : undefined,

    // extras restantes
    extras: Object.keys(extras).length ? extras : undefined,
  };

  return out;
}

/** Validação mínima dos obrigatórios antes do POST */
function validarObrigatorios(obj: AnyObj): string[] {
  const faltando: string[] = [];
  const req = [
    "grupo",
    "cota",
    "nome_cliente",
    "cpf_cnpj",
    "tipo_documento",
    "administradora",
    "taxa_adm_percentual",
    "total_parcelas_plano",
    "data_encerramento",
    "valor_total_pago_extrato",
  ];
  for (const k of req) {
    const v = obj[k];
    if (v === undefined || v === null || v === "" || (typeof v === "number" && Number.isNaN(v))) {
      faltando.push(k);
    }
  }
  return faltando;
}

/** Pré-validação de formatos comuns (datas/números). */
function preflightFormat(obj: AnyObj): string[] {
  const alerts: string[] = [];
  const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const mustDates = ["data_encerramento"];
  for (const k of mustDates) {
    const v = obj[k];
    if (!isDate(v)) alerts.push(`Campo ${k} deveria ser data "YYYY-MM-DD", veio: ${JSON.stringify(v)}`);
  }
  const nums = ["taxa_adm_percentual", "total_parcelas_plano", "valor_total_pago_extrato"];
  for (const k of nums) {
    const v = obj[k];
    if (typeof v !== "number" || !Number.isFinite(v)) alerts.push(`Campo ${k} deveria ser número, veio: ${JSON.stringify(v)}`);
  }
  return alerts;
}

/** ---- chamadas ao backend para salvar/atualizar extrato ---- */
async function criarExtratoNoBanco(payload: AnyObj): Promise<number> {
  const mapped = mapToExtratoIn(payload);
  console.debug("POST /extratos finalPayload →", mapped);
  const pre = preflightFormat(mapped);
  if (pre.length) console.warn("Pré-validação de formatos:", pre);
  const r = await axios.post(`${API_BASE}/extratos`, mapped, {
    headers: { "X-Usuario-Id": String(getUsuarioIdAtual()) },
  });
  return r.data?.id;
}

async function atualizarExtratoNoBanco(id: number, patch: AnyObj): Promise<void> {
  // 1) pega o extrato completo
  const { data: atual } = await axios.get(`${API_BASE}/extratos/${id}`, {
    headers: { "X-Usuario-Id": String(getUsuarioIdAtual()) },
  });

  // 2) mescla com o patch
  const merged = { ...atual, ...patch };

  // 3) mapeia
  const mapped = mapToExtratoIn(merged);
  console.debug("PUT /extratos merged →", mapped);

  // 4) envia PUT integral
  await axios.put(`${API_BASE}/extratos/${id}`, mapped, {
    headers: { "X-Usuario-Id": String(getUsuarioIdAtual()) },
  });
}

/** Acesso seguro a caminhos profundos */
function deepGet(obj: AnyObj, path: Array<string | number>): any {
  try {
    return path.reduce((acc: any, key: any) => (acc == null ? undefined : acc[key]), obj);
  } catch {
    return undefined;
  }
}
function pickFirstString(...values: any[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** Parser resiliente para links do ZapSign (aceita JSON ou texto/logs) */
function extrairLinksAssinatura(data: any) {
  const urlsEncontradas: string[] = [];
  const coletarUrls = (val: any) => {
    if (!val) return;
    if (typeof val === "string") {
      const urlRegex = /(https?:\/\/[^\s"']+)/g;
      const matches = val.match(urlRegex) || [];
      for (const m of matches) urlsEncontradas.push(m);
    } else if (Array.isArray(val)) {
      val.forEach(coletarUrls);
    } else if (typeof val === "object") {
      for (const k of Object.keys(val)) coletarUrls((val as any)[k]);
    }
  };

  if (typeof data === "string") {
    const zapRegex = /(https?:\/\/(?:\w+\.)?zapsign\.com\.br\/[^\s"']+)/i;
    const m = data.match(zapRegex);
    const linkDireto = m?.[1];
    let linkDeJson: string | undefined;
    try {
      const jsonBloco = data.match(/\{[\s\S]*\}/g)?.[0];
      if (jsonBloco) {
        const obj = JSON.parse(jsonBloco);
        coletarUrls(obj);
        linkDeJson = urlsEncontradas.find(u => /zapsign\.com\.br/i.test(u));
      }
    } catch {}
    const linkUnico = linkDireto || linkDeJson;
    return { linkUnico, linkContrato: undefined, linkProcuracao: undefined };
  }

  const candidatoUnico =
    (data && (data.link_unico || data.link || data.sign_url)) ||
    deepGet(data, ["signers", 0, "sign_url"]) ||
    deepGet(data, ["document", "signers", 0, "sign_url"]) ||
    deepGet(data, ["zapsign_resposta_contrato", "signers", 0, "sign_url"]) ||
    deepGet(data, ["zapsign_resposta", "signers", 0, "sign_url"]);

  const candidatoContrato =
    (data && (data.link_assinatura_contrato)) ||
    deepGet(data, ["contrato", "link"]) ||
    deepGet(data, ["contrato", "sign_url"]) ||
    deepGet(data, ["zapsign_resposta_contrato", "signers", 0, "sign_url"]);

  const candidatoProcuracao =
    (data && (data.link_assinatura_procuracao)) ||
    deepGet(data, ["procuracao", "link"]) ||
    deepGet(data, ["procuracao", "sign_url"]) ||
    deepGet(data, ["zapsign_resposta_anexo", "signers", 0, "sign_url"]);

  let linkUnico = pickFirstString(candidatoUnico);
  let linkContrato = pickFirstString(candidatoContrato);
  let linkProcuracao = pickFirstString(candidatoProcuracao);

  if (!linkUnico && !linkContrato && !linkProcuracao) {
    coletarUrls(data);
    const primeiraZap = urlsEncontradas.find(u => /zapsign\.com\.br/i.test(u));
    if (primeiraZap) linkUnico = primeiraZap;
  }

  return { linkUnico, linkContrato, linkProcuracao };
}

/** ===== Nome do usuário logado (primeiro + último) ===== */
function getNomeUsuarioExibicao(usuarioFinal: string): string {
  let nome =
    (typeof window !== "undefined" &&
      (localStorage.getItem("usuarioNome") ||
        localStorage.getItem("nomeUsuario") ||
        localStorage.getItem("userFullName") ||
        "")) ||
    "";
  if (!nome) nome = usuarioFinal || "";
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return nome || "nós";
}

/** ===== Monta texto do WhatsApp ===== */
function montarTextoWhatsApp(
  nomeCliente: string,
  nomeUsuario: string,
  administradora: string | undefined,
  linkContrato?: string,
  linkProcuracao?: string,
  linkGeral?: string
) {
  let texto =
    `Olá, ${nomeCliente}. Aqui é o ${nomeUsuario}. ` +
    `Segue o link do Contrato e da Procuração para darmos continuidade na ação contra ${administradora || "a administradora"}. ` +
    `Aguardamos a sua assinatura nos documentos para dar entrada no processo.\n\n`;

  if (linkContrato) texto += `Contrato: ${linkContrato}\n`;
  if (linkProcuracao) texto += `Procuração: ${linkProcuracao}\n`;
  if (!linkContrato && !linkProcuracao && linkGeral) texto += `Assinatura: ${linkGeral}\n`;

  return encodeURIComponent(texto);
}

/** ===== Abre WhatsApp com a mensagem ===== */
function abrirWhatsApp(telefone: string, textoEncoded: string) {
  const digits = (telefone || "").replace(/\D+/g, "");
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  const url = `https://wa.me/${full}?text=${textoEncoded}`;

  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) toast("Pop-up bloqueado. Clique no botão para abrir o WhatsApp.", { icon: "💬" });
}

/** ⬇️ NOVO: faz upload do PDF do extrato para /extratos/{id}/pdf (multipart) */
async function uploadExtratoPdf(extratoId: number, arquivo: File, clienteNome?: string) {
  const fd = new FormData();
  fd.append("arquivo", arquivo, arquivo.name || "extrato.pdf");
  if (clienteNome) fd.append("cliente_nome", clienteNome);

  const r = await axios.post(`${API_BASE}/extratos/${extratoId}/pdf`, fd, {
    headers: {
      "X-Usuario-Id": String(getUsuarioIdAtual()),
      // Não setamos Content-Type manualmente; o axios define o boundary do multipart.
    },
  });
  return r?.data;
}

export default function ModalDocumentos({
  contratoPdf,
  procuracaoPdf,
  nomeCliente,
  telefoneCliente,
  emailCliente,
  usuarioAdvogado,
  payloadEnvio,
  onVoltar,
  arquivoExtrato, // ⬅️ NOVO
}: ModalDocumentosProps) {
  const router = useRouter(); // ⬅️ usado para redirecionar o Voltar

  const [enviando, setEnviando] = useState(false);
  const [linkGeral, setLinkGeral] = useState<string>("");
  const [linkContrato, setLinkContrato] = useState<string>("");
  const [linkProcuracao, setLinkProcuracao] = useState<string>("");
  const [activePreview, setActivePreview] = useState<"contrato" | "procuracao">("contrato");

  /** extratoId salvo após POST /extratos */
  const [extratoId, setExtratoId] = useState<number | null>(null);

  /** Resolve usuário do advogado: prop -> localStorage. */
  const usuarioFinal = useMemo(() => {
    if (usuarioAdvogado && usuarioAdvogado.trim()) return usuarioAdvogado.trim();
    if (typeof window === "undefined") return "";
    const lsDireto = localStorage.getItem("usuarioAdvogado") || "";
    if (lsDireto) return lsDireto;
    try {
      const advSel = JSON.parse(localStorage.getItem("advogadoSelecionado") || "{}");
      if (advSel?.usuario) return String(advSel.usuario);
    } catch {}
    return "";
  }, [usuarioAdvogado]);

  /** ⬇️ NOVO: perfil + flag admin */
  const perfilAtual = useMemo(() => getPerfilUsuario(), []);
  const isAdmin = useMemo(() => {
    const p = (perfilAtual || "").toLowerCase();
    return ["admin", "administrador", "administrator", "adm"].includes(p);
  }, [perfilAtual]);

  const copiar = (texto: string) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    toast.success("📎 Link copiado!");
  };

  const contratoSrc = contratoPdf ? `${API_BASE}/documentos/${contratoPdf}` : "";
  const procuracaoSrc = procuracaoPdf ? `${API_BASE}/documentos/${procuracaoPdf}` : "";

  const previewOptions = useMemo(
    () =>
      [
        contratoSrc && { key: "contrato" as const, label: "Contrato", src: contratoSrc },
        procuracaoSrc && { key: "procuracao" as const, label: "Procuração", src: procuracaoSrc },
      ].filter(Boolean) as Array<{ key: "contrato" | "procuracao"; label: string; src: string }>,
    [contratoSrc, procuracaoSrc]
  );
  const desktopCols =
    contratoSrc && procuracaoSrc ? "md:grid-cols-2" : "md:grid-cols-1";

  useEffect(() => {
    if (previewOptions.length && !previewOptions.some((opt) => opt.key === activePreview)) {
      setActivePreview(previewOptions[0].key);
    }
  }, [previewOptions, activePreview]);

  const activeOption =
    previewOptions.find((opt) => opt.key === activePreview) || previewOptions[0];
  const activeSrc = activeOption?.src || "";
  const activeLabel = activeOption?.label || "Documento";

  /** valida mínimos */
  function validarCamposObrigatorios(base: AnyObj): string[] {
    const faltando: string[] = [];
    const req = [
      "grupo",
      "cota",
      "nome_cliente",
      "cpf_cnpj",
      "tipo_documento",
      "administradora",
      "taxa_adm_percentual",
      "total_parcelas_plano",
      "data_encerramento",
      "valor_total_pago_extrato",
    ];
    for (const k of req) {
      const v = base?.[k];
      if (v === undefined || v === null || (typeof v === "string" && !v.trim())) faltando.push(k);
    }
    return faltando;
  }

  /** placeholders DOCX/PDF */
  function formatCPF(s: string | undefined): string | undefined {
    if (!s) return undefined;
    const d = s.replace(/\D+/g, "");
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return s;
  }
  function dataPorExtenso(dt?: Date): string {
    const d = dt || new Date();
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  }
function montarEndereco(base: AnyObj): string | undefined {
  const e = [
    base.rua,
    base.numero ? `nº ${base.numero}` : "",
    base.bairro,
    base.complemento,
    base.cidade && base.estado
      ? `${base.cidade}/${base.estado}`
      : (base.cidade || base.estado || ""),
  ]
    .filter(Boolean)
    .join(", ");
  return e || undefined;
}
  function buildDocPlaceholders(base: AnyObj) {
    const cpf = base.cpf || base.cpf_cnpj;
    const endereco = base.endereco_cliente || montarEndereco(base) || base.cidade_estado_cliente;
    const comarca =
      base.comarca_escolhida ||
      base.comarca_cliente_nome ||
      base.comarca_adm_nome ||
      (base.cidade && base.estado ? `${base.cidade}/${base.estado}` : undefined);
    let perc = base.percentual_honorarios ?? base.honorarios_percentual;
    if (typeof perc === "number") perc = `${String(perc).replace(".", ",")}%`;
    if (typeof perc === "string" && !/%$/.test(perc)) perc = `${perc}%`;

    return {
      cpf: formatCPF(cpf),
      cpf_cnpj: formatCPF(cpf),
      endereco_cliente: endereco,
      comarca_escolhida: comarca,
      comarca_cliente: (base.comarca_cliente || (base.cidade && base.estado ? `${base.cidade}/${base.estado}` : undefined))?.replace(/^COMARCA DE\s*/i, ""),
      comarca_administradora: (base.comarca_administradora || (base.cidade_administradora && base.estado_administradora ? `${base.cidade_administradora}/${base.estado_administradora}` : undefined))?.replace(/^COMARCA DE\s*/i, ""),
      data_contrato: base.data_contrato || dataPorExtenso(),
      data_procuracao: base.data_procuracao || dataPorExtenso(),
      percentual_honorarios: perc,
    };
  }

  /** =========================
   *  Salvar no Banco (somente persistência)
   *  ========================= */
  async function handleSalvarBanco() {
    try {
      setEnviando(true);
      toast.loading("💾 Salvando no banco...");

      const base: AnyObj = { ...(payloadEnvio || {}) };
      base.nome = base.nome || nomeCliente;
      base.telefone = base.telefone || telefoneCliente;
      base.email = base.email || emailCliente;
      base.usuario_advogado = usuarioFinal;
      base.contrato_pdf = base.contrato_pdf || contratoPdf;
      base.procuracao_pdf = base.procuracao_pdf || procuracaoPdf;
      base.nome_cliente = base.nome_cliente || base.nome;

      let idParaUso: number | null = extratoId;

      if (!idParaUso) {
        const faltando = validarCamposObrigatorios(mapToExtratoIn(base));
        if (faltando.length) {
          toast.dismiss();
          toast.error("Preencha os campos obrigatórios antes de salvar: " + faltando.join(", "));
          setEnviando(false);
          return;
        }
        try {
          const novoId = await criarExtratoNoBanco(base);
          idParaUso = novoId;
          setExtratoId(novoId);
          
          // ⬇️ NOVO: Marcar como "salvo" no status_documento
          // Usando nosso endpoint específico mark-salvo
          try {
            await axios.post(`${API_BASE}/uploads/mark-salvo/${novoId}`, {}, {
              headers: { "X-Usuario-Id": String(getUsuarioIdAtual()) }
            });
            console.log("✅ Status marcado como 'salvo' para extrato", novoId);
          } catch (statusErr) {
            console.warn("⚠️ Falha ao marcar status como 'salvo':", statusErr);
          }
          
          toast.dismiss();
          toast.success("✅ Extrato salvo com sucesso!");
        } catch (err: any) {
          toast.dismiss();
          if (err?.response?.status === 409) {
            toast.error("Extrato já cadastrado (grupo + cota).");
          } else if (err?.response?.data?.detail) {
            toast.error(`Erro ao salvar extrato: ${err.response.data.detail}`);
          } else {
            toast.error("Erro ao salvar extrato no banco.");
          }
          setEnviando(false);
          return;
        }
      } else {
        try {
          await atualizarExtratoNoBanco(idParaUso, base);
          
          // ⬇️ NOVO: Marcar como "salvo" no status_documento  
          // Usando nosso endpoint específico mark-salvo
          try {
            await axios.post(`${API_BASE}/uploads/mark-salvo/${idParaUso}`, {}, {
              headers: { "X-Usuario-Id": String(getUsuarioIdAtual()) }
            });
            console.log("✅ Status marcado como 'salvo' para extrato", idParaUso);
          } catch (statusErr) {
            console.warn("⚠️ Falha ao marcar status como 'salvo':", statusErr);
          }
          
          toast.dismiss();
          toast.success("✅ Extrato atualizado com sucesso!");
        } catch (err: any) {
          toast.dismiss();
          const msg = err?.response?.data?.detail || err?.message || "Erro ao atualizar extrato.";
          toast.error(`❌ ${msg}`);
          setEnviando(false);
          return;
        }
      }

      // ⬇️ NOVO: materializa o PDF do extrato na pasta app/storage/Extrato/{id}/...
      if (idParaUso && arquivoExtrato instanceof File) {
        try {
          toast.loading("⬆️ Enviando PDF do extrato para o servidor...");
          await uploadExtratoPdf(idParaUso, arquivoExtrato, base?.nome_cliente || nomeCliente);
          toast.dismiss();
          toast.success("📄 Extrato salvo em storage com sucesso!");
        } catch (e: any) {
          toast.dismiss();
          const m = e?.response?.data?.detail || e?.message || "Falha ao enviar PDF do extrato.";
          toast.error(`⚠️ ${m}`);
        }
      } else if (idParaUso && !arquivoExtrato) {
        // Não bloqueia – apenas informa
        toast("ℹ️ Extrato foi salvo no banco, mas o PDF não estava em memória para upload.", {
          icon: "ℹ️",
        });
      }
    } catch (err: any) {
      toast.dismiss();
      console.error("❌ Erro ao salvar no banco:", err);
      const msg = err?.response?.data?.detail || err?.message || "Erro desconhecido.";
      toast.error(`❌ ${msg}`);
    } finally {
      setEnviando(false);
    }
  }

  /** Enviar para assinatura + WhatsApp */
  async function handleEnviar() {
    try {
      if (!usuarioFinal) {
        alert("Informe o usuário do advogado (não encontrado).");
        return;
      }

      setEnviando(true);
      toast.loading("📤 Enviando documento para assinatura...");

      // Base dos dados que foram para a PRÉVIA (placeholders)
      const base: AnyObj = { ...(payloadEnvio || {}) };
      base.nome = base.nome || nomeCliente;
      base.telefone = base.telefone || telefoneCliente;
      base.email = base.email || emailCliente;
      base.usuario_advogado = usuarioFinal;
      base.contrato_pdf = contratoPdf;
      base.procuracao_pdf = procuracaoPdf;
      base.nome_cliente = base.nome_cliente || base.nome;
      base.telefone = base.telefone || telefoneCliente;

      // placeholders calculados ANTES de enviar
      const ph = buildDocPlaceholders(base);
      const enriched = { ...base, ...ph, placeholders: ph };

      let idParaUso: number | null = extratoId;

      // cria extrato (se necessário)
      if (!idParaUso) {
        const faltando = validarCamposObrigatorios(mapToExtratoIn(enriched));
        if (faltando.length) {
          toast.dismiss();
          toast.error("Preencha os campos obrigatórios antes de salvar: " + faltando.join(", "));
          setEnviando(false);
          return;
        }
        try {
          const novoId = await criarExtratoNoBanco(enriched);
          idParaUso = novoId;
          setExtratoId(novoId);
        } catch (err: any) {
          toast.dismiss();
          if (err?.response?.status === 409) {
            toast.error("Extrato já cadastrado (grupo + cota).");
          } else if (err?.response?.data?.detail) {
            toast.error(`Erro ao salvar extrato: ${err.response.data.detail}`);
          } else {
            toast.error("Erro ao salvar extrato no banco.");
          }
          setEnviando(false);
          return;
        }
      }

      // ⬇️ NOVO: materializa o PDF ANTES de gerar documentos/assinatura
      if (idParaUso && arquivoExtrato instanceof File) {
        try {
          toast.loading("⬆️ Enviando PDF do extrato para o servidor...");
          await uploadExtratoPdf(idParaUso, arquivoExtrato, enriched?.nome_cliente || nomeCliente);
          toast.dismiss();
          toast.success("📄 Extrato salvo em storage!");
        } catch (e: any) {
          toast.dismiss();
          const m = e?.response?.data?.detail || e?.message || "Falha ao enviar PDF do extrato.";
          toast.error(`⚠️ ${m}`);
          // Não retorna; segue com geração — mas você pode escolher bloquear aqui se preferir.
        }
      } else if (idParaUso && !arquivoExtrato) {
        toast("ℹ️ Prosseguindo sem reenvio do PDF do extrato (arquivo não está em memória).", {
          icon: "ℹ️",
        });
      }

      // Envia ao backend para gerar + encaminhar ao ZapSign
      const resp = await axios.post(
        `${API_BASE}/gerar-documentos`,
        { ...enriched, extrato_id: idParaUso || undefined },
        {
          headers: {
            "X-Usuario-Id": String(getUsuarioIdAtual()),
            Accept: "application/json, text/plain, */*",
          },
        }
      );

      toast.dismiss();

      let data: any = resp?.data !== undefined ? resp.data : undefined;
      if (data == null) {
        // @ts-ignore
        const texto = resp?.request?.responseText;
        if (typeof texto === "string" && texto.length > 0) data = texto;
      }

      // UI: extrai links para mostrar/cópia
      const { linkUnico, linkContrato, linkProcuracao } = extrairLinksAssinatura(data);
      if (linkUnico || linkContrato || linkProcuracao) {
        setLinkGeral(linkUnico || "");
        setLinkContrato(linkContrato || "");
        setLinkProcuracao(linkProcuracao || "");
        toast.success("✅ Documentos enviados com sucesso!");

        // WhatsApp
        const nomeUsuario = getNomeUsuarioExibicao(usuarioFinal);
        const textoEncoded = montarTextoWhatsApp(
          nomeCliente,
          nomeUsuario,
          enriched?.administradora,
          linkContrato || undefined,
          linkProcuracao || undefined,
          linkUnico || undefined
        );
        abrirWhatsApp(telefoneCliente || enriched?.telefone || "", textoEncoded);
      } else {
        console.warn("⚠️ Resposta sem link claro. Payload recebido:", data);
        toast("⚠️ Enviado, mas sem link na resposta. Verifique no ZapSign.", { icon: "⚠️" });
      }

      // === PERSISTÊNCIA CRÍTICA PARA O WEBHOOK/ARMAZENAMENTO ===
      try {
        if (idParaUso) {
          const gd = data || {};
          const la = gd?.link_assinatura || {};
          const raw = la?.raw || {};
          const create = raw?.create || {};
          const uploadExtra = raw?.upload_extra || {};

          // IDs do ZapSign com fallbacks
          const contratoId =
            la?.contrato_id ||
            create?.token ||
            create?.document_token ||
            null;

          const procuracaoId =
            la?.procuracao_id ||
            uploadExtra?.token ||
            null;

          const bundleId = la?.bundle_id ?? null;

          // link principal
          const principal =
            (la?.links && la.links.principal) ||
            (Array.isArray(create?.signers) && create.signers[0]?.sign_url) ||
            linkUnico ||
            null;

          // URLs dos PDFs gerados
          const contratoUrl =
            abs(gd?.url_contrato) ||
            (gd?.contrato_pdf ? abs(`/documentos/${gd.contrato_pdf}`) : null);

          const procuracaoUrl =
            abs(gd?.url_procuracao) ||
            (gd?.procuracao_pdf ? abs(`/documentos/${gd.procuracao_pdf}`) : null);

          const agoraIso = new Date().toISOString();
          const patch = {
            status_documento: "enviado",
            zapsign_status: "enviado",
            zapsign_bundle_id: bundleId,
            zapsign_contrato_id: contratoId,
            zapsign_procuracao_id: procuracaoId,
            zapsign_links: { principal, contrato: null, procuracao: null },
            contrato_url: contratoUrl,
            procuracao_url: procuracaoUrl,
            enviado_em: agoraIso,
          };

          console.debug("PATCH persistência crítica →", patch);
          await atualizarExtratoNoBanco(idParaUso, patch);
        }
      } catch (e) {
        console.warn("Falha ao atualizar extrato após envio:", e);
      }
    } catch (err: any) {
      toast.dismiss();
      console.error("❌ Erro ao enviar documentos:", err);
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Erro desconhecido ao enviar documentos.";
      toast.error(`❌ ${msg}`);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4 overflow-auto"
      style={{ width: "100vw", height: "100vh" }}
    >
      <h2 className="text-white text-3xl font-semibold mb-6 underline">
        📄 Documentos Gerados
      </h2>

      <div className="w-full max-w-[95vw] space-y-6">
        {/* Controles mobile */}
        {previewOptions.length > 0 && (
          <div className="md:hidden">
            {previewOptions.length > 1 && (
              <div className="flex items-center justify-center">
                <div className="inline-flex rounded-full bg-white/10 p-1 shadow-inner border border-white/20 backdrop-blur">
                  {previewOptions.map((opt) => {
                    const isActive = activePreview === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setActivePreview(opt.key)}
                        className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
                          isActive
                            ? "bg-white text-slate-900 shadow"
                            : "text-white/80 hover:text-white"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 bg-white/95 rounded-xl shadow-xl border border-slate-200 overflow-hidden">
              <h3 className="text-gray-700 font-semibold text-center py-3 bg-gray-100 text-lg">
                {activeLabel}
              </h3>
              {activeSrc ? (
                <iframe
                  src={activeSrc}
                  className="w-full h-[70vh] border-0"
                  title={`Pré-visualização ${activeLabel}`}
                  loading="lazy"
                />
              ) : (
                <div className="h-[50vh] flex items-center justify-center text-sm text-slate-500">
                  Documento não disponível.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Desktop previews - LADO A LADO EM TELA GRANDE */}
        <div className={`hidden md:grid ${desktopCols} gap-4`}>
          {contratoSrc && (
            <div className="flex flex-col bg-white/95 rounded-xl border border-slate-200 shadow-xl overflow-hidden">
              <h3 className="text-gray-700 font-semibold text-center py-2 bg-gray-100 text-base">
                📄 Contrato
              </h3>
              <iframe
                src={contratoSrc}
                className="w-full border-0"
                style={{ height: "calc(100vh - 220px)" }}
                title="Contrato"
                loading="lazy"
              />
            </div>
          )}

          {procuracaoSrc && (
            <div className="flex flex-col bg-white/95 rounded-xl border border-slate-200 shadow-xl overflow-hidden">
              <h3 className="text-gray-700 font-semibold text-center py-2 bg-gray-100 text-base">
                📝 Procuração
              </h3>
              <iframe
                src={procuracaoSrc}
                className="w-full border-0"
                style={{ height: "calc(100vh - 220px)" }}
                title="Procuração"
                loading="lazy"
              />
            </div>
          )}
        </div>
      </div>

      {(linkGeral || linkContrato || linkProcuracao) && (
        <div className="mt-6 w-full max-w-4xl space-y-4 bg-white rounded p-4 shadow-md">
          <h3 className="font-semibold text-gray-700 text-lg">🔗 Links de Assinatura:</h3>

          {linkGeral && (
            <div className="flex items-center justify-between gap-4">
              <span className="truncate text-sm text-blue-700">{linkGeral}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => copiar(linkGeral)}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  📎 Copiar
                </button>
                <a
                  href={linkGeral}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-800 text-white px-3 py-1 rounded hover:bg-black"
                >
                  Abrir
                </a>
              </div>
            </div>
          )}

          {linkContrato && (
            <div className="flex items-center justify-between gap-4">
              <span className="truncate text-sm text-blue-700">{linkContrato}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => copiar(linkContrato)}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  📎 Copiar
                </button>
                <a
                  href={linkContrato}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-800 text-white px-3 py-1 rounded hover:bg-black"
                >
                  Abrir
                </a>
              </div>
            </div>
          )}

          {linkProcuracao && (
            <div className="flex items-center justify-between gap-4">
              <span className="truncate text-sm text-blue-700">{linkProcuracao}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => copiar(linkProcuracao)}
                  className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                >
                  📎 Copiar
                </button>
                <a
                  href={linkProcuracao}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-800 text-white px-3 py-1 rounded hover:bg-black"
                >
                  Abrir
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-4 mt-6">
        {/* ⬇️ Agora o Voltar sempre vai para /gerencial/processos */}
        <button
          onClick={() => router.push('/gerencial/processos')}
          className="px-6 py-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition text-lg"
        >
          ↩️ Voltar
        </button>

        {/* Salvar no Banco (somente persistência) – liberado para todos os perfis */}
        <button
          onClick={handleSalvarBanco}
          disabled={enviando}
          title={undefined}
          className={`px-6 py-3 rounded transition text-lg ${
            enviando
              ? "bg-gray-300 text-white cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {enviando ? "Salvando..." : "💾 Salvar no Banco"}
        </button>

        {/* Enviar para Assinatura – permanece liberado conforme fluxo atual */}
        <button
          onClick={handleEnviar}
          disabled={enviando}
          className={`px-6 py-3 rounded transition text-lg ${
            enviando
              ? "bg-gray-400 text-white cursor-not-allowed"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {enviando ? "Enviando..." : "📤 Enviar para Assinatura"}
        </button>
      </div>
    </div>
  );
}
