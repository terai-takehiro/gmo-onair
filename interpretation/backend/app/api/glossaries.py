"""Glossary preset REST endpoints (Phase 1 stub)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException

from app.models.schemas import GlossaryPreset, GlossaryPresetCreate

router = APIRouter(prefix="/glossaries", tags=["glossaries"])

_GLOSSARIES: dict[UUID, GlossaryPreset] = {}


@router.get("", response_model=list[GlossaryPreset])
async def list_glossaries() -> list[GlossaryPreset]:
    return list(_GLOSSARIES.values())


@router.post("", response_model=GlossaryPreset, status_code=201)
async def create_glossary(payload: GlossaryPresetCreate) -> GlossaryPreset:
    new_id = uuid4()
    preset = GlossaryPreset(
        id=new_id,
        name=payload.name,
        entries=payload.entries,
        updated_at=datetime.now(UTC),
    )
    _GLOSSARIES[new_id] = preset
    return preset


@router.get("/{glossary_id}", response_model=GlossaryPreset)
async def get_glossary(glossary_id: UUID) -> GlossaryPreset:
    g = _GLOSSARIES.get(glossary_id)
    if not g:
        raise HTTPException(status_code=404, detail="glossary not found")
    return g


@router.put("/{glossary_id}", response_model=GlossaryPreset)
async def update_glossary(
    glossary_id: UUID, payload: GlossaryPresetCreate
) -> GlossaryPreset:
    if glossary_id not in _GLOSSARIES:
        raise HTTPException(status_code=404, detail="glossary not found")
    updated = GlossaryPreset(
        id=glossary_id,
        name=payload.name,
        entries=payload.entries,
        updated_at=datetime.now(UTC),
    )
    _GLOSSARIES[glossary_id] = updated
    return updated


@router.delete("/{glossary_id}", status_code=204)
async def delete_glossary(glossary_id: UUID) -> None:
    if glossary_id in _GLOSSARIES:
        del _GLOSSARIES[glossary_id]
