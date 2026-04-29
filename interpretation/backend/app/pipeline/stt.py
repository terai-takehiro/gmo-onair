"""Speech-to-Text V2 (Chirp 3) streaming wrapper (Phase 1 stub).

Async generator that consumes 16kHz mono PCM bytes from a queue and yields
(is_final, text, t_ms) tuples.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator

from app.config import Settings


@dataclass(frozen=True)
class TranscriptEvent:
    text: str
    is_final: bool
    t_ms: float


async def stream_recognize(
    settings: Settings,
    pcm_queue: asyncio.Queue[bytes],
    boost_phrases: list[str] | None = None,
) -> AsyncIterator[TranscriptEvent]:
    """Yield interim + final transcripts.

    TODO(Phase 1): implement using google-cloud-speech v2 async streaming.
    The verification prototype `interpretation/verification/test_stt.py`
    has a working blocking version that can be adapted to async.

    Pseudo-code:
      client = SpeechAsyncClient()
      config = build_recognition_config(settings, boost_phrases)
      requests = pcm_to_requests(pcm_queue, config)
      async for resp in client.streaming_recognize(requests=requests):
          for r in resp.results:
              if not r.alternatives:
                  continue
              yield TranscriptEvent(
                  text=r.alternatives[0].transcript,
                  is_final=r.is_final,
                  t_ms=monotonic_ms(),
              )
    """
    raise NotImplementedError("Phase 1: implement Speech-to-Text V2 async streaming")
    if False:  # pragma: no cover  - help type checker infer return type
        yield TranscriptEvent(text="", is_final=False, t_ms=0.0)
