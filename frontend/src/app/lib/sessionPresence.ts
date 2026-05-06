const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

type SessionPayload = {
  usuario_id: number;
  nome?: string;
  perfil?: string;
};

function readStorage(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) || sessionStorage.getItem(key) || "";
}

export function getSessionPayload(): SessionPayload | null {
  if (typeof window === "undefined") return null;

  const usuarioId = Number(readStorage("usuarioId") || readStorage("userId") || 0);
  const perfil = (readStorage("perfil") || readStorage("perfilUsuario") || "").toLowerCase();
  const nome = readStorage("nome") || readStorage("nomeUsuario") || "";

  if (!Number.isFinite(usuarioId) || usuarioId <= 0) return null;
  if (perfil !== "gerente" && perfil !== "admin") return null;

  return { usuario_id: usuarioId, nome, perfil };
}

export function postSessionPresence(path: "heartbeat" | "logout", payload: SessionPayload, useBeacon = false): void {
  const url = `${API_BASE}/sessoes/${path}`;
  const body = JSON.stringify(payload);

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Usuario-Id": String(payload.usuario_id),
      ...(payload.perfil ? { "X-Perfil": payload.perfil } : {}),
    },
    body,
    keepalive: path === "logout",
  }).catch(() => {});
}

export function clearBrowserSession(): void {
  try {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "usuario=; Max-Age=0; path=/";
    document.cookie = "token=; Max-Age=0; path=/";
  } catch {}
}

export function logoutCurrentSession(): void {
  const payload = getSessionPayload();
  if (payload) {
    postSessionPresence("logout", payload, true);
    postSessionPresence("logout", payload);
  }
  clearBrowserSession();
}