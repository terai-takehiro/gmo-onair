"""Glossary preset REST endpoints (Cloud SQL backed)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, current_user
from app.db import models as m
from app.db.session import get_db
from app.models.schemas import GlossaryEntry, GlossaryPreset, GlossaryPresetCreate

router = APIRouter(prefix="/glossaries", tags=["glossaries"])

DBDep = Annotated[AsyncSession, Depends(get_db)]
UserDep = Annotated[CurrentUser, Depends(current_user)]


def _to_public(g: m.GlossaryPreset) -> GlossaryPreset:
    return GlossaryPreset(
        id=g.id,
        name=g.name,
        entries=[GlossaryEntry.model_validate(e) for e in g.entries],
        updated_at=g.updated_at,
    )


@router.get("", response_model=list[GlossaryPreset])
async def list_glossaries(db: DBDep, user: UserDep) -> list[GlossaryPreset]:
    rows = (
        await db.execute(
            select(m.GlossaryPreset).order_by(m.GlossaryPreset.updated_at.desc())
        )
    ).scalars()
    return [_to_public(g) for g in rows]


@router.post("", response_model=GlossaryPreset, status_code=201)
async def create_glossary(payload: GlossaryPresetCreate, db: DBDep, user: UserDep) -> GlossaryPreset:
    g = m.GlossaryPreset(
        name=payload.name,
        entries=[e.model_dump() for e in payload.entries],
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _to_public(g)


@router.get("/{glossary_id}", response_model=GlossaryPreset)
async def get_glossary(glossary_id: UUID, db: DBDep, user: UserDep) -> GlossaryPreset:
    g = await db.get(m.GlossaryPreset, glossary_id)
    if not g:
        raise HTTPException(status_code=404, detail="glossary not found")
    return _to_public(g)


@router.put("/{glossary_id}", response_model=GlossaryPreset)
async def update_glossary(
    glossary_id: UUID, payload: GlossaryPresetCreate, db: DBDep
) -> GlossaryPreset:
    g = await db.get(m.GlossaryPreset, glossary_id)
    if not g:
        raise HTTPException(status_code=404, detail="glossary not found")
    g.name = payload.name
    g.entries = [e.model_dump() for e in payload.entries]
    await db.commit()
    await db.refresh(g)
    return _to_public(g)


@router.delete("/{glossary_id}", status_code=204)
async def delete_glossary(glossary_id: UUID, db: DBDep, user: UserDep) -> None:
    g = await db.get(m.GlossaryPreset, glossary_id)
    if g:
        await db.delete(g)
        await db.commit()
