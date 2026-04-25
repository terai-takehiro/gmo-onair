# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・Qシート・機材・インタラクティブ演出・技術資料・ライブ運用を**GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v2.6.4 — Phase 2A 完了: useCrudPage / FilterBar / Pagination で 6 CRUD ページを共通化

---

## 目次

- [プロジェクト概要](#プロジェクト概要)
- [ブロックアプリ構成](#ブロックアプリ構成)
- [技術スタック](#技術スタック)
- [ディレクトリ構造](#ディレクトリ構造)
- [アーキテクチャ](#アーキテクチャ)
- [データモデルの核](#データモデルの核)
- [開発環境セットアップ](#開発環境セットアップ)
- [ビルドとデプロイ](#ビルドとデプロイ)
- [ブランチ運用](#ブランチ運用)
- [主要なドキュメント](#主要なドキュメント)

---

## プロジェクト概要

GMO ONAiR は、単一の React/Express モノレポ上に**6つのブロックアプリ**を並走させ、制作業務の全ライフサイクル（提案 → 受注 → 制作 → 本番運用 → 請求）を1つの業務OSとして提供します。

- **案件管理（client）**: 売上・仕入・損益・ヨミ〜完了までの統合プロジェクト管理
- **Qシート（client-qsheet）**: 進行台本作成・ランダウン・OnAir 同期
- **機材管理（client-equipment）**: 機材台帳・貸出管理
- **インタラクティブ（client-interactive）**: EventStamp・リアルタイム演出
- **技術資料（client-techsheet）**: カメラ・映像・音声技術仕様書
- **ライブ運用（client-live）**: 本番オペ・進行管理

全アプリは **GLS番号**（例: `GLS-A001`）という統一識別子で紐づき、単一の PostgreSQL データベースを DB 名で本番/検証に分離して共有します。

---

## ブロックアプリ構成

| アプリ | ディレクトリ | 公開パス | dev ポート | 概要 |
|---|---|---|---|---|
| 案件管理 | `client/` | `/` | 5173 | 案件・売上・仕入・損益、ダッシュボード |
| Qシート | `client-qsheet/` | `/qsheet/` | 5174 | 進行台本・ランダウン・OnAir |
| 機材管理 | `client-equipment/` | `/equipment/` | 5175 | 機材台帳・貸出 |
| インタラクティブ | `client-interactive/` | `/interactive/` | 5176 | リアルタイムスタンプ演出 |
| 技術資料 | `client-techsheet/` | `/techsheet/` | 5177 | カメラ/映像/音声 技術仕様書 |
| ライブ運用 | `client-live/` | `/live/` | 5178 | 本番オペ・進行管理 |

全アプリは同一ドメインで配信され、nginx のパスベースルーティング + Express の静的配信で分岐します。認証とAPIは共通（`/api/v1/internal/*`）です。

---

## 技術スタック

### フロントエンド
- **React 19** + **Vite 8**
- **TypeScript**
- **TailwindCSS 4** + **shadcn/ui**
- **TanStack Query** (React Query) — サーバー状態管理
- **Zustand** — クライアント状態管理（UI ストア等）
- **React Router v6**
- **Socket.IO Client** — Qシート/Interactive でリアルタイム同期
- **Lucide React** — アイコン

### バックエンド
- **Node.js** + **Express** + **TypeScript**
- **PostgreSQL 16** (`pg` ドライバ)
- **Socket.IO** — `/qsheet` と `/interactive` 名前空間
- **Passport.js** / **JWT** — 認証
- **pdfkit** — Qシート PDF 生成

### インフラ
- **Docker** + **Docker Compose**
- **Nginx** — リバースプロキシ + SSL
- **Let's Encrypt** — SSL 証明書
- **CoNoHa VPS** (東京) — 本番/検証を単一 VPS 上で並走

### 開発運用
- **npm workspaces** — モノレポ
- **Dev Containers** — ローカル開発を隔離
- **Gitea/GitHub Webhook** — `main` ブランチへの push で本番自動デプロイ

---

## ディレクトリ構造

```
gmo-onair/
├── client/                  # 案件管理アプリ (React)
├── client-qsheet/           # Qシートアプリ
├── client-equipment/        # 機材管理アプリ
├── client-interactive/      # インタラクティブ演出アプリ
├── client-techsheet/        # 技術資料アプリ
├── client-live/             # ライブ運用アプリ
├── shared/                  # 全アプリ共通のファクトリ関数・ユーティリティ
│   └── src/client/
│       ├── createApi.ts           # axios ファクトリ
│       ├── createAuthHook.ts      # useAuth フック ファクトリ
│       ├── queryClient.ts         # React Query 共通設定
│       ├── uiStore.ts             # Zustand UI ストア
│       ├── SharedHeader.tsx       # 共通ヘッダー
│       └── AppSwitcher.tsx        # アプリ切替ドロップダウン
├── server/                  # Express + PostgreSQL API
│   └── src/
│       ├── contexts/              # DDD 風コンテキスト分割
│       │   ├── sales/             # 案件・売上・仕入
│       │   ├── finance/           # 予算・損益・販管費
│       │   ├── production/        # 制作進行
│       │   ├── equipment/         # 機材管理
│       │   ├── qsheet/            # Qシート
│       │   ├── techsheet/         # 技術資料
│       │   ├── interactive/       # インタラクティブ演出
│       │   ├── liveops/           # ライブ運用
│       │   ├── asset/             # 資産マスター
│       │   └── platform/          # 認証・共通
│       └── shared/
│           ├── db/migrations/     # 60+ SQL マイグレーション
│           └── services/          # 共通サービス（GLS発番・PDF生成等）
├── nginx/                   # Nginx 設定
├── deploy/                  # VPS デプロイスクリプト
├── scripts/                 # ユーティリティ（deploy-webhook.js 等）
├── docs/                    # 設計ドキュメント
├── docker-compose.yml       # 本番 + 検証の2環境構成
├── Dockerfile
├── CLAUDE.md                # プロジェクトメモリ（開発方針・ポリシー）
└── package.json             # ワークスペース定義
```

---

## アーキテクチャ

### デプロイ構成（CoNoHa VPS）

```
┌──────────────────────── CoNoHa VPS ────────────────────────┐
│                                                             │
│  Nginx (443/80) ─ SSL 終端・パスベースルーティング           │
│     │                                                       │
│     ├─ / ─────────────► app_prod (3000) ──┐                │
│     │    /qsheet/                          │                │
│     │    /equipment/                       │                │
│     │    /interactive/ ← WebSocket         │                │
│     │    /techsheet/                       │                │
│     │    /live/                            │                │
│     │    /api/v1/internal/*                │                │
│     │    /socket.io/                       │                │
│     │                                      │                │
│     └─ dev.gmo-onair.jp ──► app_dev (3001) │                │
│                                            ▼                │
│                         ┌─────── PostgreSQL 16 ───────┐    │
│                         │  onair_prod    onair_dev    │    │
│                         └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### リアルタイム通信

- **`/qsheet` ネームスペース**: OnAir ↔ ランダウン画面の同期（cue:update, sync, next, prev, jump, play, pause, reset）
- **`/interactive` ネームスペース**: EventStamp の連打を 200ms 集約してブロードキャスト（OBS/NDI 透過出力用）

### 認証

環境変数 `GOOGLE_CLIENT_ID` の有無で自動切替：
- **未設定**: mockAuth（ユーザーカード選択式、検証環境用）
- **設定済**: Google OAuth 2.0 + Passport.js（招待制）

本番環境では加えて Email/Password + SMS 2FA（Twilio）も利用可能。
JWT は HTTP-only Cookie + Authorization Bearer の二重送信方式。

### サブアプリ間の状態共有

各アプリはそれぞれ独自の `storageKey` で JWT を管理：
`qs_user`（qsheet）, `ts_user`（techsheet）, `is_user`（interactive）, `eq_user`（equipment）。
共通ファクトリ (`shared/src/client/`) を各アプリのラッパーファイルで包んでインスタンス化します。

---

## データモデルの核

### GLS番号による統一キー

全アプリは **GLS番号**（例: `GLS-A001`、`GLS-B003`）を中核に紐づきます：
- **A系**: 制作系（`offline_event`, `hybrid_event`, `live_broadcast`, `recording`）
- **B系**: その他売上

採番は `sequences` テーブルで管理され、`server/src/shared/services/sequence.service.ts` の `generateGlsNumber()` が発行。

### 統合プロジェクトライフサイクル

旧来の `opportunities`（ヨミ）+ `projects`（受注後）の2テーブル分離を**単一 `projects` テーブルに統合**：

```
stage フィールド:
  neta → d_hold → c_proposal → b_verbal → a_won → s_completed
                                                 └→ e_lost

gls_number IS NULL = ヨミ段階
gls_number IS NOT NULL = GLS発番済み（ヨミ以降のステージ）
```

GLS発番は `POST /projects/:id/issue-gls` エンドポイントで別途トリガー。

### エピソードと按分グループ

- **`episodes`**: 1プロジェクトに複数のエピソード（例: `GLS-A002-001`）
- **`project_groups`**: 費用按分グループ（売上・仕入の按分配分に使用）
- **タグベースの分類**: プロジェクトには自由なタグを付与可能

### Qシート / インタラクティブ / 技術資料

- **`qsheet_documents`**: JSONB で進行台本全体を保存（sections / rows / blocks 構造）
- **`interactive_*`**: スタンプ定義・チャンネル・統計
- **`techsheet_documents`**: カメラ/映像/音声/通信のタブ式技術仕様

詳細は `server/src/shared/db/migrations/` の 60+ のマイグレーションを参照。

---

## 開発環境セットアップ

### 前提条件

- Node.js 20+
- Docker + Docker Compose（DB 起動用）
- または Dev Containers 対応 IDE（VSCode 推奨）

### ローカル開発（Dev Containers）

`.devcontainer/` で隔離環境を提供。
コンテナ内で以下が完結：

```bash
npm install
npm run dev    # 全アプリ並列起動（concurrently）
```

各アプリが個別ポートで立ち上がります（ポート 5173〜5178）。

### 個別アプリのみ起動

```bash
npm run dev:client       # 案件管理
npm run dev:qsheet       # Qシート
npm run dev:interactive  # インタラクティブ
npm run dev:server       # Express API
```

### 環境変数

`.env.example` をコピーして使用：

```bash
cp .env.example .env
```

重要な変数：
- `DATABASE_URL` — PostgreSQL 接続文字列
- `JWT_SECRET` — 本番では `openssl rand -hex 32` で生成
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — 本番の OAuth 用
- `TWILIO_*` — SMS 2FA（本番のみ）

### DB 初期化

```bash
npm run db:migrate   # マイグレーション実行
npm run db:seed      # シードデータ投入（検証環境のみ）
npm run db:reset     # 全リセット + re-seed
```

---

## ビルドとデプロイ

### ビルド

```bash
npm run build    # shared → 全クライアント → server の順に TypeScript ビルド
```

各クライアントは Vite で静的ファイルを生成し、Express が静的配信します。

### 本番デプロイ

**トリガー**: `main` ブランチへの push
**フロー**:
1. GitHub Webhook が `scripts/deploy-webhook.js` (VPS 上、ポート 9000) に通知
2. VPS が `git pull origin main && docker compose up -d --build` を実行
3. `app_prod` コンテナが再ビルド・再起動される

**デプロイ時間**: 約2〜3分

### 検証デプロイ

**トリガー**: `dev` ブランチへの push
検証環境 (`dev.gmo-onair.jp` / `app_dev`) に自動反映されます。

### 緊急ロールバック

```bash
# VPS 上で
git checkout <旧コミット>
docker compose up -d --build
```

---

## ブランチ運用

- **`main`** — 本番デプロイの起点（push で webhook 発火）
- **`master`** — `main` のミラーブランチ（`master ← main` の PR で定期同期）
- **`dev`** — 検証環境の起点
- **`feature/*`, `claude/*`** — 機能ブランチ（main または dev から派生）

### リリースフロー

```
feature/xxx → dev → (検証環境で動作確認) → main → (本番自動デプロイ)
                                              ↓
                                            master (ミラー同期)
```

### バージョン管理

- パッチバージョンのみインクリメント（例: v1.1.100 → v1.1.101）
- `CLAUDE.md` + 全ワークスペースの `package.json` を同期更新
- コミットメッセージに `vX.X.X` を明記

---

## 主要なドキュメント

| ファイル | 内容 |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | プロジェクトメモリ（開発方針・環境分離ポリシー・セキュリティポリシー） |
| [`docs/DEPLOY_CONOHA.md`](./docs/DEPLOY_CONOHA.md) | CoNoHa VPS への初回デプロイ手順 |
| [`docs/architecture/v1.0-domain-design.md`](./docs/architecture/v1.0-domain-design.md) | ドメイン設計（案件・エピソード・売上・仕入のモデル） |
| [`docs/architecture/v1.0-data-model.md`](./docs/architecture/v1.0-data-model.md) | データモデル詳細 |
| [`docs/architecture/v1.0-roadmap.md`](./docs/architecture/v1.0-roadmap.md) | 開発ロードマップ |
| [`docs/architecture/improvement-proposal.md`](./docs/architecture/improvement-proposal.md) | 改善提案 |

---

## セキュリティポリシー

- `.env` やクレデンシャルは**絶対に Git にコミットしない**（`.gitignore` 済み）
- APIキー・JWT シークレットをソースにハードコードしない
- 本番DBと検証DBは**完全分離**（相互参照禁止）
- 本番DBへの直接 SQL 操作は**最小限**（管理者リセット等の緊急時のみ）
- コンテナ内のホスト認証情報は一切持ち込まない

詳細は [`CLAUDE.md`](./CLAUDE.md) の「セキュリティポリシー」「環境分離ポリシー」セクションを参照。

---

## 開発上の重要な慣例

### モバイルファースト

全ての画面は **375px幅（iPhone SE相当）で破綻しない**前提で実装。
- Tailwind の `sm:` `md:` `lg:` を適切に使用
- タップ領域は最低 44px（iOS HIG 基準）
- テーブルは `overflow-x-auto` で囲む
- モーダルは `max-h-[90vh] overflow-y-auto`

### DDD 風コンテキスト分割（server）

`server/src/contexts/{context}/{routes,services,repositories}` で業務ドメインを分割。
コンテキストを跨ぐ依存は避け、共通ロジックは `server/src/shared/services/` に集約。

### 共通ライブラリの活用

新しいクライアントアプリを追加する際は `shared/src/client/` のファクトリ関数を使用し、
重複実装を避けること。共通ヘッダー・認証フック・API クライアントは既に集約済み。

---

## バージョン履歴（抜粋）

| バージョン | 内容 |
|---|---|
| **v2.6.4** | **Phase 2A 完了: 6 CRUD ページを useCrudPage / FilterBar / Pagination に移行**。v2.6.0 で導入した shared プリミティブをパイロットの VendorListPage 以外にも展開: `PartnerListPage` (パートナーマスター) / `CustomerListPage` (顧客マスター) / `SgaListPage` (販管費一覧, source タブ + 列リサイズは保持) / `PurchaseListPage` (仕入一覧, project_id URL フィルタを extraParams で吸収) / `CompanyListPage` (取引先マスター, role タブを FilterBar に統合 + pageSize=30) を `useCrudPage<T>` ベースに書き換え。`RevenueListPage` は「同一案件の primary revenue を検出して自動で update モードに切替」という独自フローのため `FilterBar` + `Pagination` + `EmptyState` のみ採用しダイアログは従来構造を維持。`UserListPage` は pagination/search が無く invite URL を別ダイアログで表示する特殊フローのため対象外。各ページで page/search/dialogOpen/editingId/saveMutation/deleteMutation/openAdd/openEdit/closeDialog の重複ロジックが削除され、検索/ページネーション/空状態の見た目が全アプリで統一。全 6 client workspace で `tsc -b --force` 通過、`vite build` 成功 |
| **v2.6.3** | v2.6.0 〜 v2.6.2 で続いていた dev 502 Bad Gateway の **真因を特定・解決**。v2.6.2 の診断ログから以下が判明: ① コンテナ 4 つ (db / app_dev / nginx / app_prod) は全て `gmo-onair_default` ネットワーク (172.18.0.0/16) に居て疎通可能、② nginx の Docker 内部 DNS で `app_dev` も正しく `172.18.0.4` に解決される、③ しかし app_dev コンテナ内部からも `localhost:3000` に Connection refused = **app_dev が listen していない**、④ app_dev のログを見ると `Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` で起動失敗、⑤ deploy ログ最上部に `warning msg="The DB_PASSWORD variable is not set. Defaulting to a blank string."` が出ていた。**真因**: v2.5.4 の `cd /root/gmo-onair-dev` + `-f /root/gmo-onair-dev/docker-compose.yml` だと docker compose が `pwd` (= dev worktree) の `.env` を探すが、dev worktree には `.env` 無し (`.gitignore` 管理外)。secrets は main worktree の `/root/gmo-onair/.env` にだけ存在するため `${DB_PASSWORD}` / `${JWT_SECRET}` が blank に展開され、app_dev が PostgreSQL に空パスワードで接続 → SASL 認証エラー → 起動失敗 → port 3000 listen せず → nginx 502。**修正**: `COMPOSE_DEV` に `--env-file /root/gmo-onair/.env` を明示追加 |
| **v2.6.2** | v2.6.1 で追加した診断ステップに **bash 構文エラー** が含まれており `bash: line 38: syntax error near unexpected token '('` で abort していた。原因は `<<'ENDSSH'` (single-quoted heredoc) 内で `\$(...)` と書いたこと: 単一引用 heredoc は変数展開を抑止するので、リモート bash は `\$` を escape として解釈して literal `$` に変換、その後の `(` が subshell 開始と解釈されて構文エラーになる。`$(...)` (`\` 無し) に統一。ついでに診断項目を拡充: ① `docker network inspect` の format 改善、② nginx コンテナ内から `getent hosts app_dev` で DNS 解決テスト、③ app_dev コンテナ内から localhost:3000/health 直叩き、④ nginx コンテナ内から app_dev:3000/health 接続テスト、⑤ external https health check。これで「app_dev は Up だが 502」状態の真因(DNS / 内部リスニング / network 所属) を切り分けられる |
| **v2.6.1** | v2.6.0 デプロイ後に dev で 502 Bad Gateway が発生した原因を特定するため、`.github/workflows/deploy.yml` の dev ジョブに診断ステップを追加: 起動 15s 後に `docker compose ps` / `docker logs gmo-onair-app_dev-* (last 80)` / `docker logs gmo-onair-nginx-* (last 30)` / `docker network inspect gmo-onair_default` を出力。これで GitHub Actions のログだけで「app_dev が起動失敗 / migration エラー / network 切断 / nginx config 不正」のいずれが原因かが分かるように |
| **v2.6.0** | **Phase 2A: CRUD ページ共通化の基盤導入 + VendorListPage パイロット**。Phase 2 ロードマップの第一段階として、8+ ページで重複していた「検索 + ページネーション + Create/Update Dialog + Delete」のテンプレを 3 つの shared プリミティブに集約: ① **`shared/src/client/hooks/useCrudPage.ts`** — `createUseCrudPage(api)` factory で各アプリの api インスタンスにバインド。`{ search, page, items, pagination, dialogOpen, editingItem, save, remove, openAdd, openEdit, closeDialog }` を返す統一フック。pagination response envelope (`{ data, pagination }`) を前提。② **`shared/src/client/ui/filter-bar.tsx`** — `FilterBar` (タブ + 検索 + 任意アクション) を統一。`stacked` / `inline` レイアウト切替対応。③ **`shared/src/client/ui/pagination.tsx`** — `Pagination` (前へ/次へ + 件数・ページ表示)。totalPages ≤ 1 で自動非表示。④ **パイロット**: `client/src/contexts/finance/pages/VendorListPage.tsx` (213 → 219 行) を新プリミティブに移行。state/mutation の boilerplate が大幅削減 (page/search/dialogOpen/editingId/saveMutation/deleteMutation/openAdd/openEdit/closeDialog の重複ロジックが全て `useCrudPage` 内に移動)。次の v2.6.x で残り 7+ ページ (PurchaseListPage / PartnerListPage / SgaListPage / RevenueListPage / CustomerListPage / CompanyListPage / UserListPage) に展開予定 |
| **v2.5.4** | **deploy ワークフローを構造的に再設計** (前回 PR `deploy: build app_dev after copying dev docker-compose and nginx config` の inline comments 反映)。旧設計の問題点: ① `cp /root/gmo-onair-dev/{nginx,docker-compose.yml}` で main worktree (`/root/gmo-onair`) を上書きしていた; ② `cd /root/gmo-onair && git reset --hard origin/main` を dev デプロイ内で実行 (dev デプロイなのに main 側を巻き込む); ③ 「次回 prod デプロイで `git reset --hard` が dev 側変更を消すはず」という暗黙リセット依存; ④ 副作用境界が曖昧 (dev デプロイが main worktree を巻き込み、prod デプロイが将来的に dev 設定を上書きする可能性)。**新設計**: dev デプロイは `docker compose -p gmo-onair -f /root/gmo-onair-dev/docker-compose.yml` で **dev worktree から直接** dev の compose を読む (cp 不要 / main worktree に一切触らない)。prod デプロイは `docker compose -p gmo-onair -f /root/gmo-onair/docker-compose.yml` で main worktree のみ参照し、**nginx は再起動しない** (nginx は dev デプロイの責務に統一)。`-p gmo-onair` で project 名共有により app_prod / app_dev / nginx / db のネットワーク・ボリューム・DB は同居。`--no-deps + --force-recreate` でデプロイ対象外サービスへの影響を最小化。`set -euo pipefail` 化 + 各ステップに「Why」コメント明示。Phase 2A 着手は v2.6.0 で予定 |
| **v2.5.3** | GitHub のブランチを `main` (本番) と `dev` (検証) の 2 本だけに簡素化。これまで `master` (CLAUDE.md でミラーとされていたが運用されていなかった) / `eventstamp-reference` / `qsheet-reference` (旧アプリのソース、dev に merge 済み) / 過去セッションの `claude/*` 16 本 (12 マージ済み + 4 古い WIP) が累積していたのを全廃止。CLAUDE.md のブランチ運用節を「main + dev の 2 本のみ」と簡潔化。実際のリモート削除と GitHub default branch の `master` → `main` 切替えはユーザーが GitHub UI / git CLI 側で実施 (sandbox 環境からは git proxy が `--delete` を 403 拒否するため不可能だった) |
| **v2.5.2** | v2.5.1 でも「サブアプリ単位でユーザー選択(モック)が出続ける」「インタラクティブ・計時LIVE のダッシュボードに辿り着けない」と報告。原因は 3 重: ① deploy workflow の `cp docker-compose.yml` が `app_dev` 再起動の **後** だったため `AUTH_MODE=password` が app_dev に反映されず `/auth/mode` が 'mock' を返していた。② 5 サブアプリの LoginPage に mock UI のカード描画ロジックが dead code として残置。③ `liveops/socket.ts` のコメントが mock 前提のミスリード。**修正**: ① workflow 順序: `cp` を `docker compose build app_dev` の **前** に移動。② 5 サブアプリ (live/interactive/qsheet/equipment/techsheet) の `LoginPage.tsx` を `shared/SubAppLoginRedirect.tsx` を呼ぶだけの redirect-only コンポーネントに書き換え (既ログイン → `/<app>/` ; 未ログイン → `/login?redirect=/<app>/`)。これで mock UI / OAuth UI / `/auth/users` 取得 / `/auth/mock-login` などが完全に消滅。③ `liveops/socket.ts` のコメントを修正 (dev も `password` 認証に統一されたため) |
| **v2.5.1** | v2.5.0 で dev nginx の `auth_basic` 撤去を入れたが Basic 認証が出続けた件を修正。原因は `.github/workflows/deploy.yml` の dev デプロイ手順が `cd /root/gmo-onair-dev → reset to dev` の後に `cd /root/gmo-onair → reset to main` してから `docker compose ... nginx` を走らせており、相対パスのボリュームマウント `./nginx/gmo-onair.conf` が **main branch の nginx config** を読んでいたため、dev branch の nginx 変更が永遠に反映されない構造だった。**修正**: nginx restart 直前に `cp /root/gmo-onair-dev/nginx/gmo-onair.conf /root/gmo-onair/nginx/gmo-onair.conf` と `cp .../docker-compose.yml ...` を追加。次回 prod デプロイ時の `git reset --hard origin/main` で自動的に main 側に戻る。これで v2.5.0 の Basic 認証撤去 + AUTH_MODE=password が初めて反映される |
| **v2.5.0** | **dev で Basic 認証を廃止し、本番同様の email/password 認証に統一**。`server/src/config.ts` に `AUTH_MODE` 環境変数オーバーライドを追加 (NODE_ENV ベースのデフォルトを上書き可能)。`docker-compose.yml` の `app_dev` に `AUTH_MODE: password` を設定し、nginx の dev サーバーブロックから `auth_basic` ディレクティブと htpasswd マウントを撤去。`server/src/shared/db/seed.ts` で dev seed ユーザー (admin + staff1〜5) に password_hash + status='active' を付与 (パスワード "dev1234"、電話番号無しで 2FA をスキップ)。既存 dev DB 向けに `migration 067_dev_passwords.sql` を追加し、password_hash NULL の seed ユーザーをワンショット backfill。dev は `https://dev.gmo-onair.jp/login` から本番と同じメール/パスワード画面でログイン可能に。検索エンジン除けは X-Robots-Tag + robots.txt + noindex meta で継続 |
| **v2.4.2** | **replaceState 暴走の真の根本原因を解決**。ユーザーがブラウザで再現調査を行い (Chromium で /live ログイン画面 → 「システム管理者」をクリック → タブが反応しなくなり 503 連発)、historyDiagnostic の発火パターンとネットワークログ (/auth/me 401, /users/me/permissions 401, /auth/mode 200, /auth/users 200) から「保護ルートのガード ↔ /login の auto-redirect が同一 tick で逆向きに replace し合うリダイレクトループ」が確定。**真の原因①**: `client-live` / `client-interactive` の LoginPage の `handleLogin` が `login()` を **await せずに** `hardReplace` するため、in-flight の `/auth/mock-login` が abort されて cookie が立たない → 新ページで /auth/me 401 → ループ。**真の原因②**: `createAuthHook` が `loading` の初期値を `(localStorage に user があるなら) false` にしていたため、stale な localStorage の user で「ログイン済み」と即断し、LoginPage の `useEffect (user truthy)` が即 `/` に hardReplace → /auth/me 401 → /login に戻る…が高速ループしていた。**修正**: ① `loading` 初期値を常に `true` にし、`/auth/me` が確定するまで保留 (createAuthHook); ② `LoginPage` の auto-redirect は `loading=false` 完了まで待機 (live/interactive); ③ `handleLogin` を `async` 化して `login()` を `await` (live/interactive); ④ 全 6 アプリの LoginPage の `navigate(..., { replace: true })` を `window.location.replace()` に統一 (replaceState を一切経由しない) |
| **v2.4.1** | v2.3.1 (`<Navigate replace />` → `<RedirectOnce />`) でも dev で再現していた `SecurityError: history.replaceState() more than 100 times per 10 seconds` の**根本対処**: ① `shared/src/client/historyDiagnostic.ts` を新設し全6アプリの `main.tsx` 最上部で `installHistoryDiagnostic()` を実行 — `history.replaceState` を monkey-patch し、10秒で30回呼ばれたら警告+スタックトレースをコンソールに出力、80回でハード上限阻止 (ブラウザ SecurityError を未然に防ぐ); ② `RedirectOnce` を強化 — モジュールレベル WeakMap で「同一 URL への 500ms 以内の連発」を抑制 + 200ms 経っても URL が変わらない場合 `window.location.replace` にフォールバック; ③ 計時LIVE / インタラクティブの LoginPage の post-login ナビゲーションを全て `window.location.replace()` (hard navigation) に切替 — react-router の navigate(replace) を回避 |
| **v2.4.0** | **Phase 1 共通化リファクタ**: 統一化ロードマップの第一段階。3 本の監査結果 (ページIA / コード / DBスキーマ) を踏まえ、以下を一括実装。**1.1 ステータス定義の一元化** — `shared/src/constants/statuses.ts` を新設し、PROJECT_STAGE / MAINTENANCE_STATUS / MAINTENANCE_TYPE / EQUIPMENT_STATUS / EQUIPMENT_CONDITION / INVENTORY_STATUS / INTERACTIVE_EVENT_STATUS / TECHSHEET_STATUS / ALERT_TYPE を集約。各ページ (10+) の独立定義を削除し `statusOf(domain, key)` ヘルパーで参照。**1.2 format ユーティリティを shared 化** — `shared/src/client/format.ts` 新設、`client/src/lib/format.ts` は re-export 層に。**1.3 client api → createApi 移行** — メインアプリも他5アプリと同じ createApi に。**1.4 DataTable を shared 化** — `shared/src/client/ui/data-table.tsx` に移動、Phase 2 の `useCrudPage` 基盤に。**1.5 DashboardHeader を全6ダッシュボード統一** — qsheet/interactive/techsheet で lastUpdated を追加。**1.6 EmptyState 採用の徹底** — finance/sales/admin の8ページの「データがありません」プレーンテキストを `<EmptyState />` に。**1.7 React Query キー一元管理** — `shared/src/client/hooks/queryKeys.ts` を新設、dashboard/projects 系の主要キーを置換 |
| **v2.3.1** | 計時LIVE・インタラクティブで再発していた `SecurityError: history.replaceState() more than 100 times per 10 seconds` の**根本原因を特定・解決**。react-router v6 の `<Navigate replace />` は内部 useEffect の依存配列に `navigate` を含み、`useNavigate()` が返す関数参照は `locationPathname` 等を依存に持つため、replaceState で URL が変わる → `navigate` 参照更新 → useEffect 再発火 → replaceState…の無限ループになっていた。v2.1.2 の LoginPage 側の useEffect 修正だけでは不十分で、`<Navigate>` コンポーネント自体も同じ問題を抱えていた。`useRef` ガード付き `shared/src/client/RedirectOnce.tsx` を新設し、全6アプリの App ルーター (ProtectedRoute 未認証リダイレクト・ログイン済み時の / リダイレクト・wildcard) の `<Navigate replace />` を置換 |
| **v2.3.0** | **HomePage を IA レベルで再設計**。デジタル庁ダッシュボードガイドブックの 4 原則に沿い、トップページを「アプリランチャー中心」から「今日対応すべきこと→主要指標(前月比付き)→スケジュール→アプリ起動」という情報階層に変更。KpiCard に前月比トレンドを `monthly-chart` API から計算して付与、各 KPI からドリルダウンリンク、最終更新表示、全項目に aria-label / role を付与 |
| **v2.2.1** | dev デプロイの Docker ビルドが `--no-cache` 無しのためソース変更が反映されないケースがあった (本番側は v1.x で `--no-cache` 化済み)。dev も `--no-cache` を追加し、毎回フルビルドするように。これにより v2.1.2 (replaceState ループ修正) と v2.2.0 (SSO) がようやく dev に正しく反映される |
| **v2.2.0** | **全アプリ SSO 化**: 5 つのサブアプリ (Qシート/機材/インタラクティブ/技術資料/計時LIVE) が個別の localStorage キー (`qs_user`, `eq_user`, `is_user`, `ts_user`, `lv_user`) を保持していたため、メインアプリでログインしてもサブアプリで再ログインを要求されていた。全アプリの `storageKey` を `gmo_onair_user` に統一し、JWT (`gmo_onair_token`) と合わせてシングルサインオン化。`createAuthHook` に `legacyStorageKeys` オプションを追加し、初回起動時に旧キーから新キーへワンショット移行。**dev Basic 認証**: `dev.gmo-onair.jp` の `/api/` と `/socket.io/` から `auth_basic off` を設定し、XHR/WebSocket 経由の Basic 認証ダイアログ暴発を抑止 (JWT で保護されているため安全)。HTML/静的アセットの Basic 認証は維持 |
| **v2.1.2** | 計時LIVE / インタラクティブの LoginPage、AuthCallback、TimerDisplay で `useEffect` が `useSearchParams()` の不安定な参照に依存しており、`navigate(..., { replace: true })` が高頻度で呼ばれて Firefox/Safari の `SecurityError: history.replaceState() more than 100 times per 10 seconds` を発生させていた。`useRef` ガード + 文字列値ベースの依存配列に変更し、各効果が一度だけ走るように |
| **v2.1.1** | v2.1.0 のビルド不具合修正: `SectionCard` / `EmptyState` の `title` が `HTMLAttributes.title` (string) と衝突する TypeScript エラーを `Omit<..., "title">` で解消し、Docker build (`tsc -b && vite build`) が通るように |
| **v2.1.0** | **全アプリダッシュボードをデジタル庁ダッシュボードガイドブック準拠に刷新**。ガイドブックの 4 原則 (目的に則する / 違いに気づける / 分解できる / 鮮度が高い) に沿い、共通パターンライブラリ `shared/src/client/dashboard/` を新設 (DashboardHeader / KpiCard / SectionCard / EmptyState / chartColors)。9 ダッシュボード (案件管理 Platform/Budget/SalesReview、Qシート、機材、インタラクティブ、TechSheet、ライブ Session/Dashboard) を再構成し、情報階層 (全体→部分)・コントラスト比 3:1 以上・WCAG 2.2 AA focus ring・aria-role を徹底 |
| **v2.0.0** | **デジタル庁デザインシステム (DADS v2.13) ベースへ全面リニューアル**。`@digital-go-jp/design-tokens` + `@digital-go-jp/tailwind-theme-plugin` (MIT) を導入。`shared/src/client/tokens.css` に DADS プリミティブ + GMO Blue (#005bac) セマンティック層を統合。UI プリミティブ 12 種 (Button/Input/Label/Card/Badge/Dialog/Select/Checkbox/Switch/Tabs/Textarea/Separator) を `shared/src/client/ui/` に集約し 6 アプリを再エクスポート化。WCAG 2.2 AA 準拠のフォーカスリング・44px タップ領域・セマンティックトークンで統一。client-qsheet の primary 上書き (#2563eb) を撤廃。ファビコン / GMO ONAiR ロゴは継続利用 |
| v1.2.13 | 連携強化フェーズ3（予算管理拡充パック）: 売上に `invoice_issued` BOOLEAN カラム追加（migration 066）— ダイアログから請求書発行済チェック可能・月別詳細で✓バッジ表示／案件月別詳細のサマリーをテーブル上部に移動し「営業利益」を追加（案件絞込時は販管費が案件別按分なしのため営業利益＝粗利と注記、全体表示時は営業利益＝粗利−販管費）／仕入・販管費の月別詳細に申請 ID 列を追加（X-xxxxx / 楽-xxxxx 形式）／販管費テーブルを案件絞込時も表示（全社注記付き） |
| v1.2.12 | 連携強化フェーズ2（連携強化パック）: 共通 `ProjectQuickLinks` 追加で案件詳細／売上／仕入／カレンダーを同一案件で直接行き来可能に。仕入一覧・カレンダーに `?project_id=` フィルタ対応（サーバ `/studios/bookings` も対応）／案件詳細のスタジオスケジュールを `studio_bookings` 単一ソースに統一（編集時は一覧表示＋StudioBookingDialog で CRUD、重複予約の根絶）／販管費・売上の行クリックで編集ダイアログを起動する UX を統一 |
| v1.2.11 | Qシート 6件の機能追加/バグ修正: ①LED/XR・照明列追加 ②エントリ単位の削除 ③ゴミ箱UI（ロール/行/エントリ復元） ④フキダシ初回1文字入力消失を修正（IME対応） ⑤VTR挿入 ⑥エントリ単位の画像添付 |
| v1.2.10 | 連携強化フェーズ1（バグ修正パック）: スタジオ予約タイトルを「案件名 (YY/MM/DD)」に統一／案件検索にクライアント側フィルタ併用＋keepPreviousDataでちらつき抑制／カレンダー連携コピーボタンを flex-wrap でモバイル枠外防止／料金表Pickerを連続選択モードに改修／仕入に編集・削除UI／売上ダイアログに削除ボタン |
| v1.2.9 | 売上明細ダイアログに「料金表から追加」ボタンを追加し、明細行を料金表マスター項目に直接紐付け可能に（案件の `customer_type` に応じて定価／グループ内価格を自動適用） |
| v1.2.8 | 機材一覧カスタム列: ローカル state を真実の源に切替（React Query キャッシュに依存しない単純化）＋ 保存失敗を画面上部の残留バナーで通知＋ サーバーPUTにPostgres詳細エラー出力 |
| v1.2.7 | 料金表マスターに GMO グローバルスタジオ公式の料金体系を一括投入（8 カテゴリ／70＋ 項目）。定価＋グループ内の二段価格、数量課金用 `qty` 計算タイプを追加 |
| v1.2.6 | 機材一覧カスタム列セル: onSettled invalidate による refetch 中ちらつきを解消（onSuccess で直接キャッシュ更新、失敗時はアラート表示） |
| v1.2.5 | 機材一覧カスタム列セルの即時反映をローカル state ベースに刷新（チェックボックス／テキスト両方が再現性良く反応するように修正） |
| v1.2.4 | 検索エンジンインデックス拒否を強化（nginx `X-Robots-Tag` ヘッダー・`/robots.txt` を追加） |
| v1.2.3 | 機材一覧カスタム列（チェックボックス型）セルの反応なし問題を修正（楽観的更新を追加）＋計時LIVE アプリにファビコン追加 |
| v1.2.2 | 機材一覧カスタム列チェックボックスの不具合修正（非表示にした列がリロード時に再表示される問題） |
| v1.2.1 | README 更新ルールを CLAUDE.md に明文化（バージョン更新時に README の現在バージョン＋履歴を同期更新） |
| v1.2.0 | 売上新規追加の話数任意化・登録ボタン活性化修正、計上月/請求日/入金日の自動入力、カレンダー案件検索のサーバーサイド化、予約種別の全表示、予算月別詳細の月のみ選択対応＋販管費表示 |
| v1.1.101 | Qシート尺入力未入力時のアンバー警告表示 |
| v1.1.100 | Qシート13件バグ修正（時刻計算・印刷・ダウンロード・UX等） |
| v1.1.98〜99 | 予算ダッシュボード強化、販管費取引先フィルタ、JP祝日2027年対応 |
| v1.1.96〜97 | GMO ONAiR ロゴ画像化、予算管理バグ修正 |
| v1.1.93〜95 | ファビコン刷新、スタジオカレンダー改善、iOS safe area 対応 |
| v0.7.x | Qシートサブアプリ統合 |
| v0.8.x | EventStamp サブアプリ統合 |
| v0.6.x | Qsheet + EventStamp 並走構成確立 |
| v0.5.x | PostgreSQL 移行、Docker 化、CoNoHa VPS デプロイ |

---

## ライセンス

本プロジェクトは GMOグローバルスタジオ社内で利用するクローズドソースです。
