#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
コンテナの常駐プロセス。run_all.py（東京オフラインセンター → レスター →
Postgres同期）を1日1回、指定の時刻に実行し続ける。

システムの cron デーモンは使わない — コンテナ内での timezone 設定・
ログの取り回し（`docker logs` にそのまま出したい）が cron だと面倒になるため、
単純な Python のループで足りる（このスクリプト自体がコンテナの CMD になる）。

環境変数:
    RENTAL_CRON_HOUR       毎日実行する時刻（0-23、ホストのローカル時刻基準。既定 5）
    RENTAL_RUN_ON_STARTUP  "true" ならコンテナ起動直後にも1回実行する（既定 false）。
                           デプロイ直後に「実際にスクレイピングできているか」を
                           次の実行時刻まで待たずに確認できるようにするためのもの
"""
import datetime
import logging
import os
import time

import run_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("scheduler")

TARGET_HOUR = int(os.environ.get("RENTAL_CRON_HOUR", "5"))
RUN_ON_STARTUP = os.environ.get("RENTAL_RUN_ON_STARTUP", "false").strip().lower() == "true"
POLL_SEC = 60


def run_once() -> None:
    log.info("=== レンタル機材クロール 実行開始 ===")
    try:
        run_all.main()
    except Exception:
        # クロール中の例外でコンテナ自体を落とさない。次のスケジュールで再試行する
        # （restart: unless-stopped でコンテナごと再起動を繰り返すより、常駐したまま
        # 待って再挑戦するほうが「1日に何度も再起動ログが残る」事故を避けられる）。
        log.exception("クロール中にエラーが発生しました（次のスケジュールで再試行します）")
    else:
        log.info("=== レンタル機材クロール 実行完了 ===")


def main() -> None:
    log.info(
        "スケジューラ起動: 毎日 %02d時 に実行 / 起動直後の実行=%s",
        TARGET_HOUR, RUN_ON_STARTUP,
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
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    main()
