"""add sessions.cc_ingest_urls

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-02
"""

from __future__ import annotations

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "cc_ingest_urls",
            postgresql.JSONB,
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("sessions", "cc_ingest_urls")
