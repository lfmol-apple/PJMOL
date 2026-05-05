# -*- coding: utf-8 -*-
"""
leitura_pdf.py — extração robusta de extratos de consórcio (multi-layout)

* Debug detalhado (--debug)
* Forçar OCR (--ocr)
* Detecção de administradora + CNPJ via mapa (administradoras.json)
* Aprendizado local (ler_aprendizado/salvar_aprendizado)

Suporte (núcleo):
- Embracon/Bradesco, Ademicon/Disal/GMAC, Itaú, HS, Alpha, Porto, Santander,
  Sicoob e BB Consórcios (SISBB/Extrato de Cota)  ← com tratamento de exceção

Extras:
- Heurística de NOME “colado” ao Contrato
- Captura por rótulo (linha/linha-seguinte) para Nome/Grupo/Cota
- Endereço por CEP (ViaCEP) com fallback
- Deriva data_primeira_assembleia (= menor data paga) e data_encerramento (se houver prazo)
- Fecho de contas com Decimal; grava diferença sem “forçar” soma
- Quadro “Valores / Percentuais Pagos” (valor e %), com caso especial BB
"""
import os
import re
import json
import unicodedata
import logging
import argparse
from datetime import datetime
from dateutil.relativedelta import relativedelta
from difflib import get_close_matches
from decimal import Decimal, ROUND_HALF_UP

import fitz  # PyMuPDF
import pdfplumber
from pdf2image import convert_from_path
import pytesseract
import requests

# Imports do projeto
from app.utils.utils import limpar_texto
from app.aprendizado.aprendizado import ler_aprendizado, salvar_aprendizado
from app.ml_templates_administradoras import extrator_templates
from app.extracao.extratores_especializados import aplicar_extrator_especializado
from app.utils.consulta_receita import consultar_cpf_receita, validar_cpf
from pathlib import Path
import shutil

# 🧠 MACHINE LEARNING - ATIVO!
ML_ATIVO = True

# Importar ML simples
ml_extrator_automatico = None
try:
    from ..ml_extracao_automatica import MLExtratorAutomatico
    ml_extrator_automatico = MLExtratorAutomatico()
    logging.info("🚀 ML carregado com sucesso!")
except Exception as e:
    logging.warning(f"⚠️ ML não carregado: {e}")
ml_extrator_automatico = None

try:
    import importlib.util
    import sys
    
    # Carrega ML de forma segura
    spec = importlib.util.spec_from_file_location("ml_ext", "app/ml_extracao_automatica.py")
    if spec and spec.loader:
        ml_module = importlib.util.module_from_spec(spec)
        sys.modules["ml_ext"] = ml_module
        spec.loader.exec_module(ml_module)
        
        if hasattr(ml_module, "MLExtratorAutomatico"):
            ml_extrator_automatico = ml_module.MLExtratorAutomatico()
            ML_ATIVO = True
            print("🚀 ML CARREGADO E ATIVO! Sistema inteligente habilitado.")
        else:
            print("⚠️ Classe MLExtratorAutomatico não encontrada")
    else:
        print("⚠️ Arquivo ML não encontrado")
        
except Exception as e:
    print(f"⚠️ ML não disponível: {e}")
    ML_ATIVO = True

logger_temp = logging.getLogger(__name__)
logger_temp.info("⚠️ Sistema ML temporariamente desabilitado para estabilidade de produção")

# =====================================================================================
# CONFIG / LOG
# =====================================================================================

DEBUG_EXTRACAO = False
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# =====================================================================================
# MAPA DE ADMINISTRADORAS (CNPJ)
# =====================================================================================

# Tenta carregar arquivo correto (busca em múltiplos caminhos possíveis)
CAMINHO_JSON = None
for caminho in [
    "backend/app/dados/administradoras.json",
    "app/dados/administradoras.json",
    "app/dados/administradoras_nova.json"
]:
    if Path(caminho).exists():
        CAMINHO_JSON = caminho
        break

try:
    if CAMINHO_JSON:
        with open(CAMINHO_JSON, "r", encoding="utf-8") as f:
            mapa_administradoras = json.load(f)
    else:
        mapa_administradoras = {}
except Exception:
    mapa_administradoras = {}
administradoras_conhecidas = list(mapa_administradoras.keys())

# =====================================================================================
# REGEX BÁSICOS
# =====================================================================================

VAL_BRL = r"(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}"
PERC = r"[+-]?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2,4}"
DATA_ANY = r"\b\d{2}/\d{2}/\d{2,4}\b"

PAID_ROW_REGEX = re.compile(
    r'(?i)\b('
    r'RECB(?:TO)?\.?\s*PARC(?:ELA)?'
    r'|RECEB(?:\.|IMENTO)?\s*PARC(?:ELA)?'
    r'|PGTO\.?\s*PARC(?:ELA)?'
    r'|PAG(?:TO|AMENTO)?\.?\s*PARC(?:ELA)?'
    r')\b'
)

# =====================================================================================
# HELPERS
# =====================================================================================

def _strip_accents(s: str) -> str:
    if not isinstance(s, str): return s
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))

def _norm(s: str) -> str:
    s = _strip_accents(s or "")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def normalizar_nome_administradora(nome_extraido: str) -> str:
    nome_extraido = (nome_extraido or "").upper().strip()
    if not administradoras_conhecidas: return nome_extraido
    cand = get_close_matches(nome_extraido, administradoras_conhecidas, n=1, cutoff=0.6)
    return cand[0] if cand else nome_extraido

def _to_float_smart(v: str) -> float:
    v = (v or "").strip()
    v = v.replace("R$", "").replace(" ", "")
    last_sep = None
    for ch in v[::-1]:
        if ch in ",.":
            last_sep = ch
            break
    digits = re.sub(r"[^\d,\.]", "", v)
    if last_sep is None:
        return float(re.sub(r"\D", "", digits) or 0)
    idx = digits.rfind(last_sep)
    inteira = re.sub(r"[^\d]", "", digits[:idx])
    dec = re.sub(r"[^\d]", "", digits[idx + 1:])
    if dec == "":
        dec = "00"
    return float((inteira or "0") + "." + dec)

def _to_decimal_smart(v: str) -> Decimal:
    return Decimal(str(_to_float_smart(v))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def _normalize_date(d: str) -> str:
    d = (d or "").strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{2})(?!\d)$", d)
    if m:
        yy = int(m.group(3)); yyyy = 2000 + yy
        return f"{m.group(1)}/{m.group(2)}/{yyyy:04d}"
    return d

def buscar_endereco_por_cep(cep: str):
    cep = re.sub(r"\D", "", cep or "")
    if len(cep) != 8:
        return {"logradouro": "", "bairro": "", "cidade": "", "estado": ""}
    try:
        r = requests.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=5)
        if r.status_code == 200:
            j = r.json()
            if j.get("erro"): return {"logradouro": "", "bairro": "", "cidade": "", "estado": ""}
            return {
                "logradouro": (j.get("logradouro") or "").upper(),
                "bairro": (j.get("bairro") or "").upper(),
                "cidade": (j.get("localidade") or "").upper(),
                "estado": (j.get("uf") or "").upper(),
            }
    except Exception:
        pass
    return {"logradouro": "", "bairro": "", "cidade": "", "estado": ""}

def buscar_cidade_estado_por_cep(cep):
    cep = re.sub(r"\D", "", cep or "")
    if len(cep) != 8: return "", ""
    try:
        r = requests.get(f"https://viacep.com.br/ws/{cep}/json/", timeout=5)
        if r.status_code == 200:
            j = r.json()
            return (j.get("localidade", "").upper(), j.get("uf", "").upper())
    except Exception:
        pass
    return "", ""

def _dump_debug(path: str, content: str):
    if not DEBUG_EXTRACAO: return
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception:
        pass

# ---------------------------------------------
# RÓTULOS / ENDEREÇO
# ---------------------------------------------

_UF_SET = {"AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
           "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"}

def _valor_por_rotulo(texto: str, rotulos, maxlen: int = 120):
    if isinstance(rotulos, str):
        rotulos = [rotulos]
    for rot in rotulos:
        pat_inline = rf"(?mi)(?<!\w){re.escape(rot)}(?!\w)\s*[:\-]?\s*([^\r\n]{{1,{maxlen}}})"
        m = re.search(pat_inline, texto)
        if m:
            val = (m.group(1) or "").strip()
            if re.match(r"^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2}$", val):
                continue
            if not re.search(r"(?i)\b(emitido|grupo|cota|contrato|proposta|cpf|cnpj)\b", val):
                return val
        pat_nextline = rf"(?mis)^\s*(?<!\w){re.escape(rot)}(?!\w)\s*[:\-]?\s*$\s^([^\r\n]{{1,{maxlen}}})$"
        m2 = re.search(pat_nextline, texto)
        if m2:
            val = (m2.group(1) or "").strip()
            if re.match(r"^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2}$", val):
                continue
            if not re.search(r"(?i)\b(emitido|grupo|cota|contrato|proposta|cpf|cnpj)\b", val):
                return val
    return ""

def _coletar_ceps_por_linha(texto: str):
    ceps = []; linhas = texto.splitlines()
    for idx, ln in enumerate(linhas):
        for m in re.finditer(r"\b\d{5}-?\d{3}\b", ln):
            ceps.append((m.group(0).replace("-", ""), idx))
    return ceps, linhas

def _indices_rotulos_endereco(linhas):
    idxs = []
    for i, ln in enumerate(linhas):
        if re.search(r"(?i)\b(Endere[cç]o|Logradouro|Rua|Avenida|Bairro|Cidade|Munic[ií]pio|UF|Estado|CEP)\b", ln):
            idxs.append(i)
        if re.search(r"(?i)\bComarca\s+do\s+Cliente\b", ln):
            idxs.extend([i, i])
    return idxs

def _escolher_cep_por_proximidade(texto_bruto: str, texto_limpo: str) -> str:
    ceps, linhas = _coletar_ceps_por_linha(texto_bruto or texto_limpo or "")
    if not ceps:
        m = re.search(r"\b\d{5}-?\d{3}\b", (texto_limpo or ""))
        return m.group(0).replace("-", "") if m else ""
    idxs_rotulos = _indices_rotulos_endereco(linhas)
    if not idxs_rotulos: return ceps[0][0]
    melhor = min(ceps, key=lambda c: min(abs(c[1] - r) for r in idxs_rotulos))
    return melhor[0]

# =====================================================================================
# CONVERSÃO PARA IMAGENS
# =====================================================================================

def converter_pdf_para_imagens(caminho_pdf):
    imagens = convert_from_path(caminho_pdf, dpi=200)
    caminhos = []
    # Usa diretório temporário absoluto para evitar PermissionError em produção
    try:
        from app.utils.paths import get_temp_uploads_dir
        pasta_imagens = os.path.join(get_temp_uploads_dir(), "imagens")
    except Exception:
        pasta_imagens = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "temp_uploads", "imagens")
    os.makedirs(pasta_imagens, exist_ok=True)
    for i, img in enumerate(imagens, start=1):
        caminho_img = os.path.join(pasta_imagens, f"pagina_{i}.png")
        img.save(caminho_img, "PNG")
        caminhos.append(caminho_img)
    return caminhos

# =====================================================================================
# LEITURA DE TEXTO / OCR
# =====================================================================================

def extrair_texto_pdfplumber(caminho_pdf: str) -> str:
    out = []
    with pdfplumber.open(caminho_pdf) as pdf:
        for pg in pdf.pages:
            out.append(pg.extract_text() or "")
    return "\n".join(out)

def extrair_texto_fitz(caminho_pdf: str) -> str:
    doc = fitz.open(caminho_pdf)
    textos = []
    for pg in doc:
        textos.append(pg.get_text() or "")
    return "\n".join(textos)

def ocr_pdf_completo(caminho_pdf: str, dpi=300, lang="por") -> str:
    imagens = convert_from_path(caminho_pdf, dpi=dpi)
    out = []
    for img in imagens:
        try:
            out.append(pytesseract.image_to_string(img, lang=lang) or "")
        except Exception:
            out.append(pytesseract.image_to_string(img) or "")
    return "\n".join(out)

