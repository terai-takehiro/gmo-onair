#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
common_db.py の upsert_item / mark_missing_items の `now` 引数のテスト。

⚠️ 検証環境で実際に踏んだ回帰を防ぐためのテスト:
    以前は upsert_item が呼ばれるたびに datetime.now() を独自に計算していた
    ため、数百〜数千件を SLEEP_SEC=1.5秒間隔で処理する実クロール(数十分〜
    1時間超かかる)では商品ごとに last_seen がバラけ、sync_to_postgres.py の
    compute_statuses()(company ごとの最新 last_seen とだけ一致する行を
    listed とする判定)で最後の1件以外が全部 missing に誤判定されていた。

    修正: upsert_item / mark_missing_items に `now` を渡せるようにし、
    呼び出し側(toc_scraper.run() / restar_scraper.run())がクロール開始時に
    1回だけ計算した同じ値を渡す。ここではその契約 —
    「同じ now を渡した複数件の upsert_item はすべて同じ last_seen になる」
    — を直接検証する。
"""
import sqlite3
import tempfile
import unittest
import os

from common_db import init_db, upsert_item, mark_missing_items, ItemDetail


class UpsertItemSharedNowTest(unittest.TestCase):
    def test_multiple_items_with_same_now_get_identical_last_seen(self):
        """1回のクロラン相当: 複数商品を同じ now で upsert_item した結果、
        全件が同じ last_seen を持つこと(=画面の「最終取得日時」が
        「最後の1件を取った時刻」にずれないこと)を確認する。"""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            conn = sqlite3.connect(db_path)
            init_db(conn)

            shared_now = "2026-08-22T10:00:00"
            for item_id in ["1", "2", "3"]:
                detail = ItemDetail(item_id=item_id, name=f"商品{item_id}")
                upsert_item(conn, "A", detail, now=shared_now)

            rows = conn.execute(
                "SELECT item_id, last_seen FROM items WHERE company='A' ORDER BY item_id"
            ).fetchall()
            conn.close()

            self.assertEqual(len(rows), 3)
            for item_id, last_seen in rows:
                self.assertEqual(last_seen, shared_now, f"item_id={item_id} の last_seen がずれている")

    def test_omitting_now_still_works_and_defaults_to_now(self):
        """後方互換: now を省略しても動作し、last_seen が何かしら入ること。"""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            conn = sqlite3.connect(db_path)
            init_db(conn)

            detail = ItemDetail(item_id="1", name="商品1")
            upsert_item(conn, "A", detail)  # now省略

            row = conn.execute(
                "SELECT last_seen FROM items WHERE company='A' AND item_id='1'"
            ).fetchone()
            conn.close()

            self.assertIsNotNone(row[0])

    def test_mark_missing_items_uses_shared_now(self):
        """mark_missing_items も now を受け取り change_log に同じ値を書くこと。"""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            conn = sqlite3.connect(db_path)
            init_db(conn)

            shared_now = "2026-08-22T10:00:00"
            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now=shared_now)
            upsert_item(conn, "A", ItemDetail(item_id="2", name="商品2"), now=shared_now)

            # 今回のクロールでは item_id=1 だけが見つかった想定
            mark_missing_items(conn, "A", seen_ids={"1"}, now=shared_now)

            row = conn.execute(
                """SELECT changed_at FROM change_log
                   WHERE company='A' AND item_id='2' AND field='status' AND new_value='missing'"""
            ).fetchone()
            conn.close()

            self.assertIsNotNone(row)
            self.assertEqual(row[0], shared_now)


class StatusColumnTest(unittest.TestCase):
    """items.status の扱い。**画面に出る／出ないを決めているのはこの列** —
    本体アプリのレンタル機材検索は status='listed' の行だけを検索対象にする。"""

    def test_upsert_marks_item_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = sqlite3.connect(os.path.join(tmp, "rental_items.db"))
            init_db(conn)
            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now="2026-08-22T10:00:00")

            status = conn.execute(
                "SELECT status FROM items WHERE company='A' AND item_id='1'"
            ).fetchone()[0]
            conn.close()
            self.assertEqual(status, "listed")

    def test_mark_missing_only_touches_unseen_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            conn = sqlite3.connect(os.path.join(tmp, "rental_items.db"))
            init_db(conn)
            now = "2026-08-22T10:00:00"
            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now=now)
            upsert_item(conn, "A", ItemDetail(item_id="2", name="商品2"), now=now)

            mark_missing_items(conn, "A", seen_ids={"1"}, now=now)

            statuses = dict(conn.execute("SELECT item_id, status FROM items WHERE company='A'").fetchall())
            conn.close()
            self.assertEqual(statuses, {"1": "listed", "2": "missing"})

    def test_interrupted_crawl_keeps_untouched_items_listed(self):
        """⚠️ 実際に踏んだ形の回帰テスト。クロールが途中で止まった回
        (デプロイでコンテナが作り直された等・mark_missing_items まで到達しない)
        でも、まだ見に行っていない商品は listed のまま残ること。
        以前は status を last_seen の一致で推定していたため、この状況で
        同期すると未訪問の商品が全部 missing に倒れて画面から機材が消えた。"""
        with tempfile.TemporaryDirectory() as tmp:
            conn = sqlite3.connect(os.path.join(tmp, "rental_items.db"))
            init_db(conn)
            # 前回のクロール（完走）
            for item_id in ["1", "2", "3"]:
                upsert_item(conn, "A", ItemDetail(item_id=item_id, name=f"商品{item_id}"),
                            now="2026-08-21T05:00:00")
            # 今回のクロール（1件目を取った時点で中断 = mark_missing_items を呼ばない）
            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now="2026-08-22T10:00:00")

            statuses = dict(conn.execute("SELECT item_id, status FROM items WHERE company='A'").fetchall())
            conn.close()
            self.assertEqual(statuses, {"1": "listed", "2": "listed", "3": "listed"})

    def test_missing_item_returns_to_listed_when_found_again(self):
        """掲載が再開されたら listed に戻り、change_log にも残ること
        (以前の change_log は listed→missing の片方向しか記録できなかった)。"""
        with tempfile.TemporaryDirectory() as tmp:
            conn = sqlite3.connect(os.path.join(tmp, "rental_items.db"))
            init_db(conn)
            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now="2026-08-21T05:00:00")
            mark_missing_items(conn, "A", seen_ids=set(), now="2026-08-21T05:00:00")

            upsert_item(conn, "A", ItemDetail(item_id="1", name="商品1"), now="2026-08-22T05:00:00")

            status = conn.execute(
                "SELECT status FROM items WHERE company='A' AND item_id='1'"
            ).fetchone()[0]
            relisted = conn.execute(
                """SELECT 1 FROM change_log WHERE company='A' AND item_id='1'
                   AND field='status' AND old_value='missing' AND new_value='listed'"""
            ).fetchone()
            conn.close()
            self.assertEqual(status, "listed")
            self.assertIsNotNone(relisted)

    def test_init_db_migrates_legacy_table_without_status(self):
        """status 列が入る前の rental_items.db を引き継いだ場合、
        既存行は listed から始まること。"""
        with tempfile.TemporaryDirectory() as tmp:
            db_path = os.path.join(tmp, "rental_items.db")
            conn = sqlite3.connect(db_path)
            conn.executescript("""
                CREATE TABLE items (
                    company TEXT NOT NULL, item_id TEXT NOT NULL, name TEXT,
                    category TEXT, subcategory TEXT, price_tel INTEGER, price_net INTEGER,
                    specs_json TEXT, related_json TEXT, images_json TEXT, url TEXT,
                    first_seen TEXT, last_seen TEXT, last_updated TEXT,
                    PRIMARY KEY (company, item_id)
                );
            """)
            conn.execute("INSERT INTO items (company, item_id, name) VALUES ('A','1','商品1')")
            conn.commit()

            init_db(conn)  # マイグレーションが走る

            status = conn.execute(
                "SELECT status FROM items WHERE company='A' AND item_id='1'"
            ).fetchone()[0]
            conn.close()
            self.assertEqual(status, "listed")


if __name__ == "__main__":
    unittest.main()
