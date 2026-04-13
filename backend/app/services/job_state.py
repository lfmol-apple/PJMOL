from __future__ import annotations

from typing import Optional
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.job_execution import JobExecution


def _get_or_create(db: Session, job_name: str) -> JobExecution:
    state = db.query(JobExecution).filter(JobExecution.job_name == job_name).first()
    if state is None:
        state = JobExecution(job_name=job_name)
        db.add(state)
        db.flush()
    return state


def mark_success(db: Session, job_name: str, commit: bool = True) -> JobExecution:
    state = _get_or_create(db, job_name)
    state.mark_success()
    if commit:
        db.commit()
    else:
        db.flush()
    return state


def mark_failure(db: Session, job_name: str, message: str, commit: bool = True) -> JobExecution:
    state = _get_or_create(db, job_name)
    state.mark_failure(message)
    if commit:
        db.commit()
    else:
        db.flush()
    return state


def mark_run(db: Session, job_name: str, commit: bool = True) -> JobExecution:
    state = _get_or_create(db, job_name)
    state.mark_run()
    if commit:
        db.commit()
    else:
        db.flush()
    return state


def last_success_date(db: Session, job_name: str) -> Optional[date]:
    state = db.query(JobExecution).filter(JobExecution.job_name == job_name).first()
    return state.last_success_date if state else None


def last_success_at(db: Session, job_name: str) -> Optional[datetime]:
    state = db.query(JobExecution).filter(JobExecution.job_name == job_name).first()
    return state.last_success_at if state else None
