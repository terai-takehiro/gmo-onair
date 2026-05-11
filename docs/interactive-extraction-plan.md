# インタラクティブ演出 切り出しプラン

GMO ONAiR モノレポからインタラクティブ演出 (`client-interactive/` + `server/src/contexts/interactive/`) を別リポジトリ + 別 VPS に切り出すための段階移行プラン。

最終形:
- ONAiR (`gmo-onair`) ← 案件管理 / Qシート / 機材 / 技術資料 / ライブ / 表彰CG
- Interactive (`gmo-onair-interactive`) ← イベントスタンプ / クイズ / アンケート / オーバーレイ
- 連携: 表彰CG (Awards) → Interactive の HTTPS / X-API-Key (実装済 v2.8.113)

---

## 進捗

| Phase | 内容 | 状態 |
|---|---|---|
| 1 | 新リポジトリ雛形作成 | **未着手** (要 GitHub 側操作) |
| 2 | 新 VPS 構築 + ドメイン + DB | **未着手** (要インフラ作業) |
| 3 | 表彰CG ↔ Interactive 連携 API | **完了 (v2.8.113)** ✅ |
| 4 | ONAiR 側の Interactive 削除 + 外部リンク化 | **未着手** (Phase 2 完了後) |
| 5 | SSO 共通認証基盤 | **未着手** (中長期) |

---

## Phase 3 (完了) — 連携 API の構造

### Interactive 側 (現モノレポ内、切り出し後も同じ形)

**外部公開 API** (`/api/v1/external/interactive/*`):
- 認証: `X-API-Key` ヘッダー (`interactive_api_keys` テーブル、SHA-256 ハッシュで保存)
- Cookie / セッション非依存 — サーバー間通信前提
- エンドポイント:
  - `GET /events/:eventId/questions` — クイズ/アンケート問題一覧 (多言語テキスト + 回答数)
  - `GET /questions/:questionId/results` — 選択肢ごとの集計 (count + percent)

**API キー管理 UI** (`/interactive/api-keys`):
- Interactive アプリ内、manager 以上の権限が必要
- 発行直後の 1 回のみ平文キーを画面表示。以降は prefix のみ
- 取消 (revoke) 可能

**ファイル**:
- `server/src/contexts/interactive/services/apiKey.service.ts`
- `server/src/contexts/interactive/routes/apiKeys.routes.ts` (管理 API)
- `server/src/contexts/interactive/routes/external.routes.ts` (外部公開 API)
- `client-interactive/src/pages/ApiKeysPage.tsx`
- migration: `086_interactive_external_api.sql`

### Awards 側

**ブリッジサービス** (`server/src/contexts/awards/services/interactive-bridge.service.ts`):
- `baseUrl` 設定時: HTTPS で外部 Interactive を fetch
- `baseUrl` 空欄時: 同一プロセスの `questionService` を直接呼ぶ (統合運用ショートカット)

**Awards-side API** (`/awards/events/:id/interactive-link/*`):
- `GET /interactive-link` — 設定取得 (API キーはマスク "ak_xxxxx••••")
- `PUT /interactive-link` — 設定保存 (baseUrl, apiKeySecret, eventId, mapping)
- `DELETE /interactive-link` — 解除
- `GET /interactive-link/preview` — 連携先 Interactive の問題一覧を取得
- `POST /interactive-link/ingest` — マッピングに従って結果を取り込み、`awards_entries.points` / `own_points` を更新

**UI**:
- `client-awards/src/components/InteractiveLinkSection.tsx` — EventEditorPage 内のマッピング編集 + 取り込み
- `ControlPage.tsx` ヘッダーの「Interactive 取込」ボタン — 本番中のワンタップ再集計

**設定保存先**: `awards_events.interactive_link JSONB`
```jsonc
{
  "baseUrl": "https://interactive.gmo-onair.jp",  // 空欄=同サーバー
  "apiKeySecret": "ak_xxx...",                     // v1: 平文保存 (社内限定)
  "apiKeyPrefix": "ak_xxxx",
  "eventId": "<interactive event uuid>",
  "mapping": {
    "<interactive question id>": {
      "mode": "choices-as-entries",
      "targetField": "points",                     // or "own_points"
      "choiceMap": { "0": 123, "1": 124, "2": 125 } // choice index → awards_entries.id
    }
  }
}
```

### 既知の制約 (v1)
- API キーは現状 Awards DB に平文で保存 (社内限定運用前提)。Phase 5 の SSO 移行時にシークレットマネージャ化を検討
- マッピングモードは `choices-as-entries` のみ (各選択肢が 1 名のノミネートに対応)。他モード (`correct-as-vote` 等) は必要になり次第追加
- リアルタイム連動は未実装。投票進行中のライブ表示は Phase 5 で SSE / WebSocket を追加検討

---

## Phase 1 — 新リポジトリ雛形

