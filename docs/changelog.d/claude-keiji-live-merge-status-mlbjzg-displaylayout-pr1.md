**計時・視聴者 表示レイアウト機能のスキーマ＋APIを追加した（PR1・表示画面ファイルには一切触れていない）。**
`docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md` に沿い、独立コピー方式
（テンプレート編集がタイマー個別レイアウトへ波及しない設計）で `liveops_display_templates`・
`liveops_timer_display_layouts` の2テーブルを新設（migration 233）。`timers.routes.ts` に
無認証の `GET /:id/layout`（既存 `GET /:id/display` の生命線には触れず別ルートへ分離）と
認証必須（`qsheet` manager）の `PUT`/`DELETE /:id/layout` を追記し、
`display-templates.routes.ts`（一覧・CRUD・タイマーへの適用）を新設して `liveops/index.ts`
にマウントした。既存の固定3パターン表示（`TimerDisplayPage.tsx` 等）は今回のPRでは一切変更していない。
検証: `npm run typecheck` / `npm run lint` / `npm run test`（`liveDisplayContract.test.ts` 5件含め green）OK。
