#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
東京オフラインセンター(TOC) レンタル機材 クロールスクリプト
=========================================================
https://ec.toc-net.jp/rental/item 配下を巡回し、共通DB(rental_items.db)に
company='TOC' として保存する（バッジ・チップ等の固定幅UIで文字数が長すぎたため
「東京オフラインセンター」から短縮 — ご指示）。製品写真URLも取得する。

前提:
- レンタル機材ページ自体はログイン不要
- 商品詳細ページ: https://ec.toc-net.jp/rental/item/{item_id}
- カテゴリ一覧ページ: https://ec.toc-net.jp/rental/item/category?categories_id={category_id}
- 画像URL: https://ec.toc-net.jp/img/device_img/{item_id}/{n}/{filename} 形式

注意:
- レンダリング後テキストを元に解析ロジックを組んでいるため、実際のHTML
  タグ/class名までは確認できていません。初回実行時にログ(パース失敗等)を
  必ず確認してください。
"""
import re
import time
import logging
import sqlite3
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from common_db import init_db, upsert_item, mark_missing_items, ItemDetail

COMPANY = "TOC"
BASE = "https://ec.toc-net.jp"
CATEGORY_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17]
DB_PATH = "rental_items.db"
SLEEP_SEC = 1.5
MAX_PAGES_PER_CATEGORY = 50
TIMEOUT = 15
USER_AGENT = "Rental-Inventory-Bot/1.0 (internal use; contact: your-email@example.com)"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

ITEM_LINK_RE = re.compile(r"/rental/item/(\d+)(?:[/?]|$)")
PRICE_RE = re.compile(r"([\d,]+)\s*円")


def fetch(url: str, retries: int = 3):
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT)
            if resp.status_code == 404:
                log.warning("404 Not Found: %s", url)
                return None
            resp.raise_for_status()
            resp.encoding = resp.apparent_encoding
            return resp.text
        except requests.RequestException as e:
            log.warning("取得失敗(%d/%d) %s : %s", attempt, retries, url, e)
            time.sleep(2 * attempt)
    log.error("取得断念: %s", url)
    return None


def collect_item_ids_for_category(category_id: int) -> set:
    item_ids = set()
    for page in range(1, MAX_PAGES_PER_CATEGORY + 1):
        url = f"{BASE}/rental/item/category?categories_id={category_id}&page={page}"
        html = fetch(url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")
        found_this_page = set()
        for a in soup.find_all("a", href=True):
            m = ITEM_LINK_RE.search(a["href"])
            if m:
                found_this_page.add(m.group(1))

        new_ids = found_this_page - item_ids
        if not new_ids:
            break

        item_ids |= new_ids
        log.info("category=%s page=%d: %d件取得(累計%d件)",
                  category_id, page, len(new_ids), len(item_ids))
        time.sleep(SLEEP_SEC)

    return item_ids


def _extract_price_near_label(soup: BeautifulSoup, label: str):
    node = soup.find(string=re.compile(re.escape(label)))
    if not node:
        return None
    parent = node.parent
    search_scope = parent.find_parent() or parent
    text = search_scope.get_text(" ", strip=True)
    m = PRICE_RE.search(text)
    return int(m.group(1).replace(",", "")) if m else None


def _extract_tables_as_dict(soup: BeautifulSoup) -> dict:
    specs = {}
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 2:
                key = cells[0].get_text(strip=True)
                val = cells[1].get_text(strip=True)
                if key and val:
                    specs[key] = val
    return specs


def _extract_breadcrumb(soup: BeautifulSoup) -> tuple:
    crumbs = []
    for a in soup.find_all("a", href=True):
        if "categories_id=" in a["href"]:
            text = a.get_text(strip=True)
            if text:
                crumbs.append(text)
    category = crumbs[0] if len(crumbs) >= 1 else ""
    subcategory = crumbs[1] if len(crumbs) >= 2 else ""
    return category, subcategory


def _extract_images(soup: BeautifulSoup, item_id: str) -> list:
    """商品画像は https://ec.toc-net.jp/img/device_img/{item_id}/... 形式で
    配置されているため、そのパターンを含むimg/aタグのURLを収集する。"""
    images = []
    pattern = f"/img/device_img/{item_id}/"

    def _add(url_val: str):
        if not url_val:
            return
        full = url_val if url_val.startswith("http") else BASE + url_val
        if full not in images:
            images.append(full)

    for img in soup.find_all("img", src=True):
        if pattern in img["src"]:
            _add(img["src"])
    # 「拡大」リンクなど、<a href="...device_img...">も原寸画像として拾う
    for a in soup.find_all("a", href=True):
        if pattern in a["href"]:
            _add(a["href"])

    return images


def parse_item_detail(item_id: str, html: str) -> ItemDetail:
    soup = BeautifulSoup(html, "html.parser")
    detail = ItemDetail(item_id=item_id, url=f"{BASE}/rental/item/{item_id}")

    h1 = soup.find("h1")
    detail.name = h1.get_text(strip=True) if h1 else ""

    detail.category, detail.subcategory = _extract_breadcrumb(soup)
    detail.price_tel = _extract_price_near_label(soup, "電話受付")
    detail.price_net = _extract_price_near_label(soup, "ネット受付")
    detail.specs = _extract_tables_as_dict(soup)
    detail.images = _extract_images(soup, item_id)

    related = set()
    for a in soup.find_all("a", href=True):
        m = ITEM_LINK_RE.search(a["href"])
        if m and m.group(1) != item_id:
            related.add(m.group(1))
    detail.related_items = sorted(related)

    return detail


def run():
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    # ⚠️ この1回だけ計算し、この関数内の upsert_item / mark_missing_items 全部に
    # 同じ値を渡す。「呼ぶたびに datetime.now()」にすると、数百〜数千件を
    # SLEEP_SEC=1.5秒間隔で取得する実際のクロール（数十分かかる）では商品ごとに
    # last_seen がバラけ、sync_to_postgres.py の compute_statuses()（company ごとの
    # 最新 last_seen とだけ一致させて listed 判定）で最後の1件以外が全部 missing に
    # 誤判定される（common_db.py の upsert_item 冒頭コメント参照。検証環境で実際に踏んだ）。
    run_started_at = datetime.now().isoformat(timespec="seconds")

    all_item_ids = set()
    for cid in CATEGORY_IDS:
        log.info("=== [%s] カテゴリ %s のクロール開始 ===", COMPANY, cid)
        all_item_ids |= collect_item_ids_for_category(cid)

    log.info("[%s] 収集した商品ID数: %d", COMPANY, len(all_item_ids))

    for item_id in sorted(all_item_ids, key=lambda x: int(x)):
        url = f"{BASE}/rental/item/{item_id}"
        html = fetch(url)
        if not html:
            continue
        detail = parse_item_detail(item_id, html)
        if detail.name:
            upsert_item(conn, COMPANY, detail, now=run_started_at)
        else:
            log.warning("パース失敗(name取得不可): %s", url)
        time.sleep(SLEEP_SEC)

    mark_missing_items(conn, COMPANY, all_item_ids, now=run_started_at)
    conn.close()
    log.info("[%s] 完了。DB: %s", COMPANY, DB_PATH)


if __name__ == "__main__":
    run()
