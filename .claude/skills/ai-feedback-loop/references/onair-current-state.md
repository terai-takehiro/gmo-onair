# GMO ONAiR の現状（2026-07 / v2.9.231 時点）

ONAiR で AI 機能を設計するとき、この調査をやり直さずに済むようにまとめたもの。
**実装を読んで確認した事実**のみを書いている。変更したら更新すること。

## 結論

**ループの前半（①実行・②の一部）は整っているが、後半（学習）が丸ごと無い。**
最大の穴は条件2「人間の修正差分」で、差分/履歴テーブルは migration 133 本の中に 1 つも存在しない。

一方で**帰属情報（誰のどの AI が何を作ったか）は既に揃っている**ため、
差分と成果を足すだけでループは閉じる。ゼロからではなく「あと3テーブル + 還流経路」。

## 5条件の充足状況

| 条件 | 現状 | 判定 |
|---|---|---|
| 1. AI出力の記録 | `mcp_audit_log`（`tool_name` / `args` / `result_summary` / `actor_id` / `requested_by` / `created_at`）。MCP は OAuth 2.1 per-user 認証なので実行者を特定できる | **△** `args` が**1000文字で切り詰め**られており教師データに使えない。Slack に出す返信案など ONAiR 外の生成物は未保存 |
| 2. 人間の修正差分 | **存在しない。** `projects.ai_reviewed_at` / `ai_reviewed_by` は「確認した」時刻のみ。`simulations` の draft→final は**全置換で AI 下書きが消える** | **✕ 最大の穴** |
| 3. 顧客反応・成果の紐づけ | 素材は揃う（ステージ遷移・`lost_reason`・確定売上・`source_channel`・`message_id`・`idempotency_key`）。`mcp_audit_log.result_summary->>'created_id'` で生成物を逆引きでき、専用の expression index もある（migration 117） | **△** 集計する仕組みが無い。満足度は未構造化 |
| 4. AI改善への還流 | **存在しない。** スキル / プロンプトは静的ファイル。監査ログを読んで改善に使う導線が無い | **✕** |
| 5. レビュー頻度と担当 | **未定義。** | **✕**（器は流用可・下記参照） |

## 流用できる既存資産

新しく作る前にここを確認する。

**`ops_report_items.pick`（採用フラグ 1〜5）** — デイリーニュース報告で人間が付ける評価。
**条件2〜3を実質的に既に満たしている唯一の箇所**で、他機能へ横展開すべき好例。
`source`（`'ai' | 'human'`）カラムもあり、AI 行と人間の追記行が区別できる。

**`ops_reports`（weekly / daily）** — 定例レポートの器。`report_status`（draft / confirmed）で
承認フローも既にある。**`kind` に CHECK 制約を張っていない**（migration 118 の設計意図が
「今後のメニュー追加を migration レスに」）ため、`kind = 'ai_review'` を追加するだけで
週次 AI 改善レビューを載せられる。

**`simulations.status`（draft / final）** — AI が下書き → 人が確定、という 2 段階が既にある。
ただし finalize が全置換なので、**確定前にスナップショットを保存する改修が必須**。

**AI 由来判定の基盤（v2.9.197）** — `created_by = mcpActor` OR `mcp_audit_log` 照合の
二段判定が service 層に入っており、OAuth 経由（本人名義）の AI 起票も検出できる。
AI バッジ・AI 起票インボックス・AI 活動履歴ページ（`/sales/ai-activity`）が既に稼働中。

**冪等性・由来の記録（v2.9.195）** — `projects` / `activity_logs` に
`message_id`（由来メール）・`idempotency_key`（partial unique で二重登録を DB が拒否）・
`source_channel`（info@ / sales@cc / 電話 等）がある。外部システムとの突合キーとして使える。

## 想定フェーズ

