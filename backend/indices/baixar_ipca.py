import os
from io import StringIO
from typing import Optional

import pandas as pd
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.normpath(os.path.join(BASE_DIR, "tabelas", "ipca"))
ARQUIVO_SAIDA = "ipca_historico.csv"
URL_IPCA = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=csv"


def baixar_ipca(destino: Optional[str] = None) -> str:
    """
    Baixa a série histórica do IPCA no formato CSV e salva no diretório de índices.

    Returns o caminho do arquivo salvo.
    """
    destino_final = destino or DEFAULT_OUTPUT_DIR
    os.makedirs(destino_final, exist_ok=True)

    print("📥 Baixando dados do IPCA do Banco Central...")
    resposta = requests.get(URL_IPCA, timeout=60)
    resposta.raise_for_status()
    resposta.encoding = "utf-8"

    df = pd.read_csv(StringIO(resposta.text), sep=";", encoding="utf-8")

    if "data" in df.columns and "valor" in df.columns:
        df.columns = ["DATA", "IPCA"]
    else:
        raise ValueError("Formato inesperado na resposta da API do Bacen para o IPCA.")

    df["DATA"] = pd.to_datetime(df["DATA"], format="%d/%m/%Y")
    df["ANO"] = df["DATA"].dt.year
    _MESES_PT = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio',
                 6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro',
                 11: 'Novembro', 12: 'Dezembro'}
    df["MES"] = df["DATA"].dt.month.map(_MESES_PT)

    df["IPCA"] = df["IPCA"].astype(str).str.replace(",", ".").astype(float)
    df_final = df[["ANO", "MES", "IPCA"]]

    caminho_final = os.path.join(destino_final, ARQUIVO_SAIDA)
    df_final.to_csv(caminho_final, index=False, encoding="utf-8")
    print(f"✅ IPCA salvo em {caminho_final}")
    return caminho_final


if __name__ == "__main__":
    baixar_ipca()
