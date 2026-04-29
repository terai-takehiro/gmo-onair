"""In-process Pub/Sub broker for tests.

Mirrors the surface of `app.pipeline.pubsub.PubSubBroker` but uses
asyncio.Queues per channel instead of Redis. Lets us assert on what the
orchestrator publishes without standing up Redis.
"""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any, AsyncIterator


class FakePubSubBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[bytes]]] = defaultdict(list)
        self.published: list[tuple[str, dict]] = []  # for assertions

    async def publish_json(self, channel: str, payload: dict[str, Any]) -> None:
        self.published.append((channel, payload))
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        for q in list(self._subscribers.get(channel, [])):
            await q.put(data)

    async def publish_bytes(self, channel: str, payload: bytes) -> None:
        for q in list(self._subscribers.get(channel, [])):
            await q.put(payload)

    async def subscribe(self, channel: str) -> AsyncIterator[bytes]:
        q: asyncio.Queue[bytes] = asyncio.Queue()
        self._subscribers[channel].append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subscribers[channel].remove(q)

    async def close(self) -> None:  # noqa: D401
        """No-op."""

    # --- helpers used by tests ---

    def published_on(self, channel: str) -> list[dict]:
        return [p for c, p in self.published if c == channel]
