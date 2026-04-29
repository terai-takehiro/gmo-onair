"""Per-session pipeline orchestrator (Phase 1 stub).

Owns one in-memory `SessionPipeline` per active session.

Lifecycle:
  start_session  -> creates STT streamer, fanout tasks, pubsub
  feed_audio     -> pushes PCM bytes into STT input queue
  on_final_text  -> spawns translation+TTS tasks for each enabled language
  end_session    -> drains, closes, persists cost summary

Phase 1 implements `start_session` / `feed_audio` / `end_session` for a
single (ja -> en) pipeline. Phase 2 generalizes to N languages.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from uuid import UUID

import structlog

from app.languages import LanguageSpec, load_languages

log = structlog.get_logger(__name__)


@dataclass
class SessionPipeline:
    session_id: UUID
    target_languages: list[str]
    audio_queue: asyncio.Queue[bytes] = field(default_factory=asyncio.Queue)
    tasks: list[asyncio.Task[None]] = field(default_factory=list)
    closed: asyncio.Event = field(default_factory=asyncio.Event)


class Orchestrator:
    """Owns active pipelines. Singleton-style; bind to FastAPI app.state."""

    def __init__(self) -> None:
        self._pipelines: dict[UUID, SessionPipeline] = {}

    def get(self, session_id: UUID) -> SessionPipeline | None:
        return self._pipelines.get(session_id)

    async def start_session(
        self, session_id: UUID, target_languages: list[str]
    ) -> SessionPipeline:
        if session_id in self._pipelines:
            return self._pipelines[session_id]

        pipeline = SessionPipeline(
            session_id=session_id, target_languages=target_languages
        )
        self._pipelines[session_id] = pipeline

        languages: dict[str, LanguageSpec] = load_languages()
        for lang in target_languages:
            if lang not in languages:
                log.warning("orchestrator.unknown_lang", lang=lang)
                continue
            # TODO(Phase 1): spawn per-language fanout task that consumes
            # final transcripts and produces translation + TTS frames.
        log.info(
            "orchestrator.start",
            session_id=str(session_id),
            target_languages=target_languages,
        )
        return pipeline

    async def feed_audio(self, session_id: UUID, chunk: bytes) -> None:
        p = self._pipelines.get(session_id)
        if not p or p.closed.is_set():
            return
        await p.audio_queue.put(chunk)

    async def end_session(self, session_id: UUID) -> None:
        p = self._pipelines.pop(session_id, None)
        if not p:
            return
        p.closed.set()
        for t in p.tasks:
            t.cancel()
        for t in p.tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
        log.info("orchestrator.end", session_id=str(session_id))


orchestrator = Orchestrator()
