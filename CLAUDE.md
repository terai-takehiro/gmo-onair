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
├── GMO ONAiR        (port 3000) - 案件管理OS
│   └── PostgreSQL DB
├── GMO Qsheet Editor (port 3001) - Qシート制作
│   └── PostgreSQL DB
├── Nginx (リバースプロキシ)
└── 共通: Box Node SDK + JWT認証
```

## Qシートアプリ連携計画
- リポジトリ: terai-takehiro/GMO-Qsheet-Editor
- **GLSナンバーが共通キー**: 両アプリをGLS番号で紐付け
- **BOXがハブ**: 同じGLSフォルダを両アプリから読み書き
- **API連携**: ONAiRから案件情報送信、Qシートからステータス通知
- 別アプリとして独立稼働しつつ、GLS番号+BOXで連動

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
