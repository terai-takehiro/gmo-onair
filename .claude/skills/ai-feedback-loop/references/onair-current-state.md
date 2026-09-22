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
| **打合せの議事録 (Whisper + LLM)** | `minutes_draft` | ○ (文字起こし全文 + 下書き) | ○ (確定時・**AI 出力と比較**) | ○ (**持ち帰りの追跡率**を読み取り時に導出) | ○ (advice を整形プロンプトに載せる) |
| **やり取りの整形 (画面 / バックフィル)** | `activity_format` | ○ (原文 + 整形結果) | ○ (保存時に自動比較 / 「整え直す」・**次のアクションの削除**・**本文の手動編集** = reject〈時効なし〉/ **延期** = `next_action_date` の fix) | ○ (無修正採用率 ＋ `digest.activity`＝完了・期限内完了率・削除率・延期率。2026-09 追加) | ○ (advice をプロンプトに載せる。削除率・延期率の助言を含む) |
| **取込で外の AI が書いた中身 (`create_activity_log`)** | `activity_intake` | ○ (件名・本文・次のアクション) | ○ (保存時に自動比較 / 削除は時効なしで reject) | ○ (`digest.activity`。上と同じ導出) | ○ (2026-09 に `SALES_REVIEW_KINDS` へ追加。それまで API からも月次レビューからも読めなかった) |
| **「次にやること」を1行に (migration 190)** | `next_action_short` | ○ (材料の全文 + 出力) | ○ (人が直すと自動比較 = fix / 「違う」= reject。**やることの削除は積まない** — 短縮の出来と無関係なため) | ○ (無修正採用率 ＋ `digest.activity`) | ○ (advice を次のプロンプトに載せる) |
| **プロジェクトの起票 (`create_gpm_project`・2026-08)** | `gpm_project_draft` | ○ (全文 payload + prompt_version) | ○ (gpm.service の update 時・7日窓・AI 自身は除外) | ○ (stage×確定売上。案件と同じ導出) | ○ (digest + 月次営業 AI レビュー) |
| **プロジェクトタスクの起票 (`create_gpm_task`・2026-08)** | `gpm_task_draft` | ○ (全文 payload + prompt_version) | ○ (gpm.service **と** project-tasks.service の update 時 — GLS-B はガント/`update_task` も通るため両方に入れてある) | ○ (期限内完了率 `gpm_tasks`) | ○ (同上) |
| **ウィークリー活動報告の下書き（「AI下書きを作る」ボタン・2026-09）** | `weekly_report_draft` | ○ (全文 payload + prompt_version。画面のボタン経由 `weekly-report-draft.service` と MCP `submit_ops_report` の両方が同じ kind に記録) | ○ (`ops-report.service.publishReport` が**確定時**に自動比較。編集入口 `PUT /dailyops/reports/:id` を新設 — 無いと差分が永久に「無修正」になる) | △ (`get_ai_feedback_digest` の汎用集計（無修正確定率）は効くが、週報固有の成果指標は未定義) | ○ (advice を次の下書きに載せる) |
| Slack の返信案・概算見積 | — | ✕ | ✕ | ✕ | ✕ |

⚠️ **プロジェクト管理の残穴**: MCP の `create_task` / `bulk_create_tasks` は GLS-B の
project_id も受けるが `ai_outputs` を記録しない（GLS-A 向けの既存ギャップと同じ）。
GPM のタスクを AI に起票させるときは `create_gpm_task` を使うこと。

**議事録の成果 (2026-08 に塞いだ)**: 持ち帰りは案件では**タスク** (`open_items[].task_id`)、
プロジェクト管理では**未確認事項** (`open_items[].ask_id`) になる。`getFeedbackDigest('minutes_draft')` が
**確定した議事録の持ち帰りのうち印が付いた数**を数えて `minutes.tracked_rate` で返す
(`ai_outcomes` に行は足していない)。⚠️ **これは「AI が正しかった率」ではない** —
人が言い換えて登録すると印が付かないので、**拾いすぎの目安**として読む。

