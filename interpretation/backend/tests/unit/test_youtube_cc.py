"""Unit tests for the YouTube CC ingest URL allowlist + poster."""

from __future__ import annotations

import pytest

from app.pipeline.youtube_cc import YouTubeCcPoster, is_valid_ingest_url


@pytest.mark.parametrize(
    "url,expected",
    [
        (
            "https://www.youtube.com/api/live_ingest/text-mt?id=ABC&itag=0",
            True,
        ),
        (
            "https://youtube.com/api/live_ingest/text-mt?id=ABC",
            True,
        ),
        # http (not https) → reject
        ("http://www.youtube.com/api/live_ingest/text-mt?id=ABC", False),
        # wrong path → reject (SSRF defense)
        ("https://www.youtube.com/whatever?id=ABC", False),
        # wrong host → reject
        ("https://evil.example.com/api/live_ingest/text-mt?id=ABC", False),
        ("not a url", False),
        ("", False),
    ],
)
def test_is_valid_ingest_url(url: str, expected: bool) -> None:
    assert is_valid_ingest_url(url) is expected


@pytest.mark.asyncio
async def test_poster_post_increments_seq_and_swallows_errors(
    monkeypatch,
) -> None:
    poster = YouTubeCcPoster(
        "https://www.youtube.com/api/live_ingest/text-mt?id=ABC", lang="en"
    )
    calls: list[dict] = []

    class FakeResp:
        def raise_for_status(self) -> None:
            return

    async def fake_post(self, url, params=None, content=None, headers=None):
        calls.append({"url": url, "params": params, "content": content})
        return FakeResp()

    monkeypatch.setattr("httpx.AsyncClient.post", fake_post)
    await poster.post("hello")
    await poster.post("world")
    await poster.close()

    assert [c["params"]["seq"] for c in calls] == [1, 2]
    # Body shape: ISO timestamp (3 fractional digits) on first line + caption on next.
    body = calls[0]["content"].decode("utf-8")
    first, second, _trailing_newline = body.split("\n")
    assert "T" in first and len(first) >= 23  # 23 chars = millis precision
    assert second == "hello"


@pytest.mark.asyncio
async def test_poster_swallows_http_errors(monkeypatch) -> None:
    poster = YouTubeCcPoster(
        "https://www.youtube.com/api/live_ingest/text-mt?id=ABC", lang="en"
    )

    async def boom(*a, **k):
        raise RuntimeError("network down")

    monkeypatch.setattr("httpx.AsyncClient.post", boom)
    # Must not raise.
    await poster.post("hello")
    await poster.close()
