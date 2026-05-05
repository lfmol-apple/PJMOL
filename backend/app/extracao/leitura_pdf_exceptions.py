# -*- coding: utf-8 -*-
"""
leitura_pdf_exceptions.py — leitores especializados para layouts "fora da curva"

Este módulo complementa o leitura_pdf.py com detectores e extratores dedicados a:
- BB (SISBB / Extrato de Cota)
- Porto (layout legado)
- HS
- Remaza
- Multimarcas
- BR
- Roma
- Alpha
- Zema

Ideia: manter o leitura_pdf.py enxuto para a maioria e tratar exceções aqui.

Como usar (exemplo):
    from .leitura_pdf_exceptions import extrair_dados_pdf_exceptions
    dados, parcelas = extrair_dados_pdf_exceptions(path, debug=True)

Observação:
- Reaproveita helpers e OCR do leitura_pdf.py para manter consistência e não perder progresso.
"""

import re
import logging
from typing import List, Dict, Tuple

# Reuso de funcionalidades do leitor principal
# (ajuste o import relativo conforme sua estrutura de pacotes)
from .leitura_pdf import (
    extrair_texto_pdfplumber, extrair_texto_fitz, ocr_pdf_completo,
    _separar_datas_coladas as separar_datas,
    _normalize_date as norm_data,
    _to_float_smart as to_float,
    extrair_valores_percentuais_pagos,
    _recortar_conta_corrente as recortar_conta,
    limpar_texto,  # via utils
    _texto_ruim as texto_ruim,
    _dump_debug as dump_debug,
    _extrair_campos_basicos as extrair_basicos,
    normalizar_nome_administradora,
    VAL_BRL, DATA_ANY
)

logger = logging.getLogger(__name__)

# =====================================================================================
# DETECÇÃO DE LAYOUT
# =====================================================================================

def detectar_layout(texto: str) -> str:
    U = (texto or "").upper()

    # BB (SISBB / Extrato de Cota)
    if ("EXTRATO DE COTA" in U) or ("SISBB" in U) or ("BB CONSÓRCIOS" in U) or ("BB CONSORCIOS" in U):
        return "bb_sisbb"

    # Porto legado (usa "VALORES PAGOS" mas com estrutura antiga)
    if ("PORTO SEGURO" in U or "EXTRATO FINANCEIRO DO CONSORCIADO" in U) and "VALORES PAGOS" in U:
        return "porto_legacy"

    # HS com "PGTO PARC"
    if ("HS" in U or "HS ADM" in U) and "PGTO PARC" in U:
        return "hs"

    # Remaza: carta + bloco "POSICAO FINANCEIRA DOS PAGAMENTOS"
    if "REMAZA ADMINISTRADORA" in U or "POSICAO FINANCEIRA DOS PAGAMENTOS" in U or "POSIÇÃO FINANCEIRA DOS PAGAMENTOS" in U:
        return "remaza"

    # Multimarcas: "DEMONSTRATIVO INDIVIDUAL DO CONSORCIADO", "REC. PARCELA"
    if "MULTIMARCAS ADMINISTRADORA" in U or "DEMONSTRATIVO INDIVIDUAL DO CONSORCIADO" in U or "REC. PARCELA" in U:
        return "multimarcas"

    # BR (diversas variações)
    if re.search(r"\bBR\s+ADMINISTRADORA\b", U) or "EXTRATO BR" in U:
        return "br"

    # Roma
    if "ROMA ADMINISTRADORA" in U or "EXTRATO ROMA" in U:
        return "roma"

    # Alpha
    if "ALPHA ADMINISTRADORA" in U or "CONTA CORRENTE / VALORES PAGOS" in U:
        return "alpha"

    # Zema
    if "ZEMA ADMINISTRADORA" in U or "ZEMA CONSÓRCIOS" in U or "ZEMA CONSORCIOS" in U:
        return "zema"

    return "desconhecido"

# =====================================================================================
# EXTRATORES ESPECÍFICOS DE PARCELAS
# =====================================================================================

