# GMO ONAiR MCP サーバー (案件管理・カレンダー・財務管理)

Claude Code などの MCP (Model Context Protocol) クライアントから、ONAiR のデータを直接参照・操作するためのコネクタ。v2.9.171 で追加。

## エンドポイント

```
POST https://<host>/api/v1/mcp      (Streamable HTTP / stateless / JSON 応答)
```

- 本番: `https://gmo-onair.jp/api/v1/mcp`
- 検証: `https://dev.gmo-onair.jp/api/v1/mcp`

nginx の既存 `/api/` プロキシをそのまま通るため、インフラ側の追加設定は不要。

## 認証

**2 方式を併用** (どちらでもアクセス可):

### A. OAuth 2.1 / ONAiR ログイン連携 (v2.9.194+・**claude.ai 組織コネクタ推奨**)

claude.ai の**組織管理カスタムコネクタ**は接続時に必ず OAuth 2.1 + 動的クライアント登録 (DCR) を試みる (「認証なし / APIキー」を宣言できない)。そのため本サーバー自身が OAuth 2.1 認可サーバー兼リソースサーバーになっている。認証は **ONAiR ログイン連携** — 各メンバーが自分の ONAiR アカウントでサインインし、以降の AI 書き込みが**本人名義**で監査ログに残る (共用 `mcp-claude` を脱却)。

- **エンドポイント**:
  - メタデータ (RFC 8414 / 9728): `GET /.well-known/oauth-authorization-server`、`GET /.well-known/oauth-protected-resource/api/v1/mcp`
  - 認可サーバー: `/api/v1/mcp/oauth/{authorize,token,register,revoke}`
- **フロー**: コネクタが `/register` で自己登録 (public client / PKCE S256) → `/authorize` へ誘導 → 未ログインなら ONAiR の `/login?redirect=...` に飛び、ログイン後に認可コードを発行 → `/token` で access (JWT・1時間) + refresh (30日) を取得 → 以降 `Authorization: Bearer <access>` で MCP を呼ぶ。
- **actor**: OAuth トークン経由の書き込みは `created_by` / 監査ログの actor が**実 ONAiR ユーザー id** になる (誰の指示かが確実に残る)。
- アクセストークンは JWT (ステートレス・DB 不要)。署名鍵は `JWT_SECRET` から派生した別鍵 (ONAiR セッション JWT とは分離)。リフレッシュトークンのみ DB (`mcp_oauth_refresh_tokens`) に保持し失効可能。
- OAuth は `MCP_API_KEY` の設定有無に関わらず**常に有効**。

### B. 静的 APIキー (Claude Code CLI / 個人利用)

次の 3 通りのいずれかで送る:

1. `Authorization: Bearer <key>` ヘッダー (推奨・Claude Code 向け)
2. `X-API-Key: <key>` ヘッダー
3. URL クエリ `?key=<key>` (v2.9.172+)

| 環境変数 (VPS の `/root/gmo-onair/.env`) | 適用先 |
|---|---|
| `MCP_API_KEY` | app_prod (gmo-onair.jp) |
| `MCP_API_KEY_DEV` | app_dev (dev.gmo-onair.jp) |

- キー生成: `openssl rand -hex 32`。**キーローテーション**は `.env` を差し替えてコンテナ再起動するだけ (旧キー即失効)。
- 静的キー経由の書き込みは actor が共用 `mcp-claude` になる (誰の指示かは任意引数 `requested_by` で補う)。
- ⚠ このキー 1 本で全ツール (読み取り + 書き込み) が実行可能 (アプリ内の per-user 権限は適用されない)。キーの共有範囲は sales/studio/budget 権限保持者相当に限定すること。

### 認証失敗時

静的キーにも OAuth トークンにも該当しない場合は **401 + `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/v1/mcp"`** を返す。これにより claude.ai は本サーバーの OAuth を発見してサインインに進む。

## Claude Code への登録 (静的キー)

```bash
claude mcp add --transport http onair https://dev.gmo-onair.jp/api/v1/mcp \
  --header "Authorization: Bearer <MCP_API_KEY_DEV>"
```

登録後、Claude Code 内で「今月のスタジオ予約を見せて」「GLS-B005 の収支は？」のように使える。

## claude.ai / Claude アプリの「カスタムコネクタ」への登録

### 組織コネクタ (OAuth・推奨)

