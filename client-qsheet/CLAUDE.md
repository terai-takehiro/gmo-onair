# 制作資料（Qシート） — **v4.0.0 のスコープ外（凍結）**

ベースパス `/qsheet/`・ポート 5174。

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

- **データ**: `qsheet_documents` テーブルに JSONB で台本全体を保存。同時編集は Yjs（`qsheet_doc_yjs`）
- **連携キー**: GLS番号 ＋ エピソードコード（例 `GLS002-003`）
- **PDF出力**: サーバー側 pdfkit（A4/A3・Noto Sans JP）
- **画面**: `pages/{DashboardPage,EditorPage,OnAirPage,RundownPage,PrompterPage,AudioSupportPage}`
- **本番は1つのURL＋役割**（進行／ランダウン／プロンプター／音声サポート）。
  **音声サポートだけログイン不要の公開URL**（`/qsheet/audio/:id`）— 認証を付けないこと
- **Socket.IO** `/qsheet` ネームスペース: OnAir↔ランダウンの同期（`cue:update/sync/next/prev/jump/play/pause/reset`）
- サーバー側は `server/src/contexts/qsheet`（`collab.ts` が Yjs の部屋を持つ）
