# 案件台帳の項目整理計画 — `projects` 全57列の棚卸しと導線の単純化（2026-08-27）

ユーザーのご指摘（原文の要旨）:

> 会場・スタジオの表記が揺らいでいる。そもそもどこで入力した情報が反映されているのか。
> この点を含め、案件台帳の様々なDB項目についてこれまで拡張し続けていて
> ぐちゃぐちゃになっている。ロジックの整理が必要。導線と入力をシンプルにしていきたい。

この文書は (1) `projects` 全57列の実測の棚卸し（誰が書き・誰が読み・生きているか）、
(2) 棚卸しで見つかった実バグ、(3) 整理の方針と段階、をまとめた**正**です。
[docs/core-redesign-plan.md](core-redesign-plan.md)（根源整理）の**続き（Phase 3 の具体化）**にあたります。
調査方法: 全列について書き手・読み手を grep とコード読解で追い、検証用 Postgres で
スキーマ実物（migration 適用後）を確認した。

---

## 1. 診断 — なぜ「ぐちゃぐちゃ」なのか（構造で言うと4つ）

### 1-1. 読む人がいない列が9本ある（書くだけ・拾うだけ）

`SELECT p.*` で全列がクライアントまで届くため型エラーにならず、**死んでも誰も気づかない**。

| 列 | 状態 | 根拠 |
|---|---|---|
| `message_id` | **死** | 書くのは MCP `create_project` の後付け UPDATE だけ。読み手ゼロ。実体は `ai_outputs.message_id` に重複保存されており、読むならそちら |
| `ai_reviewed_by` | **死** | `ai_reviewed_at` と常に同時に書かれるが、読み手ゼロ（「誰が確認したか」は誰も見ていない） |
| `source_channel` | **死＋重複** | `intake_channel` の自由文字版。読み手ゼロ。値の語彙も不統一（`'内覧会'` `'intake'` `'info@'`） |
| `previous_gls_numbers` | **死** | GLS 採番し直しで追記するだけ。読み手ゼロ。client の型宣言にも無い |
| `flow_template_id` | **データとしては死** | 書いた後 SELECT がゼロ。生きているのは XOR CHECK（`gpm_template_id` との排他）だけ |
| `project_type_other` | **死** | create の INSERT に**列自体が無い**（MCP の update でしか値が入らない）。表示ゼロ |
| `logo_permission` | **値としては死** | 案件を直す画面にスイッチがあるのに、**値を読む処理が1つも無い**（`application_form` は請求発行を止める読み手がいるのと対照的） |
| `reply_due` | **ほぼ死** | v4 フォームから意図して削除済み。書けるのは MCP だけ。表示は残存値の読み出しのみ。専用索引 `idx_projects_reply_due` を使う SQL はゼロ |
| `wants` | **ほぼ死** | `reply_due` と同型。書けるのは MCP だけ |

準じるもの: `lessons_learned`（失注ダイアログが送らなくなったため **UI からは永久に空**。
営業レビューの表示だけ残存）、`lost_reason_note`（全経路で書くが表示ゼロ）、
`tags`（カンマ区切り TEXT。編集は台帳の一括編集のみ・`GET /projects/tags` と `?tag=` は
**呼び出し元ゼロの死にエンドポイント**）、一覧 SQL の `dates_count`（毎回数えるが読み手ゼロ）。

### 1-2. 同じ事実を2か所以上に持っている（どちらが正か決まっていない）

