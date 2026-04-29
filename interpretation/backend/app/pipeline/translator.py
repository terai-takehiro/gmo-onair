"""Vertex AI Gemini async streaming translation.

Glossary entries are injected into the system prompt as fixed-translation
rules. Vertex caching MUST be disabled at the project level via
`scripts/disable-vertex-cache.sh` (REQUIREMENTS §6.3 / §10).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import AsyncIterator

from google import genai
from google.genai import types as genai_types

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


LANG_NAME = {
    "en": "English",
    "th": "Thai",
    "vi": "Vietnamese",
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ko": "Korean",
}


@dataclass(frozen=True)
class TranslationEvent:
    lang: str
    text_delta: str
    accumulated: str
    is_final: bool
    seq: int
    t_ms: float


def _build_glossary_block(pairs: list[tuple[str, str]]) -> str:
    if not pairs:
        return "  (none)"
    return "\n".join(f'  - "{src}" -> "{tgt}"' for src, tgt in pairs)


def build_system_prompt(
    target_lang: str, max_chars: int, glossary_pairs: list[tuple[str, str]]
) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        target_lang_name=LANG_NAME.get(target_lang, target_lang),
        target_lang_code=target_lang,
        max_chars=max_chars,
        glossary_block=_build_glossary_block(glossary_pairs),
    )


async def translate_stream(
    settings: Settings,
    src_text: str,
    target_lang: str,
    system_prompt: str,
    seq: int,
) -> AsyncIterator[TranslationEvent]:
    client = genai.Client(
        vertexai=True,
        project=settings.gcp_project_id,
        location=settings.vertex_ai_region,
    )
    t0 = time.perf_counter()
    accumulated: list[str] = []
    stream = await client.aio.models.generate_content_stream(
        model=settings.gemini_model,
        contents=src_text,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            max_output_tokens=512,
        ),
    )
    async for chunk in stream:
        delta = chunk.text or ""
        if not delta:
            continue
        accumulated.append(delta)
        yield TranslationEvent(
            lang=target_lang,
            text_delta=delta,
            accumulated="".join(accumulated),
            is_final=False,
            seq=seq,
            t_ms=(time.perf_counter() - t0) * 1000,
        )

    yield TranslationEvent(
        lang=target_lang,
        text_delta="",
        accumulated="".join(accumulated).strip(),
        is_final=True,
        seq=seq,
        t_ms=(time.perf_counter() - t0) * 1000,
    )
