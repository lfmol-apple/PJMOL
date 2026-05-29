"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

// Quem ENVIA orientações (sem alerta para eles mesmos)
const ENVIAM_IDS = new Set([5, 8, 11]); // Leonardo, Henrique, Marco Antônio
// Quem RECEBE alertas (Breno, Marcel, Luana)
const RECEBEM_IDS = new Set([6, 7, 10]);

const API = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");
const POLL_MS = 3_000; // atualização quase instantânea para todos

interface Comunicado {
  id: number;
  numero_regra: number | null;
  autor_id: number | null;
  autor_nome: string;
  conteudo: string;
  fixado: boolean;
  criado_em: string;
}

function getLidas(uid: number): number {
  try { return parseInt(localStorage.getItem(`pjmol_com_lidas_${uid}`) || "0", 10) || 0; }
  catch { return 0; }
}
function setLidas(uid: number, count: number) {
  try { localStorage.setItem(`pjmol_com_lidas_${uid}`, String(count)); }
  catch {}
}

function formatData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

// Primeiro nome em Title Case
function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] || nome;
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export default function ComunicadosPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [busca, setBusca] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [fixado, setFixado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [podeEscrever, setPodeEscrever] = useState(false);
  const [recebeAlerta, setRecebeAlerta] = useState(false);
  const [pronto, setPronto] = useState(false);

  const uidRef = useRef<number | null>(null);
  const perfilRef = useRef<string>("");
  const lastPollCountRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Som (3 bips descendentes) ─────────────────────────────────────────────
  const tocarSom = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      [0, 0.15, 0.30].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = 880 - i * 110;
        gain.gain.setValueAtTime(0.35, ctx.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.12);
        osc.start(ctx.currentTime + offset);
        osc.stop(ctx.currentTime + offset + 0.13);
      });
      setTimeout(() => ctx.close(), 700);
    } catch {}
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Recalcula permissão sempre que a rota mudar (ex.: login → gerencial)
  useEffect(() => {
    const ls = (k: string) => (typeof window !== "undefined" ? localStorage.getItem(k) : null) ?? "";

    // ID: tenta todas as chaves conhecidas
    const rawId = ls("usuarioId") || ls("userId") || ls("id") || ls("usuario_id");
    const parsed = parseInt(rawId, 10);
    const uid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;

    // Perfil: tenta todas as chaves conhecidas
    const perfil = (
      ls("perfil") || ls("perfilUsuario") || ls("perfilOriginal") || ls("role") || ""
    ).toLowerCase().trim();

    uidRef.current = uid;
    perfilRef.current = perfil;

    // Pode escrever: perfil admin OU ID nos autorizados {5,8,11}
    const autorizado = perfil === "admin" || (uid !== null && ENVIAM_IDS.has(uid));
    setPodeEscrever(autorizado);
    // Recebe alerta: IDs {6,7,10} que não são autorizados a escrever
    setRecebeAlerta(!autorizado && uid !== null && RECEBEM_IDS.has(uid));
    setPronto(true);
  }, [pathname]);

  // ── Headers ───────────────────────────────────────────────────────────────
  const buildHeaders = (): { headers: Record<string, string>; authenticated: boolean } => {
    const h: Record<string, string> = { "Content-Type": "application/json" };

    const rawUid = typeof window !== "undefined"
      ? localStorage.getItem("usuarioId") || localStorage.getItem("userId") || localStorage.getItem("id") || localStorage.getItem("usuario_id") || ""
      : "";
    const parsedUid = parseInt(rawUid, 10);
    const effectiveUid = Number.isFinite(parsedUid) && parsedUid > 0 ? parsedUid : uidRef.current;

    const rawPerfil = typeof window !== "undefined"
      ? localStorage.getItem("perfil") || localStorage.getItem("perfilUsuario") || localStorage.getItem("perfilOriginal") || localStorage.getItem("role") || ""
      : "";
    const effectivePerfil = (rawPerfil || perfilRef.current || "").toLowerCase().trim();

    if (effectiveUid !== null && effectiveUid !== undefined) h["X-Usuario-Id"] = String(effectiveUid);
    if (effectivePerfil) h["X-Perfil"] = effectivePerfil;

    return {
      headers: h,
      authenticated: Boolean(h["X-Usuario-Id"] || h["X-Perfil"]),
    };
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchComunicados = useCallback(async () => {
    try {
      const request = buildHeaders();
      if (!request.authenticated) return;

      const res = await fetch(`${API}/comunicados`, {
        headers: request.headers,
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data: Comunicado[] = await res.json();
      setComunicados(data);

      const uid = uidRef.current;
      const total = data.length;

      if (uid !== null && RECEBEM_IDS.has(uid)) {
        const jaLidas = getLidas(uid);
        const pendentes = Math.max(0, total - jaLidas);
        setNaoLidas(pendentes);
        if (lastPollCountRef.current !== null && total > lastPollCountRef.current) {
          tocarSom();
        }
      }
      lastPollCountRef.current = total;
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocarSom]);

  useEffect(() => {
    if (!pronto) return;
    fetchComunicados();
    const id = setInterval(fetchComunicados, POLL_MS);
    return () => clearInterval(id);
  }, [pronto, fetchComunicados]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = 0; // mais recente no topo
    }
  }, [open]);

  // ── Reagir a novas regras criadas em outras abas (mesmo usuário) ────────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "pjmol_comunicado_last_created") {
        fetchComunicados();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handler);
      }
    };
  }, [fetchComunicados]);

  // ── Abrir → marca como lido ───────────────────────────────────────────────
  const handleOpen = () => {
    setOpen(true);
    setBusca("");
    if (uidRef.current !== null && RECEBEM_IDS.has(uidRef.current)) {
      setLidas(uidRef.current, lastPollCountRef.current ?? comunicados.length);
      setNaoLidas(0);
    }
  };

  // ── Enviar ────────────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!novoTexto.trim()) return;
    setEnviando(true);
    try {
      const res = await fetch(`${API}/comunicados`, {
        method: "POST",
        headers: buildHeaders().headers,
        credentials: "include",
        body: JSON.stringify({ conteudo: novoTexto.trim(), fixado }),
      });
      if (res.ok) {
        setNovoTexto("");
        setFixado(false);
        await fetchComunicados();
        // avisa outras abas/navegadores do mesmo usuário que há nova regra
        try {
          if (typeof window !== "undefined") {
            localStorage.setItem("pjmol_comunicado_last_created", String(Date.now()));
          }
        } catch {}
        if (listRef.current) listRef.current.scrollTop = 0; // mais recente no topo
      }
    } finally {
      setEnviando(false);
    }
  };

  // ── Excluir ───────────────────────────────────────────────────────────────
  const excluir = async (id: number) => {
    await fetch(`${API}/comunicados/${id}`, {
      method: "DELETE",
      headers: buildHeaders().headers,
      credentials: "include",
    });
    await fetchComunicados();
  };

  if (!pronto || pathname === "/login" || pathname === "/") return null;

  const temPendente = recebeAlerta && naoLidas > 0;

  // Filtra por busca (case-insensitive em conteúdo + autor)
  const listaFiltrada = busca.trim()
    ? comunicados.filter((c) =>
        c.conteudo.toLowerCase().includes(busca.toLowerCase()) ||
        c.autor_nome.toLowerCase().includes(busca.toLowerCase())
      )
    : comunicados;

  return (
    <>
      {/* ── BOTÃO DESKTOP (ABA LATERAL) ─────────────────────────────────── */}
      {!open && (
        <>
          {/* Desktop / tablet: aba vertical na direita */}
          <button
            onClick={handleOpen}
            className={`hidden sm:flex fixed right-0 top-1/2 -translate-y-1/2 z-50
                       text-white flex-col items-center justify-center gap-1
                       py-4 px-2 rounded-l-xl shadow-xl select-none
                       transition-colors duration-200
                       ${temPendente
                         ? "bg-red-600 hover:bg-red-500 animate-pulse"
                         : "bg-blue-700 hover:bg-blue-600"
                       }`}
            title={temPendente ? `${naoLidas} orientação(ões) não lida(s)` : "Abrir painel de orientações"}
          >
            <span className="text-lg">{temPendente ? "🔔" : "📋"}</span>
            {temPendente ? (
              <>
                <span className="text-[13px] font-extrabold leading-tight">{naoLidas > 9 ? "9+" : naoLidas}</span>
                <span className="text-[8px] font-bold leading-tight opacity-90 text-center">NÃO{"\n"}LIDA{naoLidas > 1 ? "S" : ""}</span>
              </>
            ) : (
              [..."REGRAS"].map((ch, i) => (
                <span key={i} className="text-[9px] font-bold leading-tight tracking-wide">{ch}</span>
              ))
            )}
          </button>

          {/* Mobile: botão flutuante no canto inferior direito */}
          <button
            onClick={handleOpen}
            className={`sm:hidden fixed right-4 bottom-24 z-50
                       inline-flex items-center justify-center gap-1
                       px-4 py-2 rounded-full shadow-xl text-xs font-bold
                       text-white
                       ${temPendente
                         ? "bg-red-600 hover:bg-red-500 animate-pulse"
                         : "bg-blue-700 hover:bg-blue-600"
                       }`}
            title={temPendente ? `${naoLidas} orientação(ões) não lida(s)` : "Abrir painel de orientações"}
          >
            <span>{temPendente ? "🔔" : "📋"}</span>
            <span>{temPendente ? `${Math.min(naoLidas, 9)}+` : "REGRAS"}</span>
          </button>
        </>
      )}

      {/* ── PAINEL ─────────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed right-0 top-0 h-full w-80 z-50 bg-gray-950 border-l border-gray-700 flex flex-col shadow-2xl">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-800 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">📋</span>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Painel de Regras</p>
                <p className="text-blue-200 text-[10px]">{comunicados.length} regra{comunicados.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white text-lg leading-none" title="Fechar">✕</button>
          </div>

          {/* Busca — visível para todos */}
          <div className="px-3 pt-2 pb-1 shrink-0">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔍 Buscar regra ou assunto…"
              className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white
                         text-xs px-3 py-2 placeholder-gray-500
                         focus:outline-none focus:border-blue-500"
            />
            {busca && (
              <p className="text-gray-500 text-[10px] mt-1 px-1">
                {listaFiltrada.length} resultado{listaFiltrada.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Lista */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
            {listaFiltrada.length === 0 && (
              <p className="text-gray-500 text-xs text-center mt-8">
                {busca ? "Nenhuma regra encontrada." : "Nenhuma regra registrada."}
              </p>
            )}
            {listaFiltrada.map((c) => (
              <div
                key={c.id}
                className={`rounded-lg p-3 text-sm relative ${
                  c.fixado ? "bg-yellow-900/50 border border-yellow-600/50" : "bg-gray-800"
                }`}
              >
                {/* Cabeçalho da regra */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded
                    ${c.fixado ? "bg-yellow-600/40 text-yellow-300" : "bg-blue-700/50 text-blue-300"}`}>
                    {c.numero_regra ? `Regra Nº ${c.numero_regra}` : "Orientação"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {c.fixado && <span className="text-yellow-400 text-xs" title="Fixada">📌</span>}
                    {podeEscrever && (
                      <button
                        onClick={() => excluir(c.id)}
                        className="text-red-500/50 hover:text-red-400 text-[11px]"
                        title="Excluir"
                      >🗑</button>
                    )}
                  </div>
                </div>

                {/* Conteúdo */}
                <p className="text-white leading-snug whitespace-pre-wrap text-[13px]">{c.conteudo}</p>

                {/* Rodapé */}
                <div className="mt-2 flex items-center gap-1 text-gray-400 text-[10px]">
                  <span className="text-blue-300 font-semibold">{c.autor_nome || "—"}</span>
                  <span>·</span>
                  <span>{formatData(c.criado_em)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Formulário (só para quem envia) */}
          {podeEscrever && (
            <div className="shrink-0 border-t border-gray-700 px-3 py-3 space-y-2 bg-gray-900">
              <textarea
                value={novoTexto}
                onChange={(e) => setNovoTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar(); }}
                rows={3}
                placeholder="Nova regra/orientação… (Ctrl+Enter para enviar)"
                className="w-full rounded-lg bg-gray-800 border border-gray-600 text-white
                           text-sm px-3 py-2 resize-none placeholder-gray-500
                           focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={fixado} onChange={(e) => setFixado(e.target.checked)} className="accent-yellow-400" />
                  Fixar 📌
                </label>
                <button
                  onClick={enviar}
                  disabled={enviando || !novoTexto.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                             text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
                >
                  {enviando ? "Enviando…" : "Publicar regra"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
