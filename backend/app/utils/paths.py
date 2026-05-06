# backend/app/utils/paths.py
import os
from pathlib import Path

def get_backend_root():
    """Retorna o diretório raiz do backend (/backend)"""
    current_file = Path(__file__).resolve()  # /backend/app/utils/paths.py
    backend_app = current_file.parent.parent  # /backend/app
    backend_root = backend_app.parent  # /backend
    return str(backend_root)

def get_app_root():
    """Retorna o diretório app do backend (/backend/app)"""
    current_file = Path(__file__).resolve()  # /backend/app/utils/paths.py
    backend_app = current_file.parent.parent  # /backend/app
    return str(backend_app)

def get_documentos_dir():
    """Retorna o diretório de documentos gerados"""
    app_root = get_app_root()
    docs_dir = os.path.join(app_root, "documentos_gerados")
    os.makedirs(docs_dir, exist_ok=True)
    return docs_dir

def get_temp_uploads_dir():
    """Retorna o diretório de uploads temporários"""
    app_root = get_app_root()
    temp_dir = os.path.join(app_root, "temp_uploads")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir

def get_modelos_dir():
    """Retorna o diretório de modelos"""
    backend_root = get_backend_root()
    modelos_dir = os.path.join(backend_root, "modelos")
    os.makedirs(modelos_dir, exist_ok=True)
    return modelos_dir

def get_static_dir():
    """Retorna o diretório static"""
    backend_root = get_backend_root()
    static_dir = os.path.join(backend_root, "static")
    os.makedirs(static_dir, exist_ok=True)
    return static_dir

def get_storage_dir():
    """Retorna o diretório de storage"""
    app_root = get_app_root()
    storage_dir = os.path.join(app_root, "storage")
    os.makedirs(storage_dir, exist_ok=True)
    return storage_dir

def ensure_all_dirs():
    """Garante que todos os diretórios necessários existem"""
    get_documentos_dir()
    get_temp_uploads_dir()
    get_modelos_dir()
    get_static_dir()
    get_storage_dir()
    print("✅ Todos os diretórios verificados/criados")

if __name__ == "__main__":
    print(f"Backend root: {get_backend_root()}")
    print(f"App root: {get_app_root()}")
    print(f"Documentos: {get_documentos_dir()}")
    print(f"Temp uploads: {get_temp_uploads_dir()}")
    print(f"Modelos: {get_modelos_dir()}")
    print(f"Static: {get_static_dir()}")
    print(f"Storage: {get_storage_dir()}")
    ensure_all_dirs()