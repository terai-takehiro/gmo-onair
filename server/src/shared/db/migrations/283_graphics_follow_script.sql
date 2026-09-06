-- ============================================================
-- 283: テロップCG — 台本に追従（段E・1番）
--
-- docs/design/v4/graphics-redesign.md §9「進行台本との連携」3番「本番で追従」・
-- §12-2（既定OFF・番組ごとにONにできる。切替は①テロップ一覧のヘッダー付近）の実装。
--
-- ONの番組では、進行（OnAir）画面で現在の行が進むと、②本番モードのNEXTが
-- その行に対応するテロップへ自動で移る（クライアント側 useScriptFollow.ts が
-- Socket `/techops` の `cue:sync` を購読して判定する——サーバー側のこの列は
-- 「ONかどうか」を保存するだけで、追従の判定・実行そのものはクライアント側の責務）。
--
-- ⚠️ **TAKEは自動化しない**（動くのはNEXTだけ・§9 3番の決めごと）。この列は
-- あくまで「追従するかどうか」のスイッチであり、送出そのものの自動化フラグではない。
--
-- 既定値は FALSE（＝台本に追従は既定OFF。§12-2の決定と一致。slot_exit_rules
-- （migration 252）と同じくオプトイン——設定した番組だけが使う）。
-- ============================================================

ALTER TABLE graphics_projects ADD COLUMN IF NOT EXISTS follow_script BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN graphics_projects.follow_script IS
  '台本に追従（段E・既定OFF）。ONの番組は進行画面の現在行に合わせて本番モードのNEXTが自動で移る。TAKEは対象外——常に人が押す。';
