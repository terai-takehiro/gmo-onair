# 隔週キープの数字・資料ビルダーの画面モックアップ

> **状態**: 実装済み（記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: [`../../keep-report.md`](../../keep-report.md) の絵。画面は `client-daily/src/pages/weekly/{keep,deck}/` に実装済み。絵の「事業主体」は描いた時点の語（実装は「計上会社」`entity_code`）

**ロジックの正は [`docs/design/v4/keep-report.md`](../../keep-report.md)。** ここはその絵。

公開先: https://claude.ai/code/artifact/26a5d2e5-87c9-4bb9-a597-9c1631438651

## 中身

| ファイル | 画面 |
|---|---|
| `Main.dc.html` | ウィークリー活動報告 ▸「隔週キープの数字」タブ（BI）。着地・見込の表、推移グラフ、ヨミ表、稼働カレンダー、実施報告、内覧会 |
| `Builder.dc.html` | ウィークリー活動報告 ▸「資料をつくる」タブ。ページ一覧 ／ スライドのキャンバス ／ 部品（ドラッグ・クリックで置く） |
| `Mobile.dc.html` | スマホ ▸ 数字の確認だけ（資料づくりは PC） |
| `SlidePL.dc.html` | 出力する資料 ▸ ①数値報告（8月 着地）。GMO流会議フォーマット Ver.2.5 の見た目 |
| `SlideProject.dc.html` | 出力する資料 ▸ 案件ページ（提案中）。帯・確度・写真・概要・進行表・予定・経路・売上/粗利 |
| `SlideReport.dc.html` | 出力する資料 ▸ ②案件実施報告（ふりかえりから） |
| `DeckMap.dc.html` | 資料の構成表 — 何のページに、何を、ONAiR のどこから |
| `Flow.dc.html` | 仕組み — データの流れと、人の直しが次回に効く輪 |
| `canvas.json` | 並べ方（3ページ: 画面 ／ 資料のテンプレ ／ 仕組み）と付箋（決めごと・訊きたいこと 10 個） |

数字は Box の **`260904_橋口社長隔週キープv2.pptx`**（2026/9/4 開催分）から取った実値。
グラフの月次系列だけは画像から読んだ近似値（画面にも「仮値」と書いてある）。

⚠️ **絵の中の「事業主体」（gss／gscs／gig）は描いた時点の語。** 実装は main の 2026年10月の事業再編に合流して
**「計上会社」`entity_code`（SCS／GSS／GMO）** になった（[keep-report.md](../../keep-report.md) §4）。絵は描き直していない。

## 色・寸法の出どころ

推測ではなく実装から取った値だけを使っている。

- 色・角丸・書体: `shared/src/client/tokens-v4.css` と `shared/src/client/tokens.css`
- 上辺バー・左メニュー: `docs/design/v4/mockups/ShellTopbar.dc.html` / `ShellSideMenu.dc.html`
- 型スケール: `shared/tailwind.preset.ts`（h1 23 / cardtitle 14.5 / list 13.5 / sub 12.5 / sub-sm 11.5 / th 11.5 / badge 11）
- 列幅の7段と行の詰まり: `shared/src/client/ui/row.tsx`
- 週報の画面の並び: `docs/design/v4/mockups/v4-mockup-dailyops.dc.html` のウィークリー活動報告
- スライドの見た目: 260904 の資料そのもの（タイトル 36pt 青・トークスクリプトの帯・表の紺・フッター）

⚠️ **`font-weight` は 400 / 700 / 800 だけ。** LINE Seed JP は 500 / 600 が配信されていない。
スライドの中だけ `BIZ UDPGothic`（Meiryo の代わり。出力する pptx は Meiryo）。

## 組み直し方

`.dc.html` は手で書いたものではなく、`scripts/` に無い作業用の生成スクリプト（`lib.mjs` / `data.mjs` /
`main.mjs` ほか。セッションの作業領域）から出したもの。直すときは **`.dc.html` を直接直してよい**。
`/design` スキルの `seed-canvas.mjs` で `keep-report-screens.html` を組み直し、同じ URL へ公開し直す。
組み上げたファイルは 2.5MB（大半がエディタのコード）なのでリポジトリには入れていない（`.gitignore`）。

## この階層を分けた理由

`v4-mockup-dailyops.dc.html`（131KB）に足すと、`DESIGN_POLICY.md` の上限（1ファイル 25万文字）に
近づくうえ、週報とは別の周期（隔週・月次）の画面が混ざる。レギュラー案件（`regular/`）と同じく独立させた。
