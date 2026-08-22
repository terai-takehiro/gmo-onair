#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
東京オフラインセンター/レスター 両社分をまとめて実行し、GMO ONAiR 本体の
PostgreSQL（qsheet_rental_items）へ同期する。cronにはこのファイル1本を
登録すればOK。
例: 0 5 * * * cd /path/to/rental-scraper && /usr/bin/python3 run_all.py >> crawl.log 2>&1

流れ: 東京オフラインセンター → レスター → SQLite(rental_items.db) → Postgres 同期
（sync_to_postgres.py 参照。DATABASE_URL が無ければ同期はスキップしてログに残す
 — スクレイパー自体は失敗させない）。
"""
import logging
import toc_scraper
import restar_scraper
import sync_to_postgres

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

if __name__ == "__main__":
    log.info("### 東京オフラインセンター 開始 ###")
    toc_scraper.run()

    log.info("### レスター 開始 ###")
    restar_scraper.run()

    log.info("### rental_items.db → PostgreSQL 同期 開始 ###")
    sync_to_postgres.run()

    log.info("### 全件完了 ###")
