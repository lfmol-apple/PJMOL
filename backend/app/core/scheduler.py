# app/core/scheduler.py
import os
import sys
import shutil
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timedelta

import pytz
from apscheduler.jobstores.base import JobLookupError
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from database import SessionLocal
from app.models.extrato import Extrato
from app.routes import extratos as extratos_routes  # usa _recalcular_extrato_vals
from app.services.production_report import send_current_month_production_report
from app.services import job_state

_SCHEDULER: Optional[BackgroundScheduler] = None

BASE_DIR = Path(__file__).resolve().parents[2]
DOCS_GERADOS_DIR = BASE_DIR / "documentos_gerados"

RECALC_JOB_NAME = "recalculo_diario"
INDICES_JOB_NAME = "atualizacao_indices_diaria"
MONTHLY_PRODUCTION_REPORT_JOB_NAME = "relatorio_producao_mensal"


def recalcular_todos_extratos() -> int:
    """Recalcula todos os extratos ativos (não soft-deleted) e registra status do job."""
    db = SessionLocal()
    total = 0
    try:
        extratos = db.query(Extrato).filter(Extrato.deleted_at.is_(None)).all()
        total = len(extratos)
        for ex in extratos:
            try:
                extratos_routes._recalcular_extrato_vals(db, ex)
            except Exception as e:
                print(f"[Scheduler] Falha ao recalcular extrato id={getattr(ex, 'id', '?')}: {e}")
        job_state.mark_success(db, RECALC_JOB_NAME)
        print(f"[Scheduler] Recálculo em lote finalizado: {total} extratos.")
        return total
    except Exception as e:
        db.rollback()
        mensagem = f"{type(e).__name__}: {e}"
        try:
            job_state.mark_failure(db, RECALC_JOB_NAME, mensagem)
        except Exception as inner:
            print(f"[Scheduler] Falha ao registrar erro do recálculo: {inner}")
        print(f"[Scheduler] Erro geral no recálculo em lote: {mensagem}")
        raise
    finally:
        db.close()


def _job_recalcular_todos():
    recalcular_todos_extratos()


def _executar_atualizacao_indices() -> List[str]:
    """Executa atualização de TODAS as tabelas de índices. Retorna lista de erros."""
    erros: List[str] = []
    
    # TJMG
    try:
        from indices.baixar_tabela_tjmg import baixar_tabela_tjmg
        baixar_tabela_tjmg()
        print("[Scheduler] ✅ Tabela TJMG atualizada com sucesso.")
    except Exception as e:
        erro = f"TJMG: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar TJMG: {erro}")
        erros.append(erro)

    # TJSP
    try:
        from indices.baixar_tabela_tjsp import baixar_pdf
        baixar_pdf()
        print("[Scheduler] ✅ Tabela TJSP atualizada com sucesso.")
    except Exception as e:
        erro = f"TJSP: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar TJSP: {erro}")
        erros.append(erro)

    # IPCA
    try:
        from indices.baixar_ipca import baixar_ipca
        baixar_ipca()
        print("[Scheduler] ✅ Tabela IPCA atualizada com sucesso.")
    except Exception as e:
        erro = f"IPCA: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar IPCA: {erro}")
        erros.append(erro)

    # IPCA-E
    try:
        import subprocess
        subprocess.run([sys.executable, "indices/baixar_ipcae.py"], check=True, cwd=BASE_DIR)
        print("[Scheduler] ✅ Tabela IPCA-E atualizada com sucesso.")
    except Exception as e:
        erro = f"IPCA-E: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar IPCA-E: {erro}")
        erros.append(erro)

    # INPC
    try:
        import subprocess
        subprocess.run([sys.executable, "indices/baixar_inpc.py"], check=True, cwd=BASE_DIR)
        print("[Scheduler] ✅ Tabela INPC atualizada com sucesso.")
    except Exception as e:
        erro = f"INPC: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar INPC: {erro}")
        erros.append(erro)

    # IGP-M
    try:
        import subprocess
        subprocess.run([sys.executable, "indices/baixar_igpm.py"], check=True, cwd=BASE_DIR)
        print("[Scheduler] ✅ Tabela IGP-M atualizada com sucesso.")
    except Exception as e:
        erro = f"IGP-M: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar IGP-M: {erro}")
        erros.append(erro)

    # SELIC
    try:
        import subprocess
        subprocess.run([sys.executable, "indices/baixar_selic.py"], check=True, cwd=BASE_DIR)
        print("[Scheduler] ✅ Tabela SELIC atualizada com sucesso.")
    except Exception as e:
        erro = f"SELIC: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar SELIC: {erro}")
        erros.append(erro)

    # POUPANÇA
    try:
        import subprocess
        subprocess.run([sys.executable, "indices/baixar_poupanca.py"], check=True, cwd=BASE_DIR)
        print("[Scheduler] ✅ Tabela POUPANÇA atualizada com sucesso.")
    except Exception as e:
        erro = f"POUPANÇA: {type(e).__name__}: {e}"
        print(f"[Scheduler] ❌ Falha ao atualizar POUPANÇA: {erro}")
        erros.append(erro)

    return erros


