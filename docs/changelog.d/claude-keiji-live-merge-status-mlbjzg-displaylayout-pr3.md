**計時・視聴者 表示レイアウト機能のエディタUI（PR3）を `client-techops` に追加した。**
`docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md` §6・§7に沿い、
`/techops/live/:ownerKey/timers/:timerId/layout`（レイアウトエディタ・PC専用）と
`/techops/live-display-templates`（テンプレートライブラリ・スマホ対応）を新設した
（設計書は執筆時点の `client-qsheet`/`/qsheet/` 前提だが、その後の改名に合わせ
`client-techops`/`/techops/` で実装した）。エディタは16:9キャンバス上で要素カード
（タイマー・YouTube・Jstream・Zoom・Teams・合計）をポインタキャプチャでドラッグ・
リサイズし、右サイドバーで表示ON/OFF・選択要素のサイズ数値入力・背景明暗を操作できる。
保存は`PUT /:id/layout`・「未設定に戻す」は`DELETE /:id/layout`（PR1で実装済み）を呼ぶ。
プレビュー枠は設計§6-2どおり`DisplayCanvas`（PR2）で直近保存分だけを描画し、ドラッグ中の
値は反映しない。テンプレートライブラリは一覧・検索・簡易サムネイル・適用・削除
（適用済みタイマーの表示は変わらない旨を確認ダイアログに明記）・`?fromTimer=`付きのときだけ
出る「現在のレイアウトを保存」タイルを持つ。権限は`qsheet`の`reader`/`manager`
（`LiveTimerAdminPage.tsx`の`canManage`パターンを踏襲）。`LiveTimerAdminPage.tsx`の
タイマー一覧に「レイアウト編集」への導線を追加。表示画面（`client-live/`配下）・
`server/`配下・`shared/tests/liveDisplayContract.test.ts`はいずれも無変更（`client-techops/`
のみが対象）。検証: `npm run typecheck:all` / `npm run lint` / `npm run test`
（liveDisplayContract.test.ts含め1452件green）、`npm run build:changed`でのビルド成功、
`npm run verify:up`の実Postgres・実サーバーで`PUT`→無認証`GET`の往復・reader権限での
403・テンプレート作成→適用→使用件数反映→削除後も適用済みタイマーの表示が
変わらないことを確認。
