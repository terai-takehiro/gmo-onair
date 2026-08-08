-- 標準工程テンプレート（案件） — v4 案件管理 ⑦
--
-- ── プロジェクト管理とは別系統（ご判断）────────────────────
--
-- `gpm_templates` は既にありますが、**期限の決め方が違います**:
--   - プロジェクト … `days`（前の工程から何日）
--   - 案件         … **実施日からの逆算**（「実施日 -60日」）と受付からの日数
-- 同じ表に押し込むと、片方にしか意味の無い列が並んで読めなくなります。
--
-- ── どの工程を外すかは書かない ──────────────────────────────
--
-- モックは案件の種類ごとに使う工程数が違います
-- （リアルイベント 18 / ハイブリッド 26 / 生放送 24 / 公開収録 22 /
--  収録ありイベント 20 / スタジオ収録 14）。
-- しかし**どの工程を外すのかは書かれていません。**
--
-- 推測で 8 本消すと「この種類では要らない工程」を勝手に決めることになり、
-- しかも消えたことに誰も気づけません。そこで:
--   - **26 本の 1 本だけ**を入れる（モックの `flowSpec` そのまま）
--   - 画面で**複製して削る**（種類ごとの違いは社内で決めてもらう）
--   - 種類との結び付きは `project_types` で持ち、**空 = どの種類でも使える**

CREATE TABLE IF NOT EXISTS project_flow_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  -- この型を使う案件の種類（`projects.project_type`）。**空 = すべての種類**
  project_types TEXT[] NOT NULL DEFAULT '{}',
  -- 最初から入っている型。**消せない**（消すと案件をつくるときに出す物が無くなる）
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT,
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS project_flow_phases (
  id          TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES project_flow_templates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_flow_tasks (
  id          TEXT PRIMARY KEY,
  phase_id    TEXT NOT NULL REFERENCES project_flow_phases(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  -- 担当の職種（営業 / プロデューサー / テクニカル / 全員）。
  -- **人ではなく職種**。v4 は案件担当者という概念を持たない
  role        TEXT,
  -- 期限をどこから数えるか。intake 受付から / event 実施日から
  anchor      TEXT NOT NULL DEFAULT 'event' CHECK (anchor IN ('intake', 'event')),
  -- 符号つき。実施日の 60 日前 = -60、実施日の翌日 = 1
  offset_days INTEGER NOT NULL DEFAULT 0,
  -- 外せない工程か。**外せるものと分けておかないと、
  -- 「全部入れる／全部入れない」の二択になる**
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_flow_phases ON project_flow_phases(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_flow_tasks ON project_flow_tasks(phase_id, sort_order);

-- 案件に工程を入れたかの記録。**二度入れて二重にしない**ため
ALTER TABLE projects ADD COLUMN IF NOT EXISTS flow_applied_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS flow_template_id TEXT;

-- ── モックの 6 段 26 タスク ────────────────────────────────
INSERT INTO project_flow_templates (id, name, description, project_types, is_system, sort_order) VALUES
  ('flow-standard', 'ライブ・収録の標準工程',
   'モックの案をそのまま入れてあります。種類ごとに使う工程が違うときは、複製して要らないものを削ってください。',
   '{}', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_flow_phases (id, template_id, name, sort_order) VALUES
  ('fp-1', 'flow-standard', '引き合い・受注', 1),
  ('fp-2', 'flow-standard', '企画・設計',     2),
  ('fp-3', 'flow-standard', '制作準備',       3),
  ('fp-4', 'flow-standard', '直前',           4),
  ('fp-5', 'flow-standard', '当日',           5),
  ('fp-6', 'flow-standard', '実施後',         6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO project_flow_tasks (id, phase_id, title, role, anchor, offset_days, is_required, sort_order) VALUES
  -- 引き合い・受注
  ('ft-101','fp-1','内容を聞く（目的・配信先・登壇者・尺）','営業','intake',  1, TRUE, 1),
  ('ft-102','fp-1','実施日と会場・スタジオを仮押さえする','営業','intake',  3, TRUE, 2),
  ('ft-103','fp-1','見積を出す','営業','intake',  5, TRUE, 3),
  ('ft-104','fp-1','発注書・契約を受け取る','営業','event', -60, TRUE, 4),
  -- 企画・設計
  ('ft-201','fp-2','実施要件を確定する（配信先・収録の有無・公開範囲）','プロデューサー','event', -55, TRUE, 1),
  ('ft-202','fp-2','技術構成を決める（カメラ・音声・回線）','テクニカル','event', -50, TRUE, 2),
  ('ft-203','fp-2','スタッフをアサインする','プロデューサー','event', -45, TRUE, 3),
  ('ft-204','fp-2','機材を押さえる','テクニカル','event', -40, TRUE, 4),
  ('ft-205','fp-2','会場の下見と回線を確認する','テクニカル','event', -35, FALSE, 5),
  -- 制作準備
  ('ft-301','fp-3','香盤表（進行台本）をつくる','プロデューサー','event', -25, TRUE, 1),
  ('ft-302','fp-3','登壇者・関係者の一覧をもらう','営業','event', -25, FALSE, 2),
  ('ft-303','fp-3','テロップ・映像素材を受け取る','テクニカル','event', -15, FALSE, 3),
  ('ft-304','fp-3','配信URLと公開設定を発行する','テクニカル','event', -14, TRUE, 4),
  ('ft-305','fp-3','運営マニュアルを配る','プロデューサー','event', -10, FALSE, 5),
  -- 直前
  ('ft-401','fp-4','リハーサルの日程を決める','プロデューサー','event',  -9, TRUE, 1),
  ('ft-402','fp-4','搬入・仕込みの計画を出す','テクニカル','event',  -7, TRUE, 2),
  ('ft-403','fp-4','通しリハーサルをやる','全員','event',  -2, TRUE, 3),
  ('ft-404','fp-4','バックアップ回線と緊急連絡網を用意する','テクニカル','event',  -2, TRUE, 4),
  -- 当日
  ('ft-501','fp-5','搬入・セットアップ','テクニカル','event',   0, TRUE, 1),
  ('ft-502','fp-5','接続テストと音声チェック','テクニカル','event',   0, TRUE, 2),
  ('ft-503','fp-5','本番','全員','event',   0, TRUE, 3),
  ('ft-504','fp-5','収録データを回収してバックアップする','テクニカル','event',   0, TRUE, 4),
  -- 実施後
  ('ft-601','fp-6','撤収・機材返却','テクニカル','event',   1, TRUE, 1),
  ('ft-602','fp-6','編集して納品する（アーカイブ公開）','テクニカル','event',  14, FALSE, 2),
  ('ft-603','fp-6','請求する','営業','event',  19, TRUE, 3),
  ('ft-604','fp-6','ふりかえりとお礼の連絡','営業','event',  24, FALSE, 4)
ON CONFLICT (id) DO NOTHING;