def atualizar_indices_e_recalcular():
    """Atualiza os índices TJMG/IPCA mensalmente e dispara recálculo quando possível."""
    erros = _executar_atualizacao_indices()

    db = SessionLocal()
    try:
        if erros:
            job_state.mark_failure(db, INDICES_JOB_NAME, " | ".join(erros))
            return
        job_state.mark_success(db, INDICES_JOB_NAME)
    except Exception as e:
        print(f"[Scheduler] Falha ao registrar status da atualização de índices: {e}")
    finally:
        db.close()

    try:
        recalcular_todos_extratos()
    except Exception as e:
        print(f"[Scheduler] Recálculo pós-atualização de índices falhou: {e}")


def _job_atualizar_indices():
    atualizar_indices_e_recalcular()


def _job_limpar_documentos_gerados():
    DOCS_GERADOS_DIR.mkdir(parents=True, exist_ok=True)
    removidos = 0
    bytes_removidos = 0

    for item in DOCS_GERADOS_DIR.iterdir():
        try:
            if item.is_file():
                bytes_removidos += item.stat().st_size
                item.unlink()
                removidos += 1
            elif item.is_dir():
                tamanho_dir = sum(f.stat().st_size for f in item.rglob("*") if f.is_file())
                shutil.rmtree(item, ignore_errors=True)
                bytes_removidos += tamanho_dir
                removidos += 1
        except Exception as e:
            print(f"[Scheduler] Falha ao remover {item}: {e}")

    tamanho_mb = bytes_removidos / (1024 * 1024) if bytes_removidos else 0
    print(f"[Scheduler] Limpeza mensal: removidos {removidos} itens (~{tamanho_mb:.2f} MB).")


def _job_limpar_temp_uploads():
    """Remove arquivos temporários em `temp_uploads` com mais de 24 horas.

    Roda periodicamente (a cada hora) para evitar acúmulo.
    """
    base = BASE_DIR / "temp_uploads"
    base.mkdir(parents=True, exist_ok=True)
    cutoff = datetime.now(pytz.timezone("America/Sao_Paulo")) - timedelta(hours=24)
    removidos = 0
    bytes_removidos = 0

    for path in base.rglob("*"):
        try:
            if path.is_file():
                mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=pytz.UTC).astimezone(pytz.timezone("America/Sao_Paulo"))
                if mtime < cutoff:
                    bytes_removidos += path.stat().st_size
                    path.unlink()
                    removidos += 1
            elif path.is_dir():
                # remove dirs vazias
                try:
                    path.rmdir()
                except OSError:
                    pass
        except Exception as e:
            print(f"[Scheduler] Falha ao limpar temp_uploads {path}: {e}")

    tamanho_mb = bytes_removidos / (1024 * 1024) if bytes_removidos else 0
    print(f"[Scheduler] Limpeza de temp_uploads: removidos {removidos} itens (~{tamanho_mb:.2f} MB).")


def _job_relatorio_producao_mensal():
    try:
        result = send_current_month_production_report()
        print(
            f"[Scheduler] Relatório mensal de produção enviado: sent={result.get('sent')} recipients={result.get('recipient_count', 0)}"
        )
    except Exception as e:
        print(f"[Scheduler] Falha ao enviar relatório mensal de produção: {e}")


def install_scheduler(app):
    """Instala o APScheduler e agenda jobs recorrentes."""
    global _SCHEDULER
    if _SCHEDULER is not None:
        return _SCHEDULER

    tz = pytz.timezone("America/Sao_Paulo")
    scheduler = BackgroundScheduler(timezone=tz)

    # recálculo diário às 03:00 BRT
    scheduler.add_job(
        _job_recalcular_todos,
        CronTrigger(hour=3, minute=0, timezone=tz),
        id="recalculo_diario",
        replace_existing=True,
    )

    # atualização dos índices TODO DIA às 02:00 BRT
    scheduler.add_job(
        _job_atualizar_indices,
        CronTrigger(hour=2, minute=0, timezone=tz),
        id="atualizacao_indices_diaria",
        replace_existing=True,
    )

    # limpeza mensal de documentos gerados
    scheduler.add_job(
        _job_limpar_documentos_gerados,
        CronTrigger(day="last", hour=23, minute=45, timezone=tz),
        id="limpeza_mensal_documentos",
        replace_existing=True,
    )

    # limpeza horária de temp_uploads (>24h)
    scheduler.add_job(
        _job_limpar_temp_uploads,
        CronTrigger(minute=0, timezone=tz),
        id="limpeza_temp_uploads_hourly",
        replace_existing=True,
    )

    scheduler.add_job(
        _job_relatorio_producao_mensal,
        CronTrigger(day="last", hour=18, minute=0, timezone=tz),
        id=MONTHLY_PRODUCTION_REPORT_JOB_NAME,
        replace_existing=True,
    )

    def _is_reloader_proc() -> bool:
        # Uvicorn com --reload cria um watcher. Evite duplicidade:
        return os.environ.get("SERVER_START_METHOD") == "reload"

    @app.on_event("startup")
    def _startup_scheduler():
        try:
            if not scheduler.running:
                scheduler.start()
            print(
                "[Scheduler] ✅ Iniciado: recálculo diário às 03:00, atualização DIÁRIA de TODOS os índices às 02:00 e limpeza de documentos."
            )
            # roda 1x no startup: recalcula tudo ao "abrir o sistema"
            if not _is_reloader_proc():
                _job_recalcular_todos()
        except Exception as e:
            print(f"[Scheduler] ❌ Falha ao iniciar: {e}")

    @app.on_event("shutdown")
    def _shutdown_scheduler():
        try:
            scheduler.shutdown(wait=False)
            print("[Scheduler] Finalizado.")
        except JobLookupError:
            pass

    _SCHEDULER = scheduler
    return scheduler
