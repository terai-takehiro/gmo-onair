# GMO ONAiR - プロジェクトメモリ

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの「会社OS」を目指すウェブアプリ。
スタジオ案件管理・売上仕入管理・損益管理を一元化するシステム。

## 技術構成
- **フロントエンド**: React + Vite + TailwindCSS + shadcn/ui
- **バックエンド**: Express + sql.js (SQLite Wasm版)
- **モノレポ**: client/ + server/ を1つのリポジトリで管理
- **現在のデプロイ先**: Render (mainブランチ監視で自動デプロイ)
- **最終デプロイ先**: CoNoHa VPS (PostgreSQL + Nginx)

## 現在のバージョン: v0.2.1

## 統合プロジェクトライフサイクル (Phase A完了)
- 旧: `opportunities`テーブル + `projects`テーブル → 統合: 単一`projects`テーブル
- `stage`フィールド: neta → d_hold → c_proposal → b_verbal → a_won → s_completed / e_lost
- `gls_number IS NULL` = ヨミ段階, `IS NOT NULL` = GLS発番済み
- GLS発番は別エンドポイント: `POST /projects/:id/issue-gls`
- タグベースのグループ分け（旧project_groupsは廃止）

## ブランチ運用
- **デプロイ**: 常に `main` ブランチにプッシュ（masterではない）
- **バージョン管理**: インクリメンタル（v0.2.1, v0.2.2...）、大きくジャンプしない

## BOX連携計画
御社契約のBOXをドキュメントハブとして活用予定:
- **Phase 1**: BOX JWT認証セットアップ + GLS発番時に案件フォルダ自動生成
- **Phase 2**: 見積書・請求書PDF → BOX自動保存
- **Phase 3**: BOX Webhook連携 + ONAiR画面にドキュメント一覧表示
- **Phase 4**: 承認フロー + 外部共有 + Box Sign電子署名

### BOXフォルダ構造 (案件ごと)
```
📁 GMO_Studio/
├── 📁 GLS001_案件名/
│   ├── 📁 01_見積・提案/      ← ONAiRが書く
│   ├── 📁 02_発注・契約/      ← ONAiRが書く
│   ├── 📁 03_請求/            ← ONAiRが書く
│   ├── 📁 04_Qシート/         ← Qシートアプリが書く
│   ├── 📁 05_台本・進行表/
│   └── 📁 06_納品物/
```

### CoNoHa VPS最終構成
```
CoNoHa VPS
├── Nginx (リバースプロキシ + SSL)
│   ├── onair.example.com    → localhost:3000
│   └── qsheet.example.com  → localhost:3456
├── GMO ONAiR        (port 3000) - 案件管理OS
│   ├── Express + React + Vite
│   └── PostgreSQL DB: onair_db
├── GMO Qsheet Editor (port 3456) - Qシート制作
│   ├── Express + Vanilla JS + Quill.js
│   ├── PostgreSQL DB: qsheet_db
│   └── Google OAuth 2.0認証 (Passport.js)
├── PostgreSQL 16 (両アプリ共有インスタンス、DB分離)
├── Docker Compose で一括管理
└── 共通: Box Node SDK + JWT認証
```

## Qシートアプリ連携計画
- リポジトリ: terai-takehiro/GMO-Qsheet-Editor
- **技術構成**: Express + Vanilla JS + PostgreSQL + Docker Compose
- **認証**: Google OAuth 2.0 + Passport.js (招待制)
- **マルチテナント**: tenants/roles (master/client_admin/client_user)
- **データ**: documents テーブルに JSONB でQシート全体を保存
- **PDF出力**: pdfkit サーバーサイド生成 (A4/A3, Noto Sans JP)
- **ポート**: 3456 (ONAiRの3000と共存可能)

### 連携設計
- **GLSナンバーが共通キー**: 両アプリをGLS番号で紐付け
- **BOXがハブ**: 同じGLSフォルダを両アプリから読み書き
- **API連携**:
  - ONAiR → Qシート: 案件作成時にGLS番号+基本情報を送信、「Qシート作成」ボタン
  - Qシート → ONAiR: Qシート確定時にWebhookでステータス通知
- **認証統合**: 将来的にONAiRもGoogle OAuth対応でSSO化検討
- 別アプリとして独立稼働しつつ、GLS番号+BOXで連動

### 連携実装フェーズ
```
Phase 1: CoNoHa移行 → ONAiR PostgreSQL化 + Qシート Docker Compose + Nginx
Phase 2: GLS連携   → Qシートにgls_number対応、ONAiR画面にQシートリンク
Phase 3: BOX連携   → JWT認証共通化、PDF出力先BOX化、ドキュメント一覧
Phase 4: 高度連携  → Qシート確定通知、Google OAuth統合、統合ダッシュボード
```

## 完了済みフェーズ
- [x] Phase A: ヨミと案件の統合（サーバー+クライアント全て完了）
- [x] ダッシュボード モバイル最適化 (v0.2.1)
- [x] シードデータのリアル化（プロジェクト名・タグ・失注理由・販管費）

## 未着手・検討中
- [ ] CoNoHa VPSへの移行
- [ ] PostgreSQLへのDB切り替え
- [ ] BOX連携実装
- [ ] Qシートアプリとの連携設計・実装
- [ ] 見積書・請求書PDF生成機能
