"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { getLoggedUser, getToken } from "@/app/lib/auth";

const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");

const ALERT_DURATION = 30;

// Chave por usuário em COOKIE (sobrevive ao localStorage.clear() do logout)
function getCookieName(userId: string | number | null, email: string | null): string {
  const id = userId != null ? String(userId) : (email ?? "anon");
  // sanitiza para nome de cookie válido
  return "pjmol_alert_" + id.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function alreadyShownToday(userId: string | number | null, email: string | null): boolean {
  try {
    const today = new Date().toISOString().split("T")[0];
    const name = getCookieName(userId, email);
    const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
    return m ? m[1] === today : false;
  } catch { return false; }
}
function markShownToday(userId: string | number | null, email: string | null) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const name = getCookieName(userId, email);
    // Expira à meia-noite
    const midnight = new Date();
    midnight.setHours(23, 59, 59, 0);
    document.cookie = `${name}=${today}; expires=${midnight.toUTCString()}; path=/; SameSite=Lax`;
  } catch {}
}
function clearAllAlertCookies() {
  try {
    document.cookie.split(";").forEach(c => {
      const name = c.trim().split("=")[0];
      if (name.startsWith("pjmol_alert_")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
      }
    });
  } catch {}
}

// ─── Utilitários ───────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function detectGender(nome: string): "Sr." | "Sra." {
  if (!nome) return "Sr.";
  const first = nome.trim().split(/\s+/)[0].toLowerCase();
  // Exceções: nomes masculinos terminados em 'a' ou 'e'
  const maleExceptions = new Set([
    "henrique","alexandre","andre","jose","rene","gabriel","rafael",
    "miguel","daniel","israel","ezequiel","samuel","josue","luca","elias",
    "tobias","mathias","tomas","nicolas","matias","daniele","agenore",
  ]);
  if (!maleExceptions.has(first) && (first.endsWith("a") || first.endsWith("ã"))) return "Sra.";
  return "Sr.";
}

// ─── Som estilo Bigfone ────────────────────────────────────────────────────

function playBigfoneSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

    // ── Parte 1: campainha de alerta ──────────────────────────────────────
    if (AudioCtx) {
      const ctx = new AudioCtx();

      // Filtro passa-banda tipo telefone
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600;
      bp.Q.value = 0.8;

      const master = ctx.createGain();
      master.gain.setValueAtTime(1, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);

      // 6 toques de campainha
      for (let i = 0; i < 6; i++) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = i % 2 === 0 ? 900 : 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime + i * 0.13);
        g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + i * 0.13 + 0.02);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.13 + 0.11);
        osc.connect(g); g.connect(bp);
        osc.start(ctx.currentTime + i * 0.13);
        osc.stop(ctx.currentTime + i * 0.13 + 0.12);
      }

      bp.connect(master);
      master.connect(ctx.destination);

      // ── Parte 2: drone grave de cinema durante a fala ─────────────────
      setTimeout(() => {
        const ctx2 = new AudioCtx();

        // Sub-bass (frequência de trailer de cinema ~40-60 Hz)
        const sub = ctx2.createOscillator();
        sub.type = "sine";
        sub.frequency.setValueAtTime(45, ctx2.currentTime);
        sub.frequency.linearRampToValueAtTime(38, ctx2.currentTime + 2.5);

        // Camada mid-range distorcida (efeito "voz amplificada")
        const mid = ctx2.createOscillator();
        mid.type = "sawtooth";
        mid.frequency.setValueAtTime(90, ctx2.currentTime);

        const distCurve = new Float32Array(512);
        for (let i = 0; i < 512; i++) {
          const x = (i * 2) / 512 - 1;
          distCurve[i] = ((Math.PI + 300) * x) / (Math.PI + 300 * Math.abs(x));
        }
        const dist = ctx2.createWaveShaper();
        dist.curve = distCurve;
        dist.oversample = "4x";

        const gSub = ctx2.createGain();
        gSub.gain.setValueAtTime(0.5, ctx2.currentTime);
        gSub.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 3.5);

        const gMid = ctx2.createGain();
        gMid.gain.value = 0.15;

        sub.connect(gSub); gSub.connect(ctx2.destination);
        mid.connect(dist); dist.connect(gMid); gMid.connect(ctx2.destination);

        sub.start(); sub.stop(ctx2.currentTime + 3.5);
        mid.start(); mid.stop(ctx2.currentTime + 3.5);
      }, 900);
    }

    // ── Parte 3: voz máxima distorção disponível no browser ──────────────
    setTimeout(() => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();

      const speak = () => {
        const utter = new SpeechSynthesisUtterance("Atenção! Preste muita atenção!");
        utter.lang = "pt-BR";
        utter.pitch = 0;     // mínimo absoluto → voz mais grave possível
        utter.rate = 0.55;   // bem lento → peso e dramaticidade
        utter.volume = 1;

        const voices = window.speechSynthesis.getVoices();
        // Prioridade: masculino PT-BR > qualquer PT > qualquer voz
        const ptMale = voices.find(v =>
          v.lang.startsWith("pt") && /male|masculin|homem|masc/i.test(v.name)
        );
        const ptAny = voices.find(v => v.lang.startsWith("pt"));
        const anyMale = voices.find(v => /male|masculin/i.test(v.name));
        utter.voice = ptMale ?? ptAny ?? anyMale ?? null;

        window.speechSynthesis.speak(utter);
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        speak();
      } else {
        window.speechSynthesis.onvoiceschanged = () => { speak(); };
      }
    }, 1400);

  } catch {
    // fallback silencioso
  }
}

