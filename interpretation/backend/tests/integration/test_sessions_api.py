"""Sessions API integration tests."""

from __future__ import annotations


async def test_create_session_requires_auth(client) -> None:
    r = await client.post("/api/v1/sessions", json={"target_languages": ["en"]})
    assert r.status_code == 401


async def test_create_session_returns_urls(client, auth_headers) -> None:
    r = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en", "th"]},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert "session_id" in body
    assert set(body["output_urls"].keys()) == {"en", "th"}


async def test_create_session_rejects_unsupported_language(
    client, auth_headers
) -> None:
    r = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["xx-XX"]},
        headers=auth_headers,
    )
    assert r.status_code == 400


async def test_end_session_persists_costs(client, auth_headers, db_session) -> None:
    create = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers=auth_headers,
    )
    sid = create.json()["session_id"]

    end = await client.post(
        f"/api/v1/sessions/{sid}/end", headers=auth_headers
    )
    assert end.status_code == 200, end.text
    assert end.json()["status"] == "ended"

    # No real audio fed → tracker is empty but rows should still be written.
    cost = await client.get(
        f"/api/v1/sessions/{sid}/cost", headers=auth_headers
    )
    assert cost.status_code == 200
    body = cost.json()
    assert body["total_jpy"] == 0.0
    assert {b["service"] for b in body["breakdown"]} == {"stt", "translate", "tts"}
