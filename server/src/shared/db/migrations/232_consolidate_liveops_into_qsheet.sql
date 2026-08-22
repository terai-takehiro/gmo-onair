-- ============================================================
-- 232: 権限区画「liveops」を「qsheet」へ統合する
--
-- 経緯: docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md §9 の
-- 未決事項（権限区画は liveops のまま残すか qsheet に寄せるか）に対し、
-- 計時・視聴者のミニアプリ化フェーズ2の着手にあたりユーザーが「qsheet に統合する」
-- と明示的に決定した。手口は migration 210（権限モデル単純化）の MAX 集約と同じ
-- パターンを踏襲する（レベルを下げる方向には倒さない）。
--
-- 統合後、`requirePermission('liveops', ...)` は全ルートから消え
-- （`server/src/contexts/liveops/routes/*.ts` はすべて `requirePermission('qsheet', ...)`
-- に変更済み）、`module = 'liveops'` を判定するコードは無くなる。
-- ============================================================

-- ── ① user_permissions（実際の判定テーブル）の liveops を qsheet へ MAX 集約 ──
CREATE TEMP TABLE _qsheet_collapsed AS
SELECT user_id,
       MAX(CASE access_level
             WHEN 'manager' THEN 3
             WHEN 'editor'  THEN 2
             ELSE 1
           END) AS rank
  FROM user_permissions
 WHERE module IN ('qsheet', 'liveops')
 GROUP BY user_id;

DELETE FROM user_permissions
 WHERE module IN ('qsheet', 'liveops');

INSERT INTO user_permissions (id, user_id, module, access_level)
SELECT gen_random_uuid()::text, user_id, 'qsheet',
       CASE rank WHEN 3 THEN 'manager' WHEN 2 THEN 'editor' ELSE 'reader' END
  FROM _qsheet_collapsed;

DROP TABLE _qsheet_collapsed;

-- ── ② permission_role_modules（型の中身）も同じ形で統合 ────────────────
CREATE TEMP TABLE _role_qsheet_collapsed AS
SELECT role_id,
       MAX(CASE access_level WHEN 'manager' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END) AS rank
  FROM permission_role_modules
 WHERE module IN ('qsheet', 'liveops')
 GROUP BY role_id;

DELETE FROM permission_role_modules
 WHERE module IN ('qsheet', 'liveops');

INSERT INTO permission_role_modules (role_id, module, access_level)
SELECT role_id, 'qsheet', CASE rank WHEN 3 THEN 'manager' WHEN 2 THEN 'editor' ELSE 'reader' END
  FROM _role_qsheet_collapsed;

DROP TABLE _role_qsheet_collapsed;
