制作資料 v4 段10（MCP）を実装した。外部の AI（Claude 等）から進行台本・スケジュール表を読み、
提案までを置けるようにする8ツール（read 5・write 3）を `server/src/contexts/mcp/tools/production.tools.ts`
に追加した。**利用者判断どおり「提案まで」**にしてあり、`propose_qsheet_draft` は
`qsheet_ai_proposals`（段7）に1行置くだけで、台本そのもの（Yjs の `data`）はサーバーから
一切書き換えない。台本への取り込みは今までどおり編集画面の「AIの提案」から人が行う。
**制作資料のツールだけは静的APIキーを拒否し OAuth actor 専用にした**（`production.access.ts` の
`requireProductionActor()`。台本は文書単位の秘匿で、共有 actor には見える範囲を定義できないため）。
migration は `223_qsheet_mcp.sql`（`qsheet_ai_proposals` に MCP 由来を見分ける3列・
`qsheet_documents` に冪等キー1列を ALTER で追加。新規テーブルは無し）。
`propose_qsheet_draft` の payload 検証は、設計書 05-mcp.md が想定していた blockRef 汎用形ではなく、
段7で既に実装済みの取り込み側（`client-qsheet/src/lib/applyProposal.ts`）が実際に読める専用形
（`ScriptOutlineProposal`/`ScriptLinesProposal`）に合わせて作った（`server/src/contexts/qsheet/ai/mcpProposal.ts`）。
`shared/tests/qsheetDraftValidate.test.ts` で検証関数と実際の取り込み関数の往復まで固定してある。
`node scripts/generate-mcp-tools.mjs` で 82→90 種・19→20 カテゴリを確認し、`docs/mcp-server.md` を更新した。
検証: `npm run typecheck` / `npm run lint` / `npm run test`（1270件）/ `node scripts/check-collab-parity.mjs` OK。
`npm run verify:up` はポート競合のため未実施（migration はレビューで確認）。
