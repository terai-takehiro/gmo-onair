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

**続けて Phase A（死んだ列7本の削除・実バグ5件修正・会場入力のガードレール）を実装した**
（マルチエージェントで9パッケージに分けて並列実装）。読み手ゼロの列7本
（`message_id`・`ai_reviewed_by`・`source_channel`・`previous_gls_numbers`・`project_type_other`・
`reply_due`・`wants`。`flow_template_id`・`logo_permission` は Phase A の対象外のまま保留）を
migration 242 で削除し、サーバーの SQL・MCP ツール・クライアント表示の該当箇所を全て掃除した
（MCP の引数自体は既存の流儀どおり「受け取るが使わない」で残し、本番のメール取込スキルの
呼び出しを 400 で落とさないようにした）。実バグ5件も修正: ①MCP `update_project` の
`intake_confidence` silent drop、②内覧会経由のリード経路が `source_channel`（死んだ列）に
書かれ続け常に「—」表示だった不具合（backfill 込み）、③GPM（GLS-B）経由の受注が `won_at` を
書かず「今月の受注」KPI から漏れていた不具合、④`lost_at` が TEXT 列で NOW() を暗黙キャストし
読み出し時にタイムゾーン依存の再キャストをしていた不具合（`won_at` と同じ `timestamptz` に
型修正）、⑤生放送の収録日=放送日強制がカンマ結合の複数選択保存と噛み合わず効かなくなっていた
不具合。今回の発端だった会場・スタジオの表記ゆれの原因（MCP `create_studio_booking` の
`location_note` に上限も注意書きも無い）にはガードレール（40字上限・「短い地名だけ・経緯は
やり取りへ」の説明文）を追加した。実装時に、当初の棚卸しが見落としていた「MCP `list_projects`
の `tag` 絞り込みが `?tag=` フィルタ実装に依存している」ことが型検査で発覚し、REST の死んだ
入口（`GET /projects/tags`・一覧画面の `?tag=` クエリ）だけを削除してフィルタ本体は残す形に
是正した。検証: `npm run typecheck:all`・`npm run lint`（`droppedColumns.test.ts`・
`silentDrop.test.ts`・`gpmIntegrity.test.ts` 含む）・`npm run test`（1519件）緑。検証用
Postgres で migration 242 の適用・冪等性を確認。実サーバー（検証用Postgres）で案件の作成・
`intake_confidence` の更新反映・AI確認・受注/失注へのステージ変更（`won_at`/`lost_at` の実地
確認）・失注分析APIの月次集計・`GET /projects/tags` の404化を確認済み。

**続けて Phase B（`logo_permission`・`tags`・`lessons_learned` の削除、`assigned_to` 方針文書の
書き直し）を実装した**（ユーザー判断: 3列とも削除・`assigned_to` は書き直しを選択）。
migration 243 で3列を削除し、案件を直す画面の「ロゴの使用許諾」スイッチ・案件詳細の「タグ」節・
台帳の一括編集（タグ・ロゴ）・営業レビューの「教訓・学び」パネルを削除、MCP `list_projects` の
`tag` 引数・`update_project` の `tags`/`logo_permission` 引数・`change_project_stage` の
`lessons_learned` 引数も撤去した。実装時に棚卸し時点では見えていなかった書き手が追加で見つかり
（Excel 取込のインポート/エクスポートテンプレート・バックアップ xlsx 出力・制作技術支援 AI の
生成コンテキスト）、同じ棚卸しの延長としてまとめて削除した。`assigned_to` は
[client/CLAUDE.md](../client/CLAUDE.md) の「v4 の設計判断」を実態に合わせて書き直した
（旧「案件担当者という概念を持たない」→「主担当を持つ。実務の割り当てはタスク単位」）。
検証: `npm run typecheck:all`・`npm run lint`・`npm run test`（1518件）緑。検証用 Postgres で
migration 243 の適用・冪等性を確認。実サーバーで案件の作成・更新（両方の UPDATE 分岐）・
一括編集・失注へのステージ変更・失注分析API・Excel/バックアップの出力エンドポイントが
軒並み 200 で返り、レスポンスから3列が消えていることを確認済み。
