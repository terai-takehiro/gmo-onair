# 運営マニュアル（新ミニアプリ）の画面モックアップ

> **状態**: 設計（未実装）
> **最終確認**: 2026-09-12
> **位置づけ**: [`../../../production-manual.md`](../../../production-manual.md) の絵。実装はまだ1行も書いていない

**設計の正は [`docs/design/v4/production-manual.md`](../../../production-manual.md)。** ここはその絵。

公開先: https://claude.ai/code/artifact/55c1ef9e-29ad-45ec-909d-97282eb00341

## 中身

| ファイル | 画面 |
|---|---|
| `Map.dc.html` | 考え方の地図。差し込む／置く／書き出す・4つの語・画面5枚 |
| `Main.dc.html` | PC ① 冊子一覧 `/techops/manuals`。状態の絞り込みが動く |
| `Editor.dc.html` | PC ② 編集（A4横のキャンバス）。ブロックを押すと選べて右パネルが変わる・ズーム・凍らせる切替が動く |
| `Insert.dc.html` | PC ③ 差し込む（②の左パネル）。レゴのカタログ。カードと出す項目の選択が動く |
| `Text.dc.html` | PC ② の右パネル「書式」。書体・大きさ・太さ・行間・字間・長体・色・袋文字・影・グラデーション・縦書きが**実際に紙面に効く** |
| `Preview.dc.html` | PC ④ 仕上がりと PDF `/techops/manuals/:id/preview`。範囲・つけるもの・出す前の検査 |
| `Sheet.dc.html` | 出来上がりの1枚（A4横・実寸 1123×794 px ＝ 297×210 mm）。そのまま PDF の1ページ |
| `Mobile.dc.html` | スマホ ⑤ 閲覧（見るだけ＋PDF を開く）。章・ページ送りが動く |
| `canvas.json` | 並べ方と付箋（なぜ要るか・言葉の決めごと・各画面の決めごと・決めていただきたいこと7件・データの持ち方・作る順） |

サンプルの案件は `native/qsheet-top/`・`native/telop-cg/` と同じ
**東都TV 特番収録「サイエンス・フロンティア」GLS-A002 第7回**。文言・人名・電話番号は架空。

## 色・寸法の出どころ

推測ではなく実装から取った値だけを使っている。

- 色・角丸: `shared/src/client/tokens-v4.css`（`#005bac` `#f7f8fa` `#e6e9ed` `#1a1d24` `#5d6470` `#197a4b` `#c2410e` `#c7243a`）
- 型スケール: `shared/tailwind.preset.ts`（h1 23 / h2 19 / cardtitle 15 / list 13.5 / sub 12.5 / sub-sm 11.5 / badge 11）
- 共通シェル（上辺バー 64・左メニュー 248）: `native/telop-cg/Main.dc.html` の写し
- A4横の実寸: 297 × 210 mm ＝ 1123 × 794 px（96 px/inch）。`Sheet.dc.html` は `print: "fixed"`

⚠️ **`font-weight` は 400 / 700 / 800 だけ。** LINE Seed JP は 500 / 600 が配信されていない。
⚠️ 書体だけ本物と違う。この試作は外部への通信が Google Fonts しか許されないため、
実装と同じ後段（Noto Sans JP・明朝は Noto Serif JP・欧文の長体は Roboto Condensed）を読んでいる。

## 組み直し方

`.dc.html` と `canvas.json` を直したあと、`/design` スキルの `seed-canvas.mjs` で組み上げ、同じ URL へ公開し直す。
組み上げたファイルは約 2.7MB（大半がエディタのコード）なのでリポジトリには入れていない（`.gitignore`）。
