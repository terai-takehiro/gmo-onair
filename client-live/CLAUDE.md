# 計時LIVE（タイマー） — **v4 対象（凍結を解いた）**

ベースパス `/live/`・ポート 5178。

## いまの状態

**運用画面（セッション一覧・ダッシュボード・タイマー管理・番組設定・設定）は共通シェル
（`shared/src/client/shell/`）・v4トークンに載せ替えた。** `client-daily` と同じ形で、
`src/components/layout/AppShell.tsx`（設定を渡すだけ）＋ `src/components/layout/nav.ts`
（メニューの中身）に整理した。旧 `Header.tsx` / `Sidebar.tsx` は削除済み。

- `scripts/check-frozen-css.mjs` の対象からは外れた（凍結アプリの CSS 差分を機械で
  見張る対象ではなくなった。詳細は同スクリプト冒頭のコメント）
- `scripts/verify-ui.mjs` は運用画面を v4 対象アプリと同じ基準（地の色 `#f7f8fa`・
  LINE Seed JP）で見る。表示画面だけ今までどおり別基準（下記）
- `shared/src/client/apps.ts` の `frozen` は元々このアプリには付いていなかった
  （09-live-timer-impl.md の段階で先に落ちていた）。一覧・アプリ切替には既に出ている

## ⚠️ 表示画面（`/live/display/:timerId`）だけは今までどおり例外

**本番中に会場モニター・OBS が読む公開URL。認証を通さない。この画面だけは
「見た目を変えない」決まりのまま**（09 §8・§10 の PR6 で一度 v4 モックへ寄せた後、
運用画面のシェル統合とは無関係にこの状態を保っている）。

- **`TimerDisplayPage.tsx` は触らない。** `App.tsx` の `DisplayRouter`（`AuthenticatedApp`
  も共通シェルも一切経由しない、完全に別のルーター）も同様。URL・認証無しの挙動は
  1文字も変えていない
- 契約は `shared/tests/liveDisplayContract.test.ts` が文字列で固定している
  （`App.tsx` の `'/live/display/'` 分岐・`TimerDisplayPage.tsx` の API パス・
  `snapshots.routes.ts` の認可無し）。**このテストが通り続けること**
- `src/index.css` の `@import` は運用画面のために `tokens.css` 直読みから
  `base.css` 経由（→ `tokens-v4.css` → `tokens.css`）へ切り替えたが、
  **表示画面の地の色・文字色は元から Tailwind の生の値**（`bg-black` / `bg-[#fafafa]` /
  `text-white` 等）で書かれていて token を参照しないため、この切替の影響を受けない。
  **書体・行間・字送りだけは `body` から継承する作りだった**ので、`index.css` に
  `:has(.timer-display-font)` 等（表示画面だけが使うクラス名が目印）で書体を
  Noto Sans JP に固定する規則を足し、`TimerDisplayPage.tsx` 自体に触れずに絶縁した
- `scripts/verify-ui.mjs` の `FROZEN_PREFIX` は `/live/display/` だけを指す
  （運用画面はここから外れて v4 の基準で見る）

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。残っているのは
  `components/layout/AppShell.tsx`（設定を渡すだけ）と `components/layout/nav.ts`
  （メニューの中身。番組を選んでいるかどうかで `buildLiveNav(programId)` が組み立てる）
- **画面を足したら `src/pcOnlyScreens.ts` のどちらかの表に入れること**（M2）。
  `LIVE_PC_ONLY` か `LIVE_MOBILE_OK` のどちらにも入っていないと `npm run lint` が止まる。
  いまは「設定」（YouTube/Jstream/Zoom/Teams の API キー・クライアントシークレット）
  だけ PC 専用で、セッション一覧・ダッシュボード・タイマー管理・番組設定はスマホでも開く
  （本番中に会場やロビーからタイマー・視聴者数だけ確認したい場面があるため）
- **画面**: `pages/{SessionHomePage,DashboardPage,TimerAdminPage,ProgramsPage,SettingsPage,TimerDisplayPage}`
- **`/live/display/:timerId` は認証を通さない**（表示機・OBS から開く）。`DisplayRouter` が分岐している
- 視聴者カウンターは YouTube / Jstream / Zoom / Teams の合算。認証情報は暗号化して保存
- **Socket.IO** で タイマー・視聴者数を配信（`server/src/contexts/liveops/socket.ts`）
- **v4 のモックアップは表示画面のみ存在する**（`docs/design/v4/qsheet-v4-coding/mockups/live/Display.dc.html`）。
  運用画面のモックアップはまだ無い（今回のシェル統合は枠と情報設計の移し替えのみで、
  見た目自体の作り直しは別作業。`shared/CLAUDE.md`「前回の刷新が捨てられた理由」を参照）
