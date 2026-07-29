-- =====================================================================
-- スタジオを使わない案件に入ってしまった「仮押さえ」予約の洗い出しと掃除
--
-- なぜ要るか (v3.0.9 で原因を修正した既存データの後始末):
--   v3.0.8 以前は、案件のステージを「仮押さえ」に動かすと
--   `changeStage` が案件分類を見ずに仮押さえ予約を作っていた。
--   そのため **スタジオを使わないプロジェクト系の案件 (GMO案件・
--   コンサルティング・その他) の仮押さえがスタジオのカレンダーに
--   入っていた**。v3.0.9 で新規発生は止めたが、過去の分は残る。
--
-- 消す対象を絞る考え方 (ここが重要):
--   プロジェクト系の案件でも、**人が手で部屋を予約することはある**
--   (打合せでスタジオの一室を使う等)。それを消してはいけない。
--   ステージ移行で機械的に作られた行だけを対象にするため、
--     booking_type = 'hold'
--     notes       = '案件ステージ移行で自動生成'
--   の2つを条件に入れる (この notes は project.service.ts が入れる印で、
--   studio-booking.service.ts も同じ印で二重登録を消している)。
--
-- 使い方:
--   1. まず ① で件数と中身を確認する (何も変更しない)
--   2. 消してよいと判断できたら ② を実行する (soft delete)
--   3. 間違えたら ③ で戻せる (soft delete なので復元できる)
--
-- 実行前に:
--   DB は3時間ごとに BOX へ自動バックアップされている
--   (CLAUDE.md「DB バックアップ運用」)。念のため直近のバックアップが
--   あることを確認してから実行すること。
-- =====================================================================

-- ── ① 洗い出し (変更しない・まずこれを実行する) ────────────────
--
-- 「スタジオを使わない案件」の判定は v3.0.9 のサーバー実装
-- (resolveStudioUse) と同じ規則にしてある:
--   gls_category = 'B'                         → 使わない
--   gls_category が未設定 かつ 案件種別がB系    → 使わない
--   (A系の案件種別 = offline_event / hybrid_event / live_broadcast / recording)

SELECT
  b.id                AS booking_id,
  b.start_time        AS 開始,
  b.title             AS 予約名,
  b.status            AS 状態,
  p.code              AS 案件コード,
  p.gls_number        AS gls番号,
  p.name              AS 案件名,
  COALESCE(p.gls_category, '(未設定)') AS 案件分類,
  p.project_type      AS 案件種別,
  p.stage             AS ステージ,
  b.created_at        AS 予約作成日時
FROM studio_bookings b
JOIN projects p ON p.id = b.project_id
WHERE b.deleted_at IS NULL
  AND p.deleted_at IS NULL
  -- ステージ移行で機械的に作られた行だけ (人が手で入れた予約は対象外)
  AND b.booking_type = 'hold'
  AND b.notes = '案件ステージ移行で自動生成'
  -- スタジオを使わない案件
  AND (
        UPPER(COALESCE(p.gls_category, '')) = 'B'
     OR (
          UPPER(COALESCE(p.gls_category, '')) NOT IN ('A', 'B')
          AND COALESCE(p.project_type, '') NOT IN
              ('offline_event', 'hybrid_event', 'live_broadcast', 'recording')
        )
      )
ORDER BY b.start_time, p.code;


-- ── ② 掃除 (soft delete)。①の結果を確認してから実行する ────────
--
-- **消した id を先に控えてから消す。**
-- 「直近N分に消えたもの」を戻す書き方にしてはいけない —
-- `studio-booking.service.ts` は本予約が登録されたときに自動生成の仮押さえを
-- soft delete するので、同じ時間帯に**正当に消えた行**が混ざり、
-- 戻すときにそれを蘇らせてしまう (カレンダーに二重の予約が復活する)。
-- 控え表を作って id で突き合わせれば、戻す対象が厳密に決まる。

BEGIN;

CREATE TABLE IF NOT EXISTS tmp_nonstudio_hold_cleanup (
  booking_id TEXT PRIMARY KEY,
  cleaned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 対象を控える (WHERE 句は①と完全に同じ)
INSERT INTO tmp_nonstudio_hold_cleanup (booking_id)
SELECT b.id
FROM studio_bookings b
JOIN projects p ON p.id = b.project_id
WHERE b.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND b.booking_type = 'hold'
  AND b.notes = '案件ステージ移行で自動生成'
  AND (
        UPPER(COALESCE(p.gls_category, '')) = 'B'
     OR (
          UPPER(COALESCE(p.gls_category, '')) NOT IN ('A', 'B')
          AND COALESCE(p.project_type, '') NOT IN
              ('offline_event', 'hybrid_event', 'live_broadcast', 'recording')
        )
      )
ON CONFLICT (booking_id) DO NOTHING;

-- 控えた分だけを消す
UPDATE studio_bookings SET deleted_at = NOW(), updated_at = NOW()
WHERE id IN (SELECT booking_id FROM tmp_nonstudio_hold_cleanup)
  AND deleted_at IS NULL;

-- 件数を確かめてから COMMIT / ROLLBACK
-- COMMIT;
-- ROLLBACK;


-- ── ③ 戻す (控え表の id だけを厳密に戻す) ──────────────────────
--
-- soft delete なので消えていない。②で控えた id だけを戻すので、
-- 同じ時間帯に正当に消えた別の予約を蘇らせることはない。

-- UPDATE studio_bookings SET deleted_at = NULL, updated_at = NOW()
-- WHERE id IN (SELECT booking_id FROM tmp_nonstudio_hold_cleanup);


-- ── ④ 後片付け (掃除の結果に納得できたら控え表を落とす) ─────────

-- DROP TABLE tmp_nonstudio_hold_cleanup;


-- ── 参考: 部屋の紐づけ ────────────────────────────────────────
--
-- studio_booking_rooms は予約に対する子行で、予約が soft delete されれば
-- カレンダーには出ない (一覧は studio_bookings.deleted_at IS NULL で絞る)。
-- 行を消す必要はないが、完全に消したい場合はこちら。②の後に実行する。

-- DELETE FROM studio_booking_rooms
-- WHERE booking_id IN (
--   SELECT id FROM studio_bookings
--   WHERE deleted_at IS NOT NULL
--     AND booking_type = 'hold'
--     AND notes = '案件ステージ移行で自動生成'
-- );
