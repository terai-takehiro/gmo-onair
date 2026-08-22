#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
東京オフラインセンター(TOC)/レスター 両社分をまとめて実行し、GMO ONAiR 本体の
PostgreSQL（qsheet_rental_items）へ同期する。cronにはこのファイル1本を
登録すればOK。
例: 0 5 * * * cd /path/to/rental-scraper && /usr/bin/python3 run_all.py >> crawl.log 2>&1

流れ: TOC → 同期 → レスター → 同期（さらにクロール中も100件ごとに同期）
（sync_to_postgres.py 参照。DATABASE_URL が無ければ同期はスキップしてログに残す
 — スクレイパー自体は失敗させない）。

⚠️ **「全部終わってから1回だけ同期」にしないこと。** 2社ぶんのクロールは
SLEEP_SEC=1.5秒 × 数百〜数千件で数十分〜1時間超かかる。検証環境のコンテナは
main へのマージのたびに作り直されるので、マージが立て込む日は完走できず、
最後にしか同期しない作りだと**画面には永久に1件も出ない**（実際に踏んだ）。

`main()` を公開している。scheduler.py（コンテナの常駐プロセス）から
`import run_all; run_all.main()` として呼ばれる想定。CLI から直接
`python3 run_all.py` で叩く使い方（cron 登録）とどちらでも同じ経路を通る。
"""
import logging
import toc_scraper
import restar_scraper
import sync_to_postgres

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def _sync_progress(saved: int) -> None:
    """クロール中の途中経過を Postgres へ流す。**ここでは絶対に例外を投げない** —
    同期先の一時的な不調でクロール（1時間かけて集めている最中）を巻き添えに
    しないため。最後の同期は main() で行い、そちらは失敗を隠さない。"""
    log.info("### 途中経過 %d件 → PostgreSQL へ同期 ###", saved)
    try:
        sync_to_postgres.run()
    except Exception:
        log.exception("途中経過の同期に失敗しました（クロールは続行します）")


def main():
    log.info("### TOC 開始 ###")
    toc_scraper.run(on_progress=_sync_progress)
    log.info("### TOC 分を PostgreSQL へ同期 ###")
    sync_to_postgres.run()

    log.info("### レスター 開始 ###")
    restar_scraper.run(on_progress=_sync_progress)
    log.info("### レスター 分を PostgreSQL へ同期 ###")
    sync_to_postgres.run()

    log.info("### 全件完了 ###")


if __name__ == "__main__":
    main()
