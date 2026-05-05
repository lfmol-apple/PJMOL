import os
import json
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import cm
from app.core.time import now_sp


def exportar_dados_completos(parcelas, dados):
    os.makedirs("saida", exist_ok=True)

    parcelas_validas = []
    for p in parcelas:
        try:
            parcelas_validas.append({
                "Data de Pagamento": p.get("data_pagamento"),
                "Valor Pago": float(p.get("valor_pago", 0)),
                "Corrigido Hoje": float(p.get("valor_corrigido_hoje", 0)),
                "Corrigido Futuro": float(p.get("valor_corrigido_futuro", 0)),
                "Taxa Adm Parcela": float(p.get("taxa_administracao_parcela", 0))
            })
        except:
            continue

    if not parcelas_validas:
        raise ValueError("Nenhuma parcela válida encontrada.")

    try:
        juros = float(dados.get("taxa_juros_percentual", 0)) / 100
        percent_honorarios = float(str(dados.get("honorarios_percentual", "0")).replace("%", "")) / 100
        adm = float(dados.get("taxa_administracao_deduzida", 0))
        outros = float(dados.get("valor_outros_custos", 0))

        dados["valor_com_juros_hoje"] = round(float(dados.get("valor_corrigido", 0)) * (1 + juros), 2)
        dados["valor_com_juros_futuro"] = round(float(dados.get("valor_futuro", 0)) * (1 + juros), 2)

        dados["valor_corrigido_liquido_hoje"] = round(dados["valor_com_juros_hoje"] - adm, 2)
        dados["valor_corrigido_liquido_futuro"] = round(dados["valor_com_juros_futuro"] - adm, 2)

        dados["honorarios_total_hoje"] = round(dados["valor_com_juros_hoje"] * percent_honorarios, 2)
        dados["honorarios_total_futuro"] = round(dados["valor_com_juros_futuro"] * percent_honorarios, 2)

        dados["valor_final_liquido_hoje"] = round(
            dados["valor_corrigido_liquido_hoje"] - dados["honorarios_total_hoje"] - outros, 2)
        dados["valor_final_liquido_futuro"] = round(
            dados["valor_corrigido_liquido_futuro"] - dados["honorarios_total_futuro"] - outros, 2)

    except Exception as e:
        print(f"[ERRO] Falha ao calcular campos finais: {e}")

    nome_cliente = dados.get("nome_cliente", "extrato")
    nomes = nome_cliente.strip().split()
    base_nome = f"{nomes[0]}_{nomes[-1]}".lower().replace('.', '').replace(',', '').replace('-', '_')
    timestamp = now_sp().strftime("%Y%m%d_%H%M%S")
    nome_arquivo = f"{base_nome}_{timestamp}"
    caminho_excel = os.path.join("saida", f"{nome_arquivo}_extrato.xlsx")
    caminho_json = os.path.join("saida", f"{nome_arquivo}_extrato.json")
    caminho_pdf = os.path.join("saida", f"{nome_arquivo}_extrato.pdf")

    df_parcelas = pd.DataFrame(parcelas_validas)
    df_dados = pd.DataFrame([dados])
    with pd.ExcelWriter(caminho_excel) as writer:
        df_parcelas.to_excel(writer, index=False, sheet_name="Parcelas")
        df_dados.T.to_excel(writer, sheet_name="Resumo", header=False)

    with open(caminho_json, "w", encoding="utf-8") as f:
        json.dump({"dados_basicos": dados, "parcelas": parcelas_validas}, f, ensure_ascii=False, indent=2)

    c = canvas.Canvas(caminho_pdf, pagesize=A4)
    largura, altura = A4
    y = altura - 2 * cm

    c.setFont("Helvetica-Bold", 14)
    c.drawString(2 * cm, y, "Resumo do Extrato de Consórcio")
    y -= 1 * cm

    c.setFont("Helvetica", 10)
    for k, v in dados.items():
        c.drawString(2 * cm, y, f"{k}: {v}")
        y -= 0.45 * cm
        if y < 4 * cm:
            c.showPage()
            y = altura - 2 * cm

    c.setFont("Helvetica-Bold", 12)
    c.drawString(2 * cm, y, "Parcelas Pagas:")
    y -= 0.6 * cm
    c.setFont("Helvetica", 9)
    for p in parcelas_validas:
        linha = f"- {p['Data de Pagamento']} | Pago: R$ {p['Valor Pago']:.2f} | Corr. Hoje: R$ {p['Corrigido Hoje']:.2f} | Futuro: R$ {p['Corrigido Futuro']:.2f} | Adm: R$ {p['Taxa Adm Parcela']:.2f}"
        c.drawString(2 * cm, y, linha[:115])
        y -= 0.4 * cm
        if y < 3.5 * cm:
            c.showPage()
            y = altura - 2 * cm

    y -= 0.5 * cm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(2 * cm, y, "💰 RESUMO FINAL CORRIGIDO COM JUROS")
    y -= 0.6 * cm
    c.setFont("Helvetica", 10)

    def format_reais(valor):
        try:
            return f"R$ {float(valor):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        except:
            return "R$ 0,00"

    def linha_destaque(label, chave):
        nonlocal y
        valor = dados.get(chave, 0)
        c.drawString(2 * cm, y, f"{label}: {format_reais(valor)}")
        y -= 0.4 * cm
        if y < 3 * cm:
            c.showPage()
            y = altura - 2 * cm

    linha_destaque("✔️ Valor com Juros Hoje", "valor_com_juros_hoje")
    linha_destaque("✔️ Valor com Juros Futuro", "valor_com_juros_futuro")
    linha_destaque("(-) Taxa de Administração", "taxa_administracao_deduzida")
    linha_destaque("✔️ Valor Corrigido Hoje (líquido)", "valor_corrigido_liquido_hoje")
    linha_destaque("✔️ Valor Corrigido Futuro (líquido)", "valor_corrigido_liquido_futuro")

    y -= 0.2 * cm
    c.drawString(2 * cm, y, "(-) Honorários:")
    y -= 0.4 * cm
    c.drawString(2.5 * cm, y, f"Hoje: {format_reais(dados.get('honorarios_total_hoje', 0))}")
    y -= 0.4 * cm
    c.drawString(2.5 * cm, y, f"Futuro: {format_reais(dados.get('honorarios_total_futuro', 0))}")
    y -= 0.4 * cm

    linha_destaque("(-) Outros Custos", "valor_outros_custos")

    y -= 0.2 * cm
    c.setFont("Helvetica-Bold", 10)
    linha_destaque("✅ Valor Final Líquido Hoje", "valor_final_liquido_hoje")
    linha_destaque("✅ Valor Final Líquido Futuro", "valor_final_liquido_futuro")

    c.save()

    return {
        "excel": os.path.basename(caminho_excel),
        "json": os.path.basename(caminho_json),
        "pdf": os.path.basename(caminho_pdf),
    }
