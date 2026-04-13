"use client";
import { create } from "zustand";

type DocData = {
  nomeCliente?: string;
  telefoneCliente?: string;
  emailCliente?: string;
  usuarioAdvogado?: string;
  // adicione outros campos que já preenche (CPF, OAB etc.)
};

type DocState = {
  data: DocData;
  setData: (d: Partial<DocData>) => void;
  reset: () => void;
};

export const useDocData = create<DocState>((set) => ({
  data: {},
  setData: (d) => set((s) => ({ data: { ...s.data, ...d } })),
  reset: () => set({ data: {} }),
}));
