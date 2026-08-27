**案件台帳（`projects` 全57列）の棚卸しと整理計画を作った**（コード変更なし。ユーザー指摘
「会場・スタジオの表記が揺らいでいる。案件台帳のDB項目が拡張し続けてぐちゃぐちゃ —
ロジックの整理が必要。導線と入力をシンプルにしたい」）。全列の書き手・読み手を実測で追い、
読み手ゼロの死んだ列9本（`message_id`・`ai_reviewed_by`・`source_channel`・
`previous_gls_numbers`・`project_type_other`・`reply_due`・`wants`・`flow_template_id`・
`logo_permission`）、同じ事実の持ち場所の重複（実施日3系統・金額の双方向上書きループ・
受注/失注日時の非正規化）、書く口6経路の分散を確定し、実バグ6件
（MCP `update_project` の `intake_confidence` silent drop／内覧会経由のリード経路が常に「—」／
GPM 受注が今月の受注KPIから漏れる／`lost_at` の TEXT 型／生放送の日付強制が複数選択で効かない／
見積確定後も集計は `expected_amount` を合計）を発見した。会場・スタジオの表記ゆれは
MCP `create_studio_booking` の `location_note` にガードレールが無く AI が経緯の長文を
書けることが原因と特定。整理は Phase A（安全な削除とバグ修正）/ B（ユーザー判断が要る論点）/
C（持ち場所の一本化）に分けて `docs/project-ledger-simplification-plan.md` にまとめ、
`docs/core-redesign-plan.md` の Phase 3 からリンクした。
