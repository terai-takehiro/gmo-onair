-- =====================================================================
-- カレンダーの二重登録 (同じ予定が2行) の洗い出しと掃除
--
-- 対象は3つの表。画面は /schedule 1本だがレイヤーで重ねて出しているだけ:
--   studio_bookings    スタジオの予約・仮押さえ
--   personal_events    個人予定 (手入力 + ICS購読 + Google + Outlook)
--   partner_schedules  代休/有給/出張 など
--
-- 「表記揺らぎがある」= 完全一致では見つからない。
-- タイトルは経路ごとに作り方が違う (実装から確認):
--   project.service.ts:678          '<案件名> 仮押さえ'
--   StudioBookingDialog.tsx:257     '<案件名> (YY/MM/DD)'
--   action-executor.service.ts:267  AI が読み取った自由文 (無ければ '仮押さえ')
--   PartnerScheduleDialog.tsx:82    種別ラベルが既定だが自由入力 (有給/有休/有給休暇)
-- そのため **タイトルは主キーにしない**。時間帯・案件・部屋・取込キーで突き合わせ、
-- タイトルは「揺らぎを潰した形」でだけ補助的に使う。
--
-- 日時 (start_time / end_time) は TEXT で形が3種類ある (実装から確認):
--   終日      'YYYY-MM-DD'                  (all_day=1)
--   UI 由来   'YYYY-MM-DDTHH:MM'            (input type=time は分まで)
--   MCP 由来  'YYYY-MM-DDTHH:MM:SS'         (studio.tools.ts:127 の例が秒つき)
-- 文字列で比べると同じ時刻が別物になるので、必ず timestamp に直してから重なりを見る。
--
-- 使い方:
--   ⓪ 形の揃っていない行を数える (変更しない)
--   ① 重複候補を出す (変更しない)。確度 A/B/C が付く
--   ② 確度A だけを控え表に控えて soft delete する
--   ③ 間違えたら控え表の id だけを厳密に戻す
--   ④ 納得できたら控え表を落とす
--
-- 実行前に: DB は3時間ごとに BOX へ自動バックアップされている
-- (CLAUDE.md「DB バックアップ運用」)。直近のバックアップを確認してから実行する。
--
-- ★ 重要 ★ personal_events の同期由来の行 (source in ics/google/outlook) は
--   **消しても15分後に別 id で戻ってくる**。取込側の existing 検索が
--   deleted_at IS NULL で絞っており (google-calendar.service.ts:351)、
--   一意索引も partial (deleted_at IS NULL) なので再 INSERT が通る。
--   → 消す前に「どちらの取込経路を止めるか」を決めること (⑤ を読む)。
-- =====================================================================


-- ═════════════════════════════════════════════════════════════════════
-- ⓪ 日時の形が揃っていない行を数える (変更しない)
-- ═════════════════════════════════════════════════════════════════════
SELECT 'studio_bookings' AS 表, COUNT(*) AS 件数,
       COUNT(*) FILTER (WHERE start_time !~ '^\d{4}-\d{2}-\d{2}')            AS 日付として読めない,
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) = 16)       AS 分まで,
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) > 16)       AS 秒つき,
       COUNT(*) FILTER (WHERE all_day = 1 AND length(start_time) > 10)       AS 終日なのに時刻つき,
       COUNT(*) FILTER (WHERE start_time LIKE '%Z' OR start_time LIKE '%+%') AS タイムゾーンつき
FROM studio_bookings WHERE deleted_at IS NULL
UNION ALL
SELECT 'personal_events', COUNT(*),
       COUNT(*) FILTER (WHERE start_time !~ '^\d{4}-\d{2}-\d{2}'),
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) = 16),
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) > 16),
       COUNT(*) FILTER (WHERE all_day = 1 AND length(start_time) > 10),
       COUNT(*) FILTER (WHERE start_time LIKE '%Z' OR start_time LIKE '%+%')
FROM personal_events WHERE deleted_at IS NULL
UNION ALL
SELECT 'partner_schedules', COUNT(*),
       COUNT(*) FILTER (WHERE start_time !~ '^\d{4}-\d{2}-\d{2}'),
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) = 16),
       COUNT(*) FILTER (WHERE all_day = 0 AND length(start_time) > 16),
       COUNT(*) FILTER (WHERE all_day = 1 AND length(start_time) > 10),
       COUNT(*) FILTER (WHERE start_time LIKE '%Z' OR start_time LIKE '%+%')
FROM partner_schedules WHERE deleted_at IS NULL;


