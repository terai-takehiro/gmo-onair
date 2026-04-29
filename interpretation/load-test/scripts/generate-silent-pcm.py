"""Generate a silent 16-bit mono PCM file at 16 kHz.

Used by the locust audio scenario to simulate continuous mic input without
hitting Cloud TTS / Vertex (silence still drives STT, which produces no
final transcripts so the downstream pipeline stays idle — perfect for
WS / connection-level load measurement).

Usage:
  python scripts/generate-silent-pcm.py --seconds 60 --out samples/silence_60s.pcm
"""

from __future__ import annotations

import argparse
from pathlib import Path

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2  # int16


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=60)
    ap.add_argument("--out", type=Path, default=Path("samples/silence.pcm"))
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n_bytes = args.seconds * SAMPLE_RATE * BYTES_PER_SAMPLE
    args.out.write_bytes(b"\x00" * n_bytes)
    print(f"wrote {n_bytes} bytes ({args.seconds}s, 16kHz mono) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
