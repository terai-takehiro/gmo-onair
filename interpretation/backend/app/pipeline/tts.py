"""Cloud TTS streaming wrapper.

`synthesize_stream` is the canonical async generator used by the pipeline; it
yields raw audio chunks as they come back from Cloud TTS. The orchestrator
concatenates chunks and publishes ONE audio_chunk frame per segment (overlay
expects a complete MP3 buffer for `decodeAudioData`).

`synthesize_one_shot` remains as a convenience wrapper for tests and any
future single-call use.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass

from google.cloud import texttospeech_v1 as tts

from app.config import Settings
from app.languages import LanguageSpec


@dataclass(frozen=True)
class AudioChunk:
    lang: str
    seq: int
    chunk_seq: int
    mp3_bytes: bytes
    is_first: bool
    t_ms: float


@dataclass(frozen=True)
class AudioResult:
    lang: str
    seq: int
    mp3_bytes: bytes
    elapsed_ms: float
    first_audio_ms: float


def _lang_code(spec: LanguageSpec) -> str:
    return spec.locale.split("-")[0]


async def synthesize_stream(
    settings: Settings,
    lang_spec: LanguageSpec,
    text: str,
    seq: int,
) -> AsyncIterator[AudioChunk]:
    """Stream MP3 chunks from Cloud TTS streaming_synthesize.

    The blocking sync streaming RPC runs in a worker thread; chunks are
    handed to the event loop via run_coroutine_threadsafe.
    """
    queue: asyncio.Queue[bytes | BaseException | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def worker() -> None:
        client = tts.TextToSpeechClient()
        cfg = tts.StreamingSynthesizeConfig(
            voice=tts.VoiceSelectionParams(
                language_code=lang_spec.locale,
                name=lang_spec.tts_voice or "",
            ),
        )

        def reqs():
            yield tts.StreamingSynthesizeRequest(streaming_config=cfg)
            yield tts.StreamingSynthesizeRequest(
                input=tts.StreamingSynthesisInput(text=text)
            )

        try:
            for resp in client.streaming_synthesize(reqs()):
                if resp.audio_content:
                    asyncio.run_coroutine_threadsafe(
                        queue.put(resp.audio_content), loop
                    )
        except BaseException as e:  # noqa: BLE001
            asyncio.run_coroutine_threadsafe(queue.put(e), loop)
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop)

    asyncio.create_task(asyncio.to_thread(worker))

    chunk_seq = 0
    t0 = time.perf_counter()
    while True:
        item = await queue.get()
        if item is None:
            return
        if isinstance(item, BaseException):
            raise item
        chunk_seq += 1
        yield AudioChunk(
            lang=_lang_code(lang_spec),
            seq=seq,
            chunk_seq=chunk_seq,
            mp3_bytes=item,
            is_first=chunk_seq == 1,
            t_ms=(time.perf_counter() - t0) * 1000,
        )


async def synthesize_one_shot(
    settings: Settings,
    lang_spec: LanguageSpec,
    text: str,
    seq: int,
) -> AudioResult:
    """Collect every streamed chunk into one buffer."""
    pieces: list[bytes] = []
    first_ms: float | None = None
    t0 = time.perf_counter()
    async for chunk in synthesize_stream(settings, lang_spec, text, seq):
        if first_ms is None:
            first_ms = chunk.t_ms
        pieces.append(chunk.mp3_bytes)
    return AudioResult(
        lang=_lang_code(lang_spec),
        seq=seq,
        mp3_bytes=b"".join(pieces),
        elapsed_ms=(time.perf_counter() - t0) * 1000,
        first_audio_ms=first_ms or 0.0,
    )
