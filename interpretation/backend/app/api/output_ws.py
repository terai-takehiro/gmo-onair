"""Per-language output endpoints.

GET /stream/{session_id}/{lang}
    Returns the transparent vMix overlay HTML.

WS  /ws/output/{session_id}/{lang}
    Subscribes to Redis Pub/Sub channel `stream:{session_id}:{lang}` and
    forwards every frame (translation / audio_chunk / session_end) to the
    overlay client. Sends `heartbeat` every 5s so vMix Chromium keeps the
    socket warm.
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from app.languages import load_languages
from app.pipeline.pubsub import channel_for

router = APIRouter()
log = structlog.get_logger(__name__)


_VALID_POS = {"top", "middle", "bottom"}


def _hex_color(value: str, default: str) -> str:
    """Validate a 3- or 6-char hex color (no `#` prefix). Falls back to default."""
    v = value.lstrip("#")
    if len(v) in {3, 6} and all(c in "0123456789abcdefABCDEF" for c in v):
        return v.lower()
    return default


@router.get("/stream/{session_id}/{lang}", response_class=HTMLResponse)
async def get_overlay(
    request: Request,
    session_id: str,
    lang: str,
    mode: str = "both",
    pos: str = "bottom",
    size: int = 100,  # font-size scale percentage (50-200)
    color: str = "ffffff",
    outline: str = "000000",
    fade: int = 4500,  # ms before subtitles fade out
) -> HTMLResponse:
    languages = load_languages()
    if lang not in languages:
        raise HTTPException(status_code=404, detail=f"unsupported language: {lang}")
    if mode not in {"text", "audio", "both"}:
        raise HTTPException(status_code=400, detail="mode must be text|audio|both")
    if pos not in _VALID_POS:
        raise HTTPException(status_code=400, detail="pos must be top|middle|bottom")

    size = max(50, min(200, size))
    fade = max(500, min(20_000, fade))
    color = _hex_color(color, "ffffff")
    outline = _hex_color(outline, "000000")

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
            "subtitle_pos": pos,
            "size_scale": size,
            "color_hex": color,
            "outline_hex": outline,
            "fade_ms": fade,
        },
    )


@router.websocket("/ws/output/{session_id}/{lang}")
async def output_ws(websocket: WebSocket, session_id: str, lang: str) -> None:
    languages = load_languages()
    if lang not in languages:
        await websocket.close(code=4404, reason="unsupported language")
        return

    await websocket.accept()
    log.info("output_ws.connect", session_id=session_id, lang=lang)

    broker = websocket.app.state.pubsub
    channel = channel_for(session_id, lang)

    sub_task: asyncio.Task[None] | None = None
    hb_task: asyncio.Task[None] | None = None

    async def forward_subscribe() -> None:
        async for raw in broker.subscribe(channel):
            try:
                # raw is bytes (we don't decode_responses); send as text frame.
                await websocket.send_text(raw.decode("utf-8"))
            except Exception:
                break

    async def heartbeat() -> None:
        while True:
            try:
                await websocket.send_json({"type": "heartbeat"})
            except Exception:
                return
            await asyncio.sleep(5)

    try:
        sub_task = asyncio.create_task(forward_subscribe())
        hb_task = asyncio.create_task(heartbeat())
        done, pending = await asyncio.wait(
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
        log.info("output_ws.disconnect", session_id=session_id, lang=lang)
