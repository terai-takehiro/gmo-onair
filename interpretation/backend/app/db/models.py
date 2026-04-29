"""SQLAlchemy 2.0 models.

Schema mirrors `interpretation/docs/ARCHITECTURE.md` §4.1. Payload bodies
(audio bytes, subtitle text) are NOT persisted — only metadata + glossary
presets + cost summaries.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="operator")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions: Mapped[list["Session"]] = relationship(
        back_populates="operator", lazy="raise_on_sql"
    )

    __table_args__ = (
        CheckConstraint("role IN ('admin','operator')", name="users_role_check"),
    )


class GlossaryPreset(Base):
    __tablename__ = "glossary_presets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    entries: Mapped[list[dict]] = mapped_column(JSONB, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("owner_user_id", "name", name="glossary_presets_owner_name_uq"),
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    operator_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    glossary_preset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("glossary_presets.id", ondelete="SET NULL")
    )
    target_languages: Mapped[list[str]] = mapped_column(
        ARRAY(String(10)), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="live")
    client_meta: Mapped[dict | None] = mapped_column(JSON)

    operator: Mapped["User | None"] = relationship(back_populates="sessions")
    costs: Mapped[list["SessionCost"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('live','ended','aborted')", name="sessions_status_check"
        ),
    )


class SessionCost(Base):
    __tablename__ = "session_costs"

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    service: Mapped[str] = mapped_column(String(20), primary_key=True)
    units: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    unit_label: Mapped[str] = mapped_column(String(40), nullable=False)
    amount_jpy: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSON)

    session: Mapped["Session"] = relationship(back_populates="costs")

    __table_args__ = (
        CheckConstraint(
            "service IN ('stt','translate','tts','infra')",
            name="session_costs_service_check",
        ),
    )