-- ═════════════════════════════════════════════════════════════════════
-- ① 洗い出し 1/3: studio_bookings
--
-- 突き合わせの規則 (上から順に確度が高い):
--   A-1 同じ案件 + 同じ部屋 + 時間帯が重なる
--   A-2 同じ案件 + 時間帯が重なる + どちらかが仮押さえ (hold)
--   B-1 表記を潰したタイトルが一致 + 時間帯が重なる   ← 案件が片方だけ紐づいている形
--   B-2 同じ案件 + 同じ種別 + 時間帯が重なる
--   C   同じ部屋が二重に押さえられている (別の予定かもしれない。要目視)
-- 時間帯が重ならないものは重複としない (同じ日の「設営」と「本番」を消さないため)。
-- ═════════════════════════════════════════════════════════════════════
WITH src AS (
  SELECT b.id, b.title, b.booking_type, b.status, b.project_id, b.episode_id,
         b.all_day, b.start_time, b.end_time, b.notes, b.created_at, b.created_by,
         -- 表記を潰す (NFKC の代わり: 全角英数→半角 / 全角カナ→ひらがな /
         -- 括弧の中を捨てる / 工程を表す語を捨てる / 記号と空白を捨てる)
         regexp_replace(
           regexp_replace(
             translate(
               lower(regexp_replace(COALESCE(b.title,''), '[（(【\[［].*?[）)】\]］]', '', 'g')),
               '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ　ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
               '0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
             ),
             '(仮押さえ|仮おさえ|仮押え|仮予約|本番|りはーさる|りは|収録|撮影|設営|仕込み|仕込|撤去|撤収|打合せ|打ち合わせ|確定|予約)', '', 'g'),
           '[[:space:]\-‐‑–—−ー~〜･・.,/／_|｜:：;；#＃()（）]', '', 'g') AS ntitle,
         CASE WHEN b.start_time ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN b.all_day = 1 OR length(b.start_time) < 16
                THEN substr(b.start_time,1,10)::timestamp
                ELSE replace(substr(b.start_time,1,16),'T',' ')::timestamp END END AS ts_start,
         CASE WHEN COALESCE(NULLIF(b.end_time,''), b.start_time) ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN b.all_day = 1 OR length(COALESCE(NULLIF(b.end_time,''), b.start_time)) < 16
                THEN substr(COALESCE(NULLIF(b.end_time,''), b.start_time),1,10)::timestamp + interval '1 day'
                ELSE replace(substr(COALESCE(NULLIF(b.end_time,''), b.start_time),1,16),'T',' ')::timestamp END END AS ts_end
  FROM studio_bookings b
  WHERE b.deleted_at IS NULL
), rooms AS (
  SELECT booking_id, array_agg(room_id ORDER BY room_id) AS room_ids
  FROM studio_booking_rooms GROUP BY booking_id
), x AS (
  SELECT s.*, COALESCE(r.room_ids, '{}'::text[]) AS room_ids,
         s.ts_start AS t0,
         GREATEST(COALESCE(s.ts_end, s.ts_start), s.ts_start + interval '1 minute') AS t1
  FROM src s LEFT JOIN rooms r ON r.booking_id = s.id
)
SELECT
  CASE
    WHEN a.project_id IS NOT NULL AND a.project_id = c.project_id AND a.room_ids && c.room_ids
      THEN 'A 同じ案件・同じ部屋・時間帯が重なる'
    WHEN a.project_id IS NOT NULL AND a.project_id = c.project_id
         AND (a.booking_type = 'hold' OR c.booking_type = 'hold')
      THEN 'A 同じ案件で仮押さえと重なっている'
    WHEN a.ntitle <> '' AND a.ntitle = c.ntitle
      THEN 'B 表記を揃えると同じ名前で時間帯が重なる'
    WHEN a.project_id IS NOT NULL AND a.project_id = c.project_id AND a.booking_type = c.booking_type
      THEN 'B 同じ案件・同じ種別で時間帯が重なる'
    ELSE 'C 同じ部屋が二重に押さえられている (要目視)'
  END AS 確度,
  p.code AS 案件コード, COALESCE(p.name,'(案件なし)') AS 案件名,
  a.id AS 候補A_id, a.title AS 候補A_名前, a.booking_type AS 候補A_種別,
  a.status AS 候補A_状態, a.start_time AS 候補A_開始, a.end_time AS 候補A_終了,
  array_length(a.room_ids,1) AS 候補A_部屋数, a.notes AS 候補A_備考,
  a.created_by AS 候補A_入力者, a.created_at AS 候補A_作成,
  c.id AS 候補B_id, c.title AS 候補B_名前, c.booking_type AS 候補B_種別,
  c.status AS 候補B_状態, c.start_time AS 候補B_開始, c.end_time AS 候補B_終了,
  array_length(c.room_ids,1) AS 候補B_部屋数, c.notes AS 候補B_備考,
  c.created_by AS 候補B_入力者, c.created_at AS 候補B_作成
