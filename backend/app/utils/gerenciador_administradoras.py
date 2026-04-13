import json
from pathlib import Path
import unicodedata
from typing import Dict, Optional, Any
from datetime import datetime

class GerenciadorAdministradoras:
    def __init__(self):
        self.caminho_arquivo = Path(__file__).resolve().parent / "../dados/administradoras.json"
        self.pasta_aprendizado = Path(__file__).resolve().parent / "../aprendizado/dados"
        self.pasta_aprendizado.mkdir(exist_ok=True)
        self._migrar_arquivo_se_necessario()
    
    def normalizar(self, texto: str) -> str:
        """Normaliza texto removendo acentos e convertendo para maiúsculas"""
        return unicodedata.normalize("NFKD", texto).encode("ASCII", "ignore").decode("ASCII").upper().strip()
    
    def _log_aprendizado(self, acao: str, dados: Dict[str, Any]):
        """Registra eventos de aprendizado para análise"""
        arquivo_log = self.pasta_aprendizado / "administradoras_aprendizado.json"
        
        try:
            if arquivo_log.exists():
                with open(arquivo_log, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            else:
                logs = []
            
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "acao": acao,
                "dados": dados
            }
            
            logs.append(log_entry)
            
            # Mantém apenas os últimos 1000 logs
            if len(logs) > 1000:
                logs = logs[-1000:]
            
            with open(arquivo_log, 'w', encoding='utf-8') as f:
                json.dump(logs, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            print(f"[ERRO] Falha ao registrar aprendizado: {e}")
    
    def _analisar_padroes_cep(self) -> Dict[str, Any]:
        """Analisa padrões de CEP por UF para machine learning"""
        dados = self.carregar_dados()
        padroes = {}
        
        for nome, info in dados.items():
            cep = info.get("cep")
            if cep and len(cep) == 8:
                uf_cep = cep[:2]  # Primeiros 2 dígitos indicam região
                if uf_cep not in padroes:
                    padroes[uf_cep] = []
                padroes[uf_cep].append({
                    "nome": nome,
                    "cep": cep,
                    "cnpj": info["cnpj"]
                })
        
        return padroes
    
    def _migrar_arquivo_se_necessario(self):
        """Migra arquivo antigo (string) para novo formato (objeto) se necessário"""
        try:
            with open(self.caminho_arquivo, 'r', encoding='utf-8') as f:
                dados = json.load(f)
            
            # Verifica se é formato antigo (string) ou novo (objeto)
            primeiro_valor = next(iter(dados.values()))
            if isinstance(primeiro_valor, str):
                print("[MIGRAÇÃO] Convertendo arquivo para novo formato...")
                dados_novos = {}
                for nome, cnpj in dados.items():
                    dados_novos[nome] = {
                        "cnpj": cnpj,
                        "cep": None
                    }
                
                # Salva arquivo migrado
                with open(self.caminho_arquivo, 'w', encoding='utf-8') as f:
                    json.dump(dados_novos, f, indent=4, ensure_ascii=False)
                print("[MIGRAÇÃO] ✅ Arquivo migrado com sucesso!")
        
        except FileNotFoundError:
            print("[ERRO] Arquivo de administradoras não encontrado!")
        except Exception as e:
            print(f"[ERRO] Erro na migração: {e}")
    
    def carregar_dados(self) -> Dict[str, Any]:
        """Carrega dados do arquivo"""
        try:
            with open(self.caminho_arquivo, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[ERRO] Erro ao carregar dados: {e}")
            return {}
    
    def salvar_dados(self, dados: Dict[str, Any]):
        """Salva dados no arquivo"""
        try:
            with open(self.caminho_arquivo, 'w', encoding='utf-8') as f:
                json.dump(dados, f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"[ERRO] Erro ao salvar dados: {e}")
    
    def buscar_por_cnpj(self, cnpj: str) -> Optional[Dict[str, Any]]:
        """Busca administradora pelo CNPJ"""
        cnpj_limpo = ''.join(filter(str.isdigit, cnpj))
        dados = self.carregar_dados()
        
        for nome, info in dados.items():
            cnpj_salvo = ''.join(filter(str.isdigit, info["cnpj"]))
            if cnpj_salvo == cnpj_limpo:
                return {
                    "nome": self.normalizar(nome),
                    "cnpj": cnpj_limpo,
                    "cep": info.get("cep")
                }
        return None
    
    def buscar_por_nome(self, nome: str) -> Optional[Dict[str, Any]]:
        """Busca administradora pelo nome"""
        nome_busca = self.normalizar(nome)
        dados = self.carregar_dados()
        
        for nome_arquivo, info in dados.items():
            if self.normalizar(nome_arquivo) == nome_busca:
                return {
                    "nome": self.normalizar(nome_arquivo),
                    "cnpj": ''.join(filter(str.isdigit, info["cnpj"])),
                    "cep": info.get("cep")
                }
        return None
    
    def adicionar_ou_atualizar(self, cnpj: str, nome: str, cep: str = None, fonte: str = "automatico"):
        """Adiciona nova administradora ou atualiza existente (APRENDIZADO AUTOMÁTICO)"""
        cnpj_limpo = ''.join(filter(str.isdigit, cnpj))
        dados = self.carregar_dados()
        
        # Busca se já existe
        existe = False
        nome_anterior = None
        cep_anterior = None
        
        for nome_arquivo, info in dados.items():
            cnpj_salvo = ''.join(filter(str.isdigit, info["cnpj"]))
            if cnpj_salvo == cnpj_limpo:
                nome_anterior = nome_arquivo
                cep_anterior = info.get("cep")
                
                # Atualiza CEP se não tinha ou se o novo é diferente
                if not info.get("cep") and cep:
                    info["cep"] = cep
                    self._log_aprendizado("cep_atualizado", {
                        "cnpj": cnpj_limpo,
                        "nome": nome,
                        "cep_novo": cep,
                        "fonte": fonte
                    })
                    print(f"[APRENDIZADO] ✅ CEP atualizado para {nome}: {cep}")
                existe = True
                break
        
        # Se não existe, adiciona nova
        if not existe:
            dados[nome] = {
                "cnpj": f"{cnpj_limpo[:2]}.{cnpj_limpo[2:5]}.{cnpj_limpo[5:8]}/{cnpj_limpo[8:12]}-{cnpj_limpo[12:14]}",
                "cep": cep
            }
            
            self._log_aprendizado("administradora_nova", {
                "cnpj": cnpj_limpo,
                "nome": nome,
                "cep": cep,
                "fonte": fonte
            })
            print(f"[APRENDIZADO] ✨ Nova administradora adicionada: {nome} (CNPJ: {cnpj_limpo}, CEP: {cep})")
            
            # Integração com sistema de correção automática
            self._integrar_com_sistema_correcao(cnpj_limpo, nome, cep)
        
        # Salva no arquivo
        self.salvar_dados(dados)
        return True
    
    def _integrar_com_sistema_correcao(self, cnpj: str, nome: str, cep: str):
        """Integra nova administradora com o sistema de correção automática"""
        try:
            # Importa o sistema de aprendizado existente
            from aprendizado.correcao_automatica import aprendizado_correcao
            
            # Cria contexto para o sistema de ML
            contexto = {
                "cnpj": cnpj,
                "cep": cep,
                "fonte": "brasilapi_automatico",
                "tipo_aprendizado": "administradora_nova"
            }
            
            # Registra no sistema de correção como "padrão aprendido"
            aprendizado_correcao.capturar_correcao(
                administradora=nome,
                campo="administradora_cnpj",
                valor_original="DESCONHECIDA",
                valor_corrigido=nome,
                contexto=contexto
            )
            
            if cep:
                aprendizado_correcao.capturar_correcao(
                    administradora=nome,
                    campo="administradora_cep",
                    valor_original="DESCONHECIDO",
                    valor_corrigido=cep,
                    contexto=contexto
                )
            
            print(f"[ML INTEGRAÇÃO] ✅ Administradora {nome} integrada ao sistema de correção automática")
            
        except Exception as e:
            print(f"[ML INTEGRAÇÃO] ⚠️  Erro na integração: {e}")
    
    def obter_estatisticas_ml(self) -> Dict[str, Any]:
        """Obtém estatísticas para o sistema de ML"""
        dados = self.carregar_dados()
        
        total = len(dados)
        com_cep = sum(1 for info in dados.values() if info.get("cep"))
        sem_cep = total - com_cep
        
        # Análise de padrões de CEP
        padroes_cep = self._analisar_padroes_cep()
        
        # Estatísticas de aprendizado
        arquivo_log = self.pasta_aprendizado / "administradoras_aprendizado.json"
        total_aprendizados = 0
        aprendizados_recentes = 0
        
        if arquivo_log.exists():
            try:
                with open(arquivo_log, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
                total_aprendizados = len(logs)
                
                # Conta aprendizados das últimas 24h
                from datetime import datetime, timedelta
                agora = datetime.now()
                ontem = agora - timedelta(days=1)
                
                for log in logs:
                    timestamp = datetime.fromisoformat(log["timestamp"])
                    if timestamp > ontem:
                        aprendizados_recentes += 1
                        
            except Exception:
                pass
        
        return {
            "total_administradoras": total,
            "com_cep": com_cep,
            "sem_cep": sem_cep,
            "percentual_completo": round((com_cep / total) * 100, 2) if total > 0 else 0,
            "padroes_cep_regioes": len(padroes_cep),
            "total_aprendizados": total_aprendizados,
            "aprendizados_24h": aprendizados_recentes,
            "padroes_detalhados": padroes_cep
        }

# Instância global
gerenciador_administradoras = GerenciadorAdministradoras()