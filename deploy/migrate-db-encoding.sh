#!/bin/bash
# =============================================================================
# DB エンコーディング移行スクリプト (危険: 本番ではユーザー承認後のみ実行)
# =============================================================================
# 既存のクラスタ/DBが SQL_ASCII など非UTF8 で作成されてしまっている場合、
# pg_dump → DROP → CREATE (UTF8) → restore で修正する。
#
# 前提:
#   - check-db-encoding.sh で encoding が UTF8 でない事を確認済み
#   - ユーザー（運用者）の明示承認を得ている
#   - 直前に pgdata ボリュームのバックアップを取っている
#
# 使い方 (VPSで):
#   chmod +x deploy/migrate-db-encoding.sh
#   ./deploy/migrate-db-encoding.sh onair_prod         # 実行
#   ./deploy/migrate-db-encoding.sh onair_prod --dry   # ダンプのみ取得して中断
# =============================================================================
set -euo pipefail

DB="${1:-}"
MODE="${2:-run}"

if [ -z "$DB" ]; then
  echo "Usage: $0 <db_name> [--dry]" >&2
  exit 1
fi

CONTAINER="${POSTGRES_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E '(^|-)db(-|$)' | head -n1)}"
if [ -z "$CONTAINER" ]; then
  echo "ERROR: PostgreSQL コンテナが見つかりません。" >&2
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
DUMP_HOST="/root/${DB}-encoding-fix-${TS}.sql"
DUMP_CONTAINER="/tmp/${DB}-encoding-fix-${TS}.sql"

echo "===================================================================="
echo "  DB: $DB"
echo "  Container: $CONTAINER"
echo "  Dump (host): $DUMP_HOST"
echo "===================================================================="

echo "[1/5] 現在のエンコーディングを確認..."
docker exec -i "$CONTAINER" psql -U postgres -c \
  "SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate, datctype
   FROM pg_database WHERE datname = '$DB';"

echo ""
echo "[2/5] pg_dump 取得 (UTF-8 出力)..."
docker exec -i "$CONTAINER" sh -c \
  "PGCLIENTENCODING=UTF8 pg_dump -U postgres --encoding=UTF8 -d '$DB' -f '$DUMP_CONTAINER'"
docker cp "$CONTAINER:$DUMP_CONTAINER" "$DUMP_HOST"
echo "  -> $DUMP_HOST に保存しました ($(du -h "$DUMP_HOST" | cut -f1))"

if [ "$MODE" = "--dry" ]; then
  echo ""
  echo "[--dry] ダンプのみ取得して終了。実行する場合は --dry なしで再実行してください。"
  exit 0
fi

echo ""
read -r -p "[確認] $DB を DROP して UTF-8 で作り直します。よろしいですか? (yes/N): " ANS
if [ "$ANS" != "yes" ]; then
  echo "中断しました。"
  exit 1
fi

echo ""
echo "[3/5] アプリ停止 (app_prod / app_dev)..."
docker compose stop app_prod app_dev || true

echo ""
echo "[4/5] DB を DROP & 再作成 (UTF-8 / C.UTF-8)..."
docker exec -i "$CONTAINER" psql -U postgres -d postgres <<EOSQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DB;
CREATE DATABASE $DB ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;
EOSQL

echo ""
echo "[5/5] ダンプを restore..."
docker exec -i "$CONTAINER" sh -c \
  "PGCLIENTENCODING=UTF8 psql -U postgres -d '$DB' -f '$DUMP_CONTAINER'"

echo ""
echo "アプリ再起動..."
docker compose start app_prod app_dev

echo ""
echo "完了。確認:"
docker exec -i "$CONTAINER" psql -U postgres -c \
  "SELECT datname, pg_encoding_to_char(encoding) AS encoding FROM pg_database WHERE datname = '$DB';"