| Phase | 内容 | 効果 |
|---|---|---|
| 1 | `ai_outputs` / `ai_corrections` / `ai_outcomes` 新設（migration 134）+ MCP 書き込みツールから `ai_outputs` へ自動登録（`audit()` の隣に 1 行）+ `simulations` finalize 時のスナップショット保存 | 記録が始まる |
| 2 | sales / finance の update service に共通 `recordCorrections()` を差し込み（AI 由来レコードのみ）+ UI に任意の「直した理由」欄 | **この時点で教師データが貯まり始める** |
| 3 | ステージ / 売上 / 返信 / `pick` から `ai_outcomes` を日次バッチ生成 + AI改善ダッシュボード（修正率・フィールド別・KPI） | 効果が見える |
| 4 | `get_ai_feedback_digest`（MCP）+ ナレッジテーブル + JSONL export + 週次 `ai_review` と承認フロー | 賢くなり始める |

**Phase 1+2 まで入れば「使うほど教師データが貯まる」状態**になる。
Phase 3 以降は貯まったデータを使う側なので後追いでも損失がない。逆順にすると空箱になる。

## 追記: 投入欄の行動提案 (v3.0.6 / `ai_action_plans`)

投入欄「AIに投げる」を**タスクだけ → ONAiR 全機能への行動提案 11 種**に広げた回の記録。
新しい AI 接点を足すときの雛形として使える (5条件を最初から満たした形になっている)。

| 条件 | 実装 |
|---|---|
| 1. 出力の記録 | `ai_action_plans.actions` (下書き) + `ai_outputs.payload_snapshot` に**投入文と行動案の全文**。`kind='ai_action_plan'` |
| 2. 修正差分 | `action_key` で突合し `ai_corrections` へ。`fix`(直した) / `reject`(外した・実行が落ちた) / `none`(無修正で実行) の3種。**実行結果は `results` 列に分けて持ち、`actions` を上書きしない** |
| 3. 成果 | 作られたレコードは `results[].target_table/target_id` から辿れる。見積は既存の `estimate_draft` の成果導出 (受注/失注) にそのまま乗る |
| 4. 還流 | `getFeedbackDigest('ai_action_plan')` の advice を**次の解析のプロンプトに載せる** (5分キャッシュ・実行/破棄で破棄)。`prompt_version` は助言を載せた回 (`+fb`) と分けている |
| 5. レビュー | 未定。`ops_reports.kind='ai_review'` に載せる余地は残っている (下記 Phase 4 と同じ) |

**この回で踏んだ落とし穴** (次に同じ形を作るとき用):

- **「これから作るもの」を「読み取れなかった」と数えない。** 「A社から相談 → 案件をつくる」を
  提案させると、案件側の `customer_id` は AI に知りようがないので必ず空になる。これを不足として
  扱うと、まだ存在しないお客様を人に選ばせることになり一番普通の使い方が毎回止まる。
  **id が空のときだけ**「先に作るものを使う」と解釈する (`from_previous_customer`)。
  id が入っていて解決できなかった場合は取り違えなので繋いではいけない
  (繋ぐと「B社の件」の提案がいま作った A社の案件に当たる)。
- **差分の対象に AI の説明を入れない。** `quote` / `confidence` / `asks` を差分に含めると
  「人が直した」件数が水増しされて修正率が読めなくなる。実行に効く値だけを見る。
- **AI を通しても権限は増やさない。** 実行は 1 件ずつ**押した人**の権限で確かめる
  (`meetsPermissionLevel`)。足りない 1 件だけ止めて残りは実行する。

## ONAiR 固有の注意

**`mcp_audit_log` は監査用と割り切る。** `args` の 1000 文字切り詰めは監査目的なら妥当なので、
そこを変えるのではなく `ai_outputs.payload_snapshot` に全文を持たせる（役割を分ける）。

**AI 出力の多くが ONAiR 外に出る。** Slack（返信案・概算見積）、Gmail、Box。
`ai_outputs` に登録して ID を発行し、リアクションや送信済みメールとの突合で回収する
（詳細は `patterns.md` の代替案表）。

**時間窓は 7 日を目安に。** ONAiR は案件が数ヶ月にわたって更新され続けるため、
窓を切らないと通常の業務更新が全部「AI の誤り」として数えられてしまう。
