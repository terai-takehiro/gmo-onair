"""Operator -> backend audio ingress WebSocket (Phase 1 stub).

Frontend opens:
  WSS /ws/operator/{session_id}?token=<jwt>

Binary frames: 16-bit PCM, 16kHz mono, 100ms chunks.
JSON control frames (TODO): start/stop, language toggles, glossary swap.

Backend: forwards audio to STT pipeline (pipeline/orchestrator.py).
"""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
log = structlog.get_logger(__name__)


@router.websocket("/ws/operator/{session_id}")
async def operator_ws(websocket: WebSocket, session_id: UUID) -> None:
    await websocket.accept()
    log.info("operator_ws.connect", session_id=str(session_id))

    chunks_received = 0
    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                chunks_received += 1
                # TODO(Phase 1): forward to pipeline.orchestrator.SessionPipeline
                # await orchestrator.feed_audio(session_id, data)
                continue
            if (text := msg.get("text")) is not None:
                # TODO: handle JSON control frames
                log.debug("operator_ws.control", session_id=str(session_id), payload=text)
    except WebSocketDisconnect:
        pass
    finally:
        log.info(
            "operator_ws.disconnect",
            session_id=str(session_id),
            chunks_received=chunks_received,
        )