def _texto_ruim(t: str) -> bool:
    if not t or len(t) < 300: return True
    up = t.upper()
    marcadores = ["CONTA CORRENTE", "EXTRATO DO CONSORCIADO", "VALORES PAGOS", "RECBTO", "PARCELA", "PARCELAS PAGAS"]
    hits = sum(1 for m in marcadores if m in up)
    qtd_digitos = sum(ch.isdigit() for ch in t)
    qtd_datas = len(re.findall(DATA_ANY, t))
    return (hits < 2) or (qtd_digitos < 150) or (qtd_datas < 3)

def _separar_datas_coladas(texto: str) -> str:
    return re.sub(r"(\d{2}/\d{2}/\d{4})(\d{2}/\d{2}/\d{4})", r"\1 \2", texto)

# =====================================================================================
# RECORTE DA SEÇÃO DE PARCELAS
# =====================================================================================

_INICIOS = [
    r"\bCONTA\s*-?\s*CORRENTE\b",
    r"\bEXTRATO\s+(DA|DE)?\s*CONTA\s*-?\s*CORRENTE\b",
    r"\bCONTA CORRENTE / VALORES PAGOS\b",
    r"\bVALORES PAGOS\b",
    r"\bVALORES\s*/\s*RECEBIDOS\b",
    r"\bEXTRATO FINANCEIRO DO CONSORCIADO\b",
    r"\bEXTRATO DO CONSORCIADO\b",
    r"\bPARCELAS\s+PAGAS\b",
]
_FINS = [
    r"\bPEND[ÊE]NCIA\b",
    r"\bPENDENCIAS?\b",
    r"\bVALORES\s*/\s*PERCENTUAIS\b",
    r"\bRESUMO(\s+PARCELAS?)?\b",
    r"\bPARCELAS?\s+A\s+VENCER\b",
    r"\bLAN[ÇC]AMENTOS\s+FUTUROS\b",
    r"\bRESUMO GERAL DA COTA\b",
    r"\bTOTAIS?:?\b",
    r"\bVALORES A PAGAR\b",
]

def _recortar_conta_corrente(texto: str) -> str:
    linhas = texto.splitlines()
    bloco = []; dentro = False
    for ln in linhas:
        up = ln.upper()
        if not dentro and any(re.search(p, up) for p in _INICIOS):
            dentro = True
            if DEBUG_EXTRACAO: logger.debug(">> início de seção encontrado: %s", up.strip())
            continue
        if dentro:
            if any(re.search(p, up) for p in _FINS):
                if DEBUG_EXTRACAO: logger.debug("<< fim de seção encontrado: %s", up.strip())
                break
            bloco.append(ln)
    secao = "\n".join(bloco).strip() or texto
    if DEBUG_EXTRACAO:
        logger.debug("Seção 'Conta Corrente' — %d linhas", len(secao.splitlines()))
        _dump_debug("debug_secao_conta_corrente.txt", secao)
    return secao

# =====================================================================================
# EXTRATORES — LINHAS DE PARCELAS (layouts diversos)
# =====================================================================================

# Embracon / Bradesco — linhas simples
_RE_EMBR_BRAD = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        RECBTO\.?\s*PARCELA\s+
        (?P<d1>{DATA_ANY})\s+
        (?P<d2>{DATA_ANY})\s+
        (?P<v1>{VAL_BRL})\s+
        (?P<v2>{VAL_BRL})
    """, re.IGNORECASE | re.VERBOSE,
)

# Flex (Sicoob etc.)
_RE_RECBTO_FLEX = re.compile(
    rf"""^\s*
        (?:\d{{1,3}}\s+)?                
        (?:\S+\s+){{0,4}}                
        RECBTO\.?\s*PARCELA\s+
        (?P<d1>{DATA_ANY})\s+
        (?P<d2>{DATA_ANY})\s+
        (?:\S+\s+){{0,6}}                
        (?P<v1>{VAL_BRL})\s+             
        (?P<v2>{VAL_BRL})                
    """, re.IGNORECASE | re.VERBOSE,
)

# Ademicon / Disal / GMAC
_RE_ASS_AVISO = re.compile(
    rf"""RECBTO\.?\s*PARCELA\s+
        (?P<venc>{DATA_ANY})\s+
        (?P<pag>{DATA_ANY})\s+
        \S+\s+
        (?:{VAL_BRL})\s+
        (?P<devido>{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})
    """, re.IGNORECASE | re.VERBOSE,
)

# Itaú
_RE_ITAU_V2 = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s*
        (?P<venc>{DATA_ANY})\s*
        (?P<pag>{DATA_ANY})\s+
        \S+\s+
        (?P<vlcredito>{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})\b
    """, re.IGNORECASE | re.VERBOSE,
)
_RE_ITAU = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        (?P<venc>{DATA_ANY})\s+
        (?P<pag>{DATA_ANY})\s+
        \S+\s+
        (?:{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})\s+
    """, re.IGNORECASE | re.VERBOSE,
)

# HS — "PGTO PARC" no fim
_RE_HS_ROW = re.compile(
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
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Alpha
_RE_ALPHA_ROW = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        Rec(?:\s+parcela(?:\s+normal|\s+inicial)?)\s*
        (?P<venc>{DATA_ANY})\s+(?P<pag>{DATA_ANY})\s+
        {VAL_BRL}\s+
        {VAL_BRL}\s+
        (?P<pago>{VAL_BRL})
    """, re.IGNORECASE | re.VERBOSE,
)

# Porto (bloco "VALORES PAGOS")
_RE_PORTO_ITEM_HINT = re.compile(r"(?i)\b(NORMAL|PARCELA)\b")

def _capturar_embr_bradesco(linhas):
    out = []
    for ln in linhas:
        ln_s = ln.strip()
        m = _RE_EMBR_BRAD.match(ln_s) or _RE_RECBTO_FLEX.match(ln_s)
        if m:
            data = _normalize_date(m.group("d2"))
            pago = _to_float_smart(m.group("v2"))
            if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

def _capturar_ass_aviso(linhas):
    out = []
    for ln in linhas:
        m = _RE_ASS_AVISO.search(ln)
        if not m: continue
        data = _normalize_date(m.group("pag"))
        pago = _to_float_smart(m.group("pago"))
        if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

def _capturar_itau_v2(linhas):
    out = []
    for ln in linhas:
        m = _RE_ITAU_V2.match(ln.strip()) or _RE_ITAU.match(ln.strip())
        if m:
            data = _normalize_date(m.group("pag"))
            pago = _to_float_smart(m.group("pago"))
            if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

def _capturar_hs(linhas):
    out = []
    for ln in linhas:
        if "PGTO PARC" not in ln.upper(): continue
        m = _RE_HS_ROW.match(ln.strip())
        if m:
            data = _normalize_date(m.group("pag"))
            pago = _to_float_smart(m.group("pago"))
            if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

def _capturar_alpha(linhas):
    out = []
    for ln in linhas:
        m = _RE_ALPHA_ROW.match(ln.strip())
        if m:
            data = _normalize_date(m.group("pag"))
            pago = _to_float_smart(m.group("pago"))
            if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

# ---------- PORTO ----------
def _extrair_bloco_valores_pagos_porto(texto: str) -> str:
    up = texto.upper()
    ini = up.find("VALORES PAGOS")
    if ini == -1: return ""
    fins = []
    for marker in ["VALORES A PAGAR", "RESUMO GERAL DA COTA", "TOTAIS", "RESUMO GERAL"]:
        j = up.find(marker, ini + 1)
        if j != -1: fins.append(j)
    fim = min(fins) if fins else len(texto)
    return texto[ini:fim]

def _capturar_porto_v2(texto_bruto: str) -> list:
    bloco = _extrair_bloco_valores_pagos_porto(texto_bruto)
    if not bloco.strip(): return []
    out = []
    for raw in bloco.splitlines():
        ln = raw.strip()
        if not ln: continue
        up = ln.upper()
        if "TOTAIS" in up or up == "TOTAL": continue
        if not _RE_PORTO_ITEM_HINT.search(up): continue
        datas = re.findall(DATA_ANY, ln)
        if not datas and re.search(r"\d{2}/\d{2}/\d{4}\d{2}/\d{2}/\d{4}", ln):
            ln = re.sub(r"(\d{2}/\d{2}/\d{4})(\d{2}/\d{2}/\d{4})", r"\1 \2", ln)
            datas = re.findall(DATA_ANY, ln)
        if not datas: continue
        data_pag = _normalize_date(datas[-1])
        valores = re.findall(VAL_BRL, ln)
        if not valores: continue
        pago = _to_float_smart(valores[0])
        if pago <= 0: continue
        out.append({"data_pagamento": data_pag, "valor_pago": round(pago, 2)})
    return out

def _capturar_porto_legacy(secao: str) -> list:
    _RE_PORTO_ROW = re.compile(
        rf"""(?P<d1>{DATA_ANY}).*?(?P<d2>{DATA_ANY}).*?(?P<pag>{DATA_ANY}).*?(?P<pago>{VAL_BRL})""",
        re.IGNORECASE | re.DOTALL,
    )
    out = []
    for raw in secao.splitlines():
        l = raw.strip()
        if not l: continue
        if "VALORES PAGOS" in l.upper() or "PARCELA" in l.upper():
            m = _RE_PORTO_ROW.search(l)
            if m:
                data = _normalize_date(m.group("pag"))
                pago = _to_float_smart(m.group("pago"))
                if pago > 0: out.append({"data_pagamento": data, "valor_pago": round(pago, 2)})
    return out

# ---------- SANTANDER ----------
def _capturar_santander(linhas):
    out = []
    for raw in linhas:
        ln = raw.strip(); up = ln.upper()
        if "RECBTO" not in up or "PARCELA" not in up: continue
        datas = re.findall(DATA_ANY, ln)
        if len(datas) < 2: continue
        data_pag = _normalize_date(datas[-1])
        valores = re.findall(VAL_BRL, ln)
        if not valores: continue

        idx_valor = None
        if len(valores) >= 3:
            valor_candidato = valores[2]
            valor_float = _to_float_smart(valor_candidato)
            idx_valor = 2
        else:
            valor_candidato = None
            valor_float = 0.0
            for offset, val in enumerate(valores[1:], start=1):
                num = _to_float_smart(val)
                if num > 0:
                    valor_candidato = val
                    valor_float = num
                    idx_valor = offset
                    break

        if valor_candidato is None:
            valor_candidato = valores[-2] if len(valores) >= 2 else valores[-1]
            valor_float = _to_float_smart(valor_candidato)
            idx_valor = len(valores) - (2 if len(valores) >= 2 else 1)

        # Multas/Juros aparecem logo após o valor pago
        pago = valor_float
        if pago > 0: out.append({"data_pagamento": data_pag, "valor_pago": round(pago, 2)})
    return out

# ---------- BB CONSÓRCIOS (tratamento de exceção forte) ----------
_RE_BB_PARCELA = re.compile(
    rf"""^\s*
        (?P<num>\d{{1,3}})\s+
        RECBTO\.?\s*PARCELA\s+
        (?P<venc>{DATA_ANY})
        (?:\s+(?P<pag>{DATA_ANY}))?
        \s+(?P<devido>{VAL_BRL})\s+
        (?P<pago>{VAL_BRL})\s*$
    """, re.IGNORECASE | re.VERBOSE
)

def _capturar_bbconsorcios(linhas):
    out = []; max_num = 0
    for raw in linhas:
        ln = raw.strip()
        if not ln: continue
        up = ln.upper()
        if "RECBTO" not in up or "PARCELA" not in up: continue
        m = _RE_BB_PARCELA.match(ln)
        if not m: continue
        num = m.group("num")
        try:
            max_num = max(max_num, int(num))
        except Exception:
            pass
        pago = _to_float_smart(m.group("pago"))
        data_pag = m.group("pag")
        if pago > 0 and data_pag:
            out.append({"data_pagamento": _normalize_date(data_pag), "valor_pago": round(pago, 2)})
    return out, max_num

