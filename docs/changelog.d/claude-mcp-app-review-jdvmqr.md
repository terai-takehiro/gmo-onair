**MCP サーバーのツール一覧（docs/mcp-server.md）を実装と合わせ直した。** qsheet→techops
Phase 4（2026-08-22）で `production` カテゴリに旧名（`*_qsheet` 系）5種が `[非推奨/deprecated]`
として二重登録されたぶんが文書に反映されておらず、「90 種」「production 8 種」のまま取り残さ
れていた（実際は `node scripts/generate-mcp-tools.mjs` の実測で 95 種・production 13 種）。
併せて v4 で新設した機材管理（`client-equipment/`）・計時・視聴者（`client-live/`）向けの MCP
ツールが無いことを確認し（廃止決定ではなく未着手である旨）、文書に明記した。コード（`server/`
`client/public/mcp-tools.json`）に変更はない。