設定 → コネクタ → カスタムコネクタを追加 で、**URL だけ**入力する (OAuth Client ID 欄は空のまま):

```
https://gmo-onair.jp/api/v1/mcp
```

接続すると ONAiR ログイン画面が開くので、自分の ONAiR アカウントでサインインする。以降のツール実行は本人名義で監査ログに残る。ログイン済みブラウザなら自動で認可される。

### 個人コネクタ (キー付き URL・OAuth を使わない場合)

OAuth を使わず APIキーで繋ぎたい場合は、URL に `?key=` を付ける (OAuth 欄は空のまま):

```
https://gmo-onair.jp/api/v1/mcp?key=<MCP_API_KEY>
```

URL 自体が秘密情報になるので共有・掲示しないこと。キーをローテーションしたらコネクタ URL も更新する。

## ツール一覧 (82 種 / 19 カテゴリ / v4)

> **この一覧は手で書いています。** 実際に登録されているツールは
> `node scripts/generate-mcp-tools.mjs` が `server/src/contexts/mcp/tools/*.ts` から
> 数え直して `client/public/mcp-tools.json` を作ります（画面の「MCP コネクタ」はそれを読む）。
> **ツールを足したら生成スクリプトを流し、この文書も直してください** —
> v4 の時点で本文は「71 種」のままで、`mytasks` 10 種と `aifeedback` 1 種が丸ごと抜けていました。
>
> 内訳: projects 6 / customers 4 / activities 4 / tasks 10 / members 3 / minutes 3 /
> studio 4 / finance 4 / budget 4 / pricing 3 / analytics 3 / users 1 / mytasks 10 /
> opsreports 5 / eventreports 5 / inview 3 / inbox 4 / security-cards 5 / aifeedback 1

### 案件管理
| ツール | 種別 | 概要 |
|---|---|---|
| `list_projects` | read | 案件検索・一覧 (search / stage / tab / gls_category / 開催期間 / ページング) |
| `get_project` | read | 案件詳細 + 収支サマリー (売上 / 仕入 / 粗利 / 粗利率) |
| `create_project` | write | ヨミ案件の新規登録 (stage=neta 固定。assigned_to は list_users で解決した users.id 必須)。**idempotency_key を渡すと二重登録を防止** (既存なら再作成せず既存を返す)。message_id / source_channel も保存可 (メール取込用) |
| `update_project` | write | 部分更新 (サーバー側で既存値とマージ — 渡したフィールドだけ変わる) |
| `change_project_stage` | write | ステージ変更。**e_lost (失注) は confirm 2段階**。d_hold で仮押さえ予約を自動作成 |
| `issue_gls` | write | **GLS 発番 (confirm 2段階・取消不可)**。プレビューで昇格ステージ / 見積変換件数 / BOXリネームを提示 |

### 顧客・営業活動・タスク・担当者
| ツール | 種別 | 概要 |
|---|---|---|
| `list_customers` / `get_customer` | read | 顧客検索・詳細 (+直近案件10件) |
| `create_customer` | write | 顧客登録 (**重複ガード**: 類似名があれば候補を返して作成しない。`allow_duplicate:true` で強制) |
| `update_customer` | write | 顧客の部分更新 (マージ) |
| `list_activity_logs` | read | 営業活動記録一覧。`upcoming:true` で次回アクション予定 (N日以内・未完了のみ) |
| `list_overdue_actions` | read | 期限超過の次回アクション (対応漏れ) 一覧。定期リマインド→Slack 通知用 (毎朝叩いて「対応漏れ N件」を投稿する運用)。days_overdue / 案件 / 担当者 / 顧客を含む |
| `create_activity_log` / `update_activity_log` | write | 活動記録の登録/更新 (user_id は活動した担当者の users.id 必須)。create は **idempotency_key で二重登録防止** + message_id / source_channel 保存可。同一メールから案件と活動を両方起票するときは key を意図別に分ける (例 `email:<msgid>:project` / `:activity`) |
| `list_tasks` | read | タスク一覧 (案件内 or 進行中案件の横断) |
| `create_task` / `update_task` | write | タスク作成/更新 (completed で完了切替。progress 0-100 / is_milestone ◆ も指定可) |
| `move_task` | write | タスクをかんばん列へ移動 / 列内の並び替え (column_id + sort_order) |
| `reorder_tasks` | write | 同一案件内のタスク並び順を一括更新 |
| `delete_task` | write | タスク削除 (soft delete・子タスクも一緒に) |
| `bulk_create_tasks` | write | タスク一括作成 (制作/プロジェクトのスケジュール雛形を一気に投入。start/due・担当・列・progress・is_milestone を指定可) |
| `list_task_dependencies` | read | 案件内のタスク依存 (先行→後続) 一覧 |
| `add_task_dependency` | write | タスク依存を追加 (先行 predecessor → 後続 successor。冪等・循環は拒否。ガントの → 線) |
| `remove_task_dependency` | write | タスク依存を削除 |
| `list_project_members` | read | 案件の担当メンバー一覧 (複数担当・外部の方含む) |
| `add_project_member` | write | 担当メンバー追加 (登録ユーザーは user_id / 外部の方は member_name+is_external。同ユーザーは冪等) |
| `remove_project_member` | write | 担当メンバーを外す (soft delete) |
| `list_users` | read | ユーザー一覧 — 担当者名 → users.id の解決に使う |

