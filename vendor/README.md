# vendor/ — レジストリからそのまま入れられない依存の同梱

## `pptxgenjs-<version>-no-image-size.tgz`

隔週キープの pptx 出力（`server/src/contexts/dailyops/services/keep-pptx*.ts`）が使う
`pptxgenjs` を、**`image-size` の宣言だけを外して**固め直したもの。中身（`dist/`・`types/`）は
レジストリの配布物と 1 バイトも変えていない（`package.json` の `dependencies` から 1 行消し、
出自を `gmoOnairVendored` に書いただけ）。

**なぜ**: pptxgenjs は `image-size` を宣言しているが、配布物のどこからも `require` / `import`
していない（使っていた `getSizeFromImage` はコメントアウト済み・"FIXME: TODO: currently unused"）。
一方 `image-size` は**全版**に High の勧告（GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq・
ICNS/JXL/HEIF の無限ループ）があり修正版が無い（2026-09 時点の最新 2.0.2 まで該当）ので、
CI の `npm audit --omit=dev --audit-level=high` が落ちる。npm の `overrides` は `file:` を
扱えず（依存が「missing」になる）、名前が `image-size` のままでは版を変えても勧告に当たる
（範囲が `*`）ため、宣言そのものを外した tarball を同梱する。**本番イメージにも
`image-size` は入らない**（Dockerfile の `production` ステージも `vendor/` から解決する）。

**作り直し方**: `node scripts/vendor-pptxgenjs.mjs <version>`（レジストリから `npm pack` で取り、
integrity を npm が検証したうえで `package.json` だけ書き換えて再パック。元の integrity と
出来上がりの sha512 を出す）。`server/package.json` の `"pptxgenjs"` を新しいファイルに向けて
`npm install`。

**やめるとき**: pptxgenjs が `image-size` を宣言から外すか、`image-size` に修正版が出たら、
`server/package.json` をレジストリの版（`^4.x`）に戻し、この tgz と
`scripts/vendor-pptxgenjs.mjs` を消す。

| 版 | 元の integrity | 同梱版の sha512 |
| --- | --- | --- |
| 4.0.1 | `sha512-TeJISr8wouAuXw4C1F/mC33xbZs/FuEG6nH9FG1Zj+nuPcGMP5YRHl6X+j3HSUnS1f3at6k75ZZXPMZlA5Lj9A==` | `sha512-a2Gasoroe4DkRGAdN0wAj0/8vmhuV0WPK2hgMtbfxZKX7jwdLQ7bamCUw5T/YW9c1PZrsLvIjOw+yyRwgVVSIw==` |