// ─── Tick por segundo ──────────────────────────────────────────────────────

function playTick() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1100;
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch {}
}

// ─── Componente Principal ──────────────────────────────────────────────────

// Exportamos também como componente controlável ("Meu Desempenho")
export function AlertModalContent({
  muted = false,
  onClose,
}: {
  muted?: boolean;
  onClose: () => void;
}) {
  return (
    <_DailyAlertCore muted={muted} onDismiss={onClose} forceShow />
  );
}

function _DailyAlertCore({
  muted = false,
  forceShow = false,
  onDismiss,
}: {
  muted?: boolean;
  forceShow?: boolean;
  onDismiss?: () => void;
}) {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [timeLeft, setTimeLeft] = useState(ALERT_DURATION);
  const [myTotal, setMyTotal] = useState(0);
  const [myConcluidos, setMyConcluidos] = useState(0);
  const [globalTotal, setGlobalTotal] = useState(0);
  const [globalConcluidos, setGlobalConcluidos] = useState(0);
  const [userName, setUserName] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundPlayedRef = useRef(false);

  const dismiss = useCallback(() => {
    setShow(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (onDismiss) onDismiss();
  }, [onDismiss]);

  const hasShownRef = useRef(false);  // true assim que o modal foi confirmado
  const inProgressRef = useRef(false); // true enquanto fetch está rodando
  const forceNextRef = useRef(false); // marcado quando vier evento global "pjmol-force-alert"

  // Função central — usa refs (sem stale closure)
  const tryShow = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (hasShownRef.current) return;
    if (inProgressRef.current) return;

    const read = (k: string) =>
      localStorage.getItem(k) || sessionStorage.getItem(k) || null;

    const nomeRaw = (read("nomeUsuario") || read("nome") || "").trim();
    const perfilRaw = (read("perfil") || read("perfilUsuario") || "").toLowerCase();
    const userIdRaw = read("usuarioId") || read("userId") || null;
    const emailRaw = read("emailUsuario") || read("email") || null;

    const forceAlert = forceShow || forceNextRef.current || new URLSearchParams(window.location.search).has("forceAlert");
    const clearAlert = new URLSearchParams(window.location.search).has("clearDailyAlert");
    if (clearAlert) {
      clearAllAlertCookies();
    }

    if (perfilRaw !== "gerente" || !nomeRaw) return;

    // Alerta automático apenas às segundas (1) e sextas (5) —
    // mas sempre permitido quando forçado pelo Leonardo (forceAlert=true)
    if (!forceAlert) {
      const today = new Date();
      const weekday = today.getDay(); // 0=Dom,1=Seg,...,5=Sex,6=Sáb
      if (weekday !== 1 && weekday !== 5) {
        hasShownRef.current = true;
        return;
      }
    }

    if (!forceAlert && alreadyShownToday(userIdRaw, emailRaw)) {
      hasShownRef.current = true; // para parar polling
      return;
    }

    inProgressRef.current = true;
    setUserName(nomeRaw);

    const user = getLoggedUser();
    const token = getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(user.id != null ? { "X-Usuario-Id": String(user.id) } : {}),
      "X-Perfil": perfilRaw,
    };

    try {
      // Fetch 1: processos do gerente (filtrado pelo backend via X-Usuario-Id)
      const r = await fetch(`${API_BASE}/extratos?limit=9999`, { headers, credentials: "include" });
      const data = r.ok ? await r.json() : [];
      const mine: any[] = Array.isArray(data)
        ? data
        : (data?.items ?? data?.extratos ?? data?.data ?? []);

      const isConcluido = (it: any) => {
        const n = (it?.numero_processo ?? "").toString().trim();
        return n !== "" && n !== "None";
      };

      setMyTotal(mine.length);
      setMyConcluidos(mine.filter(isConcluido).length);

      // Fetch 2: TODOS os processos (sem filtro de gerente — X-Perfil: admin)
      const headersGlobal: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Perfil": "admin",
      };
      const rGlobal = await fetch(`${API_BASE}/extratos?limit=9999`, { headers: headersGlobal, credentials: "include" });
      const dataGlobal = rGlobal.ok ? await rGlobal.json() : [];
      const all: any[] = Array.isArray(dataGlobal)
        ? dataGlobal
        : (dataGlobal?.items ?? dataGlobal?.extratos ?? dataGlobal?.data ?? []);

      setGlobalTotal(all.length);
      setGlobalConcluidos(all.filter(isConcluido).length);

      hasShownRef.current = true;
      markShownToday(userIdRaw, emailRaw);
      setShow(true);
    } catch (err) {
      console.error("[DailyAlert] Fetch error:", err);
    } finally {
      inProgressRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disparar ao montar E a cada mudança de rota (login redirect incluído)
  useEffect(() => {
    inProgressRef.current = false; // reset para permitir nova tentativa na nova rota
    tryShow();

    const onStorage = () => tryShow();
    const onForced = () => {
      // evento global vindo do ForcedAlertPoller → força alerta imediato
      forceNextRef.current = true;
      hasShownRef.current = false; // permite novo disparo mesmo que já tenha mostrado hoje
      inProgressRef.current = false;
      tryShow();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pjmol-force-alert", onForced as any);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pjmol-force-alert", onForced as any);
    };
  // pathname garante re-execução após qualquer navegação (ex.: login → gerencial)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Timer + sons
  useEffect(() => {
    if (!show) return;

    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true;
      if (!muted) {
        setTimeout(playBigfoneSound, 300);
      }
    }

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          dismiss();
          return 0;
        }
        playTick();
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [show, dismiss]);

  if (!show) return null;

  // ─── Cores por percentual ───────────────────────────────────────────────
  const pct = myTotal > 0 ? Math.round((myConcluidos / myTotal) * 100) : 0;
  const gPct = globalTotal > 0 ? Math.round((globalConcluidos / globalTotal) * 100) : 0;

  const getColors = (p: number) => {
    if (p <= 50) return { bar: "bg-red-600", text: "text-red-600", border: "border-red-500", badge: "bg-red-600" };
    if (p <= 75) return { bar: "bg-yellow-500", text: "text-yellow-600", border: "border-yellow-400", badge: "bg-yellow-500" };
    return { bar: "bg-emerald-600", text: "text-emerald-600", border: "border-emerald-500", badge: "bg-emerald-600" };
  };

  const mc = getColors(pct);
  const gc = getColors(gPct);

  const greeting = getGreeting();
  const treatment = detectGender(userName);
  const firstName = userName.trim().split(/\s+/)[0];

  // Anel do timer
  const RADIUS = 22;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const timerOffset = CIRCUMFERENCE * (1 - timeLeft / ALERT_DURATION);
  const timerStroke = timeLeft > 20 ? "#16a34a" : timeLeft > 10 ? "#ca8a04" : "#dc2626";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75"
      style={{ animation: "fadeIn 0.25s ease" }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse-ring { 0%,100% { opacity:1; } 50% { opacity:0.6; } }
      `}</style>

      <div
        className={`
          relative w-full max-w-md mx-3 rounded-2xl border-4 ${mc.border}
          bg-white shadow-2xl overflow-hidden
        `}
        style={{ animation: "fadeIn 0.3s ease" }}
      >
        {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className={`${mc.bar} px-5 py-4 flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <span className="text-4xl leading-none" style={{ animation: "pulse-ring 1s infinite" }}>🚨</span>
            <div>
              <div className="text-white font-black text-xl uppercase tracking-wider leading-tight">
                {greeting}!
              </div>
              <div className="text-white/80 text-xs font-medium">Alerta Diário · PJMOL</div>
            </div>
          </div>

          {/* Contador regressivo em anel SVG */}
          <div className="flex flex-col items-center shrink-0">
            <div className="relative w-14 h-14">
              <svg width="56" height="56" className="absolute inset-0 -rotate-90">
                <circle cx="28" cy="28" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                <circle
                  cx="28" cy="28" r={RADIUS}
                  fill="none"
                  stroke="white"
                  strokeWidth="4"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={timerOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-black text-xl leading-none">{timeLeft}</span>
              </div>
            </div>
            <span className="text-white/70 text-[10px] mt-0.5 font-medium">seg</span>
          </div>
        </div>

        {/* ── Corpo ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 space-y-4">

          {/* Mensagem principal */}
          <div className={`rounded-xl border-2 ${mc.border} bg-slate-50 px-4 py-3`}>
            <p className="text-slate-800 text-sm leading-relaxed">
              <span className="font-bold text-base">{treatment} {firstName}</span>, existem diversos
              processos que ainda não têm número na sua caixa de pendências.
            </p>
            <p className={`mt-2 font-bold ${mc.text} text-sm`}>
              📂 Colocar o número do processo economiza dinheiro para a sua empresa!
            </p>
          </div>

          {/* Meus números */}
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              Seus processos
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3 text-center">
                <div className="text-3xl font-black text-slate-800">{myTotal}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">No sistema</div>
              </div>
              <div className={`rounded-xl border-2 ${mc.border} px-2 py-3 text-center`}>
                <div className={`text-3xl font-black ${mc.text}`}>{myConcluidos}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Com nº processo</div>
              </div>
              <div className={`rounded-xl ${mc.badge} px-2 py-3 text-center`}>
                <div className="text-3xl font-black text-white">{pct}%</div>
                <div className="text-[10px] text-white/80 mt-0.5 font-medium">Concluídos</div>
              </div>
            </div>
            {/* Barra de progresso */}
            <div className="mt-2 h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${mc.bar} rounded-full`}
                style={{ width: `${pct}%`, transition: "width 1s ease" }}
              />
            </div>
          </div>

          {/* Panorama geral */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
              📊 Panorama geral do sistema
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-2xl font-black text-slate-700">{globalTotal}</div>
                <div className="text-[10px] text-slate-500 font-medium">Total</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-black ${gc.text}`}>{globalConcluidos}</div>
                <div className="text-[10px] text-slate-500 font-medium">Concluídos</div>
              </div>
              <div className={`rounded-lg ${gc.badge} text-center py-1.5`}>
                <div className="text-2xl font-black text-white">{gPct}%</div>
                <div className="text-[10px] text-white/80 font-medium">Sistema</div>
              </div>
            </div>
            <div className="mt-2 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${gc.bar} rounded-full`}
                style={{ width: `${gPct}%`, transition: "width 1s ease" }}
              />
            </div>
          </div>
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────── */}
        <div className="px-5 pb-5">
          <button
            onClick={dismiss}
            className="w-full rounded-xl bg-slate-900 py-3 text-white font-bold text-sm hover:bg-slate-800 transition-colors"
          >
            Entendi — Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DailyAlertModal() {
  return <_DailyAlertCore />;
}
