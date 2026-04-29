"""Per-session pipeline orchestrator.

Wiring (Phase 1):

  operator WS bytes -> Orchestrator.feed_audio
  -> SessionPipeline.audio_queue
  -> stt.stream_recognize
  -> on is_final transcript -> per-language translate task
  -> translate -> publish "translation" frames to Pub/Sub
  -> on translate final -> tts.synthesize_one_shot -> publish "audio_chunk"
"""

from __future__ import annotations

import asyncio
import base64
import itertools
from dataclasses import dataclass, field
from typing import AsyncIterator
from uuid import UUID

import structlog

from app.config import Settings
from app.languages import LanguageSpec, load_languages
from app.pipeline import stt as stt_mod
from app.pipeline import translator as tr_mod
from app.pipeline import tts as tts_mod
from app.pipeline.pubsub import PubSubBroker, channel_for

log = structlog.get_logger(__name__)


@dataclass
class SessionPipeline:
    session_id: UUID
    target_languages: list[str]
    glossary_pairs_by_lang: dict[str, list[tuple[str, str]]]
    boost_phrases: list[str]
    audio_queue: asyncio.Queue[bytes | None] = field(default_factory=asyncio.Queue)
    tasks: list[asyncio.Task[None]] = field(default_factory=list)
    closed: asyncio.Event = field(default_factory=asyncio.Event)
    seq: itertools.count = field(default_factory=lambda: itertools.count(1))


class Orchestrator:
    def __init__(self, settings: Settings, broker: PubSubBroker) -> None:
        self._settings = settings
        self._broker = broker
        self._pipelines: dict[UUID, SessionPipeline] = {}

    def get(self, session_id: UUID) -> SessionPipeline | None:
        return self._pipelines.get(session_id)

    async def start_session(
        self,
        session_id: UUID,
        target_languages: list[str],
        boost_phrases: list[str] | None = None,
        glossary_pairs_by_lang: dict[str, list[tuple[str, str]]] | None = None,
    ) -> SessionPipeline:
        if session_id in self._pipelines:
            return self._pipelines[session_id]

        p = SessionPipeline(
            session_id=session_id,
            target_languages=target_languages,
            glossary_pairs_by_lang=glossary_pairs_by_lang or {},
            boost_phrases=boost_phrases or [],
        )
        self._pipelines[session_id] = p
        p.tasks.append(asyncio.create_task(self._run(p), name=f"sess:{session_id}"))
        log.info(
            "orchestrator.start",
            session_id=str(session_id),
            target_languages=target_languages,
        )
        return p

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
        await p.audio_queue.put(None)
        for lang in p.target_languages:
            await self._broker.publish_json(
                channel_for(str(session_id), lang), {"type": "session_end"}
            )
        for t in p.tasks:
            t.cancel()
        for t in p.tasks:
            try:
                await t
            except (asyncio.CancelledError, Exception) as e:
                log.debug("orchestrator.task_cancel", error=repr(e))
        log.info("orchestrator.end", session_id=str(session_id))

    async def _run(self, p: SessionPipeline) -> None:
        languages = load_languages()

        async def audio_iter() -> AsyncIterator[bytes]:
            while True:
                chunk = await p.audio_queue.get()
                if chunk is None:
                    return
                yield chunk

        try:
            async for ev in stt_mod.stream_recognize(
                self._settings, audio_iter(), p.boost_phrases
            ):
                if not ev.is_final:
                    continue
                seq = next(p.seq)
                for lang in p.target_languages:
                    spec = languages.get(lang)
                    if spec is None:
                        continue
                    asyncio.create_task(
                        self._translate_then_tts(p, spec, ev.text, seq),
                        name=f"sess:{p.session_id}:{lang}:{seq}",
                    )
        except asyncio.CancelledError:
            raise
        except Exception as e:  # log but do not crash other sessions
            log.exception("orchestrator.run_error", session_id=str(p.session_id), error=repr(e))

    async def _translate_then_tts(
        self,
        p: SessionPipeline,
        spec: LanguageSpec,
        src_text: str,
        seq: int,
    ) -> None:
        lang = spec.locale.split("-")[0]
        # Map locale-ish (e.g. "cmn") back to project lang code:
        for code, s in load_languages().items():
            if s is spec:
                lang = code
                break

        glossary = p.glossary_pairs_by_lang.get(lang, [])
        system_prompt = tr_mod.build_system_prompt(
            lang, spec.subtitle_max_chars_per_line, glossary
        )
        channel = channel_for(str(p.session_id), lang)

        try:
            final_text = ""
            async for tev in tr_mod.translate_stream(
                self._settings, src_text, lang, system_prompt, seq
            ):
                await self._broker.publish_json(
                    channel,
                    {
                        "type": "translation",
                        "lang": lang,
                        "text": tev.accumulated,
                        "is_final": tev.is_final,
                        "seq": seq,
                        "t_ms": tev.t_ms,
                    },
                )
                if tev.is_final:
                    final_text = tev.accumulated

            if final_text:
                audio = await tts_mod.synthesize_one_shot(
                    self._settings, spec, final_text, seq
                )
                await self._broker.publish_json(
                    channel,
                    {
                        "type": "audio_chunk",
                        "lang": lang,
                        "seq": seq,
                        "mp3_b64": base64.b64encode(audio.mp3_bytes).decode("ascii"),
                    },
                )
        except Exception as e:
            log.exception(
                "orchestrator.lang_error",
                session_id=str(p.session_id),
                lang=lang,
                error=repr(e),
            )
