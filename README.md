# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
案件・財務・カレンダー・日常業務・機材・制作技術支援（Qシート）・計時を、案件の**管理番号**を中核に
1つのモノレポ・1つのサーバーで束ねた社内システムです。

| 環境 | URL | 出るタイミング |
| --- | --- | --- |
| 本番 | https://gmo-onair.jp | GitHub で Release（タグ `vX.Y.Z`）を公開したとき |
| 検証 | https://dev.gmo-onair.jp | `main` に PR をマージしたとき（自動） |

**現在のバージョン**: v4.6.19 — **PR #700・#702・#704・#705・#706・#707・#708のレビュー状況を棚卸しに記録した**

変更の履歴は [docs/version-history.md](docs/version-history.md)（全件・全文）と、画面ヘッダーの「バージョン履歴」で読めます。
直近3件の要約は [CLAUDE.md](CLAUDE.md) の「現在のバージョン」にあります。

---

## ブロックアプリ

ONAiR は1つの巨大なアプリではなく、役割ごとに分かれた「ブロックアプリ」の集まりです。
全アプリを同じドメインで配信し、Nginx のパスと Express の静的配信で振り分けます。認証と API は共通（`/api/v1/internal/*`）。

| アプリ | ディレクトリ | 公開パス | 状態 | 何をするか |
| --- | --- | --- | --- | --- |
| 案件管理・財務管理・カレンダー・設定・プロジェクト管理 | [`client/`](client/CLAUDE.md) | `/` | 稼働（v4） | 案件・見積・売上・仕入・損益・スタジオ予定・権限。プロジェクト管理（GLS-B）は `/gpm` |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 稼働（v4） | 週報・ニュース・内覧会・受領書類・セキュリティカード・タスク |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 稼働（v4） | 機材台帳・ラック図・貸出・棚卸し・メンテナンス |
| 制作技術支援（Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` も転送で生存） | 稼働（作り直し進行中） | 台本作成・本番進行（進行／ランダウン／プロンプター／音声サポート）・テロップCG・レンタル機材検索 |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 稼働（制作技術支援から開く） | 本番の残り時間と同時視聴者数の大画面表示 |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（到達不可） | **廃止** | 後継は制作技術支援＞テロップCG。コードは参照用に残すだけ |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | 全アプリの土台 | 設計トークン・UI 部品・共通シェル・純関数 |

外部リンク（別 VPS・別タブ）: [インタラクティブ](https://interactive.gmo-onair.jp/)・[翻訳](https://gmo-translate.jp/)。
アプリ登録の唯一の正は `shared/src/client/apps.ts`。各アプリの決めごとはそのディレクトリの `CLAUDE.md`。

---

## 技術スタック

| 層 | 使っているもの |
| --- | --- |
| フロントエンド | React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui + TanStack Query + Zustand + React Router v6 |
| バックエンド | Node.js 20 + Express + TypeScript + PostgreSQL 16（`pg`）。1つのイメージが API と全アプリの静的ファイルを配信 |
| リアルタイム | Socket.IO（`/techops` 名前空間で本番進行を同期。旧 `/qsheet` はブリッジで生存） |
| 認証 | `AUTH_MODE` で切替。本番・検証は Email/Password（＋SMS 確認コード）、手元の開発の既定はユーザーカード選択式（mock） |
| AI / 外部連携 | MCP サーバー（`/api/v1/mcp`・[docs/mcp-server.md](docs/mcp-server.md)）・BOX・Google／Outlook カレンダー・Twilio・SMTP |
| インフラ | CoNoHa VPS 1台に Docker Compose で本番と検証を並走。Nginx + Let's Encrypt。イメージは GitHub Actions でビルドして GHCR へ |
| 補助 | `rental-scraper/`（Python）がレンタル機材サイトを毎日クロールして Postgres に同期 |
| モノレポ | npm workspaces（`client*` / `server` / `shared`）。ローカル開発は Dev Containers |

---

## 開発を始める

必要なもの: **Node.js 20**・**Docker**（検証用 Postgres 用）。詳しい手順と守るべき決めごとは [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
git clone https://github.com/terai-takehiro/gmo-onair.git && cd gmo-onair
cp .env.example .env
npm ci --workspaces --include-workspace-root
npm run verify:up      # 検証用 Postgres（ポート 5433・本番とは完全分離）
npm run dev            # 既定3アプリ + server（全アプリは dev:all）
```

