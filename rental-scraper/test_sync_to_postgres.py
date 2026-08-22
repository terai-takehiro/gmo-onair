#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_to_postgres.py のテスト。

status 判定ロジック(compute_statuses)を Postgres 無しで検証するのが中心。
DATABASE_URL 未設定時にちゃんとスキップして正常終了するパス、
SQLite ファイルが無いときにスキップするパスもあわせて確認する。
実 psycopg2 接続が要る upsert_rows() は、モックに差し替えて呼び出し
引数だけを検証する。
"""
import json
import os
import sqlite3
import tempfile
import unittest
from unittest import mock

import sync_to_postgres as stp


def make_sqlite_fixture(path: str) -> None:
    """common_db.py と同じスキーマの items テーブルを用意し、
    - company='A' の商品2件（1件は今回のクロールで見つかった＝最新last_seen、
      もう1件は前回のクロールのまま＝古いlast_seen → missing 判定になるはず）
    - company='B' の商品1件（listed 判定になるはず）
    を入れる。
    """
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE items (
            company TEXT NOT NULL,
            item_id TEXT NOT NULL,
            name TEXT,
            category TEXT,
            subcategory TEXT,
            price_tel INTEGER,
            price_net INTEGER,
            specs_json TEXT,
            related_json TEXT,
            images_json TEXT,
            url TEXT,
            first_seen TEXT,
            last_seen TEXT,
            last_updated TEXT,
            PRIMARY KEY (company, item_id)
        );
        CREATE TABLE change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company TEXT,
            item_id TEXT,
            field TEXT,
            old_value TEXT,
            new_value TEXT,
            changed_at TEXT
        );
    """)
    rows = [
        # company A: 今回のクロールで見つかった商品 (最新 last_seen)
        (
            "A", "1", "商品A1", "カメラ", "本体", 1000, 900,
            json.dumps({"重さ": "1kg"}, ensure_ascii=False),
            json.dumps(["2"], ensure_ascii=False),
            json.dumps(["https://example.com/a1.jpg"], ensure_ascii=False),
            "https://example.com/a1",
            "2026-08-20T09:00:00", "2026-08-22T09:00:00", "2026-08-22T09:00:00",
        ),
        # company A: 前回のクロールのまま (今回は見つからなかった＝古い last_seen)
        (
            "A", "2", "商品A2", "カメラ", "レンズ", None, 500,
            json.dumps({}, ensure_ascii=False),
            json.dumps([], ensure_ascii=False),
            json.dumps([], ensure_ascii=False),
            "https://example.com/a2",
            "2026-08-15T09:00:00", "2026-08-20T09:00:00", "2026-08-20T09:00:00",
        ),
        # company B: 単独商品 (自分自身が最新 last_seen なので listed)
        (
            "B", "10", "商品B1", "音声", None, 2000, 1800,
            json.dumps({}, ensure_ascii=False),
            json.dumps([], ensure_ascii=False),
            json.dumps([], ensure_ascii=False),
            "https://example.com/b10",
            "2026-08-22T09:00:00", "2026-08-22T09:00:00", "2026-08-22T09:00:00",
        ),
    ]
    conn.executemany(
        """
        INSERT INTO items (company, item_id, name, category, subcategory,
                            price_tel, price_net, specs_json, related_json,
                            images_json, url, first_seen, last_seen, last_updated)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


class ComputeStatusesTest(unittest.TestCase):
    def test_marks_stale_row_missing_and_fresh_rows_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            make_sqlite_fixture(db_path)
            rows = stp.read_items(db_path)
            self.assertEqual(len(rows), 3)

            statuses = stp.compute_statuses(rows)

            self.assertEqual(statuses[("A", "1")], "listed")
            self.assertEqual(statuses[("A", "2")], "missing")
            self.assertEqual(statuses[("B", "10")], "listed")

    def test_company_with_no_items_produces_no_entries(self):
        # compute_statuses は行が無ければ何も出さない (呼び出し側で自然にスキップされる)
        statuses = stp.compute_statuses([])
        self.assertEqual(statuses, {})

    def test_all_rows_share_same_last_seen_are_all_listed(self):
        rows = [
            {"company": "C", "item_id": "1", "last_seen": "2026-08-22T09:00:00"},
            {"company": "C", "item_id": "2", "last_seen": "2026-08-22T09:00:00"},
        ]
        statuses = stp.compute_statuses(rows)
        self.assertEqual(statuses[("C", "1")], "listed")
        self.assertEqual(statuses[("C", "2")], "listed")


class RunEarlyReturnTest(unittest.TestCase):
    def test_run_skips_when_database_url_unset(self):
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        with mock.patch.dict(os.environ, env, clear=True):
            with mock.patch.object(stp, "upsert_rows") as mocked_upsert:
                stp.run()  # should not raise
                mocked_upsert.assert_not_called()

    def test_run_skips_when_sqlite_file_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing_path = os.path.join(tmp, "does-not-exist.db")
            env = dict(os.environ)
            env["DATABASE_URL"] = "postgresql://user:pass@localhost/db"
            env["RENTAL_SQLITE_PATH"] = missing_path
            with mock.patch.dict(os.environ, env, clear=True):
                with mock.patch.object(stp, "upsert_rows") as mocked_upsert:
                    stp.run()  # should not raise
                    mocked_upsert.assert_not_called()

    def test_run_calls_upsert_rows_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            make_sqlite_fixture(db_path)
            env = dict(os.environ)
            env["DATABASE_URL"] = "postgresql://user:pass@localhost/db"
            env["RENTAL_SQLITE_PATH"] = db_path
            with mock.patch.dict(os.environ, env, clear=True):
                with mock.patch.object(stp, "upsert_rows", return_value=(3, 1)) as mocked_upsert:
                    stp.run()
                    mocked_upsert.assert_called_once()
                    called_dsn, called_rows, called_statuses = mocked_upsert.call_args[0]
                    self.assertEqual(called_dsn, "postgresql://user:pass@localhost/db")
                    self.assertEqual(len(called_rows), 3)
                    self.assertEqual(called_statuses[("A", "2")], "missing")

    def test_run_reraises_when_upsert_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            make_sqlite_fixture(db_path)
            env = dict(os.environ)
            env["DATABASE_URL"] = "postgresql://user:pass@localhost/db"
            env["RENTAL_SQLITE_PATH"] = db_path
            with mock.patch.dict(os.environ, env, clear=True):
                with mock.patch.object(stp, "upsert_rows", side_effect=RuntimeError("boom")):
                    with self.assertRaises(RuntimeError):
                        stp.run()


if __name__ == "__main__":
    unittest.main()
