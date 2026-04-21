-- 機材管理: ユーザー定義カスタム列
-- scope: 'personal' = 作成者のみ表示, 'shared' = 全員表示

CREATE TABLE equipment_custom_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  col_type TEXT NOT NULL DEFAULT 'text', -- text | checkbox | number
  scope TEXT NOT NULL DEFAULT 'personal', -- personal | shared
  created_by TEXT,  -- user_id (personal の場合のみ意味を持つ)
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE equipment_custom_values (
  equipment_id UUID NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES equipment_custom_columns(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (equipment_id, column_id)
);

CREATE INDEX idx_custom_values_equipment_id ON equipment_custom_values(equipment_id);
CREATE INDEX idx_custom_values_column_id ON equipment_custom_values(column_id);
CREATE INDEX idx_custom_columns_scope ON equipment_custom_columns(scope);
CREATE INDEX idx_custom_columns_created_by ON equipment_custom_columns(created_by);
