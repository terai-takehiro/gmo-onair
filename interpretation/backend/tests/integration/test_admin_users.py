"""Admin user management endpoint tests."""

from __future__ import annotations

from app.auth import hash_password
from app.db import models as m


async def _seed_operator(
    db_session, email: str, password: str = "operatorpass"
) -> m.User:
    u = m.User(
        email=email,
        role="operator",
        password_hash=hash_password(password),
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


async def test_admin_can_list_users(client, auth_headers, db_session) -> None:
    await _seed_operator(db_session, "alice@test.local")
    r = await client.get("/api/v1/admin/users", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    emails = [u["email"] for u in body]
    assert "alice@test.local" in emails


async def test_non_admin_rejected(client, db_session) -> None:
    # Login as a non-admin and try to call /admin/users.
    op = await _seed_operator(db_session, "carol@test.local")
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": op.email, "password": "operatorpass"},
    )
    token = login.json()["access_token"]
    r = await client.get(
        "/api/v1/admin/users",
        headers={"authorization": f"Bearer {token}"},
    )
    assert r.status_code == 403


async def test_admin_creates_user_and_can_login(client, auth_headers) -> None:
    r = await client.post(
        "/api/v1/admin/users",
        json={
            "email": "newuser@test.local",
            "password": "supersecret",
            "display_name": "New User",
            "role": "operator",
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "newuser@test.local", "password": "supersecret"},
    )
    assert login.status_code == 200


async def test_admin_can_disable_user(client, auth_headers, db_session) -> None:
    op = await _seed_operator(db_session, "dave@test.local")

    patch = await client.patch(
        f"/api/v1/admin/users/{op.id}",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["is_active"] is False

    # Disabled account cannot log in.
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": op.email, "password": "operatorpass"},
    )
    assert login.status_code == 403


async def test_admin_cannot_disable_self(client, auth_headers, admin_user) -> None:
    r = await client.patch(
        f"/api/v1/admin/users/{admin_user['id']}",
        json={"is_active": False},
        headers=auth_headers,
    )
    assert r.status_code == 400
