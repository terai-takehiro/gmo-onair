-- ============================================================
-- 211: 技術資料アプリ削除（制作資料へのマージに向けて内容を一新するため、
--       現状のアプリ・DBを完全に削除する）
--
-- アプリ本体（client-techsheet/・server/src/contexts/techsheet/）は
-- この migration と同じ PR で削除済み。ここでは DB 側の後始末をする:
--   ① techsheet_documents テーブルを落とす
--   ② 'techsheet' を module に持つ権限行を落とす
--      （user_permissions / permission_role_modules。migration 210 の
--        「フルアクセス」型が7区画から techsheet を持たなくなった対応）
--
-- ⚠️ ロールバックはできない（DROP TABLE）。migration 208
-- （customers/vendors 削除）と同じ扱い。
-- ============================================================

DELETE FROM user_permissions WHERE module = 'techsheet';
DELETE FROM permission_role_modules WHERE module = 'techsheet';

DROP TABLE IF EXISTS techsheet_documents;
