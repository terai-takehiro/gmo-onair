#!/bin/bash
# scripts/setup-backup-cron.sh — v2.7.12
#
# VPS host で 1 度だけ実行: DB バックアップを 3 時間ごとに BOX へアップロードする
# cron エントリを root のクロンタブに追加する。
#
# 使い方:
#   sudo bash /root/gmo-onair/scripts/setup-backup-cron.sh
#
# 構成:
#   - 0  *\/3 * * *  prod  (毎 3 時間ちょうど; 00:00, 03:00, 06:00, …)
#   - 30 *\/3 * * *  dev   (30 分後にズラして同時実行を回避)
#   - ログは /var/log/gmo-onair-backup.log に追記
#   - ログローテーションは logrotate に任せる (別途設定推奨)
#
# 既存エントリがあればスキップ (冪等)。

set -eu

LOG_FILE="/var/log/gmo-onair-backup.log"
PROD_CONTAINER="gmo-onair-app_prod-1"
DEV_CONTAINER="gmo-onair-app_dev-1"

# Docker Compose のコンテナ名は環境によって異なる。実在するものを優先採用。
detect_container() {
  local pattern="$1"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E "$pattern" | head -1 || true
}

PROD_NAME="$(detect_container 'app_prod')"
DEV_NAME="$(detect_container 'app_dev')"

if [ -z "$PROD_NAME" ]; then
  echo "[setup] ⚠ app_prod コンテナが見つかりません。docker compose up -d 後に再実行してください"
  exit 1
fi
if [ -z "$DEV_NAME" ]; then
  echo "[setup] ℹ app_dev コンテナが見つかりません。dev のバックアップはスキップします"
fi

# ログファイル準備
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

# 既存 crontab を取得 (空なら空文字)
EXISTING="$(crontab -l 2>/dev/null || true)"

CRON_PROD="0 */3 * * * docker exec $PROD_NAME node /app/server/scripts/backup-db-to-box.mjs >> $LOG_FILE 2>&1"
CRON_DEV="30 */3 * * * docker exec $DEV_NAME node /app/server/scripts/backup-db-to-box.mjs >> $LOG_FILE 2>&1"

NEW="$EXISTING"

# prod
if echo "$EXISTING" | grep -qF "backup-db-to-box.mjs" | grep -qF "$PROD_NAME"; then
  echo "[setup] prod 用 cron エントリは既に存在します"
else
  NEW="$(printf '%s\n%s\n' "$NEW" "$CRON_PROD")"
  echo "[setup] + prod cron 追加: $CRON_PROD"
fi

# dev
if [ -n "$DEV_NAME" ]; then
  if echo "$EXISTING" | grep -F "backup-db-to-box.mjs" | grep -qF "$DEV_NAME"; then
    echo "[setup] dev 用 cron エントリは既に存在します"
  else
    NEW="$(printf '%s\n%s\n' "$NEW" "$CRON_DEV")"
    echo "[setup] + dev cron 追加: $CRON_DEV"
  fi
fi

# crontab 更新 (空白行を整理)
echo "$NEW" | grep -v '^$' | crontab -

echo ""
echo "[setup] 完了。現在の cron エントリ:"
crontab -l | grep "backup-db-to-box" || true

echo ""
echo "[setup] 動作テスト (今すぐ 1 回実行):"
echo "  docker exec $PROD_NAME node /app/server/scripts/backup-db-to-box.mjs"
if [ -n "$DEV_NAME" ]; then
  echo "  docker exec $DEV_NAME node /app/server/scripts/backup-db-to-box.mjs"
fi
echo ""
echo "[setup] ログ確認: tail -f $LOG_FILE"
