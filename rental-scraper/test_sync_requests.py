#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_requests.py のテスト。psycopg2.connect をモックして、
発行される SQL・戻り値の形だけを検証する（実 Postgres への疎通は
手動で `npm run verify:up` に対して確認済み — このテストは CI 用の回帰防止）。
"""
import unittest
from unittest import mock

import sync_requests


def _mock_conn(fetchone_return=None):
    """psycopg2.connect(...) の戻り値をモックする。
    `with conn:` と `with conn.cursor() as cur:` の両方をサポートする必要がある。"""
    conn = mock.MagicMock()
    conn.__enter__.return_value = conn
    cur = mock.MagicMock()
    cur.__enter__.return_value = cur
    cur.fetchone.return_value = fetchone_return
    conn.cursor.return_value = cur
    return conn, cur


class ClaimPendingRequestTest(unittest.TestCase):
    def test_returns_dict_when_row_found(self):
        conn, cur = _mock_conn(fetchone_return=("11111111-1111-1111-1111-111111111111", "テスト太郎"))
        with mock.patch("psycopg2.connect", return_value=conn) as mocked_connect:
            result = sync_requests.claim_pending_request("postgresql://dummy")

        mocked_connect.assert_called_once()
        self.assertEqual(result, {"id": "11111111-1111-1111-1111-111111111111", "requested_by": "テスト太郎"})
        # UPDATE ... SET status = 'running' ... FOR UPDATE SKIP LOCKED を発行していること
        sql = cur.execute.call_args[0][0]
        self.assertIn("status = 'running'", sql)
        self.assertIn("FOR UPDATE SKIP LOCKED", sql)
        conn.close.assert_called_once()

    def test_returns_none_when_no_pending_row(self):
        conn, _cur = _mock_conn(fetchone_return=None)
        with mock.patch("psycopg2.connect", return_value=conn):
            result = sync_requests.claim_pending_request("postgresql://dummy")
        self.assertIsNone(result)


class MarkStatusTest(unittest.TestCase):
    def test_mark_done_sets_status_done(self):
        conn, cur = _mock_conn()
        with mock.patch("psycopg2.connect", return_value=conn):
            sync_requests.mark_done("postgresql://dummy", "req-1")

        sql, params = cur.execute.call_args[0]
        self.assertIn("SET status = %s", sql)
        self.assertEqual(params, ("done", None, "req-1"))
        conn.close.assert_called_once()

    def test_mark_error_sets_status_error_and_message(self):
        conn, cur = _mock_conn()
        with mock.patch("psycopg2.connect", return_value=conn):
            sync_requests.mark_error("postgresql://dummy", "req-1", "接続エラー")

        sql, params = cur.execute.call_args[0]
        self.assertIn("SET status = %s", sql)
        self.assertEqual(params, ("error", "接続エラー", "req-1"))


if __name__ == "__main__":
    unittest.main()
