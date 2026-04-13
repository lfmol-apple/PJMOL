# app/extracao/google_ai_safe.py
# -*- coding: utf-8 -*-
from __future__ import annotations

import os

USE_GEMINI = bool(os.getenv("GOOGLE_API_KEY"))
_genai = None

if USE_GEMINI:
    try:
        import google.generativeai as genai
        genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
        _genai = genai
    except Exception:
        USE_GEMINI = False
        _genai = None

def ler_extrato_com_ia(image_path: str):
    """
    Gated call. Se não houver API key, retorna lista vazia.
    Se houver, você pode implementar a chamada real aqui.
    """
    if not USE_GEMINI or _genai is None:
        return []
    # TODO: implementar prompt e parsing quando a chave estiver disponível.
    # Por ora, retorna vazio para não quebrar o fluxo.
    return []