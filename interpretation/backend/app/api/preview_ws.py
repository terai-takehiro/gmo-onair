"""Operator preview WebSocket.

WSS /ws/operator-preview/{session_id}?token=<jwt>

Subscribes to `preview:{session_id}` Redis Pub/Sub and forwards:
  - {"type": "transcript",   "text": str, "is_final": bool, "t_ms": float}
  - {"type": "translation",  "lang": str, "text": str, "is_final": bool, ...}
  - {"type": "session_end"}

Audio chunks are NOT forwarded here (they go to /ws/output/{sid}/{lang} for
vMix). Heartbeats every 5 s keep the connection alive.
"""

from __future__ import annotations

import asyncio
from uuid import UUID

import structlog
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.auth import decode_token
from app.pipeline.pubsub import preview_channel_for

router = APIRouter()
log = structlog.get_logger(__name__)


@router.websocket("/ws/operator-preview/{session_id}")
async def operator_preview_ws(
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

    await websocket.accept()
    log.info(
        "preview_ws.connect", session_id=str(session_id), user_id=str(user.id)
    )

    broker = websocket.app.state.pubsub
    channel = preview_channel_for(str(session_id))

    sub_task: asyncio.Task[None] | None = None
    hb_task: asyncio.Task[None] | None = None

    async def forward() -> None:
        async for raw in broker.subscribe(channel):
            try:
                await websocket.send_text(raw.decode("utf-8"))
            except Exception:
                return

    async def heartbeat() -> None:
        while True:
            try:
                await websocket.send_json({"type": "heartbeat"})
            except Exception:
                return
            await asyncio.sleep(5)

    try:
        sub_task = asyncio.create_task(forward())
        hb_task = asyncio.create_task(heartbeat())
        _, pending = await asyncio.wait(
            {sub_task, hb_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for t in pending:
            t.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        for t in (sub_task, hb_task):
            if t and not t.done():
                t.cancel()
        log.info("preview_ws.disconnect", session_id=str(session_id))
