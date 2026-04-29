"""Cloud TTS streaming wrapper (Phase 1 stub).

Streams synthesized MP3/Opus chunks out of `streaming_synthesize`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator

from app.config import Settings
from app.languages import LanguageSpec


@dataclass(frozen=True)
class AudioChunk:
    lang: str
    seq: int
    mp3_bytes: bytes
    is_first: bool
    t_ms: float


async def stream_synthesize(
    settings: Settings,
    lang_spec: LanguageSpec,
    text_stream: AsyncIterator[str],
    seq: int,
) -> AsyncIterator[AudioChunk]:
    """Take a stream of text deltas and yield streaming audio chunks.

    TODO(Phase 1): implement with google-cloud-texttospeech v1 streaming.
    Reference: interpretation/verification/test_tts.py
    """
    raise NotImplementedError("Phase 1: implement TTS streaming synthesize")
    if False:  # pragma: no cover
        yield AudioChunk(
            lang="", seq=seq, mp3_bytes=b"", is_first=True, t_ms=0.0
        )
