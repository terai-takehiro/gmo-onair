"""Speech-to-Text V2 (Chirp 3) accuracy + latency verification.

Phase 0 verification #2 (REQUIREMENTS.md §10).

- Sends a wav file (16kHz mono PCM) via streaming recognize.
- Optional Speech Adaptation: boost phrases from glossary.
- Measures first-partial latency and emits final transcript.
- Optional WER vs reference text via jiwer.

Usage:
  python test_stt.py samples/keynote_30s.wav \
    --glossary sample_glossary.json \
    --reference samples/keynote_30s.txt
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Iterator

from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech

from common import Config, glossary_boost_phrases_ja, load_glossary, out_dir, timed


CHUNK_MS = 100  # 100ms chunks
SAMPLE_RATE = 16000


def _chunks(path: Path, chunk_ms: int = CHUNK_MS) -> Iterator[bytes]:
    """Yield raw PCM bytes from a WAV header-stripped 16k mono LINEAR16 file."""
    import wave

    with wave.open(str(path), "rb") as w:
        assert w.getframerate() == SAMPLE_RATE, "expected 16kHz"
        assert w.getnchannels() == 1, "expected mono"
        assert w.getsampwidth() == 2, "expected 16-bit"

        frames_per_chunk = SAMPLE_RATE * chunk_ms // 1000
        while True:
            data = w.readframes(frames_per_chunk)
            if not data:
                break
            yield data


def _build_requests(
    cfg: Config, audio: Path, boost_phrases: list[str]
) -> Iterator[cloud_speech.StreamingRecognizeRequest]:
    recognition_config = cloud_speech.RecognitionConfig(
        explicit_decoding_config=cloud_speech.ExplicitDecodingConfig(
            encoding=cloud_speech.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            audio_channel_count=1,
        ),
        language_codes=[cfg.stt_language],
        model=cfg.stt_model,
    )
    if boost_phrases:
        recognition_config.adaptation = cloud_speech.SpeechAdaptation(
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

    streaming_config = cloud_speech.StreamingRecognitionConfig(
        config=recognition_config,
        streaming_features=cloud_speech.StreamingRecognitionFeatures(
            interim_results=True,
        ),
    )

    yield cloud_speech.StreamingRecognizeRequest(
        recognizer=(
            f"projects/{cfg.project_id}/locations/{cfg.stt_region}/recognizers/_"
        ),
        streaming_config=streaming_config,
    )

    # Pace audio at real-time so latency numbers are meaningful.
    for chunk in _chunks(audio):
        yield cloud_speech.StreamingRecognizeRequest(audio=chunk)
        time.sleep(CHUNK_MS / 1000.0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", type=Path)
    ap.add_argument("--glossary", type=Path, default=None)
    ap.add_argument("--reference", type=Path, default=None)
    args = ap.parse_args()

    cfg = Config.from_env()
    boost: list[str] = []
    if args.glossary:
        boost = glossary_boost_phrases_ja(load_glossary(args.glossary))
        print(f"[stt] boost phrases: {len(boost)}")

    client = SpeechClient()
    t_start = time.perf_counter()
    first_partial_ms: float | None = None
    final_text_parts: list[str] = []

    with timed("stt-stream") as t:
        responses = client.streaming_recognize(
            requests=_build_requests(cfg, args.audio, boost)
        )
        for resp in responses:
            for result in resp.results:
                if result.alternatives:
                    text = result.alternatives[0].transcript
                    if first_partial_ms is None and text.strip():
                        first_partial_ms = (time.perf_counter() - t_start) * 1000
                        print(f"[stt] first partial @ {first_partial_ms:.0f} ms: {text!r}")
                    if result.is_final:
                        final_text_parts.append(text)

    final_text = "".join(final_text_parts).strip()
    print(f"[stt] final: {final_text!r}")
    print(f"[stt] first_partial_ms={first_partial_ms} total_ms={t['elapsed_ms']}")

    if args.reference and args.reference.exists():
        try:
            from jiwer import wer  # type: ignore

            reference = args.reference.read_text(encoding="utf-8").strip()
            score = wer(reference, final_text)
            print(f"[stt] WER vs reference: {score:.3f}")
        except ImportError:
            print("[stt] jiwer not installed; skipping WER")

    out = out_dir() / f"stt_{args.audio.stem}.json"
    out.write_text(
        json.dumps(
            {
                "audio": str(args.audio),
                "first_partial_ms": first_partial_ms,
                "total_ms": t["elapsed_ms"],
                "final_text": final_text,
                "boost_count": len(boost),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[stt] wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