# --- BB (SISBB / Extrato de Cota) ---
RE_BB_PARCELA = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        RECBTO\.?\s*PARCELA\s+
        (?P<venc>{DATA_ANY})
        (?:\s+(?P<pag>{DATA_ANY}))?
        \s+(?P<devido>{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})\s*$
    """, re.IGNORECASE | re.VERBOSE
)

def extrair_bb(texto: str) -> List[Dict]:
    secao = recortar_conta(texto)
    linhas = [ln.strip() for ln in separar_datas(secao).splitlines() if ln.strip()]
    out = []
    for ln in linhas:
        up = ln.upper()
        if "RECBTO" not in up or "PARCELA" not in up:
            continue
        m = RE_BB_PARCELA.match(ln)
        if not m:
            continue
        pago = to_float(m.group("pago"))
        pag = m.group("pag")
        if pago > 0 and pag:
            out.append({"data_pagamento": norm_data(pag), "valor_pago": round(pago, 2)})
    return out

# --- Porto (legado) ---
RE_PORTO_ROW = re.compile(
    rf"""(?P<d1>{DATA_ANY}).*?(?P<d2>{DATA_ANY}).*?(?P<pag>{DATA_ANY}).*?(?P<pago>{VAL_BRL})""",
    re.IGNORECASE | re.DOTALL,
)

def extrair_porto_legacy(texto: str) -> List[Dict]:
    secao = recortar_conta(texto)
    out = []
    for raw in secao.splitlines():
        ln = raw.strip()
        if not ln:
            continue
        if "VALORES PAGOS" in ln.upper() or "PARCELA" in ln.upper():
            m = RE_PORTO_ROW.search(ln)
            if m:
                data_pg = norm_data(m.group("pag"))
                pago = to_float(m.group("pago"))
                if pago > 0:
                    out.append({"data_pagamento": data_pg, "valor_pago": round(pago, 2)})
    return out

# --- HS (com “PGTO PARC” no fim da linha) ---
RE_HS_ROW = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        {DATA_ANY}\s+
        {DATA_ANY}\s+
        (?P<pag>{DATA_ANY})\s+
        \S+\s+
        {VAL_BRL}\s+
        (?P<dev>{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})\s+
        .*?PGTO\s*PARC
    """, re.IGNORECASE | re.VERBOSE
)

def extrair_hs(texto: str) -> List[Dict]:
    secao = recortar_conta(texto)
    out = []
    for ln in secao.splitlines():
        if "PGTO PARC" not in ln.upper():
            continue
        m = RE_HS_ROW.match(ln.strip())
        if m:
            data = norm_data(m.group("pag"))
            pago = to_float(m.group("pago"))
            if pago > 0:
                out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

# --- Remaza (carta + “POSICAO FINANCEIRA DOS PAGAMENTOS”) ---
# Padrão: duas datas por linha (pagto / reuniao) e um ou mais valores; manter robusto.
RE_REMAZA_LINHA = re.compile(
    rf"""^\s*
        (?P<dt1>{DATA_ANY})\s*
        (?P<dt2>{DATA_ANY})\s+
        (?P<vl1>{VAL_BRL})\s*
        (?P<resto>.*)$
    """, re.IGNORECASE | re.VERBOSE
)

def extrair_remaza(texto: str) -> List[Dict]:
    # Filtrar bloco a partir do título “POSICAO FINANCEIRA DOS PAGAMENTOS”
    U = texto.upper()
    i = max(U.find("POSICAO FINANCEIRA DOS PAGAMENTOS"), U.find("POSIÇÃO FINANCEIRA DOS PAGAMENTOS"))
    bloco = texto[i:] if i != -1 else texto
    linhas = [ln.strip() for ln in separar_datas(bloco).splitlines() if ln.strip()]
    out = []
    for ln in linhas:
        m = RE_REMAZA_LINHA.match(ln)
        if not m:
            continue
        # Heurística: “pago” normalmente é o primeiro valor monetário da linha
        pago = to_float(m.group("vl1"))
        # data de pagamento: usar a primeira data (PAGTO)
        data_pag = norm_data(m.group("dt1"))
        if pago > 0:
            out.append({"data_pagamento": data_pag, "valor_pago": round(pago, 2)})
    return out

