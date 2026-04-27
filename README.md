# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・Qシート・機材・インタラクティブ演出・技術資料・ライブ運用を**GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v2.7.16 — 確定案件 (スタジオ/ビジネス) もモダンカード式 UI に統一 (Pattern A)

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
| **v2.7.16** | **確定案件 (スタジオ/ビジネス) もモダンカード式 UI に統一 (Pattern A)**。`ConfirmedProjectsPage` (`/projects/studio` / `/projects/business`) は v2.7.15 と同じ二重実装でカラム潰れを起こしていた。これを `ConfirmedProjectCard` に統一: GLS 番号 (font-mono primary) + ステージ Badge / 金額 (右寄せ大、想定→実績の自動切替) / 案件名 (h3、`[word-break:keep-all]`) / 顧客 (Building2)・担当者 (User)・イベント日 (Calendar、isStudio=true 時のみ)・案件種類 (Tag) を lucide アイコン付きで横並び。`xl:grid-cols-2` で広い画面 2 カラム。`isStudio` (GLS-A) / `!isStudio` (GLS-B) でイベント日の表示有無を分岐。空状態を DADS の `<EmptyState>` に置換 |
| **v2.7.15** | **案件管理一覧をモダンカード式 UI に全面刷新 (Pattern A)**。従来の `ProjectListPage` は `lg:hidden` (mobile=card) / `hidden lg:block` (desktop=table) の二重実装で、デスクトップ側は 11 列を強引に詰めていたためカラム潰れで案件名・顧客名が 1 文字ずつ縦積みされる UX 破綻が発生。これを廃止し全画面幅で **統一カードデザイン** に移行。①カード構造: 上段 = `code` + ステージ Badge + 金額 (右寄せ大)、中段 = 案件名 + 終了日(略)、下段 = 顧客 / 担当者 / 日程 / 種類 を lucide アイコン (Building2/User/Calendar/Tag) 付きで横並び、最下段 = 売上/仕入/粗利 (粗利率% 込み、emerald-600/red-600 着色) + Box 2 リンク。②`xl:grid-cols-2` で広い画面 2 カラム表示、未満は 1 カラム。③カラムソート機能の代替として **ソート Select ドロップダウン** (作成日/イベント日/金額/案件名/顧客名 × 昇降順) を追加。デフォルト=作成日降順。④旧テーブルで使っていた `colWidths` state / リサイズハンドラ / `SortIcon` コンポーネント / 余分な ref など 100 行以上のコードを削除しシンプルに。⑤粗利は売上>0 のときのみ表示 (ヨミ段階の混乱を防ぐ)。Box は社内/外部の 2 種を別個リンク表示。⑥`role="button"` + `tabIndex={0}` + Enter/Space 対応でキーボード操作完備、`focus-visible:ring-2` でアクセシビリティ確保 |
| **v2.7.14** | **データビューワーのテーブル一覧をアプリ別グループ化 + 日本語名整備**。①既存の DataViewerPage はテーブルがフラットに並んでおり、案件管理 / Qシート / 機材管理など 6 つのアプリ + 共通テーブルが混在して 60+ 個のテーブルが見分けづらかった。`TABLE_GROUPS` 配列を新設し、案件管理 (Briefcase 🧳) / Qシート (FileSpreadsheet 📊) / 機材管理 (Wrench 🔧) / インタラクティブ (Sparkles ✨) / 技術資料 (Camera 📷) / ライブ運用 (Radio 📻) / 共通・マスター (Users 👥) の 7 グループに分類。各グループは label + icon + tables を持ち、サイドバーで `<icon>+<label>` のヘッダー → 該当テーブルのリスト、の二段構造でレンダリング。②`TABLE_LABELS` を全面拡充: 旧版は 18 テーブルしかカバーしておらず、機材 / インタラクティブ / Qシート / 技術資料 / ライブ運用テーブルは英名のみ表示されていた。今回 60+ テーブル全てに日本語名を付与 (例: `equipment_lendings` → 機材貸出、`interactive_stamps` → スタンプログ、`liveops_timers` → ライブタイマー)。③ボタンの中身を 2 行から「日本語名 + 行数 (右寄せ tabular-nums)」「テーブル名 (font-mono、サブテキスト)」の構造に変更し、選択時 / 通常時の色階層を明示。④グループ未定義のテーブル (新規マイグレーションで追加など) は最後の「その他」セクション (Folder 📁) に自動でフォールバック。`KNOWN_GROUPED_TABLES` Set で O(1) 判定。⑤サイドバー幅を `lg:w-56` → `lg:w-64` に拡大、モバイル時の高さ上限を `max-h-48` → `max-h-64` に拡大して 7 グループが見切れにくく |
| **v2.7.13** | **トグルボタンの CJK 文字 1 文字ずつ縦積み防止**。番組情報パネル (案件編集ページ) で番組種別/配信媒体トグルボタンの「生放送」「YouTube」「ネットメディア」「その他」が `生 / 放 / 送` のように 1 文字ずつ縦積みされていた件を修正。①**根本原因**: 外側 `sm:grid-cols-2` で半々に分割 + 内側 `cols={{ base:2, sm:3, lg:4 }}` の合わせ技で各ボタンが画面幅の ~12.5% しか確保できず、`break-words` が CJK 文字列を 1 文字ずつ折り返していた。②**shared コンポーネント**: `toggle-button-group.tsx` の label/description span に `[word-break:keep-all] [overflow-wrap:anywhere]` を追加。CJK ワードは原則として途中改行せず、それでも溢れるときのみ任意改行する挙動に。③**ProjectFormPage.tsx**: 番組情報パネルの outer 分割を `sm:grid-cols-2` → `lg:grid-cols-2` に変更 (中画面では縦積みのまま)。inner cols を実際の項目数に合わせ、番組種別 (2 項目) は `cols={{ base:2 }}`、配信媒体 (6 項目、最大 7 文字 "ネットメディア") は `cols={{ base:2, sm:3 }}` に縮小。GLS 発番ダイアログの同セクションも同様に修正 |
| **v2.7.12** | **DB バックアップ自動化 (PostgreSQL → BOX 社内限り)**。①**スクリプト本体** `server/scripts/backup-db-to-box.mjs` を新設。`spawn('pg_dump', ...)` で `DATABASE_URL` から接続情報を抽出 → `createGzip()` で in-memory 圧縮 → `/tmp/{db_name}_YYYYMMDD_HHMMSS.sql.gz` に書き出し → `box-node-sdk` でアップロード → 一時ファイル削除、までを 1 スクリプトで完結。②**フォルダ階層を自動確保**: `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL` (社内限り親) → `00_DB_Backup` → `prod` または `dev` (`NODE_ENV` で識別) を `findOrCreateFolder()` で冪等に作成。既存フォルダは ID を再利用。③**30 日ローテーション**: アップロード後に同フォルダ内の `created_at` を全件チェックし、30 日以上前のファイルを `client.files.delete()` で除去。④**Dockerfile 改修**: 本番ステージに `apk add --no-cache postgresql16-client` を追加 (pg_dump 同梱) + `COPY server/scripts server/scripts` を追加。`box-node-sdk` は既に server/package.json の dep なので無増設。⑤**VPS cron セットアップ**: `scripts/setup-backup-cron.sh` を新設。`docker ps` でコンテナ名を自動検出して `0 */3 * * * docker exec ... node /app/server/scripts/backup-db-to-box.mjs >> /var/log/gmo-onair-backup.log 2>&1` を crontab に追加。dev は `30 */3 * * *` (30 分ズラし) で同時実行を回避。冪等で既存エントリがあればスキップ。⑥**運用ドキュメント**: CLAUDE.md「環境分離ポリシー」直下に「DB バックアップ運用」セクションを追加。手動実行・ログ確認・必須 env を網羅。⑦**頻度・保持の選択根拠**: 3 時間ごと × 30 日 = 240 ファイル想定。dump サイズ 100-200MB 圧縮で約 25-50GB を BOX で確保 (エンタープライズ容量で十分)。RPO 3 時間以内、過去 30 日分から任意点復元可能。⑧**セキュリティ**: バックアップは「社内限り」親フォルダ配下のみに保存 (顧客に見えない)、サービスアカウントにフォルダコラボ追加が必要 (BOX 設定として既存と同様) |
| **v2.7.11** | **BOX フォルダ機密度別 2 親並行作成 + 案件フォーム URL 入力欄を表示専用に + カレンダー API バグ修正**。①**設計変更**: v2.7.10 では `customer_type` (社内/社外) で BOX 親フォルダを片方だけ選んでいたが、要件は「全案件で『社内限り (機密)』『社外共有可 (顧客と共有)』の 2 フォルダを **両方並行作成**」だったため全面再設計。`box-folder.service.ts` の `createProjectFolderTree(idCode, projectName)` から `customerType` 引数を撤廃し、両親フォルダに `Promise.all` で並行作成 → `{ internal, external }` ペアを返す形に変更。②**サブフォルダ配分**: 社内限り = `02_発注・契約` / `03_請求` / `07_原価・利益管理` (新設)、社外共有可 = `01_見積・提案` / `04_Qシート` / `05_台本・進行表` / `06_納品物`。機密情報と顧客共有可ファイルが混ざらないよう物理的に分離。③**ライフサイクル更新**: `project.service.ts` の `create()` / `update()` (案件名変更追従) / `issueGls()` (OPP→GLS リネーム) / `createBoxFolder()` (バックフィル) を全て両フォルダ並行処理に変更。新ヘルパー `renameProjectFolderPair(internalId, externalId, newName)` を追加。GLS 発番時は片方だけ存在する場合に未作成側を補填するフォールバック付き。④**UI 簡素化**: `ProjectFormPage.tsx` の Box URL 手入力 `<Input>` 2 つを完全撤去し、各 URL の有無を **表示専用カード**で見せる方式に変更。「BOX で開く」リンク or 「未作成」状態を表示、未作成時のみ「BOX フォルダ作成 / 未作成側を作成」ボタンを表示。`box_url_internal` / `box_url_external` は `<input type="hidden" {...register(...)}>` で送信時のフォーム値保持。`createBoxFolderMutation.onSuccess` のレスポンス形を `{ url }` → `{ urlInternal, urlExternal, already }` に変更。⑤**バグ修正**: `calendar.routes.ts:27` の `p.status` (存在しないカラム) を `p.stage` に修正。スタジオ予約カレンダー API 呼び出し時に `column p.status does not exist` で常時失敗していた既存バグを解消 |
| **v2.7.10** | **トグルボタン文字切れ修正 + BOX フォルダのライフサイクル連動**。①**文字切れ修正**: v2.7.6 で導入した `ToggleCard` (`shared/src/client/ui/toggle-button-group.tsx`) のラベルが `block truncate` で「生...」のように途中で切れていた件を修正。`truncate` を撤去し `whitespace-normal break-words leading-snug` に変更、`items-start` + `self-center` 調整で複数行ラップ時もアイコン位置がズレないように。`StudioBookingDialog.tsx:588` のスタジオ部屋名 span の `truncate` も同時撤去。②**BOX フォルダ作成のタイミングを GLS 発番時 → 案件作成時に前倒し**。新規案件作成時点で `{OPP-code}_{案件名}` のフォルダを自動生成。GLS 発番時は新規作成ではなくフォルダ ID を保持したまま **`{GLS-number}_{案件名}` にリネーム**。案件名を変更したときも BOX フォルダ名が **追従して即時リネーム** される。③**社内/社外で親フォルダ分離**。`customer_type === 'internal'` → `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL` (新規 env)、`'external'` → `BOX_PROJECT_PARENT_FOLDER_ID` (既存) に振り分け。④**手動「BOX フォルダを作成」ボタン**を `ProjectFormPage` の Box URL 欄横に配置 (`POST /projects/:id/create-box-folder`)。BOX 連携が後付け有効化された / 失敗ケース等で既存案件にフォルダを作るバックフィル用、`requirePermission('sales', 'manager')`、冪等で既に URL があれば `{ already: true }` を返す。⑤新規ヘルパー: `extractFolderId(url)` (`server/src/shared/services/box.ts`)、`renameProjectFolder(folderId, newName)` (`box-folder.service.ts`)、`buildProjectFolderName(project)` (`project.service.ts`)。⑥`box-node-sdk.d.ts` に `folders.update(id, { name })` の型を追加。⑦`docker-compose.yml` の app_prod / app_dev 双方に `BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL` を配線。`.env.example` に社内/社外 2 親フォルダの設定方法を追記 |
| **v2.7.9** | **スタジオ予約トップに「直近 7 日の予定」セクションを追加**。`StudioCalendarPage.tsx` のヘッダー＋部屋フィルタ直下、Legend と FullCalendar の上に新セクションを差し込み、今日起点の 7 日間で予定が入っている日だけを縦リスト表示 (空日はスキップ)。各行は `sm:flex-row` で日付ピル (今日 = primary 塗り / 明日 = primary tint / それ以降 = muted) を左、予約カードを右にレスポンシブ配置。375px 幅でも縦積みで破綻しない。各予約カードは `border-l-4` の予約タイプカラー帯 + タイプバッジ + 案件名 + 部屋略称チェイン (v2.7.5 で導入した `buildRoomChain` を再利用、4 部屋以上は `+N`) + 時刻 (終日 / HH:MM–HH:MM) を一行で配置、tap で既存の `StudioBookingDetailDialog` を開く (`setDetailBooking` + `setDetailDialogOpen`)。部屋フィルタ (`selectedRoomIds`) もこのセクションに連動するため、フィルタ ON 時は対象部屋を含む予定だけが残る。複数日にまたがる予約は該当する各日に重複表示し、見落としを防ぐ。`useMemo` でグルーピング済みなので bookings 変更時のみ再計算。`tsc -b client` 通過、`vite build` 成功 |
| **v2.7.8** | **スタジオ予約の使用部屋表示順をマスターの並びに統一**。スタジオ予約詳細ダイアログ (`StudioBookingDetailDialog`) や案件編集の登録済み予約一覧、カレンダー詳細などで「使用スタジオ」のチップが、部屋マスター (`StudioRoomsManagerDialog`) で設定した `sort_order` と一致しない順序で表示されていた件を修正。`server/src/contexts/production/routes/studio.routes.ts` の `studio_booking_rooms` 取得クエリ 2 箇所 (一覧用 + 単体取得) に `LEFT JOIN studio_locations l` を追加し、`ORDER BY l.sort_order NULLS LAST, r.sort_order, r.name` でロケーション順 → 部屋 sort_order 順 → 部屋名のフォールバック順にソート。これでマスターの並びがフロント側に最終的に反映される (フロント側のレンダリングは API のレスポンス順序に従うだけのため、サーバ修正のみで全画面に効く) |
| **v2.7.7** | **案件編集ページに「書類管理」セクションを追加** — 「申込書未提出」アラートを UI から解除する手段が無いという v2.7.x 累積の UX バグを解消。`projects.application_form` と `projects.logo_permission` の 2 つの BOOLEAN フラグは元々 DB スキーマと API には存在していたものの、フロント側のフォームに対応する入力 UI が一度も実装されていなかったため、ダッシュボードの「申込書未提出」アラート (`SELECT ... WHERE application_form = 0 AND gls_number IS NOT NULL ...`) が GLS 発番済み案件に対して永続表示される状態だった。①`ProjectFormPage.tsx`: メモ欄の上に「書類管理」セクションを新設（`<Switch>` × 2、申込書 / ロゴ使用許諾、各々ラベル + 説明文 + Switch の justify-between 配置）。②`FormValues` interface と `useForm` defaultValues / `reset()` 引数に両フィールド追加。③`saveMutation.onSuccess` に `qc.invalidateQueries(['dashboard', 'alerts'])` を追加してアラートが即座に再評価されるように。④`server/src/contexts/sales/services/project.service.ts` の `create()` も両フィールドを INSERT に含めるよう修正（既存の `update()` は対応済）。`tsc -b` 通過、`vite build` 成功 |
| **v2.7.6** | **全 6 アプリの全チェックボックスを一斉モダン化（38 箇所）**。①新規プリミティブ 2 種を `shared/src/client/ui/` に追加 — `ToggleButtonGroup` / `ToggleCard` (v2.7.5 のスタジオ予約カードボタンを汎用化、44px タップ領域 / role=switch or checkbox / `cols={base,sm,md,lg}` でレスポンシブグリッド / 色・左右スロット対応 / 「全て選択」チップ内蔵) と `EnhancedCheckbox` (Radix Checkbox に indeterminate=Minus アイコン + hover primary/60 を追加、テーブル行選択用)。②`client/` (案件管理) 8 ファイル: SgaDialog/Purchase/RevenueListPage/ProjectFormPage/PricingListPage の 8 単一 boolean を `<Switch>` に、CompanyListPage/ProjectFormPage の番組種別・配信媒体 (form と GLS発番ダイアログの計 5 箇所) と GLS 案件選択 (ProjectGroupListPage) を `<ToggleButtonGroup>` / `<ToggleCard>` に、SimulationDialog の費用項目テーブルを `<EnhancedCheckbox>` に。③`client-qsheet/` 2 ファイル: PreviewModal の白黒・出力列をチップボタン化、DashboardPage 3 件を `<Switch>` に。④`client-equipment/` 4 ファイル: EquipmentListPage の 10 箇所 (子機材含む / 連続登録 / 印刷チェック欄 → Switch、表示列 / 設置場所フィルタ / 印刷列 → ToggleButtonGroup / EnhancedCheckbox、全選択ヘッダ + 行選択 → EnhancedCheckbox with indeterminate、shift+クリック挙動は維持)、EquipmentDetailPage カスタム列 boolean、RentalSettingsPage 貸出可 (PC + モバイル)、RackLayoutPage セル表示項目を ToggleButtonGroup に。⑤`client-techsheet/` 1 件 (GLS 紐付け)、`client-interactive/` 2 件 (GLS 紐付け / スタンプ受付)、`client-live/` 4 件 (タイマー / YouTube / Jstream / 合計 視聴者表示) を `<Switch>` に統一 (LiveControlPage / TimerDisplayPage はそれまで独自実装の slider button だったのを Switch プリミティブに置換)。⑥**「グリーンルーム」**: v2.7.5 の UI ラベル変更 (案 A) は維持、内部 DB 値 `'greenroom'` も互換のまま。`tsc -b` 全 7 ワークスペース通過、`vite build` 全 6 client 成功 |
| **v2.7.5** | **Codex セキュリティ強化 (PR #17, #18) + スタジオカレンダー UX 全面改修**。①**Codex 監査の取り込み**: `auth.ts` の 403 レスポンスから `debug` ペイロード (要求 module / userLevel / 全 permissions) を本番のみ削除、`requireAuth` 401 ログから `x-user-id` / `Authorization` トークン先頭 20 字を撤去、`errorHandler.ts` の `details` / DB constraint hint を本番ペイロードから除去、`/auth/login` `/auth/verify-2fa` のレスポンス body から JWT を本番のみ削除 (HttpOnly Cookie のみ配信に統一)、`/auth/invite` `/users/` `/auth/reset-password` から `inviteUrl` を完全撤去、`techsheet` ルートに `requirePermission('techsheet')` を復活。②**起動シーケンスの安全側反転**: 旧 `SKIP_SEED=true` でスキップ → 新 「本番デフォルトでシードしない、`RUN_SEED_ON_STARTUP=true` で明示 opt-in」。dev/staging は従来どおり `SKIP_SEED=true` で opt-out。③**ビルド堅牢化**: `/health` の version をハードコード → `npm_package_version` 動的化、全 7 つの `tsconfig.json` に `"types": ["node"]` 明示、`box-node-sdk` のアンビエント型を `server/src/types/box-node-sdk.d.ts` で自前提供、`shared/package.json` に `@digital-go-jp/design-tokens` の明示依存を追加。④**スタジオカレンダー UX**: `studio_rooms` に `abbreviation VARCHAR(20)` カラムを追加 (migration 068)、`StudioCalendarPage` の週/日ビューで `eventContent` カスタムレンダラーを導入し「案件名 (主役・大) → 部屋略称チェイン (副次・小)」の 2 行構造に再設計 (4 部屋以上は `+N` で省略)、`ProjectFormPage` の「使用する部屋・空間」セクションをチェックボックス → モダンなトグルボタンカード (grid-cols-2 / sm:3 / lg:4 / 44px タップ領域 / role=switch / 選択時はロケーション色背景 + Check アイコン)、`StudioRoomsManagerDialog` を全面リライト (略称入力欄常設 / 12-col grid 編集 UI / 冒頭ガイドカード / 拠点単位カード)。⑤**「グリーンルーム」→「ゲストルーム」**: 内部 DB 値 `'greenroom'` は互換維持、UI ラベルのみ変更 (案 A) — 既存データへの影響ゼロ |
| **v2.7.4** | **インタラクティブ: 5 段階プリセットを実 VPS リサイズから切り離し、設定保存のみに格下げ**。検討の結果、現状のメイン VPS は案件管理・Qシート・機材・技術資料・ライブ・PostgreSQL を同居しており、インタラクティブ配信のために実リサイズすると全社業務が 10 分前後停止するため、業務影響を避ける判断で実 VPS リサイズは封印 (将来インタラクティブ専用 VPS 分離後に再配線予定)。①`EventEditorPage.tsx`: 5 ボタンを「想定接続数の保存」のみに変更 (confirm 廃止 + `/interactive/scaling/resize` 呼び出し撤去 + memory/vCPU 表示削除)。社内利用想定スケール (最大 8,000 人) に合わせ、プリセット値を `100 / 500 / 2,000 / 5,000 / 8,000` に再設計。②`scaling.service.ts`: `SCALING_PLANS` を新スケールに同期 (1GB / 1GB / 2GB / 4GB / 8GB)。resize 実装と CoNoHa /flavors 自動解決ロジックは VPS 分離後の再利用を前提に維持。③`event.service.ts`: `max_connections` 上限クランプを 100,000 → 10,000 に戻す。④`docker-compose.yml` の CoNoHa 環境変数配線 (v2.7.3) は無害なため残置 |
| **v2.7.3** | **インタラクティブ: CoNoHa スケーリングの環境変数を本番/dev コンテナに配線**。v2.7.1〜v2.7.2 でコード側はサーバ側 `process.env.CONOHA_*` を参照する設計だったが、`docker-compose.yml` の `environment:` セクションに対応エントリが無く、ホスト `.env` に値を書いてもコンテナ内に届かない状態だった。①`app_prod` / `app_dev` 双方の environment に `CONOHA_API_USERNAME` / `CONOHA_API_PASSWORD` / `CONOHA_TENANT_ID` / `CONOHA_SERVER_ID` / `CONOHA_IDENTITY_ENDPOINT` / `CONOHA_COMPUTE_ENDPOINT` の 6 変数を追加 (未設定時は空文字列にフォールバック → resize 実行時に 503 NOT_CONFIGURED で弾かれる安全側設計を維持)。②`.env.example` に CoNoHa コントロールパネルでの取得手順をコメント付きで追記 (API ユーザー作成 / テナント ID / サーバー UUID の取得場所)。これで `/root/gmo-onair/.env` に上記 4 変数を貼り付けて `docker compose up -d --force-recreate app_prod app_dev` するだけで 5 段階プリセットボタンが実 VPS をリサイズ可能になる |
| **v2.7.2** | **インタラクティブ: VPS リサイズ時の flavor UUID 自動解決**。v2.7.1 で導入した 5 段階プリセットは各プランに `flavorRef`(CoNoHa の plan UUID) を埋める必要があったが、運用者が UUID を手で調べる前提は実用的でなかった。`scaling.service.ts` の `resize()` を改修し、リサイズ実行時に CoNoHa の `GET /flavors/detail` を呼んで「`ram` (MB) と `vcpus` が一致する flavor」を自動で見つけて UUID を採用する方式に変更。プラン定義に `ramMB` (1024 / 2048 / 8192 / 32768 / 65536) を追加し、突合キーとして利用。明示指定したい場合は ① プラン定義の `flavorRef` 直書き、② 環境変数 `CONOHA_FLAVOR_<PLAN_ID>` (例: `CONOHA_FLAVOR_MINIMUM`) でオーバーライド可能。これで CoNoHa 側の認証情報 (`CONOHA_API_USERNAME` 等) さえ環境変数に入れれば、UUID 設定無しで 5 ボタンが動作する |
| **v2.7.1** | **インタラクティブ: CoNoHa VPS スケーリングを 5 段階プリセットボタン化**。`EventEditorPage` 基本設定の「最大接続数」数値入力を、`最小 / 小規模 / 中規模 / 大規模 / 最大` の 5 つのトグル風カードボタンに置換 (`〜100人`〜`〜100,000人`、`1GB/2vCPU`〜`64GB/24vCPU`)。クリックで confirm → ① イベントの `max_connections` を該当プランに更新 ② `/interactive/scaling/resize` を呼び出して CoNoHa VPS を該当 flavor へ自動リサイズ、を 1 アクションで実行。pending 中は全ボタン disabled。サーバ側 `scaling.service.ts` の SCALING_PLANS を旧 6 段階 (test/small/medium/large/xlarge/max, 50〜20,000 人) から 5 段階 (minimum/small/medium/large/xlarge, 100〜100,000 人) に再設計し default の `currentPlan` も `minimum` に。`event.service.ts` の `max_connections` 上限クランプを 10,000 → 100,000、デフォルト 1,000 → 100 に緩和 (DB スキーマ側は `INT DEFAULT 1000` のままで CHECK 制約無しのため移行不要、既存イベントは「m 以上を満たす最小プラン」ロジックで近接プランがハイライト) |
| **v2.7.0** | **Phase 4 (BOX 連携) 着手 — JWT App 認証 + GLS 発番時に案件フォルダを自動作成**。`box-node-sdk` を server に追加。①`server/src/shared/services/box.ts` (新規): JWT App (サービスアカウント) 認証のシングルトンクライアント。`BOX_CONFIG_JSON` 環境変数 (BOX 開発者コンソールでダウンロードした JSON 設定を 1 行に圧縮) からロード、未設定なら BOX 連携全体を no-op 化してサーバー正常起動。②`server/src/contexts/sales/services/box-folder.service.ts` (新規): `createProjectFolderTree(glsNumber, projectName)` で `{GLS番号}_{案件名}` 親フォルダ + 6 サブフォルダ (`01_見積・提案` / `02_発注・契約` / `03_請求` / `04_Qシート` / `05_台本・進行表` / `06_納品物`) を一括生成 (CLAUDE.md の階層に準拠)。BOX 障害時は warning ログ + null 返却で握り潰し、GLS 発番自体はブロックしない方針。③`projectService.issueGls()`: 既存の GLS 番号採番 + 概算見積→確定売上変換の後に BOX フォルダ作成を呼び出し、`customer_type` に応じて `box_url_internal` / `box_url_external` を強制上書き保存。④`docker-compose.yml`: `app_prod` / `app_dev` に `BOX_CONFIG_JSON` + `BOX_PROJECT_PARENT_FOLDER_ID` 環境変数を追加 (dev は `*_DEV` で別フォルダにフォールバック可能)。⑤`.env.example`: BOX 設定方法をコメントで明記。BOX 側の準備 (JWT App 作成 + 親フォルダ作成 + JSON ダウンロード) はユーザー側で実施 → `.env` に貼り付けて即時有効化。`server tsc -b --force` 通過 |
| **v2.6.12** | **Phase 2 完了 — Phase 2C (CrudFormDialog primitive) + Phase 2B 残課題 (EquipmentListPage) の最終決着**。①Phase 2C: 各 CRUD ページで重複していた `<Dialog>+<DialogContent>+<DialogHeader>+<form>+<DialogFooter>+保存/キャンセル ボタン` のテンプレを `shared/src/client/ui/crud-form-dialog.tsx` (CrudFormDialog) に集約。`title`/`description`/`submitLabel` は文字列 1 本で共通化、または `{create, edit}` 形式でモード別ラベル指定可。`size` で `sm`/`md`/`lg`/`xl` 切り替え、`footer` を渡せばカスタムフッター (削除ボタン併設等) にも対応、`crud.save.isPending` でのスピナー表示も内蔵。`useCrudPage` の戻り値オブジェクトをそのまま渡せる構造 (`CrudPageBindings` interface)。VendorListPage / CustomerListPage / PartnerListPage / CompanyListPage の 4 ページを retrofit (Sga/Purchase/Revenue は既存の独自フローのため対象外)。各ページで `Dialog` 関連 import 削除 + フォーム本体だけが children として残る形に簡素化。②Phase 2B: 2008 行の EquipmentListPage は URL params 駆動の複雑なフィルタ UI、children 展開、autocomplete、bulk edit、inline 編集、続けて入力モード等で `useCrudPage` の契約と合わないことを確認。state は URL params にあり、page/limit 構造でもなく、pagination UI も無し。**意図的に非移行**として記録 (強制移行はリスクに対してリターンが薄い)。全 6 client workspace で `tsc -b --force` 通過、client `vite build` 成功 |
| **v2.6.11** | **Phase 3 完了 — equipment の items + stats を service 化**。①`item.service.ts` (482 行): list / getById / listForExport / create / update / patch / delete / batchRental / bulkUpdate に加え、`generateEqCode()` (Y-V-00001 形式の連番発番、`equipment_id_sequences` への atomic upsert) も routes から移動。一括更新の `ALLOWED_BULK_FIELDS` ホワイトリスト + `ENUM_RULES` バリデーション + PATCH の `PATCHABLE_FIELDS` ホワイトリストもモジュールスコープ const に整理。親の設置場所を子に伝播するロジック (PUT/PATCH 両方で実行されていた) も service に集約。②`stats.service.ts` (91 行): ダッシュボード集計クエリ (active/in_repair/lent/overdue/open_maintenance/pending_inventory + recent_lendings/maintenance) を 1 メソッド `getDashboardStats()` に集約、古いスキーマでの JOIN 失敗を try/catch で空配列フォールバック。`equipment.routes.ts` 1181→789 行 (-392)。Phase 2A 着手前の v2.5.x 時点では equipment ルートが routes に 1377 行のモノリスだったが、Phase 3 全体で `equipment.routes.ts` 1377→789 行 (-588) + service layer 5 ファイル計 973 行に分離完了 |
| **v2.6.10** | **Phase 3 続き — equipment.routes.ts (1377 行) のうち、ビジネスロジックの濃い 3 セクションを service 化**。① `lending.service.ts` (147 行): 単発/一括貸出 + 返却 + 削除。二重貸出チェック (`status='lent'` の active lending 検出) を `findActiveLending()` ヘルパーに 1 箇所化。エラーは `AppError` で統一 (`ALREADY_LENT` / `BATCH_FAILED` 等)。② `maintenance.service.ts` (110 行): 故障報告→機材を `in_repair` に、完了→`active` に戻す副作用を service に集約。`'reported'` / `'in_repair'` / `'active'` リテラルを `MAINTENANCE_STATUS.REPORTED` / `EQUIPMENT_STATUS.IN_REPAIR` 等に置換。③ `inventory.service.ts` (143 行): 棚卸し作成時の「全機材を check items に投入」と sync 時の「差分追加」が 2 箇所で重複していたのを `listActiveEquipment()` + `batchInsertCheckItems()` ヘルパーに 1 箇所化。`'disposed'` / `'draft'` も `EQUIPMENT_STATUS.DISPOSED` / `INVENTORY_STATUS.DRAFT` に置換。`equipment.routes.ts` 1377→1181 行 (-196)、新設 service 計 400 行。残課題: items (200-600 行、約 400 行) と stats (1011-1071 行) の service 化は次ラウンドへ |
| **v2.6.9** | **Phase 3 続き — interactive モジュールの全 7 routes を service 層に分離完了**。v2.6.8 の `events` に続いて残り 6 routes をすべて sales 方式 (薄い HTTP plumbing + 厚い service) に書き換え: ① `channels.routes.ts` 71→40 行 + `channel.service.ts` 新設 (84 行) ② `stamps.routes.ts` 78→39 行 + `stamp.service.ts` (113 行、20 個上限のドメインルールを集約) ③ `overlays.routes.ts` 58→35 行 + `overlay.service.ts` (66 行、`VALID_TYPES` も移動) ④ `audience.routes.ts` 131→60 行 + `audience.service.ts` (119 行、QR SVG 生成も DB ロジック横並びで配置) ⑤ `quiz.routes.ts` 201→166 行 + `question.service.ts` (238 行、Socket.IO 通知は WS インフラなので routes 側に残し service は DB 操作 + status 遷移ルールに専念) ⑥ `scaling.routes.ts` 96→26 行 + `scaling.service.ts` (100 行、CoNoHa Identity → Compute API の 2 段認証を集約)。route layer 合計 919→450 行 (-469 行)、service layer 994 行 (新設)。`server tsc -b --force` 通過 |
| **v2.6.8** | **Phase 3 続き — service/repository 層パターンを sales 以外にも展開**。pilot として `interactive/events.routes.ts` (284 行) を `sales/projects.routes.ts` と同じ薄い HTTP plumbing 構造に書き換え、SQL とドメインロジック (リハーサル/start/stop/reuse の状態遷移 + 統計クリアのカスケード) をすべて新設の `interactive/services/event.service.ts` に集約。route ファイルは 89 行まで削減 (-195 行)、service は 232 行 (DB クエリと validation 集中)。重複していた "rehearsal-reset / start (from rehearsal) / reuse" の 3 箇所の「stamp_counts/sessions DELETE + answers DELETE + questions を draft に戻す」処理を `clearEventRuntimeData()` ヘルパーに 1 箇所化。route には `req.params.id as string` cast を sales 方式に揃えて TS の `string \| string[]` を解消。`server tsc -b --force` 通過 |
| **v2.6.7** | **Phase 3 続き — 残りの status 重複を排除 + DB CHECK 制約と TS const の対応関係をドキュメント化**。当初の audit は「`interactive_events` の CHECK 制約に `'rehearsal'` が無いのにコードで使われている = 本番で制約違反する」という correctness バグを指摘していたが、**実態調査の結果これは false alarm だった**: `migration 024_rehearsal_status.sql` が既に CHECK 制約に `'rehearsal'` を追加済み。audit が migration 013 だけ見て 024 を見逃したための誤報。全 status CHECK 制約 (10 個) とコードの照合を行い、drift 無しを確認。代わりに残っていた局所重複: `qsheet/documents.routes.ts` / `techsheet/documents.routes.ts` / `equipment.routes.ts` の 3 箇所に `VALID_STATUSES = ['draft', ...]` というローカル配列が定義されていたのを `Object.values(QSHEET_STATUS)` / `Object.values(TECHSHEET_STATUS)` / `Object.values(INVENTORY_STATUS)` に置換 (v2.6.6 で導入した shared constants から派生)。`server/src/shared/constants/statuses.ts` のヘッダコメントに「各 const ↔ 対応する migration の行番号」マッピングを追記し、今後 drift が起きたときの早期発見を支援。`server tsc -b --force` 通過 |
| **v2.6.6** | **Phase 3 着手: server-side audit に基づくクイックウィン**。①Pagination envelope 正規化: `equipment/items` GET が独自に `meta: { total }` を返していたのを `paginatedResponse()` ヘルパーに統一 (audit 報告では「35+ routes」となっていたが、実態調査の結果、本当に envelope が違ったのは 1 route のみ。`data-viewer` も `pagination` フィールド名は正しいがインライン記述だったので helper に切替えた)。②Server-side status 定数化: `server/src/shared/constants/statuses.ts` を新設し、`'lent'` / `'returned'` / `'rehearsal'` 等のハードコード文字列を `EQUIPMENT_LENDING_STATUS.LENT` / `INTERACTIVE_EVENT_STATUS.REHEARSAL` 等の TypeScript const に置換 (`equipment.routes.ts` 7 箇所 / `interactive/events.routes.ts` 9 箇所)。文字列値はクライアントの `shared/src/constants/statuses.ts` のキーと同一に保つ規約。SQL クエリでは template literal 内挿で利用 (TS const なので SQL injection リスク無し、TS が型でタイポを検出)。`tsc -b --force` 通過。Phase 3 残課題: ①interactive_events の DB CHECK 制約に `'rehearsal'` が無い件 (要 migration)、②service/repository 層の equipment/interactive への展開 (大規模 refactor)、③DB schema status 整合 |
| **v2.6.5** | **Phase 2B 着手: client-equipment の小〜中規模マスター 3 ページを useCrudPage に移行**。`client-equipment/src/hooks/useCrudPage.ts` factory を新設 (client/ と同じパターン) して `ColorPage` / `ManufacturerPage` / `LocationPage` を移行。これらは元々 `(api.get(...)).data.data` で envelope の `{ data: [...] }` を読んでいたため、useCrudPage の `pagination?` optional 構造にそのまま適合 (pagination は undefined のまま動く)。LocationPage は MasterDialog (拠点/種別マスタ管理) のサブダイアログだけ独自フローのため維持。Phase 2B の対象外: `LendingListPage` (multi-step wizard + batch/return という非標準ミューテーション), `EquipmentListPage` (2008 行 + bulk edit + custom columns でリスク高、別ラウンド), client-qsheet/techsheet/interactive/live (CRUD 一覧ページが存在しないか、リアルタイム/エディタ専用ビュー)。`tsc -b --force` + `vite build` 通過 |
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
