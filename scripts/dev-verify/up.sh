#!/usr/bin/env bash
# 使い捨ての検証用 Postgres を立てて、マイグレーションと検証用ユーザーまで入れる。
#
# なぜこれがあるか:
#   実装のたびに「実 Postgres で N 項目」の検証をしているが、その土台
#   (initdb → 起動 → マイグレーション → 権限付きユーザー) を毎回書き起こしていた。
#   同じ落とし穴 (下記) を毎回踏み直すのが単純に遅いので、1 本にまとめた。
#
# 使い方:
#   bash scripts/dev-verify/up.sh          # 立ち上げ (既にあれば再利用)
#   bash scripts/dev-verify/up.sh --fresh  # 作り直し
#   source /tmp/onair-verify/env.sh        # 接続情報を環境変数に読み込む
#   bash scripts/dev-verify/down.sh        # 落とす
#
# 落とし穴 (何度も踏んだので明記):
#   - initdb / postgres は root では動かない。`postgres` ユーザーで実行する。
#   - 本番/dev の DB とは別ポート (5433) / 別ディレクトリに完全分離する。
#     環境分離ポリシー上、検証が本番に触れることは絶対にあってはならない。
#   - `user_permissions` の列は `access_level` (`level` ではない)。`id` は既定値なしの TEXT 主キー。
#   - `users.role` の CHECK は `system_admin` / `staff` の 2 値のみ。
#   - `JWT_SECRET` は 32 文字以上ないと起動時に使い捨ての鍵が生成される。
#   - 開発モードの認証は Bearer ではなく `x-user-id` ヘッダー。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK=/tmp/onair-verify
PGDATA="$WORK/pgdata"
PGSOCK="$WORK/sock"
PGPORT=5433
PGDB=onair_verify
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)

if [ "${1:-}" = "--fresh" ]; then
  bash "$ROOT/scripts/dev-verify/down.sh" || true
  rm -rf "$WORK"
fi

mkdir -p "$WORK" "$PGSOCK"
chown -R postgres:postgres "$WORK" 2>/dev/null || true

if [ ! -d "$PGDATA/base" ]; then
  echo "[verify] initdb..."
  su postgres -c "$PGBIN/initdb -D '$PGDATA' -U postgres -A trust" >/dev/null
fi

if ! su postgres -c "$PGBIN/pg_ctl -D '$PGDATA' status" >/dev/null 2>&1; then
  echo "[verify] starting postgres on :$PGPORT ..."
  su postgres -c "$PGBIN/pg_ctl -D '$PGDATA' -o '-p $PGPORT -k $PGSOCK -c listen_addresses=127.0.0.1' -l '$WORK/pg.log' -w start" >/dev/null
fi

su postgres -c "psql -h 127.0.0.1 -p $PGPORT -U postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='$PGDB'\"" \
  | grep -q 1 || su postgres -c "createdb -h 127.0.0.1 -p $PGPORT -U postgres $PGDB"

cat > "$WORK/env.sh" <<EOF
# source これ。検証用の接続情報。
export NODE_ENV=development
# サーバーは DATABASE_URL の 1 本だけを見る (DB_HOST 等の分割変数は読まない)。
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:$PGPORT/$PGDB
export JWT_SECRET=verify-only-secret-not-used-anywhere-else-0123456789
export SKIP_SEED=true
export PORT=3999
EOF

# shellcheck disable=SC1090
source "$WORK/env.sh"

echo "[verify] running migrations..."
npm run db:migrate --silent -w server 2>&1 | tail -3

echo "[verify] seeding verification users..."
PGPASSWORD=postgres psql -h 127.0.0.1 -p $PGPORT -U postgres -d $PGDB -v ON_ERROR_STOP=1 -q <<'SQL'
-- 検証で使う4人。権限の切り分け (見える/書ける/見えない) を毎回この4人で確かめる。
-- 権限モデル単純化（migration 210）後は sales が案件管理・財務管理・カレンダー・
-- 設定・プロジェクト管理をまとめて持つ区画。v-keiri は「一部だけ特定アプリに
-- 絞った臨時アクセス」の例として equipment だけを持たせてある。
INSERT INTO users (id, email, name, role) VALUES
  ('v-admin', 'v-admin@example.com',  '検証 管理者',       'system_admin'),
  ('v-sales', 'v-sales@example.com',  '検証 フルアクセス', 'staff'),
  ('v-keiri', 'v-keiri@example.com',  '検証 限定アクセス', 'staff'),
  ('v-none',  'v-none@example.com',   '検証 権限なし',     'staff')
ON CONFLICT (id) DO NOTHING;

-- 列名は access_level (`level` ではない)。id は TEXT の主キーで既定値が無いので明示する。
INSERT INTO user_permissions (id, user_id, module, access_level) VALUES
  ('vp-sales-sales',      'v-sales', 'sales',     'editor'),
  ('vp-keiri-equipment',  'v-keiri', 'equipment', 'editor')
ON CONFLICT (user_id, module) DO UPDATE SET access_level = EXCLUDED.access_level;
SQL

cat <<EOF

[verify] 準備できました。
  source $WORK/env.sh
  接続: psql -h 127.0.0.1 -p $PGPORT -U postgres -d $PGDB
  検証用ユーザー (開発モードは x-user-id ヘッダーで認証):
    v-admin  system_admin
    v-sales  sales editor (フルアクセスの例)
    v-keiri  equipment editor (限定アクセスの例)
    v-none   権限なし
  停止: bash scripts/dev-verify/down.sh
EOF
