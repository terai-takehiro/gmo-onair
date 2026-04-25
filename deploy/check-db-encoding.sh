#!/bin/bash
# =============================================================================
# DB エンコーディング診断スクリプト
# =============================================================================
# 用途: 本番/開発DBのエンコーディング・ロケール・サンプル日本語データを確認し、
#       文字化け（mojibake）の原因がDB側かアプリ側かを切り分ける。
#
# VPS で実行する想定:
#   chmod +x deploy/check-db-encoding.sh
#   ./deploy/check-db-encoding.sh                # 本番(onair_prod) と 開発(onair_dev)
#   ./deploy/check-db-encoding.sh onair_prod     # 本番のみ
# =============================================================================
set -e

DBS=("$@")
if [ ${#DBS[@]} -eq 0 ]; then
  DBS=("onair_prod" "onair_dev")
fi

CONTAINER="${POSTGRES_CONTAINER:-gmo-onair-db-1}"
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  # docker compose v2 命名規則のフォールバック
  CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '(^|-)db(-|$)' | head -n1 || true)
fi

if [ -z "$CONTAINER" ]; then
  echo "ERROR: PostgreSQL コンテナが見つかりません。POSTGRES_CONTAINER 環境変数で指定してください。" >&2
  exit 1
fi

echo "=== PostgreSQL コンテナ: $CONTAINER ==="
echo ""

run_psql() {
  local db="$1"; shift
  docker exec -i "$CONTAINER" psql -U postgres -d "$db" -At "$@"
}

for DB in "${DBS[@]}"; do
  echo "================================================================"
  echo "  Database: $DB"
  echo "================================================================"

  echo "[1] エンコーディング / ロケール:"
  docker exec -i "$CONTAINER" psql -U postgres -c \
    "SELECT datname, pg_encoding_to_char(encoding) AS encoding, datcollate, datctype
     FROM pg_database WHERE datname = '$DB';"

  echo "[2] クライアント側 client_encoding (現在のセッション):"
  run_psql "$DB" -c "SHOW client_encoding;"
  echo ""

  echo "[3] equipment_items の日本語サンプル (最大5件):"
  run_psql "$DB" -c \
    "SELECT id, name, manufacturer, location_detail
     FROM equipment_items
     WHERE name ~ '[^[:ascii:]]' OR location_detail ~ '[^[:ascii:]]'
     ORDER BY id DESC LIMIT 5;" 2>/dev/null || echo "  (equipment_items テーブルなし、または列違い)"
  echo ""

  echo "[4] バイト列レベルでのサンプル確認 (UTF-8 として正しいか):"
  run_psql "$DB" -c \
    "SELECT name, octet_length(name) AS bytes, char_length(name) AS chars,
            convert_to(name, 'UTF8') = name::bytea AS is_valid_utf8
     FROM equipment_items
     WHERE name ~ '[^[:ascii:]]' LIMIT 3;" 2>/dev/null || echo "  (skipped)"
  echo ""
done

echo "================================================================"
echo " 判定ガイド:"
echo "  - encoding が 'UTF8' でない (例: SQL_ASCII) → DB 移行が必要"
echo "  - encoding は UTF8 だが日本語が ?????? → クライアント側の文字化け"
echo "  - octet_length と char_length の比が 3:1 程度 → 正常な UTF-8 日本語"
echo "  - 同上の比が 1:1 で日本語が崩れて見える → ダブルエンコード疑い"
echo "================================================================"