**残っている穴**: ONAiR の外に出る生成物 (Slack / Gmail / Box)。
`ai_outputs` に登録して ID を発行し、リアクションや送信済みメールと突合する
(`patterns.md` の代替案表)。

## 5条件の充足状況

| 条件 | 現状 | 判定 |
|---|---|---|
| 1. AI出力の記録 | `ai_outputs.payload_snapshot` (JSONB・**切り詰めない**)。役割を分けてあり、`mcp_audit_log` は監査用のまま（`args` を 1000 文字で切るので教師データにならない） | **○**（上の表に無い機能は ✕。Slack に出す返信案など ONAiR 外の生成物は未保存） |
| 2. 人間の修正差分 | `ai_corrections` (migration 134)。`simulations` 確定時 / タスク投入の commit・discard 時 / **案件の保存時 (`project-ai-feedback.service`)** に**サーバーが自動比較**して入れる。`projects.ai_reviewed_at` は「見た」時刻だけなので差分の代わりにはならない | **○**（上の表に無い機能は ✕） |
| 3. 顧客反応・成果の紐づけ | `getFeedbackDigest` が**読み取り時に導出**する（`estimate_draft` / `project_draft` は `projects.stage` と確定売上、`task_intake` は期限内完了率、`minutes_draft` は**持ち帰りがタスク／未確認事項になった率**）。**`ai_outcomes` に日次バッチで焼かない** — 既存データで表現できるものに行を足すと、書き忘れた日から数字が嘘になる | **○** 満足度だけ未構造化 |
| 4. AI改善への還流 | `get_ai_feedback_digest` (MCP)。`kind` ごとに無修正採用率・よく直される項目・成果を返し、**下書きを作る前に読ませる**運用 | **○** |
| 5. レビュー頻度と担当 | **決定済み（2026-08）: 月1回・営業のマネージャー**が `get_ai_feedback_digest` の「よく直される項目」を見て、プロンプト／ナレッジの直し方を決める。器は `ops_reports`（`kind` に CHECK 制約が無いので `kind='ai_review'` を足すだけで載る） | **△** 決めは済み・**仕組みへの落とし込みが未** |

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
| 1 | **レビュー運用（条件5）の仕組み化。** 頻度と担当は決まった（**月1回・営業のマネージャー**）。あとは `ops_reports.kind='ai_review'` に月次で digest を貼り、承認したものをスキル/プロンプトに反映する導線を作る |
| 2 | **ONAiR 外の生成物**（Slack の返信案・概算見積、Gmail、Box）が未記録。`ai_outputs` に登録して ID を発行し、リアクション/送信済みメールと突合する |
| 3 | **`prompt_version` は一部だけ埋まっている**（実測）。議事録（`minutes-ai.service` の `MINUTES_PROMPT_VERSION`）と**画面から**の投入（`dailyops/routes/tasks.routes.ts`）、取込の活動記録（`ACTIVITY_INTAKE_PROMPT_VERSION`）は入っている。**入っていないのは MCP 経由の `create_task_intake` と `create_project` / `set_project_simulation`** |
| 4 | 財務系（仕入・販管費）の AI 由来レコードに `recordCorrections` が入っていない |
| 5 | **メール取込のうち `register_inview_attendee` はまだ `recordAiOutput` を呼んでいない**（条件1から欠落）。`record_inquiry` / `record_finance_doc` は v4 で、`create_activity_log` は 2026-09 に入れた（`activity_intake`・下記） |
| 6 | **`create_project` に構造化引数（`details`）を足していない。** 本番のメール取込スキルが毎日叩いているので、`record_inquiry` / `record_finance_doc` で形が固まってから任意引数として足す。**スキル（`/root/.claude/skills/sales-mail-gmoonair/`）は Git 管理外なので、足しても人が直さないと埋まらない** |

**新しい AI 機能を足すときは、上の「機能ごと」の表に行を1つ足せる状態にしてから出すこと。**
器があることを理由に「満たしている」と書かない。

## メールの取込（v4・migration 160）

