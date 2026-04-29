"""Auth endpoints: login + current user."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    CurrentUser,
    create_access_token,
    current_user,
    verify_password,
)
from app.config import Settings, get_settings
from app.db import models as m
from app.db.session import get_db
from app.models.schemas import LoginRequest, TokenResponse, UserPublic


router = APIRouter(prefix="/auth", tags=["auth"])

DBDep = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest, db: DBDep, settings: SettingsDep, request: Request
) -> TokenResponse:
    row = (
        await db.execute(select(m.User).where(m.User.email == payload.email.lower()))
    ).scalar_one_or_none()
    if row is None or not verify_password(payload.password, row.password_hash):
        # Constant-ish response to avoid timing leaks; logging only the email.
        raise HTTPException(status_code=401, detail="invalid email or password")
    if not row.is_active:
        raise HTTPException(status_code=403, detail="account disabled")

    cu = CurrentUser(id=row.id, email=row.email, role=row.role)
    token = create_access_token(cu, settings)

    row.last_login_at = datetime.now(UTC)
    await db.commit()

    return TokenResponse(
        access_token=token,
        expires_at=datetime.now(UTC) + timedelta(hours=settings.jwt_ttl_hours),
    )


@router.get("/me", response_model=UserPublic)
async def me(
    user: Annotated[CurrentUser, Depends(current_user)],
    db: DBDep,
) -> UserPublic:
    row = await db.get(m.User, user.id)
    if row is None:
        raise HTTPException(status_code=401, detail="user no longer exists")
    return UserPublic(
        id=row.id,
        email=row.email,
        display_name=row.display_name,
        role=row.role,  # type: ignore[arg-type]
    )
