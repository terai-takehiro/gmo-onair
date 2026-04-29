"""Cloud TTS wrapper.

Phase 1: one-shot synth per final translation segment. Total latency for a
short utterance (< 100 chars) is ~200-500ms, which fits the budget.

Phase 2 polish: switch to streaming_synthesize for better TTFA.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from google.cloud import texttospeech_v1 as tts

from app.config import Settings
from app.languages import LanguageSpec


@dataclass(frozen=True)
class AudioResult:
    lang: str
    seq: int
    mp3_bytes: bytes
    elapsed_ms: float


async def synthesize_one_shot(
    settings: Settings,
    lang_spec: LanguageSpec,
    text: str,
    seq: int,
) -> AudioResult:
    """Run synth in a thread to keep the event loop free."""
    return await asyncio.to_thread(_blocking_synth, settings, lang_spec, text, seq)


def _blocking_synth(
    settings: Settings, lang_spec: LanguageSpec, text: str, seq: int
) -> AudioResult:
    client = tts.TextToSpeechClient()
    input_text = tts.SynthesisInput(text=text)
    voice = tts.VoiceSelectionParams(
        language_code=lang_spec.locale,
        name=lang_spec.tts_voice or "",
    )
    audio_config = tts.AudioConfig(
        audio_encoding=tts.AudioEncoding.MP3,
        sample_rate_hertz=24000,
    )
    t0 = time.perf_counter()
    response = client.synthesize_speech(
        input=input_text, voice=voice, audio_config=audio_config
    )
    return AudioResult(
        lang=lang_spec.locale.split("-")[0],
        seq=seq,
        mp3_bytes=response.audio_content,
        elapsed_ms=(time.perf_counter() - t0) * 1000,
    )
