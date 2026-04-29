"""Vertex AI Gemini translation fanout (Phase 1 stub).

Per source utterance, spawns N parallel async tasks (one per target lang).
Each task streams Gemini tokens and yields delta + final text events.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator

from app.config import Settings


SYSTEM_PROMPT_TEMPLATE = """\
You are a professional simultaneous interpreter for live press conferences.

Translate the user's Japanese input into {target_lang_name} ({target_lang_code}).

Rules:
- Output ONLY the translation. No quotes, no commentary, no explanations.
- Match the formality level of a public corporate keynote.
- Keep sentences short enough to fit two {max_chars}-character subtitle lines.
- Apply the following fixed-term dictionary EXACTLY when those terms appear:
{glossary_block}
"""


@dataclass(frozen=True)
class TranslationEvent:
    lang: str
    text_delta: str
    is_final: bool
    seq: int
    t_ms: float


async def translate_one(
    settings: Settings,
    src_text: str,
    target_lang: str,
    glossary_pairs: list[tuple[str, str]],
    seq: int,
) -> AsyncIterator[TranslationEvent]:
    """Stream Gemini translation for one (src_text, target_lang).

    TODO(Phase 1): implement with google-genai async client.
    Reference: interpretation/verification/test_translate.py
    """
    raise NotImplementedError("Phase 1: implement Gemini async streaming translation")
    if False:  # pragma: no cover
        yield TranslationEvent(
            lang=target_lang, text_delta="", is_final=False, seq=seq, t_ms=0.0
        )


async def fanout_translate(
    settings: Settings,
    src_text: str,
    target_languages: list[str],
    glossary_by_lang: dict[str, list[tuple[str, str]]],
    seq: int,
) -> AsyncIterator[TranslationEvent]:
    """Run translation tasks concurrently and yield events as they arrive.

    Implementation note: use asyncio.Queue + per-lang producers so that one
    slow language does not block others. Errors in one language must NOT
    propagate to other languages (REQUIREMENTS.md §4.3).
    """
    raise NotImplementedError("Phase 2: implement multi-language fanout")
    if False:  # pragma: no cover
        yield TranslationEvent(
            lang="", text_delta="", is_final=False, seq=seq, t_ms=0.0
        )