`record_inquiry`（入ってきた情報）と `record_finance_doc`（受領書類）。

**それまで AI は、メールから読み取った 差出人・要件・希望日・人数・予算・期限 を
1本の自由文（`summary` / `content` / `notes`）に潰して渡していた。**
AI 側は項目を読み分けているのに、渡す入れ物が1本しか無かった。
画面はそれを `📝 <そのままのテキスト>` と出すだけだった。

実装で決めたこと（他の AI 機能でも同じ判断をすること）:

- **AI に HTML を書かせない。** 取引先の文面がそのまま実行される（XSS）うえ、
  画面の書体・色・余白が AI ごとに変わり、後から検索・集計もできない。
  **AI は「何の情報か」を言い、見せ方はアプリの部品が決める**（`RichContent`）
- **形はサーバーが検査する**（`shared/services/rich-content.ts`）。
  知らない種類は捨て、`javascript:` は落とし、長さに上限を持つ。
  知らない形が画面に届くと React が落ちる（v3.2.0 の内覧会の事故）
- **原文（`body_text`）を切り詰めずに残す。** 入力が無いと
  「AI がどこを読み違えたか」を後から確かめられない。
  `mcp_audit_log` は 1000 文字で切るので教師データにならない
- **条件2 の差分は7日窓。** `status` / `handled_at` / `processed_by` は
  **業務が進んだ印**なので数えない（承認しただけで「AI が間違えた」になる）
- **直した回だけ `none` も積む**（無修正採用率の分母）。開くたびに積むと
  よく開かれる行ほど精度が高く見える
- **既存の呼び出しを壊さない。** 足したのは任意引数だけ。本番の無人バッチは
  最短1時間おきに走っており、必須引数を足すと次の実行から全部落ちる

## 打合せの議事録（実装済み・2026-08）

文字起こしは **Whisper**、整形は `INTAKE_AI_PROVIDER` と同じ選択（`minutes-ai.service.ts`）。

実装で決めたこと（他の AI 機能でも同じ判断をすること）:

- **音声は保存しない。** 文字にしたら捨てる。残すのは `transcript`（全文）と議事録
- **2段に分ける**（Whisper → LLM）。文字起こしを残しておけば、整形プロンプトを直したあと
  **同じ音声を録り直さずにやり直せる**
- **決定事項には引用を必須にする。** 引用が出せないものは決定にせず持ち帰りへ落とす。
  議事録は取引先との合意の記録なので、AI が話を補うのが最悪の失敗
- **差分の before は `ai_outputs.payload_snapshot`。** 直前の行の状態と比べると、
  **書きかけを保存してから確定した人の修正が全部「無修正」になる**（実測して直した）。
  `patterns.md` の「上書き保存で下書きを消す」の変種で、**同じ形の間違いを他でもしやすい**
- **人が入れた値（`met_on`）を差分に数えない。** AI の出力ではないので、数えると
  人の入力が「AI の誤り」になる
- **裏で走らせて行に状態を持たせる。** ジョブの表は作らない。落ちて `transcribing` の
  まま残った行は、読むときに経過時間で「失敗」として見せる（DB は書き換えない）

**残っている穴**: 条件3（成果）。持ち帰りからタスクを作る導線がまだ無いので、
「議事録から生まれたタスクが期限内に閉じたか」を導出できない。導線を作るときに閉じる。

## 外の AI が書いたものを記録する（実装済み・2026-09・`activity_intake`）

メール取込（MCP `create_activity_log`）が書いた**本文・件名・次にやること**を
`ai_outputs`(kind=`activity_intake`) に全文で残すようにしました。

他の AI 機能でも同じ判断をすること:

- **`mcp_audit_log` は条件1の代わりになりません。** args を 1,000 字で切り詰めるので、
  **長い本文ほど中身が消えます**。しかも失敗の中身がまさに「短い／落ちている」なので、
  **確かめたいことがちょうど見えません**
