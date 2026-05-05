-- 083: 1S CG cue state に bilingual フラグ追加 + イベント別 module_config (動的モジュール構成) 追加
-- v2.8.74 で追加。
--   ・bilingual: 日英両方表示モード (default false)
--   ・module_config: イベントごとの ModuleDef[] を JSONB で保存 (柔軟化フェーズ 段階3)
--     未設定時はクライアント側のデフォルトプリセット (presetModules.ts) にフォールバック

-- 1) cue state に bilingual を追加
ALTER TABLE awards_oneshot_cue_state
  ADD COLUMN IF NOT EXISTS bilingual BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) awards_events に module_config を追加 (NULL 許容、未設定 = デフォルトプリセット使用)
ALTER TABLE awards_events
  ADD COLUMN IF NOT EXISTS module_config JSONB;
