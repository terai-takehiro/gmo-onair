#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rental_items.db (SQLite・ステージング) → GMO ONAiR 本体 PostgreSQL
(qsheet_rental_items) への同期
================================================================
common_db.py が書き出す SQLite の items テーブルを読み、company + item_id を
主キーに PostgreSQL の qsheet_rental_items へ upsert する。run_all.py から
**1社のクロールが終わるたび・さらにクロール中も一定件数ごとに**呼ばれる
（1回のクロールは数十分〜1時間超かかるので、全部終わってからしか同期しないと
その間ずっと画面が古いまま／空のままになる）。何度呼んでも upsert なので安全。

⚠️ status（'listed' | 'missing'）の決め方について
--------------------------------------------------
SQLite の items.status をそのまま持ってくる（common_db.py の upsert_item が
'listed'、クロール完走時の mark_missing_items が 'missing' を立てる）。

以前はここで「company ごとの MAX(last_seen) と一致する行だけ listed」と
時刻で推定していたが、2つの理由でやめた:
  1. クロールが途中で止まった回（デプロイでコンテナが作り直された等）に
     同期すると、まだ見に行っていない商品が全部 missing に倒れ、画面から
     機材が消える。**途中経過を随時 Postgres へ流せない**作りだった。
  2. 商品ごとに last_seen がわずかにズレただけで全件 missing になる
     （検証環境で実際に踏んだ。common_db.py の upsert_item の注記参照）。
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


def read_items(sqlite_path: str) -> list[dict]:
    """SQLite の items テーブルを dict のリストとして読む。

    status 列が無い古い rental_items.db（common_db.init_db を通していない
    手持ちのファイル）も読めるように、無ければ 'listed' で補う。
    """
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(items)").fetchall()]
        status_col = "status" if "status" in cols else "'listed' AS status"
        cur = conn.execute(f"""
            SELECT company, item_id, name, category, subcategory, price_tel,
                   price_net, specs_json, related_json, images_json, url,
                   first_seen, last_seen, last_updated, {status_col}
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


def upsert_rows(dsn: str, rows: list[dict]) -> tuple[int, int]:
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
                    status = row.get("status") or "listed"
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

    try:
        upserted, missing_count = upsert_rows(dsn, rows)
    except Exception:
        log.exception("%s PostgreSQL への同期中にエラーが発生しました", PREFIX)
        raise

    log.info(
        "%s %d件を upsert しました（うち missing 判定: %d件）",
        PREFIX, upserted, missing_count,
    )


if __name__ == "__main__":
    run()
