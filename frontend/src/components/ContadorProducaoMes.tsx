"use client";

import { useEffect, useState } from "react";

const API = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");

const META_POR_USUARIO = 2_000_000;

function getAuth() {
  if (typeof window === "undefined") return { uid: "", perfil: "" };
  const r = (k: string) => localStorage.getItem(k) || sessionStorage.getItem(k) || "";
  return {
    uid:    r("usuarioId") || r("userId") || r("id") || r("usuario_id"),
    perfil: (r("perfil") || r("perfilUsuario") || r("role") || "").toLowerCase().trim(),
  };
}

function mesAtual() {
  const now = new Date();
  return {
    ini: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    fim: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  };
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function calcCor(p: number) {
  p = Math.max(0, Math.min(1, p));
  return `rgb(${Math.round(239 + (37 - 239) * p)},${Math.round(68 + (99 - 68) * p)},${Math.round(68 + (235 - 68) * p)})`;
}

type D = {
  causa: number;
  qtd: number;
  comissao: number;
  qtdCom: number;
  metaUsuariosCount: number | null;
};

export default function ContadorProducaoMes() {
  const [d, setD]         = useState<D>({ causa: 0, qtd: 0, comissao: 0, qtdCom: 0, metaUsuariosCount: null });
  const [ready, setReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen]   = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", onChange);

    const { uid, perfil } = getAuth();
    const hdrs: Record<string, string> = {};
    if (uid)    hdrs["X-Usuario-Id"] = uid;
    if (perfil) hdrs["X-Perfil"]     = perfil;
    const opts = { headers: hdrs, credentials: "include" as const, cache: "no-store" as const };
    const { ini, fim } = mesAtual();

    Promise.all([
      fetch(`${API}/extratos/meu-total-mes`, opts).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/relatorios/producao/comissoes?data_inicial=${ini}&data_final=${fim}`, opts).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([causa, com]) => {
      setD({
        causa:             Number(causa?.valor_causa_total          ?? 0),
        qtd:               Number(causa?.quantidade                 ?? 0),
        comissao:          Number(com?.resumo?.valor_comissao_total ?? 0),
        qtdCom:            Number(com?.resumo?.quantidade           ?? 0),
        metaUsuariosCount: causa?.meta_usuarios_count ?? null,
      });
    }).finally(() => setReady(true));

    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!ready) return null;

  // Para admins: meta = nº de usuários com meta ativos × 2M
  // Para usuários comuns: meta fixa de 2M
  const meta = d.metaUsuariosCount != null && d.metaUsuariosCount > 0
    ? d.metaUsuariosCount * META_POR_USUARIO
    : META_POR_USUARIO;

  const p          = d.causa / meta;
  const c          = calcCor(p);
  const pct        = Math.min(100, Math.round(p * 100));
  const causaChars = [...fmtNum(d.causa)];
  const comChars   = d.comissao > 0 ? [...fmtNum(d.comissao)] : [];

  const tabStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 9990,
    border: "none",
    borderRadius: "0 16px 16px 0",
    background: c,
    boxShadow: "0 4px 28px rgba(0,0,0,.28)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 1,
  };

  const FullContent = () => (
    <>
      <span style={{ fontSize: 16, lineHeight: "1.2", marginBottom: 4 }}>📊</span>
      {causaChars.map((ch, i) => (
        <span key={`c${i}`} style={{ fontSize: 11, fontWeight: 800, lineHeight: "1.3", color: "#fff", display: "block", textAlign: "center" }}>{ch}</span>
      ))}
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", lineHeight: "1.2", marginTop: 2 }}>{pct}%</span>
      {d.metaUsuariosCount != null && d.metaUsuariosCount > 0 && (
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", lineHeight: "1.2" }}>/{d.metaUsuariosCount}×</span>
      )}
      {comChars.length > 0 && (
        <>
          <span style={{ width: 18, height: 1, background: "rgba(255,255,255,0.35)", margin: "5px 0", display: "block" }} />
          <span style={{ fontSize: 16, lineHeight: "1.2", marginBottom: 2 }}>💰</span>
          {comChars.map((ch, i) => (
            <span key={`m${i}`} style={{ fontSize: 11, fontWeight: 800, lineHeight: "1.3", color: "rgba(255,255,255,0.92)", display: "block", textAlign: "center" }}>{ch}</span>
          ))}
        </>
      )}
    </>
  );

  if (desktop) {
    return (
      <div style={{ ...tabStyle, padding: "16px 8px", cursor: "default" }}>
        <FullContent />
      </div>
    );
  }

  return (
    <div
      style={{ ...tabStyle, padding: open ? "16px 8px" : "12px 7px", cursor: "pointer" }}
      onClick={() => setOpen(o => !o)}
    >
      {open ? <FullContent /> : <span style={{ fontSize: 16, lineHeight: "1" }}>📊</span>}
    </div>
  );
}
