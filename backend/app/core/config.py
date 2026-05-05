# app/core/config.py
import os
from pathlib import Path

# Diretório base do pacote "app"
APP_DIR = Path(__file__).resolve().parents[1]

# Raiz de storage (por padrão: app/storage). Pode sobrescrever com env STORAGE_ROOT.
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", APP_DIR / "storage")).resolve()

# Subpasta para extratos (por padrão: "Extrato"). Pode sobrescrever com env STORAGE_EXTRATO_SUBDIR.
STORAGE_EXTRATO_SUBDIR = os.getenv("STORAGE_EXTRATO_SUBDIR", "Extrato")