FROM x a
JOIN x c ON a.id < c.id
LEFT JOIN projects p ON p.id = COALESCE(a.project_id, c.project_id)
WHERE a.t0 IS NOT NULL AND c.t0 IS NOT NULL
  AND a.t0 < c.t1 AND c.t0 < a.t1
  AND (
        (a.project_id IS NOT NULL AND a.project_id = c.project_id
          AND (a.booking_type = 'hold' OR c.booking_type = 'hold'
               OR a.booking_type = c.booking_type OR a.room_ids && c.room_ids))
     OR (a.ntitle <> '' AND a.ntitle = c.ntitle)
     OR (a.room_ids && c.room_ids)
      )
ORDER BY 確度, a.start_time, a.id;


-- ═════════════════════════════════════════════════════════════════════
-- ① 洗い出し 2/3: personal_events
--
--   A-1 一方の external_event_id が他方の ics_key の '@' 前と一致
--       = 書き戻した手入力予定を取り込み直している (揺らぎに一切依存しない)
--   A-2 双方の ics_key の '@' 前が一致
--       = 同じカレンダーを ICS購読 と OAuth の両方から入れている
--   A-3 同じ経路・同じ開始時刻・同じ名前 = 二度押し
--   B   開始時刻が同じ / 時間帯が重なる + 表記を潰した名前が一致
--   C   開始も終了も同じで、片方の名前がもう片方を含む (【社内】等。要目視)
-- ═════════════════════════════════════════════════════════════════════
WITH x AS (
  SELECT e.id, e.user_id, e.title, e.source, e.all_day, e.start_time, e.end_time,
         e.location, e.notes, e.feed_id, e.google_account_id, e.ms_account_id,
         e.ics_key, e.external_provider, e.external_event_id, e.created_at,
         regexp_replace(
           regexp_replace(
             translate(
               lower(regexp_replace(COALESCE(e.title,''), '[（(【\[［].*?[）)】\]］]', '', 'g')),
               '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ　ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
               '0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
             ),
             '(招待|invitation|reminder|オンライン|online)', '', 'g'),
           '[[:space:]\-‐‑–—−ー~〜･・.,/／_|｜:：;；#＃()（）]', '', 'g') AS ntitle,
         CASE WHEN e.start_time ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN e.all_day = 1 OR length(e.start_time) < 16
                THEN substr(e.start_time,1,10)::timestamp
                ELSE replace(substr(e.start_time,1,16),'T',' ')::timestamp END END AS t0,
         CASE WHEN COALESCE(NULLIF(e.end_time,''), e.start_time) ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN e.all_day = 1 OR length(COALESCE(NULLIF(e.end_time,''), e.start_time)) < 16
                THEN substr(COALESCE(NULLIF(e.end_time,''), e.start_time),1,10)::timestamp + interval '1 day'
                ELSE replace(substr(COALESCE(NULLIF(e.end_time,''), e.start_time),1,16),'T',' ')::timestamp END END AS t1
  FROM personal_events e
  WHERE e.deleted_at IS NULL
)
SELECT
  CASE
    WHEN a.external_event_id IS NOT NULL AND c.ics_key IS NOT NULL
         AND a.external_event_id = split_part(c.ics_key,'@',1)
      THEN 'A 外部イベントidが一致 (書き戻した予定を取り込み直している)'
    WHEN c.external_event_id IS NOT NULL AND a.ics_key IS NOT NULL
         AND c.external_event_id = split_part(a.ics_key,'@',1)
      THEN 'A 外部イベントidが一致 (書き戻した予定を取り込み直している)'
    WHEN a.ics_key IS NOT NULL AND c.ics_key IS NOT NULL
         AND split_part(a.ics_key,'@',1) = split_part(c.ics_key,'@',1)
      THEN 'A 取込キーが一致 (同じカレンダーを2経路で取り込んでいる)'
    WHEN a.source = c.source AND a.ntitle = c.ntitle AND a.t0 = c.t0
      THEN 'A 同じ経路で同じ予定が2件 (二度押し)'
    WHEN a.ntitle = c.ntitle AND a.t0 = c.t0 THEN 'B 開始時刻が同じで表記を揃えると同じ名前'
    WHEN a.ntitle = c.ntitle                 THEN 'B 表記を揃えると同じ名前で時間帯が重なる'
    ELSE 'C 開始・終了が同じで片方の名前がもう片方を含む (要目視)'
  END AS 確度,
  u.name AS 利用者,
  a.id AS 候補A_id, a.source AS 候補A_経路, a.title AS 候補A_名前,
  a.start_time AS 候補A_開始, a.end_time AS 候補A_終了,
  a.location AS 候補A_場所, a.notes AS 候補A_メモ,
  (SELECT COUNT(*) FROM personal_event_shares s WHERE s.event_id = a.id) AS 候補A_共有数,
  a.created_at AS 候補A_作成,
  c.id AS 候補B_id, c.source AS 候補B_経路, c.title AS 候補B_名前,
  c.start_time AS 候補B_開始, c.end_time AS 候補B_終了,
  c.location AS 候補B_場所, c.notes AS 候補B_メモ,
  (SELECT COUNT(*) FROM personal_event_shares s WHERE s.event_id = c.id) AS 候補B_共有数,
  c.created_at AS 候補B_作成
