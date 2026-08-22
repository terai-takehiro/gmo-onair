# 制作技術支援（Qシート・旧「制作資料」） — **v4.1 で凍結を解いた（作り直しは進行中）**

⚠️ **2026-08-22 のご指示でアプリ名を「制作資料」→「制作技術支援」に再改名し、
大アプリ（プロジェクト管理と財務管理の間）に格上げした。** `shared/src/client/apps.ts` の
`APPS` 順とホームタイルの `DAILY_KEYS`（`client/src/contexts/platform/pages/HomePage.tsx`）を
参照。このファイル中の「制作資料」表記は旧名として残っている箇所がある。

ベースパス `/qsheet/`・ポート 5174。

## いまの状態（v4.1・共通シェル載せ替え後）

⚠️ **「凍結解除」は段階的に進めている。段3で解いたのは「アプリ一覧・検査体系上の凍結」だけ**だった。
**段5 PR8 で外枠（ヘッダー・サイドバー・エディタ画面の外枠・共有ダイアログ）の見た目を v4 トークンに
寄せ、続く PR で `shared/src/client/shell/` への載せ替え自体を済ませた**。まだなのは
**表本体（`CueTable`/`CueRow`/`cells/*`）・`EditorSidebar` の詳細・本番3画面固有の実装**。
混同しないこと。

| 解けたもの | まだのもの |
| --- | --- |
| `shared/src/client/apps.ts` の `frozen: true` を落とした → 一覧・アプリ切替に出る（段3） | v4 の共通部品（`Row` / `Money` / `DateRange` など）への置き換え |
| `scripts/check-frozen-css.mjs` の対象から外した（段3。このアプリの CSS 差分はもう機械で見張っていない） | トーストを帯（`NoticeBar`）に置き換えること（決めて残す。下記「トーストは残す」参照） |
| `check-mobile-declared` / `check-file-size` / `check-ui-tokens` の対象に登録した（段3） | **表本体**（`CueTable`/`CueRow`/`cells/*`）・`EditorSidebar` の詳細・モバイル編集の見た目作り直し |
| `/qsheet/home`（新トップ・案件を選ぶ）を追加。`/qsheet` の行き先は `routeSwitch.ts` の1行で切り替え（段3） | `EditorSidebar.tsx` / `MicAssignmentCell.tsx` / `CueTable.tsx` / `PreviewModal.tsx`（印刷）/ `OnAirPage.tsx` / `AudioSupportPage.tsx` に残る生の `style={{ fontFamily: "'Roboto Condensed',sans-serif" }}`（`index.html` の Google Fonts はこれらのため外していない） |
| `src/index.css` が `base.css` 経由（→ `tokens-v4.css` → `tokens.css`）を読むようになった（段5 PR8） | 印刷ウィンドウ（`PreviewModal.tsx`）が外部 Google Fonts を読む点の同梱フォント化 |
| LINE Seed JP が有効になった（`tokens-v4.css` の `@import` 経由。上記の直書き箇所は対象外） | 表本体・`EditorSidebar` に残る `rounded-lg` 等の未整理箇所 |
| 外枠の角丸を v4 の役割名（`rounded-control-md` 等）・`--radius` に寄せた（`AppShell`/`Sidebar`/`EditorPage` のヘッダー・情報バー） | |
| **共通シェル（`shared/src/client/shell/`）への載せ替え。** 独自実装だった `Header.tsx`/`Sidebar.tsx` を削除し、`AppShell.tsx` を `SharedAppShell`（`appKey="qsheet"`）を呼ぶ薄いラッパーに置き換えた。メニュー項目は新設の `nav.ts`（3項目・中身は今までと同じ）。`PcOnlyGate`／通知ベル／マニュアル・バージョン履歴・MCPモーダルが使えるようになった | |

- **URL は生かしたまま。** ルーティングの公開URL5本（editor/onair/rundown/prompter/audio）は変更していない。
  ブックマーク・配布済みQR・OBS の出力URL・役割別URL はすべてそのまま動く
  （**本番の業務が止まらないことが最優先**）
- `shared/src/client/tokens-v4.css` の `.dark` が**段5 PR8 から効くようになった**（本番3画面
  ＝進行・ランダウン・プロンプターは `<html class="dark">` で暗い配色のまま動いている。
  切り替えた PR で実ブラウザ／ビルド後 CSS で暗いままであることを確認すること）

## やってはいけないこと（見た目の作り直しが終わるまで）

- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**
- **トーストを帯（`NoticeBar`）に置き換えない。** このアプリは `src/lib/notify.ts` 経由で
  13 か所トーストを使っており、**放送中の「放送同期が切断されました」も含まれる**。
  v4 の3アプリは帯に移ったが、ここは今日のまま。見た目の作り直しのときに寄せる
  （P3 でバレルから外したので、import は深いパス
  `@gmo-onair/shared/src/client/ui/{use-toast,toaster}` を名指しする形になっている。
  `main.tsx` のトースト表示部品は共通シェルとは別に置いたまま — シェルの
  `<NoticeBar />` に統合しないこと）
- 表本体（`CueTable.tsx`・`CueRow.tsx`・`components/editor/cells/*.tsx`）とモバイル専用ファイルは
  **共通シェル載せ替えの対象外**（並行 PR が触るため）。触るのは別 PR で
- `index.html` の Google Fonts（Noto Sans JP / Roboto Condensed）は**まだ外さない**。
  `EditorSidebar.tsx` / `MicAssignmentCell.tsx` / `CueTable.tsx` / `PreviewModal.tsx` /
  `OnAirPage.tsx` / `AudioSupportPage.tsx` が今も `'Roboto Condensed'` を生の `fontFamily` で
  名指ししており、外すとそれらの数字表示が無指定フォントに落ちる
- ⚠️ **本番中に使う4画面（`OnAirPage.tsx`・`RundownPage.tsx`・`PrompterPage.tsx`・
  `AudioSupportPage.tsx`）とそこから呼ばれるコンポーネントには触らない。** `App.tsx` で
  「Full-screen pages without AppShell」と明記された、共通シェルの対象外の別ルート
  （`shared/src/client/shell/` を載せても影響しない・影響してはいけない）

不具合の修正は通常どおり行ってよい。見た目の刷新は表本体（編集画面）以降で順に進める。

## このアプリの中身

- **データ**: `qsheet_documents` テーブルに JSONB で台本全体を保存。同時編集は Yjs（`qsheet_doc_yjs`）
- **連携キー**: GLS番号 ＋ エピソードコード（例 `GLS002-003`）
- **PDF出力**: サーバー側 pdfkit（A4/A3・Noto Sans JP）
- **画面**: `pages/{DashboardPage,EditorPage,OnAirPage,RundownPage,PrompterPage,AudioSupportPage}`
- **シェル**: `components/layout/AppShell.tsx`（`shared/src/client/shell/` を呼ぶ薄いラッパー）＋
  `components/layout/nav.ts`（左メニュー・スマホ下タブの中身）。`Header.tsx`/`Sidebar.tsx` の独自実装は削除済み
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
