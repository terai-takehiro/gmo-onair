"""Verify that Vertex AI generative caching is disabled at the project level.

Phase 0 verification #1 (REQUIREMENTS.md §10).

Runs:
  GET https://{region}-aiplatform.googleapis.com/v1/projects/{pid}/cacheConfig

Expects `disableCache: true`.

Usage:
  python check_vertex_cache.py
"""

from __future__ import annotations

import sys

import requests
from google.auth import default
from google.auth.transport.requests import Request

from common import Config


def main() -> int:
    cfg = Config.from_env()

    creds, _ = default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())

    url = (
        f"https://{cfg.vertex_region}-aiplatform.googleapis.com/v1/"
        f"projects/{cfg.project_id}/cacheConfig"
    )
    headers = {"Authorization": f"Bearer {creds.token}"}

    print(f"[check] GET {url}")
    resp = requests.get(url, headers=headers, timeout=10)
    print(f"[check] status={resp.status_code}")
    print(resp.text)

    if resp.status_code != 200:
        print("[check] FAIL: non-200 response", file=sys.stderr)
        return 2

    body = resp.json()
    if body.get("disableCache") is True:
        print("[check] OK: disableCache = true")
        return 0

    print("[check] FAIL: disableCache is not true. Run scripts/disable-vertex-cache.sh.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
