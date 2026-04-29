"""YouTube Live closed-captions ingest poster.

YouTube exposes a per-broadcast HTTP endpoint that accepts plain-text
captions (https://support.google.com/youtube/answer/3068031). Each POST
contains a UTC timestamp and the caption text.

Flow:
  POST <ingest_url>?seq=N
  Content-Type: text/plain; charset=utf-8
  Body:
    YYYY-MM-DDTHH:MM:SS.mmm
    caption text...

We use one poster per (session, lang) and keep a per-poster monotonic seq.
Failures are logged but never raised — captions are best-effort and a
network blip should not abort the pipeline.
"""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx
import structlog

log = structlog.get_logger(__name__)


_VALID_HOSTS = {"www.youtube.com", "youtube.com"}


def is_valid_ingest_url(url: str) -> bool:
    """Allowlist YouTube CC ingest hosts to avoid SSRF if operators paste
    untrusted URLs."""
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme != "https":
        return False
    if p.hostname not in _VALID_HOSTS:
        return False
    return p.path.startswith("/api/live_ingest/text-mt")


class YouTubeCcPoster:
    def __init__(self, ingest_url: str, *, lang: str) -> None:
        self._ingest_url = ingest_url
        self._lang = lang
        self._seq = 0
        self._client = httpx.AsyncClient(timeout=5.0)

    async def post(self, text: str) -> None:
        if not text.strip():
            return
        self._seq += 1
        ts = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3]
        body = f"{ts}\n{text}\n"
        try:
            response = await self._client.post(
                self._ingest_url,
                params={"seq": self._seq},
                content=body.encode("utf-8"),
                headers={"Content-Type": "text/plain; charset=utf-8"},
            )
            response.raise_for_status()
        except Exception as e:
            # Best-effort delivery; do not surface upstream.
            log.warning(
                "youtube_cc.post_error",
                lang=self._lang,
                seq=self._seq,
                error=repr(e),
            )

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass


async def make_posters(
    cc_urls: dict[str, str] | None,
) -> dict[str, YouTubeCcPoster]:
    """Build a poster per language; silently drop entries with bad URLs."""
    if not cc_urls:
        return {}
    out: dict[str, YouTubeCcPoster] = {}
    for lang, url in cc_urls.items():
        if not is_valid_ingest_url(url):
            log.warning("youtube_cc.url_rejected", lang=lang, url=url)
            continue
        out[lang] = YouTubeCcPoster(url, lang=lang)
    return out


async def close_all(posters: dict[str, YouTubeCcPoster]) -> None:
    for p in posters.values():
        await p.close()