```bash
npm run typecheck      # 型チェック（CI は typecheck:all）
npm run lint           # eslint ＋ 文書リンク・changelog・トークン・migration 番号などの検査
npm run test           # shared の Vitest ＋ server のレビュー試験（CI と同じ）
npm run build:changed  # 変更したワークスペースだけビルド
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
```

---

## 変更が届くまで

**正は [docs/branching.md](docs/branching.md)。** GitHub Flow ＋ リリースタグです。

| やりたいこと | 操作 |
| --- | --- |
| 検証環境に出す | `main` に PR をマージする（自動デプロイ） |
| 特定のブランチ・コミットを検証環境で見る | Actions → **Preview** → ref を入力（本番には出せない） |
| **本番に出す** | GitHub で **Release（タグ `vX.Y.Z`）を公開**する。利用者の明示的な指示があるときだけ |
| 本番を戻す | Releases から1つ前のタグの Deploy を再実行（DB を伴う版は [docs/deploy-pipeline.md](docs/deploy-pipeline.md) の注意を読む） |

- 長く残るブランチは `main` だけ。直接 push 禁止・PR のみ・Squash マージ固定
- PR タイトルは `種類(アプリ): 何をしたか`（例 `feat(equipment): 機材台帳を v4 の見た目にした`）
- **作業 PR では版番号を触らず**、`docs/changelog.d/<枝の名前>.md` に載せたい文を1つ置く。版はリリース時に `npm run release:notes -- X.Y.Z` が上げる
- ビルドは GitHub Actions が行い、VPS はイメージを pull するだけ。仕組みは [docs/deploy-pipeline.md](docs/deploy-pipeline.md)

---

## ドキュメント

| 知りたいこと | 読む場所 |
| --- | --- |
| **docs/ の目次**（現役の決めごと・計画・記録・生成物の分類） | [docs/README.md](docs/README.md) |
| 開発方針・環境分離・セキュリティの決めごと（Claude が毎ターン読むプロジェクトメモリ） | [CLAUDE.md](CLAUDE.md) |
| 環境構築から PR まで | [CONTRIBUTING.md](CONTRIBUTING.md) |
| ブランチ・PR・リリース手順 | [docs/branching.md](docs/branching.md) |
| デプロイの仕組みと VPS の運用 | [docs/deploy-pipeline.md](docs/deploy-pipeline.md)・[docs/ops/vps-setup.md](docs/ops/vps-setup.md) |
| v4 の計画・進み具合・画面仕様 | [docs/v4-plan.md](docs/v4-plan.md)・[docs/v4-progress.md](docs/v4-progress.md)・[docs/design/v4/README.md](docs/design/v4/README.md) |
| エンジニアでない人向けの説明 | [docs/guide/README.md](docs/guide/README.md) |

---

## セキュリティと環境分離

- `.env` や認証情報は**絶対に Git にコミットしない**。API キー・JWT シークレットをソースに書かない
- 本番 DB（`onair_prod`）と検証 DB（`onair_dev`）は**完全分離**。相互参照・相互コピー禁止
- 本番 DB への直接 SQL 操作は緊急時のみ
- 本番リリースの公開は利用者の明示的な指示があるときだけ

詳細は [CLAUDE.md](CLAUDE.md) の「環境分離ポリシー」「セキュリティポリシー」。

---

## ライセンス

本プロジェクトは GMOグローバルスタジオ社内で利用するクローズドソースです。
