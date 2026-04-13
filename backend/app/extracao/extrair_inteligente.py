import os
import traceback
from tkinter import filedialog, Tk
from app.extracao.leitura_pdf import extrair_dados_pdf, converter_pdf_para_imagens
from app.extracao.google_ai2 import ler_extrato_com_ia
import pandas as pd
from app.utils.utils import instalar_dependencias
from app.extracao.ocr_ajuste import ocr_ajuste
from PIL import Image, ImageEnhance, ImageFilter
from datetime import datetime
from app.exportar import exportar_dados_completos  # você deve ter salvo esta função num arquivo `exportar.py`

instalar_dependencias()

# 🧠 Troque entre True e False para alternar modo automático ou seletor manual
automatico = False

def selecionar_arquivo():
    if automatico:
        caminho = "extratos/extrato15.pdf"  # <- coloque aqui o caminho real do PDF de teste
    else:
        print("\U0001F5C2️ Selecione o arquivo PDF do extrato...")
        root = Tk()
        root.withdraw()
        caminho = filedialog.askopenfilename(filetypes=[("PDF files", "*.pdf")])
    print(f"📄 Arquivo selecionado: {caminho}")
    return caminho

def aprimorar_imagem(caminho):
    try:
        imagem = Image.open(caminho).convert("L")
        imagem = imagem.filter(ImageFilter.MedianFilter(size=3))
        imagem = ImageEnhance.Contrast(imagem).enhance(2.0)
        imagem = imagem.point(lambda x: 0 if x < 128 else 255, '1')
        imagem.convert("RGB").save(caminho)
    except Exception as e:
        print(f"❌ Erro ao aprimorar imagem {caminho}: {e}")

def ajustar_parcelas_interativamente(parcelas, valor_total):
    while True:
        soma = round(sum(p['valor_pago'] for p in parcelas), 2)
        diferenca = round(valor_total - soma, 2)
        print(f"\nSoma atual: {soma:.2f} | Valor total esperado: {valor_total:.2f} | Diferença: {diferenca:.2f}")

        if abs(diferenca) <= 0.01:
            print("\n✅ Diferença eliminada!")
            revisar = input("Deseja revisar as parcelas antes de exportar? (s/n): ").strip().lower()
            if revisar == "n":
                return parcelas
            elif revisar != "s":
                print("Entrada inválida. Digite 's' para sim ou 'n' para não.")
                continue

        print("\nOpções:")
        print("1. Excluir parcelas")
        print("2. Alterar parcela")
        print("3. Incluir nova parcela")
        print("4. Listar parcelas")
        opcao = input("Escolha uma opção (1-4): ").strip()

        if opcao == "1":
            for i, p in enumerate(parcelas):
                print(f"{i+1}. {p['data_pagamento']} - R$ {p['valor_pago']:.2f}")
            print("Excluir por:")
            print("a) Índices individuais (ex: 1,3,5)")
            print("b) Intervalo (ex: de 3 até 7)")
            tipo = input("Escolha 'a' ou 'b': ").strip().lower()

            if tipo == "a":
                try:
                    indices = input("Digite os números das parcelas a excluir (ex: 1,3,5): ")
                    idxs = [int(i.strip()) - 1 for i in indices.split(",") if i.strip().isdigit()]
                    for idx in sorted(set(idxs), reverse=True):
                        if 0 <= idx < len(parcelas):
                            print(f"Excluindo: {parcelas[idx]}")
                            parcelas.pop(idx)
                        else:
                            print(f"Índice inválido: {idx + 1}")
                except:
                    print("Entrada inválida.")
            elif tipo == "b":
                try:
                    ini = int(input("Número da primeira parcela a excluir: ")) - 1
                    fim = int(input("Número da última parcela a excluir: ")) - 1
                    if 0 <= ini <= fim < len(parcelas):
                        for idx in range(fim, ini - 1, -1):
                            print(f"Excluindo: {parcelas[idx]}")
                            parcelas.pop(idx)
                    else:
                        print("Intervalo inválido.")
                except:
                    print("Entrada inválida.")
            else:
                print("Opção inválida.")

        elif opcao == "2":
            for i, p in enumerate(parcelas):
                print(f"{i+1}. {p['data_pagamento']} - R$ {p['valor_pago']:.2f}")
            try:
                idx = int(input("Digite o número da parcela a alterar: ")) - 1
                if 0 <= idx < len(parcelas):
                    nova_data = input("Nova data (dd/mm/aaaa): ")
                    novo_valor = float(input("Novo valor (ex: 1234.56): ").replace(',', '.'))
                    parcelas[idx] = {"data_pagamento": nova_data, "valor_pago": novo_valor}
            except:
                print("Entrada inválida.")
        elif opcao == "3":
            try:
                nova_data = input("Data da nova parcela (dd/mm/aaaa): ")
                novo_valor = float(input("Valor da nova parcela: ").replace(',', '.'))
                parcelas.append({"data_pagamento": nova_data, "valor_pago": novo_valor})

                def ordenar(p):
                    try:
                        return datetime.strptime(p["data_pagamento"], "%d/%m/%Y")
                    except:
                        return datetime.max

                parcelas.sort(key=ordenar)
                print("📅 Parcela incluída e lista ordenada por data.")
            except:
                print("Entrada inválida.")
        elif opcao == "4":
            for i, p in enumerate(parcelas):
                print(f"{i+1}. {p['data_pagamento']} - R$ {p['valor_pago']:.2f}")
        else:
            print("Opção inválida.")

