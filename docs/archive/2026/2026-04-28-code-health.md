# コード健全性レビュー記録（2026-04-28 codex フルレビュー）

CLAUDE.md から詳細を切り出したもの。当時のフルレビューで見つかった課題と方針。

## 依存関係のバージョン整合性
- `package.json` の宣言と `package-lock.json` の解決を必ず一致させる。当時 `tailwindcss` を
  `^3.4.16` と宣言したまま lockfile 上は `4.x` 系が解決されており、`npm ls tailwindcss` が
  `invalid` を返す状態が放置されていた。
- ライブラリのメジャーバージョンを上げる際は workspace 全体（7 クライアント + server + shared）
  で同時に更新し、関連設定（PostCSS / Vite plugin / Tailwind preset 等）も同じコミット内で揃える。
- CI/手元で `npm ls <主要パッケージ> --depth=2` を定期確認し、`invalid` / `extraneous` を検知
  したらその場で潰す。

## ビルド関連設定の同期
- Tailwind v3 → v4 のように PostCSS API が変わるメジャー更新では `postcss.config.js` を必ず
  同時更新する。v4 系は `@tailwindcss/postcss` を経由する形式で、v3 形式のまま放置すると
  フロントエンド build が停止する。
- 「ローカルでは動いた」だけで push しない。`npm run build`（ルート、全 workspace 一括）が
  通ることを最低ラインの確認項目とする。

## Lint 基盤の維持
- ESLint 9（flat config）に統一するか 8 系で揃えるかをまず決め、`shared/` 配下に共通プリセット
  を置いて全 workspace から参照する形に集約する。
- workspace 単位 lint コマンドが設定ファイル不在で即落ちしている状態を放置しない。

## TODO / FIXME の管理
- ソースに `TODO` / `FIXME` を残す場合は必ず GitHub Issue 番号（または期限）を併記する
  （例: `// TODO(#123): 実サーバースペック判定`）。
- ハードコード値（プラン名・言語コード等）はコメントだけでなく設定ファイル / 環境変数 /
  DB マスター化して根本的に外出しする方針を優先。

## 定期セルフレビュー
- 大きめのリリースの前後で `docs/reviews/` に簡潔なレビューメモを残す運用を継続する。
- レビューで検出した High/Medium 課題は README の「コード健全性 / 既知の課題」セクションに
  反映し、未解消であることを可視化する。
