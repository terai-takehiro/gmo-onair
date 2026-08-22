-- ============================================================
-- 233: 計時・視聴者 — 表示画面の自由配置レイアウト・全案件横断テンプレート
--
-- 設計: docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md
--
-- 独立コピー方式: テンプレートは読み取り専用のプリセットとして残し、
-- タイマーへ「適用」すると liveops_timer_display_layouts へ内容がコピーされる。
-- 適用後にテンプレート側を変更・削除しても、既に適用済みのタイマーには一切影響しない
-- （source_template_id は「どのテンプレートから作られたか」の表示ラベル用途のみ）。
--
-- 後方互換: 既存タイマーは liveops_timer_display_layouts に行を持たないため、
-- TimerDisplayPage.tsx は行が無いときは今までどおり固定3パターンで描画する。
-- データ移行は不要。
--
-- 型は既存 liveops ドメイン（052/221/232）に合わせ TIMESTAMP（非 TZ）に統一する。
-- users.id は TEXT 型（052 のコメントどおり）。
-- ============================================================

-- ── ① テンプレート本体（全案件横断・project_id を持たない・読み取り専用プリセット） ──
CREATE TABLE IF NOT EXISTS liveops_display_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- レイアウトJSON本体。構造は 13-live-display-layout-editor.md §2-2
  -- （version・background・elements[]）。アプリ側で validate する
  -- （不正な形が入っても表示画面側は未設定と同じ扱いにフォールバックする）。
  layout      JSONB NOT NULL,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_liveops_display_templates_active
  ON liveops_display_templates (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_liveops_display_templates_name
  ON liveops_display_templates (name) WHERE deleted_at IS NULL;

-- ── ② タイマー個別の適用済みレイアウト（独立コピー・1タイマーにつき最大1行） ──
CREATE TABLE IF NOT EXISTS liveops_timer_display_layouts (
  timer_id            UUID PRIMARY KEY
    REFERENCES liveops_timers(id) ON DELETE CASCADE,
  layout              JSONB NOT NULL,
  -- 「どのテンプレートから作られたか」の表示ラベル用途のみ。以後の同期には使わない。
  source_template_id  UUID REFERENCES liveops_display_templates(id) ON DELETE SET NULL,
  updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 行が無い timer_id = 未設定（既存タイマー）。表示画面はこの場合だけ
-- 現行の固定3パターン描画（フォールバック）を使う。
