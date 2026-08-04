# 技術資料 — **v4.0.0 のスコープ外（凍結）**

ベースパス `/techsheet/`・ポート 5177。

## 凍結の意味（v4 の決定事項）

このアプリは **v4.0.0 では作り直しません**。今日と同じ見た目・同じ動作を保ちます。

- **URL は生かす。** ルーティングは変更しない。ブックマーク・配布済みQR・OBS の出力URL・
  役割別URL はすべてそのまま動く（**本番の業務が止まらないことが最優先**）
- **トップページのアプリ一覧・アプリ切替からは外す**（v4 のランチャーに載せない）
- **見た目を変えない。** `shared/src/client/tokens.css` を読み続ける。
  v4 の色・書体は `tokens-v4.css` 側にあり、このアプリには入らない

## やってはいけないこと

- `src/index.css` の `tokens.css` の import を `tokens-v4.css` に**差し替えない**
- `index.html` に **LINE Seed JP を追加しない**（v4 の書体はこのアプリに入れない）
- 共通シェル（`shared/src/client/shell/`）に**載せ替えない**。
  `src/components/layout/{AppShell,Header,Sidebar}.tsx` は残す
- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**

不具合の修正は通常どおり行ってよい（見た目の刷新だけを止めている）。
v4.1 以降で順に v4 へ載せ替える。

## このアプリの中身

- **データ**: `techsheet_documents` テーブルに JSONB
- **画面**: `pages/{DashboardPage,EditorPage,PrintPage}`。編集はタブ式（基本情報・スタッフ配置・カメラ・映像・音声・通信）
- 自動保存3秒。楽観ロック（`expected_updated_at` 不一致で 409）
- 印刷は A4・空項目は自動で省略
- サーバー側は `server/src/contexts/techsheet`
- **v4 のモックアップは存在しない**（デザインが出ていないため、そもそも作り直せない）