def _bb_extrair_gcc_taxa_prazo(texto_limpo: str, texto_bruto: str) -> dict:
    """Campos BB que às vezes ficam espalhados e/ou em linhas separadas."""
    dados = {}

    # Grupo/Cota por rótulo (linha/linha seguinte)
    grupo = _valor_por_rotulo(texto_bruto, ["Grupo"]) or _valor_por_rotulo(texto_limpo, ["Grupo"])
    cota  = _valor_por_rotulo(texto_bruto, ["Cota"])  or _valor_por_rotulo(texto_limpo, ["Cota"])
    if grupo and re.fullmatch(r"[0-9A-Za-z\-/\.]{1,20}", grupo.replace(" ", "")): dados["grupo"] = grupo.strip()
    if cota  and re.fullmatch(r"[0-9A-Za-z\-/\.]{1,20}", cota.replace(" ", "")):   dados["cota"]  = cota.strip()

    # Taxa de Administração (%), BB costuma quebrar linha e usar 4 casas
    m_taxa_bb = re.search(r"(?i)Taxa\s*Administra[cç][aã]o\s*[\r\n ]+([0-9]{1,3}[.,][0-9]{3,4})\s*%", texto_bruto)
    if not m_taxa_bb:
        m_taxa_bb = re.search(r"(?i)Taxa\s*Administra[cç][aã]o[:\s]*([0-9]{1,3}[.,][0-9]{3,4})\s*%", texto_limpo)
    if m_taxa_bb:
        try:
            dados["taxa_adm_percentual"] = float(m_taxa_bb.group(1).replace(".", "").replace(",", "."))
        except Exception:
            pass

    # Prazo / Total de parcelas do plano
    # BB costuma trazer "Prazo .... 100" ou "Prazo: 100"
    m_prazo = re.search(r"(?i)\bPrazo\b[^\d]{0,10}(\d{1,3})\b", texto_bruto)
    if not m_prazo:
        m_prazo = re.search(r"(?i)\bPrazo\b[^\d]{0,10}(\d{1,3})\b", texto_limpo)
    if m_prazo:
        try:
            dados["total_parcelas_plano"] = int(m_prazo.group(1))
        except Exception:
            pass

    return dados

def _bb_extrair_total_e_quadro(texto: str) -> dict:
    """
    Pega:
      - total do extrato via 'Totais:' (última coluna)
      - quadro 'Valores / Percentuais Pagos' (Fundo comum etc.)
    """
    resp = {}

    # 1) Total do extrato (prioriza linha "Totais:")
    m_tot_line = re.search(r"(?mi)^\s*Totais?\s*:\s*(?:R\$\s*)?(" + VAL_BRL + r")\s+(?:R\$\s*)?(" + VAL_BRL + r")\s+(?:R\$\s*)?(" + VAL_BRL + r")\s*$", texto)
    if m_tot_line:
        try:
            # Por padrão a 1ª/2ª/3ª colunas: soma bruta / corrigido hoje / corrigido futuro (ou vice)
            # Para "valor_total_pago_extrato" usamos a 1ª coluna numérica da linha Totais:
            valor = _to_float_smart(m_tot_line.group(1))
            resp["valor_total_pago_extrato"] = round(valor, 2)
        except Exception:
            pass

    # 2) Quadro "Valores / Percentuais Pagos"
    bloco = _recortar_valores_percentuais_pagos(texto)
    if bloco.strip():
        linhas = [ln.strip() for ln in bloco.splitlines() if ln.strip()]
        for ln in linhas:
            up = _norm(ln)

            def set_final(prefix_key):
                v, p = _parse_valor_e_percentual(ln)
                if v is not None: resp[f"{prefix_key}_valor"] = round(v, 2)
                if p is not None: resp[f"{prefix_key}_percentual"] = float(f"{p:.4f}")

            if up.startswith("fundo comum"):
                set_final("fundo_comum")
            elif up.startswith("fundo de reserva") or up.startswith("fundo reserva"):
                set_final("fundo_reserva")
            elif up.startswith("taxa de administracao") or up.startswith("taxa de administração"):
                set_final("taxa_adm_cobrada")
            elif up.startswith("adesao") or up.startswith("adesão(-)") or up.startswith("adesão"):
                set_final("adesao")
            elif up.startswith("seguros"):
                set_final("seguros")
            elif up.startswith("multas"):
                set_final("multas")
            elif up.startswith("juros"):
                set_final("juros")
            elif up.startswith("outros valores") or up.startswith("outros valores:"):
                set_final("outros_valores")
            elif up.startswith("total"):
                m = re.search(VAL_BRL, ln)
                if m: resp["total_valores_pagos"] = round(_to_float_smart(m.group(0)), 2)

    return resp

# ---------- GENÉRICO ----------
def extrair_parcelas_generico(texto_bruto: str) -> list:
    secao = _recortar_conta_corrente(texto_bruto)
    secao = _separar_datas_coladas(secao)
    parcelas = []
    blacklist = ("PENDENCIA", "PENDÊNCIA", "PENDENCIAS", "PENDÊNCIAS",
                 "AJUSTE", "DIFEREN", "CORRE", "LANCE", "SEGURO", "MULTA", "A PAGAR")
    for raw in secao.splitlines():
        l = raw.strip()
        if not l: continue
        up = l.upper()
        if "TOTAL" in up or "TOTAIS" in up or any(b in up for b in blacklist): continue
        if not PAID_ROW_REGEX.search(up): continue
        datas = re.findall(DATA_ANY, l)
        d = _normalize_date(datas[-1]) if datas else None
        vals = re.findall(VAL_BRL, l)
        if not vals or not d: continue
        
        # 🆕 Heurística melhorada: detecta padrão HS onde os últimos valores são percentuais (<1)
        # Estrutura HS: [ValorBem, ValorDev, ValorPago, Multas, Juros, Seguro, %Normal, %Difer]
        pago = None
        
        # 1. Procura por dois valores iguais consecutivos > 10.0 (valor duplicado)
        for i in range(len(vals) - 1):
            val1 = _to_float_smart(vals[i])
            val2 = _to_float_smart(vals[i + 1])
            if val1 == val2 and val1 > 10.0:
                pago = val1
                break
        
        # 2. Se não encontrou, procura valores > 10.0 antes dos percentuais
        #    No padrão HS: [ValorBem, ValorDev, ValorPago, zeros...]
        #    O ValorPago geralmente é o 2º ou 3º valor > 10
        if pago is None and len(vals) >= 3:
            # Identifica quantos valores < 1.0 tem no final (percentuais)
            qtd_percentuais = 0
            for i in range(len(vals) - 1, -1, -1):
                if _to_float_smart(vals[i]) < 1.0:
                    qtd_percentuais += 1
                else:
                    break
            
            # Pega todos valores > 10.0 antes dos percentuais
            if qtd_percentuais > 0:
                valores_grandes = []
                for i in range(len(vals) - qtd_percentuais):
                    val = _to_float_smart(vals[i])
                    if val > 10.0:
                        valores_grandes.append(val)
                
                # Se tem 3+ valores grandes, o valor pago geralmente é o 2º ou 3º
                # (1º é ValorBem ~36.000, 2º é ValorDev ~209, 3º é ValorPago ~210)
                if len(valores_grandes) >= 3:
                    # Pega o 3º valor (índice 2) que geralmente é o ValorPago
                    pago = valores_grandes[2]
                elif len(valores_grandes) >= 2:
                    # Se tem só 2 valores, pega o 2º
                    pago = valores_grandes[1]
                elif len(valores_grandes) >= 1:
                    # Fallback: pega o último valor grande
                    pago = valores_grandes[-1]
        
        # 3. Fallback: usa lógica antiga
        if pago is None:
            pago = _to_float_smart(vals[-1])
            if pago <= 0 and len(vals) >= 2:
                pago = _to_float_smart(vals[-2])
        
        if pago > 0:
            parcelas.append({"data_pagamento": d, "valor_pago": round(pago, 2)})
    # dedup
    uniq = {(p["data_pagamento"], p["valor_pago"]): p for p in parcelas}
    return list(uniq.values())

# =====================================================================================
# EMBRACON PRECISO
# =====================================================================================

_RE_LINHA_PAGA_EMBR = re.compile(
    rf"""^\s*
        (?P<num>\d{{3}})\s+
        RECBTO\.?\s*PARCELA\s+
        (?P<data_contab>{DATA_ANY})\s+
        (?P<data_pgto>{DATA_ANY})\s+
        (?P<val_pagar>{VAL_BRL})\s+
        (?P<val_pago>{VAL_BRL})
        """,
    re.IGNORECASE | re.VERBOSE
)

_STOP_MARKERS = ("TOTAIS","VALORES / PERCENTUAIS PAGOS","VALORES/ PERCENTUAIS PAGOS","PENDÊNCIA","PENDENCIA","PENDÊNCIAS","PENDENCIAS",)

def _recortar_conta_corrente_embracon(texto: str) -> str:
    up = texto.upper()
    ini = up.find("CONTA CORRENTE")
    if ini == -1: ini = up.find("CONTA-CORRENTE")
    if ini == -1: return texto
    fim = len(texto)
    for m in _STOP_MARKERS:
        j = up.find(m, ini + 1)
        if j != -1: fim = min(fim, j)
    return texto[ini:fim]

def extrair_parcelas_embracon_preciso(texto_bruto: str):
    bloco = _recortar_conta_corrente_embracon(texto_bruto)
    linhas = [ln.strip() for ln in bloco.splitlines() if ln.strip()]
    parcelas = []; i = 0
    while i < len(linhas):
        ln = linhas[i]; U = ln.upper()
        if U.startswith("(*)") or "DEBITO" in U or "DÉBITO" in U:
            i += 1; continue
        m = _RE_LINHA_PAGA_EMBR.match(ln)
        if not m and i + 1 < len(linhas):
            m = _RE_LINHA_PAGA_EMBR.match(ln + " " + linhas[i + 1])
            if m: i += 1
        if m:
            data_pgto = _normalize_date(m.group("data_pgto"))
            val_pago = _to_float_smart(m.group("val_pago"))
            if val_pago > 0:
                parcelas.append({"data_pagamento": data_pgto, "valor_pago": round(val_pago, 2)})
        i += 1
    try:
        parcelas.sort(key=lambda p: datetime.strptime(p["data_pagamento"], "%d/%m/%Y"))
    except Exception:
        pass
    if DEBUG_EXTRACAO:
        logger.debug("[embracon_preciso] %d parcelas | soma=%.2f",
                     len(parcelas), sum(p.get('valor_pago', 0.0) for p in parcelas))
    return parcelas

def _extrair_total_pago_embracon(texto_bruto: str) -> float:
    bloco = _recortar_conta_corrente_embracon(texto_bruto)
    for ln in bloco.splitlines():
        if not ln.strip(): continue
        up = ln.upper().strip()
        if up.startswith("TOTAIS") or up == "TOTAL" or up.startswith("TOTAL "):
            vals = re.findall(VAL_BRL, ln)
            if vals: return round(_to_float_smart(vals[-1]), 2)
    m = re.search(rf"(?i)VALOR\s+PAGO\s+NO\s+EXTRATO[^0-9]*({VAL_BRL})", texto_bruto)
    if m: return round(_to_float_smart(m.group(1)), 2)
    return 0.0

