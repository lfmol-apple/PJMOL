# backend/app/core/timers.py
from datetime import datetime
from typing import Optional, Dict, Any
import json
from zoneinfo import ZoneInfo


def update_extrato_timers(extrato, db_session=None):
    """
    Atualiza os timers de um extrato baseado nos marcos de tempo corretos.
    
    Esta função agora delega para _update_process_timers_v2 que contém
    toda a lógica atualizada dos timers seguindo o fluxo:
    1. Enviado → timer_assinatura_start + enviado_em preenchido
    2. Assinado (ZapSign ou Fora) → timer_assinatura_end + timer_anexos_started_at
    3. Enviado Advogado → timer_anexos_ended_at + timer_advogado_start
    4. Número Processo → timer_advogado_end
    
    Args:
        extrato: Objeto Extrato do SQLAlchemy
        db_session: Sessão do banco (necessária para commit)
    """
    if not db_session:
        # Se não tem sessão, não pode atualizar
        return
    
    # Importar a função atualizada do uploads_clean
    from app.routes.uploads_clean import _update_process_timers_v2
    
    # Chamar a função principal que tem toda a lógica correta
    _update_process_timers_v2(extrato, db_session)


def calculate_timer_duration(start_time: str, end_time: Optional[str] = None) -> Dict[str, Any]:
    """
    Calcula a duração entre dois momentos.
    
    Args:
        start_time: Timestamp de início (ISO string)
        end_time: Timestamp de fim (ISO string) ou None para usar agora
        
    Returns:
        Dict com informações da duração
    """
    try:
        dt_start = datetime.fromisoformat(start_time)
        
        if end_time:
            dt_end = datetime.fromisoformat(end_time)
        else:
            # Usar agora em São Paulo
            dt_end = datetime.now(ZoneInfo("America/Sao_Paulo"))
        
        # Calcular diferença
        diff = dt_end - dt_start
        
        # Converter para informações úteis
        total_seconds = diff.total_seconds()
        days = diff.days
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        return {
            "total_seconds": total_seconds,
            "days": days,
            "hours": int(hours),
            "minutes": int(minutes),
            "formatted": f"{days}d {int(hours):02d}h {int(minutes):02d}m" if days > 0 else f"{int(hours):02d}h {int(minutes):02d}m",
            "is_running": end_time is None,
            "start_time": start_time,
            "end_time": end_time
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "total_seconds": 0,
            "formatted": "Erro",
            "is_running": False
        }


def get_extrato_timer_info(extrato) -> Dict[str, Any]:
    """
    Retorna informações completas dos timers de um extrato.
    
    Args:
        extrato: Objeto Extrato do SQLAlchemy
        
    Returns:
        Dict com informações dos timers
    """
    try:
        extras = json.loads(extrato.extras) if extrato.extras else {}
    except:
        extras = {}
    
    result = {
        "timer_assinatura": None,
        "timer_gerente": None,
        "status_documento": extrato.status_documento,
        "zapsign_status": getattr(extrato, 'zapsign_status', None)
    }
    
    # Timer de assinatura
    timer_assin_start = extras.get("timer_assinatura_start")
    timer_assin_end = extras.get("timer_assinatura_end")
    
    if timer_assin_start:
        result["timer_assinatura"] = calculate_timer_duration(
            timer_assin_start, 
            timer_assin_end
        )
    
    # Timer de gerente (só se documento foi assinado)
    timer_ger_start = extras.get("timer_gerente_start")
    
    if timer_ger_start:
        result["timer_gerente"] = calculate_timer_duration(
            timer_ger_start,
            None  # Sempre rodando até agora
        )
    
    return result


def sync_all_extrato_timers(db_session):
    """
    Sincroniza os timers de todos os extratos no banco.
    Útil para corrigir timers após mudanças na lógica.
    
    Args:
        db_session: Sessão do SQLAlchemy
    """
    from app.models.extrato import Extrato
    
    # Buscar extratos que têm enviado_em
    extratos = db_session.query(Extrato).filter(
        Extrato.enviado_em.isnot(None)
    ).all()
    
    updated_count = 0
    
    for extrato in extratos:
        if update_extrato_timers(extrato, db_session):
            updated_count += 1
    
    db_session.commit()
    
    return {
        "total_extratos": len(extratos),
        "updated_count": updated_count
    }