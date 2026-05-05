# app/utils/storage.py
import os
import tempfile
import hashlib
from datetime import datetime
import shutil
from pathlib import Path
from typing import Optional, Dict

# Raiz do storage (pode vir do .env ou cair no default app/storage)
STORAGE_ROOT = os.getenv(
    "STORAGE_ROOT",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "storage"))
)
os.makedirs(STORAGE_ROOT, exist_ok=True)

# Diretório para backups
BACKUP_ROOT = os.path.join(STORAGE_ROOT, "_backups")
os.makedirs(BACKUP_ROOT, exist_ok=True)

def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def save_bytes_atomically(data: bytes, abs_dest_path: str) -> None:
    """
    Escreve bytes em arquivo de forma atômica:
    grava em temp no mesmo diretório e depois faz replace.
    """
    ensure_dir(os.path.dirname(abs_dest_path))
    with tempfile.NamedTemporaryFile(dir=os.path.dirname(abs_dest_path), delete=False) as tf:
        tf.write(data)
        tmp = tf.name
    os.replace(tmp, abs_dest_path)

def public_url_from_abspath(abs_path: str, public_base_url: Optional[str] = None) -> str:
    """
    Converte um caminho absoluto (dentro do STORAGE_ROOT) para uma URL pública /files/...
    Se PUBLIC_BASE_URL estiver definido, retorna URL absoluta; senão, retorna caminho relativo.
    """
    root = os.path.abspath(STORAGE_ROOT)
    ap = os.path.abspath(abs_path)
    if not ap.startswith(root):
        raise ValueError("Path fora do STORAGE_ROOT")
    rel = ap[len(root):].lstrip(os.sep).replace(os.sep, "/")
    base = (public_base_url or os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")
    if base:
        return f"{base}/files/{rel}"
    return f"/files/{rel}"

def calculate_file_hash(file_path: str) -> Optional[str]:
    """Calcula o hash SHA-256 do arquivo para verificação de integridade"""
    try:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception:
        return None

def verify_file_integrity(file_path: str, stored_hash: str) -> bool:
    """Verifica se o arquivo mantém sua integridade comparando com o hash armazenado"""
    current_hash = calculate_file_hash(file_path)
    return current_hash == stored_hash

def safe_file_storage(temp_file_path: str, dest_dir: str, filename: str) -> Dict[str, str]:
    """
    Armazena o arquivo de forma segura com verificação de integridade e backup automático
    """
    dest_path = None
    try:
        # Criar diretório de destino se não existir
        os.makedirs(dest_dir, exist_ok=True)
        
        # Gerar nome único baseado em timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = Path(filename).stem
        extension = Path(filename).suffix
        safe_filename = f"{base_name}_{timestamp}{extension}"
        dest_path = os.path.join(dest_dir, safe_filename)
        
        # Copiar arquivo com verificação
        shutil.copy2(temp_file_path, dest_path)
        
        # Calcular hash do arquivo copiado
        file_hash = calculate_file_hash(dest_path)
        
        # Criar backup automático
        backup_dir = os.path.join(BACKUP_ROOT, Path(dest_dir).name)
        backup_path = create_backup_copy(dest_path, backup_dir)
            
        return {
            "path": dest_path,
            "hash": file_hash,
            "original_name": filename,
            "stored_name": safe_filename,
            "size": os.path.getsize(dest_path),
            "backup_path": backup_path
        }
        
    except Exception as e:
        # Se algo der errado, tenta limpar o arquivo de destino
        if dest_path and os.path.exists(dest_path):
            try:
                os.remove(dest_path)
            except:
                pass
        raise Exception(f"Erro ao armazenar arquivo: {str(e)}")

def create_backup_copy(file_path: str, backup_dir: str) -> Optional[str]:
    """Cria uma cópia de backup do arquivo"""
    try:
        os.makedirs(backup_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.basename(file_path)
        backup_path = os.path.join(backup_dir, f"{filename}.{timestamp}.bak")
        shutil.copy2(file_path, backup_path)
        return backup_path
    except Exception:
        return None