### カレンダー・財務・分析
| ツール | 種別 | 概要 |
|---|---|---|
| `list_studio_rooms` / `list_studio_bookings` | read | 拠点部屋一覧・予約一覧 (上限500件) |
| `get_studio_availability` | read | 空き照会 (部屋ごとの busy 予約 + 終日空き日)。単日照会の境界取りこぼしが無い。「◯日空いてますか」回答用。最大92日 |
| `create_studio_booking` | write | スタジオ予約作成 (既定 status=tentative) |
| `get_monthly_summary` | read | 月次/期間の損益サマリー (損益7指標) |
| `list_revenues` / `list_purchases` / `list_sga` | read | 売上/仕入/販管費一覧 |
| `get_sales_funnel` | read | 営業ファネル (ステージ別件数/金額・転換率・滞留・月次推移) |
| `get_lost_reason_analysis` | read | 失注理由分析 (+教訓・学び) |
| `get_sales_performance` | read | 担当者別 目標vs実績 |

### 料金表・見積 (v2.9.193+)
| ツール | 種別 | 概要 |
|---|---|---|
| `list_pricing` | read | 料金表マスタ (カテゴリ別に項目・calc_type・定価/グループ内価格)。見積を組む前に pricing_item_id を調べる |
| `get_project_simulation` | read | 案件の見積明細 + 合計 |
| `set_project_simulation` | write | 料金表から案件の見積を組んで設定 (既存は全置換)。subtotal は calc_type からサーバー算出、単価は案件の customer_type で自動選択。**既定 status=draft (AI 下書き・未確定)**: expected_amount には反映されず、担当者がアプリの案件画面で「確定する」を押すと最終化される。status=final を明示すると即反映 |

### 日常業務 (dailyops — 週報 / 日報)
| ツール | 種別 | 概要 |
|---|---|---|
| `get_weekly_activity_stats` | read | 週次活動集計 (新規案件 / 活動内訳 / パイプライン / 売上 / 今週・来週イベント / 来週期限の次回アクション)。week_start 省略時=先週月曜、任意日は月曜へ正規化 |
| `submit_ops_report` | write | レポート本体の upsert (kind × period_key で 1 本・再実行は更新)。**items (行) には触れない** — 人間の追記は消えない。published を draft に戻すこともない |
| `add_ops_report_items` | write | レポートへ行を追加 (レポートが無ければ自動作成)。daily_news は URL 重複を自動スキップ (再実行安全) |
| `list_ops_reports` | read | レポート一覧 (メタのみ)。投稿済み確認・欠番チェック用 |
| `get_ops_report` | read | レポート全文 + 行 (人間の追記行も含む — それを踏まえて本文を更新できる) |

kind と運用契約:
- `weekly_activity` (ウィークリー活動報告) — 全社で週 1 本。period_key = 週開始日の月曜。`get_weekly_activity_stats` の結果を文章化して body に、結果そのものを payload の `{stats: ...}` に入れて **status='draft'** で `submit_ops_report`。人間がアプリでトピック行を追記し「確認・確定」で published にする。
- `daily_news` (デイリーニュース報告) — 日 1 本。period_key = 日付。Web の業界ニュースを `add_ops_report_items` で行として投稿 (**published** で直接公開・確定操作なし)。行のフィールド: category (LED/照明/映像/音声/配信/コンテンツ/スタジオ/AR/XR/その他)、content (1行要約)、url、ai_related (AI 関連か)、note。採用フラグ (pick 1〜5) は人間がアプリで設定する。

