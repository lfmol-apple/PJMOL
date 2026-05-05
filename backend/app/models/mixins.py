# backend/app/models/mixins.py
from sqlalchemy.orm import declarative_mixin
from sqlalchemy import Column, DateTime
from app.core.time import now_sp

@declarative_mixin
class TimestampMixin:
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=now_sp,     # ✅ grava com tz de São Paulo
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=now_sp,     # ✅ na criação
        onupdate=now_sp,    # ✅ nas atualizações
    )
