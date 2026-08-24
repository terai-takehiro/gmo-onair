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

from common_db import init_db, upsert_item, mark_missing_items, decode_html, ItemDetail, extract_tables_as_dict

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
# これだけ連続で404が続いたら打ち切り。⚠️ **1件も見つかっていない間は適用しない**
# （run() 参照）。商品詳細ページ例として案内されている item277 のとおり、実際の
# 商品IDは START_ID=1 よりだいぶ手前が欠番だらけの可能性がある。見つかる前から
# この閾値で打ち切ると、欠番地帯の途中（40件連続404）で走査自体が止まり、
# レスターだけ0件のまま「取得できていない」状態になる（実際に踏んだ不具合）。
MAX_CONSECUTIVE_MISS = 40
PROGRESS_SYNC_EVERY = 100    # 何件取れるごとに on_progress を呼ぶか（run_all が Postgres へ流す）

SLEEP_SEC = 1.5
TIMEOUT = 15
USER_AGENT = "Rental-Inventory-Bot/1.0 (internal use; contact: your-email@example.com)"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

#  想定していた本来の書式（「￥12,000-(税込)」）。まずこれで厳密に当てる —
# 「税込」の注記まで含めて一致するので、誤って別の金額（送料・保証金等）を
# 拾う可能性が低い
PRICE_RE = re.compile(r"[￥¥]\s*([\d,]+)\s*-?\s*[\(（]税込[\)）]")
# ⚠️ 2026-08-24 追加。上の厳密な書式に一致しない実ページ（「税込」の注記が無い・
# 「円」表記・全角/半角の¥が混ざる等）で価格が1件も取れず「レンタル費用が
# かなり取得できていない」という報告を受けた対処。TOC 側（_extract_price_from_specs）
# と同じ考え方で、まず厳密な書式を試し、駄目なら緩いパターンにフォールバックする。
# 「￥12,000」のように¥記号のみのケースと「12,000円」のように円表記のケースの
# どちらか最初に見つかったものを拾う
PRICE_FALLBACK_RE = re.compile(r"[￥¥]\s*([\d,]+)|([\d,]+)\s*円")
END_MARKER = "レンタルに関するお問い合わせ"

# ⚠️ 2026-08-24 追加。レスターの「ジャンル分けがうまく効いていない」報告への対処。
# 商品ページのスペック表（テーブル）に「カテゴリ」「ジャンル」等の行があれば、
# パンくずの大分類（「レンタル」1本に潰れがちで下記コメント参照）より先に優先する。
# 実サイトの実際の見出し名は未確認のため、候補は広めに複数持たせてある
# （デプロイ後のログに残す診断情報を見て、当たっていない場合は候補を調整すること）
CATEGORY_KEYS = ("カテゴリ", "ジャンル", "分類", "種類", "商品分類", "商品カテゴリ")


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


def _extract_category_from_specs(specs: dict):
    """スペック表（テーブル）の中に「カテゴリ」「ジャンル」等の行があればそれを使う。
    TOC の `_extract_price_from_specs` と同じ考え方のフォールバック。
    見つかれば (category, subcategory) を返す。区切り文字（「/」「、」「＞」等）で
    複数階層が書かれているページも想定し、最初の区切りで category/subcategory に割る。"""
    for key in CATEGORY_KEYS:
        val = specs.get(key)
        if not val:
            continue
        parts = re.split(r"[/／、,＞>]", val)
        parts = [p.strip() for p in parts if p.strip()]
        if not parts:
            continue
        category = parts[0]
        subcategory = parts[1] if len(parts) >= 2 else ""
        return category, subcategory
    return None, None


def parse_item_detail(item_id: str, html: bytes) -> ItemDetail:
    soup = BeautifulSoup(decode_html(html), "html.parser")
    detail = ItemDetail(item_id=item_id, url=ITEM_URL_TMPL.format(id=item_id))

    h1 = soup.find("h1")
    detail.name = h1.get_text(strip=True) if h1 else ""

    detail.images = _extract_images(soup)

    # スペック表（あれば）。価格・カテゴリの両方のフォールバックが参照する
    detail.specs = extract_tables_as_dict(soup)

    page_text = soup.get_text("\n", strip=True)

    m = PRICE_RE.search(page_text)
    if not m:
        m = PRICE_FALLBACK_RE.search(page_text)
    if m:
        price_str = next(g for g in m.groups() if g)
        detail.price_net = int(price_str.replace(",", ""))
        # レスターは「電話/ネット」の価格分けがなく単一価格のためprice_telはNoneのまま

        start = m.end()
        end = page_text.find(END_MARKER, start)
        if end == -1:
            end = start + 1000
        description = re.sub(r"\n+", " ", page_text[start:end]).strip()
        if description:
            detail.specs["description"] = description[:2000]
    else:
        # ⚠️ 厳密な書式・緩いフォールバックのどちらでも取れなかったケース。
        # 実際にどの見出し・書式で価格が出ているのか、デプロイ後のログで
        # 当たりを絞れるよう診断情報を残す（抽出には使わない）。TOC の
        # 「価格取得不可」ログと同じ考え方
        log.warning(
            "価格取得不可: %s（spec keys=%s）",
            detail.url, list(detail.specs.keys())[:10],
        )

    # カテゴリ・ジャンル: まずスペック表の「カテゴリ」「ジャンル」等の行を優先する
    # （2026-08-24 追加。以前はパンくずしか見ておらず、大分類「レンタル」1本に
    # ほぼ全商品が潰れてジャンル分けが効いていなかった）
    category, subcategory = _extract_category_from_specs(detail.specs)
    if category:
        detail.category = category
        detail.subcategory = subcategory or ""
    else:
        # フォールバック: パンくず内のリンクから拾う。レスターの一覧構造は大分類が
        # 「レンタル」で共通のため、これだけでは実質的にジャンル分けにならない
        # ケースが多い（診断ログを残す）
        crumbs = [a.get_text(strip=True) for a in soup.find_all("a", href=True)
                  if "/service/solutions/rental" in a["href"]]
        detail.category = crumbs[-1] if crumbs else "レンタル"
        log.info(
            "カテゴリはパンくずのフォールバックを使用: %s（crumbs=%s, spec keys=%s）",
            detail.url, crumbs, list(detail.specs.keys())[:10],
        )

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
    found_any = False

    for item_id in range(START_ID, END_ID + 1):
        # ⚠️ 1件も見つかっていないうちは打ち切らない。商品IDの若い番号帯が
        # まるごと欠番（START_ID〜実際のカタログ開始IDの間が全部404）だと、
        # MAX_CONSECUTIVE_MISS を最初から効かせると本物のカタログへ辿り着く前に
        # 走査が止まり、レスターだけ0件になる（実際に踏んだ不具合。TOCはカテゴリ
        # 一覧からIDを収集する方式のためこの問題が起きない）。最初の1件を
        # 見つけたあとは、カタログ末尾を過ぎた後の欠番地帯を早めに切り上げる
        # ための本来の目的どおりに使う。
        if found_any and consecutive_miss >= MAX_CONSECUTIVE_MISS:
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
            found_any = True
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
