-- 086: インタラクティブ外部公開 API + 表彰CG (Awards) 連携リンク
--
-- 目的:
--   インタラクティブ演出 (interactive_*) の クイズ/アンケート 集計結果を
--   表彰CG (awards_*) から API 経由で取り込めるようにする。
--   将来インタラクティブを別 VPS に切り出す前提で、サーバー間通信は
--   X-API-Key ヘッダー方式で保護する。
--
--   1) interactive_api_keys — Interactive 側で発行する API キー (SHA-256 ハッシュで保存)
--   2) awards_events.interactive_link — Awards イベント単位の Interactive 連携設定
--
-- 設計:
--   - キー本体は発行時に一度だけクライアントに返し、DB には key_hash のみ保存
--   - scope は将来用 (現状は "read" のみを想定)
--   - awards_events.interactive_link は JSONB で:
--       {
--         baseUrl: string,
--         apiKeyId: uuid,           // 参照用 (本体は別管理 or env)
--         apiKeyMasked: string,     // 表示用マスク "ak_••••1234"
--         apiKeySecret: string,     // v1: 暗号化なし保存 (社内限定運用、後の SSO で改善)
--         eventId: string,          // interactive 側の event id
--         mapping: {
--           [interactiveQuestionId]: {
--             mode: "choices-as-entries",
--             targetField: "points" | "own_points",
--             choiceMap: { [choiceIndex]: awardsEntryId }
--           }
--         }
--       }

CREATE TABLE IF NOT EXISTS interactive_api_keys (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         VARCHAR(200) NOT NULL,
  key_prefix   VARCHAR(16) NOT NULL,
  key_hash     VARCHAR(128) NOT NULL UNIQUE,
  scope        JSONB NOT NULL DEFAULT '["read"]',
  created_by   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_interactive_api_keys_hash
  ON interactive_api_keys(key_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE awards_events
  ADD COLUMN IF NOT EXISTS interactive_link JSONB;
