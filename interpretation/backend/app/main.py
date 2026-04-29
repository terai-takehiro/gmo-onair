"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api import glossaries, output_ws, sessions, stream_ws
from app.config import get_settings
from app.languages import load_languages
from pathlib import Path

_BASE = Path(__file__).parent
TEMPLATES = Jinja2Templates(directory=str(_BASE / "templates"))

log = structlog.get_logger(__name__)


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ]
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    _configure_logging(settings.log_level)
    languages = load_languages()
    app.state.settings = settings
    app.state.languages = languages
    log.info(
        "app.startup",
        environment=settings.environment,
        languages=list(languages.keys()),
    )
    try:
        yield
    finally:
        log.info("app.shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Interpretation Backend",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_dev else None,
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount("/static", StaticFiles(directory=str(_BASE / "static")), name="static")
    app.state.templates = TEMPLATES

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    app.include_router(sessions.router, prefix="/api/v1")
    app.include_router(glossaries.router, prefix="/api/v1")
    app.include_router(stream_ws.router)
    app.include_router(output_ws.router)

    return app


app = create_app()