def _extrair_dados_completos_hs(texto_bruto: str) -> dict:
    """
    Extrai dados completos do extrato HS incluindo:
    1. Data da 1ª Assembleia
    2. Prazo (total de parcelas)
    3. Valor total pago no extrato
    """
    dados_hs = {}
    
    # 1. Data da 1ª Assembleia - busca padrões comuns
    m_data = re.search(r"(?i)(?:1[ªº]?\s*)?(?:PRIMEIRA\s+)?ASSEMBL[EÉ]IA[^0-9]*(\d{2}/\d{2}/\d{4})", texto_bruto)
    if m_data:
        dados_hs["data_primeira_assembleia"] = m_data.group(1)
    
    # 2. Prazo - busca "180 meses" ou padrões similares
    m_prazo = re.search(r"(?i)\bPRAZO[^0-9]*(\d{2,3})\s*MESES?", texto_bruto)
    if not m_prazo:
        # Busca apenas número de meses sem "prazo"
        m_prazo = re.search(r"(\d{2,3})\s*MESES?", texto_bruto)
    if m_prazo:
        try:
            dados_hs["total_parcelas_plano"] = int(m_prazo.group(1))
        except ValueError:
            pass
    
    # 3. Valor total pago - múltiplos padrões (PRIORIDADE: linha TOTAIS)
    # Padrão 1: Linha TOTAIS diretamente (mais confiável para HS)
    m_totais = re.search(rf"(?i)TOTAIS\s*:\s*({VAL_BRL})", texto_bruto)
    if m_totais:
        dados_hs["valor_total_pago_extrato"] = round(_to_float_smart(m_totais.group(1)), 2)
    else:
        # Padrão 2: "VALOR PAGO EXTRATO"
        m_valor = re.search(rf"(?i)VALOR\s+PAGO\s+(?:NO\s+)?EXTRATO[^0-9]*({VAL_BRL})", texto_bruto)
        if m_valor:
            dados_hs["valor_total_pago_extrato"] = round(_to_float_smart(m_valor.group(1)), 2)
        else:
            # Padrão 3: Busca por valores altos na página 2 (fallback)
            linhas = texto_bruto.split('\n')
            encontrou_totais = False
            for linha in linhas:
                if "TOTAIS" in linha.upper():
                    # Tenta extrair o primeiro valor da linha TOTAIS
                    valores = re.findall(VAL_BRL, linha)
                    if valores:
                        primeiro_valor = _to_float_smart(valores[0])
                        dados_hs["valor_total_pago_extrato"] = round(primeiro_valor, 2)
                        break
                    encontrou_totais = True
                    continue
                
                # Após encontrar "Totais", procura por valores grandes
                if encontrou_totais:
                    valores = re.findall(VAL_BRL, linha)
                    for valor_str in valores:
                        valor = _to_float_smart(valor_str)
                        # Se o valor for > 1000, provavelmente é o total das parcelas
                        if valor > 1000:
                            dados_hs["valor_total_pago_extrato"] = round(valor, 2)
                            break
                    if "valor_total_pago_extrato" in dados_hs:
                        break
    
    # 4. Valores adicionais (fundo comum, fundo reserva, etc.)
    try:
        from app.extracao.extratores_especializados import ExtratorKSK
        valores_adicionais = ExtratorKSK._extrair_valores_adicionais_ksk(texto_bruto)
        dados_hs.update(valores_adicionais)
        logger.info(f"💰 HS: Valores adicionais extraídos: {list(valores_adicionais.keys())}")
    except Exception as e:
        logger.warning(f"⚠️ HS: Erro ao extrair valores adicionais: {e}")
    
    return dados_hs

def _extrair_total_pago_hs(texto_bruto: str) -> float:
    """
    Extrai apenas o valor total pago do extrato HS
    """
    dados = _extrair_dados_completos_hs(texto_bruto)
    return dados.get("valor_total_pago_extrato", 0.0)

# =====================================================================================
# BLOCO “VALORES / PERCENTUAIS PAGOS”
# =====================================================================================

_PAT_INICIO_VALORES_PAGOS = re.compile(
    r"(?i)(\bVALORES\s*/\s*PERCENTUAIS\s*PAGOS\b|\bVALORES\s*/\s*PERCENTUAIS\b)"
)

def _recortar_valores_percentuais_pagos(texto: str) -> str:
    m = _PAT_INICIO_VALORES_PAGOS.search(texto)
    if not m: return ""
    ini = m.start()
    fim_da_linha = texto.find("\n", ini)
    if fim_da_linha == -1: fim_da_linha = ini
    busca_a_partir = fim_da_linha + 1
    candidatos_fim = []; up = texto.upper()
    for marker in ["\nTOTAL","VALORES / PERCENTUAIS A PAGAR","VALORES/ PERCENTUAIS A PAGAR","VALORES A PAGAR","RESUMO","RESUMO GERAL","RESUMO GERAL DA COTA"]:
        j = up.find(marker.upper(), max(busca_a_partir, ini + 1))
        if j != -1: candidatos_fim.append(j)
    fim = min(candidatos_fim) if candidatos_fim else len(texto)
    bloco = texto[ini:fim]
    _dump_debug("debug_valores_percentuais_pagos.txt", bloco)
    return bloco

def _parse_valor_e_percentual(linha: str):
    val = re.search(VAL_BRL, linha); perc = None
    if val:
        mperc = re.search(rf"{VAL_BRL}\s+({PERC})", linha)
        if mperc: perc = mperc.group(1)
    if not val: return None, None
    v = _to_float_smart(val.group(0))
    p = _to_float_smart(perc) if perc else None
    return v, (p if p is not None else None)

def extrair_valores_percentuais_pagos(texto: str) -> dict:
    bloco = _recortar_valores_percentuais_pagos(texto)
    if not bloco.strip(): return {}
    resultado = {}
    linhas = [ln.strip() for ln in bloco.splitlines() if ln.strip()]
    for ln in linhas:
        up = _norm(ln)
        def set_if_found(prefix_key):
            v, p = _parse_valor_e_percentual(ln)
            if v is not None: resultado[f"{prefix_key}_valor"] = round(v, 2)
            if p is not None: resultado[f"{prefix_key}_percentual"] = float(f"{p:.4f}")
        if up.startswith("fundo comum"): set_if_found("fundo_comum")
        elif up.startswith("fundo de reserva") or up.startswith("fundo reserva"): set_if_found("fundo_reserva")
        elif up.startswith("taxa de administracao") or up.startswith("taxa de administração"): set_if_found("taxa_adm_cobrada")
        elif up.startswith("adesao") or up.startswith("adesão(-)") or up.startswith("adesão"): set_if_found("adesao")
        elif up.startswith("seguros"): set_if_found("seguros")
        elif up.startswith("multas"): set_if_found("multas")
        elif up.startswith("juros"): set_if_found("juros")
        elif up.startswith("outros valores") or up.startswith("outros valores:"): set_if_found("outros_valores")
        elif up.startswith("total"):
            m = re.search(VAL_BRL, ln)
            if m: resultado["total_valores_pagos"] = round(_to_float_smart(m.group(0)), 2)
    return resultado

# =====================================================================================
# CAMPOS DE CABEÇALHO (genérico + BB exceção)
# =====================================================================================

