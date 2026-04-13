import re
import requests

def buscar_cidade_estado_por_cep(cep: str):
    cep = re.sub(r'\D', '', cep)
    if not cep or len(cep) != 8:
        return "", ""

    try:
        response = requests.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=5)
        if response.status_code == 200:
            dados = response.json()
            cidade = dados.get("localidade", "").upper()
            estado = dados.get("uf", "").upper()
            return cidade, estado
    except Exception as e:
        print(f"Erro ao consultar o CEP {cep}: {e}")
    return "", ""
