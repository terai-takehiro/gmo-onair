#!/bin/bash
# 初回起動時に本番DB + 開発DBの両方を作成
# 必ず UTF-8 エンコーディング + C.UTF-8 ロケールで作成し、日本語の文字化けを防ぐ。
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE onair_prod ENCODING ''UTF8'' LC_COLLATE ''C.UTF-8'' LC_CTYPE ''C.UTF-8'' TEMPLATE template0'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onair_prod')\gexec
    SELECT 'CREATE DATABASE onair_dev  ENCODING ''UTF8'' LC_COLLATE ''C.UTF-8'' LC_CTYPE ''C.UTF-8'' TEMPLATE template0'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onair_dev')\gexec
EOSQL
