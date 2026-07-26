-- 142: 権限の変更履歴 (誰が・いつ・どの行を どう変えたか)
--
-- これまでは `user_permissions.updated_at` しか無く「いつ」だけが分かる状態で、
-- 画面にも「誰が変えたかは記録していません」と書いていた。
-- 「なぜこの人だけ見えないのか」を後から追えるようにするための台帳。
--
-- **1行 = 1モジュールの変化**にしてある (保存1回でまとめて1行にすると
-- 「どの行がどう変わったか」が読めず、追跡に使えない)。
-- 消さない (soft-delete も持たない) — 消せる監査記録は監査にならない。

CREATE TABLE IF NOT EXISTS user_permission_changes (
  id             TEXT PRIMARY KEY,
  -- 権限を変えられた人
  target_user_id TEXT NOT NULL REFERENCES users(id),
  -- 変えた人。users を消しても履歴が壊れないよう FK は張らず、名前も**そのとき**の値を残す
  actor_id       TEXT,
  actor_name     TEXT,
  module         TEXT NOT NULL,
  -- NULL = その時点で権限なし (追加 / 削除もこの2列で表せる)
  before_level   TEXT,
  after_level    TEXT,
  -- 'manual' か 'template:<id>' (役割テンプレートを当てた保存かどうか)
  source         TEXT NOT NULL DEFAULT 'manual',
  changed_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_permission_changes_target
  ON user_permission_changes(target_user_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_permission_changes_actor
  ON user_permission_changes(actor_id, changed_at DESC);
