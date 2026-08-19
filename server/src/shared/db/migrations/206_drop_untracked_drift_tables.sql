-- ============================================================
-- 206: DBドリフト監査で見つかった未追跡の23テーブル+列2つを削除する
--
-- 経緯（詳細: docs/reviews/db-drift-audit.md）
--
-- migration 200/201 が張り替えた customers/vendors 系FK以外に、実DB（dev・本番）には
-- このリポジトリのどの migration ファイルにも存在しない23テーブル+列2つがあった。
-- GitHubのコミット検索で正体が判明: v2.9.283/284（2026-07-26公開・migration 149/150）で
-- 実装・本番公開された「香盤表」「運営マニュアル」等の機能が、v3.2.0でのUI/UX刷新に
-- 向けた巻き戻し（revertではなく main の指す先を古い状態へ付け替える形）で main の
-- 祖先から外れた。migration は前方向にしか進まないため、テーブルの「形」だけが
-- 両DBに残り続けていた。
--
-- 中身も確認済み（2026-08-19）: 一部（manuals/manual_layouts/manual_parts/
-- project_changes/slack_dm_settings）には実際の運用期間（2026-07-27〜08-01）の
-- 実データが入っていたが、ユーザー（寺井氏）に内容を提示したうえで削除の承認を得た
-- （「こちらは抹殺して大丈夫です」2026-08-19。v4の現行画面のコードからは一切
-- 参照されていないことを確認済み）。
--
-- dev・本番とも行数は完全一致（18テーブル+列2つは0行、5テーブルのみ非ゼロで
-- dev/本番間で1件も食い違わない）ことを確認済みのため、DROPしても実データの
-- 取りこぼしは無いと判断した。

-- 子 → 親の順で削除（FK違反を避けるため CASCADE は使わない。想定外の依存があれば
-- ここで明示的にエラーになり、静かに巻き込み削除することはない）

DROP TABLE IF EXISTS call_sheet_blocks;
DROP TABLE IF EXISTS call_sheet_lanes;
DROP TABLE IF EXISTS call_sheets;

DROP TABLE IF EXISTS external_tool_outputs;

DROP TABLE IF EXISTS inquiry_replies;

DROP TABLE IF EXISTS joint_event_companies;
DROP TABLE IF EXISTS joint_events;

DROP TABLE IF EXISTS keep_agenda_items;
DROP TABLE IF EXISTS keep_theme_notes;
DROP TABLE IF EXISTS keep_meetings;

DROP TABLE IF EXISTS manual_issues;
DROP TABLE IF EXISTS manual_layout_items;
DROP TABLE IF EXISTS manual_layouts;
DROP TABLE IF EXISTS manual_parts;
DROP TABLE IF EXISTS manuals;

DROP TABLE IF EXISTS project_changes;
DROP TABLE IF EXISTS project_comment_mentions;
DROP TABLE IF EXISTS project_comments;

DROP TABLE IF EXISTS slack_digests;
DROP TABLE IF EXISTS slack_dm_settings;
DROP TABLE IF EXISTS user_notification_prefs;
DROP TABLE IF EXISTS user_permission_changes;

DROP TABLE IF EXISTS ai_action_plans;

-- 未追跡の列2つ（既に追跡済みのテーブルに乗っていた分。列を削除すればその列に
-- 付いていたFK制約も一緒に消える）
ALTER TABLE misc_inquiries DROP COLUMN IF EXISTS promoted_project_id;
ALTER TABLE security_card_lendings DROP COLUMN IF EXISTS project_id;
