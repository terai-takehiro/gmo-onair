# コードレビュー報告（2026-04-28）

## 対象と実施方法
- 対象: リポジトリ内の全ソースコード（`*.ts`, `*.tsx`, `*.js`, `*.jsx`, `*.mjs`, `*.cjs`）
- 対象ファイル数: 459
- 実施した観点:
  - ビルド健全性（workspace build）
  - サーバー単体の型ビルド
  - Lint 実行可否
  - TODO/FIXME 等の未解決マーカー
  - 依存関係の整合性（Tailwind バージョン）

## バージョン確認結果
- ルートアプリバージョン: `2.8.26`
- Node.js: `v20.19.6`
- npm: `11.4.2`

## 主なレビュー結果

### 1) ルート build がフロントエンドで失敗（High）
- 症状: `npm run build` の `@gmo-onair/client` ビルドで PostCSS/Tailwind エラー。
- 原因: `tailwindcss` v4 系が解決されており、PostCSS 設定が v3 形式（`tailwindcss` 直接指定）のまま。
- 影響: CI/CD のフロントエンド build が停止する可能性。
- 推奨対応:
  1. Tailwind を v3 系に固定（lockfile の再生成を含む）
  2. もしくは v4 へ移行し `@tailwindcss/postcss` を導入し各 `postcss.config.js` を更新

### 2) 依存関係の整合性不良（High）
- 症状: `npm ls tailwindcss --depth=2` で `invalid` 表示。
- 原因: 各クライアント `package.json` は `^3.4.16` 指定だが、実解決は `4.2.4`。
- 影響: 環境差異や再現性低下、ビルド不安定化。
- 推奨対応:
  - workspace 全体で Tailwind のメジャーバージョン方針を統一し、`package-lock.json` を整合化。

### 3) Lint 基盤の未整備（Medium）
- 症状: `npm run lint -w client` 実行時、ESLint 9 の flat config (`eslint.config.js`) が見つからず失敗。
- 影響: 静的解析が継続運用できず、コード品質の自動担保が弱い。
- 推奨対応:
  - ESLint 9 に移行するか、ESLint 8 系に揃えるかを決め、設定ファイルを追加。

### 4) TODO が残存（Low）
- 確認できた TODO:
  - `server/src/contexts/interactive/services/scaling.service.ts`
  - `client-interactive/src/pages/AudiencePage.tsx`
- 影響: 仕様の暫定実装が残るリスク。
- 推奨対応:
  - issue 化して解消時期を明確化。

## 補足
- `npm run build -w server` は成功し、サーバーの TypeScript ビルドは現時点で正常。
