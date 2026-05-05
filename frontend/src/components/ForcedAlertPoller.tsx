"use client";
import { useEffect, useRef } from "react";

const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000"
).replace(/\/$/, "");

// Polling a cada 30s por padrão
const POLL_MS = 30_000;

export default function ForcedAlertPoller() {
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchForced = async () => {
      try {
        const res = await fetch(`${API_BASE}/alerta-forcado/`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const ts: string | null = data?.last_forced_at || null;
        if (!ts) return;

        const prev = lastSeenRef.current || (typeof window !== "undefined" ? localStorage.getItem("pjmol_last_forced_alert") : null);
        if (prev && prev === ts) return;

        lastSeenRef.current = ts;
        if (typeof window !== "undefined") {
          localStorage.setItem("pjmol_last_forced_alert", ts);
          // Dispara sinal global para DailyAlertModal
          window.dispatchEvent(new Event("pjmol-force-alert"));
        }
      } catch {}
    };

    fetchForced();
    const id = setInterval(() => { if (active) fetchForced(); }, POLL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return null;
}
