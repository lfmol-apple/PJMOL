"use client";
import { useEffect } from "react";
import DailyAlertModal from "@/components/DailyAlertModal";
import ComunicadosPanel from "@/components/ComunicadosPanel";
import ForcedAlertPoller from "@/components/ForcedAlertPoller";
import SessionLoginNotifier from "@/components/SessionLoginNotifier";
import { getSessionPayload, logoutCurrentSession, postSessionPresence } from "@/app/lib/sessionPresence";

// IDs que devem fazer login novamente 1x por dia
const FORCE_LOGIN_IDS = new Set([6, 7, 10]); // Breno, Marcel, Luana

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export default function ClientShell({ children }: { children: React.ReactNode }) {
  // Força login diário para alguns IDs
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;

      const rawId = localStorage.getItem("usuarioId") || localStorage.getItem("userId") || "";
      const uid = parseInt(rawId, 10);
      if (!Number.isFinite(uid) || uid <= 0 || !FORCE_LOGIN_IDS.has(uid)) return;

      const today = new Date().toISOString().split("T")[0];
      const key = `pjmol_force_login_${uid}`;
      const last = localStorage.getItem(key) || "";

      if (last === today) return; // já forçou login hoje

      // grava que hoje já foi forçado, para não repetir no mesmo dia
      localStorage.setItem(key, today);

      // limpa sessão atual e redireciona para login
      logoutCurrentSession();

      window.location.href = "/login";
    } catch {}
  }, []);

  // Heartbeat de presença para todos os gerentes/admin (monitor de sessões)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const payload = getSessionPayload();
    if (!payload) return;

    // Primeiro heartbeat imediato para garantir registro mesmo sem reload
    postSessionPresence("heartbeat", payload);

    const id = window.setInterval(() => postSessionPresence("heartbeat", payload), 30_000); // 30s

    const handlePageLeave = () => postSessionPresence("logout", payload, true);

    window.addEventListener("beforeunload", handlePageLeave);
    window.addEventListener("pagehide", handlePageLeave);

    return () => {
      window.removeEventListener("beforeunload", handlePageLeave);
      window.removeEventListener("pagehide", handlePageLeave);
      window.clearInterval(id);
    };
  }, []);

  return (
    <>
      {children}
      <ForcedAlertPoller />
      <DailyAlertModal />
      <ComunicadosPanel />
      <SessionLoginNotifier />
    </>
  );
}
