"""
Utilitário para limpeza completa de arquivos do storage ao deletar um extrato.

Remove todas as pastas e arquivos relacionados a um extrato:
- storage/anexos/{extrato_id}
- storage/assinaturas/{extrato_id}
- storage/extratos/{extrato_id}
- storage/Extrato/{extrato_id} (legado com maiúsculo)
- storage/clientes/*_{cpf}/ (symlinks por cliente)
"""

import os
import shutil
import logging
from pathlib import Path
from typing import Optional
from app.core.config import STORAGE_ROOT

logger = logging.getLogger(__name__)


def cleanup_extrato_storage(
    extrato_id: int,
    cpf_cnpj: Optional[str] = None,
    nome_cliente: Optional[str] = None
) -> dict:
    """
    Remove TODAS as pastas e arquivos relacionados a um extrato.
    
    Args:
        extrato_id: ID do extrato a ser limpo
        cpf_cnpj: CPF/CNPJ do cliente (para limpar pasta clientes)
        nome_cliente: Nome do cliente (para limpar pasta clientes)
    
    Returns:
        dict com estatísticas da limpeza
    """
    stats = {
        "extrato_id": extrato_id,
        "removed_dirs": [],
        "removed_files": 0,
        "errors": []
    }
    
    storage_path = Path(STORAGE_ROOT)
    
    # 1. Remove storage/anexos/{extrato_id}
    anexos_dir = storage_path / "anexos" / str(extrato_id)
    _remove_directory(anexos_dir, stats)
    
    # 2. Remove storage/assinaturas/{extrato_id}
    assinaturas_dir = storage_path / "assinaturas" / str(extrato_id)
    _remove_directory(assinaturas_dir, stats)
    
    # 3. Remove storage/extratos/{extrato_id}
    extratos_dir = storage_path / "extratos" / str(extrato_id)
    _remove_directory(extratos_dir, stats)
    
    # 4. Remove storage/Extrato/{extrato_id} (legado com maiúsculo)
    extrato_legacy_dir = storage_path / "Extrato" / str(extrato_id)
    _remove_directory(extrato_legacy_dir, stats)
    
    # 5. Remove storage/clientes/*_{cpf}/ (se CPF fornecido)
    if cpf_cnpj:
        cpf_digits = "".join(ch for ch in cpf_cnpj if ch.isdigit())
        clientes_dir = storage_path / "clientes"
        
        if clientes_dir.exists():
            try:
                # Procura pastas que terminam com _{cpf}
                for client_folder in clientes_dir.iterdir():
                    if client_folder.is_dir() and client_folder.name.endswith(f"_{cpf_digits}"):
                        _remove_directory(client_folder, stats)
            except Exception as e:
                error_msg = f"Erro ao limpar pasta clientes: {e}"
                logger.error(error_msg)
                stats["errors"].append(error_msg)
    
    logger.info(
        f"Limpeza storage extrato {extrato_id}: "
        f"{len(stats['removed_dirs'])} pastas, "
        f"{stats['removed_files']} arquivos, "
        f"{len(stats['errors'])} erros"
    )
    
    return stats


def _remove_directory(path: Path, stats: dict) -> None:
    """
    Remove um diretório e todos seus arquivos, registrando estatísticas.
    
    Args:
        path: Caminho do diretório a remover
        stats: Dict para registrar estatísticas
    """
    if not path.exists():
        return
    
    try:
        # Conta arquivos antes de remover
        file_count = sum(1 for _ in path.rglob("*") if _.is_file())
        
        # Remove o diretório
        shutil.rmtree(path)
        
        stats["removed_dirs"].append(str(path))
        stats["removed_files"] += file_count
        
        logger.debug(f"Removido: {path} ({file_count} arquivos)")
        
    except Exception as e:
        error_msg = f"Erro ao remover {path}: {e}"
        logger.error(error_msg)
        stats["errors"].append(error_msg)


def cleanup_orphaned_storage() -> dict:
    """
    Remove pastas órfãs no storage (sem extrato correspondente no DB).
    
    CUIDADO: Esta função requer consulta ao banco de dados.
    Deve ser chamada com lista de IDs válidos.
    
    Returns:
        dict com estatísticas da limpeza
    """
    stats = {
        "removed_dirs": [],
        "removed_files": 0,
        "errors": []
    }
    
    # Esta função seria implementada para varredura completa
    # Por enquanto, deixamos como placeholder
    logger.warning("cleanup_orphaned_storage não implementado - use script dedicado")
    
    return stats


def cleanup_legacy_folders() -> dict:
    """
    Remove pastas legadas/incorretas do storage:
    - storage/Extrato (maiúsculo - deve ser extratos minúsculo)
    - storage/_backups (se vazia)
    
    Returns:
        dict com estatísticas
    """
    stats = {
        "removed_dirs": [],
        "removed_files": 0,
        "errors": []
    }
    
    storage_path = Path(STORAGE_ROOT)
    
    # Remove storage/Extrato (maiúsculo) se existir
    extrato_upper = storage_path / "Extrato"
    if extrato_upper.exists() and extrato_upper.is_dir():
        try:
            # Verifica se tem conteúdo importante
            has_files = any(extrato_upper.rglob("*"))
            if has_files:
                logger.warning(
                    f"storage/Extrato contém arquivos! "
                    f"Verifique antes de remover: {list(extrato_upper.iterdir())}"
                )
            else:
                shutil.rmtree(extrato_upper)
                stats["removed_dirs"].append(str(extrato_upper))
                logger.info("Removida pasta legada: storage/Extrato")
        except Exception as e:
            error_msg = f"Erro ao remover storage/Extrato: {e}"
            logger.error(error_msg)
            stats["errors"].append(error_msg)
    
    # Remove storage/_backups se vazia
    backups_dir = storage_path / "_backups"
    if backups_dir.exists() and backups_dir.is_dir():
        try:
            contents = list(backups_dir.iterdir())
            if not contents:
                shutil.rmtree(backups_dir)
                stats["removed_dirs"].append(str(backups_dir))
                logger.info("Removida pasta vazia: storage/_backups")
            else:
                logger.warning(
                    f"storage/_backups não está vazia: {contents}"
                )
        except Exception as e:
            error_msg = f"Erro ao remover storage/_backups: {e}"
            logger.error(error_msg)
            stats["errors"].append(error_msg)
    
    return stats
