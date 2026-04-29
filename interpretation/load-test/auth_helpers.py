"""Login + session-creation helpers shared by every locust user."""

from __future__ import annotations

import os
import time

import requests


DEFAULT_TARGET = ["en"]


def login(api_base: str, email: str, password: str) -> str:
    r = requests.post(
        f"{api_base}/api/v1/auth/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def create_session(
    api_base: str, token: str, target_languages: list[str] | None = None
) -> tuple[str, dict]:
    r = requests.post(
        f"{api_base}/api/v1/sessions",
        json={"target_languages": target_languages or DEFAULT_TARGET},
        headers={"authorization": f"Bearer {token}"},
        timeout=10,
    )
    r.raise_for_status()
    body = r.json()
    return body["session_id"], body


def end_session(api_base: str, token: str, session_id: str) -> None:
    try:
        requests.post(
            f"{api_base}/api/v1/sessions/{session_id}/end",
            headers={"authorization": f"Bearer {token}"},
            timeout=10,
        )
    except Exception:
        pass


def get_cost(api_base: str, token: str, session_id: str) -> dict:
    r = requests.get(
        f"{api_base}/api/v1/sessions/{session_id}/cost",
        headers={"authorization": f"Bearer {token}"},
        timeout=5,
    )
    r.raise_for_status()
    return r.json()


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def now_ms() -> float:
    return time.perf_counter() * 1000
