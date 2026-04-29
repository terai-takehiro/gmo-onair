"""HTTP security headers middleware.

Defaults are strict; the overlay (`/stream/...`) and `/static/` get a
slightly looser CSP because the overlay HTML carries an inline <style>
for CSS variables and uses MSE blob URLs / WebSocket connections.

Header set:
  - Strict-Transport-Security: HTTPS-only + preload-eligible
  - Content-Security-Policy: route-tailored
  - X-Content-Type-Options: nosniff
  - Referrer-Policy: strict-origin-when-cross-origin
  - Permissions-Policy: locked-down (no camera/usb/etc.)
  - Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy: same-origin
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


_API_CSP = "; ".join(
    [
        "default-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ]
)

# Overlay CSP — the operator pastes this URL into vMix Browser Source.
# Allows: own static assets, inline <style> for CSS variables, WS to any
# origin (vMix may be served from a different host), MSE blob: URIs.
_OVERLAY_CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "media-src 'self' blob:",
        "connect-src 'self' wss: ws:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'none'",
    ]
)

_PERMISSIONS = ", ".join(
    [
        "camera=()",
        "microphone=()",
        "geolocation=()",
        "usb=()",
        "payment=()",
    ]
)


def _select_csp(path: str) -> str:
    if path.startswith("/stream/") or path.startswith("/static/"):
        return _OVERLAY_CSP
    return _API_CSP


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(  # type: ignore[override]
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        response = await call_next(request)
        h = response.headers
        h.setdefault(
            "strict-transport-security",
            "max-age=63072000; includeSubDomains; preload",
        )
        h.setdefault("x-content-type-options", "nosniff")
        h.setdefault("referrer-policy", "strict-origin-when-cross-origin")
        h.setdefault("permissions-policy", _PERMISSIONS)
        h.setdefault("cross-origin-opener-policy", "same-origin")
        h.setdefault("cross-origin-resource-policy", "same-origin")
        h.setdefault("content-security-policy", _select_csp(request.url.path))
        return response
