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

from bs4 import BeautifulSoup

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


class ParseItemDetailPriceTest(unittest.TestCase):
    """⚠️ 2026-08-24 の回帰テスト。「レンタル費用がかなり取得できていない」報告への
    対処。以前は「￥12,000-(税込)」という1パターンの正規表現だけで、これに一致
    しないページ（税込の注記が無い・円表記・半角¥ 等）は診断ログすら残さず
    price_net が None のまま静かに失われていた。"""

    def test_uses_strict_format_when_present(self):
        html = "<html><body><h1>商品A</h1>￥12,000-(税込)本体のみ<br>レンタルに関するお問い合わせ</body></html>"
        detail = restar.parse_item_detail("1", html.encode("utf-8"))
        self.assertEqual(detail.price_net, 12000)

    def test_falls_back_to_yen_format_without_zeikomi_note(self):
        """「(税込)」の注記が無い・¥ ではなく円表記のページ。"""
        html = "<html><body><h1>商品B</h1>レンタル価格: 8,000円/日</body></html>"
        detail = restar.parse_item_detail("2", html.encode("utf-8"))
        self.assertEqual(detail.price_net, 8000)

    def test_falls_back_to_half_width_yen_mark(self):
        html = "<html><body><h1>商品C</h1>価格 ¥5,500 (送料別)</body></html>"
        detail = restar.parse_item_detail("3", html.encode("utf-8"))
        self.assertEqual(detail.price_net, 5500)

    def test_logs_warning_and_leaves_price_none_when_not_found_anywhere(self):
        html = "<html><body><h1>商品D</h1>お問い合わせください</body></html>"
        with self.assertLogs(restar.log, level="WARNING") as cm:
            detail = restar.parse_item_detail("4", html.encode("utf-8"))
        self.assertIsNone(detail.price_net)
        self.assertTrue(any("価格取得不可" in msg for msg in cm.output))


class ParseItemDetailCategoryTest(unittest.TestCase):
    """⚠️ 2026-08-24 の回帰テスト。「ジャンル分けがうまく効いていない」報告への対処。
    以前はパンくず内の '/service/solutions/rental' を含むリンクのうち**最後の1つ**
    だけを category にしていたため、パンくずの大分類「レンタル」自体や、本文中の
    無関係な同ドメインリンク（末尾に出やすい）が拾われ、実質ジャンル分けが機能して
    いなかった。まずスペック表の「カテゴリ」「ジャンル」等の行を優先するようにした。"""

    def test_uses_category_row_in_spec_table_when_present(self):
        html = """
        <html><body>
        <h1>商品A</h1>
        <table><tr><th>カテゴリ</th><td>カメラ／レンズ</td></tr></table>
        ￥12,000-(税込)
        </body></html>
        """
        detail = restar.parse_item_detail("1", html.encode("utf-8"))
        self.assertEqual(detail.category, "カメラ")
        self.assertEqual(detail.subcategory, "レンズ")

    def test_uses_genre_row_as_alternate_key(self):
        html = """
        <html><body>
        <h1>商品B</h1>
        <table><tr><th>ジャンル</th><td>照明</td></tr></table>
        </body></html>
        """
        detail = restar.parse_item_detail("2", html.encode("utf-8"))
        self.assertEqual(detail.category, "照明")
        self.assertEqual(detail.subcategory, "")

    def test_falls_back_to_breadcrumb_and_logs_when_no_spec_row(self):
        html = """
        <html><body>
        <h1>商品C</h1>
        <a href="/service/solutions/rental/">レンタル</a>
        </body></html>
        """
        with self.assertLogs(restar.log, level="INFO") as cm:
            detail = restar.parse_item_detail("3", html.encode("utf-8"))
        self.assertEqual(detail.category, "レンタル")
        self.assertTrue(any("パンくずのフォールバック" in msg for msg in cm.output))


class ExtractCategoryFromSpecsTest(unittest.TestCase):
    def test_splits_on_slash_into_category_and_subcategory(self):
        specs = {"カテゴリ": "音響／マイク"}
        self.assertEqual(restar._extract_category_from_specs(specs), ("音響", "マイク"))

    def test_returns_none_when_no_matching_key(self):
        specs = {"重さ": "1kg"}
        self.assertEqual(restar._extract_category_from_specs(specs), (None, None))

    def test_single_value_has_empty_subcategory(self):
        specs = {"分類": "配信機材"}
        self.assertEqual(restar._extract_category_from_specs(specs), ("配信機材", ""))


if __name__ == "__main__":
    unittest.main()
