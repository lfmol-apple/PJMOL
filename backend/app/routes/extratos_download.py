# app/routes/extratos_download.py
from __future__ import annotations

import io
import os
import re
import unicodedata
import zipfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/extratos", tags=["Extratos - Download ZIP"])


# --- Configuração do STORAGE_ROOT e subpastas ---
def get_storage_root() -> Path:
    """
    Descobre a raiz do storage. Compatível com o projeto:
    - Se houver env STORAGE_ROOT, usa.
    - Senão: app/storage
    """
    root = os.getenv("STORAGE_ROOT") or os.path.join("app", "storage")
    return Path(root).resolve()


def get_extrato_subdir_fs() -> str:
    """
    Descobre o NOME FÍSICO da subpasta onde ficam os PDFs de extrato.
    No seu projeto costuma ser 'Extrato' (singular, maiúscula).
    Lê de app.core.config.STORAGE_EXTRATO_SUBDIR quando existir.
    """
    # Default seguro
    subdir = "Extrato"

    # Tenta importar da config do projeto
    try:
        from app.core.config import STORAGE_EXTRATO_SUBDIR  # type: ignore
        if isinstance(STORAGE_EXTRATO_SUBDIR, str) and STORAGE_EXTRATO_SUBDIR.strip():
            subdir = STORAGE_EXTRATO_SUBDIR.strip()
    except Exception:
        # mantém default
        pass

    # Permite override por variável de ambiente, se existir
    env_override = os.getenv("STORAGE_EXTRATO_SUBDIR")
    if env_override and env_override.strip():
        subdir = env_override.strip()

    return subdir


# --- Utilitários de nome/slug ---
def strip_accents_upper(s: str) -> str:
    if not s:
        return "CLIENTE"
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
    return s.upper()


def guess_cliente_from_extrato_pdf(extrato_dir: Path) -> Optional[str]:
    """
    Tenta inferir nome do cliente a partir de arquivos do tipo:
    'Extr._<NOME>.pdf' (padrão comum nos seus gerados).
    """
    if not extrato_dir.is_dir():
        return None
    pdfs = list(extrato_dir.glob("*.pdf")) or list(extrato_dir.rglob("*.pdf"))
    pat = re.compile(r"Extr\._\s*([A-Za-z0-9\-\._\s]+)\.pdf", re.IGNORECASE)
    for p in pdfs:
        m = pat.search(p.name)
        if m:
            nome = m.group(1).strip().replace("_", " ")
            if nome:
                return nome
    return None


def fetch_nome_cliente_bd(extrato_id: str) -> Optional[str]:
    """
    Tenta buscar no banco (sem travar o projeto se o import diferir).
    Ajuste os imports se seu projeto usar caminhos diferentes.
    """
    try:
        try:
            from database import SessionLocal  # type: ignore
        except Exception:
            SessionLocal = None  # type: ignore

        ExtratoModel = None
        try:
            from app.models.extrato import Extrato as ExtratoModel  # type: ignore
        except Exception:
            try:
                from app.models.extrato import Extrato as ExtratoModel  # type: ignore
            except Exception:
                ExtratoModel = None  # type: ignore

        if SessionLocal and ExtratoModel:
            with SessionLocal() as db:
                # .get é suficiente se a PK for simples; caso contrário, adapte.
                obj = db.query(ExtratoModel).get(extrato_id)
                if obj and getattr(obj, "nome_cliente", None):
                    return str(obj.nome_cliente)
    except Exception:
        pass
    return None


def add_dir_to_zip(zf: zipfile.ZipFile, base_dir: Path, subdir_fs: str, extrato_id: str, zip_folder_name: str) -> bool:
    """
    Adiciona todos os arquivos de base_dir/subdir_fs/extrato_id ao ZIP.
    zip_folder_name: nome amigável no ZIP (Anexos, Assinaturas, Extratos).
    Retorna True se pelo menos um arquivo foi adicionado.
    """
    src = base_dir / subdir_fs / extrato_id
    if not src.exists() or not src.is_dir():
        return False

    any_added = False
    for root, _, files in os.walk(src):
        for fname in files:
            fpath = Path(root) / fname
            if not fpath.is_file():
                continue
            rel_inside_src = fpath.relative_to(src)  # mantém árvore interna
            arcname = Path(zip_folder_name) / rel_inside_src
            zf.write(str(fpath), str(arcname))
            any_added = True
    return any_added


@router.get("/{extrato_id}/download-zip")
def download_zip_extrato(
    extrato_id: str,
    folders: str = Query(
        "anexos,assinaturas,extratos",
        description="Lista separada por vírgula: anexos, assinaturas, extratos",
    ),
):
    """
    Gera um ZIP com as pastas Anexos/, Assinaturas/ e Extratos/ do extrato informado.
    - Não cria arquivos em disco; faz streaming a partir da memória.
    - Nome do arquivo: 'Anexos- NOME_DO_CLIENTE.zip'
    """
    storage_root = get_storage_root()
    extrato_subdir_fs = get_extrato_subdir_fs()        # ex.: 'Extrato'
    extrato_key = extrato_subdir_fs.lower()            # ex.: 'extrato'

    # ---- Compatibilidade de nomes: ----
    # No disco usamos 'extrato_subdir_fs' (ex.: 'Extrato').
    # No ZIP queremos rotular como 'Extratos'.
    # E no query param aceitamos tanto 'extratos' quanto o nome físico em minúsculas.
    dir_map_fs_to_zipname = {
        "anexos": "Anexos",
        "assinaturas": "Assinaturas",
        extrato_key: "Extratos",
    }

    # Normaliza pastas solicitadas
    requested_raw = {p.strip().lower() for p in (folders or "").split(",") if p.strip()}
    # Aceita alias 'extratos' apontando para a chave física (extrato_key)
    requested_normalized = set()
    for p in requested_raw:
        if p == "extratos":
            requested_normalized.add(extrato_key)
        else:
            requested_normalized.add(p)

    valid_order = ["anexos", "assinaturas", extrato_key]
    valid_requested = [d for d in valid_order if d in requested_normalized]
    if not valid_requested:
        raise HTTPException(status_code=400, detail="Nenhuma pasta válida informada.")

    # Verifica se pelo menos uma das pastas existe
    if not any((storage_root / d / extrato_id).is_dir() for d in valid_requested):
        raise HTTPException(status_code=404, detail="Nenhuma das pastas existe para este extrato.")

    # Tenta obter o nome do cliente (BD -> fallback pelo PDF dentro da pasta física do extrato)
    nome_cliente = fetch_nome_cliente_bd(extrato_id)
    if not nome_cliente:
        nome_cliente = guess_cliente_from_extrato_pdf(storage_root / extrato_subdir_fs / extrato_id) or "CLIENTE"

    filename = f"Anexos- {strip_accents_upper(nome_cliente)}.zip"

    memfile = io.BytesIO()
    any_added_global = False
    with zipfile.ZipFile(memfile, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for d in valid_requested:
            zip_label = dir_map_fs_to_zipname[d]
            any_added_global |= add_dir_to_zip(zf, storage_root, d, extrato_id, zip_label)

    if not any_added_global:
        # As pastas podem existir, mas vazias
        raise HTTPException(status_code=404, detail="Nenhum arquivo encontrado nas pastas solicitadas.")

    memfile.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(memfile, media_type="application/zip", headers=headers)
