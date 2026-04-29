"""OriginGuardMiddleware behavior."""

from __future__ import annotations


async def test_post_without_origin_passes(client, auth_headers) -> None:
    # No Origin header → allowed (curl / tests / vMix browser source path).
    r = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text


async def test_post_with_evil_origin_blocked(client, auth_headers) -> None:
    r = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers={
            **auth_headers,
            "origin": "https://attacker.example.com",
        },
    )
    assert r.status_code == 403


async def test_post_with_allowed_origin_passes(client, auth_headers) -> None:
    # The default cors_allowed_origins includes http://localhost:3000.
    r = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers={
            **auth_headers,
            "origin": "http://localhost:3000",
        },
    )
    assert r.status_code == 201


async def test_get_with_evil_origin_passes(client, auth_headers) -> None:
    r = await client.get(
        "/api/v1/auth/me",
        headers={**auth_headers, "origin": "https://attacker.example.com"},
    )
    # GET is safe per CSRF semantics → allowed.
    assert r.status_code == 200