def _extrair_campos_basicos(texto_limpo: str, texto_bruto: str):
    dados = {}
    try:
        # Administradora
        m_adm = re.search(r"([A-Z0-9 \.\-/&ºªÇÃÕÂÊÔÁÉÍÓÚ]+ADMINISTRADORA[^\n]*)", texto_bruto, re.I)
        if m_adm:
            nome_adm = re.sub(r"Extrato.*$", "", m_adm.group(1), flags=re.I).strip()
            dados["administradora"] = normalizar_nome_administradora(nome_adm)

        # Grupo/Cota/Contrato/Nome (com “colado”)
        m_gccn = re.search(
            r"Grupo[:\s]*?(?P<grupo>\d+)\s*Cota[:\s]*?(?P<cota>[\w\-/\.]+)\s*(?:Contrato|Proposta)[:\s]*?(?P<contrato>\d{6,20})(?P<nome>[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ\s\.\-]+)?",
            texto_bruto
        )
        if m_gccn:
            dados["grupo"] = (m_gccn.group("grupo") or "").strip()
            dados["cota"] = (m_gccn.group("cota") or "").strip()
            dados["numero_contrato"] = (m_gccn.group("contrato") or "").strip()
            if m_gccn.group("nome"): dados["nome_cliente"] = limpar_texto(m_gccn.group("nome"))
        else:
            m_gc = re.search(r"Grupo[:\s]*([0-9\.]+)\s*Cota[:\s]*([0-9A-Za-z\-/\.]+)", texto_bruto, re.I)
            if m_gc:
                dados["grupo"] = m_gc.group(1).strip(); dados["cota"] = m_gc.group(2).strip()
            m_ct = re.search(r"(?:Contrato|Proposta)[:\s]*([0-9]{6,20})", texto_bruto, re.I)
            if m_ct: dados["numero_contrato"] = m_ct.group(1).strip()
            m_nome = re.search(r"Cota[:\s]*[0-9A-Za-z\-/\.]+\s*([A-ZÀ-Ü\s\.\-']{5,})\s*(?:Contrato|Proposta)", texto_bruto)
            if m_nome and not dados.get("nome_cliente"):
                dados["nome_cliente"] = limpar_texto(m_nome.group(1))

        if not dados.get("nome_cliente"):
            m_nome_alt = re.search(
                r"Grupo[:\s]*?(?P<grupo>\d+)\s*Cota[:\s]*?(?P<cota>[\w\-/\.]+)(?:\s+\d{1,4})?\s+(?P<nome>[A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ\s\.\-']{5,}?)(?:\s+(?:Contrato|Proposta)[:\s]*(?P<contrato>\d{6,20}))",
                texto_bruto
            )
            if m_nome_alt:
                if not dados.get("grupo"): dados["grupo"] = (m_nome_alt.group("grupo") or "").strip()
                if not dados.get("cota"): dados["cota"] = (m_nome_alt.group("cota") or "").strip()
                if not dados.get("numero_contrato") and m_nome_alt.group("contrato"):
                    dados["numero_contrato"] = (m_nome_alt.group("contrato") or "").strip()
                dados["nome_cliente"] = limpar_texto(m_nome_alt.group("nome"))

        # Variante BB em linhas separadas
        if "grupo" not in dados or not dados.get("grupo"):
            m_grupo_only = re.search(r"\bGrupo\b[:\s]*([0-9A-Za-z\-/\.]{1,20})", texto_limpo, re.I)
            if m_grupo_only: dados["grupo"] = m_grupo_only.group(1).strip()
        if "cota" not in dados or not dados.get("cota"):
            m_cota_only = re.search(r"\bCota\b[:\s]*([0-9A-Za-z\-/\.]{1,20})", texto_limpo, re.I)
            if m_cota_only: dados["cota"] = m_cota_only.group(1).strip()

        # Nome do cliente
        if not dados.get("nome_cliente"):
            val = _valor_por_rotulo(texto_bruto, ["Consorciado", "Cliente", "Participante"], maxlen=120) \
               or _valor_por_rotulo(texto_limpo, ["Consorciado", "Cliente", "Participante"], maxlen=120)
            if val and not re.search(r"(?i)\b(BB\s*Cons[óo]rcios|Administradora|Banco)\b", val):
                val = re.sub(r"\s{2,}.*$", "", val).strip()
                dados["nome_cliente"] = limpar_texto(val)
        
        # 🆕 NOME QUEBRADO: HS e outras administradoras que colocam nome em múltiplas linhas
        # Padrão: Nome Pai: ... Nome Mãe: + linha anterior + linha seguinte
        # ⚠️ CORREÇÃO: Não capturar nome da mãe como titular
        if not dados.get("nome_cliente") or dados.get("nome_cliente") == "P" or len(dados.get("nome_cliente", "")) < 3:
            match_nome_quebrado = re.search(
                r'([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+)\n.*?Nome\s+Pai:.*?Nome\s+M[aã]e:\s*\n([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+)',
                texto_bruto,
                re.IGNORECASE
            )
            
            if match_nome_quebrado:
                parte1 = match_nome_quebrado.group(1).strip()
                parte2 = match_nome_quebrado.group(2).strip()
                
                # 🚨 CORREÇÃO: Verificar se não é nome de mãe/pai
                # Se encontrar padrões típicos de nome de mãe, deixar campo vazio
                palavras_mae = ['vicenzi', 'bettanin', 'silva', 'santos', 'oliveira']
                texto_verificacao = f"{parte1} {parte2}".lower()
                
                # Verifica se contém indicadores de que é nome de mãe/parente
                eh_nome_mae = any(palavra in texto_verificacao for palavra in palavras_mae)
                eh_nome_mae = eh_nome_mae or 'mae' in texto_verificacao.lower()
                eh_nome_mae = eh_nome_mae or 'mãe' in texto_verificacao.lower()
                
                if eh_nome_mae:
                    logger.warning(f"⚠️ Nome detectado como possível nome de mãe, deixando vazio: {parte1} {parte2}")
                    dados["nome_cliente"] = ""  # Deixa vazio para preenchimento manual
                else:
                    # Remove linhas com números, símbolos ou muito curtas
                    parte1_limpa = ' '.join([
                        linha.strip() for linha in parte1.split('\n') 
                        if linha.strip() 
                        and not re.search(r'[\d:/@\(\)]', linha)
                        and len(linha.strip()) > 2
                        and not re.search(r'(?i)(sigilo|corretor|profiss[aã]o|renda|telefone|ramal)', linha)
                    ])
                    
                    parte2_limpa = ' '.join([
                        linha.strip() for linha in parte2.split('\n')
                        if linha.strip()
                        and not re.search(r'[\d:/@\(\)]', linha)
                        and len(linha.strip()) > 2
                        and not re.search(r'(?i)(conv[eê]nio|data|nascimento|pa[ií]s|nacionalidade)', linha)
                    ])
                    
                    nome_completo = f"{parte1_limpa} {parte2_limpa}".strip()
                    nome_completo = re.sub(r'\s+', ' ', nome_completo)  # Remove espaços duplos
                    
                    if len(nome_completo) > 3 and nome_completo != 'P':
                        dados["nome_cliente"] = nome_completo.upper()
                        logger.info(f"✅ Nome quebrado reconstruído: {nome_completo}")
                    else:
                        dados["nome_cliente"] = ""  # Deixa vazio se não conseguir extrair nome válido
        
        # 🆕 BUSCA UNIVERSAL DE NOME POR CPF + DATA NASCIMENTO (para todas as administradoras)
        if not dados.get("nome_cliente") or len(dados.get("nome_cliente", "")) < 3:
            cpf_para_busca = dados.get("cpf_cnpj")
            tipo_doc = dados.get("tipo_documento", "")
            
            # 🔍 Busca data de nascimento - PRIORIZA seção DADOS CADASTRAIS
            data_nascimento = None
            
            # 1️⃣ Busca na seção DADOS CADASTRAIS (mais preciso)
            secao_cadastrais = re.search(r"DADOS\s+CADASTRAIS(.*?)(?:CONTA\s+CORRENTE|TOTAIS|MOVIMENTA[CÇ][ÃO]|$)", texto_bruto, re.IGNORECASE | re.DOTALL)
            if secao_cadastrais:
                secao_texto = secao_cadastrais.group(1)
                # Busca "Data Nascimento:" seguido da data
                m_nasc_cadastrais = re.search(r"(?i)data\s+nascimento[:\s]*(\d{2}/\d{2}/\d{4})", secao_texto)
                if m_nasc_cadastrais:
                    data_nascimento = m_nasc_cadastrais.group(1)
                    logger.info(f"✅ Data nascimento encontrada em DADOS CADASTRAIS: {data_nascimento}")
            
            # 2️⃣ Fallback: busca geral no texto
            if not data_nascimento:
                padroes_nascimento = [
                    r"(?i)(?:nascimento|nasc)[^\d]*(\d{2}/\d{2}/\d{4})",
                    r"(?i)(?:data.*nasc|dt.*nasc)[^\d]*(\d{2}/\d{2}/\d{4})",
                    r"(?i)(?:birth|born)[^\d]*(\d{2}/\d{2}/\d{4})"
                ]
                
                for padrao in padroes_nascimento:
                    m_nasc = re.search(padrao, texto_bruto)
                    if m_nasc:
                        data_nascimento = m_nasc.group(1)
                        logger.info(f"✅ Data nascimento encontrada (fallback): {data_nascimento}")
                        break
            
            # 🆕 CONSULTA RECEITA FEDERAL: Busca nome automaticamente se tiver CPF + data nascimento
            if cpf_para_busca and len(cpf_para_busca) == 11 and tipo_doc == "CPF":
                try:
                    log_msg = f"🔍 CPF: {cpf_para_busca[:3]}.{cpf_para_busca[3:6]}.***-**"
                    if data_nascimento:
                        log_msg += f" + Data Nasc: {data_nascimento}"
                    logger.info(log_msg)
                    
                    # 🆕 CONSULTA RECEITA FEDERAL: Se tiver CPF E data de nascimento
                    if data_nascimento and validar_cpf(cpf_para_busca):
                        logger.info(f"🌐 Consultando Receita Federal para buscar nome...")
                        nome_receita = consultar_cpf_receita(cpf_para_busca, data_nascimento)
                        
                        if nome_receita:
                            dados["nome_cliente"] = nome_receita.upper()
                            logger.info(f"✅ Nome obtido da Receita Federal: {nome_receita}")
                        else:
                            logger.warning(f"⚠️ Receita Federal não retornou nome - deixando vazio para preenchimento manual")
                            dados["nome_cliente"] = ""
                            dados["_cpf_disponivel_para_busca"] = cpf_para_busca
                            dados["_data_nascimento_disponivel"] = data_nascimento
                    else:
                        if not data_nascimento:
                            logger.warning(f"⚠️ Data de nascimento não encontrada - não é possível consultar Receita Federal")
                        elif not validar_cpf(cpf_para_busca):
                            logger.warning(f"⚠️ CPF inválido - não é possível consultar Receita Federal")
                        
                        dados["nome_cliente"] = ""
                        dados["_cpf_disponivel_para_busca"] = cpf_para_busca
                        if data_nascimento:
                            dados["_data_nascimento_disponivel"] = data_nascimento
                        
                except Exception as e:
                    logger.error(f"❌ Erro ao consultar Receita Federal: {e}")
                    dados["nome_cliente"] = ""

        # Documento (cliente)
        m_doc = re.search(r"(?:CPF\/CNPJ|CNPJ\/CPF|CPF|CNPJ)[^\d]*([\d\.\-\/]{11,18})", texto_limpo, re.I)
        if m_doc:
            doc = re.sub(r"\D", "", m_doc.group(1))
            if len(doc) in (11, 14):
                dados["cpf_cnpj"] = doc
                dados["tipo_documento"] = "CNPJ" if len(doc) == 14 else "CPF"
        
        # 🆕 CNPJ da Administradora (busca todos os CNPJs no documento)
        if not dados.get("cnpj_administradora") or not dados.get("administradora"):
            # Busca todos os CNPJs no texto (14 dígitos)
            todos_cnpjs = re.findall(r"\b\d{2}[\.]\d{3}[\.]\d{3}[\/]\d{4}[-]\d{2}\b", texto_bruto)
            todos_cnpjs += re.findall(r"\b(\d{14})\b", texto_bruto)
            
            logger.info(f"🔍 [CNPJ] Encontrados {len(todos_cnpjs)} CNPJs no texto: {todos_cnpjs[:5]}")
            
            # Verifica se algum é de administradora conhecida
            for cnpj_encontrado in todos_cnpjs:
                cnpj_limpo = re.sub(r"\D", "", cnpj_encontrado)
                if len(cnpj_limpo) == 14:
                    # Verifica se é o CNPJ do cliente
                    if dados.get("cpf_cnpj") and cnpj_limpo == re.sub(r"\D", "", dados["cpf_cnpj"]):
                        logger.info(f"⏭️  [CNPJ] Pulando CNPJ do cliente: {cnpj_limpo}")
                        continue  # Pula CNPJ do cliente
                    
                    # Verifica se é CNPJ de administradora conhecida
                    for nome_admin, info in mapa_administradoras.items():
                        cnpj_admin = re.sub(r"\D", "", info.get("cnpj", ""))
                        if cnpj_limpo == cnpj_admin:
                            # Preenche CNPJ formatado
                            dados["cnpj_administradora"] = cnpj_limpo
                            
                            # Preenche nome completo
                            if not dados.get("administradora"):
                                dados["administradora"] = nome_admin
                                logger.info(f"📋 Nome da administradora preenchido: {nome_admin}")
                            
                            # Preenche CEP
                            if not dados.get("cep_administradora") and info.get("cep"):
                                dados["cep_administradora"] = info["cep"]
                                logger.info(f"📍 CEP preenchido via CNPJ: {info['cep']}")
                            
                            logger.info(f"✅ CNPJ da administradora detectado: {info['cnpj']} ({nome_admin})")
                            break
                    else:
                        logger.info(f"❌ [CNPJ] Não encontrado na base: {cnpj_limpo}")

        # Taxa Adm (genérica)
        m_taxa = re.search(r"(?i)Taxa\s*Adm(?:inistra[cç][aã]o)?[^\d]{0,10}([0-9]{1,3}(?:[.,][0-9]{1,4})?)", texto_limpo)
        if m_taxa:
            try:
                taxa_val = _to_float_smart(m_taxa.group(1))
                dados["taxa_adm_percentual"] = taxa_val
                if "taxa_adm_contratada_percentual" not in dados:
                    dados["taxa_adm_contratada_percentual"] = taxa_val
            except Exception:
                pass

        # Plano / parcelas
        m_plan = re.search(r"Plano\s*B[aá]sico:?\s*([0-9]{1,3})", texto_limpo, re.I)
        if m_plan:
            try: dados["total_parcelas_plano"] = int(m_plan.group(1))
            except Exception: pass
        else:
            m_prazo = re.search(r"(?i)\bPrazo\b[^\d]{0,10}(\d{1,3})\b", texto_bruto)
            if m_prazo:
                try: dados["total_parcelas_plano"] = int(m_prazo.group(1))
                except Exception: pass

        # Valor crédito
        m_credito = re.search(r"Valor\s*Cr[ée]dito:?\s*(" + VAL_BRL + r")", texto_bruto, re.I)
        if m_credito:
            dados["valor_credito"] = round(_to_float_smart(m_credito.group(1)), 2)

        # Encerramento explícito
        m_enc = re.search(
            r"(Data (?:prevista )?para o encerramento do grupo|Data do(?: último)? vencimento da cota|Data prevista para o encerramento)[^\d]*(\d{2}/\d{2}/\d{4})",
            texto_limpo, re.I
        )
        if m_enc:
            dados["data_encerramento"] = m_enc.group(2)

        # ENDEREÇO (CEP → ViaCEP)
        cep_escolhido = _escolher_cep_por_proximidade(texto_bruto, texto_limpo)
        if cep_escolhido: dados["cep"] = cep_escolhido
        via = {"logradouro": "", "bairro": "", "cidade": "", "estado": ""}
        if dados.get("cep"): via = buscar_endereco_por_cep(dados["cep"])
        if via.get("logradouro"): dados["rua"] = limpar_texto(via["logradouro"])
        if via.get("bairro"): dados["bairro"] = limpar_texto(via["bairro"])
        if via.get("cidade"): dados["cidade"] = via["cidade"]
        if via.get("estado") and via["estado"] in _UF_SET: dados["estado"] = via["estado"]

        if not dados.get("rua"):
            rua_raw = _valor_por_rotulo(texto_bruto, ["Endereço","Endereco","Logradouro","Rua","Avenida","Av.","Av"]) \
                   or _valor_por_rotulo(texto_limpo, ["Endereço","Endereco","Logradouro","Rua","Avenida","Av.","Av"])
            if rua_raw:
                rua_raw = re.sub(r"\bCEP\s*\d{5}-?\d{3}\b.*$", "", rua_raw, flags=re.I).strip(" ,.-")
                dados["rua"] = limpar_texto(rua_raw)

        if not dados.get("bairro"):
            bairro = _valor_por_rotulo(texto_bruto, ["Bairro"], maxlen=80) \
                  or _valor_por_rotulo(texto_limpo, ["Bairro"], maxlen=80)
            if bairro: dados["bairro"] = limpar_texto(bairro)

        if not dados.get("cidade"):
            m_cidade = re.search(r"(?mi)\b(Cidade|Munic[ií]pio)\b\s*[:\-]?\s*([A-ZÀ-Ü\s\.\-']{2,})", texto_limpo)
            if m_cidade:
                dados["cidade"] = m_cidade.group(2).strip().upper()
            else:
                m_ciduf = re.search(r"(?m)^([A-ZÀ-Ü][A-ZÀ-Ü\s\.\-']{2,})\s*[-–]\s*([A-Z]{2})\b", texto_bruto)
                if m_ciduf and m_ciduf.group(2).upper() in _UF_SET:
                    dados["cidade"] = m_ciduf.group(1).strip().upper()
                    dados.setdefault("estado", m_ciduf.group(2).upper())

        if not dados.get("estado"):
            m_uf = re.search(r"(?mi)\b(UF|Estado)\b\s*[:\-]?\s*([A-Z]{2})\b", texto_limpo)
            if m_uf and m_uf.group(2).upper() in _UF_SET:
                dados["estado"] = m_uf.group(2).upper()

        dados.pop("numero", None); dados.pop("complemento", None)

        # TOTAIS (genérico)
        m_tot = re.search(r"TOTAIS[\s\S]*?\b(" + VAL_BRL + r")\s+(" + VAL_BRL + r")\b", texto_bruto, re.I)
        if m_tot:
            try: dados["valor_total_pago_extrato"] = round(_to_float_smart(m_tot.group(2)), 2)
            except Exception: pass
        else:
            m_tot2 = re.search(r"(?mi)^\s*TOTAIS?\s*[:\-]?\s*(?:\S+\s+)?(" + VAL_BRL + r")\s+(" + VAL_BRL + r")\s*$", texto_bruto)
            if m_tot2:
                try: dados["valor_total_pago_extrato"] = round(_to_float_smart(m_tot2.group(2)), 2)
                except Exception: pass

        if "valor_total_pago_extrato" not in dados or not dados.get("valor_total_pago_extrato"):
            total_embr = _extrair_total_pago_embracon(texto_bruto)
            if total_embr > 0: dados["valor_total_pago_extrato"] = total_embr

        # QUADRO valores/percentuais (genérico)
        quadro_valores = extrair_valores_percentuais_pagos(texto_bruto)
        if quadro_valores:
            if "fundo_comum_valor"         in quadro_valores: dados["fundo_comum"] = quadro_valores["fundo_comum_valor"]
            if "fundo_reserva_valor"       in quadro_valores: dados["fundo_reserva"] = quadro_valores["fundo_reserva_valor"]
            if "taxa_adm_cobrada_valor"    in quadro_valores: dados["taxa_adm_cobrada_valor"] = quadro_valores["taxa_adm_cobrada_valor"]
            if "taxa_adm_cobrada_percentual" in quadro_valores: dados["taxa_adm_cobrada_percentual"] = quadro_valores["taxa_adm_cobrada_percentual"]
            for k in ("seguros_valor","multas_valor","juros_valor","outros_valores_valor","total_valores_pagos"):
                if k in quadro_valores:
                    base = k.replace("_valor","")
                    campo = base if base in ("seguros","multas","juros","outros_valores") else k
                    dados[campo] = quadro_valores[k]

        # Valores soltos (legado) - DESABILITADO para HS pois usa extração especializada
        # Os valores corretos são extraídos em _extrair_dados_completos_hs
        if "HS ADMINISTRADORA" not in texto_bruto.upper():
            campos_valores = {
                "fundo_comum":    r"(?<!%)\bFundo\s*Comum\b:?\s*(" + VAL_BRL + r")",
                "fundo_reserva":  r"(?<!%)\bFundo\s*de\s*Reserva\b:?\s*(" + VAL_BRL + r")",
                "seguros":        r"(?<!%)\bSeguros?\b:?\s*(" + VAL_BRL + r")",
                "multas":         r"(?<!%)\bMultas?\b:?\s*(" + VAL_BRL + r")",
                "juros":          r"(?<!%)\bJuros?\b:?\s*(" + VAL_BRL + r")",
                "outros_valores": r"(?<!%)\bOutros\s*Valores\b:?\s*(" + VAL_BRL + r")",
            }
            for campo, padrao in campos_valores.items():
                if campo in dados: continue
                m = re.search(padrao, texto_bruto, re.I)
                if m: dados[campo] = round(_to_float_smart(m.group(1)), 2)

        # Taxa de administração cobrada (valor isolado) - DESABILITADO para HS
        if "taxa_adm_cobrada_valor" not in dados and "HS ADMINISTRADORA" not in texto_bruto.upper():
            m_taxa_valor_iso = re.search(r"Taxa\s*de\s*Administra[cç][aã]o:?[^0-9]*(" + VAL_BRL + r")", texto_bruto, re.I)
            if m_taxa_valor_iso:
                dados["taxa_adm_cobrada_valor"] = round(_to_float_smart(m_taxa_valor_iso.group(1)), 2)

        # ----------- EXCEÇÃO BB (reforços) -----------
        up_all = texto_bruto.upper()
        if "EXTRATO DE COTA" in up_all or "SISBB" in up_all or "BB CONSÓRCIOS" in up_all or "BB CONSORCIOS" in up_all:
            reforcos = _bb_extrair_gcc_taxa_prazo(texto_limpo, texto_bruto)
            dados.update({k: v for k, v in reforcos.items() if v})

            # Quadro e total preferindo 'Totais:' para evitar pegar um número aleatório (ex.: 16.389,06)
            bb_tot_quadro = _bb_extrair_total_e_quadro(texto_bruto)
            # só sobrescreve se achou algo
            for k, v in bb_tot_quadro.items():
                dados[k] = v

    except Exception as e:
        logger.error("Erro ao extrair campos básicos: %s", e)

    return dados, {}

