**MCP サーバーのツール一覧（docs/mcp-server.md）を実装と合わせ直した。** qsheet→techops
Phase 4（2026-08-22）で `production` カテゴリに旧名（`*_qsheet` 系）5種が `[非推奨/deprecated]`
として二重登録されたぶんが文書に反映されておらず、「90 種」「production 8 種」のまま取り残さ
れていた（実際は `node scripts/generate-mcp-tools.mjs` の実測で 95 種・production 13 種）。
併せて v4 で新設した機材管理（`client-equipment/`）・計時・視聴者（`client-live/`）向けの MCP
ツールが無いことを確認し（廃止決定ではなく未着手である旨）、文書に明記した。

**機材管理の MCP ツールを新設した（read 5・write 2）。** `list_equipment`/`get_equipment`（台帳検索・
詳細）/`list_equipment_lendings`（貸出履歴）/`list_inventory_checks`/`get_inventory_check`（棚卸し
状況）に加え、`lend_equipment`/`return_equipment`（貸出・返却）を追加した。UI と同じ
`itemService`/`lendingService`/`inventoryService` を再利用している。台帳そのもの（機材の新規登録・
編集・削除）は対象外の MVP スコープ（現場で頻度の高い「どこ？」「貸して」「返ってきた」のみ）。
貸出・返却の権限は HTTP 側の許可（router 既定の reader）より意図的に絞り、`equipment` の editor
以上を要求する。

**制作技術支援（techops）のスケジュール表に書き込みツールを追加した（従来は read のみ）。**
`create_schedule_item`/`update_schedule_item`/`delete_schedule_item` で、既存の
`schedule-items.routes.ts` と同じ粒度で枠を作成・更新・削除できる（台本と違い「提案まで」ではなく
直接書き込む — 単純な CRUD のため）。他の人の編集と競合すると `CONFLICT` を返す。

いずれも `docs/mcp-server.md` を実装に合わせて更新済み（105 種 / 21 カテゴリ）。