- **書き手ごとに `kind` を分ける。** 取込（外の Claude が本文を写す）と
  整形（サーバーの整形器が意味の単位に分ける）は別の仕事です。混ぜると
  **「短いのは取り込んだ側か、整えた側か」が分かりません**
- **MCP ツールの `.describe()` は、外の AI にとってのプロンプトです。**
  だから版（`ACTIVITY_INTAKE_PROMPT_VERSION`）を持ち、describe を直したら上げる。
  持たないと**contract を直した効果を後から数字で言えません**
- **`model` が入れられないことを理由に記録を諦めない。** どの Claude が動かしたかは
  サーバーから分かりませんが、**全文と contract の版があれば比較はできます**
- **差分の取得に「整形済みか」を条件にしない。** 取込の本文は整形される前から
  人に直されます。条件を付けると**いちばん早く直された回＝いちばん強い信号**が落ちます

**残っている穴**: `register_inview_attendee`（来場予約）は未記録。
こちらは AI が要約するのではなくフォームの項目を写す仕事なので、優先度を下げています。

## まとめの「網羅量」を制御する（実装済み・2026-09・`ai-coverage.ts`）

議事録とやり取りの整形が **きわめて短いまとめしか返さない**という利用者のご指摘から。
原因はプロンプトに**短く書く指示しか無かった**こと（議事録は `summary` が「3〜5行で」の固定、
やり取りは件数の上限だけ）で、**材料が長いほど落ちる情報が増える**形でした。

他の AI 機能でも同じ判断をすること:

- **分量の目安は材料の長さから計算する。** プロンプトに固定の行数・文字数を書かない
  （書いた瞬間、長い材料に追従しなくなる）
- **「長く書け」と言わない。** 言うと**水増しで満たされ**、この製品がいちばん避けたい
  「言っていないことが書かれた記録」になる。言うのは「落とした論点を拾え」
- **出したものを測り、足りなければ1回だけ拾い直させる。** 測る対象から**引用は外す**
  （引用は材料の写しなので、長くするだけで下限を満たせてしまう）
- **拾い直しても足りなければ、長いほうを採って先に進む。** 網羅が足りないことを理由に
  記録そのものを失わせない
- **検査側の上限（`activity-struct.ts` の LIMITS）は柵であって目標ではない。**
  絞ると**長い材料ほど静かに中身が落ちる**（捨てた事実はどこにも出ない）

**条件2で分かったこと（他でも同じ穴になりやすい）**: 人の直しを全部 `fix` にしていたので、
**「AI が短すぎる」がどの数字にも出ませんでした**。直しには**書き換え**（取り違えた）と
**書き足し**（落とした）の2種類があり、混ぜると AI は「間違えないように」ばかりを強め、
**ますます短く安全な出力**になります。`classifyTextCorrection`（テキスト）と
`activityStructLength` の増加（構造）で分け、書き足しが多いときは
`get_ai_feedback_digest` の advice が次のプロンプトに返します（条件4）。

網羅量の実測（材料の字数・まとめの字数・下限・やり直したか）は
`ai_outputs.payload_snapshot.coverage` に残ります（条件1）。

## 「次にやること」を1行に（実装済み・2026-08・migration 190）

`activity_logs.next_action` の長文を、案件詳細の帯に収まる **28 字以内の一文**にする
（`next-action-short.service`）。他の AI 機能でも同じ判断をすること:

- **整形器（`activity-ai`）に混ぜなかった。** 整形器は**すでに `next_action` が
  入っている行のその欄を上書きしない**ので、**いま長文が入っている行には一生入らない**。
  入力を `next_action` そのものにすると、出どころ（画面 / メール取込 / MCP）に
  関係なく効き、プロンプトを直したあと同じ材料でやり直せる
- **原文を書き換えない。** 短い一文は**表示用の別の列**。上書きにすると、
  要約を間違えた日に**やることが1件消えたことに誰も気づけない**
- **材料が変わったら要約を捨てる**（`next_action` を直すと NULL に戻して待ち行列へ）。
  残すと**古いやることが帯に出たまま**になり、画面を見ても食い違いに気づけない
