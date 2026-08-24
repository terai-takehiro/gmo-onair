**制作技術支援（techops）のスケジュール表 MCP に、枠（項目）だけでなく表そのもの・列の書き込みツールを追加した。**
これまで `create_schedule_item`/`update_schedule_item`/`delete_schedule_item`（2026-08 新設）で
枠は作れたが、スケジュール表そのもの（`qsheet_schedules`）と列（`qsheet_schedule_columns`、
会場/支度/運営の3グループ）は画面で先に用意しておく必要があった。`create_schedule`/`update_schedule`
（表そのもの）と `create_schedule_column`/`update_schedule_column`/`delete_schedule_column`/
`reorder_schedule_columns`（列の追加・更新・削除・並べ替え）を追加し、表・列・枠の3段が揃った
ので、新しい日のスケジュール表を1本まるごと（列も含めて自由に）MCP だけで組み立てられる。
既存の HTTP ルート（`schedules.routes.ts`/`schedule-columns.routes.ts`）と同じ粒度の単純な CRUD
のため台本と違い「提案まで」ではなく直接書き込む。表そのものの削除（`delete_schedule`）は
共有先がいる資料への影響が大きいため対象外（引き続き画面から行う）。`gate.ts` の権限ゲートは
既存の枠 CRUD と揃え、`qsheet` の editor 以上を要求する。`docs/mcp-server.md` を実装に合わせて
更新済み（111 種 / 21 カテゴリ、production 22 種）。
