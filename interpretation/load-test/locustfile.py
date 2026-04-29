"""Locust scenarios for the interpretation backend.

Two user classes:

  RestUser:
    Login → POST /sessions → GET /cost (poll) → POST /sessions/{id}/end.
    Stresses auth + DB + orchestrator setup/teardown without invoking GCP.

  AudioWsUser:
    Login → POST /sessions → open /ws/operator/{sid} → stream silent
    16-kHz PCM at real-time → end. Drives STT (silent → no final
    transcripts → no Vertex/TTS calls) so we can measure WS / connection
    overhead at scale without burning GCP credits.

Run:
  locust -f locustfile.py \\
    --host https://dev.example.com \\
    -u 10 -r 1 --run-time 5m

Env:
  LOAD_TEST_EMAIL=loadtest@example.com
  LOAD_TEST_PASSWORD=...
  LOAD_TEST_PCM_FILE=samples/silence_60s.pcm   (only AudioWsUser)
"""

from __future__ import annotations

import time
from pathlib import Path

import websocket
from locust import HttpUser, between, events, task

from auth_helpers import (
    create_session,
    end_session,
    env,
    get_cost,
    login,
    now_ms,
)


CHUNK_MS = 100
SAMPLE_RATE = 16000
BYTES_PER_CHUNK = SAMPLE_RATE * CHUNK_MS // 1000 * 2  # int16 mono


class RestUser(HttpUser):
    """Connection-light scenario: REST + cost polling."""

    wait_time = between(2, 5)

    def on_start(self) -> None:
        email = env("LOAD_TEST_EMAIL", "loadtest@example.com")
        password = env("LOAD_TEST_PASSWORD", "loadtest")
        try:
            self.token = login(self.host, email, password)
        except Exception as e:
            events.request.fire(
                request_type="LOGIN",
                name="login",
                response_time=0,
                response_length=0,
                exception=e,
            )
            self.environment.runner.quit()

    @task
    def session_lifecycle(self) -> None:
        t0 = now_ms()
        try:
            sid, _ = create_session(self.host, self.token)
        except Exception as e:
            events.request.fire(
                request_type="REST",
                name="POST /sessions",
                response_time=now_ms() - t0,
                response_length=0,
                exception=e,
            )
            return
        events.request.fire(
            request_type="REST",
            name="POST /sessions",
            response_time=now_ms() - t0,
            response_length=0,
            exception=None,
        )

        # Light polling loop while the session is "live".
        for _ in range(3):
            time.sleep(2)
            try:
                get_cost(self.host, self.token, sid)
            except Exception:
                pass

        end_session(self.host, self.token, sid)


class AudioWsUser(HttpUser):
    """Open the operator WebSocket and stream silent PCM at real time."""

    wait_time = between(5, 15)

    def on_start(self) -> None:
        email = env("LOAD_TEST_EMAIL", "loadtest@example.com")
        password = env("LOAD_TEST_PASSWORD", "loadtest")
        self.token = login(self.host, email, password)
        path = Path(env("LOAD_TEST_PCM_FILE", "samples/silence_60s.pcm"))
        self.pcm = path.read_bytes() if path.exists() else b""

    @task
    def stream_audio(self) -> None:
        if not self.pcm:
            time.sleep(1)
            return

        t0 = now_ms()
        sid, _ = create_session(self.host, self.token)

        ws_url = (
            self.host.replace("https://", "wss://").replace("http://", "ws://")
            + f"/ws/operator/{sid}?token={self.token}"
        )
        ws = websocket.create_connection(ws_url, timeout=10)
        try:
            # Stream chunks at real time so the server-side load mirrors
            # actual mic input.
            chunks = [
                self.pcm[i : i + BYTES_PER_CHUNK]
                for i in range(0, len(self.pcm), BYTES_PER_CHUNK)
            ]
            for chunk in chunks:
                ws.send_binary(chunk)
                time.sleep(CHUNK_MS / 1000.0)

            elapsed = now_ms() - t0
            events.request.fire(
                request_type="WS",
                name="audio_stream",
                response_time=elapsed,
                response_length=len(self.pcm),
                exception=None,
            )
        finally:
            try:
                ws.close()
            except Exception:
                pass
            end_session(self.host, self.token, sid)