# =====================================================================================
# MULTI-EXTRATOR DE PARCELAS
# =====================================================================================

def extrair_parcelas_multi(texto_bruto: str) -> list:
    secao = _recortar_conta_corrente(texto_bruto)
    secao = _separar_datas_coladas(secao)
    linhas = [ln for ln in secao.splitlines() if ln.strip()]
    up_all = (secao or "").upper()

    # Embracon
    if "EMBRACON" in up_all:
        got_preciso = extrair_parcelas_embracon_preciso(texto_bruto)
        if got_preciso:
            return list({(p["data_pagamento"], p["valor_pago"]): p for p in got_preciso}.values())

    # BB Consórcios (usa função que também retorna maior número de parcela)
    if "EXTRATO DE COTA" in up_all or "SISBB" in up_all or "BB CONSÓRCIOS" in up_all or "BB CONSORCIOS" in up_all:
        got, _ = _capturar_bbconsorcios(linhas)
        if got:
            return got

    # Santander
    if "SANTANDER BRASIL ADMINISTRADORA" in up_all or "BANCO SANTANDER" in up_all:
        got = _capturar_santander(linhas)
        if got: return got

    # Porto
    if "PORTO SEGURO" in up_all or "EXTRATO FINANCEIRO DO CONSORCIADO" in up_all or "VALORES PAGOS" in up_all:
        got = _capturar_porto_v2(texto_bruto)
        if got: return got
        got = _capturar_porto_legacy(secao)
        if got: return got

    # Itaú
    if "ITAÚ" in up_all or "ITAU" in up_all or "RECBTO. PARCELA" in up_all or "ASS. VENCTO. PAGTO." in up_all:
        got = _capturar_itau_v2(linhas)
        if got: return got

    # Alpha
    if "CONTA CORRENTE / VALORES PAGOS" in up_all or "ALPHA ADMINISTRADORA" in up_all:
        got = _capturar_alpha(linhas)
        if got: return got

    # HS
    if "HS ADM" in up_all or "PGTO PARC" in up_all:
        got = _capturar_hs(linhas)
        if got: return got

    # Embracon/Bradesco + Sicoob
    if "PARCELA TRANSAÇÃO CONTABILIZAÇÃO PAGAMENTO VALOR A PAGAR VALOR PAGO" in up_all \
       or "EMBRACON" in up_all or "BRADESCO ADMINISTRADORA" in up_all or "SICOOB ADMINISTRADORA" in up_all:
        got = _capturar_embr_bradesco(linhas)
        if got: return got

    # Ademicon / Disal / GMAC
    if "ASS. AVISO" in up_all or "ADEMICON" in up_all or "DISAL ADMINISTRADORA" in up_all or "GMAC ADMINISTRADORA" in up_all:
        got = _capturar_ass_aviso(linhas)
        if got: return got

    # Fallback
    return extrair_parcelas_generico(texto_bruto)

# =====================================================================================
# PRINCIPAL
# =====================================================================================