### 内覧会 来場予約 (dailyops — inview)
| ツール | 種別 | 概要 |
|---|---|---|
| `register_inview_attendee` | write | Kairos3 の登録通知メールを取り込む。`session_label` に「参加希望の回」をそのまま渡すと日付/時間帯/対象を自動抽出。同 email × 同 session_label は更新 (再取込で重複しない)。同行者・全連絡先フィールド対応 |
| `list_inview_attendees` | read | 来場予約一覧 (from/to/upcoming で絞り込み) |
| `list_inview_sessions` | read | 回 (セッション) ごとの 登録件数 / 合計人数 / 来場済み数 集計 |

### 見積/請求・その他問い合わせ (dailyops — inbox)
| ツール | 種別 | 概要 |
|---|---|---|
| `record_finance_doc` | write | メール受信の 見積書/請求書/注文書 を取込 (doc_type / 送付者 / 金額 / 締月 / 支払期日 / message_id で重複ガード)。status=new。承認/却下/処理完了は人がアプリで操作 |
| `list_finance_docs` | read | 見積/請求書の一覧 (status / doc_type / pending) |
| `record_inquiry` | write | 他カテゴリに属さない**有益メールのみ**登録。**スパム・営業・メルマガ・他ツール対象 (見積請求/内覧会/案件) は呼び出し前に AI が除外する契約**。summary / importance / category / action_needed を付与 |
| `list_inquiries` | read | その他問い合わせの一覧 (importance / unhandled) |

**v4: メールの中身を「読める形」で渡せるようになりました**（migration 160）。
`record_finance_doc` / `record_inquiry` に**任意の引数**が2つ増えています。

| 引数 | 中身 |
|---|---|
| `details` | メールの中身を**意味の単位に分けた配列**（最大30）。`heading` 小見出し / `text` 段落 / `fields` ラベルと値の組 / `bullets` 箇条書き / `table` 表 / `quote` 本文からの引用 / `note` 注意 / `link` 参考URL |
| `body_text` | メール本文の**全文**（切り詰めない）。要約ではなく原文 |

- **HTML やマークダウンを書かせません。** 取引先の文面がそのまま実行される（XSS）うえ、
  画面の書体・色・余白が AI ごとに変わり、後から検索も集計もできなくなります。
  **AI は「何の情報か」を言い、見せ方はアプリの部品が決めます**
- 形はサーバー (`shared/services/rich-content.ts`) が検査します。
  **知らない種類は捨て**、`javascript:` の URL は落とし、長さに上限があります
- おすすめの組み立て方: ① `fields` に「差出人の所属・要件・希望日・人数・予算・返事の期限」など
  **読み取れた項目だけ**（読み取れなかった項目は入れない＝推測しない）② `bullets` に条件
  ③ `quote` に判断の根拠になる原文をそのまま
- **この2つのツールは `ai_outputs` に引数の全文を残します**（会社方針「AI を使い捨てにしない」の条件1）。
  人が画面で直すと、サーバーが自動で差分を `ai_corrections` に入れます（条件2）

> ⚠️ **本番のメール取込スキルは `/root/.claude/skills/sales-mail-gmoonair/` にあり Git 管理外です。**
> ツール側に引数を足しても**スキルが追随しないと1件も埋まりません**。
> スキルの手順6（notes に全部詰める）を、`details` を渡す形に直す必要があります。

### スタジオ セキュリティカード (dailyops — security cards)
GMOサムライスタジオ用賀のセキュリティカード 24 枚。カードはセキュリティレベルに応じて解錠できる部屋が異なる。貸出対応者は GMO ONAiR ユーザー。
| ツール | 種別 | 概要 |
|---|---|---|
| `list_security_cards` | read | カード一覧 (レベル・解錠できる部屋 access・貸出状況)。status=available/lent で絞り込み |
| `get_security_card` | read | カード 1 枚の詳細 (解錠できる部屋・現在の貸出・履歴)。card_no (1-24) or card_id |
| `lend_security_card` | write | 貸出。card_no + 貸出先担当者 (borrower_person) 必須。会社/連絡先/目的/貸出日/返却予定日/対応者を記録。貸出中はエラー |
| `return_security_card` | write | 返却。card_no で指定。返却日は既定で今日 |
| `list_security_card_lendings` | read | 貸出履歴 (status=active/returned・card_id・from/to で絞り込み) |

