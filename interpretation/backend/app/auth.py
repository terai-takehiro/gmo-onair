"""JWT auth + bcrypt password helpers.

Bearer-token auth on REST endpoints; query-string token on WebSockets
(WebSocket clients can't set Authorization headers).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import Settings, get_settings


_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd.hash(plain)


def verify_password(plain: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return _pwd.verify(plain, hashed)
    except Exception:
        return False


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


def decode_token(token: str, settings: Settings) -> CurrentUser:
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_alg])
    except JWTError as e:
        raise HTTPException(status_code=401, detail="invalid token") from e
    return CurrentUser(
        id=UUID(claims["sub"]),
        email=claims["email"],
        role=claims.get("role", "operator"),
    )


def current_user(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    return decode_token(token, settings)


def admin_only(
    user: Annotated[CurrentUser, Depends(current_user)],
) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    return user
