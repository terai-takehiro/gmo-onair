**技術資料アプリ（`client-techsheet/`）を完全に削除した**（制作資料へのマージに向けて、内容を作り直すため）。
クライアント（`client-techsheet/`）・サーバー側コンテキスト（`server/src/contexts/techsheet/`）・
ルーティング（`/techsheet/*`）を削除し、DB は新しい migration（211）で `techsheet_documents`
テーブルと `techsheet` を module に持つ権限行（`user_permissions` / `permission_role_modules`）を
落とした。あわせてアプリ登録（`shared/src/client/apps.ts`）・権限区画（`ROLE_MODULES` 等）・
案件詳細「当日」タブの導線・データビューアの表・CI/lint スクリプト・Dockerfile・
`package.json` のワークスペース定義など、技術資料アプリへの参照をすべて外した。
検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。
