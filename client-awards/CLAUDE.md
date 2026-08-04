# リアルタイムCG — **v4.0.0 のスコープ外（凍結）**

ベースパス `/awards/`・ポート 5179。

## 凍結の意味（v4 の決定事項）

このアプリは **v4.0.0 では作り直しません**。今日と同じ見た目・同じ動作を保ちます。

- **URL は生かす。** ルーティングは変更しない。ブックマーク・配布済みQR・OBS の出力URL・
  役割別URL はすべてそのまま動く（**本番の業務が止まらないことが最優先**）
- **トップページのアプリ一覧・アプリ切替からは外す**（v4 のランチャーに載せない）
- **見た目を変えない。** `shared/src/client/tokens.css` を読み続ける。
  v4 の色・書体は `tokens-v4.css` 側にあり、このアプリには入らない

## やってはいけないこと

- `src/index.css` の `tokens.css` の import を `tokens-v4.css` に**差し替えない**
- `index.html` に **LINE Seed JP を追加しない**（v4 の書体はこのアプリに入れない）
- 共通シェル（`shared/src/client/shell/`）に**載せ替えない**。
  `src/components/layout/{AppShell,Header,Sidebar}.tsx` は残す
- v4 の共通部品（`Row` / `Money` / `DateRange` など）で**既存画面を書き換えない**

不具合の修正は通常どおり行ってよい（見た目の刷新だけを止めている）。
v4.1 以降で順に v4 へ載せ替える。

## このアプリの中身

- **画面**: 操作系 `pages/{CgCockpitPage,ControlPage,OneShotControlPage,QuizStackControlPage,EventEditorPage}` /
  出力系 `pages/{Output,OutputNext,OneShotOutput,OneShotOutputNext,QuizStackOutput,QuizStackOutputNext}Page`
- **出力画面6本（`/awards/output/*`）は放送に出る映像そのもの。** 認証を通さず、1920×1080 固定で描画する。
  **絶対に見た目を変えないこと**（`?bg=1` で背景あり・`?audio=1` で効果音・`?lang=` で言語）
- CG の配色・書体は `src/cg/cg.css` と `src/oneshot/styles/tokens.css` に**独立して**持っている。
  `src/index.css` は `shared` の `tokens.css` を読んでおらず、`tailwind.config.ts` も共通 preset を継承していない
  → **これは凍結アプリとして都合が良い状態なので直さない**
- 送出は OA / NEXT / TAKE / CLEAR。`server/src/contexts/awards/socket.ts` と `quiz/socket.ts`
- `src/components/ui/` が無く、部品を自前で持っている
