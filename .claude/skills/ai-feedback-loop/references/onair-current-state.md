# GMO ONAiR の現状（2026-08 / v4 開発中 時点）

ONAiR で AI 機能を設計するとき、この調査をやり直さずに済むようにまとめたもの。
**実装を読んで確認した事実**のみを書いている。変更したら更新すること。

## 結論

**器 (migration 134 の `ai_outputs` / `ai_corrections` / `ai_outcomes`) は入っており、
ループが閉じているのは「機能ごと」。** 新しい AI 機能を作るときは
**その機能について**5条件を確認すること — テーブルがあることと、
その機能が使っていることは別。

| 機能 | kind | 記録 | 修正差分 | 成果 | 還流 |
|---|---|---|---|---|---|
| 見積の下書き (`set_project_simulation`) | `estimate_draft` | ○ | ○ (simulations 確定時) | ○ (stage から導出) | ○ |
| タスクの投入欄 | `task_intake` | ○ | ○ (commit / discard) | ○ (期限内完了率) | ○ |
| **案件の起票 (`create_project`)** | `project_draft` | ○ | ○ (受付/案件編集の保存時・7日窓) | ○ (stage から導出) | ○ |
| Slack の返信案・概算見積 | — | ✕ | ✕ | ✕ | ✕ |

**残っている穴**: ONAiR の外に出る生成物 (Slack / Gmail / Box)。
`ai_outputs` に登録して ID を発行し、リアクションや送信済みメールと突合する
(`patterns.md` の代替案表)。

## 5条件の充足状況

| 条件 | 現状 | 判定 |
|---|---|---|
| 1. AI出力の記録 | `ai_outputs.payload_snapshot` (JSONB・**切り詰めない**)。役割を分けてあり、`mcp_audit_log` は監査用のまま（`args` を 1000 文字で切るので教師データにならない） | **○**（上の表に無い機能は ✕。Slack に出す返信案など ONAiR 外の生成物は未保存） |
| 2. 人間の修正差分 | `ai_corrections` (migration 134)。`simulations` 確定時 / タスク投入の commit・discard 時 / **案件の保存時 (`project-ai-feedback.service`)** に**サーバーが自動比較**して入れる。`projects.ai_reviewed_at` は「見た」時刻だけなので差分の代わりにはならない | **○**（上の表に無い機能は ✕） |
| 3. 顧客反応・成果の紐づけ | `getFeedbackDigest` が**読み取り時に導出**する（`estimate_draft` / `project_draft` は `projects.stage` と確定売上、`task_intake` は期限内完了率）。**`ai_outcomes` に日次バッチで焼かない** — 既存データで表現できるものに行を足すと、書き忘れた日から数字が嘘になる | **○** 満足度だけ未構造化 |
| 4. AI改善への還流 | `get_ai_feedback_digest` (MCP)。`kind` ごとに無修正採用率・よく直される項目・成果を返し、**下書きを作る前に読ませる**運用 | **○** |
| 5. レビュー頻度と担当 | **未定義。** `ops_reports` の `kind` に CHECK 制約が無いので `kind='ai_review'` を足すだけで週次レビューを載せられる（下記） | **✕**（器は流用可・下記参照） |

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

## 残っていること

| # | 内容 |
|---|---|
| 1 | **レビュー運用（条件5）が未定義。** `ops_reports.kind='ai_review'` に週次で digest を貼り、承認したものをスキル/プロンプトに反映する担当と頻度を決める |
| 2 | **ONAiR 外の生成物**（Slack の返信案・概算見積、Gmail、Box）が未記録。`ai_outputs` に登録して ID を発行し、リアクション/送信済みメールと突合する |
| 3 | **`prompt_version` が実際には埋まっていない。** 列はあるので、改善前後を比べるには書き込み側で入れる |
| 4 | 財務系（仕入・販管費）の AI 由来レコードに `recordCorrections` が入っていない |

**新しい AI 機能を足すときは、上の「機能ごと」の表に行を1つ足せる状態にしてから出すこと。**
器があることを理由に「満たしている」と書かない。

## ONAiR 固有の注意

**`mcp_audit_log` は監査用と割り切る。** `args` の 1000 文字切り詰めは監査目的なら妥当なので、
そこを変えるのではなく `ai_outputs.payload_snapshot` に全文を持たせる（役割を分ける）。

**AI 出力の多くが ONAiR 外に出る。** Slack（返信案・概算見積）、Gmail、Box。
`ai_outputs` に登録して ID を発行し、リアクションや送信済みメールとの突合で回収する
（詳細は `patterns.md` の代替案表）。

**時間窓は 7 日を目安に。** ONAiR は案件が数ヶ月にわたって更新され続けるため、
窓を切らないと通常の業務更新が全部「AI の誤り」として数えられてしまう。
