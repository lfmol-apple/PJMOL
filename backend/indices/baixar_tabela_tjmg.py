import os
import time
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

URL_TJMG = "https://www.tjmg.jus.br/portal-tjmg/processos/indicadores/fator-de-atualizacao-monetaria.htm"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "tabelas", "tjmg")


def baixar_tabela_tjmg(destino: Optional[str] = None) -> str:
    """
    Baixa a planilha oficial do TJMG com os fatores de atualização monetária e salva como CSV.

    Retorna o caminho do arquivo CSV gerado.
    """
    destino_final = destino or DEFAULT_OUTPUT_DIR
    os.makedirs(destino_final, exist_ok=True)

    print("🚀 Acessando página do TJMG com Selenium...")

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-setuid-sandbox")
    options.add_argument("--no-zygote")
    options.add_argument("--window-size=1920,1080")

    # Usa o Chromium do sistema (snap) em produção, ChromeDriverManager localmente
    SNAP_DRIVER = "/snap/chromium/current/usr/lib/chromium-browser/chromedriver"
    SNAP_BINARY = "/snap/chromium/current/usr/lib/chromium-browser/chrome"
    CHROME_BINARY = "/usr/bin/google-chrome"

    if os.path.exists(CHROME_BINARY):
        # Google Chrome instalado via .deb — usa chromedriver do snap se versões baterem
        options.binary_location = CHROME_BINARY
        if os.path.exists(SNAP_DRIVER):
            service = Service(executable_path=SNAP_DRIVER)
        else:
            service = Service(ChromeDriverManager().install())
    elif os.path.exists(SNAP_DRIVER):
        service = Service(executable_path=SNAP_DRIVER)
        options.binary_location = SNAP_BINARY
    else:
        service = Service(ChromeDriverManager().install())

    with webdriver.Chrome(service=service, options=options) as driver:
        driver.get(URL_TJMG)
        time.sleep(4)
        soup = BeautifulSoup(driver.page_source, "html.parser")
        links = soup.find_all("a", href=True)

        excel_links = []
        for tag in links:
            href = tag["href"]
            if "fileDownload.jsp?fileId=" in href:
                url_completa = "https://www.tjmg.jus.br" + href.replace("..", "")
                try:
                    head = requests.head(url_completa, timeout=10)
                    content_type = head.headers.get("Content-Type", "")
                    if "spreadsheetml" in content_type or "excel" in content_type:
                        excel_links.append(url_completa)
                except Exception:
                    continue

        if not excel_links:
            raise RuntimeError("Nenhum arquivo Excel válido encontrado na página do TJMG.")

        link_mais_recente = excel_links[0]
        print(f"📥 Baixando: {link_mais_recente}")

        resposta = requests.get(link_mais_recente, timeout=60)
        resposta.raise_for_status()

        caminho_temporario = os.path.join(destino_final, "temporario.xlsx")
        with open(caminho_temporario, "wb") as f:
            f.write(resposta.content)
        print(f"✅ Arquivo baixado: {caminho_temporario}")

        try:
            df = pd.read_excel(caminho_temporario, engine="openpyxl")
        finally:
            if os.path.exists(caminho_temporario):
                os.remove(caminho_temporario)

    for i, row in df.iterrows():
        if str(row[0]).strip().upper() == "ANO":
            df_dados = df.iloc[i + 1 :].copy()
            df_dados.columns = ["ANO", "MES", "INDICE"]
            break
    else:
        raise ValueError("Cabeçalho 'ANO, MÊS, ÍNDICE' não encontrado no arquivo do TJMG.")

    df_dados = df_dados.dropna().copy()
    df_dados["MES"] = df_dados["MES"].astype(str).str.strip().str.capitalize()

    caminho_csv = os.path.join(destino_final, "tjmg_historico.csv")
    df_dados.to_csv(caminho_csv, index=False)
    print(f"✅ Tabela TJMG salva como: {caminho_csv}")
    return caminho_csv


# compatibilidade com chamadas antigas
baixar_tabela_mg = baixar_tabela_tjmg


if __name__ == "__main__":
    baixar_tabela_tjmg()
