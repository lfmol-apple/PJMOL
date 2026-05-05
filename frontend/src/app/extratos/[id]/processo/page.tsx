"use client";
import { use } from "react";

export default function ProcessoReusaHomePage(
  props: { params: Promise<{ id: string }> }
) {
  const params = use(props.params);
  const { id } = params;

  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">Processo — Extrato {id}</h1>
      {/* TODO: mantenha aqui o restante do seu código original */}
    </main>
  );
}
