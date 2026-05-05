"use client";

import { useEffect, useRef, useState } from "react";
import { getLoggedUser } from "@/app/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const POLL_MS = 10_000;

interface SessaoStatus {
  usuario_id: number;
  nome: string;
  perfil: string;
  data_referencia: string;
  login_at: string | null;
  last_seen_at: string | null;
  logout_at: string | null;
  online: boolean;
}

interface ToastItem {
  id: string;
  message: string;
}

function formatLoginHour(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "--:--";
  return dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function SessionLoginNotifier() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const initializedRef = useRef(false);
  const seenLoginsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const user = getLoggedUser();
    const uid = Number(user.id);
    const perfil = String(user.perfil || localStorage.getItem("perfil") || localStorage.getItem("perfilUsuario") || "").toLowerCase();

    // Notificação para Leonardo, Henrique e Marco Antonio
    if (![5, 8, 11].includes(uid)) return;

    const storageKey = `pjmol_session_login_notified_${new Date().toISOString().slice(0, 10)}`;
    try {
      const raw = localStorage.getItem(storageKey);
      seenLoginsRef.current = raw ? JSON.parse(raw) : {};
    } catch {
      seenLoginsRef.current = {};
    }

    const persistSeen = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(seenLoginsRef.current));
      } catch {}
    };

    const pushToast = (message: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setToasts((current) => [...current, { id, message }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 8000);
    };

    const fetchStatuses = async () => {
      try {
        const res = await fetch(`${API_BASE}/sessoes/status`, {
          headers: {
            "X-Usuario-Id": String(uid),
            ...(perfil ? { "X-Perfil": perfil } : {}),
          },
          cache: "no-store",
        });
        if (!res.ok) return;

        const data: SessaoStatus[] = await res.json();
        const nextSeen = { ...seenLoginsRef.current };

        for (const item of data) {
          if (!item.login_at) continue;

          const key = String(item.usuario_id);
          const knownLogin = seenLoginsRef.current[key];

          if (!initializedRef.current) {
            nextSeen[key] = item.login_at;
            continue;
          }

          if (knownLogin !== item.login_at) {
            const hora = formatLoginHour(item.login_at);
            pushToast(`${item.nome} entrou no sistema às ${hora}`);
            nextSeen[key] = item.login_at;
          }
        }

        seenLoginsRef.current = nextSeen;
        persistSeen();
        initializedRef.current = true;
      } catch {}
    };

    fetchStatuses();
    const id = window.setInterval(fetchStatuses, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-80 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-xl"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}