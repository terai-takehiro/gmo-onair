# GMO ONAiR - プロジェクトメモリ

## プロジェクト概要
GMO ONAiR = GMOグローバルスタジオの「会社OS」を目指すウェブアプリ。
スタジオ案件管理・売上仕入管理・損益管理を一元化するシステム。
将来的にQシートアプリ(GMO-Qsheet-Editor)も統合し、ワンストップの制作管理OSにする。

## 技術構成
- **フロントエンド**: React + Vite + TailwindCSS + shadcn/ui
- **バックエンド**: Express + PostgreSQL (pg)
- **モノレポ**: client/ + server/ を1つのリポジトリで管理
- **デプロイ先**: CoNoHa VPS (Docker Compose + PostgreSQL + Nginx)
- **旧デプロイ先**: Render (廃止予定)

## 現在のバージョン: v0.6.0

## ブランチ運用
- **デプロイ**: 常に `main` ブランチにプッシュ（masterではない）
- **バージョン管理**: インクリメンタル（v0.2.1, v0.2.2...）、大きくジャンプしない

## 統合プロジェクトライフサイクル (Phase A完了)
- 旧: `opportunities`テーブル + `projects`テーブル → 統合: 単一`projects`テーブル
- `stage`フィールド: neta → d_hold → c_proposal → b_verbal → a_won → s_completed / e_lost
- `gls_number IS NULL` = ヨミ段階, `IS NOT NULL` = GLS発番済み
- GLS発番は別エンドポイント: `POST /projects/:id/issue-gls`
- タグベースのグループ分け（旧project_groupsは廃止）

---

## ロードマップ

### NOW: CoNoHa VPS移行
ONAiRをRenderからCoNoHa VPSに移行し、本番運用可能な状態にする。
- [x] PostgreSQLへのDB切り替え (sql.js → PostgreSQL)
- [x] Docker/Docker Compose対応
- [x] Nginx設定 (リバースプロキシ)
- [x] CoNoHa VPSにデプロイ (http://133.117.74.239)
- [x] 環境変数管理 (.env)
- [x] master (v0.5.3) と main (PostgreSQL) のブランチ統合
- [ ] HTTPS対応 (ドメイン取得後に SSL/Let's Encrypt)
- [ ] VPSに統合版 v0.6.0 を再デプロイ

### NEXT: Qシートアプリ連携
別アプリとしてCoNoHa上で並走させ、GLSナンバー+エピソードで連携。
- [ ] Qシートアプリも同じVPSにデプロイ (port 3456)
- [ ] GLS + エピソード番号で紐付け (ONAiR episodes → Qシート documents)
- [ ] ONAiR案件画面に「Qシート」リンク追加
- [ ] Qシートのエピソード選択UIをONAiRのAPIから取得

### LATER: アプリ統合
QシートエディタをONAiRに統合し、1つのアプリにする。
- [ ] Qシートエディタ(Vanilla JS)をReactコンポーネント化
- [ ] DB統合 (documents テーブルをONAiR DBに移植)
- [ ] 認証統合 (Google OAuth をONAiR全体に適用)
- [ ] リポジトリ統合 (GMO-Qsheet-Editor → gmo-onair)

### LATER: BOX連携
御社契約のBOXをドキュメントハブとして活用。
- [ ] BOX JWT認証セットアップ
- [ ] GLS発番時にBOX案件フォルダ自動生成
- [ ] 見積書・請求書PDF → BOX自動保存
- [ ] Qシート確定PDF → BOX自動保存
- [ ] ONAiR画面にBOXドキュメント一覧表示
- [ ] 承認フロー + 外部共有 + Box Sign電子署名

### LATER: その他機能
- [ ] 見積書・請求書PDF生成機能
- [ ] マルチテナント対応

---

## Qシートアプリ情報
- リポジトリ: terai-takehiro/GMO-Qsheet-Editor
- **技術構成**: Express + Vanilla JS + Quill.js + PostgreSQL + Docker Compose
- **認証**: Google OAuth 2.0 + Passport.js (招待制)
- **マルチテナント**: tenants/roles (master/client_admin/client_user)
- **データ**: documents テーブルに JSONB でQシート全体を保存
- **PDF出力**: pdfkit サーバーサイド生成 (A4/A3, Noto Sans JP)
- **ポート**: 3456
- **連携キー**: GLS番号 + エピソードコード (例: GLS002-003)

## BOXフォルダ構造 (将来: 案件ごと)
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

## CoNoHa VPS構成
```
CoNoHa VPS
├── Nginx (リバースプロキシ + SSL)
│   ├── onair.example.com    → localhost:3000
│   └── qsheet.example.com  → localhost:3456
├── GMO ONAiR        (port 3000)
│   ├── Express + React
│   └── PostgreSQL DB: onair_db
├── GMO Qsheet Editor (port 3456) ← 将来統合
│   ├── Express + Vanilla JS
│   └── PostgreSQL DB: qsheet_db
├── PostgreSQL 16
└── Docker Compose で一括管理
```

## 完了済み
- [x] Phase A: ヨミと案件の統合（サーバー+クライアント全て完了）
- [x] ダッシュボード モバイル最適化 (v0.2.1)
- [x] シードデータのリアル化（プロジェクト名・タグ・失注理由・販管費）
