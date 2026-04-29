"""Pytest fixtures shared by all tests.

Tests run against a real Postgres (the same as docker-compose.dev.yml or a
GitHub Actions service container). The schema is created via
``Base.metadata.create_all`` per session and dropped at teardown so we don't
need to chain Alembic in every test run.

Pub/Sub is replaced with an in-process FakePubSubBroker. STT / Vertex / TTS
clients are NOT instantiated unless a test patches them.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.auth import CurrentUser, create_access_token, hash_password
from app.config import Settings, get_settings
from app.db import models as m
from app.db.base import Base
from app.main import create_app
from tests.fakes.pubsub import FakePubSubBroker


def _test_db_url() -> str:
    return os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+asyncpg://interpretation_app:devpass@localhost:5432/interpretation_test",
    )


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(_test_db_url(), pool_pre_ping=True)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine: AsyncEngine):
    sm = async_sessionmaker(engine, expire_on_commit=False)
    async with sm() as s:
        yield s
        await s.rollback()


@pytest.fixture
def settings() -> Settings:
    s = get_settings()
    # Ensure deterministic JWT secret across the test run.
    object.__setattr__(s, "jwt_secret", "test-secret")
    return s


@pytest_asyncio.fixture
async def app_and_broker(engine: AsyncEngine, settings: Settings):
    """Build the FastAPI app with engine + fake broker injected.

    Skips the real lifespan (which would build a separate engine and try to
    connect to Redis) by replacing the lifespan after construction.
    """
    app = create_app()
    broker = FakePubSubBroker()

    async def _test_lifespan(app):
        from app.languages import load_languages
        from app.pipeline.orchestrator import Orchestrator

        app.state.settings = settings
        app.state.languages = load_languages()
        app.state.db_engine = engine
        app.state.db_sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        app.state.pubsub = broker
        app.state.orchestrator = Orchestrator(settings, broker)
        yield

    app.router.lifespan_context = _test_lifespan  # type: ignore[assignment]
    async with LifespanManager(app):
        yield app, broker


@pytest_asyncio.fixture
async def client(app_and_broker) -> AsyncIterator[AsyncClient]:
    app, _ = app_and_broker
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c


@pytest_asyncio.fixture
async def admin_user(db_session, settings: Settings) -> dict:
    user = m.User(
        email="admin@test.local",
        display_name="Test Admin",
        role="admin",
        password_hash=hash_password("devpassword"),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    cu = CurrentUser(id=user.id, email=user.email, role=user.role)
    token = create_access_token(cu, settings)
    return {"id": str(user.id), "email": user.email, "token": token}


@pytest.fixture
def auth_headers(admin_user) -> dict[str, str]:
    return {"authorization": f"Bearer {admin_user['token']}"}
