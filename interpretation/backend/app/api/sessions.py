"""Session REST endpoints (Phase 1 stub).

Phase 1 implements: POST /sessions (create), GET /sessions/{id}, POST
/sessions/{id}/end. Persistence to Cloud SQL is added when the DB layer
lands in Phase 2.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Request

from app.languages import enabled_target_codes, load_languages
from app.models.schemas import SessionCreate, SessionPublic, SessionURLs

router = APIRouter(prefix="/sessions", tags=["sessions"])

# In-memory store (Phase 1 placeholder; replaced by Cloud SQL later).
_SESSIONS: dict[UUID, SessionPublic] = {}


def _validate_languages(codes: list[str]) -> list[str]:
    languages = load_languages()
    enabled = set(enabled_target_codes())
    bad = [c for c in codes if c not in languages or c not in enabled]
    if bad:
        raise HTTPException(status_code=400, detail=f"unsupported languages: {bad}")
    return codes


@router.post("", response_model=SessionURLs, status_code=201)
async def create_session(payload: SessionCreate, request: Request) -> SessionURLs:
    target_languages = _validate_languages(payload.target_languages)

    session_id = uuid4()
    operator_user_id = uuid4()  # Phase 1 placeholder until auth is wired up.
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
async def end_session(session_id: UUID) -> SessionPublic:
    sess = _SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.status != "live":
        return sess
    updated = sess.model_copy(update={"status": "ended", "ended_at": datetime.now(UTC)})
    _SESSIONS[session_id] = updated
    return updated
