"use client";

import { useEffect, useState } from "react";
import { getLoggedUser } from "@/app/lib/auth";

const API_BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function base64UrlToUint8Array(base64UrlString: string) {
  const padding = "=".repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationsControl() {
  const [status, setStatus] = useState<string>("Push desligado");
  const [busy, setBusy] = useState(false);
  const user = getLoggedUser();
  const rawUid = typeof window !== "undefined"
    ? localStorage.getItem("usuarioId") || localStorage.getItem("userId") || String(user.id || "")
    : String(user.id || "");
  const uid = Number(rawUid);
  const perfil = String(
    user.perfil ||
    (typeof window !== "undefined" ? localStorage.getItem("perfil") || localStorage.getItem("perfilUsuario") || "" : "")
  ).toLowerCase();
  const nome = String(user.nome || (typeof window !== "undefined" ? localStorage.getItem("nome") || localStorage.getItem("nomeUsuario") || "" : "")).toLowerCase();
  const email = String(user.email || (typeof window !== "undefined" ? localStorage.getItem("emailUsuario") || "" : "")).toLowerCase();
  const allowed =
    [5, 8, 11].includes(uid) ||
    nome.includes("leonardo") ||
    nome.includes("henrique") ||
    nome.includes("marco antonio") ||
    nome.includes("marco ant") ||
    email === "leonardofmol@gmail.com" ||
    email === "henriquefmol@yahoo.com.br" ||
    email === "marcoafariajunior@hotmail.com";

  const requestUid = Number.isFinite(uid) && uid > 0
    ? uid
    : nome.includes("henrique")
      ? 8
      : nome.includes("marco")
        ? 11
        : 5;

  const syncSubscriptionWithServer = async (subscription: PushSubscription) => {
    const json = subscription.toJSON();
    const res = await fetch(`${API_BASE}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Usuario-Id': String(requestUid),
        'X-Perfil': perfil,
      },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
      }),
    });

    if (!res.ok) {
      throw new Error(`subscribe-failed-${res.status}`);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    const isLocalHost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const isSecure = typeof window !== "undefined" && (window.location.protocol === "https:" || isLocalHost);

    if (!isSecure) {
      setStatus("Push exige HTTPS. No iPhone, abra o app instalado na Tela de Início.");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("Push não suportado neste navegador");
      return;
    }

    const isAppleMobile = typeof window !== "undefined" && /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
    if (isAppleMobile && !window.matchMedia("(display-mode: standalone)").matches) {
      setStatus("No iPhone/iPad, instale o app na Tela de Início para ativar push.");
    }

    navigator.serviceWorker.getRegistration('/').then((reg) => {
      if (!reg) return;

      reg.pushManager.getSubscription().then(async (sub) => {
        if (!sub) return;

        try {
          await syncSubscriptionWithServer(sub);
          setStatus("Push ativado neste aparelho");
        } catch {
          setStatus("Push detectado neste aparelho, mas não sincronizado com o servidor.");
        }
      }).catch(() => {});
    }).catch(() => {});
  }, [allowed, perfil, requestUid]);

  const ativarPush = async () => {
    if (!allowed || busy) return;
    setBusy(true);
    try {
      const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
      const isSecure = window.location.protocol === "https:" || isLocalHost;
      if (!isSecure) {
        setStatus("Push exige HTTPS. No iPhone, use o app instalado na Tela de Início.");
        return;
      }

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("Push não suportado neste navegador");
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("Permissão de notificação negada");
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await fetch(`${API_BASE}/push/public-key`, {
        headers: {
          'X-Usuario-Id': String(requestUid),
          'X-Perfil': perfil,
        },
      });
      if (!keyRes.ok) {
        setStatus("Push ainda não configurado no servidor");
        return;
      }
      const { public_key } = await keyRes.json();
      const existing = await reg.pushManager.getSubscription();
      const subscription = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(public_key),
      });

      await syncSubscriptionWithServer(subscription);
      setStatus("Push ativado neste aparelho");
    } catch (error) {
      console.error('Erro ao ativar push:', error);
      setStatus("Falha ao ativar push");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) return null;

  return (
    <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
      <button
        onClick={ativarPush}
        disabled={busy}
        className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? 'Ativando…' : 'Ativar Push'}
      </button>
      <span className="text-xs text-slate-600">{status}</span>
    </div>
  );
}