| 事実 | 持ち場所 | 何が起きているか |
|---|---|---|
| **実施日** | ①`event_start`/`event_end`（TEXT） ②`project_dates` ③`studio_bookings` | 予約ができた瞬間から ② は凍結され（フォームが欄ごと隠す・同期も書き戻さない）、① だけが ③ から自動同期で動く。**②は飛び日ラベルのためだけに生きている**。`projectContext.service` は3系統ぜんぶを1レスポンスで返す |
| **金額** | `expected_amount` ⇔ `estimates` ⇔ `revenues` | 書き手7経路。売上を直すと案件の想定金額を黙って上書きし、案件を直すと売上へ書き戻す**双方向ループ**。表示は見積が勝つのに、ダッシュボード・営業分析の集計は今も `expected_amount` を合計 → **画面と集計が正当に食い違う** |
| **受注/失注日時** | `won_at`/`lost_at` ⇔ `project_stage_changes` | migration 164 が両方作った。`won_at` は `MIN(changed_at) WHERE to_stage='a_won'` の非正規化・読み手は今月の受注KPI 1つ |
| **分類** | `project_type` ⇔ `audience`×`project_category` | 導出の一本化は済んでいる（`resolveClassification` 1点）。ただし GLS-B の3値（`gmo_project`/`consulting`/`other`）は2段に表現が無いので**列は消せない** |
| **リード経路** | `intake_channel` ⇔ `source_channel` | 上記のとおり後者は死。ただし**内覧会だけ死んだほうに書いている**（下記バグ②） |

### 1-3. 書く口が6経路に分散し、AI の入口にガードレールが無い

`INSERT INTO projects` は6か所（画面→`project.service`・MCP `create_project`・
投入口 `task-intake`・Excel 取込・決算取込・GPM）。画面から削った欄（`reply_due`/`wants`）も
**MCP からは今も書ける**。今回の発端の**会場・スタジオの表記ゆれ**も同じ構図:

- 会場表示は案件の列ではなく予約（`studio_bookings`）の `rooms[]`＋`location_note` から
  組み立てる（`client/.../projectDetail/venue.ts`）。
- 人が予約ダイアログで書くときは placeholder「場所を入力（例：富士山麓ロケーション）」で
  短い地名に揃うが、**MCP `create_studio_booking` の `location_note` は説明が
  「外現場など場所メモ」だけ**で、AI が確定できない場所を**経緯の長文**
  （「実施場所は要確認(7/29打診時は先方オフィス=…)」）としてそのまま書ける。
  → 短い地名の並びに1件だけ説明文が混ざり、表記が揺らいで見える。

### 1-4. 設計方針と実装が食い違っている列

- `assigned_to` — v4 方針は「案件担当者という概念を持たない」
  （[client/CLAUDE.md](../client/CLAUDE.md)）だが、実装は NOT NULL・作成画面で必須・
  台帳の既定列・KPT 下書きの宛先。**方針の側を実態に合わせて書き直すべき**
  （列を NULL 許容にする影響のほうが大きいことは `project.service.ts` の update に明記済み）。
- `broadcast_type`/`media_platform` — v4 フォームは**カンマ結合の複数選択**を保存するのに、
  `shared/src/types.ts` の型は**旧・単一値の enum のまま**（型が嘘）。この嘘が下記バグ⑤の温床。

---

## 2. 棚卸しで見つかった実バグ（整理と別に、直す価値があるもの）

| # | バグ | 場所 | 症状 |
|---|---|---|---|
| ① | MCP `update_project` が `intake_confidence` を `UPDATE_FIELDS` に載せて「更新した」と返すが、`projectService.update` は**その項目を一度も書かない** | `mcp/tools/projects.tools.ts:53` / `project.service.ts:1035` | silent drop（`shared/tests/silentDrop.test.ts` が守るはずの型のバグで、検査対象リストからこの1項目だけ漏れている） |
| ② | 内覧会からの与件化が `source_channel='内覧会'`（死んだ列）に書き、UI が読む `intake_channel` には `'inview'`（migration 183 でこのために追加済み）を書かない | `dailyops/services/inview.service.ts:367` | 内覧会経由の案件のリード経路が常に「—」 |
| ③ | GPM のステージ変更が `project_stage_changes` は書くのに `won_at` を書かない | `gpm/services/gpm.service.ts:469` | GPM 経由の受注が「今月の受注」KPI から漏れる |
| ④ | `lost_at` が **TEXT 列**に `NOW()` を書き、読むとき `::timestamp` で戻す | `002_lost_analysis_enhancement.sql:28` / `sales-analytics.service.ts:116` | セッション TZ 付き文字列を保存して読み出しで落とす。集計の時刻が環境依存 |
| ⑤ | 収録日=放送日の強制が `broadcast_type === 'live'` の**完全一致**なのに、v4 フォームは `'live,recording'` のような結合文字列を保存する | `production/routes/episodes.routes.ts:182-185` | 複数選択した案件で生放送の日付強制が黙って効かない |
| ⑥ | `estimates` があっても集計系（営業分析・ダッシュボード・週間統計）は `expected_amount` を合計 | `sales-analytics.service.ts` ほか | 案件詳細の見積金額とパイプライン合計が食い違う（構造問題 1-2 と同根） |

