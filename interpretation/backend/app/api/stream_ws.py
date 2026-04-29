"""Operator -> backend audio ingress WebSocket.

Frontend opens:
  WSS /ws/operator/{session_id}

Binary frames: 16-bit PCM, 16kHz mono, 100ms chunks (1600 samples = 3200 B).
Frames are forwarded to the per-session orchestrator pipeline.
"""

from __future__ import annotations

from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import decode_token

router = APIRouter()
log = structlog.get_logger(__name__)


@router.websocket("/ws/operator/{session_id}")
async def operator_ws(
    websocket: WebSocket, session_id: UUID, token: str | None = None
) -> None:
    settings = websocket.app.state.settings
    if not token:
        await websocket.close(code=4401, reason="missing token")
        return
    try:
        user = decode_token(token, settings)
    except HTTPException:
        await websocket.close(code=4401, reason="invalid token")
        return

    orchestrator = websocket.app.state.orchestrator
    if orchestrator.get(session_id) is None:
        # Session must be created via POST /api/v1/sessions first.
        await websocket.close(code=4404, reason="session not started")
        return

    await websocket.accept()
    log.info(
        "operator_ws.connect",
        session_id=str(session_id),
        user_id=str(user.id),
    )

    chunks_received = 0
    try:
        while True:
            msg = await websocket.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if (data := msg.get("bytes")) is not None:
                chunks_received += 1
                await orchestrator.feed_audio(session_id, data)
                continue
            if msg.get("text") is not None:
                # Reserved for control messages (start/stop, glossary swap).
                pass
    except WebSocketDisconnect:
        pass
    finally:
        log.info(
            "operator_ws.disconnect",
            session_id=str(session_id),
            chunks_received=chunks_received,
        )
