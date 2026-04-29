"""Origin allowlist middleware (defense-in-depth CSRF protection).

We currently use Bearer tokens in localStorage so CSRF is *not* exploitable
(an attacker can't read another origin's localStorage and can't set the
Authorization header from a third-party page). This middleware adds belt
& braces for any future cookie-based flow and also catches misconfigured
clients that try to talk to us from an unexpected origin.

Behavior on state-changing methods (POST / PATCH / PUT / DELETE):
  - If Origin / Referer is set AND host is NOT in the allowlist → 403.
  - If Origin / Referer is missing → allow (curl / tests / vMix browser).
  - GET / HEAD / OPTIONS / WebSocket upgrades are always allowed.

The allowlist comes from `Settings.cors_origins_list`.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _origin_host(value: str | None) -> str | None:
    if not value:
        return None
    try:
        p = urlparse(value)
    except Exception:
        return None
    if not p.hostname:
        return None
    if p.port:
        return f"{p.scheme}://{p.hostname}:{p.port}"
    return f"{p.scheme}://{p.hostname}"


class OriginGuardMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, allowed_origins: list[str]) -> None:
        super().__init__(app)
        self._allowed = {
            o.rstrip("/").lower() for o in allowed_origins if o
        }

    async def dispatch(  # type: ignore[override]
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        if request.method in _SAFE_METHODS:
            return await call_next(request)

        # Allow when no Origin/Referer is sent (non-browser clients).
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        if not origin and not referer:
            return await call_next(request)

        candidate = _origin_host(origin) or _origin_host(referer)
        if candidate is not None and candidate.lower() in self._allowed:
            return await call_next(request)

        return JSONResponse(
            status_code=403,
            content={"detail": "origin not allowed"},
        )
