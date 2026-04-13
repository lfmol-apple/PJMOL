# backend/app/extracao/atualizacao_monetaria.py

from typing import List, Tuple
from datetime import datetime
from app.calculos.calculos_valores_backend import calcular_valor_corrigido
from app.calculos.config_calculo import ConfigCalculo

def parse_data_aceitando_formatos(data_str: str) -> datetime:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(data_str, fmt)
        except ValueError:
            continue
    # Se falhar em todos os formatos, levanta erro
    raise ValueError(f"Formato de data inválido: {data_str}")

def calcular_valor_corrigido_e_futuro(
    parcelas: List[dict],
    estado: str,  # Mantido por compatibilidade, mas não usado
    data_encerramento: str
) -> Tuple[float, float]:
    print("🧪 calculando valor corrigido usando TJMG")

    # Convertemos a data final com parsing flexível
    try:
        data_final = parse_data_aceitando_formatos(data_encerramento)
    except ValueError:
        print(f"⚠️ Data de encerramento inválida: {data_encerramento}, usando data de hoje")
        data_final = datetime.today()

    # Configuração padrão - aqui você pode personalizar ou preencher os campos necessários
    config = ConfigCalculo(
        estado=estado,
        data_sentenca=None,
        aplicar_juros_mora=False,
        aplicar_juros=False,
        data_inicio_juros=None,
        percentual_juros_mora_anual=0.0,
        taxa_juros_mensal_percentual=0.0,
        percentual_honorarios=0.0,
        taxa_administracao_percentual_total=0.0,
        outros_custos=0.0,
        total_parcelas_plano=0,
        valor_total_pago_extrato=0.0,
        houve_sentenca=False,
        indice_corrigido_hoje="TJMG",
        indice_corrigido_futuro="TJMG",
        valor_credito=0.0,
    )

    # Chamada do cálculo real com a mesma data para hoje e futuro (ajuste se necessário)
    resultado = calcular_valor_corrigido(
        parcelas=parcelas,
        config=config,
        data_destino_hoje=data_final.date(),
        data_destino_futuro=data_final.date()
    )

    # Retorna apenas os dois valores principais
    return resultado["valor_corrigido_hoje"], resultado["valor_corrigido_futuro"]
