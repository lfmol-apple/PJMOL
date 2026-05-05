// Converte de 'yyyy-mm-dd' para 'dd/mm/yyyy'
export function formatarParaBR(data: string): string {
  if (!data || !data.includes("-")) return data;
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Converte de 'dd/mm/yyyy' para 'yyyy-mm-dd'
export function converterParaISO(data: string): string {
  if (!data || !data.includes("/")) return data;
  const [dia, mes, ano] = data.split("/");
  return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}