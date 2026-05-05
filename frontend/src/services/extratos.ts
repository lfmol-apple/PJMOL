// src/services/extratos.ts
import { api, API_BASE } from "@/lib/api";

// cria e retorna o ID
export async function criarExtrato(payload: any): Promise<number> {
  const r = await api.post(`/extratos`, payload);
  return r.data?.id;
}

// busca um extrato completo (usaremos para merge)
export async function getExtrato(id: number): Promise<any> {
  const r = await api.get(`/extratos/${id}`);
  return r.data;
}

// ⚠️ PUT integral: mescla o atual com o patch antes de enviar
export async function atualizarExtrato(id: number, patch: any): Promise<void> {
  // 1) pega o registro atual (vem com todos os obrigatórios)
  const atual = await getExtrato(id);

  // 2) mescla com o que queremos alterar agora
  const merged: any = { ...atual, ...patch };

  // 3) remove campos somente-leitura/derivados/relacionados que o backend não quer no PUT
  const OMITIR = new Set<string>([
    "id",
    "usuario_id",
    "criado_em",
    "atualizado_em",
    "advogado_nome",
    "advogado_email",
    "advogado_telefone",
    "parcelas",
    "custas",
    "anexos",
  ]);
  for (const k of Array.from(Object.keys(merged))) {
    if (OMITIR.has(k)) delete merged[k];
  }

  // 4) envia o corpo integral já válido p/ o modelo do backend
  await api.put(`/extratos/${id}`, merged);
}
