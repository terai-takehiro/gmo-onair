#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共通DBモジュール（SQLite・ステージング用）
================
複数のレンタル会社(東京オフラインセンター、レスター等)の機材情報を
1つのSQLiteに集約する。company列で必ず会社を区別するため、
自社管理アプリ側では company + item_id で一意に商品を特定できる。

主キー: (company, item_id)

⚠️ ここが最終目的地ではない。GMO ONAiR 本体アプリの PostgreSQL
（qsheet_rental_items）へ入れるのは `sync_to_postgres.py` の役目。
SQLite はスクレイパーの実行結果（差分・掲載終了の履歴を含む）を
そのまま残しておくためのステージング先 — 実際の HTML 構造が未検証な
段階でクロール結果を捨てずに手元で確認できるようにしてある
（rental_db_project_2.md §9「まだ実ネットワークアクセスでの動作確認が
できていない」を踏まえた判断）。
"""
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class ItemDetail:
    item_id: str
    name: str = ""
    category: str = ""
    subcategory: str = ""
    price_tel: Optional[int] = None   # 電話受付価格(会社によっては存在しない)
    price_net: Optional[int] = None   # ネット受付価格 / 通常価格
    specs: dict = field(default_factory=dict)
    related_items: list = field(default_factory=list)
    images: list = field(default_factory=list)   # 製品写真URLのリスト
    url: str = ""


def init_db(conn: sqlite3.Connection):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS items (
        company TEXT NOT NULL,       -- 例: '東京オフラインセンター' / 'レスター'
        item_id TEXT NOT NULL,       -- 各社サイト内での商品ID(会社が違えば同じ番号でも別商品)
        name TEXT,
        category TEXT,
        subcategory TEXT,
        price_tel INTEGER,
        price_net INTEGER,
        specs_json TEXT,
        related_json TEXT,
        images_json TEXT,            -- 製品写真URLのJSON配列
        url TEXT,
        first_seen TEXT,
        last_seen TEXT,
        last_updated TEXT,
        PRIMARY KEY (company, item_id)
    );

    CREATE TABLE IF NOT EXISTS change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company TEXT,
        item_id TEXT,
        field TEXT,
        old_value TEXT,
        new_value TEXT,
        changed_at TEXT
    );
    """)
    # 既存DBをimages_json追加前のバージョンから引き継ぐ場合のマイグレーション
    cols = [r[1] for r in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "images_json" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN images_json TEXT")
    conn.commit()


def upsert_item(conn: sqlite3.Connection, company: str, d: ItemDetail, now: Optional[str] = None):
    """
    `now` は「今回のクロール実行の基準時刻」。**呼び出し側（toc_scraper.run() /
    restar_scraper.run()）が実行開始時に1回だけ計算し、そのクロール中に呼ぶ
    upsert_item / mark_missing_items 全部に同じ値を渡すこと。**

    ここで省略時に `datetime.now()` を毎回計算する実装だと、数百〜数千件を
    SLEEP_SEC=1.5 秒間隔で取得する実際のクロール（数十分かかる）では商品ごとに
    last_seen がバラける。sync_to_postgres.py の compute_statuses() は
    「company ごとの最新 last_seen と一致する行だけを listed とする」判定なので、
    バラけると**最後に処理した1件だけが listed、それ以外全部が missing**と
    誤判定される（実際に検証環境でこの形の全件 missing 化を踏んで発覚した）。
    """
    now = now or datetime.now().isoformat(timespec="seconds")
    cur = conn.cursor()
    cur.execute("""
        SELECT name, price_tel, price_net, specs_json, images_json
        FROM items WHERE company=? AND item_id=?
    """, (company, d.item_id))
    row = cur.fetchone()

    specs_json = json.dumps(d.specs, ensure_ascii=False, sort_keys=True)
    related_json = json.dumps(d.related_items, ensure_ascii=False)
    images_json = json.dumps(d.images, ensure_ascii=False)

    if row is None:
        cur.execute("""
            INSERT INTO items (company, item_id, name, category, subcategory,
                                price_tel, price_net, specs_json, related_json,
                                images_json, url, first_seen, last_seen, last_updated)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (company, d.item_id, d.name, d.category, d.subcategory,
              d.price_tel, d.price_net, specs_json, related_json, images_json,
              d.url, now, now, now))
        print(f"[NEW][{company}] {d.name} (id={d.item_id}) 画像{len(d.images)}枚")
    else:
        old_name, old_price_tel, old_price_net, old_specs_json, old_images_json = row
        changed = False

        def log_change(field_name, old_v, new_v):
            cur.execute("""
                INSERT INTO change_log (company, item_id, field, old_value, new_value, changed_at)
                VALUES (?,?,?,?,?,?)
            """, (company, d.item_id, field_name, str(old_v), str(new_v), now))

        if old_name != d.name:
            log_change("name", old_name, d.name); changed = True
        if old_price_tel != d.price_tel:
            log_change("price_tel", old_price_tel, d.price_tel); changed = True
        if old_price_net != d.price_net:
            log_change("price_net", old_price_net, d.price_net); changed = True
        if old_specs_json != specs_json:
            log_change("specs", old_specs_json, specs_json); changed = True
        if old_images_json != images_json:
            log_change("images", old_images_json, images_json); changed = True

        cur.execute("""
            UPDATE items
            SET name=?, category=?, subcategory=?, price_tel=?, price_net=?,
                specs_json=?, related_json=?, images_json=?, url=?, last_seen=?,
                last_updated=CASE WHEN ? THEN ? ELSE last_updated END
            WHERE company=? AND item_id=?
        """, (d.name, d.category, d.subcategory, d.price_tel, d.price_net,
              specs_json, related_json, images_json, d.url, now, changed, now,
              company, d.item_id))

        if changed:
            print(f"[UPDATED][{company}] {d.name} (id={d.item_id})")

    conn.commit()


def mark_missing_items(conn: sqlite3.Connection, company: str, seen_ids: set, now: Optional[str] = None):
    """今回のクロールで見つからなかった商品(廃番/レンタル終了の可能性)を記録。
    `now` の意味は upsert_item と同じ — 呼び出し側でクロール開始時に1回だけ
    計算したものを渡すこと。"""
    cur = conn.cursor()
    cur.execute("SELECT item_id, name FROM items WHERE company=?", (company,))
    all_rows = cur.fetchall()
    now = now or datetime.now().isoformat(timespec="seconds")
    for item_id, name in all_rows:
        if item_id not in seen_ids:
            cur.execute("""
                SELECT 1 FROM change_log
                WHERE company=? AND item_id=? AND field='status' AND new_value='missing'
                ORDER BY id DESC LIMIT 1
            """, (company, item_id))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO change_log (company, item_id, field, old_value, new_value, changed_at)
                    VALUES (?,?,?,?,?,?)
                """, (company, item_id, "status", "listed", "missing", now))
                print(f"[MISSING?][{company}] {name} (id={item_id}) が一覧から見つかりませんでした")
    conn.commit()
