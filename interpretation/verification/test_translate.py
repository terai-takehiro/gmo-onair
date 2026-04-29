"""Vertex AI Gemini 2.5 Flash translation quality + first-token latency.

Phase 0 verification #3 (REQUIREMENTS.md §10).

- Translates a Japanese source string into N target languages in parallel.
- Glossary entries are injected into the system prompt as fixed-translation
  rules so quality with/without can be A/B-compared.
- Measures first-token latency per language via streaming.

Usage:
  python test_translate.py \
    --src-text "GMOグローバルスタジオの新製品Xを発表します" \
    --target-langs en,th,vi \
    --glossary sample_glossary.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time

from google import genai
from google.genai import types as genai_types

from common import Config, glossary_translation_pairs, load_glossary, out_dir


SYSTEM_PROMPT_TEMPLATE = """\
You are a professional simultaneous interpreter for live press conferences.

Translate the user's Japanese input into {target_lang_name} ({target_lang_code}).

Rules:
- Output ONLY the translation. No quotes, no commentary, no explanations.
- Match the formality level of a public corporate keynote.
- Keep sentences short enough to fit two 60-character subtitle lines.
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


def _build_glossary_block(pairs: list[tuple[str, str]]) -> str:
    if not pairs:
        return "  (none)"
    return "\n".join(f'  - "{src}" -> "{tgt}"' for src, tgt in pairs)


async def translate_one(
    client: genai.Client,
    cfg: Config,
    src_text: str,
    lang: str,
    pairs: list[tuple[str, str]],
) -> dict:
    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        target_lang_name=LANG_NAME.get(lang, lang),
        target_lang_code=lang,
        glossary_block=_build_glossary_block(pairs),
    )

    t0 = time.perf_counter()
    first_token_ms: float | None = None
    chunks: list[str] = []

    stream = await client.aio.models.generate_content_stream(
        model=cfg.gemini_model,
        contents=src_text,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            max_output_tokens=512,
        ),
    )
    async for chunk in stream:
        if chunk.text:
            if first_token_ms is None:
                first_token_ms = (time.perf_counter() - t0) * 1000
            chunks.append(chunk.text)

    total_ms = (time.perf_counter() - t0) * 1000
    return {
        "lang": lang,
        "first_token_ms": round(first_token_ms or -1, 1),
        "total_ms": round(total_ms, 1),
        "translation": "".join(chunks).strip(),
        "glossary_pairs": len(pairs),
    }


async def run(args: argparse.Namespace) -> None:
    cfg = Config.from_env()
    target_langs = [s.strip() for s in args.target_langs.split(",") if s.strip()]

    glossary = load_glossary(args.glossary) if args.glossary else None

    client = genai.Client(
        vertexai=True,
        project=cfg.project_id,
        location=cfg.vertex_region,
    )

    tasks = []
    for lang in target_langs:
        pairs = glossary_translation_pairs(glossary, lang) if glossary else []
        tasks.append(translate_one(client, cfg, args.src_text, lang, pairs))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    output: list[dict] = []
    for r in results:
        if isinstance(r, Exception):
            print(f"[translate] error: {r!r}")
            output.append({"error": repr(r)})
        else:
            print(f"[translate] {r['lang']}: first_token={r['first_token_ms']} ms total={r['total_ms']} ms")
            print(f"           {r['translation']!r}")
            output.append(r)

    out = out_dir() / "translate_result.json"
    out.write_text(
        json.dumps(
            {"src_text": args.src_text, "results": output},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[translate] wrote {out}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-text", required=True)
    ap.add_argument("--target-langs", default="en,th,vi")
    ap.add_argument("--glossary", default=None)
    args = ap.parse_args()
    asyncio.run(run(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
