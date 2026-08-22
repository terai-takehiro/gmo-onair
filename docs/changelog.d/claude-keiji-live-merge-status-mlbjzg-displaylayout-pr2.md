**計時・視聴者 表示レイアウト機能の表示画面（`TimerDisplayPage.tsx`）対応を追加した（PR2）。**
`docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md` に沿い、共有レンダラー
`shared/src/client/live/{displayLayout,DisplayCanvas}.tsx` を新設し、`TimerDisplayPage.tsx`
にマウント時1回だけの `GET /:id/layout` 取得を追加した。レイアウトが未設定・不正な形の
ときは既存の固定3パターン描画（1行も変更していない）にフォールバックする。レビューで
見つかった2件を修正: ①要素単位のvalidateが無く不正な要素1件で表示画面がクラッシュしうる
欠陥（`isValidDisplayElement`を追加・`DisplayCanvasBoundary`で二次防御）、②赤フェーズの
色がCSSカスケードによる本来のパルス＋グローと食い違っていた欠陥（同じ値を`DisplayCanvas`
に埋め込みスタイルとして複製）。あわせて、①の是正として `server/src/contexts/liveops/
routes/timers.routes.ts` の `PUT /:id/layout`（PR1で追加済み）にも同じ要素単位validateを
追加した（設計書のPR2スコープ表では想定していなかった`server/`側の追加変更。qsheet
manager権限で直接APIを叩けば不正なレイアウトを保存できてしまう穴を閉じるための
意図的な逸脱）。`shared/tests/liveDisplayContract.test.ts`の5項目・既存の2本のfetch文字列・
`App.tsx`/`client-live/src/lib/socket.ts`/`hooks/useTimer.ts`はいずれも無変更。
検証: `npm run typecheck:all` / `npm run lint` / `npm run test`（liveDisplayContract.test.ts含め
1452件 green）、`npm run verify:up`の実Postgres・実サーバーでレイアウト未設定/設定済み
タイマーそれぞれの`GET /:id/display`（既存の生命線）が無変更で動作することを確認。
