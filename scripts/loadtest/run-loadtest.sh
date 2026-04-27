#!/usr/bin/env bash
# インタラクティブスタンプ 負荷試験ヘルパー
# 使い方: ./scripts/loadtest/run-loadtest.sh <VUS> [DURATION]
#   例: ./scripts/loadtest/run-loadtest.sh 1000 5m

set -euo pipefail

VUS="${1:-100}"
DURATION="${2:-3m}"

: "${TEST_BASE_URL:=https://dev.gmo-onair.jp}"
: "${TEST_EVENT_ID:?TEST_EVENT_ID環境変数を設定してください (対象イベントUUID)}"

if ! command -v k6 >/dev/null 2>&1; then
  echo "ERROR: k6 がインストールされていません。https://k6.io/docs/get-started/installation/" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==========================================="
echo "  GMO ONAiR スタンプ負荷試験"
echo "==========================================="
echo "  対象URL  : $TEST_BASE_URL"
echo "  イベント : $TEST_EVENT_ID"
echo "  VUS      : $VUS"
echo "  期間     : $DURATION (+ ramp 60s + cool 30s)"
echo "==========================================="

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_DIR="$SCRIPT_DIR/results"
mkdir -p "$RESULT_DIR"

VUS="$VUS" DURATION="$DURATION" \
TEST_BASE_URL="$TEST_BASE_URL" TEST_EVENT_ID="$TEST_EVENT_ID" \
k6 run \
  --out json="$RESULT_DIR/loadtest_${VUS}vu_${TIMESTAMP}.json" \
  "$SCRIPT_DIR/stamp-loadtest.js" \
  | tee "$RESULT_DIR/loadtest_${VUS}vu_${TIMESTAMP}.log"

echo
echo "結果ログ: $RESULT_DIR/loadtest_${VUS}vu_${TIMESTAMP}.log"
