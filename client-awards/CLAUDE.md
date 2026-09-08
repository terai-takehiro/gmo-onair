# client-awards — リアルタイムCG（廃止・コードは参照用に保存のみ）

2026-09-06 に**廃止**。後継は制作技術支援のミニアプリ「テロップCG」（`client-techops/src/pages/graphics/`・
`server/src/contexts/graphics/`。[graphics-redesign.md §13](../docs/design/v4/graphics-redesign.md)）。
「廃止」の定義は [docs/v4-plan.md](../docs/v4-plan.md) の「用語」。経緯は [docs/reviews/techops-build-log.md](../docs/reviews/techops-build-log.md)。

## 廃止の事実（Web サイトのどこからも到達できない）

- **配信しない**: `server/src/app.ts` に `serveApp('/awards', …)` が無い。`/awards/*` は案件管理の SPA にフォールバックし `/` へ戻る
- **API・Socket.IO を登録しない**: `server/src/routes/index.ts` に `createAwardsRoutes()`/`createQuizRoutes()`、`server/src/index.ts` に
  `initAwardsSocketIO()`/`initQuizSocketIO()`/`initInteractivePoller()` が無い。**例外は `/awards/images/*` の読み取り専用配信だけ**
  （`createAwardsImageRoutes()` → `imageServingRouter`）— 移行済みランキングの `photoUrl` が `/api/v1/internal/awards/images/<file>` を指すため
- **ビルドしない**: `Dockerfile` に `build-client-awards` ステージが無い。`typecheck:all`/`build:all`/`dev:all` の対象外
  （`package.json` の `workspaces` には残る＝`npm ci` の対象）
- **入口が無い**: `shared/src/client/apps.ts` の `awards` は `frozen: true`（一覧に出さない印）、ホームの `AppTiles.tsx` は `EVENT_KEYS = []`
- ポート 5179 は開発サーバーの設定として残るだけ

## 残っているもの

- コード `client-awards/src`（操作系 `pages/{CgCockpit,Control,OneShotControl,QuizStackControl,EventEditor,Dashboard,QuizList,QuizEdit}Page.tsx`・
  出力系 `/awards/output/*` 6本）。見た目は独自完結（`src/index.css` は shared の tokens を読まず、`tailwind.config.ts` も preset を継承しない。
  CG の配色は `src/cg/cg.css`・`src/oneshot/styles/tokens.css`）。`server/src/contexts/{awards,quiz}` もファイルのみ残る
- **DB の過去実績**（`awards_events`・`awards_categories`・`awards_entries` 等）と `uploads/awards/`（Docker volume）。
  テロップCGの移行ツール（`AwardsMigrationPage.tsx`。設定＞連携・system_admin）が直接読む。**本番の実データの移行は
  system_admin が本番アプリ上で行う**（この環境からは実行できない）
- 権限区画 `permissionModule: 'awards'` と権限画面の表示はそのまま
- ダミーデータ `server/src/shared/db/seed-awards.ts`（開発・検証の起動時に自動。`npm run db:seed:awards -w server`。`awards_events` にデータがあれば何もしない）

## 戻したいとき（凍結・移行中へ）

`server/src/app.ts` の `serveApp('/awards', …)`、`server/src/routes/index.ts` の `createAwardsRoutes()`/`createQuizRoutes()`、
`server/src/index.ts` の `init*` 3本、`Dockerfile` の `build-client-awards` ステージと `COPY` を戻す。ホームに出すなら
`client/src/contexts/platform/pages/home/AppTiles.tsx` の `EVENT_KEYS` に `'awards'`（配信を戻さないと開けない）。
