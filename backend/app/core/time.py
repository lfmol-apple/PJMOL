# backend/app/core/time.py
from datetime import datetime, timezone
from typing import Optional, Union
import pytz

try:
    from zoneinfo import ZoneInfo  # Python 3.9+ tem no stdlib
except Exception:  # fallback raro
    from backports.zoneinfo import ZoneInfo

# Constantes de timezone
TZ_SP = ZoneInfo("America/Sao_Paulo")
TZ_UTC = timezone.utc

def now_sp() -> datetime:
    """Retorna datetime com tz de São Paulo (aware)."""
    return datetime.now(TZ_SP)

def now_utc_for_sqlite() -> datetime:
    """Retorna datetime UTC para salvar no SQLite (naive UTC).
    
    ⚠️  SEMPRE use esta função para salvar timestamps no banco!
    Retorna datetime naive em UTC para compatibilidade com SQLite.
    """
    return datetime.now(TZ_UTC).replace(tzinfo=None)

def now_sp_iso() -> str:
    """Retorna timestamp atual em formato ISO string com timezone SP."""
    return now_sp().isoformat()

def to_sp(dt: Optional[datetime]) -> Optional[datetime]:
    """Converte qualquer datetime para America/Sao_Paulo (preservando instante)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        # se vier naive (sem tz), assumimos que estava em UTC (padrão do SQLite)
        dt = dt.replace(tzinfo=TZ_UTC)
    return dt.astimezone(TZ_SP)

def to_utc_for_db(dt: Optional[Union[datetime, str]]) -> Optional[datetime]:
    """Converte datetime para UTC naive para salvar no banco.
    
    Args:
        dt: datetime em qualquer timezone ou string ISO
        
    Returns:
        datetime naive em UTC para SQLite
    """
    if dt is None:
        return None
        
    if isinstance(dt, str):
        # Parse de string ISO
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except ValueError:
            # Fallback para formato sem timezone
            dt = datetime.fromisoformat(dt)
            dt = dt.replace(tzinfo=TZ_SP)  # Assume SP se não tem timezone
    
    if dt.tzinfo is None:
        # Se naive, assume que está em SP
        dt = dt.replace(tzinfo=TZ_SP)
    
    # Converte para UTC e remove timezone (naive UTC para SQLite)
    return dt.astimezone(TZ_UTC).replace(tzinfo=None)

def from_db_to_sp(dt: Optional[datetime]) -> Optional[datetime]:
    """Converte datetime do banco (UTC naive) para SP (aware).
    
    ⚠️  SEMPRE use esta função ao ler timestamps do banco para exibição!
    
    Args:
        dt: datetime naive vindo do SQLite (assumed UTC)
        
    Returns:
        datetime aware em timezone SP
    """
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        # Se naive, assumimos que está em UTC (como salvamos)
        dt = dt.replace(tzinfo=TZ_UTC)
    
    return dt.astimezone(TZ_SP)

def auto_correct_timezone_if_needed(dt: Optional[datetime]) -> Optional[datetime]:
    """Detecta e corrige automaticamente timezone incorreto.
    
    Heurística: se o horário parece ser comercial (8-18h) está provavelmente certo,
    se está muito tarde (19-23h) provavelmente está em UTC e precisa de -3h.
    """
    if dt is None:
        return None
        
    # Se já tem timezone, converte para UTC
    if dt.tzinfo is not None:
        return dt.astimezone(TZ_UTC).replace(tzinfo=None)
    
    # Heurística para detectar se está em timezone errado
    hour = dt.hour
    
    # Se está entre 19-23h, provavelmente está em UTC quando deveria estar em SP
    if 19 <= hour <= 23:
        # Aplica correção -3h (converte de UTC mal salvo para SP, depois para UTC correto)
        sp_time = dt.replace(tzinfo=TZ_UTC).astimezone(TZ_SP)  # Assume que estava em UTC
        return sp_time.astimezone(TZ_UTC).replace(tzinfo=None)
    
    # Se está entre 8-18h, provavelmente já está correto em SP
    elif 8 <= hour <= 18:
        # Trata como se já estivesse em SP
        sp_time = dt.replace(tzinfo=TZ_SP)
        return sp_time.astimezone(TZ_UTC).replace(tzinfo=None)
    
    # Outros casos, deixa como está (assumindo UTC)
    return dt

def now_utc_for_sqlite() -> datetime:
    """Retorna datetime em UTC para armazenamento correto no SQLite.
    
    SQLite não preserva timezone automaticamente mesmo com DateTime(timezone=True).
    Esta função garante que datetime timezone-aware seja convertido para UTC
    antes do armazenamento, permitindo que SQLAlchemy reconstrua corretamente
    o timezone na leitura.
    """
    from zoneinfo import ZoneInfo
    return now_sp().astimezone(ZoneInfo('UTC'))
