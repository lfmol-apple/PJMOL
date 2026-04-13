from __future__ import annotations
from pathlib import Path
import os, re, uuid, shutil, io, unicodedata
from typing import Tuple, Optional
from app.core.config import STORAGE_ROOT, STORAGE_EXTRATO_SUBDIR

SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

def _safe_filename(name: str, fallback: str="arquivo.pdf") -> str:
    base = os.path.basename(name or fallback)
    base = SAFE_NAME_RE.sub("_", base).strip("._")
    return base or f"{uuid.uuid4().hex}.pdf"

def _purge_existing(path: Path) -> None:
    """Remove arquivos do diretório informado (ignora erros)."""
    if not path.exists():
        return
    for child in path.iterdir():
        try:
            if child.is_file() or child.is_symlink():
                child.unlink()
            elif child.is_dir():
                shutil.rmtree(child)
        except Exception:
            pass

def purge_extrato_dir(extrato_id: str|int) -> None:
    path = STORAGE_ROOT / STORAGE_EXTRATO_SUBDIR / str(extrato_id)
    if path.exists():
        _purge_existing(path)

# NOVO: slug para nome do cliente (sem acento, com _)
def _slug_cliente(nome: str) -> str:
    if not nome:
        return "Sem_Nome"
    # remove acento
    n = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode("ascii")
    # troca espaços por _
    n = re.sub(r"\s+", "_", n.strip())
    # mantém só chars seguros
    n = SAFE_NAME_RE.sub("_", n)
    # evita underscores repetidos
    n = re.sub(r"_+", "_", n).strip("_")
    # limita tamanho razoável
    if len(n) > 80:
        n = n[:80].rstrip("_")
    return n or "Sem_Nome"

# NOVO: monta o nome final do arquivo do extrato
def build_extrato_filename(cliente_nome: Optional[str]) -> str:
    slug = _slug_cliente(cliente_nome or "")
    return f"Extr._{slug}.pdf"

def extrato_dir(extrato_id: str|int) -> Path:
    p = STORAGE_ROOT / STORAGE_EXTRATO_SUBDIR / str(extrato_id)
    p.mkdir(parents=True, exist_ok=True)
    return p

def _ensure_unique(dest: Path) -> Path:
    if not dest.exists():
        return dest
    return dest.with_name(f"{dest.stem}__{uuid.uuid4().hex[:8]}{dest.suffix or '.pdf'}")

def save_extrato_bytes(data: bytes, filename: str, extrato_id: str|int, cliente_nome: Optional[str]=None) -> Path:
    target_dir = extrato_dir(extrato_id)
    _purge_existing(target_dir)
    # força padrão "Extr._<cliente>.pdf" (ignora o nome original do upload)
    forced_name = build_extrato_filename(cliente_nome)
    dest = target_dir / _safe_filename(forced_name)
    dest = _ensure_unique(dest)

    tmp = dest.with_suffix(dest.suffix + ".part")
    with open(tmp, "wb") as w:
        w.write(data)
    os.replace(tmp, dest)
    return dest

def save_extrato_filelike(fileobj, filename: str, extrato_id: str|int, cliente_nome: Optional[str]=None) -> Path:
    buf = fileobj.read() if hasattr(fileobj, "read") else bytes(fileobj)
    if isinstance(buf, io.BufferedReader):  # raríssimo
        buf = buf.read()
    if not isinstance(buf, (bytes, bytearray)):
        buf = bytes(buf)
    return save_extrato_bytes(buf, filename, extrato_id, cliente_nome=cliente_nome)

def move_from_temp(temp_path: Path, extrato_id: str|int, cliente_nome: Optional[str]=None) -> Path:
    target_dir = extrato_dir(extrato_id)
    # renomeia para o padrão
    base_name = _safe_filename(build_extrato_filename(cliente_nome))
    dest = target_dir / base_name
    dest = _ensure_unique(dest)

    tmp = dest.with_suffix(dest.suffix + ".moving")
    shutil.copy2(temp_path, tmp)
    os.replace(tmp, dest)
    return dest