def extrair_dados_pdf(caminho_pdf: str, debug: bool = False, forcar_ocr: bool = False):
    """
    Retorna (dados, parcelas)
      - dados: dict com cabeçalho + agregados
      - parcelas: lista de {"data_pagamento", "valor_pago"}
    """
    global DEBUG_EXTRACAO
    DEBUG_EXTRACAO = bool(debug)
    logger.setLevel(logging.DEBUG if DEBUG_EXTRACAO else logging.INFO)

    logger.info("Lendo o PDF: %s", caminho_pdf)

    # --- Leitura dupla (nativo + opcional OCR) ---
    texto_base = extrair_texto_pdfplumber(caminho_pdf)
    if not texto_base.strip():
        texto_base = extrair_texto_fitz(caminho_pdf)

    texto_ocr = ""
    if _texto_ruim(texto_base) and not forcar_ocr:
        logger.warning("Texto fraco/ruidoso detectado, usando OCR completo…")
        texto_ocr = ocr_pdf_completo(caminho_pdf)
    elif forcar_ocr:
        logger.debug("⚠️ Forçando OCR (dpi=300, lang=por)")
        texto_ocr = ocr_pdf_completo(caminho_pdf)

    texto_para_cabecalho = texto_ocr if texto_ocr.strip() else texto_base

    def _extrair_parcelas_de(texto_ref: str) -> list:
        if not texto_ref or not texto_ref.strip(): return []
        tfix = _separar_datas_coladas(texto_ref)
        p = extrair_parcelas_embracon_preciso(tfix)
        if not p: p = extrair_parcelas_multi(tfix)
        if not p: p = extrair_parcelas_generico(tfix)
        return p

    parcelas_base = _extrair_parcelas_de(texto_base)
    parcelas_ocr  = _extrair_parcelas_de(texto_ocr) if texto_ocr else []
    parcelas = parcelas_base if len(parcelas_base) >= len(parcelas_ocr) else parcelas_ocr

    # Deduplicação
    if parcelas:
        parcelas = list({(p["data_pagamento"], p["valor_pago"]): p for p in parcelas}.values())

    texto = _separar_datas_coladas(texto_para_cabecalho)
    if DEBUG_EXTRACAO: _dump_debug("debug_texto_bruto.txt", texto)
    texto_bruto = texto
    texto_limpo = limpar_texto(texto)
    if DEBUG_EXTRACAO: _dump_debug("debug_texto_limpo.txt", texto_limpo)

    # Cabeçalho
    dados, _apr = _extrair_campos_basicos(texto_limpo, texto_bruto)
    
    # 🧠 ML INTEGRADO: Melhora extração automaticamente
    if ML_ATIVO and ml_extrator_automatico:
        print("🤖 ML: Analisando extrato e aplicando melhorias...")
        try:
            dados_melhorados, mensagens_ml = ml_extrator_automatico.melhorar_extracao_com_ml(
                dados_tradicionais=dados.copy(),
                texto_completo=texto_limpo,
                texto_bruto=texto_bruto
            )
            
            # Aplica melhorias do ML
            campos_melhorados = 0
            for campo, valor_novo in dados_melhorados.items():
                if valor_novo and valor_novo != dados.get(campo):
                    valor_antigo = dados.get(campo, "")
                    dados[campo] = valor_novo
                    campos_melhorados += 1
                    print(f"🚀 ML melhorou '{campo}': '{valor_antigo}' → '{valor_novo}'")
            
            if campos_melhorados > 0:
                print(f"✅ ML aplicou {campos_melhorados} melhorias ao extrato!")
            
            # Mostra mensagens do ML
            for msg in mensagens_ml:
                print(f"💡 ML: {msg}")
                
        except Exception as e:
            print(f"⚠️ ML encontrou erro: {e}")
            logger.warning(f"Erro no ML: {e}")

    # 🆕 Detecção inteligente: procura palavras-chave e SEMPRE corrige nome sujo
    texto_completo = (texto_base + " " + texto_ocr).upper()
    
    # Palavras-chave para detectar cada administradora
    keywords_map = {
        "KSK ADMINISTRADORA DE CONSORCIO LTDA": ["KSK", "KSK CONSORCIO", "KSK ADMINISTRADORA"],
        "BB ADMINISTRADORA DE CONSÓRCIO S.A.": ["BB CONSORCIOS", "BB CONSÓRCIOS", "SISBB", "BANCO DO BRASIL"],
        "YAMAHA ADMINISTRADORA DE CONSÓRCIO LTDA": ["YAMAHA"],
        "HS ADMINISTRADORA DE CONSÓRCIOS LTDA": ["HS ADM", "HSCONSORCIO", "HS ADMINISTRADORA"],
        "BR CONSÓRCIOS ADMINISTRADORA DE CONSÓRCIOS LTDA": ["BR CONSORCIOS", "BR CONSÓRCIOS"],
        "EMBRACON ADMINISTRADORA DE CONSÓRCIO LTDA": ["EMBRACON"],
        "ITAÚ ADMINISTRADORA DE CONSÓRCIO LTDA": ["ITAU", "ITAÚ"],
        "BRADESCO ADMINISTRADORA DE CONSÓRCIO LTDA": ["BRADESCO ADMIN", "BRADESCO CONSORCIO", "BRADESCO CONSÓRCIO"],
        "PORTO SEGURO ADMINISTRADORA DE CONSÓRCIOS LTDA": ["PORTO SEGURO"],
        "DISAL ADMINISTRADORA DE CONSÓRCIO LTDA": ["DISAL"],
        "VOLKSWAGEN ADMINISTRADORA DE CONSÓRCIO LTDA": ["VOLKSWAGEN", "VW ADM", "VW CONSORCIO"],
        "SANTANDER BRASIL ADMINISTRADORA DE CONSÓRCIO LTDA": ["SANTANDER BRASIL", "SANTANDER CONSORCIO", "SANTANDER"],
        "SICOOB ADMINISTRADORA DE CONSÓRCIOS LTDA": ["SICOOB"],
        "ADMINISTRADORA DE CONSÓRCIO NACIONAL HONDA LTDA": ["HONDA", "NACIONAL HONDA"],
        "GMAC ADMINISTRADORA DE CONSÓRCIOS LTDA": ["GMAC"],
        "RODOBENS ADMINISTRADORA DE CONSORCIOS LTDA": ["RODOBENS"],
        "MAGGI ADMINISTRADORA DE CONSORCIOS LTDA": ["MAGGI"],
        "ADEMICON ADMINISTRADORA DE CONSORCIOS S/A": ["ADEMICON"],
        "ALPHA ADMINISTRADORA DE CONSÓRCIO LTDA": ["ALPHA"],
        "BAMAQ ADMINISTRADORA DE CONSORCIOS LTDA": ["BAMAQ"]
    }
    
    # Detecta por keyword e SOBRESCREVE nome sujo
    admin_detectada_por_keyword = False
    for nome_admin, keywords in keywords_map.items():
        if any(kw in texto_completo for kw in keywords):
            nome_sujo = dados.get("administradora", "")
            if nome_sujo and nome_sujo != nome_admin:
                logger.info(f"🔄 Corrigindo nome sujo '{nome_sujo[:50]}...' → '{nome_admin}'")
            
            dados["administradora"] = nome_admin
            logger.info(f"✅ Administradora detectada por palavra-chave: {nome_admin}")
            admin_detectada_por_keyword = True
            
            # 🔄 Preenche CNPJ e CEP automaticamente
            if nome_admin in mapa_administradoras:
                info = mapa_administradoras[nome_admin]
                
                # Preenche CNPJ
                if not dados.get("cnpj_administradora") and info.get("cnpj"):
                    cnpj_limpo = info["cnpj"].replace(".", "").replace("/", "").replace("-", "")
                    dados["cnpj_administradora"] = cnpj_limpo
                    logger.info(f"📝 CNPJ preenchido via keyword: {info['cnpj']}")
                
                # Preenche CEP
                if not dados.get("cep_administradora") and info.get("cep"):
                    dados["cep_administradora"] = info["cep"]
                    logger.info(f"📍 CEP preenchido via keyword: {info['cep']}")
                    
                    # 🏛️ Busca comarca da administradora pelo CEP
                    try:
                        import requests
                        resp = requests.get(f"http://localhost:8000/comarca-por-cep/{info['cep']}", timeout=5)
                        if resp.status_code == 200:
                            comarca_data = resp.json()
                            comarca_completa = comarca_data.get("comarca", "")
                            if comarca_completa and " - " in comarca_completa:
                                # Formato: "COMARCA DE CURITIBA - PR"
                                partes = comarca_completa.split(" - ")
                                dados["comarca_adm_nome"] = partes[0].replace("COMARCA DE ", "").strip()
                                dados["comarca_adm_uf"] = partes[1].strip()
                                logger.info(f"🏛️ Comarca da administradora: {comarca_completa}")
                    except Exception as e:
                        logger.debug(f"Erro ao buscar comarca da administradora: {e}")
            
            # 🎯 EXTRATOR ESPECIALIZADO: PRIORIDADE MÁXIMA para layouts complexos (Porto, BR, etc)
            usa_extrator_especializado = False
            try:
                # Usa texto_bruto (não upper) para manter formato original dos padrões
                # Passa o texto sem transformação (_separar_datas_coladas) para os extratores especializados
                # pois alguns layouts têm linhas separadas que são alteradas pela normalização.
                resultado_especializado = aplicar_extrator_especializado(texto_para_cabecalho, nome_admin)

                # Se não extraiu parcelas com o texto para cabeçalho, tenta também o texto bruto original
                # (combinação do extraído por plumbber/fitz e OCR) — alguns extratos têm formatação que
                # difere entre motores de extração.
                if not resultado_especializado or not resultado_especializado[1]:
                    texto_raw = (texto_base + " " + texto_ocr).strip()
                    if texto_raw:
                        resultado_especializado = aplicar_extrator_especializado(texto_raw, nome_admin)
                if resultado_especializado:
                    dados_esp, parcelas_esp = resultado_especializado
                    
                    # Merge dados do extrator especializado
                    if dados_esp:
                        for key, value in dados_esp.items():
                            dados[key] = value
                        logger.info(f"✅ Extrator especializado: {len(dados_esp)} campos extraídos")
                    
                    # Usa parcelas do extrator especializado (PRIORIDADE)
                    if parcelas_esp:
                        parcelas = parcelas_esp
                        usa_extrator_especializado = True
                        logger.info(f"🎯 Extrator especializado: {len(parcelas_esp)} parcelas extraídas (USANDO)")
            except Exception as e:
                logger.warning(f"⚠️ Erro no extrator especializado: {e}")
            
            # � SISTEMA ML AUTOMÁTICO: Aplica aprendizado e melhorias automáticas
            if ML_ATIVO and ml_extrator_automatico:
                try:
                    dados_com_ml, mensagens_ml = ml_extrator_automatico.extrair_com_ml(
                        dados_tradicionais=dados.copy(),
                        texto_bruto=texto_bruto,
                        texto_limpo=texto_limpo
                    )
                    
                    # Aplica melhorias do ML com proteção para extratores especializados
                    if dados_com_ml:
                        # 🛡️ PROTEÇÃO: Se extrator especializado funcionou bem, protege campos críticos
                        proteger_campos = usa_extrator_especializado and len(parcelas) > 10
                        campos_protegidos = ["nome_cliente", "valor_total_pago_extrato", "cpf_cnpj"] if proteger_campos else []
                        
                        for campo, valor_ml in dados_com_ml.items():
                            # 🛡️ Proteção: não sobrescreve campos críticos se extrator especializado funcionou
                            if campo in campos_protegidos and dados.get(campo) is not None:
                                logger.info(f"🛡️ ML: Campo '{campo}' protegido pelo extrator especializado")
                                continue
                                
                            if valor_ml and (not dados.get(campo) or dados[campo] != valor_ml):
                                dados[campo] = valor_ml
                                
                        logger.info(f"🧠 ML aplicou melhorias automáticas ({len(mensagens_ml)} atualizações)")
                        if proteger_campos:
                            logger.info("🛡️ ML: Campos críticos protegidos pelo extrator especializado")
                        
                        # Mostra mensagens do ML para debug
                        for msg in mensagens_ml:
                            logger.info(f"  {msg}")
                            
                except Exception as e:
                    logger.warning(f"⚠️ Erro no sistema ML automático: {e}")
            
            # �🧠 ML: Tenta usar template aprendido APENAS SE não usou extrator especializado
            if not usa_extrator_especializado:
                try:
                    dados_template = extrator_templates.aplicar_template(nome_admin, texto_bruto, texto_ocr)
                    if dados_template:
                        # Se extraiu parcelas pelo template, usa elas
                        if dados_template.get("parcelas") and len(dados_template["parcelas"]) > len(parcelas):
                            # Segurança: valida se os valores extraídos pelo template parecem plausíveis
                            tpl = dados_template["parcelas"]
                            soma_tpl = sum(p.get('valor_pago', 0) for p in tpl)
                            soma_exist = sum(p.get('valor_pago', 0) for p in parcelas) if parcelas else 0

                            # Se o template produziu valores muito baixos (ex.: está pegando percentuais
                            # em vez de valores), não o aceitamos automaticamente.
                            aceita_template = True
                            if soma_tpl < 10:
                                aceita_template = False
                                logger.warning(f"⚠️ ML: Template retornou soma muito baixa (R$ {soma_tpl:.2f}), ignorando template de parcelas")
                            elif soma_exist and soma_tpl < 0.1 * soma_exist:
                                aceita_template = False
                                logger.warning(f"⚠️ ML: Template soma (R$ {soma_tpl:.2f}) << existente (R$ {soma_exist:.2f}), ignorando template de parcelas")

                            if aceita_template:
                                parcelas = tpl
                                logger.info(f"🎯 ML: Usando {len(parcelas)} parcelas extraídas por template")
                        
                        # Merge outros dados do template
                        for key, value in dados_template.items():
                            if key != "parcelas" and not dados.get(key):
                                dados[key] = value
                except Exception as e:
                    logger.warning(f"⚠️ Erro ao aplicar template ML: {e}")
            
            break

    # 🆕 Busca inteligente: completa TODOS os dados da administradora (nome, CNPJ, CEP)
    if dados.get("administradora"):
        nome_extraido = (dados["administradora"] or "").upper().strip()
        admin_encontrada = None
        metodo = ""
        
        # 1. Tenta match exato primeiro
        for nome_completo, info in mapa_administradoras.items():
            if nome_completo.upper() == nome_extraido:
                admin_encontrada = (nome_completo, info)
                metodo = "exato"
                break
        
        # 2. Fuzzy matching (60% similaridade)
        if not admin_encontrada:
            candidatos = get_close_matches(nome_extraido, list(mapa_administradoras.keys()), n=1, cutoff=0.6)
            if candidatos:
                admin_encontrada = (candidatos[0], mapa_administradoras[candidatos[0]])
                metodo = "fuzzy"
        
        # 3. Busca por substring (ex: "HS" encontra "HS ADM DE CONSÓRCIOS")
        if not admin_encontrada:
            nome_limpo_extraido = nome_extraido.replace("ADMINISTRADORA", "").replace("DE CONSORCIO", "").replace("CONSORCIO", "").replace("LTDA", "").replace("S/A", "").strip()
            for nome_completo, info in mapa_administradoras.items():
                nome_limpo_completo = nome_completo.upper().replace("ADMINISTRADORA", "").replace("DE CONSORCIO", "").replace("CONSORCIO", "").replace("LTDA", "").replace("S/A", "").strip()
                if (nome_limpo_extraido in nome_limpo_completo or nome_limpo_completo in nome_limpo_extraido) and len(nome_limpo_extraido) >= 2:
                    admin_encontrada = (nome_completo, info)
                    metodo = "substring"
                    break
        
        # 4. Preenche TODOS os dados encontrados
        if admin_encontrada:
            nome_completo, info = admin_encontrada
            logger.info(f"✅ Administradora encontrada ({metodo}): '{nome_extraido}' → '{nome_completo}'")
            
            # Atualiza nome completo (normalizado da base de dados)
            dados["administradora"] = nome_completo
            
            # Preenche CNPJ (remove formatação)
            if not dados.get("cnpj_administradora") and info.get("cnpj"):
                cnpj_limpo = info["cnpj"].replace(".", "").replace("/", "").replace("-", "")
                dados["cnpj_administradora"] = cnpj_limpo
                logger.info(f"📝 CNPJ preenchido: {info['cnpj']}")
            
            # Preenche CEP
            if not dados.get("cep_administradora") and info.get("cep"):
                dados["cep_administradora"] = info["cep"]
                logger.info(f"📍 CEP preenchido: {info['cep']}")
        else:
            logger.warning(f"⚠️ Administradora não encontrada na base: '{nome_extraido}'")
            
            # 🤖 ML AUTO-LEARNING: Adiciona nova administradora ao arquivo JSON
            try:
                # Verifica se temos CNPJ para buscar dados completos
                cnpj_encontrado = dados.get("cnpj_administradora", "").replace(".", "").replace("/", "").replace("-", "")
                
                if cnpj_encontrado and len(cnpj_encontrado) == 14:
                    logger.info(f"🤖 ML: Tentando aprender nova administradora '{nome_extraido}' (CNPJ: {cnpj_encontrado})")
                    
                    # Busca dados da empresa na BrasilAPI
                    from busca_dados_pj import buscar_cnpj_brasilapi
                    dados_cnpj = buscar_cnpj_brasilapi(cnpj_encontrado)
                    
                    if dados_cnpj and dados_cnpj.get("cep"):
                        # Prepara novo registro
                        novo_registro = {
                            "cnpj": f"{cnpj_encontrado[:2]}.{cnpj_encontrado[2:5]}.{cnpj_encontrado[5:8]}/{cnpj_encontrado[8:12]}-{cnpj_encontrado[12:14]}",
                            "cep": dados_cnpj["cep"].replace("-", "")
                        }
                        
                        # Carrega JSON atual
                        import json
                        json_path = Path(__file__).parent.parent / "dados" / "administradoras.json"
                        
                        with open(json_path, "r", encoding="utf-8") as f:
                            mapa_atual = json.load(f)
                        
                        # Normaliza nome (primeira letra maiúscula em cada palavra)
                        nome_normalizado = " ".join(word.capitalize() for word in nome_extraido.split())
                        
                        # Adiciona novo registro
                        mapa_atual[nome_normalizado] = novo_registro
                        
                        # Salva com backup
                        backup_path = json_path.parent / f"administradoras_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
                        import shutil
                        shutil.copy(json_path, backup_path)
                        
                        # Salva JSON atualizado (com indentação bonita)
                        with open(json_path, "w", encoding="utf-8") as f:
                            json.dump(mapa_atual, f, ensure_ascii=False, indent=2)
                        
                        logger.info(f"✅ ML: Nova administradora '{nome_normalizado}' adicionada ao arquivo JSON!")
                        logger.info(f"📦 Backup salvo em: {backup_path.name}")
                        
                        # Atualiza dados atuais com as informações encontradas
                        dados["administradora"] = nome_normalizado
                        if not dados.get("cep_administradora"):
                            dados["cep_administradora"] = novo_registro["cep"]
                            logger.info(f"📍 CEP preenchido via ML: {novo_registro['cep']}")
                    else:
                        logger.warning(f"⚠️ ML: Não foi possível buscar dados do CNPJ {cnpj_encontrado}")
                else:
                    logger.info(f"ℹ️ ML: Sem CNPJ válido para aprender administradora '{nome_extraido}'")
                    
            except Exception as e:
                logger.error(f"❌ ML: Erro ao adicionar nova administradora: {e}")
                import traceback
                logger.error(traceback.format_exc())

    # =======================
    # AGREGADOS / CORREÇÕES
    # =======================
    # Calcula soma considerando valores negativos dos estornos
    soma_dec = sum(
        Decimal(str(p.get("valor_pago", 0.0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        for p in parcelas
    ) if parcelas else Decimal("0.00")
    soma_dec = soma_dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    dados["parcelas_detalhadas"] = parcelas
    # Conta apenas parcelas efetivamente pagas, excluindo números de parcela que tiveram estorno
    numeros_com_estorno = {p.get("numero_parcela") for p in parcelas if p.get("status", "").lower() == "estornado"}
    parcelas_efetivas = [p for p in parcelas if p.get("status", "").lower() == "pago" and p.get("numero_parcela") not in numeros_com_estorno]
    dados["parcelas_pagas"] = len(parcelas_efetivas)
    dados["soma_valores_pagos"] = float(soma_dec)

    # Se BB e existir linha Totais, preferir para valor_total_pago_extrato
    up_all = (texto_base + "\n" + texto_ocr).upper()
    if "EXTRATO DE COTA" in up_all or "SISBB" in up_all or "BB CONSÓRCIOS" in up_all or "BB CONSORCIOS" in up_all:
        prefer = _bb_extrair_total_e_quadro(texto_bruto).get("valor_total_pago_extrato")
        if prefer:
            dados["valor_total_pago_extrato"] = prefer
    
    # Se HS, extrair dados completos (valor total, data assembleia, prazo)
    # EXCEÇÃO ESPECÍFICA: Apenas para HS Administradora, não afeta outros extratos
    is_hs_admin = ("HS ADM" in up_all or "PGTO PARC" in up_all or 
                   (dados.get("administradora", "").upper().find("HS ADMINISTRADORA") >= 0))
    
    if is_hs_admin:
        dados_hs = _extrair_dados_completos_hs(texto_bruto)
        
        # Aplica os dados extraídos com validação extra (só para HS)
        if dados_hs.get("valor_total_pago_extrato") and dados_hs["valor_total_pago_extrato"] > 0:
            # SEGURANÇA: Só substitui se for diferente do valor atual e dentro de faixa razoável
            valor_atual = dados.get("valor_total_pago_extrato", 0)
            valor_hs = dados_hs["valor_total_pago_extrato"]
            
            # Aplica o valor HS se for diferente e estiver na faixa esperada
            if valor_hs != valor_atual and 10 <= valor_hs <= 500000:
                dados["valor_total_pago_extrato"] = valor_hs
                logger.info(f"✅ HS: Valor total extraído: R$ {valor_hs:.2f} (anterior: R$ {valor_atual:.2f})")
        
        if dados_hs.get("data_primeira_assembleia") and not dados.get("data_primeira_assembleia"):
            dados["data_primeira_assembleia"] = dados_hs["data_primeira_assembleia"]
            logger.info(f"✅ HS: Data 1ª assembleia: {dados_hs['data_primeira_assembleia']}")
            
        if dados_hs.get("total_parcelas_plano") and not dados.get("total_parcelas_plano"):
            dados["total_parcelas_plano"] = dados_hs["total_parcelas_plano"]
            logger.info(f"✅ HS: Prazo: {dados_hs['total_parcelas_plano']} meses")
        
        # Valores adicionais (fundo comum, fundo reserva, etc.) - sempre sobrescreve
        valores_adicionais_keys = ['fundo_comum', 'fundo_reserva', 'taxa_adm_cobrada', 'seguros', 'multas', 'juros']
        for key in valores_adicionais_keys:
            if key in dados_hs:
                dados[key] = dados_hs[key]
                logger.info(f"💰 HS: {key} = R$ {dados_hs[key]:.2f}")
        
        # Copia taxa_adm_cobrada para taxa_adm_cobrada_valor (compatibilidade com frontend)
        if 'taxa_adm_cobrada' in dados_hs:
            dados['taxa_adm_cobrada_valor'] = dados_hs['taxa_adm_cobrada']
            logger.info(f"💰 HS: taxa_adm_cobrada_valor = R$ {dados_hs['taxa_adm_cobrada']:.2f}")

    # Diferença (não força soma)
    if "valor_total_pago_extrato" in dados:
        total_extrato_dec = Decimal(str(dados["valor_total_pago_extrato"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        dados["diferenca_fechamento"] = float((total_extrato_dec - soma_dec))

    # Compat
    if "taxa_adm_percentual" in dados and "taxa_adm_devida" not in dados:
        dados["taxa_adm_devida"] = 0.0

    # Derivar datas
    if parcelas:
        try:
            _datas = [datetime.strptime(p["data_pagamento"], "%d/%m/%Y") for p in parcelas if p.get("data_pagamento")]
            if _datas and not dados.get("data_primeira_assembleia"):
                dados["data_primeira_assembleia"] = min(_datas).strftime("%d/%m/%Y")
        except Exception:
            pass

    if not dados.get("data_encerramento") and dados.get("data_primeira_assembleia"):
        # Se não veio 'total_parcelas_plano', tenta deduzir para BB: usa Prazo ou maior número de parcela
        if not dados.get("total_parcelas_plano"):
            # tenta achar pelo texto (Prazo)
            bb_ref = _bb_extrair_gcc_taxa_prazo(texto_limpo, texto_bruto)
            if bb_ref.get("total_parcelas_plano"):
                dados["total_parcelas_plano"] = bb_ref["total_parcelas_plano"]
            else:
                # fallback bruto: estima pelo número de parcelas pagas (não perfeito, mas melhor que 0)
                dados["total_parcelas_plano"] = max(len(parcelas), 1)

        try:
            meses = int(dados.get("total_parcelas_plano", 0)) - 1
            if meses >= 0:
                ini = datetime.strptime(dados["data_primeira_assembleia"], "%d/%m/%Y")
                dados["data_encerramento"] = (ini + relativedelta(months=meses)).strftime("%d/%m/%Y")
        except Exception:
            pass

    # Aprendizado local
    try:
        _ = ler_aprendizado(dados.get("administradora", "DESCONHECIDA"))
        salvar_aprendizado(
            administradora=dados.get("administradora", "DESCONHECIDA"),
            sucesso=bool(parcelas),
            usou_ia=False,
            data_encerramento_via="vinda_do_campo" if dados.get("data_encerramento") else "calculada_pela_primeira_assembleia",
            campos_aprendidos={}
        )
    except Exception:
        pass

    # 🧠 ML: Aprende padrões se a extração foi bem-sucedida
    if dados.get("administradora") and parcelas:
        try:
            extrator_templates.aprender_de_extracao(
                administradora=dados["administradora"],
                dados_extraidos=dados,
                texto_bruto=texto_bruto,
                texto_ocr=texto_ocr
            )
            logger.info(f"🎓 ML aprendeu padrões de {dados['administradora']}")
        except Exception as e:
            logger.warning(f"⚠️ Erro ao aprender padrões ML: {e}")
    
    # 🏛️ Formata comarca_administradora para o frontend (compatibilidade)
    if dados.get("comarca_adm_nome") and dados.get("comarca_adm_uf"):
        dados["comarca_administradora"] = f"COMARCA DE {dados['comarca_adm_nome']} - {dados['comarca_adm_uf']}"
        logger.debug(f"📋 Comarca administradora formatada: {dados['comarca_administradora']}")
    
    # 📋 Compatibilidade de campos: cria cpf_cliente e cnpj_cliente separados
    if dados.get("cpf_cnpj"):
        cpf_cnpj = dados["cpf_cnpj"]
        tipo = dados.get("tipo_documento", "")
        
        if tipo == "CPF" and len(cpf_cnpj) == 11:
            dados["cpf_cliente"] = cpf_cnpj
        elif tipo == "CNPJ" and len(cpf_cnpj) == 14:
            dados["cnpj_cliente"] = cpf_cnpj

    return dados, parcelas

# =====================================================================================
# CLI (debug rápido)
# =====================================================================================

def _print_resumo(dados, parcelas):
    print("\n=== RESUMO ===")
    chaves = [
        "administradora", "cnpj_administradora", "nome_cliente", "grupo", "cota",
        "numero_contrato", "rua", "numero", "complemento", "bairro", "cidade", "estado", "cep",
        "valor_credito",
        "taxa_adm_percentual", "taxa_adm_cobrada_valor", "taxa_adm_cobrada_percentual",
        "data_primeira_assembleia", "data_encerramento", "parcelas_pagas", "soma_valores_pagos",
        "valor_total_pago_extrato", "diferenca_fechamento", "total_parcelas_plano"
    ]
    for k in chaves:
        if k in dados:
            print(f"{k}: {dados[k]}")
    print("\nPrimeiras parcelas:")
    for p in (parcelas or [])[:5]:
        print(p)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extrator de dados de PDF de consórcio")
    parser.add_argument("--arquivo", "-f", required=True, help="Caminho do PDF")
    parser.add_argument("--debug", action="store_true", help="Liga logs detalhados e dumps de texto")
    parser.add_argument("--ocr", action="store_true", help="Força OCR completo")
    args = parser.parse_args()

    DEBUG_EXTRACAO = bool(args.debug)
    if DEBUG_EXTRACAO:
        logger.setLevel(logging.DEBUG)
        logger.debug("DEBUG ativado")

    dados, parcelas = extrair_dados_pdf(args.arquivo, debug=DEBUG_EXTRACAO, forcar_ocr=args.ocr)
    _print_resumo(dados, parcelas)