FROM x a
JOIN x c ON a.user_id = c.user_id AND a.id < c.id
JOIN users u ON u.id = a.user_id
WHERE a.t0 IS NOT NULL AND c.t0 IS NOT NULL
  AND a.t0 < GREATEST(c.t1, c.t0 + interval '1 minute')
  AND c.t0 < GREATEST(a.t1, a.t0 + interval '1 minute')
  AND (
        (a.external_event_id IS NOT NULL AND c.ics_key IS NOT NULL
          AND a.external_event_id = split_part(c.ics_key,'@',1))
     OR (c.external_event_id IS NOT NULL AND a.ics_key IS NOT NULL
          AND c.external_event_id = split_part(a.ics_key,'@',1))
     OR (a.ics_key IS NOT NULL AND c.ics_key IS NOT NULL
          AND split_part(a.ics_key,'@',1) = split_part(c.ics_key,'@',1))
     OR (a.ntitle <> '' AND a.ntitle = c.ntitle)
     OR (a.t0 = c.t0 AND a.t1 = c.t1 AND length(a.ntitle) >= 3 AND length(c.ntitle) >= 3
          AND (a.ntitle LIKE '%'||c.ntitle||'%' OR c.ntitle LIKE '%'||a.ntitle||'%'))
      )
ORDER BY 確度, a.start_time, a.id;


-- ═════════════════════════════════════════════════════════════════════
-- ① 洗い出し 3/3: partner_schedules
--
-- タイトルは見ない (「有給」「有休（午後）」で必ず揺らぐ)。
--   A 同じ人 + 同じ種別 + 期間が完全一致
--   B 同じ人 + 同じ種別 + 期間が重なる      ← 3日出張の中に1日出張が入っている形
--   C 種別は違うが表記を潰した名前が一致 (要目視)
-- 種別が違って名前も違うものは重複としない (同じ日の「午前有給 + 午後代休」は正当)。
-- ═════════════════════════════════════════════════════════════════════
WITH x AS (
  SELECT ps.id, ps.user_id, ps.schedule_type, ps.title, ps.all_day,
         ps.start_time, ps.end_time, ps.notes, ps.created_by, ps.created_at,
         regexp_replace(
           regexp_replace(
             translate(
               lower(regexp_replace(COALESCE(ps.title,''), '[（(【\[［].*?[）)】\]］]', '', 'g')),
               '０１２３４５６７８９ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ　ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
               '0123456789abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
             ),
             '(有休|有給休暇|有給)', 'ゆうきゅう', 'g'),
           '[[:space:]\-‐‑–—−ー~〜･・.,/／_|｜:：;；#＃()（）]', '', 'g') AS ntitle,
         CASE WHEN ps.start_time ~ '^\d{4}-\d{2}-\d{2}' THEN substr(ps.start_time,1,10)::date END AS d0,
         CASE WHEN COALESCE(NULLIF(ps.end_time,''), ps.start_time) ~ '^\d{4}-\d{2}-\d{2}'
              THEN substr(COALESCE(NULLIF(ps.end_time,''), ps.start_time),1,10)::date END AS d1
  FROM partner_schedules ps
  WHERE ps.deleted_at IS NULL
)
SELECT
  CASE
    WHEN a.schedule_type = c.schedule_type AND a.d0 = c.d0 AND a.d1 = c.d1
      THEN 'A 同じ人・同じ種別・同じ期間'
    WHEN a.schedule_type = c.schedule_type
      THEN 'B 同じ人・同じ種別で期間が重なる'
    ELSE 'C 種別は違うが表記を揃えると同じ名前 (要目視)'
  END AS 確度,
  u.name AS 対象者,
  a.id AS 候補A_id, a.schedule_type AS 候補A_種別, a.title AS 候補A_名前,
  a.start_time AS 候補A_開始, a.end_time AS 候補A_終了, a.notes AS 候補A_メモ,
  a.created_by AS 候補A_入力者, a.created_at AS 候補A_作成,
  c.id AS 候補B_id, c.schedule_type AS 候補B_種別, c.title AS 候補B_名前,
  c.start_time AS 候補B_開始, c.end_time AS 候補B_終了, c.notes AS 候補B_メモ,
  c.created_by AS 候補B_入力者, c.created_at AS 候補B_作成
FROM x a
JOIN x c ON a.user_id = c.user_id AND a.id < c.id
JOIN users u ON u.id = a.user_id
WHERE a.d0 IS NOT NULL AND c.d0 IS NOT NULL
  AND a.d0 <= COALESCE(c.d1, c.d0) AND c.d0 <= COALESCE(a.d1, a.d0)
  AND (a.schedule_type = c.schedule_type OR (a.ntitle <> '' AND a.ntitle = c.ntitle))
