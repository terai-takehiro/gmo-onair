# テロップCG 再設計の画面モックアップ

> **状態**: 実装済み（記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: [`../../../graphics-redesign.md`](../../../graphics-redesign.md) の絵。段A〜F を 2026-09-06 に実装済み（`client-techops/src/pages/graphics/`）

**設計の正は [`docs/design/v4/graphics-redesign.md`](../../../graphics-redesign.md)。** ここはその絵。

公開先: https://claude.ai/code/artifact/bf5e785b-0075-459b-ad21-86410c419fde

## 中身

| ファイル | 画面 |
|---|---|
| `Map.dc.html` | 考え方の地図。何をする機能か・3つの場面・4つの語・3つの動詞 |
| `Main.dc.html` | PC ① テロップ一覧（準備・ホーム）。出す順＋右パネルで編集。絞り込み・確認スイッチ・OBS の URL が動く |
| `Editor.dc.html` | PC ③ 新しいテロップ。「＋ テロップ」のメニューと「種類を選ぶ」（旧・部品ライブラリの役目） |
| `Live.dc.html` | PC ② 本番モード（暗い配色）。OA／NEXT／TAKE／CLEAR／行内の 締切・開票 が動く |
| `Settings.dc.html` | PC ④ 設定。出力URL／見た目／同時に出せないもの／連携 の4タブが動く |
| `Mobile.dc.html` | スマホ ⑤ 依頼（ディレクター） |
| `MobileList.dc.html` | スマホ ⑥ 一覧（閲覧のみ・本番中） |
| `canvas.json` | 並べ方と付箋（診断・言葉の対応・各画面の決めごと・決めていただきたいこと） |

サンプルの番組は `native/qsheet-top/` と同じ **東都TV 特番収録「サイエンス・フロンティア」GLS-A002 第7回**。
文言・人名は架空。

## 色・寸法の出どころ

推測ではなく実装から取った値だけを使っている。

- 色・角丸・書体: `shared/src/client/tokens-v4.css`（明るい側と `.dark`。本番モードは進行・ランダウンと同じ暗い側）
- 型スケール: `shared/tailwind.preset.ts`（h1 23 / h2 19 / cardtitle 15 / list 13.5 / sub 12.5 / sub-sm 11.5 / th 11.5 / badge 11 / note 12）
- 共通シェル（上辺バー 64・左メニュー 248）: `native/qsheet-top/Hub.dc.html` の写し
- CG の絵（式典・金）: `client-techops/src/pages/graphics/telopTheme.ts`（紺の面・金の罫・白 #F5F5F5）と
  `docs/design/v4/graphics-design-specs.md`（90% セーフ・文字の階層）

⚠️ **`font-weight` は 400 / 700 / 800 だけ。** LINE Seed JP は 500 / 600 が配信されていない。
⚠️ 書体だけ本物と違う。この試作は外部への通信が Google Fonts しか許されないため、実装と同じ後段
（Noto Sans JP・CG の題字は Noto Serif JP）を読んでいる。

## 組み直し方

`.dc.html` と `canvas.json` を直したあと、`/design` スキルの `seed-canvas.mjs` で組み上げ、同じ URL へ公開し直す。
組み上げたファイルは約 2.5MB（大半がエディタのコード）なのでリポジトリには入れていない（`.gitignore`）。

⚠️ 公開先は**旧形式の単一ページ**（`project/` を持つ Design 型のキャンバスではない）ので、Design 型の作法で `project/canvas.json` と `.dc.html` を送っても反映されない。文言だけ直すときは、公開済みページの `<script id="appifact-doc">` に埋め込まれた `.dc.html`／`canvas.json` に手元と同じ置き換えを施して同じ URL へ公開し直せる（2026-09-22 の `docs/wording.md` ルール11対応はこの方法で公開し直した）。
