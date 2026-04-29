"""Admin-only endpoints.

- GET /api/v1/admin/users         一覧取得
- GET /api/v1/admin/cost-monthly  月別コスト集計 (year-month -> {service: jpy})
"""

from __future__ import annotations

from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, admin_only
from app.db import models as m
from app.db.session import get_db
from app.models.schemas import UserPublic


router = APIRouter(prefix="/admin", tags=["admin"])

DBDep = Annotated[AsyncSession, Depends(get_db)]
AdminDep = Annotated[CurrentUser, Depends(admin_only)]


@router.get("/users", response_model=list[UserPublic])
async def list_users(db: DBDep, _: AdminDep) -> list[UserPublic]:
    rows = (
        await db.execute(select(m.User).order_by(m.User.created_at.desc()))
    ).scalars()
    return [
        UserPublic(
            id=u.id,
            email=u.email,
            display_name=u.display_name,
            role=u.role,  # type: ignore[arg-type]
        )
        for u in rows
    ]


@router.get("/cost-monthly")
async def cost_monthly(
    db: DBDep,
    _: AdminDep,
    months: int = Query(12, ge=1, le=36),
) -> dict:
    """Aggregate session_costs by YYYY-MM bucket using sessions.started_at.

    Returns a list of {month, total_jpy, by_service: {stt,translate,tts,infra}}.
    """
    stmt = (
        select(m.SessionCost, m.Session)
        .join(m.Session, m.Session.id == m.SessionCost.session_id)
        .order_by(m.Session.started_at.desc())
    )
    rows = (await db.execute(stmt)).all()

    by_month: dict[str, dict[str, float]] = defaultdict(
        lambda: {"stt": 0.0, "translate": 0.0, "tts": 0.0, "infra": 0.0}
    )
    for cost, session in rows:
        ym = session.started_at.strftime("%Y-%m")
        bucket = by_month[ym]
        if cost.service in bucket:
            bucket[cost.service] += float(cost.amount_jpy)

    sorted_months = sorted(by_month.keys(), reverse=True)[:months]
    out = []
    for ym in sorted_months:
        b = by_month[ym]
        out.append(
            {
                "month": ym,
                "total_jpy": round(sum(b.values()), 2),
                "by_service": {k: round(v, 2) for k, v in b.items()},
            }
        )
    return {"months": out}
