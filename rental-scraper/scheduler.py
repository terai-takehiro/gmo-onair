#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
コンテナの常駐プロセス。run_all.py（TOC＝東京オフラインセンター → レスター →
Postgres同期）を1日1回、指定の時刻に実行し続ける。加えて、本体アプリからの
手動「今すぐ取得」トリガー（qsheet_rental_sync_requests）も同じループでポーリングする。

システムの cron デーモンは使わない — コンテナ内での timezone 設定・
ログの取り回し（`docker logs` にそのまま出したい）が cron だと面倒になるため、
単純な Python のループで足りる（このスクリプト自体がコンテナの CMD になる）。

手動トリガーも HTTP サーバーを別途持たせるのではなく、同じポーリングループの中で
Postgres の qsheet_rental_sync_requests テーブルを見に行く方式にした
（sync_requests.py 参照）。1プロセスの1ループでしか crawl を実行しないため、
定期実行と手動トリガーが同時に来ても直列に処理される（二重実行の心配がない）。

環境変数:
    RENTAL_CRON_HOUR       毎日実行する時刻（0-23、ホストのローカル時刻基準。既定 5）
    RENTAL_RUN_ON_STARTUP  "true" ならコンテナ起動直後にも1回実行する（既定 false）。
                           デプロイ直後に「実際にスクレイピングできているか」を
                           次の実行時刻まで待たずに確認できるようにするためのもの
    DATABASE_URL           手動トリガーの監視に使う。未設定なら手動トリガーの
                           監視自体をスキップする（定期実行はそれでも動く）
"""
import datetime
import logging
import os
import time
from typing import Optional

import run_all
import sync_requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scheduler")

TARGET_HOUR = int(os.environ.get("RENTAL_CRON_HOUR", "5"))
RUN_ON_STARTUP = os.environ.get("RENTAL_RUN_ON_STARTUP", "false").strip().lower() == "true"
DATABASE_URL = os.environ.get("DATABASE_URL")
POLL_SEC = 20


def run_once(request: Optional[dict] = None) -> None:
    label = f"手動（依頼者: {request['requested_by'] or '不明'}）" if request else "定期"
    log.info("=== レンタル機材クロール 実行開始（%s） ===", label)
    try:
        run_all.main()
    except Exception as e:
        # クロール中の例外でコンテナ自体を落とさない。次のスケジュールで再試行する
        # （restart: unless-stopped でコンテナごと再起動を繰り返すより、常駐したまま
        # 待って再挑戦するほうが「1日に何度も再起動ログが残る」事故を避けられる）。
        log.exception("クロール中にエラーが発生しました（次のスケジュールで再試行します）")
        if request and DATABASE_URL:
            try:
                sync_requests.mark_error(DATABASE_URL, request["id"], str(e)[:500])
            except Exception:
                log.exception("%s トリガー行の error 更新に失敗しました", sync_requests.PREFIX)
    else:
        log.info("=== レンタル機材クロール 実行完了 ===")
        if request and DATABASE_URL:
            try:
                sync_requests.mark_done(DATABASE_URL, request["id"])
            except Exception:
                log.exception("%s トリガー行の done 更新に失敗しました", sync_requests.PREFIX)


def main() -> None:
    log.info(
        "スケジューラ起動: 毎日 %02d時 に実行 / 起動直後の実行=%s / 手動トリガー監視=%s",
        TARGET_HOUR, RUN_ON_STARTUP, "有効" if DATABASE_URL else "無効(DATABASE_URL未設定)",
    )

    last_run_date = None

    if RUN_ON_STARTUP:
        run_once()
        last_run_date = datetime.date.today()

    while True:
        now = datetime.datetime.now()
        if now.hour == TARGET_HOUR and last_run_date != now.date():
            run_once()
            last_run_date = now.date()
        elif DATABASE_URL:
            try:
                request = sync_requests.claim_pending_request(DATABASE_URL)
            except Exception:
                log.exception("%s 手動トリガーの確認に失敗しました（次のポーリングで再試行）", sync_requests.PREFIX)
                request = None
            if request:
                run_once(request=request)
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
