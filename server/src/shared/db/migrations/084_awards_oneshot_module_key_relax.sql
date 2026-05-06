-- 084: 1S CG cue state の module_key を緩和して custom モジュールに対応
-- v2.8.76 で追加。柔軟化フェーズ 段階4 の操作 UI 統合に必要。
-- ・CHECK 制約 (preset 7 種限定) を削除
-- ・VARCHAR(20) → VARCHAR(80) に拡張 (custom-{uuid} は 'custom-' + 36 = 43 文字)

-- CHECK 制約を削除 (デフォルト命名規則: <table>_<column>_check)
ALTER TABLE awards_oneshot_cue_state
  DROP CONSTRAINT IF EXISTS awards_oneshot_cue_state_module_key_check;

-- 列幅を拡張
ALTER TABLE awards_oneshot_cue_state
  ALTER COLUMN module_key TYPE VARCHAR(80);
