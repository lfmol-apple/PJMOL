// src/store/assinatura.ts
"use client";
import { create } from "zustand";

export type AssinaturaState = {
  dados: Record<string, any> | null;
  extratoId: number | null;
  contratoUrl: string | null;
  procuracaoUrl: string | null;
  extratoPdfUrl: string | null;
  termoAcordoPdfUrl: string | null;
  sentencaPdfUrl: string | null;
  setAll: (partial: Partial<AssinaturaState>) => void;
  reset: () => void;
};

export const useAssinaturaStore = create<AssinaturaState>((set) => ({
  dados: null,
  extratoId: null,
  contratoUrl: null,
  procuracaoUrl: null,
  extratoPdfUrl: null,
  termoAcordoPdfUrl: null,
  sentencaPdfUrl: null,
  setAll: (partial) => set((s) => ({ ...s, ...partial })),
  reset: () =>
    set({
      dados: null,
      extratoId: null,
      contratoUrl: null,
      procuracaoUrl: null,
      extratoPdfUrl: null,
      termoAcordoPdfUrl: null,
      sentencaPdfUrl: null,
    }),
}));
