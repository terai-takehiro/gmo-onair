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

## ツール一覧 (9 種)

| ツール | 種別 | 概要 |
|---|---|---|
| `list_projects` | read | 案件検索・一覧 (search / stage / tab / gls_category / 開催期間 / ページング) |
| `get_project` | read | 案件詳細 + 収支サマリー (売上 / 仕入 / 粗利 / 粗利率) |
| `list_studio_rooms` | read | 拠点 + 部屋一覧 (予約作成時の room_ids 調べ用) |
| `list_studio_bookings` | read | スタジオ予約一覧 (from / to / room_id / project_id。上限 500 件) |
| `create_studio_booking` | **write** | スタジオ予約の新規作成 (唯一の書き込み。既定 status=tentative、`created_by='mcp-claude'` で記録) |
| `get_monthly_summary` | read | 月次/期間の損益サマリー (売上・変動/固定原価・限界利益・売上総利益・販管費・営業利益) |
| `list_revenues` | read | 売上一覧 (計上月 / 案件 / status / 並び替え) |
| `list_purchases` | read | 仕入一覧 (計上月 / 案件 / 固定原価絞り込み / 並び替え) |
| `list_sga` | read | 販管費一覧 (計上月 / source / 並び替え) |

絞り込み・並び替えの条件は UI の一覧 (`finance/list-query.ts`) / `projectService` と同一実装を共有しているため、画面と同じ結果が返る。

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
    └── finance.tools.ts    monthly-summary.service + list-query を再利用
```

スタジオ予約と月次サマリーのロジックは v2.9.171 でルートから service 層へ抽出済み (`production/services/studio-booking.service.ts` / `finance/services/monthly-summary.service.ts`) — UI と MCP が同一コードパスを通る。
