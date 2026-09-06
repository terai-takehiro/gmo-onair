-- 285: 案件・帳簿の行に計上会社の列を足した（2026年10月の事業再編・スキーマのみ）
--
-- 設計の全文: docs/reorg-2026-10-plan.md（§4.3・§4.5・§4.11・§13）
--
-- ⚠️ **ここではまだ NOT NULL にしない・INSERT 文もまだ1つも直さない。**
-- 「実際に entity_code を書き込む・NOT NULL にする」は次のマイグレーション
-- （全INSERT箇所を洗い出す entityCodeInserts テストが通ってから）で行う
-- （`org_transition.state='off'` のあいだ既存の振る舞いを1ミリも変えない・
-- §13 の受け入れ条件）。

-- ── 案件番号（旧 GLS 番号）の後継の置き場 ──────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS entity_code   TEXT REFERENCES legal_entities(code);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS entity_source TEXT CHECK (entity_source IN ('rule', 'manual'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS entity_note   TEXT;

-- ── 案件番号の履歴（改番しても旧番号を消さず全部残す。§4.3）──────
CREATE TABLE IF NOT EXISTS project_numbers (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  number      TEXT NOT NULL UNIQUE,
  entity_code TEXT REFERENCES legal_entities(code),
  scheme      TEXT NOT NULL CHECK (scheme IN ('gls', 'entity')),
  assigned_at TIMESTAMPTZ NOT NULL,
  assigned_by TEXT,
  retired_at  TIMESTAMPTZ,
  reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_numbers_project ON project_numbers(project_id);

-- 既存の gls_number を履歴へ流し込む（scheme='gls'・まだ改番していないので
-- retired_at は NULL・entity_code は当時存在しなかった概念なので NULL のまま）。
-- 発番日時の正確な記録が無いため `won_at`（自動発番の実績）→`updated_at`→
-- `created_at` の順で近似する。
INSERT INTO project_numbers (id, project_id, number, scheme, assigned_at, assigned_by)
SELECT
  'pn-' || p.id,
  p.id,
  p.gls_number,
  'gls',
  COALESCE(p.won_at, p.updated_at, p.created_at),
  p.updated_by
FROM projects p
WHERE p.gls_number IS NOT NULL
ON CONFLICT (number) DO NOTHING;

-- ── 帳簿の行（書いた時の計上会社を持つ。§4.5）────────────────
--
-- revenues/purchases/sga_expenses/estimates は将来 NOT NULL にする予定だが、
-- 既存の INSERT 文をすべて洗い出して entity_code を明示させてからにする
-- （このマイグレーションでは列を足すだけ）。
ALTER TABLE revenues     ADD COLUMN IF NOT EXISTS entity_code TEXT REFERENCES legal_entities(code);
ALTER TABLE purchases    ADD COLUMN IF NOT EXISTS entity_code TEXT REFERENCES legal_entities(code);
ALTER TABLE sga_expenses ADD COLUMN IF NOT EXISTS entity_code TEXT REFERENCES legal_entities(code);
ALTER TABLE estimates    ADD COLUMN IF NOT EXISTS entity_code TEXT REFERENCES legal_entities(code);

-- 受け取った書類は自由記述の gls_number 列と同じ扱い。AI/手入力で分からない
-- こともあるので、これだけは恒久的に NULL 可のまま。
ALTER TABLE finance_docs ADD COLUMN IF NOT EXISTS entity_code TEXT REFERENCES legal_entities(code);

-- ── 会社ぜんぶで1本の設定（P0 では列だけ足す。PK の付け替えと複数行化は
--    財務の2社タブの段で行う・§6 の P2）────────────────────────
--
-- 既存の唯一の行（または既存の全行）はいまの会社＝GSS のものとして扱ってよい
-- ので DEFAULT で埋める。書き込み口は `money-rules.service.ts` の
-- `saveMoneyRules` 1本・月次予算の upsert 1本としぼられているため、
-- revenues 等と違って全箇所を洗い出す必要が無い。
ALTER TABLE money_rules              ADD COLUMN IF NOT EXISTS entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE monthly_budgets          ADD COLUMN IF NOT EXISTS entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
ALTER TABLE monthly_actual_overrides ADD COLUMN IF NOT EXISTS entity_code TEXT NOT NULL DEFAULT 'GSS' REFERENCES legal_entities(code);