# --- Multimarcas (”REC. PARCELA”, colunas Data Ass. / Data Pgto.) ---
RE_MULTI_ROW = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        (?:REC\.?\s*PARCELA|PARCELA\s+INICIAL|TAXA\s+DE\s+ADES[ÃA]O)\s+
        (?P<d_ass>{DATA_ANY})\s+
        (?P<d_pag>{DATA_ANY})\s+
        R?\$?\s*(?P<dev>{VAL_BRL})\s+
        R?\$?\s*(?P<pago>{VAL_BRL})
    """, re.IGNORECASE | re.VERBOSE
)

def extrair_multimarcas(texto: str) -> List[Dict]:
    # Tabela aparece logo abaixo de “DEMONSTRATIVO INDIVIDUAL DO CONSORCIADO”
    secao = recortar_conta(texto) or texto
    linhas = [ln.strip() for ln in separar_datas(secao).splitlines() if ln.strip()]
    out = []
    for ln in linhas:
        if "REC." not in ln.upper() and "PARCELA INICIAL" not in ln.upper() and "TAXA DE ADES" not in ln.upper():
            # mantém simples; linhas de outras naturezas são ignoradas
            pass
        m = RE_MULTI_ROW.match(ln)
        if not m:
            continue
        pago = to_float(m.group("pago"))
        data_pag = norm_data(m.group("d_pag"))
        if pago > 0:
            out.append({"data_pagamento": data_pag, "valor_pago": round(pago, 2)})
    return out

# --- BR / Roma / Alpha / Zema: variações próximas do “RECBTO PARCELA”; usar heurística forte ---
RE_GENERIC_PAID = re.compile(
    r'(?i)\b(RECB(?:TO)?\.?\s*PARC(?:ELA)?|RECEB(?:\.|IMENTO)?\s*PARC(?:ELA)?|PGTO\.?\s*PARC(?:ELA)?|PAG(?:TO|AMENTO)?\.?\s*PARC(?:ELA)?)\b'
)

def extrair_generico_forte(texto: str) -> List[Dict]:
    secao = recortar_conta(texto)
    linhas = [ln for ln in separar_datas(secao).splitlines() if ln.strip()]
    out = []
    blacklist = ("PENDENCIA", "PENDÊNCIA", "PENDENCIAS", "PENDÊNCIAS", "AJUSTE", "DIFEREN", "CORRE", "LANCE", "SEGURO", "MULTA", "A PAGAR", "TOTAL", "TOTAIS")
    for l in linhas:
        up = l.upper()
        if any(b in up for b in blacklist):
            continue
        if not RE_GENERIC_PAID.search(up):
            continue
        datas = re.findall(DATA_ANY, l)
        vals = re.findall(VAL_BRL, l)
        d = norm_data(datas[-1]) if datas else None
        if not d or not vals:
            continue
        pago = to_float(vals[-1])
        if pago <= 0 and len(vals) >= 2:
            pago = to_float(vals[-2])
        if pago > 0:
            out.append({"data_pagamento": d, "valor_pago": round(pago, 2)})
    # dedup pequena
    uniq = {(p["data_pagamento"], p["valor_pago"]): p for p in out}
    return list(uniq.values())

# Roteador
def extrair_parcelas_por_layout(layout: str, texto: str) -> List[Dict]:
    if layout == "bb_sisbb":
        return extrair_bb(texto)
    if layout == "porto_legacy":
        return extrair_porto_legacy(texto)
    if layout == "hs":
        return extrair_hs(texto)
    if layout == "remaza":
        return extrair_remaza(texto)
    if layout == "multimarcas":
        return extrair_multimarcas(texto)
    # BR / Roma / Alpha / Zema: tentar heurística forte
    if layout in ("br", "roma", "alpha", "zema"):
        return extrair_generico_forte(texto)
    # fallback
    return extrair_generico_forte(texto)

# =====================================================================================
# API PRINCIPAL DO MÓDULO
# =====================================================================================

def extrair_dados_pdf_exceptions(caminho_pdf: str, debug: bool = False, forcar_ocr: bool = False) -> Tuple[Dict, List[Dict]]:
    """
    Retorna (dados, parcelas) para layouts excepcionais.
    - Reaproveita baselines do leitor principal para cabeçalho, OCR e agregados.
    """
    if debug:
        logger.setLevel(logging.DEBUG)

    # leitura base (mesma estratégia do leitor principal)
    texto_base = extrair_texto_pdfplumber(caminho_pdf) or ""
    if not texto_base.strip():
        texto_base = extrair_texto_fitz(caminho_pdf) or ""

    texto_ocr = ""
    if (texto_ruim(texto_base) and not forcar_ocr) or forcar_ocr:
        try:
            texto_ocr = ocr_pdf_completo(caminho_pdf)
        except Exception:
            pass

    texto = texto_ocr.strip() or texto_base
    texto = separar_datas(texto)
    dump_debug("exceptions_debug_texto.txt", texto)

    # detectar layout e extrair parcelas
    layout = detectar_layout(texto)
    parcelas = extrair_parcelas_por_layout(layout, texto)

    # cabeçalho + campos derivados (usa a mesma rotina do leitor principal para manter consistência)
    texto_limpo = limpar_texto(texto)
    dados, _ = extrair_basicos(texto_limpo, texto)

    # tag opcional de origem
    dados["leitor_origem"] = f"exceptions:{layout}"

    # agregados simples
    soma = round(sum(p.get("valor_pago", 0.0) for p in parcelas), 2) if parcelas else 0.0
    dados["parcelas_detalhadas"] = parcelas
    dados["parcelas_pagas"] = len(parcelas)
    dados["soma_valores_pagos"] = soma

    return dados, parcelas
