"""JWT auth helpers (Phase 1 stub).

Issued by /api/v1/auth/login (TODO Phase 1) and verified on protected
routes via the `current_user` dependency.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt

from app.config import Settings, get_settings


@dataclass(frozen=True)
class CurrentUser:
    id: UUID
    email: str
    role: str  # "admin" | "operator"


def create_access_token(user: CurrentUser, settings: Settings) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=settings.jwt_ttl_hours)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_alg)


def _decode(token: str, settings: Settings) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except JWTError as e:
        raise HTTPException(status_code=401, detail="invalid token") from e


def current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    claims = _decode(token, settings)
    return CurrentUser(
        id=UUID(claims["sub"]),
        email=claims["email"],
        role=claims.get("role", "operator"),
    )
