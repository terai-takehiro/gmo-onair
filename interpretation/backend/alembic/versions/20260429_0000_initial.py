"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-29
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False, unique=True),
        sa.Column("display_name", sa.String(200)),
        sa.Column("role", sa.String(20), nullable=False, server_default="operator"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("role IN ('admin','operator')", name="users_role_check"),
    )

    op.create_table(
        "glossary_presets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column("entries", postgresql.JSONB, nullable=False, server_default="[]"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "owner_user_id", "name", name="glossary_presets_owner_name_uq"
        ),
    )

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "operator_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "glossary_preset_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("glossary_presets.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "target_languages",
            postgresql.ARRAY(sa.String(10)),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), nullable=False, server_default="live"),
        sa.Column("client_meta", postgresql.JSON),
        sa.CheckConstraint(
            "status IN ('live','ended','aborted')", name="sessions_status_check"
        ),
    )
    op.create_index("ix_sessions_started_at", "sessions", ["started_at"])

    op.create_table(
        "session_costs",
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("service", sa.String(20), primary_key=True),
        sa.Column("units", sa.Numeric(14, 4), nullable=False),
        sa.Column("unit_label", sa.String(40), nullable=False),
        sa.Column("amount_jpy", sa.Numeric(14, 2), nullable=False),
        sa.Column("detail", postgresql.JSON),
        sa.CheckConstraint(
            "service IN ('stt','translate','tts','infra')",
            name="session_costs_service_check",
        ),
    )


def downgrade() -> None:
    op.drop_table("session_costs")
    op.drop_index("ix_sessions_started_at", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("glossary_presets")
    op.drop_table("users")
