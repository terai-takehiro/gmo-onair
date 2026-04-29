"""Per-language output endpoints.

GET /stream/{session_id}/{lang}
    Returns the transparent vMix overlay HTML rendered from
    templates/overlay.html.j2.

WS  /ws/output/{session_id}/{lang}
    Live stream of `translation` and `audio_chunk` frames produced by the
    pipeline (Phase 1 stub: heartbeat only).

Frame schema (JSON):
  {"type": "translation", "lang": "...", "text": "...", "is_final": false,
   "seq": N, "t_ms": ...}
  {"type": "audio_chunk",  "lang": "...", "seq": N, "mp3_b64": "..."}
  {"type": "heartbeat"}
  {"type": "session_end"}
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.languages import load_languages

router = APIRouter()
log = structlog.get_logger(__name__)


@router.get("/stream/{session_id}/{lang}", response_class=HTMLResponse)
async def get_overlay(
    request: Request,
    session_id: str,
    lang: str,
    mode: str = "both",
) -> HTMLResponse:
    languages = load_languages()
    if lang not in languages:
        raise HTTPException(status_code=404, detail=f"unsupported language: {lang}")
    if mode not in {"text", "audio", "both"}:
        raise HTTPException(status_code=400, detail="mode must be text|audio|both")

    spec = languages[lang]
    ws_scheme = "wss" if request.url.scheme == "https" else "ws"
    host = request.headers.get("host") or request.url.netloc
    ws_url = f"{ws_scheme}://{host}/ws/output/{session_id}/{lang}"

    templates = request.app.state.templates
    return templates.TemplateResponse(
        request,
        "overlay.html.j2",
        {
            "session_id": session_id,
            "lang_code": lang,
            "mode": mode,
            "ws_url": ws_url,
            "font_family": spec.font_family,
            "max_chars_per_line": spec.subtitle_max_chars_per_line,
        },
    )


@router.websocket("/ws/output/{session_id}/{lang}")
async def output_ws(websocket: WebSocket, session_id: str, lang: str) -> None:
    await websocket.accept()
    log.info("output_ws.connect", session_id=session_id, lang=lang)
    try:
        # TODO(Phase 1): subscribe to Redis Pub/Sub channel
        #   stream:{session_id}:{lang}
        # and forward translation + audio frames produced by the pipeline.
        while True:
            await websocket.send_json({"type": "heartbeat"})
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    finally:
        log.info("output_ws.disconnect", session_id=session_id, lang=lang)
