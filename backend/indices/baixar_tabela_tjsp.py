import os
import fitz  # PyMuPDF
import re
import requests
import pandas as pd
from datetime import datetime

# Diretório de saída
PASTA_SAIDA = os.path.join(os.path.dirname(__file__), "tabelas", "tjsp")
os.makedirs(PASTA_SAIDA, exist_ok=True)

# URL da tabela do TJSP (PDF)
URL_TJSP = "https://api.tjsp.jus.br/Handlers/Handler/FileFetch.ashx?codigo=166748"

# Nome temporário do PDF
PDF_TEMP = os.path.join(PASTA_SAIDA, "tabela_tjsp_temp.pdf")

def baixar_pdf():
    print("📥 Baixando PDF da tabela TJSP...")
    response = requests.get(URL_TJSP)
    if response.status_code != 200:
        raise Exception(f"Erro ao baixar PDF: {response.status_code}")
    with open(PDF_TEMP, "wb") as f:
        f.write(response.content)
    print("✅ Download concluído.")

def extrair_tabela_do_pdf(caminho_pdf):
    print("🔍 Extraindo dados do PDF...")
    doc = fitz.open(caminho_pdf)
    dados = []

    padrao = re.compile(r"(\d{2}/\d{4})\s+([\d,]+)")

    for pagina in doc:
        texto = pagina.get_text()
        for linha in texto.split("\n"):
            match = padrao.search(linha)
            if match:
                mes_ano = match.group(1)
                fator = match.group(2).replace(".", "").replace(",", ".")
                try:
                    fator_float = float(fator)
                    dados.append({
                        "DATA": mes_ano,
                        "FATOR": fator_float
                    })
                except ValueError:
                    continue

    if not dados:
        raise ValueError("Nenhum dado extraído do PDF.")
    
    print(f"✅ {len(dados)} linhas extraídas.")
    return dados

def salvar_csv(dados):
    df = pd.DataFrame(dados)
    # Extrai a última data para nomear o arquivo
    ultima_data = df["DATA"].iloc[-1]
    mes, ano = ultima_data.split("/")
    nome_csv = f"tabela_tjsp_{ano}_{mes}.csv"
    caminho_csv = os.path.join(PASTA_SAIDA, nome_csv)
    df.to_csv(caminho_csv, sep=";", index=False)
    print(f"💾 CSV salvo em: {caminho_csv}")

def main():
    baixar_pdf()
    dados = extrair_tabela_do_pdf(PDF_TEMP)
    salvar_csv(dados)
    os.remove(PDF_TEMP)
    print("🧼 Arquivo PDF temporário removido.")

if __name__ == "__main__":
    main()
