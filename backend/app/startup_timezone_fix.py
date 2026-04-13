# backend/app/startup_timezone_fix.py
"""
Script de inicialização que corrige automaticamente problemas de timezone.
Este script roda quando o backend inicia para garantir dados consistentes.
"""

import logging
from sqlalchemy.orm import Session
from database import SessionLocal
from app.core.timezone_middleware import auto_fix_historical_data

logger = logging.getLogger(__name__)

def run_startup_timezone_fixes() -> None:
    """Executa correções de timezone na inicialização do sistema."""
    
    logger.info("🕒 Iniciando correção automática de timezone...")
    
    try:
        db = SessionLocal()
        
        # Executa correção automática de dados históricos
        corrections = auto_fix_historical_data(db)
        
        if corrections > 0:
            logger.info(f"✅ Correção de timezone concluída: {corrections} registros corrigidos")
        else:
            logger.info("✅ Nenhuma correção de timezone necessária - dados já estão corretos")
        
        db.close()
        
    except Exception as e:
        logger.error(f"❌ Erro na correção automática de timezone: {e}")
    
    logger.info("🕒 Verificação de timezone concluída")


def setup_timezone_logging():
    """Configura logging específico para timezone."""
    
    # Logger específico para operações de timezone
    timezone_logger = logging.getLogger('timezone_operations')
    timezone_logger.setLevel(logging.INFO)
    
    # Handler para logs de timezone (opcional - pode ser removido em produção)
    if not timezone_logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - [TIMEZONE] - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        timezone_logger.addHandler(handler)
    
    return timezone_logger


# Auto-execução se chamado diretamente (para testes)
if __name__ == "__main__":
    setup_timezone_logging()
    run_startup_timezone_fixes()