# backend/app/extracao/reconciliador.py
"""
Heurísticas para selecionar lançamentos válidos e fechar a soma do extrato.
"""
from __future__ import annotations
from typing import List, Tuple
from itertools import combinations

Linha = Tuple[str, float, str]

def eh_totalizacao(ln: str) -> bool:
    txt = ln.upper()
    chaves = (
        "TOTAL", "SUBTOTAL", "SOMA", "ACUMULADO", "TOTAIS",
        "VALOR TOTAL", "TOTAL PAGO", "SALDO", "EXTRATO", "RESUMO"
    )
    return any(k in txt for k in chaves)

def eh_parcela(ln: str) -> bool:
    txt = ln.upper()
    chaves = (
        "RECBTO. PARCELA", "RECEBTO PARCELA", "RECEBIMENTO PARCELA",
        "RECEBIMENTO DE PARCELA", "PARCELA PAGA", "PAGAMENTO PARCELA"
    )
    return any(k in txt for k in chaves)

def eh_pendente(ln: str) -> bool:
    txt = ln.upper()
    return "PENDENTE" in txt or "A VENCER" in txt

def eh_ajuste_pago(ln: str) -> bool:
    txt = ln.upper()
    chaves = ("AJUSTE", "CORREÇÃO", "CORRECAO", "JUROS", "ENCARGO", "TAXA")
    return any(k in txt for k in chaves) and not eh_totalizacao(ln)

def selecionar_itens_relevantes(lanc: List[Linha]) -> List[Linha]:
    saida: List[Linha] = []
    for d, v, ln in lanc:
        if eh_totalizacao(ln): 
            continue
        if eh_pendente(ln):
            continue
        if abs(v) < 0.1:
            continue
        saida.append((d, v, ln))
    return saida

def _arred(v: float, casas: int = 2) -> float:
    return round(v + 1e-12, casas)

def _to_cent(v: float) -> int:
    return int(round(v * 100))

def _greedy_por_maior(cands: List[Linha], alvo: float, tol: float):
    resto = alvo
    escolhidos: List[Linha] = []
    for d, v, ln in sorted(cands, key=lambda x: -x[1]):
        if v <= resto + tol:
            escolhidos.append((d, v, ln))
            resto = _arred(resto - v)
            if abs(resto) <= tol:
                break
    return escolhidos, resto

def _refino_subset_sum_pequeno(cands: List[Linha], alvo: float, tol: float, limite: int = 18):
    if not cands:
        return [], alvo
    base = sorted(cands, key=lambda x: -x[1])[:limite]
    alvo_cent = _to_cent(alvo)

    melhor: List[Linha] = []
    melhor_resto = alvo

    for k in range(1, min(len(base), 12) + 1):
        for combo in combinations(base, k):
            s = sum(_to_cent(v) for _, v, _ in combo)
            diff = abs(s - alvo_cent)
            if diff <= int(round(tol * 100)):
                return list(combo), _arred((alvo_cent - s) / 100.0)
            resto = _arred((alvo_cent - s) / 100.0)
            if abs(resto) < abs(melhor_resto):
                melhor = list(combo)
                melhor_resto = resto
    return melhor, melhor_resto

def fechar_soma(lanc: List[Linha], alvo: float, tol: float = 0.05) -> List[Linha]:
    alvo = _arred(alvo)
    tol = max(0.01, tol)

    parcelas = [(d, v, ln) for (d, v, ln) in lanc if eh_parcela(ln)]
    ajustes  = [(d, v, ln) for (d, v, ln) in lanc if not eh_parcela(ln) and eh_ajuste_pago(ln)]
    outros   = [(d, v, ln) for (d, v, ln) in lanc if (d, v, ln) not in parcelas and (d, v, ln) not in ajustes]

    esc1, resto1 = _greedy_por_maior(parcelas, alvo, tol)
    if abs(resto1) <= tol:
        return esc1

    cands2 = parcelas + ajustes
    esc2, resto2 = _greedy_por_maior(cands2, alvo, tol)
    if abs(resto2) <= tol:
        return esc2

    esc3, resto3 = _refino_subset_sum_pequeno(cands2, alvo, tol, limite=18)
    if abs(resto3) <= tol:
        return esc3

    cands3 = cands2 + outros
    esc4, resto4 = _refino_subset_sum_pequeno(cands3, alvo, tol, limite=18)
    if abs(resto4) <= tol:
        return esc4

    candidatos = [(esc1, resto1), (esc2, resto2), (esc3, resto3), (esc4, resto4)]
    melhor = min(candidatos, key=lambda x: abs(x[1]))[0]
    return melhor
