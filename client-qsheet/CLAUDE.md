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
- **トーストを帯（`NoticeBar`）に置き換えない。** このアプリは `src/lib/notify.ts` 経由で
  13 か所トーストを使っており、**放送中の「放送同期が切断されました」も含まれる**。
  v4 の3アプリは帯に移ったが、ここは今日のまま。v4.1 で載せ替えるときに寄せる
  （P3 でバレルから外したので、import は深いパス
  `@gmo-onair/shared/src/client/ui/{use-toast,toaster}` を名指しする形になっている）

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

## 入力欄は素の `<input value onChange>` で書かない（日本語が壊れる）

台本の内容を編集する欄は、**必ず `BufferedInput` / `BufferedTextarea`**
（`src/components/editor/BufferedInput.tsx` / `CueRow.tsx`。中身は `src/lib/useBufferedValue.ts`）を使う。

打つ → ドキュメント全体を作り直す → collab (Y.Doc) を経由して props が返る、という流れなので
**value が返るのは 1 レンダー後**。素の controlled input だと、変換 (composition) の途中で
React が DOM の値を古い props へ書き戻し、**変換中の文字が二重に入る**。

- 実測: LED/XR シーンで「さくら」と打つと **「ささくさくらさくら」**（v3.2.3 まで）
- **型でも lint でも気づけない。** `page.keyboard.type()` でも再現しない
  （composition が起きないため）。確かめ方は `npm run verify:ime`
  （CDP の `Input.imeSetComposition` で実際の変換を再現する）
- `<select>` と数値・日付の欄はそのままでよい（変換が起きない）

## 不変条件: 全ての section / row は `id` を持つ

同時編集の差分器（`src/lib/collab/ydocDiff.ts`）は **`id` を鍵に prev と next を突き合わせる**。
id が無い section / row は毎回「Y.Doc にまだ無いもの」と判定され、
**1 回の編集ごとに全部がもう一度追加される**（倍々に増える）。

- 実際に **CSV 取込が id を付けておらず**、取り込んだあと打鍵するたびに倍増して落ちた
  （実測: 8 回の編集で 3 → 769 ロール。20 回で百万件）
- section / row を新しく作るところでは **必ず `genId("sec")` / `genId("row")`**（`src/lib/stableIds.ts`）
- 付け忘れても壊れないよう、`updateData` は `applyDataUpdate` を通す
  （① Y 側の id 無しを埋める → ② prev を読む → ③ next に id を付ける、の順。順番を崩すと増殖する）
- 固定してあるテスト: `shared/tests/qsheetCsvImport.test.ts`（`npm run test`）
