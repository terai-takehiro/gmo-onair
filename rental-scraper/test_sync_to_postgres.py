#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_to_postgres.py のテスト。

status は **SQLite の items.status をそのまま運ぶ**（以前の
「company ごとの最新 last_seen と一致する行だけ listed」という時刻推定は
やめた — 途中で止まったクロールを同期すると未訪問の商品まで missing に
倒れて画面から機材が消えるため。sync_to_postgres.py 冒頭の注記参照）。
ここではその運搬と、DATABASE_URL 未設定・SQLite ファイル無しのスキップ経路、
status 列が無い古い DB の後方互換を確認する。
実 psycopg2 接続が要る upsert_rows() は、モックに差し替えて呼び出し
引数だけを検証する。
"""
import json
import os
import sqlite3
import tempfile
import unittest
from unittest import mock

import common_db
import sync_to_postgres as stp


def make_sqlite_fixture(path: str) -> None:
    """common_db.init_db で本物と同じスキーマを作り（テスト用に別スキーマを
    書き写すと実装とずれるため）、
    - company='A' の商品2件（1件 listed / 1件 missing）
    - company='B' の商品1件（listed）
    を入れる。
    """
    conn = sqlite3.connect(path)
    common_db.init_db(conn)
    rows = [
        ("A", "1", "商品A1", "カメラ", "本体", 1000, 900,
         json.dumps({"重さ": "1kg"}, ensure_ascii=False),
         json.dumps(["2"], ensure_ascii=False),
         json.dumps(["https://example.com/a1.jpg"], ensure_ascii=False),
         "https://example.com/a1",
         "2026-08-20T09:00:00", "2026-08-22T09:00:00", "2026-08-22T09:00:00", "listed"),
        ("A", "2", "商品A2", "カメラ", "レンズ", None, 500,
         json.dumps({}, ensure_ascii=False), json.dumps([], ensure_ascii=False),
         json.dumps([], ensure_ascii=False), "https://example.com/a2",
         "2026-08-15T09:00:00", "2026-08-20T09:00:00", "2026-08-20T09:00:00", "missing"),
        ("B", "10", "商品B1", "音声", None, 2000, 1800,
         json.dumps({}, ensure_ascii=False), json.dumps([], ensure_ascii=False),
         json.dumps([], ensure_ascii=False), "https://example.com/b10",
         "2026-08-22T09:00:00", "2026-08-22T09:00:00", "2026-08-22T09:00:00", "listed"),
    ]
    conn.executemany(
        """
        INSERT INTO items (company, item_id, name, category, subcategory,
                            price_tel, price_net, specs_json, related_json,
                            images_json, url, first_seen, last_seen, last_updated, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def make_legacy_sqlite_fixture(path: str) -> None:
    """status 列が入る前のスキーマ。手元に残っている古い rental_items.db を
    `python3 sync_to_postgres.py` 単体で同期する経路を守るためのもの。"""
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE items (
            company TEXT NOT NULL, item_id TEXT NOT NULL, name TEXT,
            category TEXT, subcategory TEXT, price_tel INTEGER, price_net INTEGER,
            specs_json TEXT, related_json TEXT, images_json TEXT, url TEXT,
            first_seen TEXT, last_seen TEXT, last_updated TEXT,
            PRIMARY KEY (company, item_id)
        );
    """)
    conn.execute(
        "INSERT INTO items (company, item_id, name, last_seen) VALUES ('A','1','商品A1','2026-08-22T09:00:00')"
    )
    conn.commit()
    conn.close()


class ReadItemsTest(unittest.TestCase):
    def test_status_column_is_carried_as_is(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            make_sqlite_fixture(db_path)
            rows = {(r["company"], r["item_id"]): r for r in stp.read_items(db_path)}

            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[("A", "1")]["status"], "listed")
            self.assertEqual(rows[("A", "2")]["status"], "missing")
            self.assertEqual(rows[("B", "10")]["status"], "listed")

    def test_legacy_db_without_status_column_defaults_to_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "legacy.db")
            make_legacy_sqlite_fixture(db_path)
            rows = stp.read_items(db_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["status"], "listed")


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
                    called_dsn, called_rows = mocked_upsert.call_args[0]
                    self.assertEqual(called_dsn, "postgresql://user:pass@localhost/db")
                    self.assertEqual(len(called_rows), 3)
                    by_key = {(r["company"], r["item_id"]): r for r in called_rows}
                    self.assertEqual(by_key[("A", "2")]["status"], "missing")

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
