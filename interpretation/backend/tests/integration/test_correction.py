"""Operator manual correction path."""

from __future__ import annotations

import asyncio
import uuid

import pytest

from app.config import get_settings
from app.pipeline import tts as tts_mod
from app.pipeline.orchestrator import Orchestrator
from app.pipeline.pubsub import channel_for, preview_channel_for
from tests.fakes.pubsub import FakePubSubBroker


async def _fake_tts(settings, lang_spec, text, seq):
    yield tts_mod.AudioChunk(
        lang="en",
        seq=seq,
        chunk_seq=1,
        mp3_bytes=b"FAKE",
        is_first=True,
        t_ms=10.0,
    )


@pytest.mark.asyncio
async def test_push_correction_publishes_corrected_translation_and_audio(
    monkeypatch,
) -> None:
    monkeypatch.setattr(tts_mod, "synthesize_stream", _fake_tts)

    settings = get_settings()
    broker = FakePubSubBroker()
    orch = Orchestrator(settings, broker)

    sid = uuid.uuid4()
    await orch.start_session(sid, target_languages=["en"])
    ok = await orch.push_correction(
        session_id=sid, lang="en", text="Corrected sentence."
    )
    assert ok is True

    en = broker.published_on(channel_for(str(sid), "en"))
    types = [m["type"] for m in en]
    assert "translation" in types
    assert "audio_chunk" in types

    translation = next(m for m in en if m["type"] == "translation")
    assert translation["corrected"] is True
    assert translation["is_final"] is True
    assert translation["text"] == "Corrected sentence."

    preview = broker.published_on(preview_channel_for(str(sid)))
    assert any(
        m["type"] == "translation" and m.get("corrected") is True
        for m in preview
    )

    # Cleanup so other tests don't leak state.
    await orch.end_session(sid)


@pytest.mark.asyncio
async def test_correction_rejects_unknown_session(monkeypatch) -> None:
    monkeypatch.setattr(tts_mod, "synthesize_stream", _fake_tts)
    settings = get_settings()
    orch = Orchestrator(settings, FakePubSubBroker())
    ok = await orch.push_correction(uuid.uuid4(), "en", "hi")
    assert ok is False


@pytest.mark.asyncio
async def test_correction_endpoint_requires_live_session(
    client, auth_headers
) -> None:
    create = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers=auth_headers,
    )
    sid = create.json()["session_id"]
    # End it first → not live anymore.
    await client.post(f"/api/v1/sessions/{sid}/end", headers=auth_headers)

    r = await client.post(
        f"/api/v1/sessions/{sid}/correct",
        json={"lang": "en", "text": "anything"},
        headers=auth_headers,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_correction_endpoint_validates_lang(
    client, auth_headers, monkeypatch
) -> None:
    monkeypatch.setattr(tts_mod, "synthesize_stream", _fake_tts)
    create = await client.post(
        "/api/v1/sessions",
        json={"target_languages": ["en"]},
        headers=auth_headers,
    )
    sid = create.json()["session_id"]

    bad = await client.post(
        f"/api/v1/sessions/{sid}/correct",
        json={"lang": "th", "text": "x"},  # th not in target
        headers=auth_headers,
    )
    assert bad.status_code == 400
    await client.post(f"/api/v1/sessions/{sid}/end", headers=auth_headers)