---

## 3. 整理の方針（原則3つ）

1. **読む人がいない列は消す。** 「いつか使うかも」で残った列が9本。消すときは
   [client/CLAUDE.md](../client/CLAUDE.md) の決めごとどおり
   `shared/tests/droppedColumns.test.ts` を通し、サーバーの SQL 文字列を全部追う。
   MCP の引数は**列より長生きさせる**（受け取って無視。既存の呼び出しを 400 で落とさない —
   `notes`/`stage` で確立済みのパターン）。
2. **同じ事実の持ち場所は1つに決め、残りは導出にする。** 実施日の正は
   「予約があれば予約→`event_start/end`、無ければ手入力の `event_start/end`」の現行実態を
   そのまま正と宣言し、`project_dates` は「飛び日のラベル」専用に格下げする（新しい仕組みは足さない）。
3. **AI の入口には人間の入口と同じガードレールを付ける。** 人間の欄に placeholder・必須・
   選択肢があるなら、MCP の引数説明・上限・enum に同じ制約を書く。
   会場の `location_note` が今回の実例（短い地名だけ・経緯は書かない・上限を付ける）。

---

## 4. 段階

### Phase A — 安全な削除とバグ修正（振る舞いを変えない・データは消さない）**✅ 実装済み（2026-08-27）**

1. **死んだ列の削除（7本）**: `message_id`・`ai_reviewed_by`・`source_channel`・
   `previous_gls_numbers`・`project_type_other`・`reply_due`・`wants`。
   - 手順: 読み残し（`OverviewTab` の `reply_due`/`wants` 表示・`project-ai-feedback` の
     突き合わせ項目・`silentDrop.test` の期待リスト・MCP `UPDATE_FIELDS`）を先に落としてから
     DROP の migration。MCP 引数は受け取って無視に切り替え。
   - `flow_template_id` は**保留**（XOR CHECK が生きている。CHECK の代替を決めてから）。
   - `previous_gls_numbers` は監査目的なら DROP 前に `mcp_audit_log` 相当へ退避するか、
     「監査は `project_stage_changes`/`ai_outputs` で足りる」と決めてから。
   - → `server/src/shared/db/migrations/242_drop_dead_project_columns.sql` で実施。
2. **バグ①〜⑤の修正**（②は `intake_channel='inview'` に書き替え＋既存行の backfill、
   ⑤は `includes('live')` 判定＋ `shared/src/types.ts` の型を実態に合わせる）。
   - → 全5件を修正済み（バグ④は「型を直す」を選択 — `lost_at` を TEXT から TIMESTAMPTZ へ
     ALTER し、読み出し側の `::timestamp` キャストを撤去。§2 の表に修正方法を追記）。
3. **死にエンドポイントの削除**: `GET /projects/tags`・一覧画面の `?tag=` クエリ受け取り・
   一覧 SQL の `dates_count`。
   - ⚠️ **実装時に判明した修正**: `?tag=` の SQL フィルタ自体（`ProjectFilter.tag` と
     `(',' || p.tags || ',') LIKE ?`）は**削除しなかった** — 当初の棚卸しは client の
     Web 画面だけを見ており、MCP `list_projects` ツールの `tag` 引数がこのフィルタを
     実際に使っていることを見落としていた（実サーバーで型検査後に発覚）。死んでいたのは
     REST の「一覧が」のクエリ受け取りだけで、フィルタ本体・MCP 引数は現役なので残した。
4. **会場のガードレール**: MCP `create_studio_booking`/`update` 系の `location_note` に
   `max(40)` と「**短い地名だけ**（例: 用賀 ビジネススクエアタワー18F）。要確認・経緯・
   打診メモは書かない — それらは案件のやり取りへ」を明記。
   ※ AI 入口の変更なので、実装時は `.claude/skills/ai-feedback-loop` の5条件表を PR に付ける。
   - → §6 の5条件表どおり実施。`create_studio_booking` のみ該当（update 系ツールは無し）。

