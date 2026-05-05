// src/app/previa/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAssinaturaStore } from "@/store/assinatura";
import { api } from "@/lib/api";

export default function PreviaPage() {
  const router = useRouter();
  const {
    dados,
    extratoId,
    contratoUrl,
    procuracaoUrl,
    extratoPdfUrl,
    termoAcordoPdfUrl,
    sentencaPdfUrl,
    reset,
  } = useAssinaturaStore();

  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!dados || !contratoUrl || !procuracaoUrl) {
      router.replace("/");
    }
  }, [dados, contratoUrl, procuracaoUrl, router]);

  // 🔵 INÍCIO: montagem de placeholders idênticos ao fluxo "bom"
  // Ajuste as chaves para exatamente os mesmos nomes usados no seu template da ZapSign
  const placeholders = useMemo(() => {
    const d = dados || {};
    const dataExtenso = new Date().toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const cidadeEstadoCliente = `${d.cidade || ""}/${d.estado || ""}`;

    const enderecoCliente = (() => {
      const rua = d.rua || "";
      const numero = d.numero || "";
      const complemento = d.complemento ? ` - ${d.complemento}` : "";
      const bairro = d.bairro || "";
      const cidade = d.cidade || "";
      const estado = d.estado || "";
      const cep = d.cep || "";
      return `${rua}, ${numero}${complemento} - ${bairro} - ${cidade}/${estado} - CEP ${cep}`;
    })();

    // Se você salvou snapshot do advogado no form:
    const advogadoNome = d.advogado_nome || d.advogado || "";
    const advogadoOab = d.advogado_oab || "";
    const percHonorarios =
      typeof d.honorarios_percentual === "string"
        ? d.honorarios_percentual
        : d.honorarios_percentual != null
        ? `${d.honorarios_percentual}%`
        : "";

    // Nomes de chaves AQUI precisam bater 1:1 com o que seu template ZapSign espera
    return {
      NOME_CLIENTE: d.nome_cliente || "",
      CPF: d.cpf_cnpj || "",
      ENDERECO: enderecoCliente,
      CIDADE_ESTADO_CLIENTE: cidadeEstadoCliente,
      COMARCA: (d.comarca_escolhida || d.comarca_cliente_nome || "").replace(/^COMARCA DE\s*/i, ""),
      comarca_cliente: (d.comarca_cliente || (d.cidade && d.estado ? `${d.cidade}/${d.estado}` : ""))?.replace(/^COMARCA DE\s*/i, ""),
      comarca_administradora: (d.comarca_administradora || "")?.replace(/^COMARCA DE\s*/i, ""),
      ADMINISTRADORA: d.administradora || "",
      DATA_CONTRATO: dataExtenso,
      DATA_PROCURACAO: dataExtenso,
      ADVOGADO_NOME: advogadoNome,
      ADVOGADO_OAB: advogadoOab,
      PERCENTUAL_HONORARIOS: percHonorarios,
      TELEFONE: d.telefone || "",
    };
  }, [dados]);
  // 🔵 FIM

  const enviar = async () => {
    if (!dados || !contratoUrl || !procuracaoUrl) return;
    setSending(true);
    try {
      // 🔵 INÍCIO: payload para o backend com snapshot + URLs + placeholders (em extras)
      const payload = {
        id: extratoId ?? null,
        dados: {
          ...dados,
          // guardamos também os placeholders no registro (opcional, útil para auditoria)
          zapsign_placeholders: placeholders,
        },
        extrato_pdf_url: extratoPdfUrl || null,
        contrato_url: contratoUrl,
        procuracao_url: procuracaoUrl,
        termo_acordo_pdf_url: termoAcordoPdfUrl || null,
        sentenca_pdf_url: sentencaPdfUrl || null,
      };
      // 🔵 FIM

      // ✅ inclui o header X-Usuario-Id que o backend exige
      const { data } = await api.post("/assinaturas/enviar", payload, {
        headers: {
          "X-Usuario-Id": String(localStorage.getItem("usuarioId") || ""),
        },
      });

      // resposta rica p/ compat: { ok, id, status, bundle_id, links, ... }
      if (!data?.ok || !data?.id) {
        throw new Error("Resposta inválida da API");
      }

      // limpamos a prévia e voltamos para o formulário vendo tudo do banco
      reset();
      router.push(`/?id=${data.id}&enviado=1}`);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || e?.response?.data?.detail || "Erro ao enviar para assinatura");
    } finally {
      setSending(false);
    }
  };

  if (!dados || !contratoUrl || !procuracaoUrl) return null;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Prévia de Documentos</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="border rounded p-2">
          <h2 className="font-medium mb-2">Contrato</h2>
          <iframe src={contratoUrl} className="w-full h-[80vh] border rounded" />
        </section>
        <section className="border rounded p-2">
          <h2 className="font-medium mb-2">Procuração</h2>
          <iframe src={procuracaoUrl} className="w-full h-[80vh] border rounded" />
        </section>
      </div>

      {extratoPdfUrl && (
        <section className="border rounded p-2">
          <h2 className="font-medium mb-2">Extrato Original</h2>
          <iframe src={extratoPdfUrl} className="w-full h-[60vh] border rounded" />
        </section>
      )}

      <div className="pt-4 flex gap-3">
        <button onClick={() => history.back()} className="px-4 py-2 rounded border" disabled={sending}>
          Voltar e Editar
        </button>
        <button
          onClick={enviar}
          className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
          disabled={sending}
        >
          {sending ? "Enviando..." : "Enviar para Assinatura"}
        </button>
      </div>
    </div>
  );
}
