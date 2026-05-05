from fastapi import APIRouter, HTTPException
import requests
import json
from pathlib import Path
import unicodedata
from pydantic import BaseModel
import time
from app.utils.gerenciador_administradoras import gerenciador_administradoras

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
            raise HTTPException(status_code=404, detail="Dados incompletos no ViaCEP")

        if uf not in COMARCAS:
            raise HTTPException(status_code=404, detail=f"UF {uf} não encontrada na base de comarcas")

        if cidade not in COMARCAS[uf]:
            raise HTTPException(status_code=404, detail=f"Município {cidade} não encontrado na comarca de {uf}")

        comarca = COMARCAS[uf][cidade]
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


# Rota 3: Buscar nome da administradora e comarca pelo CNPJ (COM APRENDIZADO AUTOMÁTICO)
@router.get("/administradora-por-cnpj/{cnpj}")
def obter_administradora_por_cnpj(cnpj: str):
    try:
        cnpj_limpo = ''.join(filter(str.isdigit, cnpj))
        if len(cnpj_limpo) != 14:
            raise HTTPException(status_code=400, detail="CNPJ inválido")

        nome_adm = None
        cep = None

        # 1. Primeiro verifica se já conhecemos esta administradora
        dados_locais = gerenciador_administradoras.buscar_por_cnpj(cnpj_limpo)
        if dados_locais:
            nome_adm = dados_locais["nome"]
            cep = dados_locais.get("cep")
            print(f"[DEBUG] Administradora encontrada na base local: {nome_adm}, CEP: {cep}")

        # 2. Se não tem CEP ou não conhecemos, busca na BrasilAPI
        if not cep or not nome_adm:
            max_tentativas = 3
            intervalo_retry = 3
            
            for tentativa in range(1, max_tentativas + 1):
                try:
                    print(f"[DEBUG] Tentativa {tentativa}/{max_tentativas} - Buscando dados oficiais na BrasilAPI: {cnpj_limpo}")
                    resposta = requests.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}", timeout=15)
                    print(f"[DEBUG] Status BrasilAPI (tentativa {tentativa}): {resposta.status_code}")
                    
                    if resposta.status_code == 200:
                        dados = resposta.json()
                        cep_oficial = dados.get("cep", "").strip()
                        nome_oficial = normalizar(dados.get("razao_social", ""))
                        
                        print(f"[DEBUG] Dados da BrasilAPI: nome={nome_oficial}, cep={cep_oficial}")
                        
                        # APRENDIZADO AUTOMÁTICO: Salva/atualiza na base
                        if nome_oficial and cep_oficial:
                            gerenciador_administradoras.adicionar_ou_atualizar(
                                cnpj_limpo, nome_oficial, cep_oficial
                            )
                            print(f"[APRENDIZADO] ✅ Administradora salva automaticamente: {nome_oficial}")
                        
                        # Usa os dados oficiais
                        nome_adm = nome_oficial
                        cep = cep_oficial
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


# Rota 5: Estatísticas do Machine Learning de Administradoras (NOVA)
@router.get("/administradoras/ml-estatisticas")
def estatisticas_ml_administradoras():
    """
    Retorna estatísticas detalhadas do sistema de machine learning de administradoras
    """
    try:
        stats = gerenciador_administradoras.obter_estatisticas_ml()
        return {
            "status": "success",
            "estatisticas": stats,
            "timestamp": time.time()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter estatísticas de ML: {str(e)}")


# Rota 6: Forçar aprendizado manual (NOVA)
@router.post("/administradoras/aprender-manual")
def aprender_administradora_manual(payload: dict):
    """
    Permite adicionar manualmente uma administradora para aprendizado
    """
    try:
        cnpj = payload.get("cnpj")
        nome = payload.get("nome") 
        cep = payload.get("cep")
        
        if not cnpj or not nome:
            raise HTTPException(status_code=400, detail="CNPJ e nome são obrigatórios")
        
        resultado = gerenciador_administradoras.adicionar_ou_atualizar(
            cnpj, nome, cep, fonte="manual"
        )
        
        return {
            "status": "success",
            "message": f"Administradora {nome} aprendida com sucesso",
            "dados": {
                "cnpj": cnpj,
                "nome": nome,
                "cep": cep
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no aprendizado manual: {str(e)}")


# Rota 5: Estatísticas das administradoras (NOVA)
@router.get("/administradoras/estatisticas")
def estatisticas_administradoras():
    try:
        stats = gerenciador_administradoras.estatisticas()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter estatísticas: {str(e)}")


# Rota 6: Listar administradoras sem CEP (NOVA)
@router.get("/administradoras/sem-cep")
def listar_administradoras_sem_cep():
    try:
        sem_cep = gerenciador_administradoras.listar_sem_cep()
        return {"administradoras_sem_cep": sem_cep, "total": len(sem_cep)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar administradoras: {str(e)}")