- **採るか捨てるかを純関数で決める**（`normalizeShort`）。上限を超えた文を
  **切り詰めない** — 途中で切れた文を「AI が作った要約」として保存すると、
  規則で切るのと同じことになる。原文と同じか長いものも採らない
- **失敗の印を列に持つ**（`next_action_short_error`）。持たないと毎晩同じ行を
  呼び直して課金され、待ち行列も減らない（migration 188 で踏んだのと同じ形）
- **使用量の `kind` を分ける**（`activity_short`）。整形（本文まるごと）と
  短縮（1文）を1つにすると、**「1件あたりいくら」が混ざって両方の推定費用が嘘になる**
- **無人の取込では待たせない。** 画面の「整えて記録する」の中だけ同じ待ち時間で作り、
  取込ぶんは毎晩 3:10 の定時実行が拾う（取込に AI の待ちを足すと、落ちた日に
  **記録そのものが入らなくなる**）

## 営業活動記録の案件別ビュー・本文の手動編集・次のアクションの編集／削除（実装済み・2026-09）

対象の kind: `activity_format`（サーバーの整形器）／ `activity_intake`（メール取込の AI が書いた本文）／
`next_action_short`（28字の一文）。設計監査が出した**5条件の充足表**と、この回で何を塞いだか。

| # | 条件 | 既存の作りで満たしていたもの | 着手前に開いていた穴 | この回でどう塞いだか | 判定 |
|---|---|---|---|---|---|
| 1 | AI出力を記録・保存 | `ai_outputs.payload_snapshot` に**切り詰めずに全文**（整形は `{original, subject, body_struct, next_action, next_action_date, coverage}`、短文は `{next_action, next_action_short}`、取込は本文・件名・次のアクション） | 整形の payload に **`body_html` キーが無い**ため、人が HTML で本文を書き直すと「AI は空 → 人が書いた」に見えた。migration 304 の `body_edited_at` / `body_edited_by` は "誰がいつ触ったか" しか持たず、**単体では確認フラグでしかない**（スキルが名指しで禁じている形） | 本文の手動編集は **`body_struct` の `reject`**（before に AI が出した構造の全文）として積む。`body_html` どうしの比較は**やめた**（AI 側が持たない欄を比べると全回が「人が直した」になる）。`body_edited_at` は**印ではなく上書き防止の鍵**として使う（毎晩の整形が手動編集した行を触らない） | **○** |
| 2 | 人間の修正を差分として残す | `recordActivityCorrections` / `recordIntakeCorrections` が**サーバーで自動比較**（人に入力させない）。`classifyTextCorrection` が fix / enrich を分け、`(全体) none` で無修正採用率の分母を守る | ①削除の `reject` は `findLatestAiOutput` の**7日窓**の外に落ちる（この画面の主役＝期限超過は、AI が立ててから7日以上経った行なので**構造的にほぼ全部**が捨てられる）②`hasCorrections()` で同じ出力に二度積まないため、一度保存済みの行の削除は残らない ③完了・延期は `ai_corrections` に**1行も書いていなかった** ④専用の削除口を作ると `update()` を通らず記録ゼロ ⑤重複除けが無く、自動保存で同じ出力に `none` / `reject` が何十回も積まれる ⑥期限なしの `next_action` は `OPEN_NEXT_ACTION_SQL` に拾われず画面に出ないので永久に直されない | ①②**削除と本文の書き直しは時効なし**（`NO_WINDOW_DAYS`）で整形・取込の両方に `reject` を積む ③**延期は `next_action_date` の `fix`**（AI が置いた期限が近すぎたという信号）、**完了は積まない** ④削除口は作らず `update()` が「元の値 vs 来た値」を自分で判定する（呼び出し側の自己申告にすると、機械の更新から時効なしの経路へ入れてしまえる） ⑤差分は **`output_id × field_path` で置き換え**（3回保存しても field ごとに1行） ⑥`OPEN_NEXT_ACTION_NO_DATE_SQL` を足して `none` 区分として画面に出す | **○** |
| 3 | 顧客反応と成果指標を紐づける | `getFeedbackDigest` が**読み取り時に導出**（`ai_outcomes` に焼かない方針） | **この3つの kind には成果の節が1つも無かった**。`digest.outcomes` は案件系、`on_time_rate` は `task_intake` / `gpm_task_draft` だけで、実際には**無修正採用率しか無かった**（この文書の旧記載「期限内完了」は実装と食い違っていたので直した） | **`digest.activity`** を新設（`next_actions_total` / `completed` / `on_time_rate` / `rejected` / `reject_rate` / `postponed` / `postpone_rate`）。分母は「AI が `next_action` を出した記録」だけ、**機械が閉じた行（`next_action_auto_closed_reason`）は完了に数えない**、削除率の分母から**正常な業務の終わり**（「対応済み」「案件が停止」）を外す | **○** |
| 4 | 貯めたデータをAI改善に戻す | `getFeedbackDigest(...).advice` を整形・短文のプロンプトに載せる | **`activity_intake` が `SALES_REVIEW_KINDS` に入っておらず**、`GET /ai-activity/digest` の `ALLOWED_KINDS` からも月次レビューからも外れていた（取込 AI の差分は貯まるだけで誰も読まない）。削除・延期に対応する助言の文も `buildAdvice` に無かった | `activity_intake` を `SALES_REVIEW_KINDS` に追加。`buildAdvice` に**削除率・延期率の助言**を足した（件数が10未満のうちは断定しない作法は維持） | **○** |
| 5 | レビュー頻度と担当 | **月1回・営業のマネージャー**。`buildSalesReviewDraft` が `ops_reports(kind='ai_review_sales')` に下書きを作り、scheduler が回す。`kindSection` が fix / enrich / reject の内訳を出す | `activity_intake` が対象外で、削除・延期に対応する論点がレビュー本文に無かった | 上の `SALES_REVIEW_KINDS` 追加でレビュー本文に載る。削除率・延期率は `digest.activity` から `advice` 経由で下書きに出る | **○** |

