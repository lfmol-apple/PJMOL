import requests
import pandas as pd
import os
from datetime import datetime
from io import StringIO  # Leitura do CSV direto da resposta

# Diretório de saída absoluto baseado no local deste script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIRETORIO_SAIDA = os.path.normpath(os.path.join(BASE_DIR, "tabelas", "poupanca"))
ARQUIVO_SAIDA = "poupanca_historico.csv"
URL_POUPANCA = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4390/dados?formato=csv"  # Série 4390 = Poupança

# Cria o diretório se não existir
os.makedirs(DIRETORIO_SAIDA, exist_ok=True)

# Baixa os dados da API do Bacen
print("📥 Baixando dados da Poupança do Banco Central...")
resposta = requests.get(URL_POUPANCA)
resposta.encoding = 'utf-8'

if resposta.status_code != 200:
    raise Exception(f"Erro ao baixar dados da Poupança: {resposta.status_code}")

# Lê CSV direto da resposta
df = pd.read_csv(StringIO(resposta.text), sep=';', encoding='utf-8')

# Renomeia colunas
if 'data' in df.columns and 'valor' in df.columns:
    df.columns = ['DATA', 'POUPANCA']
else:
    raise Exception("Formato inesperado na resposta da API do Bacen.")

_MESES_PT = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio',
             6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro',
             11: 'Novembro', 12: 'Dezembro'}

# Converte data e extrai mês e ano
df['DATA'] = pd.to_datetime(df['DATA'], format='%d/%m/%Y')
df['ANO'] = df['DATA'].dt.year
df['MES'] = df['DATA'].dt.month.map(_MESES_PT)

# Converte Poupança para float
df['POUPANCA'] = df['POUPANCA'].astype(str).str.replace(',', '.').astype(float)

# Seleciona e reordena colunas
df_final = df[['ANO', 'MES', 'POUPANCA']]

# Caminho final para salvar o arquivo
caminho_final = os.path.join(DIRETORIO_SAIDA, ARQUIVO_SAIDA)
df_final.to_csv(caminho_final, index=False, encoding='utf-8')

print(f"✅ Poupança salva em {caminho_final}")
