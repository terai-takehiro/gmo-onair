#!/bin/bash
# PostgreSQL初期化時に複数データベースを作成する
# docker-entrypoint-initdb.d/ に配置して使用

set -e

echo "=== 追加データベースを作成中 ==="

# Qsheet用データベース
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  SELECT 'CREATE DATABASE qsheet_db'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'qsheet_db')\gexec
  GRANT ALL PRIVILEGES ON DATABASE qsheet_db TO $POSTGRES_USER;
EOSQL

echo "=== データベース作成完了: onair_db, qsheet_db ==="
