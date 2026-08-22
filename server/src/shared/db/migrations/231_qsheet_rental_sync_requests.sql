-- レンタル機材検索: 手動「今すぐ取得」トリガーの受け渡しキュー。
--
-- rental_scraper_dev（Python の常駐プロセス・scheduler.py）は HTTP サーバーを
-- 持たない単純なポーリングループのままにする設計（rental-scraper/README.md 参照）。
-- そのため、本体アプリ（Node/Express）から「今すぐクロールしてほしい」を伝える手段が
-- 無かった。この行を Postgres 越しのキューとして使う:
--   1. 本体アプリが 'pending' 行を1件 INSERT する（POST /qsheet/rental/sync-trigger）
--   2. scheduler.py がポーリングでこの行を見つけて 'running' に更新（claim）→
--      run_all.main() を実行 → 'done'/'error' で締める
-- 同時に複数リクエストを受け付けないよう、サーバー側で pending/running 中は
-- 新規INSERTを断る（rental.service.ts の triggerSync 参照）。
CREATE TABLE qsheet_rental_sync_requests (
  id UUID PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX qsheet_rental_sync_requests_status_idx
  ON qsheet_rental_sync_requests (status, requested_at);