ORDER BY 確度, a.start_time, a.id;


-- ═════════════════════════════════════════════════════════════════════
-- ② 掃除 (soft delete)。**確度A の組だけ**を自動で控えて消す
--
-- どちらを残すかは点数で決める (⑤ の規則をそのまま式にしたもの)。
-- 「人が書いたもの」を絶対に消さないため、部屋・備考・共有・確定状態に重みを置く。
-- 同点なら created_at が古い方を残す (先に入れた行が通知や URL で参照されている)。
-- ═════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS tmp_calendar_dup_cleanup (
  tbl        TEXT NOT NULL,
  keep_id    TEXT NOT NULL,
  drop_id    TEXT NOT NULL,
  reason     TEXT NOT NULL,
  cleaned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tbl, drop_id)
);

-- ── studio_bookings ──────────────────────────────────────────
WITH src AS (
  SELECT b.id, b.booking_type, b.status, b.project_id, b.all_day,
         b.start_time, b.end_time, b.notes, b.created_at,
         CASE WHEN b.start_time ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN b.all_day = 1 OR length(b.start_time) < 16
                THEN substr(b.start_time,1,10)::timestamp
                ELSE replace(substr(b.start_time,1,16),'T',' ')::timestamp END END AS t0,
         CASE WHEN COALESCE(NULLIF(b.end_time,''), b.start_time) ~ '^\d{4}-\d{2}-\d{2}' THEN
           CASE WHEN b.all_day = 1 OR length(COALESCE(NULLIF(b.end_time,''), b.start_time)) < 16
                THEN substr(COALESCE(NULLIF(b.end_time,''), b.start_time),1,10)::timestamp + interval '1 day'
                ELSE replace(substr(COALESCE(NULLIF(b.end_time,''), b.start_time),1,16),'T',' ')::timestamp END END AS t1
  FROM studio_bookings b WHERE b.deleted_at IS NULL
), rooms AS (
  SELECT booking_id, array_agg(room_id ORDER BY room_id) AS room_ids
  FROM studio_booking_rooms GROUP BY booking_id
), x AS (
  SELECT s.*, COALESCE(r.room_ids,'{}'::text[]) AS room_ids,
         -- 本予約 > 仮押さえ を**部屋より上**に置く。仮押さえは仮のもので、
         -- アプリ自身も本予約が入った時点で (部屋の有無に関係なく) 仮押さえを消す
         -- (studio-booking.service.ts:213-217)。ここを部屋より下にすると
         -- 「部屋つきの仮押さえ」が「部屋なしの本予約」に勝ち、人が入れた本予約が消える。
         32 * (CASE WHEN s.booking_type <> 'hold' THEN 1 ELSE 0 END)        -- 本予約 (仮押さえでない)
       + 16 * (CASE WHEN r.room_ids IS NOT NULL THEN 1 ELSE 0 END)          -- 部屋がついている
       +  8 * (CASE WHEN s.status = 'confirmed' THEN 1 ELSE 0 END)          -- 確定している
       +  4 * (CASE WHEN s.project_id IS NOT NULL THEN 1 ELSE 0 END)        -- 案件から辿れる
       +  2 * (CASE WHEN s.notes IS NOT NULL AND s.notes <> '案件ステージ移行で自動生成'
                     AND s.notes NOT LIKE 'AI 投入から作成%' THEN 1 ELSE 0 END)  -- 人が書いた備考
       +  1 * (CASE WHEN s.notes = '案件ステージ移行で自動生成' THEN 1 ELSE 0 END) -- アプリが後で自動掃除できる印
         AS score
  FROM src s LEFT JOIN rooms r ON r.booking_id = s.id
), pairs AS (
  SELECT a.id AS a_id, c.id AS c_id, a.score AS a_score, c.score AS c_score,
         a.created_at AS a_created, c.created_at AS c_created,
         -- 消す側 (点数の低い方) の備考。点数の付け方から、hold 同士を除いた組では
         -- **消す側は必ず仮押さえ**になる (本予約は +32 で最低 32点、仮押さえは最大 30点)。
         CASE WHEN (a.score, c.created_at) >= (c.score, a.created_at) THEN c.notes ELSE a.notes END
           AS drop_notes
  FROM x a JOIN x c ON a.id < c.id
  WHERE a.t0 IS NOT NULL AND c.t0 IS NOT NULL
    AND a.t0 < GREATEST(c.t1, c.t0 + interval '1 minute')
    AND c.t0 < GREATEST(a.t1, a.t0 + interval '1 minute')
    AND a.project_id IS NOT NULL AND a.project_id = c.project_id
    AND (a.room_ids && c.room_ids OR a.booking_type = 'hold' OR c.booking_type = 'hold')
    -- ★ 仮押さえ同士は自動で消さない (①に出して人が見る) ★
    -- AI 投入で作られた仮押さえは notes に**投入文がそのまま入る**
    -- (action-executor.service.ts:278 の `a.text ?? 'AI 投入から作成…'`)。
    -- つまり「人が書いた備考 (+2)」と採点され、ステージ仮押さえ (+1) に勝つ。
    -- するとアプリが自動で消せる方 (notes='案件ステージ移行で自動生成') が消え、
    -- **永久に手で消すしかない行だけが残る**。どちらが正しいかは機械では決められない。
    AND NOT (a.booking_type = 'hold' AND c.booking_type = 'hold')
)
INSERT INTO tmp_calendar_dup_cleanup (tbl, keep_id, drop_id, reason)
SELECT 'studio_bookings',
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN a_id ELSE c_id END,
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN c_id ELSE a_id END,
       '本予約があるので不要になった仮押さえ'
