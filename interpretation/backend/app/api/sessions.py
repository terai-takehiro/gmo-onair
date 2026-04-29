"""Session REST endpoints (Cloud SQL backed)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, current_user
from app.db import models as m
from app.db.session import get_db
from app.languages import enabled_target_codes, load_languages
from app.models.schemas import (
    CorrectionRequest,
    GlossaryEntry,
    SessionCost,
    SessionCostSummary,
    SessionCreate,
    SessionPublic,
    SessionURLs,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

DBDep = Annotated[AsyncSession, Depends(get_db)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


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


def _to_public(s: m.Session) -> SessionPublic:
    return SessionPublic(
        id=s.id,
        operator_user_id=s.operator_user_id or s.id,  # placeholder until auth
        target_languages=list(s.target_languages),
        glossary_preset_id=s.glossary_preset_id,
        started_at=s.started_at,
        ended_at=s.ended_at,
        status=s.status,  # type: ignore[arg-type]
    )


@router.post("", response_model=SessionURLs, status_code=201)
async def create_session(
    payload: SessionCreate, request: Request, db: DBDep, user: UserDep
) -> SessionURLs:
    target_languages = _validate_languages(payload.target_languages)

    boost_phrases: list[str] = []
    pairs_by_lang: dict[str, list[tuple[str, str]]] = {l: [] for l in target_languages}
    if payload.glossary_preset_id is not None:
        gp = await db.get(m.GlossaryPreset, payload.glossary_preset_id)
        if gp is None:
            raise HTTPException(status_code=400, detail="glossary preset not found")
        entries = [GlossaryEntry.model_validate(e) for e in gp.entries]
        boost_phrases = [e.source_ja for e in entries]
        pairs_by_lang = _glossary_pairs_by_lang(entries, target_languages)

    cc_ingest_urls = {
        lang: url
        for lang, url in (payload.cc_ingest_urls or {}).items()
        if lang in target_languages
    } or None

    sess = m.Session(
        operator_user_id=user.id,
        target_languages=list(target_languages),
        glossary_preset_id=payload.glossary_preset_id,
        status="live",
        cc_ingest_urls=cc_ingest_urls,
    )
    db.add(sess)
    await db.commit()
    await db.refresh(sess)

    orchestrator = request.app.state.orchestrator
    await orchestrator.start_session(
        session_id=sess.id,
        target_languages=target_languages,
        boost_phrases=boost_phrases,
        glossary_pairs_by_lang=pairs_by_lang,
        cc_ingest_urls=cc_ingest_urls,
    )

    base = str(request.base_url).rstrip("/")
    output_urls = {
        lang: f"{base}/stream/{sess.id}/{lang}" for lang in target_languages
    }
    return SessionURLs(
        session_id=sess.id,
        operator_url=f"{base}/operator/{sess.id}",
        output_urls=output_urls,
    )


@router.get("/{session_id}", response_model=SessionPublic)
async def get_session(session_id: UUID, db: DBDep, user: UserDep) -> SessionPublic:
    sess = await db.get(m.Session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return _to_public(sess)


@router.get("", response_model=list[SessionPublic])
async def list_sessions(db: DBDep, user: UserDep) -> list[SessionPublic]:
    stmt = select(m.Session).order_by(m.Session.started_at.desc())
    if user.role != "admin":
        stmt = stmt.where(m.Session.operator_user_id == user.id)
    rows = (await db.execute(stmt)).scalars()
    return [_to_public(s) for s in rows]


@router.post("/{session_id}/end", response_model=SessionPublic)
async def end_session(
    session_id: UUID, request: Request, db: DBDep, user: UserDep
) -> SessionPublic:
    sess = await db.get(m.Session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.status != "live":
        return _to_public(sess)

    orchestrator = request.app.state.orchestrator
    tracker = await orchestrator.end_session(session_id)

    if tracker is not None:
        summary = tracker.to_summary(session_id)
        for entry in summary.breakdown:
            db.add(
                m.SessionCost(
                    session_id=session_id,
                    service=entry.service,
                    units=entry.units,
                    unit_label=entry.unit_label,
                    amount_jpy=entry.amount_jpy,
                )
            )

    sess.status = "ended"
    sess.ended_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(sess)
    return _to_public(sess)


@router.post("/{session_id}/correct", status_code=202)
async def correct_session(
    session_id: UUID,
    payload: CorrectionRequest,
    request: Request,
    db: DBDep,
    user: UserDep,
) -> dict:
    """Operator manual correction: re-publish translation + re-synthesize TTS."""
    sess = await db.get(m.Session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    if sess.status != "live":
        raise HTTPException(status_code=409, detail="session is not live")
    if payload.lang not in sess.target_languages:
        raise HTTPException(
            status_code=400, detail=f"lang {payload.lang} not in target_languages"
        )
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")

    orchestrator = request.app.state.orchestrator
    ok = await orchestrator.push_correction(
        session_id=session_id,
        lang=payload.lang,
        text=text,
        seq=payload.seq,
    )
    if not ok:
        raise HTTPException(status_code=500, detail="correction failed")
    return {"status": "accepted"}


@router.get("/{session_id}/cost", response_model=SessionCostSummary)
async def get_session_cost(
    session_id: UUID, request: Request, db: DBDep, user: UserDep
) -> SessionCostSummary:
    sess = await db.get(m.Session, session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")

    # If the session is still live, surface the in-memory tracker so the
    # operator UI can poll real-time cost (REQUIREMENTS §4.6).
    if sess.status == "live":
        orchestrator = request.app.state.orchestrator
        pipeline = orchestrator.get(session_id)
        if pipeline is not None:
            return pipeline.cost_tracker.to_summary(session_id)

    rows = (
        await db.execute(
            select(m.SessionCost).where(m.SessionCost.session_id == session_id)
        )
    ).scalars().all()
    breakdown = [
        SessionCost(
            service=r.service,  # type: ignore[arg-type]
            units=float(r.units),
            unit_label=r.unit_label,
            amount_jpy=float(r.amount_jpy),
        )
        for r in rows
    ]
    total = round(sum(b.amount_jpy for b in breakdown), 2)
    return SessionCostSummary(
        session_id=session_id, total_jpy=total, breakdown=breakdown
    )
