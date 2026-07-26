#!/usr/bin/env bash
# 検証用 Postgres を止める。データは残すので `up.sh` で再開できる。
# 完全に消したいときは `up.sh --fresh`。
set -uo pipefail
WORK=/tmp/onair-verify
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
if [ -d "$WORK/pgdata" ]; then
  su postgres -c "$PGBIN/pg_ctl -D '$WORK/pgdata' -m fast -w stop" >/dev/null 2>&1 \
    && echo "[verify] stopped" || echo "[verify] not running"
else
  echo "[verify] nothing to stop"
fi
