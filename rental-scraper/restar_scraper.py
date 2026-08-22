#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
株式会社レスター(Restar) レンタル機材 クロールスクリプト
=============================================================
https://www.restargp.com/service/solutions/rental/ 配下の商品詳細ページを
巡回し、共通DB(rental_items.db)に company='レスター' として保存する。
東京オフラインセンター(TOC・toc_scraper.py)とは別会社としてcompany列で区別される。
製品写真URLも取得する(og:image + 本文中のkuroco-img.appドメイン画像)。

商品詳細ページ例:
    https://www.restargp.com/service/solutions/rental/item277/

重要な制約(要確認):
- レンタル品検索結果ページ(search-result/)は一覧がJavaScriptで動的に
  描画される作りのため、単純なHTML取得では商品一覧を取得できません。
  そのため本スクリプトは商品詳細ページのURL( .../item{ID}/ )のIDを
  START_ID〜END_IDの範囲で連番スキャンし、存在するものだけを収集する
  方式にしています。
    - 実際の最大ID・欠番の分布によっては件数の過不足が出ます。
    - サイト側にAPI(Kuroco CMSの可能性が高い)があれば、そちらを
      直接叩く方式の方が正確・高速です。ブラウザの開発者ツールで
      検索結果ページ表示時のネットワーク通信(XHR/Fetch)を確認し、
      APIエンドポイントが分かれば教えてください。そちらに切り替えます。
"""
import os
import re
import time
import logging
import sqlite3
from datetime import datetime

import requests
from bs4 import BeautifulSoup

from common_db import init_db, upsert_item, mark_missing_items, decode_html, ItemDetail

COMPANY = "レスター"
BASE = "https://www.restargp.com"
ITEM_URL_TMPL = BASE + "/service/solutions/rental/item{id}/"
# ⚠️ sync_to_postgres.py と同じ既定・同じ環境変数を見ること。
# ここだけ固定文字列にしていると、コンテナ側で RENTAL_SQLITE_PATH を
# 別の場所（永続ボリューム）に向けた瞬間に「書き込む先」と「同期が読む先」が
# 食い違い、クロールは成功しているのに1件も反映されない状態になる。
DB_PATH = os.environ.get("RENTAL_SQLITE_PATH", "rental_items.db")

START_ID = 1
END_ID = 800                 # 実際の最大IDが分かり次第調整してください
MAX_CONSECUTIVE_MISS = 40    # これだけ連続で404が続いたら打ち切り
PROGRESS_SYNC_EVERY = 100    # 何件取れるごとに on_progress を呼ぶか（run_all が Postgres へ流す）

SLEEP_SEC = 1.5
TIMEOUT = 15
USER_AGENT = "Rental-Inventory-Bot/1.0 (internal use; contact: your-email@example.com)"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

PRICE_RE = re.compile(r"￥\s*([\d,]+)\s*-?\s*[\(（]税込[\)）]")
END_MARKER = "レンタルに関するお問い合わせ"


def fetch(url: str, retries: int = 3):
    """成功時は**バイト列**（`resp.content`）を返す。toc_scraper.py の fetch() と
    同じ理由（`apparent_encoding` の統計的推定に頼らず、`common_db.decode_html()`
    にデコードを任せる。日本語部分だけ文字化けする不具合の対処。UTF-8 の厳密
    デコードを最優先にする経緯は decode_html() のdocstring参照）。"""
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, timeout=TIMEOUT)
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            return resp.content
        except requests.RequestException as e:
            log.warning("取得失敗(%d/%d) %s: %s", attempt, retries, url, e)
            time.sleep(2 * attempt)
    return None


def _extract_images(soup: BeautifulSoup) -> list:
    """og:imageメタタグ + 本文中のkuroco-img.appドメイン画像を収集する。"""
    images = []

    def _add(url_val: str):
        if url_val and url_val not in images:
            images.append(url_val)

    og = soup.find("meta", attrs={"property": "og:image"})
    if og and og.get("content"):
        _add(og["content"])

    for img in soup.find_all("img", src=True):
        src = img["src"]
        if "kuroco-img.app" in src or "/files/topics/" in src:
            _add(src)

    return images


def parse_item_detail(item_id: str, html: bytes) -> ItemDetail:
    soup = BeautifulSoup(decode_html(html), "html.parser")
    detail = ItemDetail(item_id=item_id, url=ITEM_URL_TMPL.format(id=item_id))

    h1 = soup.find("h1")
    detail.name = h1.get_text(strip=True) if h1 else ""

    detail.images = _extract_images(soup)

    page_text = soup.get_text("\n", strip=True)

    m = PRICE_RE.search(page_text)
    if m:
        detail.price_net = int(m.group(1).replace(",", ""))
        # レスターは「電話/ネット」の価格分けがなく単一価格のためprice_telはNoneのまま

        start = m.end()
        end = page_text.find(END_MARKER, start)
        if end == -1:
            end = start + 1000
        description = re.sub(r"\n+", " ", page_text[start:end]).strip()
        if description:
            detail.specs["description"] = description[:2000]

    # レスターの一覧構造は大分類が「レンタル」で共通のため、パンくずから分かる範囲のみ保存
    crumbs = [a.get_text(strip=True) for a in soup.find_all("a", href=True)
              if "/service/solutions/rental" in a["href"]]
    detail.category = crumbs[-1] if crumbs else "レンタル"

    return detail


def run(on_progress=None):
    """`on_progress(取得済み件数)` を渡すと PROGRESS_SYNC_EVERY 件ごとに呼ぶ。
    run_all.py がここに「Postgres へ途中経過を流す」処理を差し込む
    （1回のクロールは数十分〜1時間超かかるため。完走まで何も出ないと、
    デプロイでコンテナが作り直されるたびに成果が0のままになる）。"""
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    # ⚠️ toc_scraper.py と同じ理由でこの1回だけ計算する。詳細は common_db.py の
    # upsert_item 冒頭コメント参照（検証環境で全件 missing 化を実際に踏んだ）。
    run_started_at = datetime.now().isoformat(timespec="seconds")

    seen_ids = set()
    consecutive_miss = 0

    for item_id in range(START_ID, END_ID + 1):
        if consecutive_miss >= MAX_CONSECUTIVE_MISS:
            log.info("連続%d件404のため打ち切ります(最終試行ID=%d)", MAX_CONSECUTIVE_MISS, item_id)
            break

        url = ITEM_URL_TMPL.format(id=item_id)
        html = fetch(url)
        if not html:
            consecutive_miss += 1
            time.sleep(SLEEP_SEC)
            continue

        consecutive_miss = 0
        detail = parse_item_detail(str(item_id), html)
        if detail.name:
            seen_ids.add(str(item_id))
            upsert_item(conn, COMPANY, detail, now=run_started_at)
            if on_progress and len(seen_ids) % PROGRESS_SYNC_EVERY == 0:
                on_progress(len(seen_ids))
        else:
            log.warning("パース失敗(name取得不可): %s", url)

        time.sleep(SLEEP_SEC)

    mark_missing_items(conn, COMPANY, seen_ids, now=run_started_at)
    conn.close()
    log.info("[%s] 完了。DB: %s", COMPANY, DB_PATH)


if __name__ == "__main__":
    run()
