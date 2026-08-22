#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rental_items.db (SQLite・ステージング) → GMO ONAiR 本体 PostgreSQL
(qsheet_rental_items) への同期
================================================================
common_db.py が書き出す SQLite の items テーブルを読み、company + item_id を
主キーに PostgreSQL の qsheet_rental_items へ upsert する。run_all.py の末尾
（toc_scraper → restar_scraper のあと）から呼ばれる想定。

⚠️ status（'listed' | 'missing'）の決め方について
--------------------------------------------------
SQLite 側の change_log は使わない。change_log は「missing になった」片方向の
遷移しか記録しない（common_db.py の mark_missing_items 参照）ため、一度
missing になった商品がクロールで再出現しても change_log ベースの判定では
永久に missing のままになってしまう。

代わりに、company ごとに「直近のクロール実行の基準時刻」を
    SELECT MAX(last_seen) FROM items WHERE company = ?
で求め、各商品の last_seen がその基準時刻と一致すれば 'listed'
（＝直近のクロールで実際に見つかった）、それより古ければ 'missing'
（＝今回は見つからなかった）とする。ISO8601 文字列は辞書順=時系列順なので
文字列比較で足りる。
"""
import json
import logging
import os
import sqlite3
from typing import Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

PREFIX = "[sync-to-postgres]"

DEFAULT_SQLITE_PATH = "rental_items.db"


def compute_statuses(rows: list[dict]) -> dict[tuple[str, str], str]:
    """items テーブルの全行 (dict のリスト。company/item_id/last_seen を含む) から
    (company, item_id) -> 'listed'|'missing' の対応表を作る純粋関数。

    company ごとの最新 last_seen（＝直近のクロール実行の基準時刻）と一致する
    行を 'listed'、それより古い行を 'missing' とする。company に商品が
    1件も無ければ何も出さない（呼び出し側で自然にスキップされる）。
    """
    latest_by_company: dict[str, str] = {}
    for row in rows:
        company = row["company"]
        last_seen = row["last_seen"] or ""
        if company not in latest_by_company or last_seen > latest_by_company[company]:
            latest_by_company[company] = last_seen

    statuses: dict[tuple[str, str], str] = {}
    for row in rows:
        company = row["company"]
        item_id = row["item_id"]
        last_seen = row["last_seen"] or ""
        baseline = latest_by_company.get(company, "")
        statuses[(company, item_id)] = "listed" if last_seen == baseline else "missing"
    return statuses


def read_items(sqlite_path: str) -> list[dict]:
    """SQLite の items テーブルを dict のリストとして読む。"""
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute("""
            SELECT company, item_id, name, category, subcategory, price_tel,
                   price_net, specs_json, related_json, images_json, url,
                   first_seen, last_seen, last_updated
            FROM items
        """)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def _json_or_default(text: Optional[str], default):
    if not text:
        return default
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        log.warning("%s JSON のパースに失敗しました。既定値で代用します: %r", PREFIX, text)
        return default


def upsert_rows(dsn: str, rows: list[dict], statuses: dict[tuple[str, str], str]) -> tuple[int, int]:
    """rows を PostgreSQL の qsheet_rental_items へ upsert する。
    (upsert件数, missing件数) を返す。psycopg2 接続はここでだけ import する
    （DATABASE_URL 未設定パスではこのモジュールが無くても動くように）。
    """
    import psycopg2
    import psycopg2.extras

    upserted = 0
    missing_count = 0

    conn = psycopg2.connect(dsn, client_encoding="UTF8")
    try:
        with conn:
            with conn.cursor() as cur:
                for row in rows:
                    key = (row["company"], row["item_id"])
                    status = statuses.get(key, "missing")
                    if status == "missing":
                        missing_count += 1

                    specs = _json_or_default(row.get("specs_json"), {})
                    related = _json_or_default(row.get("related_json"), [])
                    images = _json_or_default(row.get("images_json"), [])

                    cur.execute(
                        """
                        INSERT INTO qsheet_rental_items
                            (company, item_id, name, category, subcategory,
                             price_tel, price_net, specs, related_item_ids, images,
                             url, status, first_seen, last_seen, last_updated)
                        VALUES
                            (%s, %s, %s, %s, %s,
                             %s, %s, %s, %s, %s,
                             %s, %s, %s, %s, %s)
                        ON CONFLICT (company, item_id) DO UPDATE SET
                            name = EXCLUDED.name,
                            category = EXCLUDED.category,
                            subcategory = EXCLUDED.subcategory,
                            price_tel = EXCLUDED.price_tel,
                            price_net = EXCLUDED.price_net,
                            specs = EXCLUDED.specs,
                            related_item_ids = EXCLUDED.related_item_ids,
                            images = EXCLUDED.images,
                            url = EXCLUDED.url,
                            status = EXCLUDED.status,
                            last_seen = EXCLUDED.last_seen,
                            last_updated = EXCLUDED.last_updated
                        """,
                        (
                            row["company"], row["item_id"], row["name"], row.get("category"),
                            row.get("subcategory"),
                            row.get("price_tel"), row.get("price_net"),
                            psycopg2.extras.Json(specs),
                            psycopg2.extras.Json(related),
                            psycopg2.extras.Json(images),
                            row.get("url"), status,
                            row.get("first_seen"), row.get("last_seen"), row.get("last_updated"),
                        ),
                    )
                    upserted += 1
    finally:
        conn.close()

    return upserted, missing_count


def run() -> None:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        log.warning("%s DATABASE_URL が未設定のため、PostgreSQL への同期をスキップします", PREFIX)
        return

    sqlite_path = os.environ.get("RENTAL_SQLITE_PATH", DEFAULT_SQLITE_PATH)
    if not os.path.exists(sqlite_path):
        log.warning("%s SQLite ファイルが見つからないため、同期をスキップします: %s", PREFIX, sqlite_path)
        return

    rows = read_items(sqlite_path)
    if not rows:
        log.info("%s items テーブルが空のため、同期対象はありません", PREFIX)
        return

    statuses = compute_statuses(rows)

    try:
        upserted, missing_count = upsert_rows(dsn, rows, statuses)
    except Exception:
        log.exception("%s PostgreSQL への同期中にエラーが発生しました", PREFIX)
        raise

    log.info(
        "%s %d件を upsert しました（うち missing 判定: %d件）",
        PREFIX, upserted, missing_count,
    )


if __name__ == "__main__":
    run()
