"""Per-session usage + cost tracking.

Rates are USD list prices captured at the start of Phase 0 (REQUIREMENTS §11).
They drift over time — keep them here, surfaced to env so ops can override
without a redeploy.

Tracked metrics:
  - STT: seconds of audio consumed (we feed real-time so chunks * 100ms)
  - Translate: input + output tokens reported by Gemini usage_metadata
  - TTS: characters synthesized

A CostTracker is created per session, mutated by the pipeline tasks (atomic
counters under asyncio so single-loop races are not an issue), and finalized
into a SessionCostSummary on session end.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal

from app.models.schemas import SessionCost, SessionCostSummary

ServiceCode = Literal["stt", "translate", "tts", "infra"]


@dataclass(frozen=True)
class CostRates:
    stt_chirp3_per_minute_usd: float = 0.024
    gemini_flash_input_per_mtok_usd: float = 0.075
    gemini_flash_output_per_mtok_usd: float = 0.30
    tts_chirp3hd_per_char_usd: float = 0.000016
    usd_to_jpy: float = 150.0

    @classmethod
    def from_env(cls) -> "CostRates":
        def _f(key: str, default: float) -> float:
            try:
                return float(os.environ.get(key, default))
            except ValueError:
                return default

        return cls(
            stt_chirp3_per_minute_usd=_f("RATE_STT_CHIRP3_PER_MINUTE_USD", 0.024),
            gemini_flash_input_per_mtok_usd=_f("RATE_GEMINI_FLASH_INPUT_PER_MTOK_USD", 0.075),
            gemini_flash_output_per_mtok_usd=_f("RATE_GEMINI_FLASH_OUTPUT_PER_MTOK_USD", 0.30),
            tts_chirp3hd_per_char_usd=_f("RATE_TTS_CHIRP3HD_PER_CHAR_USD", 0.000016),
            usd_to_jpy=_f("RATE_USD_TO_JPY", 150.0),
        )


@dataclass
class CostTracker:
    rates: CostRates = field(default_factory=CostRates.from_env)
    stt_seconds: float = 0.0
    gemini_input_tokens: int = 0
    gemini_output_tokens: int = 0
    tts_characters: int = 0

    def record_audio_chunk(self, ms: float) -> None:
        self.stt_seconds += ms / 1000.0

    def record_translate(self, input_tokens: int, output_tokens: int) -> None:
        self.gemini_input_tokens += max(0, input_tokens)
        self.gemini_output_tokens += max(0, output_tokens)

    def record_tts(self, characters: int) -> None:
        self.tts_characters += max(0, characters)

    # --- finalization ---

    def _to_jpy(self, usd: float) -> float:
        return round(usd * self.rates.usd_to_jpy, 2)

    def to_summary(self, session_id) -> SessionCostSummary:
        stt_minutes = self.stt_seconds / 60.0
        stt_usd = stt_minutes * self.rates.stt_chirp3_per_minute_usd
        translate_usd = (
            self.gemini_input_tokens / 1_000_000.0 * self.rates.gemini_flash_input_per_mtok_usd
            + self.gemini_output_tokens / 1_000_000.0 * self.rates.gemini_flash_output_per_mtok_usd
        )
        tts_usd = self.tts_characters * self.rates.tts_chirp3hd_per_char_usd

        breakdown: list[SessionCost] = [
            SessionCost(
                service="stt",
                units=round(stt_minutes, 4),
                unit_label="minutes",
                amount_jpy=self._to_jpy(stt_usd),
            ),
            SessionCost(
                service="translate",
                units=float(self.gemini_input_tokens + self.gemini_output_tokens),
                unit_label="tokens",
                amount_jpy=self._to_jpy(translate_usd),
            ),
            SessionCost(
                service="tts",
                units=float(self.tts_characters),
                unit_label="characters",
                amount_jpy=self._to_jpy(tts_usd),
            ),
        ]
        total_jpy = round(sum(b.amount_jpy for b in breakdown), 2)
        return SessionCostSummary(
            session_id=session_id, total_jpy=total_jpy, breakdown=breakdown
        )