FROM pairs
-- ★ 人が書いた文字がある仮押さえは自動で消さない ★
-- 仮押さえの備考には回答期限などの業務情報が入る。印 (案件ステージ移行で自動生成) か
-- 空欄のときだけ機械が消す。人が1文字足した行はアプリ側の自動掃除からも外れているので
-- (studio-booking.service.ts:217 が notes の完全一致で判定している) ① に出して人が見る。
WHERE drop_notes IS NULL OR drop_notes = '案件ステージ移行で自動生成'
ON CONFLICT (tbl, drop_id) DO NOTHING;

UPDATE studio_bookings SET deleted_at = NOW(), updated_at = NOW()
WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'studio_bookings')
  AND id NOT IN (SELECT keep_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'studio_bookings')
  AND deleted_at IS NULL;

-- ── personal_events (取込キーが一致する組だけ) ────────────────
-- ★ 同期由来を消すだけでは戻ってくる。⑤ を読んで経路を止めてから実行する。
WITH x AS (
  SELECT e.id, e.user_id, e.source, e.title, e.all_day, e.start_time, e.end_time,
         e.notes, e.location, e.ics_key, e.external_event_id, e.created_at,
         16 * (CASE WHEN EXISTS (SELECT 1 FROM personal_event_shares s WHERE s.event_id = e.id)
                    THEN 1 ELSE 0 END)                                  -- 誰かに共有している
       +  8 * (CASE WHEN e.source = 'manual' THEN 1 ELSE 0 END)          -- 人が入れた
       +  4 * (CASE WHEN e.notes IS NOT NULL THEN 1 ELSE 0 END)          -- メモがある
       +  2 * (CASE WHEN e.location IS NOT NULL THEN 1 ELSE 0 END)       -- 場所がある
       +  1 * (CASE WHEN e.source IN ('google','outlook') THEN 1 ELSE 0 END) -- ICS購読より正確
         AS score
  FROM personal_events e WHERE e.deleted_at IS NULL
), pairs AS (
  SELECT a.id AS a_id, c.id AS c_id, a.score AS a_score, c.score AS c_score,
         a.created_at AS a_created, c.created_at AS c_created,
         -- 消した理由は枠ごとに書き分ける (控え表は人が読んで戻すかを決めるもの。
         --  手入力の二度押しを「2経路で取り込んでいる」と書くと判断を誤らせる)
         CASE WHEN a.ics_key IS NOT NULL AND c.ics_key IS NOT NULL
                   AND split_part(a.ics_key,'@',1) = split_part(c.ics_key,'@',1)
                THEN '同じ外部イベントを2つの取込経路から入れている'
              WHEN a.external_event_id IS NOT NULL OR c.external_event_id IS NOT NULL
                THEN '書き戻した予定を取り込み直している (外部イベントidが一致)'
              ELSE '同じ予定を2回登録している (名前も日時も完全一致)'
         END AS reason
  FROM x a JOIN x c ON a.user_id = c.user_id AND a.id < c.id
  WHERE (a.external_event_id IS NOT NULL AND c.ics_key IS NOT NULL
          AND a.external_event_id = split_part(c.ics_key,'@',1))
     OR (c.external_event_id IS NOT NULL AND a.ics_key IS NOT NULL
          AND c.external_event_id = split_part(a.ics_key,'@',1))
     OR (a.ics_key IS NOT NULL AND c.ics_key IS NOT NULL
          AND split_part(a.ics_key,'@',1) = split_part(c.ics_key,'@',1))
     -- 二度押し: 同じ人・同じ経路・タイトルも日時も**文字列として完全一致**
     -- (ここだけは揺らぎを一切許さない。手入力を機械的に消す唯一の枠)
     OR (a.source = c.source AND a.title = c.title
         AND a.start_time = c.start_time AND a.end_time = c.end_time
         AND a.all_day = c.all_day)
)
INSERT INTO tmp_calendar_dup_cleanup (tbl, keep_id, drop_id, reason)
SELECT 'personal_events',
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN a_id ELSE c_id END,
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN c_id ELSE a_id END,
       reason