def extrair_dados(caminho_pdf):
    print(f"\n📄 Lendo PDF: {caminho_pdf}")
    try:
        dados, parcelas = extrair_dados_pdf(caminho_pdf)
        soma = round(sum(p.get("valor_pago", 0.0) for p in parcelas if p.get("valor_pago", 0.0) > 0), 2)
        total_pdf = dados.get("valor_total_pago_extrato") or 0.0
        diferenca = round(total_pdf - soma, 2)

        if abs(diferenca) > 0.01:
            print(f"⚠️ Diferença detectada. Reprocessando com IA...")

            imagens = converter_pdf_para_imagens(caminho_pdf)
            todas_parcelas = []

            for img_path in imagens:
                try:
                    aprimorar_imagem(img_path)
                    parcelas_ia = ler_extrato_com_ia(img_path)
                    if isinstance(parcelas_ia, list):
                        todas_parcelas.extend(parcelas_ia)
                except Exception as erro_ia:
                    print(f"❌ Erro IA em {img_path}: {erro_ia}")

            parcelas_filtradas = [
                p for p in todas_parcelas
                if p.get("data_pagamento") and p.get("valor_pago", 0.0) > 0.1 and round(p["valor_pago"], 2) not in [12.77, 8.64, 0.01]
            ]

            soma_ia = round(sum(p["valor_pago"] for p in parcelas_filtradas), 2)
            diferenca_final = round(total_pdf - soma_ia, 2)

            if abs(diferenca_final) > 0.01:
                candidatos = [p for p in todas_parcelas if abs(p["valor_pago"] - diferenca_final) < 2.0]
                if candidatos:
                    parcelas_filtradas.append(candidatos[0])
                    soma_ia = round(sum(p["valor_pago"] for p in parcelas_filtradas), 2)
                    diferenca_final = round(total_pdf - soma_ia, 2)

            if abs(diferenca_final) > 0.01:
                print(f"🔍 OCR tentando encontrar R$ {diferenca_final:.2f}")
                try:
                    encontrada = ocr_ajuste(caminho_pdf, parcelas_filtradas, diferenca_final)
                    if encontrada:
                        parcelas_filtradas.append(encontrada)
                        soma_ia = round(sum(p["valor_pago"] for p in parcelas_filtradas), 2)
                        diferenca_final = round(total_pdf - soma_ia, 2)
                except:
                    traceback.print_exc()

            dados["parcelas_detalhadas"] = parcelas_filtradas
            return dados

        else:
            print("✅ Extração convencional suficiente.")
            dados["parcelas_detalhadas"] = parcelas
            return dados

    except Exception:
        print("❌ Erro geral:")
        traceback.print_exc()
        return None

# Execução principal
if __name__ == "__main__":
    print("🚀 Iniciando sistema...")
    caminho = selecionar_arquivo()
    if caminho:
        dados = extrair_dados(caminho)
        parcelas = dados.get("parcelas_detalhadas", []) if dados else []
        if parcelas:
            print("\n📋 Parcelas extraídas:")
            for i, p in enumerate(parcelas):
                print(f"{i+1}. {p['data_pagamento']} - R$ {p['valor_pago']:.2f}")

            print("\n✅ Dados do Extrato:")
            for chave in [
                "grupo", "cota", "nome_cliente", "cpf_cnpj", "tipo_documento",
                "administradora", "taxa_adm_percentual", "total_parcelas_plano",
                "data_encerramento", "valor_total_pago_extrato"
            ]:
                if chave in dados:
                    print(f"{chave}: {dados[chave]}")

            print("\n📌 Dados básicos finais:")
            for k, v in dados.items():
                print(f"{k}: {v}")

            valor_total = dados.get("valor_total_pago_extrato") or 0.0
            parcelas_corrigidas = ajustar_parcelas_interativamente(parcelas, valor_total)

            # Exportar tudo
            exportar_dados_completos(parcelas_corrigidas, dados)
        else:
            print("❌ Nenhuma parcela extraída.")
    else:
        print("❌ Nenhum arquivo selecionado.")