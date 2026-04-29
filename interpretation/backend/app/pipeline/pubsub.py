"""Redis Pub/Sub fanout (Phase 1 stub).

Channels:
  stream:{session_id}:{lang}      # serialized JSON / binary frames

Used so /ws/output/{session_id}/{lang} (any Cloud Run instance) can
subscribe and forward live frames produced by the orchestrator.
"""

from __future__ import annotations

import json
from typing import Any, AsyncIterator

import redis.asyncio as redis_async

from app.config import Settings


def channel_for(session_id: str, lang: str) -> str:
    return f"stream:{session_id}:{lang}"


class PubSubBroker:
    """Thin wrapper around redis.asyncio Pub/Sub."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: redis_async.Redis | None = None

    async def connect(self) -> redis_async.Redis:
        if self._client is None:
            self._client = redis_async.from_url(
                self._settings.redis_url, encoding="utf-8", decode_responses=False
            )
        return self._client

    async def publish_json(self, channel: str, payload: dict[str, Any]) -> None:
        client = await self.connect()
        await client.publish(channel, json.dumps(payload, ensure_ascii=False))

    async def publish_bytes(self, channel: str, payload: bytes) -> None:
        client = await self.connect()
        await client.publish(channel, payload)

    async def subscribe(self, channel: str) -> AsyncIterator[bytes]:
        client = await self.connect()
        pubsub = client.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                yield msg["data"]
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