FROM pairs
ON CONFLICT (tbl, drop_id) DO NOTHING;

UPDATE personal_events SET deleted_at = NOW(), updated_at = NOW()
WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'personal_events')
  AND id NOT IN (SELECT keep_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'personal_events')
  AND deleted_at IS NULL;

-- ── partner_schedules (同じ人・同じ種別・同じ期間だけ) ────────
WITH x AS (
  SELECT ps.id, ps.user_id, ps.schedule_type, ps.notes, ps.created_by, ps.created_at,
         CASE WHEN ps.start_time ~ '^\d{4}-\d{2}-\d{2}' THEN substr(ps.start_time,1,10)::date END AS d0,
         CASE WHEN COALESCE(NULLIF(ps.end_time,''), ps.start_time) ~ '^\d{4}-\d{2}-\d{2}'
              THEN substr(COALESCE(NULLIF(ps.end_time,''), ps.start_time),1,10)::date END AS d1,
         4 * (CASE WHEN ps.notes IS NOT NULL THEN 1 ELSE 0 END)               -- メモがある
       + 2 * (CASE WHEN ps.created_by = ps.user_id THEN 1 ELSE 0 END)         -- 本人が入れた
         AS score
  FROM partner_schedules ps WHERE ps.deleted_at IS NULL
), pairs AS (
  SELECT a.id AS a_id, c.id AS c_id,
         a.score + 8 * (CASE WHEN COALESCE(a.d1,a.d0) - a.d0 >= COALESCE(c.d1,c.d0) - c.d0
                             THEN 1 ELSE 0 END) AS a_score,
         c.score + 8 * (CASE WHEN COALESCE(c.d1,c.d0) - c.d0 >= COALESCE(a.d1,a.d0) - a.d0
                             THEN 1 ELSE 0 END) AS c_score,
         a.created_at AS a_created, c.created_at AS c_created
  FROM x a JOIN x c ON a.user_id = c.user_id AND a.id < c.id
  WHERE a.d0 IS NOT NULL AND c.d0 IS NOT NULL
    AND a.schedule_type = c.schedule_type
    AND a.d0 = c.d0 AND COALESCE(a.d1,a.d0) = COALESCE(c.d1,c.d0)
)
INSERT INTO tmp_calendar_dup_cleanup (tbl, keep_id, drop_id, reason)
SELECT 'partner_schedules',
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN a_id ELSE c_id END,
       CASE WHEN (a_score, c_created) >= (c_score, a_created) THEN c_id ELSE a_id END,
       '同じ人・同じ種別・同じ期間の二重入力'
FROM pairs
ON CONFLICT (tbl, drop_id) DO NOTHING;

UPDATE partner_schedules SET deleted_at = NOW(), updated_at = NOW()
WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'partner_schedules')
  AND id NOT IN (SELECT keep_id FROM tmp_calendar_dup_cleanup WHERE tbl = 'partner_schedules')
  AND deleted_at IS NULL;

SELECT tbl, COUNT(*) AS 消した件数 FROM tmp_calendar_dup_cleanup GROUP BY tbl;

-- 件数を確かめてから COMMIT / ROLLBACK
-- COMMIT;
-- ROLLBACK;


-- ═════════════════════════════════════════════════════════════════════
-- ③ 戻す (控え表の id だけを厳密に戻す)
--
-- 「直近N分に消えたもの」を戻す書き方にしてはいけない —
-- studio-booking.service.ts:213 は本予約の登録時に自動生成の仮押さえを
-- soft delete するので、同じ時間帯に**正当に消えた行**が混ざる。
-- ═════════════════════════════════════════════════════════════════════
-- UPDATE studio_bookings   SET deleted_at = NULL, updated_at = NOW()
--  WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl='studio_bookings');
-- UPDATE personal_events   SET deleted_at = NULL, updated_at = NOW()
--  WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl='personal_events');
-- UPDATE partner_schedules SET deleted_at = NULL, updated_at = NOW()
--  WHERE id IN (SELECT drop_id FROM tmp_calendar_dup_cleanup WHERE tbl='partner_schedules');


-- ═════════════════════════════════════════════════════════════════════
-- ④ 後片付け
-- ═════════════════════════════════════════════════════════════════════
-- DROP TABLE tmp_calendar_dup_cleanup;


