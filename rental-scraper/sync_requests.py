#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
手動「今すぐ取得」トリガーの受け渡し（qsheet_rental_sync_requests をキューにする）。

本体アプリ（server/src/contexts/qsheet/routes/rental.routes.ts の
POST /qsheet/rental/sync-trigger）が 'pending' 行を1件 INSERT し、
scheduler.py がポーリングでそれを見つけて claim（'running' に更新）→
run_all.main() を実行 → 'done'/'error' で締める、という受け渡し。

⚠️ scraper 側に HTTP サーバーを持たせない設計（scheduler.py は単純な
ポーリングループのままにする方針・README「検証環境での自動実行」参照）なので、
Postgres の1テーブルをキューとして使う。
"""
import logging
from typing import Optional

log = logging.getLogger(__name__)

PREFIX = "[sync-requests]"


def claim_pending_request(dsn: str) -> Optional[dict]:
    """一番古い 'pending' 行を1件だけ 'running' に更新して取得する（無ければ None）。

    `FOR UPDATE SKIP LOCKED` を使い、万一スクレイパーが複数プロセス同時に
    動いていても同じ行を二重に claim しないようにしてある（実運用は
    scheduler.py 1プロセスだけの想定だが、安全側に倒してある）。
    """
    import psycopg2

    conn = psycopg2.connect(dsn, client_encoding="UTF8")
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE qsheet_rental_sync_requests
                    SET status = 'running', started_at = NOW()
                    WHERE id = (
                        SELECT id FROM qsheet_rental_sync_requests
                        WHERE status = 'pending'
                        ORDER BY requested_at
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, requested_by
                    """
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {"id": str(row[0]), "requested_by": row[1]}
    finally:
        conn.close()


def mark_done(dsn: str, request_id: str) -> None:
    _update_status(dsn, request_id, "done")


def mark_error(dsn: str, request_id: str, message: str) -> None:
    _update_status(dsn, request_id, "error", message)


def _update_status(dsn: str, request_id: str, status: str, message: Optional[str] = None) -> None:
    import psycopg2

    conn = psycopg2.connect(dsn, client_encoding="UTF8")
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE qsheet_rental_sync_requests
                       SET status = %s, finished_at = NOW(), error_message = %s
                       WHERE id = %s""",
                    (status, message, request_id),
                )
    finally:
        conn.close()