### 推奨リポジトリ名
- `terai-takehiro/gmo-onair-interactive` (公開可否は ONAiR と同等)

### 構成
```
gmo-onair-interactive/
├── client/                       ← 現 client-interactive/ をコピー
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── server/                       ← 現 server/src/contexts/interactive/ をコピー
│   ├── src/
│   │   ├── contexts/interactive/  (そのまま)
│   │   ├── shared/
│   │   │   ├── db/connection.ts
│   │   │   ├── db/migrations/    ← interactive 関連のみ採番し直し
│   │   │   ├── middleware/auth.ts
│   │   │   └── middleware/errorHandler.ts
│   │   ├── routes/index.ts       (interactive のみマウント)
│   │   ├── app.ts
│   │   └── index.ts              (Socket.IO `/interactive` 起動)
│   └── package.json
├── shared/                       ← 共有 UI / token のコピー
│   ├── src/client/
│   │   ├── createApi.ts
│   │   ├── createAuthHook.ts
│   │   ├── queryClient.ts
│   │   ├── uiStore.ts
│   │   ├── RedirectOnce.tsx
│   │   ├── utils.ts
│   │   ├── tokens.css
│   │   ├── ui/                   ← Button/Input/Card/Dialog 等プリミティブ
│   │   └── appNav.ts             ← 単アプリ用に簡素化
│   ├── src/utils/                ← businessDays.ts など使うものだけ
│   ├── tailwind.preset.ts
│   └── package.json (name: "@gmo-onair/shared")
├── docker-compose.yml            ← app + postgres + nginx + certbot
├── nginx/
│   └── interactive.gmo-onair.jp.conf
├── scripts/
│   ├── setup-backup-cron.sh
│   └── restore-db-from-box.mjs   ← ONAiR の Box バックアップ仕組みを移植
├── .github/workflows/
│   ├── deploy-dev.yml
│   └── deploy-prod.yml
├── .env.example
├── package.json (npm workspaces)
└── README.md
```

### 切り出し手順
1. 新リポジトリ初期化 (`gh repo create terai-takehiro/gmo-onair-interactive --private`)
2. `git filter-repo --path client-interactive/ --path server/src/contexts/interactive/ --path-rename client-interactive:client --path-rename server/src/contexts/interactive:server/src/contexts/interactive` で履歴付き抽出 (任意。新規リポジトリでも可)
3. 上記構成にファイル配置 + `package.json` / `tsconfig.json` 整備
4. interactive 関連 migration (013/015/017/018/020/021/022/023) を新リポジトリの `001/002/.../008` に renumber
5. `shared/` を最小コピー (`@gmo-onair/shared` の名前は維持して内部 import パスを使い回す)
6. `BrowserRouter basename="/interactive"` を `"/"` に変更 (ドメイン単独になるため)
7. `vite.config.ts` の `base` を `/` に変更
8. `client/index.html` の lang / title 整備
9. `npm install` → `npm run build` で全アプリビルド通過確認
10. dev / main の 2 ブランチ運用 + GitHub Actions 自動デプロイを移植

### shared/ の扱い
中長期的には `@gmo-onair/shared` を**独立 npm パッケージ**化して両リポから依存させたい。当面はソースコピーで運用 (差分が出たら手動同期)。

---

## Phase 2 — 新 VPS 構築

### 想定スペック
- CoNoHa VPS (最初は 2GB / 3 コア)。同時接続数に応じて `scaling.service.ts` ロジックで動的リサイズ
- ドメイン: `interactive.gmo-onair.jp` (DNS A レコードを新 VPS の IP に向ける)

### DB
- 新 PostgreSQL 16 を VPS 内に Docker で起動
- DB 名: `interactive_prod` / `interactive_dev`
- ONAiR の `00_DB_Backup` 仕組みを移植して 3 時間ごとに Box バックアップ

### Docker Compose
```yaml
services:
  app_prod:
    image: ghcr.io/terai-takehiro/gmo-onair-interactive:main
    ports: ["3000:3000"]
    env_file: [.env.prod]
    depends_on: [postgres]
  app_dev:
    image: ghcr.io/terai-takehiro/gmo-onair-interactive:dev
    ports: ["3001:3000"]
    env_file: [.env.dev]
    depends_on: [postgres]
  postgres:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_USER: interactive
      POSTGRES_DB: interactive_prod
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - "./nginx:/etc/nginx/conf.d:ro"
      - "./certbot/conf:/etc/letsencrypt:ro"
  certbot:
    image: certbot/certbot
    volumes: ["./certbot/conf:/etc/letsencrypt"]
volumes: { pgdata: }
```

### Nginx (interactive.gmo-onair.jp)
- `/` → app_prod:3000
- `/dev/` → app_dev:3001 (任意)
- `/socket.io/` → WebSocket upgrade

---

## Phase 4 — ONAiR 側の Interactive 削除