-- ═════════════════════════════════════════════════════════════════════
-- ⑤ どちらを残すかの規則 (点数の根拠)
--
-- 共通の考え方: **人が書いた文字を消さない。機械が作り直せるものを消す。**
--
-- 1. 共有されている個人予定は消さない (personal_event_shares に行がある)。
--    消すと共有相手のカレンダーからも消え、相手には理由が分からない。
-- 2. 手入力 (source='manual') と 同期由来 (ics/google/outlook) が重なったら
--    **手入力を残す**。同期由来は次の同期でまた作られる = 情報を失わない。
--    逆に手入力を消すと、その人が書いたメモ・場所・共有先が戻らない。
--    ただし **同期由来を消しただけでは15分後に別 id で戻る**。
--    → ICS購読 と OAuth の両方を入れているなら **ICS購読 (personal_ics_feeds) を削除する**。
--      ICS は公開URLに依存し、キャンセルの反映も遅い。OAuth の方が正確。
--    → 書き戻し由来が ICS で戻ってきているなら、その ICS購読 が
--      「自分が書き戻した先のカレンダー」なので同じく購読を外す。
-- 3. スタジオ予約は **本予約を残し、仮押さえを消す**。これが一番強い規則で、
--    部屋の有無より上に置く。アプリ自身も本予約が入った時点で自動生成の仮押さえを
--    消しており (studio-booking.service.ts:213-217)、同じ向きに揃える。
-- 4. 次に **部屋がついている行を残す**。部屋の無い予約は「押さえた」ことに
--    なっていない (香盤にも空き照会にも出ない)。
-- 5. 確定 (status='confirmed') を 仮 (tentative) より残す。
-- 6. 案件が紐づいている行を残す (案件から辿れる = 見積・香盤・請求と繋がっている)。
-- 7. **仮押さえ同士が並んだときは自動で消さない** (① に出すだけ)。
--    どちらも仮のもので、機械には正しい方が決められない。しかも点数では
--    間違う: AI 投入で作られた仮押さえは notes に**投入文がそのまま入る**ため
--    (action-executor.service.ts:278) 「人が書いた備考 (+2)」と採点され、
--    ステージ仮押さえ (notes='案件ステージ移行で自動生成' = +1) に勝ってしまう。
--    アプリが自動で消せるのは後者だけなので、点数に任せると
--    **永久に手で消すしかない行だけが残る**。
--    手で消すときは notes='案件ステージ移行で自動生成' の方を残すこと。
-- 8. パートナー予定は **期間が広い方を残す** (3日出張の中の1日出張を消す)。
--    メモがある方・本人が入れた方を優先 (総務の代理入力は補いなので後)。
-- 9. 同点は created_at が古い方を残す。新しい方が「二度押し」である確率が高く、
--    古い id は通知やリンクから参照されている可能性がある。
-- =====================================================================


-- ═════════════════════════════════════════════════════════════════════
-- ⑥ この手順書を実 Postgres で検証したこと (34項目・全 PASS)
--
-- 意図的な二重9組と、重複でない8組を作って ①→②→③ を通した。
--
-- 見つける (①)
--   ○ 本予約 と ステージ仮押さえ (同じ案件・同じ部屋・同じ時間帯)
--   ○ 日時の形が違う組 (MCP の 'T10:00:00' と 画面の 'T10:00') を同じ時刻として拾う
--   ○ 表記が揺らいだ組 (`第３回定例配信（8/25）` と `第3回定例配信 リハーサル`)
--     … 全角→半角・括弧の中を捨てる・工程語を捨てるを通して一致する
--   ○ 書き戻した手入力を ICS で取り込み直している組 (external_event_id = ics_key の '@' 前)
--   ○ 同じカレンダーを2つの取込経路から入れている組
--   ○ 二度押し (同じ経路・名前も日時も完全一致)
--   ○ 同じ人・同じ種別・同じ期間の休み (`有給` と `有休`)
--   × 同じ日の 設営 09:00-12:00 と 本番 13:00-18:00 → 拾わない
--   × 別の利用者の同じ名前・同じ時刻の予定 → 拾わない
--   × 同じ日の 午前有給 と 午後代休 (種別が違う) → 拾わない
--
-- 消す (②)
--   ○ 消したのは 8件。本予約・共有されている予定・手入力は1件も消えていない
--   ○ 仮押さえ同士は消えない (AI 投入の仮押さえ と ステージ仮押さえ)
--   ○ 人がメモを足した仮押さえは消えない (`… / 9/1までに先方回答待ち`)
--   ○ 備考が空欄の仮押さえは消える
--   ○ 部屋つきの仮押さえ より 部屋なしの本予約 を残す
--     (点数を実測: 旧 21 対 4 で本予約が消えていた → 新 21 対 36 で仮押さえが消える)
--   ○ 3日出張の中の1日出張は消えない (期間が完全一致でないため ① に出すだけ)
--   ○ 似ているが同じでない手入力 (`B社打合せ` と `B社打合せ 資料持参`) は消えない
--   ○ 2回流しても同じ結果 (控え表の主キーと `NOT IN (keep_id)` で二重に守る)
--
-- 戻す (③)
--   ○ 控えた8件だけが戻る
--   ○ **同じ時間帯に別の理由で消えていた仮押さえは蘇らない**
--     (本予約の登録時にアプリが消した行を混ぜて確認。「直近N分」で戻す書き方なら蘇っていた)
-- =====================================================================
