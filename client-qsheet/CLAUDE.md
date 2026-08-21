# 制作資料（Qシート） — **v4.1 で凍結を解いた（作り直しは進行中）**

ベースパス `/qsheet/`・ポート 5174。

## いまの状態（v4.1・段3〜）

⚠️ **「凍結解除」は2段階に分けて進めている。段3で解いたのは「アプリ一覧・検査体系上の凍結」だけ**で、
**見た目（トークン・共通シェル）はまだ作り直していない**。混同しないこと。

| 解けたもの（段3） | まだのもの |
| --- | --- |
| `shared/src/client/apps.ts` の `frozen: true` を落とした → 一覧・アプリ切替に出る | `src/index.css` は今も `tokens.css` を直読み（`base.css`/`tokens-v4.css` には未移行） |
| `scripts/check-frozen-css.mjs` の対象から外した（このアプリの CSS 差分はもう機械で見張っていない） | 共通シェル（`shared/src/client/shell/`）への載せ替え |
| `check-mobile-declared` / `check-file-size` / `check-ui-tokens` の対象に登録した | LINE Seed JP・v4 の角丸・v4 の共通部品への置き換え |
| `/qsheet/home`（新トップ・案件を選ぶ）を追加。`/qsheet` の行き先は `routeSwitch.ts` の1行で切り替え | トーストを帯（`NoticeBar`）に置き換えること |

- **URL は生かしたまま。** ルーティングの公開URL5本（editor/onair/rundown/prompter/audio）は変更していない。
  ブックマーク・配布済みQR・OBS の出力URL・役割別URL はすべてそのまま動く
  （**本番の業務が止まらないことが最優先**）
- `shared/src/client/tokens-v4.css` に `.dark` を追加済み（このアプリが `base.css` 経由に
  切り替わったとき、本番の暗い3画面が白飛びしないための予防措置。今はまだ効いていない —
  効くのは `index.css` の import を切り替えた日から）

## やってはいけないこと（見た目の作り直しが終わるまで）

- `src/index.css` の `tokens.css` の import を `tokens-v4.css`（`base.css` 経由）に
  差し替えるのは、**共通シェル・v4 トークンへの移行と同じ PR**で行うこと
  （`.dark` が無いとランダウン・プロンプターの暗い配色が崩れる。段3の時点では対策済みだが、
  切り替えた PR で実ブラウザで暗いままであることを必ず確認する）
- `index.html` に **LINE Seed JP を追加しない**（見た目の作り直しと同じ PR でまとめて行う）
- 共通シェル（`shared/src/client/shell/`）に**まだ載せ替えない**。
  `src/components/layout/{AppShell,Header,Sidebar}.tsx` は残す
- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**
- **トーストを帯（`NoticeBar`）に置き換えない。** このアプリは `src/lib/notify.ts` 経由で
  13 か所トーストを使っており、**放送中の「放送同期が切断されました」も含まれる**。
  v4 の3アプリは帯に移ったが、ここは今日のまま。見た目の作り直しのときに寄せる
  （P3 でバレルから外したので、import は深いパス
  `@gmo-onair/shared/src/client/ui/{use-toast,toaster}` を名指しする形になっている）

不具合の修正は通常どおり行ってよい。見た目の刷新は段5（編集画面）以降で順に進める。

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
