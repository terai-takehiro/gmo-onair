**制作資料（Qシート）を v4 共通シェルに載せ替えた。** 段5 PR8 で外枠の見た目だけ v4 トークンへ
寄せていたが、`AppShell`/`Header`/`Sidebar` は独自実装のままで、機材管理・日常業務と枠が
揃っていなかった（メニューの権限フィルタ・通知ベル・マニュアル/バージョン履歴/MCPモーダル・
PC専用ゲートなど、共通シェルが持つ機能が使えていなかった）。`client-qsheet/src/components/layout/`
の独自 `AppShell.tsx`/`Header.tsx`/`Sidebar.tsx` を削除し、`shared/src/client/shell/` の
`AppShell`（`appKey="qsheet"`）を呼ぶ薄いラッパーに置き換え、新設した `nav.ts`
（メニュー3項目・スマホ下タブ3本。中身は旧 `Sidebar.tsx` と同じ）と既存の `pcOnlyScreens.ts`
（`QSHEET_PC_ONLY`。編集画面・本番3画面はPC専用のまま）を渡すようにした。
`scripts/check-shared-wiring.mjs` の `V4_APPS` に `client-qsheet` を追加（`<Toaster />` 期待値
1個は変更なし。放送中の切断通知を含む13か所のトースト機能は今までどおり残す）。
**本番中に使う `OnAirPage`/`RundownPage`/`PrompterPage`/`AudioSupportPage` の4ファイルは
1行も変更していない**（`App.tsx` の「Full-screen pages without AppShell」ルートのまま。
`git diff --stat origin/main` で無変更を確認）。
検証: `npm run typecheck:all` / `npm run lint` / `npm run test` OK。
