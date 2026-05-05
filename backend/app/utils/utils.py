import subprocess
import sys
import re
from dateutil import parser
from datetime import datetime, date

def instalar_dependencias():
    # ⚠️ DESABILITADO: Instalar manualmente via requirements.txt
    # Esta função causava lentidão ao tentar instalar pacotes automaticamente
    print("⚠️ instalar_dependencias() desabilitada - use requirements.txt")
    pass

def limpar_texto(texto):
    """
    Limpa o texto removendo quebras de linha e espaços repetidos.
    """
    texto = texto.replace("\r", " ").replace("\n", " ")
    texto = re.sub(r"\s{2,}", " ", texto)
    return texto.strip()

def normalizar_data(data_entrada):
    """
    Converte string ou datetime em objeto date.
    """
    if isinstance(data_entrada, str):
        try:
            return parser.parse(data_entrada).date()
        except Exception as e:
            raise ValueError(f"Erro ao converter data: {data_entrada} ({e})")
    elif isinstance(data_entrada, datetime):
        return data_entrada.date()
    elif isinstance(data_entrada, date):
        return data_entrada
    else:
        raise ValueError(f"Tipo de data inválido: {type(data_entrada)}")
