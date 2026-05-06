import requests
import pandas as pd
import os
from datetime import datetime
from io import StringIO

# Diretório de saída
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIRETORIO_SAIDA = os.path.normpath(os.path.join(BASE_DIR, "tabelas", "selic"))
ARQUIVO_SAIDA = "selic_historico.csv"
URL_SELIC = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados?formato=csv"  # Série 1178 = SELIC mensal

# Cria diretório se necessário
os.makedirs(DIRETORIO_SAIDA, exist_ok=True)

# Baixa os dados da API do Bacen
print("📥 Baixando dados da SELIC do Banco Central...")
HEADERS = {
    "Accept": "text/csv, application/json, */*",
    "User-Agent": "Mozilla/5.0 (compatible; pjmol-indices/1.0)"
}
resposta = requests.get(URL_SELIC, headers=HEADERS, timeout=30)
resposta.encoding = 'utf-8'

if resposta.status_code != 200:
    raise Exception(f"Erro ao baixar dados da SELIC: {resposta.status_code}")

# Lê CSV da resposta
df = pd.read_csv(StringIO(resposta.text), sep=';', encoding='utf-8')

# Verifica e renomeia colunas
if 'data' in df.columns and 'valor' in df.columns:
    df.columns = ['DATA', 'SELIC']
else:
    raise Exception("Formato inesperado na resposta da API do Bacen.")

_MESES_PT = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio',
             6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro',
             11: 'Novembro', 12: 'Dezembro'}

# Converte data e extrai mês e ano
df['DATA'] = pd.to_datetime(df['DATA'], format='%d/%m/%Y')
df['ANO'] = df['DATA'].dt.year
df['MES'] = df['DATA'].dt.month.map(_MESES_PT)

# Converte valor da SELIC para float
df['SELIC'] = df['SELIC'].astype(str).str.replace(',', '.').astype(float)

# Reorganiza as colunas
df_final = df[['ANO', 'MES', 'SELIC']]

# Salva CSV final
caminho_final = os.path.join(DIRETORIO_SAIDA, ARQUIVO_SAIDA)
df_final.to_csv(caminho_final, index=False, encoding='utf-8')

print(f"✅ SELIC salva em {caminho_final}")
