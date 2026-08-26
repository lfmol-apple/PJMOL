"use client";
import { useEffect, useState } from "react";

export type Cargo = "Administrador" | "Gerente" | "Advogado" | "";

function read(key: string): string {
  try {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(key) || "";
  } catch { return ""; }
}

export function computeCargo(): Cargo {
  if (typeof window === "undefined") return "";

  // --- 1) Derivar pelo PERFIL salvo na sessão ---
  const perfil = (
    read("perfilUsuario") ||
    read("perfil") ||
    read("tipo") ||
    ""
  ).toLowerCase().trim();

  if (perfil == "gerente") return "Gerente";
  if (perfil == "advogado") return "Advogado";
  if (["admin","administrador"].includes(perfil)) return "Administrador";

  // --- 2) Só então usa ROTULO salvo (evita sujeira antiga) ---
  const saved = read("rotulo").trim();
  if (["Administrador","Gerente","Advogado"].includes(saved)) {
    return saved as Cargo;
  }

  return "";
}

export function useCargo() {
  const [cargo, setCargo] = useState<Cargo>("");  

  useEffect(() => {
    const update = () => {
      const novo = computeCargo();
      setCargo(novo);

      // self-heal: mantém localStorage.rotulo coerente
      try {
        if (novo && read("rotulo") != novo) {
          localStorage.setItem("rotulo", novo);
        }
      } catch {}
    };

    update();

    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (["rotulo","perfil","perfilUsuario","tipo","nome","nomeUsuario","nomeAdvogado"].includes(e.key)) {
        update();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("visibilitychange", update);
    };
  }, []);

  return cargo;
}
