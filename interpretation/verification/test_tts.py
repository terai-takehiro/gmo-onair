"""Compare Chirp 3 HD vs Gemini Flash TTS quality + TTFA.

Phase 0 verification #4 (REQUIREMENTS.md §10).

- Synthesizes the same text with multiple voices.
- Writes MP3 files to out/ for subjective listening.
- Records time-to-first-audio (streaming) where supported, otherwise wall time.

Usage:
  python test_tts.py --text "Hello, this is a test." --lang en --voices chirp3,gemini
  python test_tts.py --text "สวัสดีค่ะ ทดสอบการอ่านข้อความ" --lang th
  python test_tts.py --text "Xin chào, đây là bản kiểm thử." --lang vi
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from google.cloud import texttospeech_v1 as tts

from common import out_dir


# Default voice mapping per language. Adjust as Phase 0 progresses.
CHIRP3_VOICE = {
    "en": "en-US-Chirp3-HD-Aoede",
    "th": "th-TH-Chirp3-HD-Aoede",
    "vi": "vi-VN-Chirp3-HD-Aoede",
    "ja": "ja-JP-Chirp3-HD-Aoede",
    "ko": "ko-KR-Chirp3-HD-Aoede",
    "zh-CN": "cmn-CN-Chirp3-HD-Aoede",
    "zh-TW": "cmn-TW-Chirp3-HD-Aoede",
}

LANG_LOCALE = {
    "en": "en-US",
    "th": "th-TH",
    "vi": "vi-VN",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh-CN": "cmn-CN",
    "zh-TW": "cmn-TW",
}


def synth_chirp3(text: str, lang: str) -> tuple[bytes, float]:
    """Synthesize via Chirp 3 HD (non-streaming)."""
    client = tts.TextToSpeechClient()
    input_text = tts.SynthesisInput(text=text)
    voice = tts.VoiceSelectionParams(
        language_code=LANG_LOCALE[lang],
        name=CHIRP3_VOICE[lang],
    )
    audio_config = tts.AudioConfig(
        audio_encoding=tts.AudioEncoding.MP3,
        sample_rate_hertz=24000,
    )

    t0 = time.perf_counter()
    response = client.synthesize_speech(
        input=input_text, voice=voice, audio_config=audio_config
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return response.audio_content, elapsed_ms


def synth_chirp3_streaming(text: str, lang: str) -> tuple[bytes, float]:
    """Streaming TTS — measures time-to-first-audio."""
    client = tts.TextToSpeechClient()

    streaming_config = tts.StreamingSynthesizeConfig(
        voice=tts.VoiceSelectionParams(
            language_code=LANG_LOCALE[lang],
            name=CHIRP3_VOICE[lang],
        ),
    )

    def request_iter():
        yield tts.StreamingSynthesizeRequest(streaming_config=streaming_config)
        yield tts.StreamingSynthesizeRequest(input=tts.StreamingSynthesisInput(text=text))

    t0 = time.perf_counter()
    first_audio_ms: float | None = None
    audio_chunks: list[bytes] = []

    try:
        for resp in client.streaming_synthesize(request_iter()):
            if resp.audio_content:
                if first_audio_ms is None:
                    first_audio_ms = (time.perf_counter() - t0) * 1000
                audio_chunks.append(resp.audio_content)
    except Exception as e:
        print(f"[tts] streaming not supported for {lang} / {CHIRP3_VOICE[lang]}: {e}")
        return synth_chirp3(text, lang)

    total = (time.perf_counter() - t0) * 1000
    print(f"[tts] streaming first_audio_ms={first_audio_ms:.0f} total_ms={total:.0f}")
    return b"".join(audio_chunks), first_audio_ms or total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--lang", required=True, choices=list(LANG_LOCALE))
    ap.add_argument(
        "--voices",
        default="chirp3,chirp3_streaming",
        help="Comma-separated: chirp3,chirp3_streaming (gemini support pending)",
    )
    args = ap.parse_args()

    voices = [v.strip() for v in args.voices.split(",") if v.strip()]
    summary: list[dict] = []

    for v in voices:
        if v == "chirp3":
            audio, elapsed = synth_chirp3(args.text, args.lang)
            ttfa = elapsed
        elif v == "chirp3_streaming":
            audio, ttfa = synth_chirp3_streaming(args.text, args.lang)
            elapsed = ttfa
        else:
            print(f"[tts] unknown voice: {v}, skipping")
            continue

        out = out_dir() / f"tts_{args.lang}_{v}.mp3"
        out.write_bytes(audio)
        size_kb = round(len(audio) / 1024, 1)
        print(f"[tts] {v}: {ttfa:.0f} ms, {size_kb} KB -> {out}")
        summary.append({"voice": v, "lang": args.lang, "ttfa_ms": round(ttfa, 1), "bytes": len(audio)})

    (out_dir() / f"tts_{args.lang}_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