**いちばん踏みやすい計測バグ（次に同じ画面を作る人へ）**: **「完了」を AI の誤りとして数えないこと。**
完了は AI が正しかった証拠で、削除・延期とは**逆向きの信号**。同じ画面の隣り合ったボタンなので、
まとめて `reject` にすると「**当たっているほど無修正採用率が下がる**」逆さまの数字になる。

**7日窓の例外をどこに置くか**: 既定は7日のまま（`ONAiR 固有の注意`）。時効なしにするのは
**人が明示的に「違う」と言った操作**だけ — 「整え直す」・次のアクションの削除・本文の手動編集の3つ。
ふつうの業務更新（3か月後に次のアクションを書き換える）は7日窓で落とす。

**削除の理由は任意**（3択「対応済み」「案件が停止」「AI の見当違い」＋自由記入）。
**必須にしない** — 人に差分の入力を強いると運用が続かず、削除ごと使われなくなるほうが損。
理由が無くても `reject` は必ず1行積まれ、理由は分母の出し分けにだけ効く。
画面の表示文とサーバーのコードの対応表は `activity-corrections.service.ts` の
`DELETE_REASON_LABEL_TO_CODE`。**画面の文言を変えるときは同時に直すこと**。

## ONAiR 固有の注意

**`mcp_audit_log` は監査用と割り切る。** `args` の 1000 文字切り詰めは監査目的なら妥当なので、
そこを変えるのではなく `ai_outputs.payload_snapshot` に全文を持たせる（役割を分ける）。

**AI 出力の多くが ONAiR 外に出る。** Slack（返信案・概算見積）、Gmail、Box。
`ai_outputs` に登録して ID を発行し、リアクションや送信済みメールとの突合で回収する
（詳細は `patterns.md` の代替案表）。

**時間窓は 7 日を目安に。** ONAiR は案件が数ヶ月にわたって更新され続けるため、
窓を切らないと通常の業務更新が全部「AI の誤り」として数えられてしまう。