**検証**: `npm run typecheck:all`・`npm run lint`（`droppedColumns.test.ts`・`silentDrop.test.ts`・
`check-migration-numbers.mjs` 含む）・`npm run test`（1519件）緑。検証用 Postgres で
migration 242 の適用・再適用（冪等性）を確認。実サーバー（検証用Postgres）で
案件の作成・更新（`intake_confidence` が実際に書き換わることを確認 = バグ①の実地検証）・
AI確認（`ai_reviewed_by` 無しで 200）・受注へのステージ変更（`won_at` が入ることを確認）・
失注へのステージ変更（`lost_at` が timestamptz として正しく入り、失注分析 API が
月次集計まで正しく返すことを確認 = バグ④の実地検証）・`GET /projects/tags` の404化を
確認済み。

### Phase B — 決めてから直すもの（ユーザー判断が要る）

| 論点 | 選択肢 |
|---|---|
| `logo_permission` | (a) 請求発行の gate に加える（`application_form` と同格にする） / (b) スイッチごと消す。**書けるのに読まれない今が最悪** |
| `tags` | (a) 廃止（台帳の一括編集からも外す） / (b) 正式機能に昇格（正規化・入力UI）。中途半端な現状維持はしない |
| `lessons_learned` | (a) 列ごと廃止し、振り返りは KPT/イベントレポートに一本化 / (b) 失注ダイアログに欄を戻す。**UI から書けないのに画面に枠がある今が最悪** |
| `lost_reason_note` | 表示ゼロのまま集め続けるか、失注パネルに出すか |
| `assigned_to` | 方針文書の側を「主担当は持つ（NOT NULL）。作業の割当はタスク単位」と実態に合わせて書き直す |

### Phase C — 持ち場所の一本化（設計変更・別計画で詳細化）

1. **金額**: 集計系も「見積があれば見積・無ければ想定」に統一し、`revenues`⇔`expected_amount`
   の双方向上書きを一方向（売上→案件は通知のみ等）に改める。
2. **受注/失注日時**: `won_at`/`lost_at` を `project_stage_changes` からの導出
   （またはトリガ的な一点書き込み）に寄せ、③④を構造ごと解消。
3. **実施日**: `event_start`/`event_end` を DATE 型化。`project_dates` は飛び日ラベル専用と
   宣言し、`projectContext.service` の3系統返しを1系統＋ラベルに整理。
4. **書く口の集約**: Excel 取込・決算取込の生 INSERT を `project.service.create` 経由に寄せる
   （冪等キー・履歴・分類導出を1本の道に通す）。

---

## 5. 全57列の判定表（2026-08-27 実測）

凡例: ◎=現役（消せない） ○=現役 △=レガシー/要判断 ✕=死（読み手ゼロまたはUI到達不能）

