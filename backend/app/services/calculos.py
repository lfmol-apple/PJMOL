# app/services/calculos.py
from datetime import date
from typing import Dict, Any, List, Optional

# Importe aqui suas funções oficiais de cálculo
# Exemplo (ajuste conforme seu projeto):
# from calculos.calculos_valores_backend import calcular_valor_corrigido

def _normaliza_valor(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.replace("R$", "").replace(" ", "").replace(".", "").replace(",", ".")
        try:
            return float(s)
        except Exception:
            return None
    return None

def calcular_valores_extrato(extrato, indice_ate_hoje: str, indice_ate_futuro: str) -> Dict[str, Any]:
    """
    Recalcula valores 'ao vivo' para o extrato recebido, sem escrever no banco.

    Estratégia:
      - Se você tiver a tabela 'parcelas_extrato', use-a para calcular parcela a parcela (Plano A).
      - Senão, tenta usar 'extras.parcelas' (Plano B).
      - Se ainda assim não tiver granularidade, usa um fallback agregador (Plano C).

    Retorna um dicionário com os mesmos campos que a UI mostra.
    """
    hoje = date.today()
    extras = extrato.extras or {}

    # ---------- Plano A: tabela parcelas_extrato (ideal)
    # Obs.: se sua app ainda não tem essa tabela neste banco, pule para o Plano B.
    parcelas: List[Dict[str, Any]] = []
    try:
        # Se você já tiver ORM/relationship, carregue por extrato.parcelas
        # Exemplo:
        # for p in extrato.parcelas:
        #     parcelas.append({"data_pagamento": p.data_pagamento, "valor_pago": p.valor_pago})
        pass
    except Exception:
        pass

    if not parcelas:
        # ---------- Plano B: extras.parcelas (se você salvou a lista no JSON)
        parcelas = extras.get("parcelas", [])

    if parcelas:
        # Aqui você chama sua rotina oficial de correção por parcela.
        # Abaixo um pseudo-exemplo agregando resultados:
        soma_corrigido_hoje = 0.0
        soma_corrigido_futuro = 0.0

        for item in parcelas:
            dt = item.get("data_pagamento")
            valor = _normaliza_valor(item.get("valor_pago"))
            if not (dt and valor):
                continue

            # Exemplo: substitua pelas suas funções reais:
            # fator_origem_hoje -> fator_destino_hoje
            # fator_origem_futuro -> fator_destino_futuro (data de encerramento do grupo, se aplicável)
            # v_hoje = calcular_valor_corrigido(valor, dt, hoje, indice_ate_hoje)
            # v_futuro = calcular_valor_corrigido(valor, dt, extrato.data_encerramento or hoje, indice_ate_futuro)
            # Para não quebrar, deixo “espelho” direto:
            v_hoje = valor
            v_futuro = valor
            soma_corrigido_hoje += float(v_hoje or 0)
            soma_corrigido_futuro += float(v_futuro or 0)

        valor_corrigido_hoje = round(soma_corrigido_hoje, 2)
        valor_corrigido_futuro = round(soma_corrigido_futuro, 2)
    else:
        # ---------- Plano C: fallback com agregados básicos
        base_total = _normaliza_valor(getattr(extrato, "valor_total_pago_extrato", None)) or 0.0
        valor_corrigido_hoje = round(base_total, 2)
        valor_corrigido_futuro = round(base_total, 2)

    # Honorários e líquidos (ajuste conforme sua regra oficial)
    honor_percent = _normaliza_valor(
        getattr(extrato, "honorarios_percentual", None)
        or extras.get("percentual_honorarios")
        or extras.get("parametros_calculo", {}).get("honorarios_percentual")
    ) or 0.0

    honor_hoje = round(valor_corrigido_hoje * (honor_percent / 100.0), 2)
    honor_futuro = round(valor_corrigido_futuro * (honor_percent / 100.0), 2)

    custos = _normaliza_valor(
        getattr(extrato, "custos_processuais_total", None)
        or extras.get("custos_processuais_total")
        or 0.0
    ) or 0.0

    liquido_hoje = round(valor_corrigido_hoje - honor_hoje - custos, 2)
    liquido_futuro = round(valor_corrigido_futuro - honor_futuro - custos, 2)

    return {
        "valor_corrigido_hoje": valor_corrigido_hoje,
        "valor_corrigido_futuro": valor_corrigido_futuro,
        "honorarios_percentual": honor_percent,
        "honorarios_hoje": honor_hoje,
        "honorarios_futuro": honor_futuro,
        "custos_processuais_total": custos,
        "liquido_hoje": liquido_hoje,
        "liquido_futuro": liquido_futuro,
    }
