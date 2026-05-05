import pandas as pd
from datetime import datetime
import os
from app.core.time import now_sp


# Dicionário de links ou caminhos por estado
TABELAS_INDICES_ESTADO = {
    "MG": "dados_tabelas/MG.csv",  # Exemplo: pasta local onde a tabela de MG foi salva
    # Adicione os demais estados aqui conforme necessário
}

def carregar_tabela_estado(estado):
    caminho = TABELAS_INDICES_ESTADO.get(estado.upper())
    if not caminho or not os.path.exists(caminho):
        raise FileNotFoundError(f"Tabela de índice para o estado {estado} não encontrada.")
    df = pd.read_csv(caminho, delimiter=";", decimal=",")
    df.columns = [col.strip().lower() for col in df.columns]
    return df

def obter_fator(df, data_origem, data_destino):
    df['data'] = pd.to_datetime(df['data'], format="%d/%m/%Y", errors='coerce')
    data_origem = pd.to_datetime(data_origem, dayfirst=True)
    data_destino = pd.to_datetime(data_destino, dayfirst=True)

    df = df.sort_values(by='data')
    fator_origem = df[df['data'] <= data_origem]['fator'].max()
    fator_destino = df[df['data'] <= data_destino]['fator'].max()

    if pd.isna(fator_origem) or pd.isna(fator_destino):
        raise ValueError("Fator não encontrado para as datas especificadas.")

    return fator_destino / fator_origem

def calcular_valor_corrigido_e_futuro(parcelas, estado, data_final):
    df = carregar_tabela_estado(estado)
    data_hoje = now_sp().strftime("%d/%m/%Y")
    valor_corrigido_total = 0.0
    valor_futuro_total = 0.0

    for parcela in parcelas:
        data = parcela["data_pagamento"]
        valor = parcela["valor_pago"]

        try:
            fator_corrigido = obter_fator(df, data, data_hoje)
            fator_futuro = obter_fator(df, data_hoje, data_final)
        except Exception as e:
            print(f"Erro ao calcular fator para data {data}: {e}")
            continue

        valor_corrigido = valor * fator_corrigido
        valor_futuro = valor_corrigido * fator_futuro
        valor_corrigido_total += valor_corrigido
        valor_futuro_total += valor_futuro

    return round(valor_corrigido_total, 2), round(valor_futuro_total, 2)
