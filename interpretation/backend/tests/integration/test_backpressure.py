"""Audio queue backpressure: full queue → drop oldest, latest survives."""

from __future__ import annotations

import uuid

import pytest

from app.config import get_settings
from app.pipeline import orchestrator as orch_mod
from app.pipeline.orchestrator import Orchestrator
from tests.fakes.pubsub import FakePubSubBroker


@pytest.mark.asyncio
async def test_full_audio_queue_drops_oldest(monkeypatch) -> None:
    monkeypatch.setattr(orch_mod, "_AUDIO_QUEUE_MAX", 4)

    settings = get_settings()
    orch = Orchestrator(settings, FakePubSubBroker())
    sid = uuid.uuid4()
    await orch.start_session(sid, target_languages=["en"])

    p = orch.get(sid)
    assert p is not None

    # Stop the consumer so the queue can fill.
    for t in p.tasks:
        t.cancel()

    # Re-build a small bounded queue (start_session already ran with the
    # patched max, but the SessionPipeline default factory captured the
    # value when this test started — rebuild to be safe).
    import asyncio

    p.audio_queue = asyncio.Queue(maxsize=4)
    for i in range(10):
        await orch.feed_audio(sid, bytes([i]))

    # Queue must not exceed the cap; dropped counter must reflect overflow.
    assert p.audio_queue.qsize() == 4
    assert p.dropped_chunks == 6

    # The most recent chunk we sent must be in the queue.
    contents = []
    while not p.audio_queue.empty():
        contents.append(p.audio_queue.get_nowait())
    assert contents[-1] == bytes([9])

    await orch.end_session(sid)
