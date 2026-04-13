from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form, Body
from fastapi.responses import FileResponse
from starlette import status
from pathlib import Path
from typing import Optional, List
from sqlalchemy.orm import Session

from database import get_db
from app.utils.storage_extrato import (
    save_extrato_filelike,
    move_from_temp,
    extrato_dir,
    purge_extrato_dir,
)
from app.core.config import STORAGE_ROOT, STORAGE_EXTRATO_SUBDIR

# opcional: para tentar achar o nome no DB
try:
    from app.models.extrato import Extrato
except Exception:
    Extrato = None

router = APIRouter(prefix="/extratos", tags=["extratos-storage"])


def _find_extrato_pdf(extrato_id: int) -> Optional[Path]:
    directory = STORAGE_ROOT / STORAGE_EXTRATO_SUBDIR / str(extrato_id)
    if not directory.exists():
        return None
    pdf_files = sorted(
        [path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".pdf"]
    )
    return pdf_files[0] if pdf_files else None

def _guess_cliente_nome(db: Session, extrato_id: int, fallback: Optional[str]=None) -> Optional[str]:
    # prioridade: parâmetro/fallback
    if fallback:
        return fallback
    if Extrato is None:
        return None
    ext = db.query(Extrato).filter(Extrato.id == extrato_id, Extrato.deleted_at.is_(None)).first()
    if not ext:
        return None
    # tenta campos usuais
    for attr in ("cliente_nome", "nome_cliente", "titular_nome", "nome"):
        if hasattr(ext, attr):
            v = getattr(ext, attr)
            if v:
                return str(v)
    # tenta em JSONs comuns
    for attr in ("dados", "extras", "meta"):
        if hasattr(ext, attr):
            val = getattr(ext, attr)
            if isinstance(val, dict):
                for k in ("cliente_nome","nome_cliente","titular_nome","nome"):
                    v = val.get(k)
                    if v:
                        return str(v)
    # nada encontrado
    return None

@router.post("/{extrato_id}/pdf", status_code=status.HTTP_201_CREATED)
async def upload_pdf_extrato(
    extrato_id: int,
    arquivo: UploadFile = File(..., description="PDF do extrato"),
    cliente_nome: Optional[str] = Form(None),  # <-- permita vir do front
    db: Session = Depends(get_db),
):
    ct = (arquivo.content_type or "").lower()
    if ct not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(415, detail="Apenas PDF.")

    nome = _guess_cliente_nome(db, extrato_id, fallback=cliente_nome)

    fs_path = save_extrato_filelike(
        arquivo.file,
        arquivo.filename or "extrato.pdf",
        extrato_id,
        cliente_nome=nome
    )

    return {"ok": True, "saved_path": str(fs_path), "cliente_nome_usado": nome or "Sem_Nome"}


@router.get("/{extrato_id}/pdf")
def obter_pdf_extrato(extrato_id: int):
    pdf_path = _find_extrato_pdf(extrato_id)
    if not pdf_path:
        raise HTTPException(status_code=404, detail="PDF do extrato não encontrado")
    return FileResponse(pdf_path, media_type="application/pdf", filename=pdf_path.name)

@router.post("/{extrato_id}/migrar-temp", status_code=status.HTTP_200_OK)
def migrar_da_temp(
    extrato_id: int,
    caminhos: Optional[List[str]] = Body(None),
    cliente_nome: Optional[str] = Body(None),  # opcional
    db: Session = Depends(get_db),
):
    """
    Move arquivos que estão em temp_uploads para Storage/Extrato/{extrato_id}/,
    renomeando para 'Extr._<Cliente>.pdf'.
    Se 'caminhos' não vier, varre temp_uploads/{extrato_id}.
    """
    moved = []
    from app.utils.paths import get_temp_uploads_dir
    base_temp = Path(get_temp_uploads_dir()) / str(extrato_id)

    # tenta descobrir nome do cliente
    nome = _guess_cliente_nome(db, extrato_id, fallback=cliente_nome)

    # limpa PDFs anteriores antes de migrar os novos
    purge_extrato_dir(extrato_id)

    candidates: List[Path] = []
    if caminhos:
        for c in caminhos:
            p = Path(c)
            if not p.is_absolute():
                p = base_temp / c
            if p.exists() and p.is_file():
                candidates.append(p)
    else:
        if base_temp.exists():
            for p in base_temp.rglob("*"):
                if p.is_file():
                    candidates.append(p)

    for p in candidates:
        newp = move_from_temp(p, extrato_id, cliente_nome=nome)
        moved.append({"from": str(p), "to": str(newp)})

    return {"ok": True, "moved": moved, "cliente_nome_usado": nome or "Sem_Nome"}
