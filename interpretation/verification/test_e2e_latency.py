"""End-to-end latency measurement: STT -> Gemini translation -> TTS.

Phase 0 verification #5 (REQUIREMENTS.md §10).

Pipeline:
  1. Stream a wav file (16kHz mono PCM) into Speech-to-Text V2 Chirp 3.
  2. On each `is_final` transcript, fire a streaming Gemini translation.
  3. On Gemini first-token, fire a TTS streaming synthesis.
  4. Record cumulative latency: audio-in -> translation first token -> first
     audio frame.

The script does NOT play audio; it measures and writes a CSV of per-utterance
latency budget breakdowns to out/.

Usage:
  python test_e2e_latency.py samples/keynote_30s.wav --target-lang en \
    --glossary sample_glossary.json
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import time
import wave
from pathlib import Path
from typing import Iterator

from google import genai
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech
from google.genai import types as genai_types

from common import (
    Config,
    glossary_boost_phrases_ja,
    glossary_translation_pairs,
    load_glossary,
    out_dir,
)
from test_translate import LANG_NAME, SYSTEM_PROMPT_TEMPLATE, _build_glossary_block

CHUNK_MS = 100
SAMPLE_RATE = 16000


def _audio_chunks(path: Path) -> Iterator[bytes]:
    with wave.open(str(path), "rb") as w:
        frames_per_chunk = SAMPLE_RATE * CHUNK_MS // 1000
        while True:
            data = w.readframes(frames_per_chunk)
            if not data:
                break
            yield data


def _stt_requests(
    cfg: Config, audio: Path, boost_phrases: list[str]
) -> Iterator[cloud_speech.StreamingRecognizeRequest]:
    rc = cloud_speech.RecognitionConfig(
        explicit_decoding_config=cloud_speech.ExplicitDecodingConfig(
            encoding=cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            audio_channel_count=1,
        ),
        language_codes=[cfg.stt_language],
        model=cfg.stt_model,
    )
    if boost_phrases:
        rc.adaptation = cloud_speech.SpeechAdaptation(
            phrase_sets=[
                cloud_speech.SpeechAdaptation.AdaptationPhraseSet(
                    inline_phrase_set=cloud_speech.PhraseSet(
                        phrases=[
                            cloud_speech.PhraseSet.Phrase(value=p, boost=15.0)
                            for p in boost_phrases
                        ]
                    )
                )
            ]
        )

    yield cloud_speech.StreamingRecognizeRequest(
        recognizer=f"projects/{cfg.project_id}/locations/{cfg.stt_region}/recognizers/_",
        streaming_config=cloud_speech.StreamingRecognitionConfig(
            config=rc,
            streaming_features=cloud_speech.StreamingRecognitionFeatures(
                interim_results=True,
            ),
        ),
    )

    for chunk in _audio_chunks(audio):
        yield cloud_speech.StreamingRecognizeRequest(audio=chunk)
        time.sleep(CHUNK_MS / 1000.0)


async def translate_first_token(
    client: genai.Client, cfg: Config, system_prompt: str, src: str
) -> tuple[float, str]:
    t0 = time.perf_counter()
    first_ms: float | None = None
    parts: list[str] = []
    stream = await client.aio.models.generate_content_stream(
        model=cfg.gemini_model,
        contents=src,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.2,
            max_output_tokens=512,
        ),
    )
    async for chunk in stream:
        if chunk.text:
            if first_ms is None:
                first_ms = (time.perf_counter() - t0) * 1000
            parts.append(chunk.text)
    return first_ms or -1.0, "".join(parts).strip()


def tts_first_audio(text: str, lang: str) -> float:
    """Run TTS streaming and return time-to-first-audio in ms."""
    from test_tts import synth_chirp3_streaming

    t0 = time.perf_counter()
    _, ttfa = synth_chirp3_streaming(text, lang)
    return ttfa  # already ms relative to synth_chirp3_streaming start


async def run(args: argparse.Namespace) -> int:
    cfg = Config.from_env()

    glossary = load_glossary(args.glossary) if args.glossary else None
    boost = glossary_boost_phrases_ja(glossary) if glossary else []
    pairs = glossary_translation_pairs(glossary, args.target_lang) if glossary else []

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        target_lang_name=LANG_NAME.get(args.target_lang, args.target_lang),
        target_lang_code=args.target_lang,
        glossary_block=_build_glossary_block(pairs),
    )

    stt_client = SpeechClient()
    gemini_client = genai.Client(
        vertexai=True, project=cfg.project_id, location=cfg.vertex_region
    )

    rows: list[dict] = []
    t_run_start = time.perf_counter()
    pending_finals: list[tuple[float, str]] = []  # (audio_t_ms, text)

    print("[e2e] streaming audio...")
    for resp in stt_client.streaming_recognize(
        requests=_stt_requests(cfg, args.audio, boost)
    ):
        for r in resp.results:
            if not r.alternatives:
                continue
            text = r.alternatives[0].transcript
            if r.is_final and text.strip():
                t_audio = (time.perf_counter() - t_run_start) * 1000
                pending_finals.append((t_audio, text))
                print(f"[e2e] is_final @ {t_audio:.0f} ms: {text!r}")

    print(f"[e2e] STT done. {len(pending_finals)} final segments. Translating + TTS...")

    for idx, (t_audio, text) in enumerate(pending_finals):
        t_trans_start = time.perf_counter()
        first_token_ms, translated = await translate_first_token(
            gemini_client, cfg, system_prompt, text
        )
        t_translate_end = time.perf_counter()
        translate_total_ms = (t_translate_end - t_trans_start) * 1000

        try:
            ttfa_ms = tts_first_audio(translated, args.target_lang)
        except Exception as e:
            print(f"[e2e] TTS error: {e}")
            ttfa_ms = -1.0

        e2e_first_audio_ms = first_token_ms + ttfa_ms
        rows.append(
            {
                "segment": idx,
                "src_text": text,
                "translation": translated,
                "stt_audio_t_ms": round(t_audio, 1),
                "translate_first_token_ms": round(first_token_ms, 1),
                "translate_total_ms": round(translate_total_ms, 1),
                "tts_ttfa_ms": round(ttfa_ms, 1),
                "e2e_after_isfinal_ms": round(e2e_first_audio_ms, 1),
            }
        )
        print(
            f"[e2e] seg{idx}: trans_first_token={first_token_ms:.0f} "
            f"tts_ttfa={ttfa_ms:.0f} e2e_after_isfinal={e2e_first_audio_ms:.0f} ms"
        )

    out_csv = out_dir() / f"e2e_{args.audio.stem}_{args.target_lang}.csv"
    if rows:
        with out_csv.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"[e2e] wrote {out_csv}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", type=Path)
    ap.add_argument("--target-lang", default="en")
    ap.add_argument("--glossary", default=None)
    args = ap.parse_args()
    return asyncio.run(run(args))


if __name__ == "__main__":
    raise SystemExit(main())
