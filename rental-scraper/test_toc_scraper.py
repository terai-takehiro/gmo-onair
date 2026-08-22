#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
toc_scraper.py の純関数（HTML パース）のテスト。

⚠️ 実サイト（ec.toc-net.jp）の実際の HTML 構造はこのリポジトリのどのセッションからも
確認できていない（README「未検証であることについて」参照。開発環境のサンドボックスは
対象サイトへの外部接続ができない）。ここでの HTML フィクスチャは
「ラベル方式で拾えるケース」「拾えず specs フォールバックで拾えるケース」
「どちらも拾えないケース」という**分岐の形**を検証するためのもので、
実ページと一致する保証はない。実サイトに対する動作確認はデプロイ後のログで行うこと。
"""
import unittest

from bs4 import BeautifulSoup

import toc_scraper as toc


class ExtractPriceNearLabelTest(unittest.TestCase):
    def test_finds_price_next_to_label(self):
        html = '<div><p>電話受付</p><p>3,300円（税込）</p></div>'
        soup = BeautifulSoup(html, "html.parser")
        self.assertEqual(toc._extract_price_near_label(soup, "電話受付"), 3300)

    def test_returns_none_when_label_missing(self):
        html = '<div><p>本体のみ</p></div>'
        soup = BeautifulSoup(html, "html.parser")
        self.assertIsNone(toc._extract_price_near_label(soup, "電話受付"))

    def test_returns_none_when_label_present_but_no_price_nearby(self):
        html = '<div><p>電話受付</p><p>お問い合わせください</p></div>'
        soup = BeautifulSoup(html, "html.parser")
        self.assertIsNone(toc._extract_price_near_label(soup, "電話受付"))

    def test_two_labels_as_flat_sibling_paragraphs_do_not_collide(self):
        """⚠️ 実際に踏んだ回帰テスト。label が `<p>` 直下などフラットな構造だと、
        以前の実装（祖父要素全体から最初の価格）は「電話受付」で検索しても
        後ろの「ネット受付」の価格まで拾ってしまい、両方が同じ値になっていた。"""
        html = """
        <div>
          <p>電話受付</p><p>3,300円（税込）</p>
          <p>ネット受付</p><p>3,000円（税込）</p>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        self.assertEqual(toc._extract_price_near_label(soup, "電話受付"), 3300)
        self.assertEqual(toc._extract_price_near_label(soup, "ネット受付"), 3000)


class ExtractPriceFromSpecsTest(unittest.TestCase):
    """⚠️ 「電話受付」「ネット受付」ラベルが実ページに無いケースのフォールバック。
    既に動いているテーブル抽出（_extract_tables_as_dict）の結果を再利用する。"""

    def test_finds_price_in_ryoukin_key(self):
        specs = {"レンタル料金": "3,300円（税込）/日", "重さ": "1kg"}
        self.assertEqual(toc._extract_price_from_specs(specs), 3300)

    def test_finds_price_in_kakaku_key(self):
        specs = {"価格": "1,500円"}
        self.assertEqual(toc._extract_price_from_specs(specs), 1500)

    def test_returns_none_when_no_matching_key(self):
        specs = {"重さ": "1kg", "サイズ": "W10×H20×D5"}
        self.assertIsNone(toc._extract_price_from_specs(specs))

    def test_returns_none_when_key_matches_but_no_price_pattern(self):
        specs = {"料金": "お問い合わせください"}
        self.assertIsNone(toc._extract_price_from_specs(specs))


class ParseItemDetailPriceFallbackTest(unittest.TestCase):
    """parse_item_detail 全体を通した分岐の確認。"""

    def test_uses_label_price_when_found(self):
        html = """
        <html><body>
        <h1>商品A</h1>
        <p>電話受付</p><p>3,300円（税込）</p>
        <p>ネット受付</p><p>3,000円（税込）</p>
        </body></html>
        """
        detail = toc.parse_item_detail("1", html)
        self.assertEqual(detail.price_tel, 3300)
        self.assertEqual(detail.price_net, 3000)

    def test_falls_back_to_specs_when_labels_missing(self):
        html = """
        <html><body>
        <h1>商品B</h1>
        <table><tr><th>レンタル料金</th><td>2,200円（税込）/日</td></tr></table>
        </body></html>
        """
        detail = toc.parse_item_detail("2", html)
        self.assertIsNone(detail.price_tel)
        self.assertEqual(detail.price_net, 2200)

    def test_logs_warning_when_price_not_found_anywhere(self):
        html = "<html><body><h1>商品C</h1><p>説明のみ</p></body></html>"
        with self.assertLogs(toc.log, level="WARNING") as cm:
            detail = toc.parse_item_detail("3", html)
        self.assertIsNone(detail.price_tel)
        self.assertIsNone(detail.price_net)
        self.assertTrue(any("価格取得不可" in msg for msg in cm.output))


class FetchEncodingTest(unittest.TestCase):
    """⚠️ 実際に踏んだ回帰テスト。以前は `fetch()` が `resp.encoding =
    resp.apparent_encoding`（chardet/charset_normalizer によるバイト列からの推定）で
    デコードしてから文字列を返していたが、実クロールで日本語部分だけ文字化けする
    不具合が起きた（`apparent_encoding` の推定精度は日本語ページで必ずしも高くない）。
    いまは `fetch()` がバイト列を返し、BeautifulSoup 側の自動検出（HTML の
    `<meta charset>` 宣言を見る）に文字コード判定を任せている。ここではその
    「バイト列を BeautifulSoup にそのまま渡せば文字化けしない」という契約を、
    Shift_JIS で実際にエンコードしたページで検証する。"""

    def test_shift_jis_page_with_meta_charset_decodes_correctly(self):
        html_str = (
            '<html><head><meta charset="Shift_JIS"></head><body>'
            "<h1>SONY HVL-LEIR1(ミニLED赤外線ライト)</h1>"
            "</body></html>"
        )
        html_bytes = html_str.encode("shift_jis")  # fetch() が返す形を模す
        detail = toc.parse_item_detail("5061", html_bytes)
        self.assertEqual(detail.name, "SONY HVL-LEIR1(ミニLED赤外線ライト)")

    def test_utf8_page_still_decodes_correctly(self):
        html_str = (
            '<html><head><meta charset="UTF-8"></head><body>'
            "<h1>SONY HXR-NX5R</h1>"
            "</body></html>"
        )
        html_bytes = html_str.encode("utf-8")
        detail = toc.parse_item_detail("5043", html_bytes)
        self.assertEqual(detail.name, "SONY HXR-NX5R")


class ExtractImagesTest(unittest.TestCase):
    def test_collects_device_img_urls_from_img_and_a_tags(self):
        html = """
        <div>
          <img src="/img/device_img/5061/1/photo.jpg">
          <a href="https://ec.toc-net.jp/img/device_img/5061/1/photo_large.jpg">拡大</a>
          <img src="/img/other/5061/unrelated.jpg">
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        images = toc._extract_images(soup, "5061")
        self.assertEqual(
            images,
            [
                "https://ec.toc-net.jp/img/device_img/5061/1/photo.jpg",
                "https://ec.toc-net.jp/img/device_img/5061/1/photo_large.jpg",
            ],
        )

    def test_returns_empty_list_when_no_matching_images(self):
        soup = BeautifulSoup("<div><img src='/img/other/1.jpg'></div>", "html.parser")
        self.assertEqual(toc._extract_images(soup, "5061"), [])


if __name__ == "__main__":
    unittest.main()
