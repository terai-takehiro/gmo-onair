# リアルタイムCG — **廃止済み（コードのみ保存）**

ベースパス（廃止前）`/awards/`・ポート 5179。

## いまの状態（2026-08〜）

このアプリは**機能として廃止した**。v4.0.0 の「凍結」（見た目は変えないが URL は生かす）
からさらに一段進めて、**Web サイト・URL のどこからも到達できない**状態にしてある。
ただし**コードは削除していない** — 今後の開発で参照する可能性があるための保存。

- **サーバーが配信していない。** `server/src/app.ts` の `serveApp('/awards', …)` を外した
  ので、`/awards/*` は他の全ルートと同じく 404（SPA の catch-all にも当たらない）
- **API・Socket.IO も登録していない。** `server/src/routes/index.ts` の `createAwardsRoutes()`、
  `server/src/index.ts` の `initAwardsSocketIO()` / `initQuizSocketIO()` /
  `initInteractivePoller()` の呼び出しを外した（中身のファイルは `server/src/contexts/awards/`
  `server/src/contexts/quiz/` にそのまま残る。quiz は awards の QuizStack 画面専用）
- **本番イメージに入らない。** `Dockerfile` の `build-client-awards` ステージと
  `production` ステージへの `COPY` を外したので、ビルドもされずイメージにも入らない
- **トップページのタイルからも外した。** `client/.../home/AppTiles.tsx` の `EVENT_KEYS`
  から `awards` を削除（上辺バー・アプリ切替・左メニューはこれより前から `frozen: true`
  で既に出していなかった）
- **`shared/src/client/apps.ts` の `APPS` エントリはあえて残した。** 権限モデル
  （`permissionModule: 'awards'`）・権限とメンバー画面の表示・DB のデータビューア
  （`awards_events` 等）はそのまま動く。**壊す理由が無いものは触っていない**

## 復活させたいとき

上の5点（`server/src/app.ts` / `server/src/routes/index.ts` / `server/src/index.ts` /
`Dockerfile` / `client/.../home/AppTiles.tsx` の `EVENT_KEYS`）を元に戻すだけでよい。
画面・API・DB スキーマのどれも変えていないので、これだけで今日と同じ動作に戻る。

## 廃止前の決めごと（当時の記録・コードを読むときの参考）

- **見た目は独自完結。** `src/index.css` は `shared` の `tokens.css` を読んでおらず、
  `tailwind.config.ts` も共通 preset を継承していない（自前の CSS 変数・自前の Tailwind 設定）
- **出力画面6本（`/awards/output/*`）は放送に出る映像そのもの。** 認証を通さず、
  1920×1080 固定で描画していた（`?bg=1` で背景あり・`?audio=1` で効果音・`?lang=` で言語）
- **画面**: 操作系 `pages/{CgCockpitPage,ControlPage,OneShotControlPage,QuizStackControlPage,EventEditorPage}` /
  出力系 `pages/{Output,OutputNext,OneShotOutput,OneShotOutputNext,QuizStackOutput,QuizStackOutputNext}Page`
- 送出は OA / NEXT / TAKE / CLEAR。サーバー側は `server/src/contexts/awards/socket.ts` と
  `quiz/socket.ts`（どちらも呼び出しを外しただけでファイルは残る）
- CG の配色・書体は `src/cg/cg.css` と `src/oneshot/styles/tokens.css` に独立して持っている
- `src/components/ui/` が無く、部品を自前で持っている