| 列 | 判定 | ひとこと |
|---|---|---|
| `id` `code` `name` `customer_id` `stage` | ◎ | 中核 |
| `gls_number` `gls_category` | ◎ | 発番・A/B分岐の要（58ファイルが読む） |
| `customer_type` | ○ | サーバー導出のスナップショット（見積単価が読む）。MCP引数は受理して無視 |
| `audience` `project_category` | ◎ | 2段分類の正 |
| `project_type` | ○ | 2段からの導出鏡。GLS-B の3値のため列は残す |
| `project_type_other` | ✕ | create で書かれず表示ゼロ → Phase A で削除 |
| `broadcast_type` | ○ | 別軸（番組種別）。ただしバグ⑤と型の嘘を修正 |
| `media_platform` | △ | 表示・AI文脈のみ。`broadcast_type` と番組情報1本に集約候補 |
| `expected_amount` | △ | 持ち主不在（書き手7経路・双方向ループ）→ Phase C |
| `event_start` `event_end` | ◎ | 実施日の実質の正。TEXT型は Phase C で DATE 化 |
| `started_on` `ends_on` | ○ | GPM（GLS-B）専用の工程期間。event_start とは別物（migration 179 明記） |
| `assigned_to` | ◎ | 実装上は必須。方針文書の側を直す |
| `tags` | △ | レガシー。廃止か昇格か（Phase B） |
| `lost_reason` | ○ | 失注分析が読む（マスタ名の文字列） |
| `lost_reason_note` | △ | 全経路で書くが表示ゼロ |
| `lessons_learned` | △ | UI から書けない・表示だけ残存 |
| `application_form` | ◎ | 請求発行を止める読み手がいる |
| `logo_permission` | ✕ | 書けるのに読み手ゼロ（Phase B で去就） |
| `created_at` `updated_at` `created_by` `updated_by` `deleted_at` | ◎ | 監査の基本 |
| `lost_at` | ○ | TEXT型バグ④。Phase C で stage_changes 導出へ |
| `won_at` | △ | 読み手1つ・GPM経路で書き漏れ（バグ③）。Phase C で導出へ |
| `box_url_internal` `box_url_external` | ◎ | BOX 連携の中核（機械管理） |
| `previous_gls_numbers` | ✕ | 追記だけで読み手ゼロ → Phase A で削除（監査の代替を決めて） |
| `ai_reviewed_at` | ◎ | 受付の未確認バッジ・AI_INBOX の要 |
| `ai_reviewed_by` | ✕ | 読み手ゼロ → Phase A で削除 |
| `message_id` | ✕ | 読み手ゼロ（実体は `ai_outputs`）→ Phase A で削除 |
| `idempotency_key` | ◎ | 二重作成防止の実働 |
| `source_channel` | ✕ | `intake_channel` と重複・読み手ゼロ → バグ②修正と同時に削除 |
| `intake_channel` | ◎ | リード経路の正 |
| `intake_confidence` | ○ | 受付の確信バッジ。update の silent drop（バグ①）を修正 |
| `contact_name` | ○ | ご担当（先方）。`companies.contact_name` とは意図して別 |
| `recurrence` | ○ | 表示のみだが入力・表示とも揃っている |
| `attendee_count` | ○ | 来場人数。無観客で NULL 強制のガードも揃っている |
| `goal` | ○ | 案件内容 |
| `reply_due` | ✕ | フォーム削除済み・MCPのみ書ける → Phase A で削除 |
| `wants` | ✕ | 同上 |
| `flow_applied_at` | ○ | 標準工程の冪等マーカー |
| `flow_template_id` | △ | データとしては死・XOR CHECK のみ生存（削除は保留） |
| `gpm_kind` `pm_company` `gpm_template_id` | ○ | GPM（GLS-B）専用で完結 |
| `kessan_marker` | ○ | 決算取込の出自タグ（notes ハックの後継＝これ自体が重複解消） |
| `snooze_until` | ◎ | Phase 1 新設。書き手1・導出1か所の模範 |

関連テーブル: `project_dates` は△（飛び日ラベル専用に格下げ・Phase C）。

---

## 6. AIフィードバック5条件（本計画で AI に触れる変更 = Phase A-4 の location_note ガードレール）

| # | 条件 | 判定 | 根拠 |
|---|---|---|---|
| 1 | AI出力の記録 | ○ | `create_studio_booking` は `mcp_audit_log` に記録済み（予約は `ai_outputs` 対象外だが、監査ログに引数全文が残る） |
| 2 | 修正を差分で | △ | 人が予約ダイアログで `location_note` を直しても差分は取っていない。**穴** — Phase B 以降で予約系も `ai_outputs`/`ai_corrections` に乗せるか判断（代替: 監査ログと更新履歴の突き合わせ） |
| 3 | 成果指標 | △ | 「AIが書いた場所メモが直されずに残った率」は未計測。代替: 引数説明の改善で入口の質を上げ、月次AIレビュー（v4.5.0 で新設）で目視確認 |
| 4 | 改善へ戻す経路 | ○ | ツール説明の書き換え自体が経路（メール取込スキルは説明文を毎回読む） |
| 5 | レビュー頻度と担当 | ○ | 営業側の月次AIレビュー（`sales_ai_review`・毎月1日・sales manager）に予約起票も含めて点検 |

条件2・3の穴は「できない」ではなく**予約系を AI ループ対象に含めるかの未決定**。
Phase B の論点に含める。
