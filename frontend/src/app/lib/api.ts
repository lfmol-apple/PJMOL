// src/app/lib/api.ts
export function getApiBase(): string {
  const base = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000") as string;
  return base.replace(/\/+$/, "");
}

export async function apiSalvarExtratoOriginal(params: { file: File | Blob; extratoId: number | string; clienteNome?: string; }): Promise<any> {
  const { file, extratoId, clienteNome } = params;
  const base = getApiBase();
  const fd = new FormData();
  fd.append("arquivo", file);
  if (clienteNome) fd.append("cliente_nome", clienteNome);
  const res = await fetch(`${base}/extratos/${extratoId}/pdf`, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao salvar PDF do extrato: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function apiExtrair(file: File | Blob): Promise<any> {
  const base = getApiBase();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${base}/extrair`, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha no /extrair: ${res.status} ${txt}`);
  }
  return res.json();
}


export async function apiCriarExtrato(payload: Partial<Record<string, any>> = {}): Promise<{ id: number | string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/extratos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.detail || `Falha ao criar extrato (${res.status})`);
  }
  const id = (json?.id ?? json?.extrato_id ?? json?.pk ?? json?.data?.id);
  if (id === undefined || id === null || id === "") { throw new Error("Resposta de criação de extrato não retornou id"); }
  return { id };
}
