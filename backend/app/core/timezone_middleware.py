# backend/app/core/timezone_middleware.py
from datetime import datetime
from typing import Any, Callable, Dict
from functools import wraps
import logging
from sqlalchemy.orm import Session

from .time import (
    now_utc_for_sqlite, 
    from_db_to_sp, 
    to_utc_for_db,
    auto_correct_timezone_if_needed
)

logger = logging.getLogger(__name__)

class TimezoneManager:
    """Gerenciador centralizado de timezone que automatiza conversões."""
    
    @staticmethod
    def ensure_utc_for_save(data: Dict[str, Any]) -> Dict[str, Any]:
        """Garante que todos os campos datetime sejam convertidos para UTC antes de salvar."""
        converted = data.copy()
        
        datetime_fields = ['enviado_em', 'created_at', 'updated_at', 'zapsign_signed_at']
        
        for field in datetime_fields:
            if field in converted and converted[field] is not None:
                converted[field] = to_utc_for_db(converted[field])
                logger.debug(f"Convertido {field} para UTC: {converted[field]}")
        
        return converted
    
    @staticmethod  
    def ensure_sp_for_display(data: Dict[str, Any]) -> Dict[str, Any]:
        """Garante que todos os campos datetime sejam convertidos para SP para exibição."""
        converted = data.copy()
        
        datetime_fields = ['enviado_em', 'created_at', 'updated_at', 'zapsign_signed_at']
        
        for field in datetime_fields:
            if field in converted and converted[field] is not None:
                converted[field] = from_db_to_sp(converted[field])
                logger.debug(f"Convertido {field} para SP: {converted[field]}")
        
        return converted

def auto_timezone_save(func: Callable) -> Callable:
    """Decorator que automaticamente converte datetimes para UTC antes de salvar."""
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Intercepta argumentos que podem ter datetimes
        if len(args) > 1:
            # Geralmente o segundo argumento é o payload/data
            if hasattr(args[1], 'dict'):
                # Pydantic model
                data = args[1].dict()
                data = TimezoneManager.ensure_utc_for_save(data)
                # Reconstroi os args
                new_args = list(args)
                new_args[1] = type(args[1])(**data)
                args = tuple(new_args)
        
        return func(*args, **kwargs)
    
    return wrapper

def auto_timezone_display(func: Callable) -> Callable:
    """Decorator que automaticamente converte datetimes para SP para exibição."""
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        result = func(*args, **kwargs)
        
        # Se o resultado é um dict, aplica conversão
        if isinstance(result, dict):
            result = TimezoneManager.ensure_sp_for_display(result)
        
        # Se é uma lista de dicts
        elif isinstance(result, list) and result and isinstance(result[0], dict):
            result = [TimezoneManager.ensure_sp_for_display(item) for item in result]
        
        # Se é um objeto com atributos datetime
        elif hasattr(result, '__dict__'):
            data = result.__dict__.copy()
            converted = TimezoneManager.ensure_sp_for_display(data)
            for key, value in converted.items():
                setattr(result, key, value)
        
        return result
    
    return wrapper

def auto_fix_historical_data(db: Session) -> int:
    """Corrige automaticamente dados históricos com timezone incorreto.
    
    Retorna o número de registros corrigidos.
    """
    from sqlalchemy import text
    
    corrections = 0
    
    try:
        # Busca extratos com timestamps que parecem estar em timezone incorreto
        result = db.execute(text("""
            SELECT id, enviado_em 
            FROM extratos 
            WHERE enviado_em IS NOT NULL
            AND (
                -- Timestamps muito tardios (provavelmente UTC quando deveria ser SP)
                cast(strftime('%H', enviado_em) as integer) >= 19
                OR
                -- Timestamps de hoje que não fazem sentido
                (date(enviado_em) = date('now') AND cast(strftime('%H', enviado_em) as integer) >= 16)
            )
        """))
        
        problematic = result.fetchall()
        
        for row in problematic:
            extrato_id, enviado_em_str = row
            
            if enviado_em_str:
                # Parse do datetime
                enviado_em = datetime.fromisoformat(enviado_em_str)
                
                # Aplica correção automática
                corrected = auto_correct_timezone_if_needed(enviado_em)
                
                if corrected != enviado_em:
                    # Atualiza no banco
                    db.execute(text("""
                        UPDATE extratos 
                        SET enviado_em = :new_time 
                        WHERE id = :id
                    """), {
                        "new_time": corrected.isoformat() if corrected else None,
                        "id": extrato_id
                    })
                    
                    corrections += 1
                    logger.info(f"Corrigido timezone do extrato {extrato_id}: {enviado_em} → {corrected}")
        
        if corrections > 0:
            db.commit()
            logger.info(f"Auto-correção de timezone: {corrections} registros corrigidos")
        
    except Exception as e:
        logger.error(f"Erro na auto-correção de timezone: {e}")
        db.rollback()
    
    return corrections