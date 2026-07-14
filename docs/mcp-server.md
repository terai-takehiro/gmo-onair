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

静的 APIキー。次の 3 通りのいずれかで送る:

1. `Authorization: Bearer <key>` ヘッダー (推奨・Claude Code 向け)
2. `X-API-Key: <key>` ヘッダー
3. URL クエリ `?key=<key>` (v2.9.172+。**claude.ai カスタムコネクタ向け** — 追加ダイアログにヘッダー入力欄が無い UI があるため。URL 自体が秘密情報になるので、この URL を共有・掲示しないこと)

| 環境変数 (VPS の `/root/gmo-onair/.env`) | 適用先 |
|---|---|
| `MCP_API_KEY` | app_prod (gmo-onair.jp) |
| `MCP_API_KEY_DEV` | app_dev (dev.gmo-onair.jp) |

- **未設定 = 機能無効**: キーが設定されていない環境では `/api/v1/mcp` は常に 503 を返す (デプロイしただけでは何も公開されない)。
- キー生成: `openssl rand -hex 32`
- **キーローテーション**: `.env` の値を差し替えてコンテナ再起動するだけ。旧キーは即失効する。
- ⚠ このキー 1 本で下記 3 ドメインの読み取り + スタジオ予約作成が可能 (アプリ内の per-user 権限は適用されない)。キーの共有範囲はアプリの sales/studio/budget 権限を持つメンバー相当に限定すること。

## Claude Code への登録

```bash
claude mcp add --transport http onair https://dev.gmo-onair.jp/api/v1/mcp \
  --header "Authorization: Bearer <MCP_API_KEY_DEV>"
```

登録後、Claude Code 内で「今月のスタジオ予約を見せて」「GLS-B005 の収支は？」のように使える。

## claude.ai / Claude アプリの「カスタムコネクタ」への登録

設定 → コネクタ → カスタムコネクタを追加 で、URL に**キー付き URL** を入力する (OAuth 欄は空のまま):

```
https://gmo-onair.jp/api/v1/mcp?key=<MCP_API_KEY>
```

Anthropic のクラウドから接続されるため、claude.ai (Web)・デスクトップ・モバイルアプリすべてで同じコネクタが使える。キーをローテーションしたらコネクタの URL も更新すること。

## ツール一覧 (32 種 / v2.9.179+)

### 案件管理
| ツール | 種別 | 概要 |
|---|---|---|
| `list_projects` | read | 案件検索・一覧 (search / stage / tab / gls_category / 開催期間 / ページング) |
| `get_project` | read | 案件詳細 + 収支サマリー (売上 / 仕入 / 粗利 / 粗利率) |
| `create_project` | write | ヨミ案件の新規登録 (stage=neta 固定。assigned_to は list_users で解決した users.id 必須) |
| `update_project` | write | 部分更新 (サーバー側で既存値とマージ — 渡したフィールドだけ変わる) |
| `change_project_stage` | write | ステージ変更。**e_lost (失注) は confirm 2段階**。d_hold で仮押さえ予約を自動作成 |
| `issue_gls` | write | **GLS 発番 (confirm 2段階・取消不可)**。プレビューで昇格ステージ / 見積変換件数 / BOXリネームを提示 |

### 顧客・営業活動・タスク・担当者
| ツール | 種別 | 概要 |
|---|---|---|
| `list_customers` / `get_customer` | read | 顧客検索・詳細 (+直近案件10件) |
| `create_customer` | write | 顧客登録 (**重複ガード**: 類似名があれば候補を返して作成しない。`allow_duplicate:true` で強制) |
| `update_customer` | write | 顧客の部分更新 (マージ) |
| `list_activity_logs` | read | 営業活動記録一覧。`upcoming:true` で次回アクション予定 (N日以内) のみ |
| `create_activity_log` / `update_activity_log` | write | 活動記録の登録/更新 (user_id は活動した担当者の users.id 必須) |
| `list_tasks` | read | タスク一覧 (案件内 or 進行中案件の横断) |
| `create_task` / `update_task` | write | タスク作成/更新 (completed で完了切替) |
| `list_users` | read | ユーザー一覧 — 担当者名 → users.id の解決に使う |

### カレンダー・財務・分析
| ツール | 種別 | 概要 |
|---|---|---|
| `list_studio_rooms` / `list_studio_bookings` | read | 拠点部屋一覧・予約一覧 (上限500件) |
| `create_studio_booking` | write | スタジオ予約作成 (既定 status=tentative) |
| `get_monthly_summary` | read | 月次/期間の損益サマリー (損益7指標) |
| `list_revenues` / `list_purchases` / `list_sga` | read | 売上/仕入/販管費一覧 |
| `get_sales_funnel` | read | 営業ファネル (ステージ別件数/金額・転換率・滞留・月次推移) |
| `get_lost_reason_analysis` | read | 失注理由分析 (+教訓・学び) |
| `get_sales_performance` | read | 担当者別 目標vs実績 |

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

期待される異常系: キーなし/誤り → 401、`MCP_API_KEY` 未設定 → 503、GET → 405。

## 実装構成

```
server/src/contexts/mcp/
├── index.ts        ルート (/api/v1/mcp、stateless Streamable HTTP)
├── auth.ts         APIキー認証 (timingSafeEqual)
├── server.ts       McpServer 構築 + ツール登録
├── helpers.ts      ok/runTool/clampLimit/pagination
└── tools/
    ├── projects.tools.ts   projectService を再利用
    ├── studio.tools.ts     studio-booking.service を再利用
    ├── finance.tools.ts    monthly-summary.service + list-query を再利用
    └── opsreports.tools.ts dailyops の ops-report.service / weekly-stats.service を再利用
```

スタジオ予約と月次サマリーのロジックは v2.9.171 でルートから service 層へ抽出済み (`production/services/studio-booking.service.ts` / `finance/services/monthly-summary.service.ts`) — UI と MCP が同一コードパスを通る。
