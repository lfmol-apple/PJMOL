# backend/routes/extrair_contato_contrato.py
import fitz  # PyMuPDF
import re
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter()

@router.post("/extrair-contato-contrato")
def extrair_telefone_email_contrato(arquivo: UploadFile = File(...)):
    try:
        # Salvar temporariamente
        caminho_temp = f"temp_{arquivo.filename}"
        with open(caminho_temp, "wb") as f:
            f.write(arquivo.file.read())

        doc = fitz.open(caminho_temp)
        texto_final = doc[-1].get_text()  # última página

        # Regex para e-mail
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w{2,4}', texto_final)
        telefone_match = re.search(r'(\+?\d{2,3}\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4})', texto_final)

        email = email_match.group() if email_match else None
        telefone = telefone_match.group() if telefone_match else None

        doc.close()
        os.remove(caminho_temp)

        if not email and not telefone:
            raise HTTPException(status_code=404, detail="Não foi possível extrair e-mail ou telefone.")

        return JSONResponse(content={"email": email, "telefone": telefone})

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
