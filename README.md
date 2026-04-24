# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・Qシート・機材・インタラクティブ演出・技術資料・ライブ運用を**GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v1.2.5

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