### 隔週キープ資料 (v2.9.200+ — イベント報告 / 月次予算・損益 / 議事録)
| ツール | 種別 | 概要 |
|---|---|---|
| `get_event_report` | read | 案件のイベント実施報告 (トピック / 来場者数 / 写真) + 収支サマリー。未作成は found=false |
| `list_event_reports` | read | 実施報告の一覧 (reported_at 範囲・既定 confirmed のみ)。案件情報 + 収支サマリー同梱 — 隔週キープの②ページ生成の主入口 |
| `upsert_event_report` | write | 実施報告の作成/更新 (**渡したフィールドのみマージ更新**)。headline / highlights / 来場者数 / report_status (draft→confirmed で資料掲載) |
| `attach_event_photo` | write | 写真の追加 (実体は Box・box_file_id 参照のみ保持。レポート未作成なら draft を自動作成) |
| `detach_event_photo` | write | 写真の削除 (Box 上の実体は削除しない) |
| `get_monthly_budget` | read | 月次予算 (売上/固定原価/変動原価/販管費/営業利益の目標) |
| `upsert_monthly_budget` | write | 月次予算の登録/更新 (マージ更新。operating_profit 未指定は構成要素から自動計算) |
| `upsert_monthly_actual_override` | write | 実績補正 (経理確定値) の登録 — FIXED-COGS 償却の未計上補完・販管費確定値 |
| `get_monthly_pl` | read | **損益ページの単一入口**: 予算 / 補正込み実績 / 対目標差・比・判定 (売上・利益系: 実績≧目標→○、費用系: 実績≦目標→○、目標未登録→"-") |
| `get_meeting_minutes` | read | 議事録サマリ (決定事項 / 領域別トピック / 次回開催日) |
| `upsert_meeting_minutes` | write | 議事録サマリの登録/更新 (マージ更新) |
| `list_meeting_minutes` | read | 議事録サマリの一覧 (開催日範囲・新しい順) — 前回会議分の取得に使用 |

絞り込み・並び替え・書き込みロジックは UI と同一の service 層 (`projectService` / `activityLogService` / `projectTasksService` / `salesAnalyticsService` / `finance/list-query.ts`) を共有しているため、画面と同じ結果・同じ副作用になる。

## confirm 2段階フロー (重要操作)

`issue_gls` と `change_project_stage` (e_lost) は誤操作防止のため 2段階:

1. `confirm` なし (または false) で実行 → **書き込まず** に `{preview: true, effects: [...], warning}` を返す
2. AI がプレビュー内容をユーザーに提示し、明示的な了承を得る
3. `confirm: true` を付けて再実行 → 実行される

ツールの説明文にも「承認なしの confirm: true は禁止」と明記済み。

## 監査ログ (mcp_audit_log)

全ての書き込みツールは成功時に `mcp_audit_log` テーブルへ記録される (tool_name / 引数 / 結果サマリー / requested_by / 日時)。共用キー運用のため、各書き込みツールの任意引数 `requested_by` (指示者名) を AI が聞き取って渡す設計。記録失敗はツールの成否に影響しない (fire-and-forget)。

確認クエリ例:
```sql
SELECT tool_name, requested_by, result_summary, created_at FROM mcp_audit_log ORDER BY created_at DESC LIMIT 50;
```

## 典型フロー (AI への指示例)

- **メール/議事録の取込起票**: 文面を貼って「起票して」→ AI が `list_customers` → (無ければ `create_customer`) → `create_project` → `create_activity_log` (次回アクション付き)
- **GLS 発番**: 「この案件 GLS 発番して」→ AI がプレビュー提示 → 「OK」→ confirm:true で実行
- **朝のダイジェスト**: `get_sales_funnel` + `list_activity_logs(upcoming:true)` + `list_tasks` で本日のサマリーを生成
- **デイリーニュース報告 (毎朝の定期実行)**: Web 検索で業界ニュース (映像制作/配信/スタジオ/LED/照明/AR-XR 等) を収集 → 各記事を 1 行要約 → `add_ops_report_items(kind=daily_news, period_key=今日)` で投稿。再実行しても URL 重複はスキップされる
- **ウィークリー活動報告 (週明けの定期実行)**: `get_weekly_activity_stats` で先週の集計を取得 → 文章化 → `submit_ops_report(kind=weekly_activity, status=draft, payload={stats})` で投稿 → 人間がアプリ (`/daily/weekly`) でトピック追記・確認・確定

