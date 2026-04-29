"""Unit tests for CostTracker."""

from __future__ import annotations

import uuid

from app.pipeline.costs import CostRates, CostTracker


def _tracker(usd_to_jpy: float = 100.0) -> CostTracker:
    rates = CostRates(
        stt_chirp3_per_minute_usd=0.024,
        gemini_flash_input_per_mtok_usd=0.075,
        gemini_flash_output_per_mtok_usd=0.30,
        tts_chirp3hd_per_char_usd=0.000016,
        usd_to_jpy=usd_to_jpy,
    )
    return CostTracker(rates=rates)


def test_audio_chunks_accumulate_seconds() -> None:
    t = _tracker()
    for _ in range(60):  # 60 chunks * 100ms = 6 seconds
        t.record_audio_chunk(100.0)
    assert t.stt_seconds == 6.0


def test_translate_and_tts_counters() -> None:
    t = _tracker()
    t.record_translate(100, 50)
    t.record_translate(200, 80)
    t.record_tts(123)
    t.record_tts(7)
    assert t.gemini_input_tokens == 300
    assert t.gemini_output_tokens == 130
    assert t.tts_characters == 130


def test_summary_totals_and_breakdown() -> None:
    t = _tracker(usd_to_jpy=100.0)
    t.record_audio_chunk(60_000.0)  # 60 s = 1 min
    t.record_translate(1_000_000, 1_000_000)  # 1 Mtok in + 1 Mtok out
    t.record_tts(10_000)  # 10k chars

    sid = uuid.uuid4()
    summary = t.to_summary(sid)

    by = {b.service: b for b in summary.breakdown}
    # STT 1 min * $0.024 * 100 = ¥2.40
    assert by["stt"].amount_jpy == 2.40
    # Translate ($0.075 + $0.30) * 100 = ¥37.50
    assert by["translate"].amount_jpy == 37.50
    # TTS 10000 * $0.000016 * 100 = ¥16.00
    assert by["tts"].amount_jpy == 16.00
    assert summary.total_jpy == 2.40 + 37.50 + 16.00


def test_negative_inputs_clamped() -> None:
    t = _tracker()
    t.record_translate(-10, -5)
    t.record_tts(-100)
    assert t.gemini_input_tokens == 0
    assert t.gemini_output_tokens == 0
    assert t.tts_characters == 0
