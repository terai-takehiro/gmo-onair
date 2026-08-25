# リアルタイムCG — **凍結中（URLのみ・一覧には出さない）**

ベースパス `/awards/`・ポート 5179。

## いまの状態（2026-08-25〜）

このアプリは v4.0.0 の「凍結」（見た目は変えないが URL は生かす）に戻してある。
2026-08〜しばらくは「廃止」（Web サイト・URL のどこからも到達できない）まで一段進めていたが、
「URL を叩けばアクセスできるようにしてほしい」という要望を受けて凍結まで戻した
（ユーザー判断・詳細は `docs/changelog.d/closed-realtime-cg-url-access-60c3n6.md`）。

- **サーバーが配信している。** `server/src/app.ts` の `serveApp('/awards', …)` を戻したので、
  `/awards/*` は通常どおりビルド済み SPA を返す
- **API・Socket.IO も登録している。** `server/src/routes/index.ts` の `createAwardsRoutes()`・
  `createQuizRoutes()`、`server/src/index.ts` の `initAwardsSocketIO()` / `initQuizSocketIO()` /
  `initInteractivePoller()` の呼び出しを戻した
- **本番イメージに入る。** `Dockerfile` に `build-client-awards` ステージと
  `production` ステージへの `COPY` を戻したので、通常のビルドでイメージに入る
- **トップページのタイル・アプリ切替・左メニューには出さない。** `client/.../home/AppTiles.tsx` の
  `EVENT_KEYS` には `awards` を戻していない（上辺バー・アプリ切替・左メニューはそれ以前から
  `frozen: true` で出していない）。**URL を直接知っている・ブックマークしている人だけが開ける**
- `shared/src/client/apps.ts` の `APPS` エントリは廃止のあいだも触っていない。権限モデル
  （`permissionModule: 'awards'`）・権限とメンバー画面の表示・DB のデータビューア
  （`awards_events` 等）はそのまま動いていた

## さらに廃止に戻したいとき

上の3点（`server/src/app.ts` / `server/src/routes/index.ts` / `server/src/index.ts` の関連呼び出し・
`Dockerfile` の `build-client-awards` ステージと `COPY`）を外せばよい。過去の「廃止」時の
コメントは git 履歴（このファイルの1つ前の版）に残っている。

## ホームのタイルにも出したいとき

`client/.../home/AppTiles.tsx` の `EVENT_KEYS` に `awards` を足すだけでよい（画面・API・DB
スキーマのどれも変えていないので、これだけで一覧に出るようになる）。**今回はユーザーが
「URL を叩ければよい」とだけ求めたため、あえて行っていない。**

## 廃止前の決めごと（当時の記録・コードを読むときの参考）

- **見た目は独自完結。** `src/index.css` は `shared` の `tokens.css` を読んでおらず、
  `tailwind.config.ts` も共通 preset を継承していない（自前の CSS 変数・自前の Tailwind 設定）
- **出力画面6本（`/awards/output/*`）は放送に出る映像そのもの。** 認証を通さず、
  1920×1080 固定で描画していた（`?bg=1` で背景あり・`?audio=1` で効果音・`?lang=` で言語）
- **画面**: 操作系 `pages/{CgCockpitPage,ControlPage,OneShotControlPage,QuizStackControlPage,EventEditorPage}` /
  出力系 `pages/{Output,OutputNext,OneShotOutput,OneShotOutputNext,QuizStackOutput,QuizStackOutputNext}Page`
- 送出は OA / NEXT / TAKE / CLEAR。サーバー側は `server/src/contexts/awards/socket.ts` と
  `quiz/socket.ts`
- CG の配色・書体は `src/cg/cg.css` と `src/oneshot/styles/tokens.css` に独立して持っている
- `src/components/ui/` が無く、部品を自前で持っている

## 未確認事項

このセッションでは型検査・ビルド（`client-awards` の `tsc -b && vite build`、`server` の
型検査・`tsc`）までは確認したが、**実サーバーを起動して `/awards/*` に実際にアクセスできることは
未確認**。復活時点でコードそのものは変えていないため動くはずだが、廃止していた期間に
`shared` 側や DB スキーマが変わっていないかは別途確認したほうがよい。
