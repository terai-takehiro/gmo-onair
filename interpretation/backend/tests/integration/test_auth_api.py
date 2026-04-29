"""Auth endpoint integration tests."""

from __future__ import annotations

from app.auth import hash_password
from app.db import models as m


async def _seed_user(db_session, email: str, password: str, role: str = "operator") -> None:
    db_session.add(
        m.User(
            email=email,
            display_name=email.split("@")[0],
            role=role,
            password_hash=hash_password(password),
        )
    )
    await db_session.commit()


async def test_login_success_returns_token(client, db_session) -> None:
    await _seed_user(db_session, "alice@test.local", "supersecret")

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "alice@test.local", "password": "supersecret"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["expires_at"]


async def test_login_rejects_wrong_password(client, db_session) -> None:
    await _seed_user(db_session, "bob@test.local", "rightpass")

    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "bob@test.local", "password": "wrong"},
    )
    assert r.status_code == 401


async def test_me_requires_bearer(client) -> None:
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401


async def test_me_returns_user(client, auth_headers, admin_user) -> None:
    r = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == admin_user["email"]
    assert body["role"] == "admin"
