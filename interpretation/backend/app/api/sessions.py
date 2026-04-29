"""Session REST endpoints."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request

from app.api import glossaries as glossary_store
from app.languages import enabled_target_codes, load_languages
from app.models.schemas import (
    GlossaryEntry,
    SessionCreate,
    SessionPublic,
    SessionURLs,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

_SESSIONS: dict[UUID, SessionPublic] = {}


def _validate_languages(codes: list[str]) -> list[str]:
    languages = load_languages()
    enabled = set(enabled_target_codes())
    bad = [c for c in codes if c not in languages or c not in enabled]
    if bad:
        raise HTTPException(status_code=400, detail=f"unsupported languages: {bad}")
    return codes


def _glossary_pairs_by_lang(
    entries: list[GlossaryEntry], target_languages: list[str]
) -> dict[str, list[tuple[str, str]]]:
    out: dict[str, list[tuple[str, str]]] = {lang: [] for lang in target_languages}
    for e in entries:
        for lang in target_languages:
            tgt = e.translations.get(lang)
            if tgt:
                out[lang].append((e.source_ja, tgt))
    return out


@router.post("", response_model=SessionURLs, status_code=201)
async def create_session(payload: SessionCreate, request: Request) -> SessionURLs:
    target_languages = _validate_languages(payload.target_languages)

    glossary = (
        glossary_store._GLOSSARIES.get(payload.glossary_preset_id)
        if payload.glossary_preset_id
        else None
    )
    boost_phrases = (
        [e.source_ja for e in glossary.entries] if glossary else []
    )
    pairs_by_lang = (
        _glossary_pairs_by_lang(glossary.entries, target_languages)
        if glossary
        else {lang: [] for lang in target_languages}
    )

    session_id = uuid4()
    operator_user_id = uuid4()  # placeholder until auth is wired up.
    now = datetime.now(UTC)

    _SESSIONS[session_id] = SessionPublic(
        id=session_id,
        operator_user_id=operator_user_id,
        target_languages=target_languages,
        glossary_preset_id=payload.glossary_preset_id,
        started_at=now,
        ended_at=None,
        status="live",
    )

    orchestrator = request.app.state.orchestrator
    await orchestrator.start_session(
        session_id=session_id,
        target_languages=target_languages,
        boost_phrases=boost_phrases,
        glossary_pairs_by_lang=pairs_by_lang,
    )

    base = str(request.base_url).rstrip("/")
    output_urls = {
        lang: f"{base}/stream/{session_id}/{lang}" for lang in target_languages
    }
    return SessionURLs(
        session_id=session_id,
        operator_url=f"{base}/operator/{session_id}",
        output_urls=output_urls,
    )


@router.get("/{session_id}", response_model=SessionPublic)
async def get_session(session_id: UUID) -> SessionPublic:
    sess = _SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return sess


@router.post("/{session_id}/end", response_model=SessionPublic)
async def end_session(session_id: UUID, request: Request) -> SessionPublic:
    sess = _SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.status != "live":
        return sess

    orchestrator = request.app.state.orchestrator
    await orchestrator.end_session(session_id)

    updated = sess.model_copy(update={"status": "ended", "ended_at": datetime.now(UTC)})
    _SESSIONS[session_id] = updated
    return updated
