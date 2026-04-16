#!/bin/bash
# 初回起動時に本番DB + 開発DBの両方を作成
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE onair_prod' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onair_prod')\gexec
    SELECT 'CREATE DATABASE onair_dev'  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'onair_dev')\gexec
EOSQL
