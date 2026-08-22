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
        全件が同じ last_seen を持つこと(=sync_to_postgres.py で全件 listed
        判定になれること)を確認する。"""
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


if __name__ == "__main__":
    unittest.main()
