# 旧ロードマップと完了記録 (アーカイブ)

> CLAUDE.md から切り出した**歴史的な記録**です。v0.5〜v2.1 期の計画と、
> 別 VPS へ切り出した EventStamp (インタラクティブ演出) の当時の情報を含みます。
> **現行の計画は [v4-plan.md](v4-plan.md)、直近の刷新計画は [roadmap.md](roadmap.md)**、
> 版ごとの変更は [version-history.md](version-history.md) にあります。
>
> CLAUDE.md は毎ターン文脈に読み込まれるため、参照頻度の低い記録はここに置きます。

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

### NOW: 3アプリ並走 (v0.6.x)
ONAiR + Qsheet + EventStamp をDocker Compose + Nginxで同一VPS上に並走。
- [x] docker-compose.yml に3サービス追加 (onair:3000, qsheet:3456, eventstamp:3001)
- [x] Nginx リバースプロキシ設定 (path-based routing + WebSocket upgrade)
- [x] PostgreSQL複数DB初期化スクリプト (onair_db + qsheet_db)
- [x] ONAiRホーム画面からQsheet/EventStampへの外部リンク
- [ ] VPSにデプロイ・動作確認
- [ ] HTTPS対応 (ドメイン取得後に SSL/Let's Encrypt)

### DONE: Qシートサブアプリ統合 (v0.7.x)
QsheetのReactクライアントをONAiRモノレポにサブアプリとして組み込む。
- [x] client-qsheet/ ワークスペース追加 (equipment方式)
- [x] Qsheet DB マイグレーション (012_qsheet_schema.sql)
- [x] qsheet サーバーコンテキスト追加 (routes + services)
- [ ] episode_id でONAiR案件と連携
- [ ] ONAiR案件画面に「Qシート」リンク追加

### DONE: EventStampサブアプリ統合 (v0.8.x)
EventStampをReact化してONAiRに統合。
- [x] EventStamp React化 (client-interactive/)
- [x] PostgreSQL マイグレーション (013_interactive_schema.sql)
- [x] Socket.IO統合 (server/src/index.ts)
- [x] インタラクティブ演出サーバーコンテキスト (routes + socket)

### DONE: UI/UX全面リニューアル
- [x] GMO Blue (#005bac) + Warm Neutrals デザインシステム導入
- [x] Noto Serif JP 見出しフォント + 全4アプリ統一CSS変数
- [x] コンポーネント warm化 (card ring shadow, input rounded-xl)
- [x] レイアウト統一 (bg-card header/sidebar)
- [x] 不要コード整理 (sql.js型, render.yaml, Opportunity型, CSVバグ修正)

### DONE: 技術資料アプリ (TechSheet) プロトタイプ
- [x] techsheet_documents テーブル (014_techsheet_schema.sql)
- [x] サーバーコンテキスト (CRUD + auth)
- [x] エディタ画面 (タブ式: ヘッダー/カメラ/映像/音声/通信)
- [x] 印刷画面 (A4 per-section, @media print)
- [ ] 機材管理DB連携 (equipment_items → techsheet内で参照)
- [ ] PDF出力

### DONE: 共有ライブラリ集約
- [x] shared/src/client/ にファクトリ関数集約
- [x] 4クライアントアプリのリファクタリング (576行削減)
- [x] 全アプリ型チェック通過

### DONE: v2.1.0 — 全アプリダッシュボードをデジタル庁ダッシュボードガイドブック準拠に刷新
「ダッシュボードデザインの実践ガイドブック」の4原則(目的に則する / 違いに気づける / 分解できる / 鮮度が高い)に沿い、全 9 ダッシュボードを再設計。
- [x] 共通パターンライブラリ `shared/src/client/dashboard/` を新設
  - `DashboardHeader` (タイトル + 期間 + 最終更新 + コントロール)
  - `KpiCard` (大きな数字 + 単位 + トレンド記号 + emphasis: default/success/warning/negative/info)
  - `SectionCard` (アイコン + タイトル + 説明 + actions + footnote)
  - `EmptyState` (icon + title + description + action)
  - `chartColors` / `chartDefaults` — DADS 準拠のニュートラル中心パレット (brand/positive/negative/warning/info/neutral + categorical 8色)
- [x] 9 ダッシュボード刷新:
  - 案件管理 (platform Dashboard, BudgetDashboard, SalesReview)
  - Qシート / 機材 / インタラクティブ / 技術資料 / ライブ (Session + Dashboard)
- [x] コントラスト比 3:1 以上・WCAG 2.2 AA focus ring・aria-*/role 強化
- [x] 全 6 client + server ビルド通過

### DONE: v2.0.0 — デジタル庁デザインシステム (DADS) 全面リニューアル
GMO ONAiR 全アプリを DADS v2.13 相当の設計思想・トークン・アクセシビリティ水準 (WCAG 2.2 AA) に統合。
- [x] `@digital-go-jp/design-tokens` + `@digital-go-jp/tailwind-theme-plugin` (MIT) を導入
- [x] `shared/src/client/tokens.css` を新設。DADS プリミティブ + GMO Blue (#005bac) セマンティック層
- [x] `shared/tailwind.preset.ts` に共通プリセット。全 6 アプリが継承
- [x] `shared/src/client/ui/` に UI プリミティブ 12 種を集約 (Button/Input/Label/Card/Badge/Dialog/Select/Checkbox/Switch/Tabs/Textarea/Separator)
- [x] 6 アプリの `components/ui/` を shared 再エクスポートに置換
- [x] `client-qsheet` の primary 上書き (#2563eb) を撤廃
- [x] ファビコン / GMO ONAiR ロゴは継続利用 (ブランド資産は保持)
- [x] 全アプリ型チェック & ビルド通過

### LATER: 制作支援アプリ (ProdSheet) — 未着手
スケジュール・スタッフ配置・ケータリング・連絡先等の制作進行支援。TechSheetと連携。
- [ ] 設計・DB設計
- [ ] client-prodsheet/ ワークスペース追加
- [ ] TechSheet ↔ ProdSheet 相互参照API

### LATER: 認証統一 (v0.9.x+)
全アプリの認証をGoogle OAuthに統一。
- [ ] mockAuth廃止 → Google OAuth 2.0 + Passport.js
- [ ] 認証統合 (全クライアントをBearer tokenに移行)

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

## EventStampアプリ情報
- リポジトリ: terai-takehiro/gmo_eventstamp
- **技術構成**: Express + Socket.IO + SQLite (sql.js) + Vanilla JS
- **認証**: セッションベース + Google OAuth 2.0 + TOTP 2FA
- **マルチテナント**: tenants/admins (master/admin)
- **リアルタイム**: Socket.IO 200ms集約ブロードキャスト
- **機能**: スタンプ連打、透過出力(OBS/NDI/SDI)、QRコード生成、マルチチャンネル
- **ポート**: 3001
- **CoNoHaスケーリング**: 同時接続数に応じたVPSリサイズ (512MB〜16GB)
- **ONAiR連携先**: interactiveブロックアプリ (インタラクティブ演出支援)

## 完了済み
- [x] Phase A: ヨミと案件の統合（サーバー+クライアント全て完了）
- [x] ダッシュボード モバイル最適化 (v0.2.1)
- [x] シードデータのリアル化（プロジェクト名・タグ・失注理由・販管費）
- [x] Qシートサブアプリ統合 (v0.7.x)
- [x] セキュリティ脆弱性修正 (SQLインジェクション・認証・CSP)
- [x] EventStampサブアプリ統合 (v0.8.x)
- [x] UI/UX全面リニューアル (GMO Blue + Warm Neutrals)
- [x] 不要コード・DB整理 (sql.js型, render.yaml, Opportunity型削除, CSVバグ修正)
- [x] Qシート ディレクター用ランダウン画面 (Socket.IO同期, 押し/巻き表示)
- [x] 技術資料アプリ (TechSheet) プロトタイプ (カメラ/映像/音声/通信シート)
- [x] 共有ライブラリ集約 (shared/src/client/) — 40+重複ファイル → ファクトリ関数化
