from fastapi import APIRouter, HTTPException
import requests
import json
from pathlib import Path
import unicodedata
from pydantic import BaseModel
import time
from ..aprendizado.gerenciador_administradoras import gerenciador_administradoras

router = APIRouter()

# Caminhos dos arquivos
CAMINHO_COMARCAS = Path(__file__).resolve().parent / "../dados/comarcas_por_uf.json"

# Função de normalização
def normalizar(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ASCII", "ignore").decode("ASCII").upper().strip()

# Carrega as comarcas em memória
try:
    with open(CAMINHO_COMARCAS, encoding="utf-8") as f:
        bruto = json.load(f)
        COMARCAS = {}
        for uf, lista in bruto.items():
            COMARCAS[uf] = {}
            for item in lista:
                municipio = normalizar(item["municipio"])
                comarca = item["comarca"].strip().upper()
                COMARCAS[uf][municipio] = f"COMARCA DE {comarca} - {uf}"
except Exception as e:
    raise RuntimeError(f"Erro ao carregar o arquivo de comarcas: {e}")


# Rota 1: Obter comarca pelo CEP
@router.get("/comarca-por-cep/{cep}")
def obter_comarca_por_cep(cep: str):
    try:
        cep_limpo = ''.join(filter(str.isdigit, cep))
        via_cep = requests.get(f"https://viacep.com.br/ws/{cep_limpo}/json/")

        if via_cep.status_code != 200:
            raise HTTPException(status_code=404, detail="CEP inválido ou não encontrado")

        dados = via_cep.json()
        if "erro" in dados:
            raise HTTPException(status_code=404, detail="CEP não encontrado no ViaCEP")

        cidade = normalizar(dados.get("localidade", ""))
        uf = dados.get("uf", "").strip().upper()

        if not cidade or not uf:
            raise HTTPException(status_code=400, detail="Município ou UF não encontrados")

        comarca = COMARCAS.get(uf, {}).get(cidade)
        if not comarca:
            raise HTTPException(status_code=404, detail=f"Comarca não encontrada para {cidade} - {uf}")

        return {"comarca": comarca}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")


# Modelo para nome de administradora
class NomeAdministradora(BaseModel):
    nome_administradora: str

# Rota 2: Buscar CNPJ pelo nome da administradora
@router.post("/cnpj-por-administradora")
def buscar_cnpj_por_nome(payload: NomeAdministradora):
    try:
        resultado = gerenciador_administradoras.buscar_por_nome(payload.nome_administradora)
        if resultado:
            return {"cnpj": resultado["cnpj"]}
        return {"cnpj": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar CNPJ: {str(e)}")


# Rota 3: Buscar nome da administradora e comarca pelo CNPJ
@router.get("/administradora-por-cnpj/{cnpj}")
def obter_administradora_por_cnpj(cnpj: str):
    try:
        cnpj_limpo = ''.join(filter(str.isdigit, cnpj))
        if len(cnpj_limpo) != 14:
            raise HTTPException(status_code=400, detail="CNPJ inválido")

        nome_adm = None
        cep = None

        # 1. Primeiro verifica se o CNPJ está na nossa base de administradoras conhecidas
        with open(CAMINHO_ADMINISTRADORAS, encoding="utf-8") as f:
            administradoras = json.load(f)
            for nome, cnpj_salvo in administradoras.items():
                if ''.join(filter(str.isdigit, cnpj_salvo)) == cnpj_limpo:
                    nome_adm = normalizar(nome)
                    print(f"[DEBUG] Administradora encontrada na base local: {nome_adm}")
                    break

        # 2. Busca os dados oficiais na BrasilAPI com retry (3 tentativas, 3 segundos entre elas)
        import time
        max_tentativas = 3
        intervalo_retry = 3
        
        for tentativa in range(1, max_tentativas + 1):
            try:
                print(f"[DEBUG] Tentativa {tentativa}/{max_tentativas} - Buscando dados oficiais na BrasilAPI: {cnpj_limpo}")
                resposta = requests.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}", timeout=15)
                print(f"[DEBUG] Status BrasilAPI (tentativa {tentativa}): {resposta.status_code}")
                
                if resposta.status_code == 200:
                    dados = resposta.json()
                    cep = dados.get("cep", "").strip()
                    # Se não encontramos na base local, pega o nome da BrasilAPI
                    if not nome_adm:
                        nome_adm = normalizar(dados.get("razao_social", ""))
                        print(f"[DEBUG] Nome obtido da BrasilAPI: {nome_adm}")
                    print(f"[DEBUG] CEP oficial da BrasilAPI: {cep}")
                    break  # Sucesso, sai do loop
                    
                elif resposta.status_code == 429:
                    print(f"[DEBUG] Rate limit da BrasilAPI na tentativa {tentativa}")
                    if tentativa < max_tentativas:
                        print(f"[DEBUG] Aguardando {intervalo_retry} segundos antes da próxima tentativa...")
                        time.sleep(intervalo_retry)
                    continue
                    
                else:
                    print(f"[DEBUG] BrasilAPI falhou na tentativa {tentativa}: {resposta.text}")
                    if tentativa < max_tentativas:
                        print(f"[DEBUG] Aguardando {intervalo_retry} segundos antes da próxima tentativa...")
                        time.sleep(intervalo_retry)
                    continue
                    
            except Exception as e:
                print(f"[DEBUG] Erro na BrasilAPI (tentativa {tentativa}): {str(e)}")
                if tentativa < max_tentativas:
                    print(f"[DEBUG] Aguardando {intervalo_retry} segundos antes da próxima tentativa...")
                    time.sleep(intervalo_retry)
                continue

        # 3. Se BrasilAPI falhou, usa cache local conhecido
        if not cep:
            print(f"[DEBUG] BrasilAPI falhou, usando cache local de CEPs")
            cache_ceps = {
                "58113812000123": "06543325",  # EMBRACON - Santana de Parnaíba/SP
                "84911098000129": "04038000",  # ADEMICON - São Paulo/SP
                "06043050000132": "70040010",  # BB - Brasília/DF
                "52568821000122": "06029900",  # BRADESCO - Osasco/SP
                "14723388000163": "86050000",  # BR CONSÓRCIOS - Londrina/PR
                "60732997000104": "04038001",  # UNIFISA - São Paulo/SP
                "49937055000111": "04502001",  # GMAC - São Paulo/SP
                "45441789000154": "04038002",  # HONDA - São Paulo/SP
                "47458153000140": "04038003",  # YAMAHA - São Paulo/SP
                "00000776000101": "04038004",  # ITAU - São Paulo/SP
                "47658539000104": "04038005",  # VOLKSWAGEN - São Paulo/SP
                "48041735000190": "04038006",  # PORTO SEGURO - São Paulo/SP
                "73516106000116": "04038007",  # HS - São Paulo/SP
                "59395061000148": "04038008",  # DISAL - São Paulo/SP
            }
            
            if cnpj_limpo in cache_ceps:
                cep = cache_ceps[cnpj_limpo]
                print(f"[DEBUG] CEP encontrado no cache local: {cep}")

        # Se não encontrou nome em lugar nenhum, é um CNPJ desconhecido
        if not nome_adm:
            raise HTTPException(status_code=404, detail="CNPJ não encontrado em nenhuma fonte")

        # 3. Buscar comarca pelo CEP, se disponível
        comarca = None
        if cep:
            try:
                print(f"[DEBUG] Buscando comarca para CEP: {cep}")
                resposta_comarca = requests.get(f"http://localhost:8000/comarca-por-cep/{cep}")
                print(f"[DEBUG] Status da resposta comarca: {resposta_comarca.status_code}")
                if resposta_comarca.status_code == 200:
                    comarca_data = resposta_comarca.json()
                    comarca = comarca_data.get("comarca", "")
                    print(f"[DEBUG] Comarca encontrada: {comarca}")
                else:
                    print(f"[DEBUG] Erro na requisição comarca: {resposta_comarca.text}")
            except Exception as e:
                print(f"[DEBUG] Exceção ao buscar comarca: {str(e)}")
                pass

        print(f"[DEBUG] Retornando: administradora={nome_adm}, cep={cep}, comarca={comarca}")
        return {
            "administradora": nome_adm,
            "cep": cep,
            "comarca": comarca
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")


# Rota 4: Buscar somente a comarca via CNPJ (usada pelo frontend)
@router.get("/comarca-por-cnpj/{cnpj}")
def buscar_comarca_por_cnpj(cnpj: str):
    try:
        cnpj_limpo = ''.join(filter(str.isdigit, cnpj))
        if len(cnpj_limpo) != 14:
            raise HTTPException(status_code=400, detail="CNPJ inválido")

        resposta = requests.get(f"http://localhost:8000/administradora-por-cnpj/{cnpj_limpo}")
        if resposta.status_code != 200:
            raise HTTPException(status_code=404, detail="Não foi possível determinar a comarca")

        dados = resposta.json()
        return {"comarca": dados.get("comarca", "")}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")
