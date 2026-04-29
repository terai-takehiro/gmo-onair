"""Verify orchestrator fans final translations out to YouTube CC."""

from __future__ import annotations

import asyncio
import uuid

import pytest

from app.config import get_settings
from app.pipeline import stt as stt_mod
from app.pipeline import translator as tr_mod
from app.pipeline import tts as tts_mod
from app.pipeline import youtube_cc as cc_mod
from app.pipeline.orchestrator import Orchestrator
from app.pipeline.pubsub import channel_for
from tests.fakes.pubsub import FakePubSubBroker


async def _stt(settings, audio_iter, boost_phrases=None):
    async for _ in audio_iter:
        pass
    yield stt_mod.TranscriptEvent(text="こんにちは", is_final=True, t_ms=10.0)


async def _translate(settings, src_text, target_lang, system_prompt, seq):
    yield tr_mod.TranslationEvent(
        lang=target_lang,
        text_delta="hello",
        accumulated="hello",
        is_final=True,
        seq=seq,
        t_ms=20.0,
        input_tokens=5,
        output_tokens=3,
    )


async def _tts(settings, lang_spec, text, seq):
    yield tts_mod.AudioChunk(
        lang="en",
        seq=seq,
        chunk_seq=1,
        mp3_bytes=b"X",
        is_first=True,
        t_ms=10.0,
    )


@pytest.mark.asyncio
async def test_pipeline_posts_to_youtube_cc(monkeypatch) -> None:
    monkeypatch.setattr(stt_mod, "stream_recognize", _stt)
    monkeypatch.setattr(tr_mod, "translate_stream", _translate)
    monkeypatch.setattr(tts_mod, "synthesize_stream", _tts)

    posted: list[tuple[str, str]] = []

    class FakePoster:
        def __init__(self, lang: str) -> None:
            self.lang = lang

        async def post(self, text: str) -> None:
            posted.append((self.lang, text))

        async def close(self) -> None:
            return

    async def fake_make_posters(cc_urls):
        return {lang: FakePoster(lang) for lang in (cc_urls or {})}

    monkeypatch.setattr(cc_mod, "make_posters", fake_make_posters)

    settings = get_settings()
    broker = FakePubSubBroker()
    orch = Orchestrator(settings, broker)

    sid = uuid.uuid4()
    await orch.start_session(
        sid,
        target_languages=["en"],
        cc_ingest_urls={
            "en": "https://www.youtube.com/api/live_ingest/text-mt?id=ABC"
        },
    )
    await orch.feed_audio(sid, b"\x00" * 3200)

    # Wait for the pipeline tasks to fire.
    for _ in range(20):
        await asyncio.sleep(0.05)
        if posted:
            break

    await orch.end_session(sid)

    assert posted == [("en", "hello")]
    # Translation also reached the per-lang Pub/Sub channel.
    assert any(
        m["type"] == "translation" and m["lang"] == "en"
        for m in broker.published_on(channel_for(str(sid), "en"))
    )


@pytest.mark.asyncio
async def test_unknown_lang_in_cc_urls_silently_dropped(monkeypatch) -> None:
    monkeypatch.setattr(stt_mod, "stream_recognize", _stt)
    monkeypatch.setattr(tr_mod, "translate_stream", _translate)
    monkeypatch.setattr(tts_mod, "synthesize_stream", _tts)

    settings = get_settings()
    orch = Orchestrator(settings, FakePubSubBroker())

    sid = uuid.uuid4()
    await orch.start_session(
        sid,
        target_languages=["en"],
        # th is not in target_languages → should be silently filtered.
        cc_ingest_urls={
            "th": "https://www.youtube.com/api/live_ingest/text-mt?id=THAI"
        },
    )
    p = orch.get(sid)
    assert p is not None
    assert "th" not in p.cc_posters
    await orch.end_session(sid)
