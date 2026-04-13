import pandas as pd
from datetime import datetime, date
import os
import unicodedata
from typing import List, Dict, Any, Optional
from .config_calculo import ConfigCalculo
from dateutil.relativedelta import relativedelta


def normalizar(texto: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', texto) if unicodedata.category(c) != 'Mn')


def normalizar_data_para_date(data_entrada) -> date:
    """
    Converte datas em diferentes formatos para datetime.date,
    aceitando 'DD/MM/YYYY', 'YYYY-MM-DD', datetime ou date.
    """
    if not data_entrada:
        raise ValueError("Data de entrada vazia")

    if isinstance(data_entrada, date):
        return data_entrada

    if isinstance(data_entrada, datetime):
        return data_entrada.date()

    if isinstance(data_entrada, str):
        data_entrada = data_entrada.strip()
        if not data_entrada:
            raise ValueError("Data de entrada é uma string vazia")
        try:
            if "/" in data_entrada:
                return datetime.strptime(data_entrada, "%d/%m/%Y").date()
            elif "-" in data_entrada:
                return datetime.strptime(data_entrada, "%Y-%m-%d").date()
        except Exception as e:
            raise ValueError(f"Erro ao converter data '{data_entrada}': {e}")

    raise ValueError(f"Tipo de data inválido: {type(data_entrada)}")


def calcular_taxa_adm_devida(valor_pago: float, taxa_contratada: float, total_parcelas: int, parcelas_pagas: int) -> Dict[str, float]:
    percentual_exato = (taxa_contratada / total_parcelas) * parcelas_pagas
    valor_desconto = valor_pago * (percentual_exato / 100)
    valor_liquido = valor_pago - valor_desconto
    return {
        "percentual_exato": percentual_exato,
        "percentual_exibicao": round(percentual_exato, 2),
        "valor_desconto": round(valor_desconto, 2),
        "valor_liquido": round(valor_liquido, 2)
    }


def carregar_tabela_tjmg() -> pd.DataFrame:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    caminho = os.path.normpath(os.path.join(base_dir, "..", "..", "indices", "tabelas", "tjmg"))
    arquivos = sorted([f for f in os.listdir(caminho) if f.endswith(".csv")])
    if not arquivos:
        raise ValueError(f"Nenhuma tabela TJMG encontrada em {caminho}")
    df = pd.read_csv(os.path.join(caminho, arquivos[-1]), encoding="utf-8")
    df.columns = [col.strip().upper() for col in df.columns]
    df = df[df.columns[:3]]
    df.columns = ["ANO", "MES", "INDICE"]
    df = df.dropna()
    df["MES"] = df["MES"].astype(str).str.strip().str.capitalize().apply(normalizar)
    return df


def carregar_tabela_ipca() -> pd.DataFrame:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    caminho = os.path.normpath(os.path.join(base_dir, "..", "..", "indices", "tabelas", "ipca"))
    arquivos = sorted([f for f in os.listdir(caminho) if f.endswith(".csv")])
    if not arquivos:
        raise ValueError(f"Nenhuma tabela IPCA encontrada em {caminho}")
    df = pd.read_csv(os.path.join(caminho, arquivos[-1]), encoding="utf-8")
    df.columns = [col.strip().upper() for col in df.columns]
    df = df[["ANO", "MES", "IPCA"]]
    df["MES"] = df["MES"].astype(str).str.strip().str.capitalize().apply(normalizar)
    return df


def obter_fator(df: pd.DataFrame, data: date, coluna="INDICE") -> Optional[float]:
    meses_pt = {
        1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
        5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
        9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
    }
    ano = data.year
    mes = data.month
    for _ in range(24):
        nome_mes = normalizar(meses_pt[mes])
        linha = df[(df["ANO"] == ano) & (df["MES"] == nome_mes)]
        if not linha.empty:
            try:
                return float(linha[coluna].values[0])
            except Exception:
                pass
        mes -= 1
        if mes == 0:
            mes = 12
            ano -= 1
    print(f"⚠️ Fator não encontrado para {data.strftime('%m/%Y')} após tentativa regressiva.")
    return None


def obter_ultima_data_tjmg(df: pd.DataFrame) -> date:
    ultimo_ano = int(df["ANO"].max())
    df_filtrado = df[df["ANO"] == ultimo_ano]
    ultimo_mes_nome = df_filtrado["MES"].iloc[-1]
    meses = {
        "Janeiro": 1, "Fevereiro": 2, "Março": 3, "Abril": 4,
        "Maio": 5, "Junho": 6, "Julho": 7, "Agosto": 8,
        "Setembro": 9, "Outubro": 10, "Novembro": 11, "Dezembro": 12
    }
    ultimo_mes = meses.get(normalizar(ultimo_mes_nome), 12)
    return date(ultimo_ano, ultimo_mes, 1)


def carregar_tabela_inpc() -> pd.DataFrame:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    caminho = os.path.normpath(os.path.join(base_dir, "..", "..", "indices", "tabelas", "inpc"))
    arquivos = sorted([f for f in os.listdir(caminho) if f.endswith(".csv")])
    if not arquivos:
        raise ValueError(f"Nenhuma tabela INPC encontrada em {caminho}")
    df = pd.read_csv(os.path.join(caminho, arquivos[-1]), encoding="utf-8")
    df.columns = [col.strip().upper() for col in df.columns]
    df = df[["ANO", "MES", "INPC"]]
    df["MES"] = df["MES"].astype(str).str.strip().str.capitalize().apply(normalizar)
    return df


def calcular_ipca_estimado(ipca_df: pd.DataFrame) -> float:
    """
    Calcula a média simples dos últimos 12 meses do IPCA, sem desconto.
    """
    ultimos_12 = ipca_df.tail(12)
    media = ultimos_12["IPCA"].mean()
    return round(media, 6)


def carregar_tabela_indice(nome_indice: str) -> pd.DataFrame:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    caminho = os.path.normpath(os.path.join(base_dir, "..", "..", "indices", "tabelas", nome_indice.lower()))
    arquivos = sorted([f for f in os.listdir(caminho) if f.endswith(".csv")])
    if not arquivos:
        raise ValueError(f"Nenhuma tabela encontrada para o índice {nome_indice} em {caminho}")
    df = pd.read_csv(os.path.join(caminho, arquivos[-1]), encoding="utf-8")
    df.columns = [col.strip().upper() for col in df.columns]

    if nome_indice.upper() == "TJMG":
        df = df[df.columns[:3]]
        df.columns = ["ANO", "MES", "INDICE"]
    elif nome_indice.upper() in ["IPCA", "INPC"]:
        df = df[["ANO", "MES", nome_indice.upper()]]
        df.columns = ["ANO", "MES", "INDICE"]
    else:
        raise ValueError(f"Índice desconhecido: {nome_indice}")

    df["MES"] = df["MES"].astype(str).str.strip().str.capitalize().apply(normalizar)
    return df


def calcular_valor_corrigido(
    parcelas: List[Dict[str, Any]],
    config: ConfigCalculo,
    data_destino_hoje: date,
    data_destino_futuro: date
) -> Dict[str, Any]:

    def is_percentual(indice_nome: str) -> bool:
        return indice_nome.upper() in ["IPCA", "INPC"]

    def calcular_media_12_meses(df: pd.DataFrame) -> float:
        return round(df["INDICE"].tail(12).mean(), 6)

    def meses_entre(d1: date, d2: date) -> int:
        return max(0, (d2.year - d1.year) * 12 + (d2.month - d1.month))

    df_hoje = carregar_tabela_indice(config.indice_corrigido_hoje)
    df_futuro = carregar_tabela_indice(config.indice_corrigido_futuro)

    tipo_indice_hoje = config.indice_corrigido_hoje.upper()
    tipo_indice_futuro = config.indice_corrigido_futuro.upper()

    data_max_futuro = obter_ultima_data_tjmg(df_futuro)
    media_futura = calcular_media_12_meses(df_futuro)

    total_corrigido_hoje = 0
    total_corrigido_futuro = 0

    for parcela in parcelas:
        try:
            data_pagamento = normalizar_data_para_date(parcela.get("data_pagamento"))
            valor_pago = float(parcela.get("valor_pago", 0))
            if valor_pago <= 0:
                parcela["valor_corrigido_hoje"] = 0
                parcela["valor_corrigido_futuro"] = 0
                continue

            # Cálculo para valor corrigido até hoje
            if is_percentual(tipo_indice_hoje):
                fator_hoje = 1.0
                data_iter = date(data_pagamento.year, data_pagamento.month, 1)
                while data_iter <= data_destino_hoje:
                    percentual = obter_fator(df_hoje, data_iter)
                    if percentual is not None:
                        fator_hoje *= (1 + percentual / 100)
                    data_iter = (data_iter.replace(day=1) + relativedelta(months=1))
                hoje_corrigido = valor_pago * fator_hoje
            else:
                fator_origem = obter_fator(df_hoje, data_pagamento)
                fator_destino = obter_fator(df_hoje, data_destino_hoje)
                if fator_origem is None or fator_destino is None:
                    raise ValueError("Fator não encontrado")
                hoje_corrigido = valor_pago * (fator_origem / fator_destino)

            # Cálculo para valor projetado até data futura
            if data_destino_futuro > data_max_futuro:
                meses_proj = meses_entre(data_max_futuro, data_destino_futuro)
                futuro_corrigido = hoje_corrigido * ((1 + media_futura / 100) ** meses_proj)
            else:
                if is_percentual(tipo_indice_futuro):
                    fator_futuro = 1.0
                    data_iter_fut = date(data_pagamento.year, data_pagamento.month, 1)
                    while data_iter_fut <= data_destino_futuro:
                        percentual = obter_fator(df_futuro, data_iter_fut)
                        if percentual is not None:
                            fator_futuro *= (1 + percentual / 100)
                        data_iter_fut = (data_iter_fut.replace(day=1) + relativedelta(months=1))
                    futuro_corrigido = valor_pago * fator_futuro
                else:
                    fator_origem = obter_fator(df_futuro, data_pagamento)
                    fator_destino = obter_fator(df_futuro, data_destino_futuro)
                    if fator_origem is None or fator_destino is None:
                        raise ValueError("Fator futuro não encontrado")
                    futuro_corrigido = valor_pago * (fator_origem / fator_destino)

            parcela["valor_corrigido_hoje"] = round(hoje_corrigido, 2)
            parcela["valor_corrigido_futuro"] = round(futuro_corrigido, 2)

            total_corrigido_hoje += hoje_corrigido
            total_corrigido_futuro += futuro_corrigido

        except Exception as e:
            print(f"❌ Erro ao calcular parcela ({parcela.get('data_pagamento')}): {e}")
            parcela["valor_corrigido_hoje"] = 0
            parcela["valor_corrigido_futuro"] = 0
            continue

    valor_juros_hoje = total_corrigido_hoje
    valor_juros_futuro = total_corrigido_futuro

    # Juros compostos se aplicável
    try:
        taxa = config.taxa_juros_mensal_percentual or 0
        aplicar = config.aplicar_juros and taxa > 0
        if aplicar and config.data_inicio_juros:
            data_inicio = normalizar_data_para_date(config.data_inicio_juros)
            meses_hoje = meses_entre(data_inicio, data_destino_hoje)
            meses_futuro = meses_entre(data_inicio, data_destino_futuro)
            valor_juros_hoje *= (1 + taxa / 100) ** meses_hoje
            valor_juros_futuro *= (1 + taxa / 100) ** meses_futuro
    except Exception as e:
        print(f"⚠️ Erro ao aplicar juros compostos: {e}")

    parcelas_pagas = sum(1 for p in parcelas if float(p.get("valor_pago", 0)) > 0 and p.get("tipo") == "parcela")
    valor_pago_extrato = float(config.valor_total_pago_extrato or 0)

    res_taxa = calcular_taxa_adm_devida(
        valor_pago=valor_pago_extrato,
        taxa_contratada=config.taxa_administracao_percentual_total or 0,
        total_parcelas=config.total_parcelas_plano or 1,
        parcelas_pagas=parcelas_pagas
    )

    taxa_adm_valor = res_taxa["valor_desconto"]
    taxa_adm_cobrada = valor_pago_extrato * ((config.taxa_administracao_percentual_total or 0) / 100)

    honorarios_pct = config.percentual_honorarios or 0
    honorarios_hoje = round(valor_juros_hoje * honorarios_pct / 100, 2)
    honorarios_futuro = round(valor_juros_futuro * honorarios_pct / 100, 2)

    outros_custos = config.outros_custos or 0
    liquido_hoje = valor_juros_hoje - taxa_adm_valor - honorarios_hoje - outros_custos
    liquido_futuro = valor_juros_futuro - taxa_adm_valor - honorarios_futuro - outros_custos

    return {
        "valor_corrigido_hoje": round(total_corrigido_hoje, 2),
        "valor_corrigido_futuro": round(total_corrigido_futuro, 2),
        "valor_corrigido_hoje_liquido": round(liquido_hoje, 2),
        "valor_corrigido_futuro_liquido": round(liquido_futuro, 2),
        "valor_com_juros_hoje": round(valor_juros_hoje, 2),
        "valor_com_juros_futuro": round(valor_juros_futuro, 2),
        "taxa_adm_devida_valor": round(taxa_adm_valor, 2),
        "taxa_adm_devida_percentual_exato": res_taxa["percentual_exato"],
        "taxa_adm_devida_percentual": round(res_taxa["percentual_exato"], 4),
        "valor_total_pago": round(valor_pago_extrato, 2),
        "valor_total_a_restituir": round(valor_pago_extrato - taxa_adm_valor, 2),
        "taxa_adm_cobrada_valor": round(taxa_adm_cobrada, 2),
        "honorarios_advogado_hoje": round(honorarios_hoje / 2, 2),
        "honorarios_empresa_hoje": round(honorarios_hoje / 2, 2),
        "honorarios_advogado_futuro": round(honorarios_futuro / 2, 2),
        "honorarios_empresa_futuro": round(honorarios_futuro / 2, 2),
        "outros_custos_deduzidos": round(outros_custos, 2),
        "valor_credito": round(config.valor_credito or 0, 2),
        "percentual_taxa_adm_cobrada": round((taxa_adm_cobrada / valor_pago_extrato) * 100 if valor_pago_extrato > 0 else 0, 4),
        "parcelas_corrigidas": parcelas
    }
