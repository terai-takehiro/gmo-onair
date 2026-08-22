#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共通DBモジュール（SQLite・ステージング用）
================
複数のレンタル会社(TOC＝東京オフラインセンター、レスター等)の機材情報を
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


def decode_html(content: bytes) -> str:
    """クロールで取得した HTML のバイト列を文字列にデコードする。

    優先順位:
    1. UTF-8 として**厳密**デコード（`errors="strict"`）を試す。実在の日本語混じり
       テキストが、たまたま別のエンコーディングとしても妥当な UTF-8 に見える
       ことはまず無いため、ここで成功すれば「正しい UTF-8 だった」とほぼ確定できる
    2. 失敗すれば CP932（Shift_JIS の Windows 拡張。日本語ECサイトで非UTF-8といえば
       まずこれ）を厳密デコードで試す
    3. それも失敗すれば EUC-JP を試す
    4. すべて失敗した場合のみ `BeautifulSoup` の `UnicodeDammit`
       （`<meta charset>` 宣言・BOM・それも無ければ chardet 系の統計的推定）に委ねる

    ⚠️ 経緯: 最初は `requests` の `resp.apparent_encoding`（chardet/charset_normalizer
    による統計的推定）でデコードしており、日本語ページで誤判定して文字化けした。
    次の修正で「`fetch()` はバイト列を返し、`BeautifulSoup(html, "html.parser")` の
    自動検出に委ねる」形にしたが、**実ページに `<meta charset>` 宣言が無い場合、
    UnicodeDammit も内部的には同じ chardet 系の統計的推定にフォールバックする**ため、
    根本原因（統計的推定に日本語混じりの短いテキストで頼っている点）は変わっていなかった
    （実際に文字化けが直っていないと報告された）。ここでは統計的推定に頼る前に、
    「厳密デコードが成功するか」という**確定的な**判定を優先することで、
    統計的推定に頼る場面自体を減らす。

    既にデコード済みの `str` を渡された場合はそのまま返す（テストのフィクスチャ等、
    呼び出し側次第でどちらも来うるため）。
    """
    if isinstance(content, str):
        return content
    for enc in ("utf-8", "cp932", "euc-jp"):
        try:
            return content.decode(enc, errors="strict")
        except UnicodeDecodeError:
            continue
    from bs4 import UnicodeDammit
    return UnicodeDammit(content).unicode_markup or content.decode("utf-8", errors="replace")


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
        company TEXT NOT NULL,       -- 例: 'TOC' / 'レスター'
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
        status TEXT NOT NULL DEFAULT 'listed',  -- 'listed'(掲載中) | 'missing'(今回のクロールで見つからなかった)
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
    # 既存DBを古いバージョンから引き継ぐ場合のマイグレーション
    cols = [r[1] for r in conn.execute("PRAGMA table_info(items)").fetchall()]
    if "images_json" not in cols:
        conn.execute("ALTER TABLE items ADD COLUMN images_json TEXT")
    if "status" not in cols:
        # 既存行は「今まで通り掲載中」から始める。次のクロール完走時に
        # mark_missing_items が実態に合わせて missing へ倒す
        conn.execute("ALTER TABLE items ADD COLUMN status TEXT NOT NULL DEFAULT 'listed'")
    conn.commit()


def upsert_item(conn: sqlite3.Connection, company: str, d: ItemDetail, now: Optional[str] = None):
    """
    `now` は「今回のクロール実行の基準時刻」。**呼び出し側（toc_scraper.run() /
    restar_scraper.run()）が実行開始時に1回だけ計算し、そのクロール中に呼ぶ
    upsert_item / mark_missing_items 全部に同じ値を渡すこと。**

    ここで省略時に `datetime.now()` を毎回計算する実装だと、数百〜数千件を
    SLEEP_SEC=1.5 秒間隔で取得する実際のクロール（数十分かかる）では商品ごとに
    last_seen がバラける。画面の「最終取得日時」は company ごとの
    MAX(last_seen) を「その会社を最後にクロールした時刻」として出しているので、
    バラけると表示が「最後の1件を取った時刻」にずれる。

    （かつては status の判定自体がこの last_seen の一致で行われていて、
    バラけると**最後の1件以外が全部 missing** に誤判定されていた。いまは
    status を items 列として明示的に持つのでその形では壊れない。）
    """
    now = now or datetime.now().isoformat(timespec="seconds")
    cur = conn.cursor()
    cur.execute("""
        SELECT name, price_tel, price_net, specs_json, images_json, status
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
                                images_json, url, first_seen, last_seen, last_updated,
                                status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'listed')
        """, (company, d.item_id, d.name, d.category, d.subcategory,
              d.price_tel, d.price_net, specs_json, related_json, images_json,
              d.url, now, now, now))
        print(f"[NEW][{company}] {d.name} (id={d.item_id}) 画像{len(d.images)}枚")
    else:
        old_name, old_price_tel, old_price_net, old_specs_json, old_images_json, old_status = row
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
        # 一度 missing にした商品が再び見つかったら listed に戻す（掲載再開）。
        # change_log は片方向（listed→missing）しか残していなかったため、
        # 復活を記録できるようにここで両方向を残す
        if old_status != "listed":
            log_change("status", old_status, "listed")
            print(f"[RELISTED][{company}] {d.name} (id={d.item_id}) が再び掲載されています")

        cur.execute("""
            UPDATE items
            SET name=?, category=?, subcategory=?, price_tel=?, price_net=?,
                specs_json=?, related_json=?, images_json=?, url=?, last_seen=?,
                last_updated=CASE WHEN ? THEN ? ELSE last_updated END,
                status='listed'
            WHERE company=? AND item_id=?
        """, (d.name, d.category, d.subcategory, d.price_tel, d.price_net,
              specs_json, related_json, images_json, d.url, now, changed, now,
              company, d.item_id))

        if changed:
            print(f"[UPDATED][{company}] {d.name} (id={d.item_id})")

    conn.commit()


def mark_missing_items(conn: sqlite3.Connection, company: str, seen_ids: set, now: Optional[str] = None):
    """今回のクロールで見つからなかった商品(廃番/レンタル終了の可能性)に
    status='missing' を立てる。`now` の意味は upsert_item と同じ — 呼び出し側で
    クロール開始時に1回だけ計算したものを渡すこと。

    ⚠️ **クロールを完走したときだけ呼ぶこと。** 途中で止まった回で呼ぶと、
    まだ見に行っていない商品まで「掲載終了」にしてしまう。
    """
    cur = conn.cursor()
    cur.execute("SELECT item_id, name, status FROM items WHERE company=?", (company,))
    all_rows = cur.fetchall()
    now = now or datetime.now().isoformat(timespec="seconds")
    for item_id, name, status in all_rows:
        if item_id not in seen_ids and status != "missing":
            cur.execute("""
                INSERT INTO change_log (company, item_id, field, old_value, new_value, changed_at)
                VALUES (?,?,?,?,?,?)
            """, (company, item_id, "status", status, "missing", now))
            cur.execute(
                "UPDATE items SET status='missing' WHERE company=? AND item_id=?",
                (company, item_id),
            )
            print(f"[MISSING?][{company}] {name} (id={item_id}) が一覧から見つかりませんでした")
    conn.commit()
