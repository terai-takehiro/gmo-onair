"""End-to-end pipeline test with mocked STT / Gemini / TTS.

Drives Orchestrator directly: feed bytes → assert that translation +
audio_chunk frames land on the right Pub/Sub channels and that the
CostTracker accounts for everything.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest

from app.config import get_settings
from app.languages import LanguageSpec
from app.pipeline import stt as stt_mod
from app.pipeline import translator as tr_mod
from app.pipeline import tts as tts_mod
from app.pipeline.orchestrator import Orchestrator
from app.pipeline.pubsub import channel_for, preview_channel_for
from tests.fakes.pubsub import FakePubSubBroker


async def _fake_stt(settings, audio_iter, boost_phrases=None):
    """Drain audio then emit one is_final transcript."""
    async for _ in audio_iter:
        pass
    yield stt_mod.TranscriptEvent(
        text="こんにちは、本日は晴天なり。", is_final=True, t_ms=120.0
    )


async def _fake_translate(settings, src_text, target_lang, system_prompt, seq):
    """Yield two interim deltas + a final event with usage_metadata."""
    yield tr_mod.TranslationEvent(
        lang=target_lang,
        text_delta="Hello",
        accumulated="Hello",
        is_final=False,
        seq=seq,
        t_ms=80.0,
    )
    yield tr_mod.TranslationEvent(
        lang=target_lang,
        text_delta=" world",
        accumulated="Hello world",
        is_final=False,
        seq=seq,
        t_ms=130.0,
    )
    yield tr_mod.TranslationEvent(
        lang=target_lang,
        text_delta="",
        accumulated="Hello world",
        is_final=True,
        seq=seq,
        t_ms=150.0,
        input_tokens=42,
        output_tokens=12,
    )


async def _fake_tts(settings, lang_spec: LanguageSpec, text: str, seq: int):
    return tts_mod.AudioResult(
        lang="en", seq=seq, mp3_bytes=b"FAKE-MP3-BYTES", elapsed_ms=200.0
    )


@pytest.mark.asyncio
async def test_full_pipeline_publishes_translation_and_audio(monkeypatch) -> None:
    monkeypatch.setattr(stt_mod, "stream_recognize", _fake_stt)
    monkeypatch.setattr(tr_mod, "translate_stream", _fake_translate)
    monkeypatch.setattr(tts_mod, "synthesize_one_shot", _fake_tts)

    settings = get_settings()
    broker = FakePubSubBroker()
    orch = Orchestrator(settings, broker)

    sid = uuid.uuid4()
    await orch.start_session(sid, target_languages=["en"], boost_phrases=[])

    # 100ms of audio @ 16k mono = 3200 bytes.
    await orch.feed_audio(sid, b"\x00" * 3200)
    await orch.feed_audio(sid, b"\x00" * 3200)

    # Allow the pipeline tasks to run.
    for _ in range(20):
        await asyncio.sleep(0.05)
        if broker.published_on(channel_for(str(sid), "en")):
            break

    tracker = await orch.end_session(sid)
    assert tracker is not None
    assert tracker.gemini_input_tokens == 42
    assert tracker.gemini_output_tokens == 12
    assert tracker.tts_characters == len("Hello world")
    assert tracker.stt_seconds == pytest.approx(0.2, rel=0.1)

    en_channel = broker.published_on(channel_for(str(sid), "en"))
    types_en = [m["type"] for m in en_channel]
    assert "translation" in types_en
    assert "audio_chunk" in types_en
    assert "session_end" in types_en

    preview = broker.published_on(preview_channel_for(str(sid)))
    types_preview = [m["type"] for m in preview]
    assert "transcript" in types_preview
    assert "translation" in types_preview
    # No audio_chunk on preview channel.
    assert "audio_chunk" not in types_preview


@pytest.mark.asyncio
async def test_one_lang_failure_does_not_block_others(monkeypatch) -> None:
    """Ensure REQUIREMENTS §4.3: per-language isolation."""

    async def stt_one_final(settings, audio_iter, boost_phrases=None):
        async for _ in audio_iter:
            pass
        yield stt_mod.TranscriptEvent(text="テスト", is_final=True, t_ms=10.0)

    async def translate_with_failure(settings, src, lang, prompt, seq):
        if lang == "en":
            raise RuntimeError("synthetic gemini error")
        yield tr_mod.TranslationEvent(
            lang=lang,
            text_delta="ok",
            accumulated="ok",
            is_final=True,
            seq=seq,
            t_ms=50.0,
            input_tokens=1,
            output_tokens=1,
        )

    async def tts_ok(settings, spec, text, seq):
        return tts_mod.AudioResult(lang="th", seq=seq, mp3_bytes=b"X", elapsed_ms=10.0)

    monkeypatch.setattr(stt_mod, "stream_recognize", stt_one_final)
    monkeypatch.setattr(tr_mod, "translate_stream", translate_with_failure)
    monkeypatch.setattr(tts_mod, "synthesize_one_shot", tts_ok)

    settings = get_settings()
    broker = FakePubSubBroker()
    orch = Orchestrator(settings, broker)
    sid = uuid.uuid4()
    await orch.start_session(sid, target_languages=["en", "th"])
    await orch.feed_audio(sid, b"\x00" * 3200)

    for _ in range(20):
        await asyncio.sleep(0.05)
        if broker.published_on(channel_for(str(sid), "th")):
            break

    await orch.end_session(sid)

    th = broker.published_on(channel_for(str(sid), "th"))
    types_th = {m["type"] for m in th}
    assert "translation" in types_th  # th lang still emits despite en failure
