"""Observability primitives: request-id correlation + structlog setup.

Cloud Run injects ``X-Cloud-Trace-Context`` for traceability. We also accept
``X-Request-Id`` for callers that already carry one (e.g. the operator UI),
and otherwise generate a UUIDv4. The id is bound to structlog contextvars
for the duration of the request and surfaced back in the response header.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


REQUEST_ID_HEADER = "x-request-id"
TRACE_HEADER = "x-cloud-trace-context"


def configure_logging(level: str) -> None:
    """JSON-structured logs friendly to Cloud Logging."""
    logging.basicConfig(level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Bind a request id to structlog contextvars for the request lifetime.

    The id is taken from ``X-Request-Id`` if present, otherwise derived from
    ``X-Cloud-Trace-Context`` (the part before the first ``/``), otherwise a
    fresh UUIDv4. The same id is echoed back as ``X-Request-Id`` so clients
    can correlate logs.
    """

    async def dispatch(  # type: ignore[override]
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        rid = request.headers.get(REQUEST_ID_HEADER)
        if not rid:
            trace = request.headers.get(TRACE_HEADER)
            if trace:
                rid = trace.split("/", 1)[0]
        if not rid:
            rid = uuid.uuid4().hex

        bind = structlog.contextvars.bind_contextvars
        clear = structlog.contextvars.clear_contextvars
        clear()
        bind(
            request_id=rid,
            method=request.method,
            path=request.url.path,
        )
        try:
            response = await call_next(request)
        finally:
            clear()

        response.headers[REQUEST_ID_HEADER] = rid
        return response
