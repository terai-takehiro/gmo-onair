-- 案件フェーズごとの受注確度（%）— 財務ダッシュボードの営業見通し用（2026-09 依頼）
--
-- ── 何のために要るか ──────────────────────────────────────────
--
-- ご依頼:「案件フェーズに関係なく売上・仕入予定額を登録できるようにし、
-- 財務ダッシュボードで『総額』と『受注確度を加味した見込み額』の両方を
-- 確認できるようにしたい」。売上・仕入の登録自体は v4.5.23 で全フェーズ
-- （失注を除く）に既に開放済み（`project.service.ts` の `getRegisterableProjects`）。
-- 残るのは「確度」という重みの持ち方——初期値は依頼どおり固定するが、
-- 「将来的な調整を考慮し、可能であれば管理画面等から変更できる仕様とする」
-- とあるため、コード定数ではなく DB の1テーブルに持つ（`money_rules` と同じ考え方）。
--
-- ── 行で持つ（列にしない） ────────────────────────────────────
--
-- `projects.stage` の CHECK は無名 (`projects_stage_check`、migration 271 で更新)
-- のドメインを `PROJECT_STAGE`（`server/src/shared/constants/statuses.ts`）と揃えている。
-- 8つの stage 値ぶんの行を持ち、`stage` を主キーにする——`money_rules` のような
-- 「1行だけの表」にすると、フェーズが増えるたびに列を足すことになり
-- `projects_stage_check` の変更（migration 271 のような）と足並みが揃わなくなる。
--
-- ── 初期値 ────────────────────────────────────────────────────
--
-- ご依頼の確度表そのまま:
--   E 問い合わせ=10% / D 要件確認=25% / C 見積・提案=50% / B 決定見込み=80% / A 受注済=100%
-- `r_delivered`（実施済・財務処理中）・`s_completed`（完了）は受注確定後の状態なので
-- `a_won` と同じ 100%。`e_lost`（失注）は 0%（そもそも登録対象外だが、集計側の
-- JOIN で欠番にならないよう行だけは持たせておく）。
CREATE TABLE IF NOT EXISTS project_stage_probabilities (
  stage       TEXT PRIMARY KEY
              CHECK (stage IN ('neta','d_hold','c_proposal','b_verbal','a_won','r_delivered','s_completed','e_lost')),
  probability INTEGER NOT NULL CHECK (probability BETWEEN 0 AND 100),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

INSERT INTO project_stage_probabilities (stage, probability) VALUES
  ('neta', 10),
  ('d_hold', 25),
  ('c_proposal', 50),
  ('b_verbal', 80),
  ('a_won', 100),
  ('r_delivered', 100),
  ('s_completed', 100),
  ('e_lost', 0)
ON CONFLICT (stage) DO NOTHING;
