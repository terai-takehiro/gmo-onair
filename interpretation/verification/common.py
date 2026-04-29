"""Shared helpers for Phase 0 verification scripts."""

from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    project_id: str
    region: str
    vertex_region: str
    gemini_model: str
    stt_region: str
    stt_recognizer_id: str
    stt_model: str
    stt_language: str
    tts_region: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            project_id=_required("GCP_PROJECT_ID"),
            region=os.getenv("GCP_REGION", "asia-northeast1"),
            vertex_region=os.getenv("VERTEX_AI_REGION", "asia-northeast1"),
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            stt_region=os.getenv("STT_REGION", "asia-northeast1"),
            stt_recognizer_id=os.getenv("STT_RECOGNIZER_ID", "interp-jp-default"),
            stt_model=os.getenv("STT_MODEL", "chirp_3"),
            stt_language=os.getenv("STT_LANGUAGE", "ja-JP"),
            tts_region=os.getenv("TTS_REGION", "global"),
        )


def _required(key: str) -> str:
    val = os.getenv(key)
    if not val:
        raise SystemExit(f"Missing required env var: {key} (see .env.example)")
    return val


@contextmanager
def timed(label: str) -> Iterator[dict]:
    """Context manager that records wall time for `label` in the yielded dict."""
    record: dict = {"label": label}
    t0 = time.perf_counter()
    try:
        yield record
    finally:
        record["elapsed_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        print(f"[timing] {label}: {record['elapsed_ms']} ms")


def out_dir() -> Path:
    p = Path(__file__).parent / "out"
    p.mkdir(exist_ok=True)
    return p


def load_glossary(path: str | os.PathLike) -> dict:
    """Load glossary JSON.

    Schema:
      {
        "preset_name": "...",
        "entries": [
          {"source_ja": "...", "translations": {"en": "...", "th": "..."}, "category": "..."}
        ]
      }
    """
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if "entries" not in data:
        raise ValueError(f"glossary missing 'entries': {path}")
    return data


def glossary_boost_phrases_ja(glossary: dict) -> list[str]:
    """Extract Japanese source terms for STT Speech Adaptation boost phrases."""
    return [e["source_ja"] for e in glossary.get("entries", []) if "source_ja" in e]


def glossary_translation_pairs(glossary: dict, lang: str) -> list[tuple[str, str]]:
    """Return [(source_ja, target)] pairs for the given target language code."""
    pairs: list[tuple[str, str]] = []
    for e in glossary.get("entries", []):
        translations = e.get("translations", {})
        if lang in translations:
            pairs.append((e["source_ja"], translations[lang]))
    return pairs
