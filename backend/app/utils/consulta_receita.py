"""
Utilitário para consulta de dados na Receita Federal
"""
import logging
import requests
from typing import Optional, Dict
from datetime import datetime

logger = logging.getLogger(__name__)


def consultar_cpf_receita(cpf: str, data_nascimento: str) -> Optional[str]:
    """
    Consulta nome completo na Receita Federal usando CPF e data de nascimento
    
    Args:
        cpf: CPF no formato XXX.XXX.XXX-XX ou apenas números
        data_nascimento: Data no formato DD/MM/AAAA
        
    Returns:
        Nome completo do titular ou None se não encontrar
    """
    try:
        # Limpa CPF (remove pontos e traços)
        cpf_limpo = cpf.replace('.', '').replace('-', '').replace('/', '').strip()
        
        if len(cpf_limpo) != 11:
            logger.warning(f"CPF inválido: {cpf}")
            return None
        
        # Valida data de nascimento
        try:
            data_obj = datetime.strptime(data_nascimento, "%d/%m/%Y")
        except ValueError:
            logger.warning(f"Data de nascimento inválida: {data_nascimento}")
            return None
        
        logger.info(f"🔍 Consultando Receita Federal - CPF: {cpf_limpo[:3]}.***.***-{cpf_limpo[-2:]}")
        
        # API da Receita Federal (usando serviço público)
        # Nota: Esta é uma implementação base. Você pode ajustar para usar APIs específicas
        
        # Opção 1: API Pública ReceitaWS
        try:
            url = f"https://www.receitaws.com.br/v1/cpf/{cpf_limpo}"
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                dados = response.json()
                
                # Valida data de nascimento
                data_receita = dados.get('data_nascimento', '')
                if data_receita:
                    # Formato pode ser DD/MM/AAAA
                    if data_receita == data_nascimento:
                        nome = dados.get('nome', '').strip()
                        if nome:
                            logger.info(f"✅ Nome encontrado na Receita Federal: {nome}")
                            return nome
                        else:
                            logger.warning("⚠️ Receita Federal retornou dados mas sem nome")
                    else:
                        logger.warning(f"⚠️ Data de nascimento não confere: {data_receita} != {data_nascimento}")
                        return None
            else:
                logger.warning(f"⚠️ Receita Federal retornou status {response.status_code}")
                
        except requests.RequestException as e:
            logger.debug(f"Erro ao consultar ReceitaWS: {e}")
        
        # Opção 2: API Brasil API
        try:
            url = f"https://brasilapi.com.br/api/cpf/v1/{cpf_limpo}"
            response = requests.get(url, timeout=10)
            
            if response.status_code == 200:
                dados = response.json()
                nome = dados.get('nome', '').strip()
                
                # Valida data de nascimento se disponível
                data_receita = dados.get('data_nascimento', '')
                if data_receita:
                    # Normaliza formato
                    try:
                        data_obj_receita = datetime.strptime(data_receita, "%Y-%m-%d")
                        if data_obj_receita.strftime("%d/%m/%Y") == data_nascimento:
                            if nome:
                                logger.info(f"✅ Nome encontrado na Brasil API: {nome}")
                                return nome
                        else:
                            logger.warning(f"⚠️ Data de nascimento não confere (Brasil API)")
                            return None
                    except ValueError:
                        pass
                
                # Se não tem data de nascimento na resposta mas tem nome, retorna
                if nome:
                    logger.info(f"✅ Nome encontrado na Brasil API: {nome}")
                    return nome
                    
        except requests.RequestException as e:
            logger.debug(f"Erro ao consultar Brasil API: {e}")
        
        # Opção 3: Serviço interno/cache (se existir)
        # Aqui você pode adicionar consulta ao banco de dados interno
        # ou cache de consultas anteriores
        
        logger.warning(f"⚠️ Não foi possível consultar nome para CPF {cpf_limpo[:3]}.***.***-{cpf_limpo[-2:]}")
        return None
        
    except Exception as e:
        logger.error(f"❌ Erro ao consultar Receita Federal: {e}")
        return None


def formatar_cpf(cpf: str) -> str:
    """
    Formata CPF no padrão XXX.XXX.XXX-XX
    
    Args:
        cpf: CPF em qualquer formato
        
    Returns:
        CPF formatado
    """
    cpf_limpo = cpf.replace('.', '').replace('-', '').replace('/', '').strip()
    
    if len(cpf_limpo) == 11:
        return f"{cpf_limpo[:3]}.{cpf_limpo[3:6]}.{cpf_limpo[6:9]}-{cpf_limpo[9:]}"
    
    return cpf


def validar_cpf(cpf: str) -> bool:
    """
    Valida CPF usando algoritmo de dígitos verificadores
    
    Args:
        cpf: CPF em qualquer formato
        
    Returns:
        True se CPF é válido
    """
    cpf_limpo = cpf.replace('.', '').replace('-', '').replace('/', '').strip()
    
    if len(cpf_limpo) != 11 or not cpf_limpo.isdigit():
        return False
    
    # CPFs inválidos conhecidos
    if cpf_limpo in ['00000000000', '11111111111', '22222222222', '33333333333',
                      '44444444444', '55555555555', '66666666666', '77777777777',
                      '88888888888', '99999999999']:
        return False
    
    # Calcula primeiro dígito verificador
    soma = sum(int(cpf_limpo[i]) * (10 - i) for i in range(9))
    resto = soma % 11
    digito1 = 0 if resto < 2 else 11 - resto
    
    if int(cpf_limpo[9]) != digito1:
        return False
    
    # Calcula segundo dígito verificador
    soma = sum(int(cpf_limpo[i]) * (11 - i) for i in range(10))
    resto = soma % 11
    digito2 = 0 if resto < 2 else 11 - resto
    
    if int(cpf_limpo[10]) != digito2:
        return False
    
    return True
