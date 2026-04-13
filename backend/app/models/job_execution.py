from sqlalchemy import Column, Integer, String, DateTime, Date, Text, UniqueConstraint

from database import Base
from app.core.time import now_sp


class JobExecution(Base):
    __tablename__ = "job_executions"
    __table_args__ = (UniqueConstraint("job_name", name="ux_job_executions_name"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String, nullable=False)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    last_success_date = Column(Date, nullable=True)
    last_error = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), default=now_sp, onupdate=now_sp, nullable=False)

    def mark_run(self):
        now = now_sp()
        self.last_run_at = now
        self.updated_at = now

    def mark_success(self):
        now = now_sp()
        self.last_run_at = now
        self.last_success_at = now
        self.last_success_date = now.date()
        self.last_error = None
        self.updated_at = now

    def mark_failure(self, message: str):
        now = now_sp()
        self.last_run_at = now
        self.last_error = message[:2000]  # evita textos gigantes
        self.updated_at = now