## 動作確認 (curl)

```bash
BASE=https://dev.gmo-onair.jp/api/v1/mcp
KEY=<MCP_API_KEY_DEV>
H=(-H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream")

# initialize
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# ツール一覧
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# ツール呼び出し
curl -s $BASE "${H[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{"limit":3}}}'
```

期待される異常系: 静的キーなし/誤り (かつ OAuth トークンなし) → 401 + `WWW-Authenticate`、GET → 405。

### OAuth ダンス (curl)

```bash
BASE=https://dev.gmo-onair.jp
# 1. メタデータ
curl -s $BASE/.well-known/oauth-authorization-server | jq
# 2. DCR (public client)
curl -s -X POST $BASE/api/v1/mcp/oauth/register -H 'Content-Type: application/json' \
  -d '{"client_name":"test","redirect_uris":["http://localhost:9999/cb"]}' | jq
# 3. /authorize はブラウザで開く (ONAiR ログイン cookie が要るため)。code を受け取る
# 4. /token に code + code_verifier (PKCE) を POST して access_token を得る
# 5. Bearer <access_token> で /api/v1/mcp を叩く
```

## 実装構成

```
server/src/contexts/mcp/
├── index.ts        ルート (/api/v1/mcp、stateless Streamable HTTP、actorContext で actor をリクエストスコープ化)
├── auth.ts         認証 二本立て (静的キー timingSafeEqual / OAuth アクセストークン検証)
├── server.ts       McpServer 構築 + ツール登録
├── helpers.ts      ok/runTool/clampLimit/pagination/audit/preview + actorContext/currentActorId
├── oauth/          OAuth 2.1 認可サーバー (v2.9.194+)
│   ├── routes.ts        well-known メタデータ + /authorize(ONAiRログインゲート)・/token・/register・/revoke
│   ├── provider.ts      OAuthServerProvider (code発行/交換・PKCE・JWT access・refresh・失効)
│   ├── store.ts         DCR クライアントストア (public client / PKCE)
│   ├── context.ts       authorizeContext (ALS で /authorize の ONAiR ユーザーを provider へ渡す)
│   └── token-secret.ts  アクセストークン JWT 署名鍵 (JWT_SECRET 派生の別鍵) + TTL
└── tools/
    ├── projects.tools.ts   projectService を再利用
    ├── studio.tools.ts     studio-booking.service を再利用
    ├── finance.tools.ts    monthly-summary.service + list-query を再利用
    ├── richContentSchema.ts メールの中身を「読める形」で受け取る引数 (v4・migration 160)
    └── … (customers / activities / tasks / members / minutes / analytics / users /
           mytasks / pricing / budget / opsreports / eventreports / inview / inbox /
           security-cards / aifeedback)
```

### 権限ゲート (gate.ts)

- **静的 APIキー**はフルアクセス運用鍵として素通り
- **OAuth actor** は書き込みツールごとに対応モジュールの権限が要る（`WRITE_TOOL_PERMISSIONS`）。
  `module` は**配列も受ける**（どれか1つを満たせばよい）—
  v4 で `record_finance_doc` を「`dailyops` か `budget`」にした（HTTP 側と揃えた）
- ⚠️ **読み取りツール（44 種）はゲートがありません。** OAuth で自分の ONAiR
  アカウントを繋げば、**権限ゼロの人でも `list_projects` / `list_revenues` /
  `list_inquiries` などが読めます**。v3.2.2 で `GET /search` に対して塞いだのと同じ形の穴が
  MCP 側に残っています。塞ぐには read ツールにもモジュール表を持たせる必要があり、
  44 種あるので**別の作業**にしてあります

- スタジオ予約と月次サマリーのロジックは v2.9.171 でルートから service 層へ抽出済み — UI と MCP が同一コードパスを通る。
- 書き込みツールの actor は `currentActorId()` で解決: OAuth 経由なら実 ONAiR ユーザー id、静的キー経由なら共用 `mcp-claude`。
- OAuth 用テーブル: `mcp_oauth_clients` / `mcp_oauth_codes` (単回使用・10分) / `mcp_oauth_refresh_tokens` (30日・失効可) — migration 125。
