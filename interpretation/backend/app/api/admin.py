"""Admin-only endpoints (system_admin スコープ)."""

from __future__ import annotations

from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, admin_only, hash_password
from app.db import models as m
from app.db.session import get_db
from app.models.schemas import UserCreate, UserPublic, UserUpdate


router = APIRouter(prefix="/admin", tags=["admin"])

DBDep = Annotated[AsyncSession, Depends(get_db)]
AdminDep = Annotated[CurrentUser, Depends(admin_only)]


def _to_public(u: m.User) -> UserPublic:
    return UserPublic(
        id=u.id,
        email=u.email,
        display_name=u.display_name,
        role=u.role,  # type: ignore[arg-type]
        is_active=u.is_active,
    )


# ---------- users ----------


@router.get("/users", response_model=list[UserPublic])
async def list_users(db: DBDep, _: AdminDep) -> list[UserPublic]:
    rows = (
        await db.execute(select(m.User).order_by(m.User.created_at.desc()))
    ).scalars()
    return [_to_public(u) for u in rows]


@router.post("/users", response_model=UserPublic, status_code=201)
async def create_user(
    payload: UserCreate, db: DBDep, _: AdminDep
) -> UserPublic:
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="password must be >= 8 chars")
    existing = (
        await db.execute(select(m.User).where(m.User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="email already exists")

    user = m.User(
        email=payload.email.lower(),
        display_name=payload.display_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _to_public(user)


@router.patch("/users/{user_id}", response_model=UserPublic)
async def update_user(
    user_id: UUID, payload: UserUpdate, db: DBDep, current: AdminDep
) -> UserPublic:
    u = await db.get(m.User, user_id)
    if u is None:
        raise HTTPException(status_code=404, detail="user not found")

    if payload.role is not None:
        u.role = payload.role
    if payload.display_name is not None:
        u.display_name = payload.display_name
    if payload.is_active is not None:
        if u.id == current.id and payload.is_active is False:
            raise HTTPException(status_code=400, detail="cannot deactivate yourself")
        u.is_active = payload.is_active
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(
                status_code=400, detail="password must be >= 8 chars"
            )
        u.password_hash = hash_password(payload.password)

    await db.commit()
    await db.refresh(u)
    return _to_public(u)


# ---------- monthly cost ----------


@router.get("/cost-monthly")
async def cost_monthly(
    db: DBDep,
    _: AdminDep,
    months: int = Query(12, ge=1, le=36),
) -> dict:
    """Aggregate session_costs by YYYY-MM bucket using sessions.started_at."""
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
