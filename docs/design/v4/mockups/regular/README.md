# レギュラー案件の画面モックアップ

**ロジックの正は [`docs/design/v4/regular-series.md`](../../regular-series.md)。** ここはその絵。

公開先: https://claude.ai/code/artifact/4a446d54-0e91-4f90-bbf3-ded76e3d3e2e

## 中身

| ファイル | 画面 |
|---|---|
| `Main.dc.html` | 案件詳細 ▸「回（エピソード）」タブ。収録日ごとに回がまとまる |
| `Overview.dc.html` | 案件詳細 ▸ 概要。レギュラーのときの事実の帯・シリーズ共通の工程・次の収録回 |
| `AddEpisodes.dc.html` | 回をまとめて作る（頻度 × 期間 × 本数）。**押す前に件数を出す** |
| `Billing.dc.html` | 月末締めの請求をまとめる |
| `Ledger.dc.html` | 案件台帳でレギュラーを見つける（継続区分の列と絞り込み） |
| `Mobile.dc.html` | スマホ ▸ 回 |
| `canvas.json` | 並べ方と付箋（各画面の決めごとを7つ） |

実データは本番の **GLS-A007「インテリジェンス」**（GMOサムライコンテンツスタジオ）を使っている。
2026-09-01 時点で `recurrence='regular'` が入っている**唯一の案件**。

## 色・寸法の出どころ

推測ではなく実装から取った値だけを使っている。

- 色・角丸・書体: `shared/src/client/tokens-v4.css` と `shared/src/client/tokens.css`
- 型スケール: `shared/tailwind.preset.ts`（h1 23 / h2 19 / cardtitle 14.5 / list 13.5 / sub 12.5 / sub-sm 11.5 / th 11.5 / badge 11 / note 12）
- 列幅の7段（56/72/96/128/160/200/240）と行の詰まり（11px 16px・表頭 9px 16px）: `shared/src/client/ui/row.tsx`
- ヘッダー・ステージ帯・タブの寸法: `client/src/contexts/sales/pages/projectDetail/DetailHeader.tsx`
- 回の表と状態の導出: `client/src/contexts/tasks/components/EpisodesPanel.tsx`

⚠️ **`font-weight` は 400 / 700 / 800 だけ。** LINE Seed JP は 500 / 600 が配信されておらず、
書いても黙って落ちる（`tokens-v4.css` の注記）。

## 組み直し方

`.dc.html` と `canvas.json` を直したあと、`/design` スキルの `seed-canvas.mjs` で
`regular-series-screens.html` を作り直し、同じ URL へ公開し直す。
組み上げたファイルは 2.5MB（大半がエディタのコード）なのでリポジトリには入れていない（`.gitignore`）。

## この階層を分けた理由

`docs/design/v4/mockups/v4-mockup-main.dc.html` は 674KB で、`DESIGN_POLICY.md` が
「1ファイル 25万文字を超えたらアプリ単位に割る」と決めている上限をすでに超えている。
足すと固まるので、レギュラーは独立したファイル群にした。
