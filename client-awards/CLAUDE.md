# リアルタイムCG — **廃止（→ 制作技術支援＞テロップCG。コードは参照用に保存のみ）**

⚠️ **2026-09-06 に段F を実行し、「移行中」から「廃止」へ進めた。** 後継の
**制作技術支援のミニアプリ「テロップCG」（`client-techops/src/pages/graphics/`・
`server/src/contexts/graphics/`）が段A〜E で完成し、検証環境で確認できた**ため、
[docs/design/v4/graphics-redesign.md](../docs/design/v4/graphics-redesign.md) §12-5 で
取得済みの承認に基づき、旧アプリの畳み込みを実行した。用語の定義は
[docs/v4-plan.md](../docs/v4-plan.md) の「用語」の節。

ベースパス `/awards/`・ポート 5179（開発サーバーの設定のみ残す。本番では配信しない）。

## いまの状態（2026-09-06〜・段F）

**「URL は生かす」がここで初めて成り立たなくなった。** サーバーの配信・API・Socket.IO・
ビルド対象・画面上の入口をすべて外し、Web サイトのどこからも到達できなくした
（コード自体は今後の参照のため削除せず残す）。

- **サーバーが配信しない。** `server/src/app.ts` の `serveApp('/awards', …)` を外した。
  `/awards/*` は専用の配信が無くなり、案件管理アプリ（ルート `client`）の SPA シェルへの
  フォールバック（実測: HTTP 200・`/` と同一の `index.html`）を経て、その
  クライアント側ルーター（`App.tsx` の `<Route path="*" element={<Navigate to="/" replace />} />`）が
  即座に `/`（ホーム）へ戻す。**文字通りの HTTP 404 ではなく、`check-links.mjs` が言う
  「黙ってホームに戻る壊れリンク」**——旧アプリの機能・見た目は一切表示されない
- **API・Socket.IO を登録していない。** `server/src/routes/index.ts` から `createAwardsRoutes()`・
  `createQuizRoutes()`、`server/src/index.ts` から `initAwardsSocketIO()` / `initQuizSocketIO()` /
  `initInteractivePoller()` の呼び出しを外した（`contexts/awards/`・`contexts/quiz/` 自体は
  ファイルとして残っている。テロップCG側の `contexts/graphics/` は完全に独立した実装なので、
  この撤去による影響はない）
- **本番イメージに入らない。** `Dockerfile` の `build-client-awards` ステージと production
  ステージへの `COPY` を外した。ワークスペース自体は `package.json` に残っている
  （`npm ci --workspaces` の対象・`typecheck:all`/`build:all`/`dev:all` は元から対象外）
- **トップページ・アプリ切替・左メニューには出さない**（移行中のときと同じ。
  `shared/src/client/apps.ts` の `frozen: true` は「一覧に出さない印」として維持）
- **過去実績データは消していない。** `awards_events`・`awards_categories`・`awards_entries`
  等のDBテーブル、`uploads/awards/` の画像・音声ファイルはそのまま残っている。
  テロップCG側の移行ツール（`AwardsMigrationPage.tsx`。設定＞連携＞過去実績の移行・
  system_admin限定）が直接このデータを読むので、`client-awards` が配信されなくなっても
  移行ツールの機能には影響しない
  - ⚠️ **本番の実データを実際に移行する（プレビュー→確認→反映）操作自体は、この
    リポジトリ側の作業のスコープ外。** 本番環境への直接アクセスができないため、
    実データが入っているかどうかもこの環境からは判定できない。system_admin 権限を持つ
    利用者が本番アプリ上で実行する運用上の作業として残っている
- `shared/src/client/apps.ts` の `APPS` エントリは今回も触っていない（前回の廃止と同じ扱い）。
  権限モデル（`permissionModule: 'awards'`）・権限とメンバー画面の表示・DB のデータビューア
  （`awards_events` 等）はそのまま動く

## さらに凍結・移行中へ戻したいとき

上の3点（`server/src/app.ts` / `server/src/routes/index.ts` / `server/src/index.ts` の関連呼び出し・
`Dockerfile` の `build-client-awards` ステージと `COPY`）を戻せばよい。過去に一度
同じ経路（廃止→凍結）を辿った実績があり、そのときの手順はこのファイルの
更に前の版（git 履歴）に残っている。

## ホームのタイルにも出したいとき

`client/.../home/AppTiles.tsx` の `EVENT_KEYS` に `awards` を足すだけでよい（画面・API・DB
スキーマのどれも変えていないので、これだけで一覧に出るようになる。ただし配信を止めた
ままだと開いても 404 になるので、上の配信を戻すことと合わせて行うこと）。

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

## デモ用ダミーデータ（`server/src/shared/db/seed-awards.ts`）

復活させても DB が空のままでは URL を開いても何も映らないため、他の `seed-*.ts`
（`seed-subapps.ts` / `seed-tasks.ts` 等）と同じ仕組みでダミーデータの投入スクリプトを
新設した（開発・検証環境の起動時に自動実行。本番は既存の仕組みどおり `SKIP_SEED=true`
のため入らない。手動投入は `npm run db:seed:awards -w server`）。

- **イベント3件**: 開催中 (`live`) の「GMO ONAiR AWARDS 2026」・終了済み (`closed`) の
  「GMO ONAiR AWARDS 2025」・準備中 (`draft`) の「第3回 GMO ONAiR AWARDS」
- **カテゴリ9本**（直接選出 `direct` 7本・投票 `vote` 2本）・**エントリ計37件**
- **クイズ2問**（正誤つき `quiz` モード1・投票のみ `survey` モード1、選択肢に投票数も投入）
- 開催中イベント (`event_id=1`) は `awards_cue_state`（`step='nominees'`）・
  `awards_oneshot_cue_state`（`is_live=true`）もあらかじめ「表示中」まで進めてあるので、
  `/awards/output/*` を開いた瞬間から実際の画面が見える
- `awards_events` に既にデータがあれば何もしない（冪等・既存データは壊さない）

## 検証状況

型検査・ビルド（`client-awards` の `tsc -b && vite build`、`server` の型検査・`tsc`）に加え、
実サーバー（検証用Postgres）を起動して確認済み: `seed-awards.ts` の投入と再実行時のスキップ、
`GET /awards/events`・`/events/:id`・`/events/:id/cg-status`（`ranking.live=true`・
`oneshot.live=true` を確認）・認証なしの公開エンドポイント `/events/:id/output` がダミーデータを
返すこと、`/awards/*`・`/awards/output/1` が200で返ること。Socket.IO・`interactive-poller` も
正常起動を確認済み。**実ブラウザでの操作確認（CGコックピット・出力画面の見た目）は未実施。**
