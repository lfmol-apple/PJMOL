import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd

def configurar_driver():
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    caminho_chromedriver = os.path.expanduser("~/bin/chromedriver")
    service = Service(caminho_chromedriver)
    driver = webdriver.Chrome(service=service, options=options)
    return driver

def buscar_tabela_tjmg():
    url = "https://www.tjmg.jus.br/portal-tjmg/processos/indicadores/fator-de-atualizacao-monetaria.htm"
    driver = configurar_driver()
    driver.get(url)

    try:
        # Aguarda o iframe carregar
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "iframe")))
        iframe = driver.find_element(By.TAG_NAME, "iframe")
        driver.switch_to.frame(iframe)

        # Aguarda a tabela dentro do iframe carregar
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "tabelaFator")))
        tabela_html = driver.find_element(By.ID, "tabelaFator").get_attribute("outerHTML")

        df = pd.read_html(tabela_html, decimal=',', thousands='.', flavor='bs4')[0]
        df.columns = [col.strip() for col in df.columns]
        df = df.rename(columns={df.columns[0]: "data", df.columns[1]: "fator"})
        df["data"] = pd.to_datetime(df["data"], dayfirst=True)
        df["fator"] = df["fator"].astype(float)
        return df

    except Exception as e:
        print(f"Erro ao buscar tabela TJMG: {e}")
        return pd.DataFrame()

    finally:
        driver.quit()

if __name__ == "__main__":
    tabela = buscar_tabela_tjmg()
    if not tabela.empty:
        print(tabela.head())
    else:
        print("Tabela não encontrada ou erro no carregamento.")