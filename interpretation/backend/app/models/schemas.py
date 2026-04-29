"""Pydantic request / response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


# ---------- Glossary ----------


# ---------- Auth ----------


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


class UserPublic(BaseModel):
    id: UUID
    email: str
    display_name: str | None = None
    role: Literal["admin", "operator"]


# ---------- Glossary ----------


class GlossaryEntry(BaseModel):
    source_ja: str
    translations: dict[str, str] = Field(default_factory=dict)
    category: Literal["company", "product", "person", "term"] = "term"


class GlossaryPreset(BaseModel):
    id: UUID | None = None
    name: str
    entries: list[GlossaryEntry] = Field(default_factory=list)
    updated_at: datetime | None = None


class GlossaryPresetCreate(BaseModel):
    name: str
    entries: list[GlossaryEntry] = Field(default_factory=list)


# ---------- Session ----------


class SessionCreate(BaseModel):
    target_languages: list[str] = Field(min_length=1, max_length=10)
    glossary_preset_id: UUID | None = None
    note: str | None = None


class SessionPublic(BaseModel):
    id: UUID
    operator_user_id: UUID
    target_languages: list[str]
    glossary_preset_id: UUID | None
    started_at: datetime
    ended_at: datetime | None
    status: Literal["live", "ended", "aborted"]


class SessionURLs(BaseModel):
    session_id: UUID
    operator_url: str
    output_urls: dict[str, str]  # {lang: https URL}


# ---------- Cost ----------


class SessionCost(BaseModel):
    service: Literal["stt", "translate", "tts", "infra"]
    units: float
    unit_label: str  # "minutes", "characters", "tokens"
    amount_jpy: float


class SessionCostSummary(BaseModel):
    session_id: UUID
    total_jpy: float
    breakdown: list[SessionCost]


# ---------- WebSocket frames ----------


class WSTranscript(BaseModel):
    """Operator-side preview frame."""

    type: Literal["transcript"] = "transcript"
    text: str
    is_final: bool
    t_ms: float


class WSTranslation(BaseModel):
    """Per-language preview frame."""

    type: Literal["translation"] = "translation"
    lang: str
    text: str
    seq: int
    t_ms: float


class WSCost(BaseModel):
    type: Literal["cost"] = "cost"
    total_jpy: float
    breakdown: list[SessionCost]


class WSError(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str
