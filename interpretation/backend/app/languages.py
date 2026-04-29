"""Loader for languages.yaml.

Adding a new target language is a yaml-only change (REQUIREMENTS.md §7.3).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class LanguageSpec(BaseModel):
    name: str
    locale: str
    tts_voice: str | None = None
    stt_model: str | None = None
    font_family: str = "system-ui, sans-serif"
    subtitle_max_chars_per_line: int = 60
    subtitle_max_lines: int = 2
    enabled: bool = True


@lru_cache(maxsize=1)
def load_languages() -> dict[str, LanguageSpec]:
    path = Path(__file__).parent / "languages.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    out: dict[str, LanguageSpec] = {}
    for code, spec in (raw.get("languages") or {}).items():
        out[code] = LanguageSpec(**spec)
    return out


@lru_cache(maxsize=1)
def load_source_languages() -> dict[str, LanguageSpec]:
    path = Path(__file__).parent / "languages.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    out: dict[str, LanguageSpec] = {}
    for code, spec in (raw.get("source") or {}).items():
        out[code] = LanguageSpec(**spec)
    return out


def enabled_target_codes() -> list[str]:
    return [code for code, spec in load_languages().items() if spec.enabled]
