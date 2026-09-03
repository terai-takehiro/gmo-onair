-- 案件管理＞回の見直し (2026-09 ご依頼)
--
-- ① 回の削除・② 見積は「回ごと」ではなく「ひとまとまり（複数回）」・
-- ③ 回ごとにフェーズを設定できるように・④ 売上・仕入は案件のフェーズを問わず登録可能に
--
-- このファイルは①③のスキーマ変更（②は estimate_episodes 中間テーブル）を担う。
-- ④はスキーマ変更を伴わない（picker の絞り込みをサーバー側で緩めるだけ）。
--
-- ── ① 回の削除 ──────────────────────────────────────────────
--
-- DELETE /:projectId/episodes/:id は migration 087 の時点から存在しており、
-- スキーマ変更は不要（`episodes.deleted_at` によるソフトデリート）。画面に
-- 削除ボタンが無かっただけ。サーバー側に売上・仕入が紐づく回を消せない
-- ガードを足す（`server/src/contexts/production/routes/episodes.routes.ts`）。
--
-- ── ② 見積を「ひとまとまり（複数回）」に ──────────────────────
--
-- 旧来: `estimates.episode_id`（migration 270）は「1見積 : 0〜1回」の単数関係。
-- 依頼: 「1日で複数本撮影したら、その日ひとまとまりで見積を出す」ため、
-- 1つの見積が複数の回をまとめて指すことがある（多対多）。
-- → 既存の `invoice_group_episodes`（migration 001b、請求まとめの中間テーブル）
--   と同じ形の中間テーブル `estimate_episodes` を新設し、`episode_id` 単数列は廃止する。
--
-- 「回の単価」欄（`episodes.episode_unit_price`・migration 269）も、この考え方
-- そのものが無くなる（複数本撮ると回あたりの単価が下がるため「回の単価」という
-- 固定値は成立しない）ため、あわせて削除する。単価は見積・確定売上の金額として
-- ひとまとまり単位で持つ（`estimates.subtotal` / `revenues.amount`）。
CREATE TABLE IF NOT EXISTS estimate_episodes (
  estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  episode_id  TEXT NOT NULL REFERENCES episodes(id)  ON DELETE CASCADE,
  PRIMARY KEY (estimate_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_estimate_episodes_episode ON estimate_episodes (episode_id);

-- 既存データの移行: `estimates.episode_id` が入っている行を中間テーブルへ複製
INSERT INTO estimate_episodes (estimate_id, episode_id)
SELECT id, episode_id FROM estimates WHERE episode_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 旧索引・旧列は役目を終えたので削除。**この列を読む SQL 文字列がサーバー側に
-- 残っていないか `estimate_episodes` への置き換えとあわせて全部追った**
-- （client/CLAUDE.md「列を DROP したらサーバーの SQL 文字列を全部追う」）。
DROP INDEX IF EXISTS idx_estimates_episode;
ALTER TABLE estimates DROP COLUMN IF EXISTS episode_id;

-- 「回の単価」列そのものを削除（この依頼の趣旨そのもの）
ALTER TABLE episodes DROP CONSTRAINT IF EXISTS chk_episodes_episode_unit_price;
ALTER TABLE episodes DROP COLUMN IF EXISTS episode_unit_price;

-- ── ③ 回ごとにフェーズ（案件と同じ受注ステージ）を設定できるように ─────
--
-- 依頼: 「回があるものは、各回（ひとまとまり）ごとにフェーズなどを設定できる
-- ようにする」。フェーズの語彙は案件（`projects.stage`）と同じものを使う
-- （利用者が2つの体系を覚えずに済むように）。**NULL＝この回はまだフェーズを
-- 決めていない**（0件・特定ステージと混同しない・shared/CLAUDE.md の原則）。
-- 案件の GLS 発番・受注確定判定（`WON_STAGES`）等、案件全体の挙動には
-- この列は一切関与しない（回ごとの進捗表示に使うだけの独立した値）。
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS stage TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_episodes_stage') THEN
    ALTER TABLE episodes ADD CONSTRAINT chk_episodes_stage
      CHECK (stage IS NULL OR stage IN
        ('neta','d_hold','c_proposal','b_verbal','a_won','r_delivered','s_completed','e_lost'));
  END IF;
END $$;

COMMENT ON COLUMN episodes.stage IS
  'この回（episode）だけのフェーズ。値は projects.stage と同じ語彙（neta/d_hold/'
  'c_proposal/b_verbal/a_won/r_delivered/s_completed/e_lost）。NULL は「まだ決めていない」'
  '（案件のステージにそのまま従うわけではなく、単に未設定という意味）。回ごとに'
  '進み方が違うレギュラー案件（1日複数本撮り等）で、回単位の進捗を表すために追加'
  '（2026-09 ご依頼・migration 274）。案件全体の GLS 発番・受注確定判定には使わない';

COMMENT ON TABLE estimate_episodes IS
  '見積(estimates)と回(episodes)の多対多。1つの見積が複数の回をまとめて指せる'
  '（依頼: 「見積はひとまとまり毎（1日に複数本撮ればまとめて1本の見積）」）。'
  '旧 estimates.episode_id（単数・migration 270）を置き換える（migration 274）。'
  '行が0件＝案件全体の見積（従来の episode_id IS NULL と同じ意味）';
