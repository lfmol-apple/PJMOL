# backend/app/utils/paths.py
import os
import tempfile
from pathlib import Path


def _ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def _ensure_writable_dir(*candidates: str, label: str) -> str:
    """Retorna o primeiro diretório utilizável para escrita, com fallback seguro em /tmp."""
    checked = set()
    last_error = None

    for candidate in candidates:
        if not candidate:
            continue

        candidate = os.path.abspath(os.path.expanduser(str(candidate)))
        if candidate in checked:
            continue
        checked.add(candidate)

        try:
            os.makedirs(candidate, exist_ok=True)
            probe = tempfile.NamedTemporaryFile(prefix=".perm_", dir=candidate, delete=False)
            probe.close()
            os.unlink(probe.name)
            return candidate
        except Exception as exc:
            last_error = exc
            print(f"[paths][WARN] Diretório '{label}' indisponível para escrita em {candidate}: {exc}")

    raise RuntimeError(
        f"Nenhum diretório gravável disponível para '{label}'. Último erro: {last_error}"
    )


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
    """Retorna o diretório de documentos gerados, com fallback se a pasta padrão não estiver gravável."""
    app_root = get_app_root()
    docs_dir = os.getenv("DOCUMENTOS_DIR") or os.path.join(app_root, "documentos_gerados")
    fallback_dir = os.path.join(tempfile.gettempdir(), "pjmol", "documentos_gerados")
    return _ensure_writable_dir(docs_dir, fallback_dir, label="documentos_gerados")


def get_temp_uploads_dir():
    """Retorna o diretório de uploads temporários"""
    app_root = get_app_root()
    temp_dir = os.getenv("TEMP_UPLOADS_DIR") or os.path.join(app_root, "temp_uploads")
    fallback_dir = os.path.join(tempfile.gettempdir(), "pjmol", "temp_uploads")
    return _ensure_writable_dir(temp_dir, fallback_dir, label="temp_uploads")


def get_modelos_dir():
    """Retorna o diretório de modelos"""
    backend_root = get_backend_root()
    modelos_dir = os.path.join(backend_root, "modelos")
    return _ensure_dir(modelos_dir)


def get_static_dir():
    """Retorna o diretório static"""
    backend_root = get_backend_root()
    static_dir = os.path.join(backend_root, "static")
    return _ensure_dir(static_dir)


def get_storage_dir():
    """Retorna o diretório de storage"""
    app_root = get_app_root()
    storage_dir = os.getenv("STORAGE_ROOT") or os.path.join(app_root, "storage")
    fallback_dir = os.path.join(tempfile.gettempdir(), "pjmol", "storage")
    return _ensure_writable_dir(storage_dir, fallback_dir, label="storage")


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