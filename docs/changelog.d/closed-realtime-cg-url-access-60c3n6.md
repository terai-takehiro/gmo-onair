**廃止したリアルタイムCG（client-awards）を「URLを叩けばアクセスできる」状態に戻した**（ユーザー要望「クローズしたリアルタイムCGですがURLを叩けばアクセスできるようにしてもらえますか」）。
2026-08〜「廃止」（サーバー配信・API・Socket.IO・ビルド対象・トップページの入口をすべて外し、Webサイトのどこからも到達できない状態）にしていたが、`docs/v4-plan.md` の用語でいう一段手前の「凍結」（URLは生かすが、トップページのタイル・アプリ切替・左メニューには出さない）へ戻した。
`client-awards/CLAUDE.md` の「復活させたいとき」に書かれていた手順のうち、`server/src/app.ts` の `serveApp('/awards', …)`・`server/src/routes/index.ts` の `createAwardsRoutes()`/`createQuizRoutes()`・`server/src/index.ts` の `initAwardsSocketIO()`/`initQuizSocketIO()`/`initInteractivePoller()`・`Dockerfile` の `build-client-awards` ステージと `production` への `COPY` の4点を戻した。
`client/.../home/AppTiles.tsx` の `EVENT_KEYS` へ `awards` を戻す5点目だけは行わず、トップページのタイル・アプリ切替・左メニューには出さないままにした（コード自体も frozen:true のままのため、これらの画面には元々出ない）。ホームタイルにも出したい場合は別途対応が必要。
検証: `client-awards` の型検査・`vite build`、`server` の型検査・`tsc` ビルドが通ることを確認済み（実サーバー起動・実ブラウザでの `/awards/*` アクセス確認はこのセッションからは未実施）。
