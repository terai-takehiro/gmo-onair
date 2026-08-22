**リアルタイムCG（`client-awards`）を廃止した。コードは保存し、配信だけ止めた。**
今後の開発で参照する可能性があるためコードは削除せず、Webサイト・URLからは
完全に到達できない状態にした。①サーバーの静的配信（`/awards` の `serveApp` 呼び出し）
とAPIルート（`createAwardsRoutes`）・Socket.IO（`initAwardsSocketIO` /
`initQuizSocketIO` / `initInteractivePoller`）の初期化を外し、`/awards/*` は他の
未定義パスと同じく404になる。②Dockerfileの `build-client-awards` ステージと本番
イメージへのCOPYを外し、本番ビルドの対象からも外れる。③トップページのタイル
（`home/AppTiles.tsx` の `EVENT_KEYS`）からも削除し、画面上のどこにも入口が無い状態
にした（上辺バー・アプリ切替・左メニューはこれ以前から `frozen: true` で非表示）。
`shared/src/client/apps.ts` の登録・権限モデル（`permissionModule: 'awards'`）・DB
スキーマ・データビューアはそのまま残してあり、権限とメンバー画面などは今までどおり
動く。あわせて `dev:all` / `dev:frozen` / `typecheck:all` / `build:all` /
`build:render` / `check:frozen` / `verify:ui` からも `client-awards` を外した
（`npm run workspaces` には残す。ローカルで `npm run dev -w client-awards` は今まで
どおり動くので、参照したいときはそのまま起動できる）。復活させる手順・廃止前の
決めごとは `client-awards/CLAUDE.md` に集約した。
検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。
