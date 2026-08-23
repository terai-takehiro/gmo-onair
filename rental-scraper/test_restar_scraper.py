#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
restar_scraper.py の run() ループの打ち切り条件のテスト。

⚠️ 実際に踏んだ不具合の回帰テスト: START_ID=1 から連番で商品詳細ページを
スキャンする方式だが、MAX_CONSECUTIVE_MISS（連続404の打ち切り閾値）が
「1件も見つかっていない」段階から効いていたため、実際のカタログが
START_ID よりだいぶ手前まで欠番（404連続）だと、本物のカタログへ辿り着く
前に走査が止まり、レスターだけ0件のまま「取得できていない」状態になっていた
（商品詳細ページ例として案内されている item277 が典型 — 1〜276が欠番なら
旧実装の MAX_CONSECUTIVE_MISS=40 では絶対に辿り着けない）。

修正: 1件も見つかっていないうちは MAX_CONSECUTIVE_MISS による打ち切りを
適用しない（found_any フラグ）。最初の1件を見つけたあとは、従来どおり
カタログ末尾を過ぎた欠番地帯を早めに切り上げるために使う。
"""
import unittest
from unittest.mock import patch

import restar_scraper as restar
from common_db import ItemDetail


def _detail(item_id):
    return ItemDetail(item_id=item_id, name=f"商品{item_id}")


def _item_id_of(url: str) -> int:
    # ITEM_URL_TMPL = BASE + "/service/solutions/rental/item{id}/"
    return int(url.rstrip("/").rsplit("item", 1)[1])


class RunEarlyAbortTest(unittest.TestCase):
    def test_does_not_abort_before_first_item_found(self):
        """最初の商品が見つかるまでは MAX_CONSECUTIVE_MISS を超えて404が続いても
        走査を続け、欠番地帯の先にある本物のカタログへ到達できること。"""
        with patch.object(restar, "START_ID", 1), \
             patch.object(restar, "END_ID", 60), \
             patch.object(restar, "MAX_CONSECUTIVE_MISS", 5), \
             patch("restar_scraper.sqlite3.connect"), \
             patch("restar_scraper.init_db"), \
             patch("restar_scraper.time.sleep"), \
             patch("restar_scraper.mark_missing_items"), \
             patch("restar_scraper.upsert_item") as mock_upsert, \
             patch("restar_scraper.parse_item_detail") as mock_parse, \
             patch("restar_scraper.fetch") as mock_fetch:

            # id 1〜49 は404相当（欠番地帯。MAX_CONSECUTIVE_MISS=5 よりずっと長い）、
            # id 50 で最初の商品が見つかる。
            def fetch_side_effect(url):
                return None if _item_id_of(url) < 50 else b"<html></html>"

            mock_fetch.side_effect = fetch_side_effect
            mock_parse.side_effect = lambda item_id, html: _detail(item_id)

            restar.run()

            saved_ids = [call.args[2].item_id for call in mock_upsert.call_args_list]
            self.assertIn("50", saved_ids)

    def test_still_stops_after_catalog_ends(self):
        """最初の商品が見つかった後は、従来どおり連続404で打ち切ること
        （カタログ末尾を過ぎた欠番地帯を END_ID まで律儀に走査し続けないため）。"""
        with patch.object(restar, "START_ID", 1), \
             patch.object(restar, "END_ID", 100), \
             patch.object(restar, "MAX_CONSECUTIVE_MISS", 5), \
             patch("restar_scraper.sqlite3.connect"), \
             patch("restar_scraper.init_db"), \
             patch("restar_scraper.time.sleep"), \
             patch("restar_scraper.mark_missing_items"), \
             patch("restar_scraper.upsert_item"), \
             patch("restar_scraper.parse_item_detail") as mock_parse, \
             patch("restar_scraper.fetch") as mock_fetch:

            # id 1 だけ商品あり（カタログはこれ1件で終わり）、2以降はずっと404。
            fetched_ids = []

            def fetch_side_effect(url):
                item_id = _item_id_of(url)
                fetched_ids.append(item_id)
                return b"<html></html>" if item_id == 1 else None

            mock_fetch.side_effect = fetch_side_effect
            mock_parse.side_effect = lambda item_id, html: _detail(item_id)

            restar.run()

            # MAX_CONSECUTIVE_MISS=5 を超えたところ（id1 + 5連続404）で打ち切られ、
            # END_ID=100 まで全部叩きに行かないこと。
            self.assertLess(max(fetched_ids), 20)

    def test_gives_up_at_end_id_when_catalog_never_found(self):
        """カタログが1件も見つからないまま(全件404)でも END_ID までは走査し、
        無限ループにはならないこと。"""
        with patch.object(restar, "START_ID", 1), \
             patch.object(restar, "END_ID", 30), \
             patch.object(restar, "MAX_CONSECUTIVE_MISS", 5), \
             patch("restar_scraper.sqlite3.connect"), \
             patch("restar_scraper.init_db"), \
             patch("restar_scraper.time.sleep"), \
             patch("restar_scraper.mark_missing_items"), \
             patch("restar_scraper.upsert_item") as mock_upsert, \
             patch("restar_scraper.fetch") as mock_fetch:

            mock_fetch.return_value = None

            restar.run()

            self.assertEqual(mock_fetch.call_count, 30)
            mock_upsert.assert_not_called()


if __name__ == "__main__":
    unittest.main()
