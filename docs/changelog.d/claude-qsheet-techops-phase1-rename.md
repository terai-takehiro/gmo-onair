**制作技術支援（qsheet）のディレクトリ名を `client-qsheet/` → `client-techops/` に改名した
（移行計画Phase 1・内部限定）。** ベースパス `/qsheet/`・`AppKey`・`permissionModule`・
Socket.IOネームスペース・DBテーブル・MCPツール名は変更していない（表示名「制作技術支援」は
既に改名済みだったが内部識別子だけ据え置かれていた不一致の一部を解消。詳細は
[docs/reviews/qsheet-techops-migration-plan.md](../reviews/qsheet-techops-migration-plan.md)）。
`git mv` によるディレクトリ本体の移動に加え、root `package.json`・`Dockerfile`（ビルドステージ
名・COPYパス。アップロードディレクトリ `/app/uploads/qsheet` は意図的に不変）・
`server/src/app.ts` の静的マウントのディレクトリパス（URLプレフィックスは不変）・
`scripts/*.mjs` 各種検査スクリプトのパス文字列とベースライン/許容リストキー・
`QSHEET_PC_ONLY` 等のTypeScript識別子（`TECHOPS_PC_ONLY` 等へ）を更新。
マルチエージェント実装後の手動監査で、`shared/tests/*.test.ts`（14ファイル）の
ワークスペース境界をまたぐ相対importパスなど、当初のタスク分割から漏れていた
参照を47ファイルぶん追加で修正し、`package-lock.json` に残った孤児エントリも除去した。
検証: `npx tsc -b`（全ワークスペース）0エラー、`npm run test`（1452件）全通過、
`npm run lint` 0エラー（warning 59件・着手前と同数）、`npm run build`（client-techops・
server）成功。Dockerの実ビルドはこの環境にdockerデーモンが無く未実施
（`npm run build` の成功と目視レビューで代替確認）。
Phase 2以降（ベースパス・`AppKey`・Socket.IO切替・本番URL）は未着手のまま
（本番アクセス不可のためこの環境では検証しきれず、着手には追加判断を要する）。
