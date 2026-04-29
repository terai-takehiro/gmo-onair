"""Per-language output WebSocket (Phase 1 stub).

vMix opens HTTPS GET /stream/{session_id}/{lang} → returns the overlay HTML.
The overlay HTML opens WSS /ws/output/{session_id}/{lang} for live frames.

Frame types (JSON):
  {"type": "transcript_translation", "text": "...", "seq": N, "t_ms": ...}
  {"type": "audio_chunk", "mp3_b64": "...", "seq": N}
  {"type": "heartbeat"}
"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.languages import load_languages

router = APIRouter()
log = structlog.get_logger(__name__)


@router.get("/stream/{session_id}/{lang}", response_class=HTMLResponse)
async def get_overlay(session_id: str, lang: str, mode: str = "both") -> HTMLResponse:
    """Return the transparent vMix overlay HTML."""
    languages = load_languages()
    if lang not in languages:
        raise HTTPException(status_code=404, detail=f"unsupported language: {lang}")
    if mode not in {"text", "audio", "both"}:
        raise HTTPException(status_code=400, detail="mode must be text|audio|both")

    spec = languages[lang]
    # TODO(Phase 1): render real Jinja2 template (templates/overlay.html.j2).
    html = f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8" />
  <title>Interpretation overlay</title>
  <style>
    html, body {{ margin: 0; padding: 0; background: rgba(0,0,0,0); }}
    body {{ font-family: {spec.font_family}; }}
    .subtitle-stage {{ position: fixed; bottom: 6vh; left: 50%; transform: translateX(-50%);
                       max-width: 80vw; text-align: center; color: white;
                       text-shadow: 0 0 6px black, 0 0 6px black; font-size: 4vh;
                       line-height: 1.3; }}
  </style>
</head>
<body>
  <div class="subtitle-stage" data-session="{session_id}" data-lang="{lang}" data-mode="{mode}">
    (waiting for stream)
  </div>
  <!-- TODO: bundle the real overlay JS that opens /ws/output/{session_id}/{lang} -->
</body>
</html>
"""
    return HTMLResponse(html)


@router.websocket("/ws/output/{session_id}/{lang}")
async def output_ws(websocket: WebSocket, session_id: str, lang: str) -> None:
    await websocket.accept()
    log.info("output_ws.connect", session_id=session_id, lang=lang)
    try:
        # TODO(Phase 1): subscribe to Redis Pub/Sub channel
        #   stream:{session_id}:{lang}
        # and forward translation + audio frames.
        while True:
            await websocket.send_json({"type": "heartbeat"})
            await _sleep_seconds(5)
    except WebSocketDisconnect:
        pass
    finally:
        log.info("output_ws.disconnect", session_id=session_id, lang=lang)


async def _sleep_seconds(s: float) -> None:
    import asyncio

    await asyncio.sleep(s)