Phase 2 完了 (新 VPS で interactive.gmo-onair.jp が稼働) 後に実施。

### 削除対象
- `client-interactive/` (ディレクトリ全削除)
- `server/src/contexts/interactive/` (ディレクトリ全削除)
- `server/src/routes/index.ts` から `createInteractiveRoutes()` 削除
- `server/src/index.ts` から `initSocketIO` (`/interactive` namespace 起動) 削除
- `server/src/app.ts` から `serveApp('/interactive', ...)` と `interactiveExternalRoutes` のマウント削除
- `package.json` (root) から `client-interactive` workspace 削除
- DB migrations (013/015/017/018/020/021/022/023) は**残置** (履歴整合)
- 新 migration `087_drop_interactive_tables.sql` を追加して旧テーブルを drop (ONAiR DB から)
  - **重要**: 本番投入前に Interactive データを新 VPS にエクスポート/インポート完了していること

### UI 変更
- 各アプリの `Sidebar` の `getAccessibleApps('interactive', ...)` リンク → `https://interactive.gmo-onair.jp` (外部リンク `target="_blank"`)
- `client/src/pages/HomePage.tsx` などのダッシュボードカード → 同様に外部リンク化
- 表彰CG `InteractiveLinkSection` の `baseUrl` のデフォルト値を `https://interactive.gmo-onair.jp` に
- ローカル ショートカット (`baseUrl` 空欄時の questionService 直叩き) は維持 (テスト用)

### データ移行
1. ONAiR `onair_prod` で interactive 関連テーブルを `pg_dump -t 'interactive_*'`
2. 新 VPS `interactive_prod` に `pg_restore`
3. ID (UUID) はそのまま維持されるので Awards 側のマッピング (`awards_events.interactive_link.mapping`) は変更不要
4. 表彰CG の `baseUrl` 設定だけ「空欄 → `https://interactive.gmo-onair.jp`」に更新

### cutover チェックリスト
- [ ] 新 VPS で `https://interactive.gmo-onair.jp/health` が 200
- [ ] 新 VPS で `interactive_prod` にデータが入っている
- [ ] 新 VPS で API キーを再発行 (元のキーは ONAiR の DB にある = 取り込まれない)
- [ ] 表彰CG `interactive_link` の baseUrl + apiKeySecret を更新
- [ ] 表彰CG で「問題一覧を取得」が成功
- [ ] 表彰CG で「結果を取り込み」が成功
- [ ] DNS A レコードを新 VPS に切替
- [ ] ONAiR から interactive コード削除を main に反映

---

## Phase 5 — SSO 共通認証基盤 (中長期)

### 目的
ONAiR / Interactive を別 VPS 運用しつつ、ユーザーは 1 度のログインで両アプリにアクセスできるように。

### 候補
- **Keycloak**: OSS、自前ホスト可能、Google OAuth プロバイダ統合あり
- **Auth0 / Clerk / Supabase Auth**: SaaS、運用負担なし、コスト発生
- **自前 OIDC**: passport.js + jose で必要最小限のみ実装

### 移行手順 (概要)
1. SSO サーバーをどこかに立てる (推奨: 専用 VPS or SaaS)
2. ONAiR / Interactive 両方の `users` テーブルに `sso_subject` カラム追加
3. 既存 users を SSO subject に紐づけ
4. `createAuthMiddleware` を OIDC トークン検証ベースに置き換え
5. ログイン UI を SSO リダイレクト形に変更
6. mockAuth は dev 環境のみ残置

---

## API 仕様抜粋

### Interactive 外部公開 API

#### GET /api/v1/external/interactive/events/:eventId/questions
**Request header**: `X-API-Key: ak_...`
**Response**:
```json
{
  "data": {
    "event": { "id": "uuid", "title": "イベント名", "status": "live" },
    "questions": [
      {
        "id": "uuid",
        "type": "quiz",
        "status": "closed",
        "correct_index": 1,
        "texts": [
          { "language_code": "ja", "question_text": "問題文", "choices": ["A","B","C"] }
        ],
        "answer_count": 42
      }
    ]
  }
}
```

#### GET /api/v1/external/interactive/questions/:questionId/results
**Response**:
```json
{
  "data": {
    "questionId": "uuid",
    "type": "quiz",
    "correctIndex": 1,
    "status": "closed",
    "texts": [{ "lang": "ja", "question": "...", "choices": ["A","B","C"] }],
    "results": {
      "total": 42,
      "choices": [
        { "index": 0, "count": 12, "percent": 28.6 },
        { "index": 1, "count": 24, "percent": 57.1 },
        { "index": 2, "count":  6, "percent": 14.3 }
      ]
    }
  }
}
```

### エラーレスポンス
```json
{ "success": false, "error": { "code": "INVALID_API_KEY", "message": "API キーが無効です" } }
```
- `MISSING_API_KEY` (401) / `INVALID_API_KEY` (401) / `NOT_FOUND` (404)
