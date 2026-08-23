# 計時・視聴者（タイマー） — **v4 対象（凍結を解いた）**

ベースパス `/live/`・ポート 5178。

⚠️ **2026-08-22、`docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` のフェーズ1・
PR-B（ミニアプリとしての導線追加と同じPR）で「計時LIVE」→「計時・視聴者」に改称した。**
**変えたのは画面表示名だけ。** コード上の識別子はどこも変えていない — 知らずに触ると
混乱するので対応表を残す:

| 識別子 | 値（そのまま） |
| --- | --- |
| ディレクトリ名 | `client-live/` |
| ベースパス | `/live/` |
| DBのテーブル名 | `liveops_programs` 等 |
| Socket.IO 名前空間 | `/liveops` |
| `localStorage` キー | `lv_display_{timerId}` 等 |
| `MiniAppKey` / `AppKey` の値 | `'liveops'` |

⚠️ **`permissionModule` / 権限区画だけは例外。** 計時・視聴者のミニアプリ化フェーズ2の
着手にあたり、`'liveops'` 区画を `'qsheet'` へ統合した（migration 232・
[`12-live-timer-decision.md`](../docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md) §9
の未決事項に対する決定）。`requirePermission('liveops', ...)` はサーバー側から全て消え、
`usePermissions.ts` / `AppShell.tsx` の判定も `'qsheet'` を見るようになった。

## ミニアプリ化フェーズ2（バンドル統合）進行中

**運用画面（ダッシュボード・タイマー管理・番組設定・組織の鍵設定）は `client-qsheet`
バンドルへ移植した。** 新URL `/qsheet/live/:ownerKey`（ダッシュボード）・
`/qsheet/live/:ownerKey/timers`（タイマー管理）・`/qsheet/live/:ownerKey/settings`
（番組設定）・`/qsheet/live-org-settings`（組織の鍵設定。案件に紐づかないため
`:ownerKey` を取らない・system_admin/qsheet manager向け）。表示画面用の
`shared/src/client/live/{socket,useTimer}.ts` を新設し、このアプリの
`src/lib/socket.ts` / `hooks/useTimer.ts`（**`TimerDisplayPage.tsx` 専用として
凍結**）とは別に複製した（12-live-timer-decision.md §4-2 の決定どおり、表示画面が使う
実装には1文字も触れていない）。

- **旧URLは削除せず、すべて `/qsheet/...` へのリダイレクト専用画面に差し替えた**
  （v4.1 段2・URL再設計ステージ・`src/pages/redirects/`）。並行稼働（旧URLで運用画面が
  そのまま動く）はここで終わり、以後は旧URLを開くと必ず新URLへ跳ぶ:

  | 旧URL | 解決方法 | 部品 |
  | --- | --- | --- |
  | `/live/program/:id` | `GET /liveops/programs/:id` で `project_id` を引く | `RedirectFromProgram.tsx` |
  | `/live/program/:id/timers` | 同上 | `RedirectFromProgramTimers.tsx` |
  | `/live/program/:id/settings` | 同上 | `RedirectFromProgramSettings.tsx` |
  | `/live/settings` | API 不要（`/qsheet/live-org-settings` へ即遷移） | `RedirectFromSettings.tsx` |
  | `/live/open?project=` | クエリの `project` をそのまま渡す | `RedirectFromOpen.tsx` |

  ⚠️ **`project_id` が無い（案件に紐づかない旧スタンドアロン program）場合の案内文は
  現場運用レビューで一度事故った。** 当初は「制作技術支援の案件から開き直してください」
  という `blocked` 表示を出していたが、これは**実行不可能な指示**だった —
  案件から開くと `resolve-by-project` が**別の新しい** program を作るだけで、
  この旧スタンドアロン program（そこに設定済みのタイマー・YouTube/Zoom/Teams紐づけ）
  には二度と辿り着けなくなる。いまは `client-qsheet` 側に復活させた管理者向け一覧
  （`/qsheet/live-legacy`・下記「セッション一覧」参照）へ、この program を
  あらかじめ選択した状態（`?program=<id>`）で `redirect` する（`blocked` ではなく
  実際に辿り着ける行き先を返す）。`RedirectOnce` は同一バンドル内専用（react-router の
  `navigate()`）なので使えず、すべて `window.location.replace()` によるハード遷移
  （`pages/redirects/RedirectStatus.tsx`）
- **`DashboardPage.tsx`/`TimerAdminPage.tsx`/`ProgramsPage.tsx`/`SettingsPage.tsx`/
  `OrgKeysSection.tsx` は削除済み**（2026-08 のリリース準備・ユーザーの明示的な指示）。
  設計（§4-3・2-X/2-Y 分割）は当初、本番リリースの観測期間を挟んでから別PRで削除する
  予定だったが、この判断を前倒しした。`OpenByProjectPage.tsx` は `RedirectFromOpen.tsx`
  への置き換え時（v4.1 段2）に既に削除済み
- **セッション一覧（旧 `client-live` の `/`・案件に紐づかない「スタンドアロン」作成）は
  廃止した。** `SessionHomePage.tsx` は削除し、`/` は案内画面（`LiveHomeNoticePage.tsx`。
  「制作技術支援の案件から開けます」＋ `/qsheet/top` へのリンク）に差し替えた
  （12-live-timer-decision.md §3-5「抜け道として残す」の撤回・ユーザーの明示的な
  上書き決定）。新ダッシュボード（`/qsheet/live/:ownerKey`）も `scope === 'project'` の
  みに対応し、案件に紐づかないスタンドアロン作成の導線は新バンドル側に持たせていない
  - ⚠️ **「新規のスタンドアロン作成を廃止すること」と「既存のスタンドアロンデータへの
    UI到達を失わせること」は別**（現場運用レビューでの指摘）。案件に紐づかない**既存**の
    `liveops_programs`（`project_id IS NULL`）は消していない以上、それを見て開く手段は
    要る。`client-qsheet` 側に `LiveLegacyProgramsPage.tsx`（`/qsheet/live-legacy`。
    qsheet manager 限定・PC専用）を新設し、一覧・視聴者ソースの読み取り専用表示・
    既存タイマーの操作（`TimerDisplay`/`TimerControls`/`ViewerPanel` を直接再利用）
    だけを持たせた。**新規作成ボタンは無い** — `SessionHomePage.tsx` の「＋新規作成」を
    復活させたのではなく、あくまで残った実データへの到達性だけを回復させたもの。
    `LiveHomeNoticePage.tsx` にも qsheet manager 向けの控えめなリンクを1本足した
- ミニアプリのタイル・ヘッダーのスイッチャー（`client-qsheet` 側の `MiniAppSwitcher` /
  `MINI_APPS` レジストリ）は**このステージでも変更していない** — 引き続き
  `path: '/live/open?project=:ownerId'`（`shared/src/production/miniapps.ts` 等）
  経由でこのアプリの `/live/open`（＝上表の `RedirectFromOpen.tsx`）を踏んでから
  新URLへ跳ぶ。新URLへの導線切り替え自体（レジストリの `path` を直接
  `/qsheet/live/:ownerId` にする等）は後続の RegistryPermissions ステージが行う

## いまの状態

**旧運用画面（セッション一覧・ダッシュボード・タイマー管理・番組設定・設定）は共通シェル
（`shared/src/client/shell/`）・v4トークンに載せ替えた（この記述は当時のまま残す）。**
その後 v4.1 段2 で、これらの URL 自体はリダイレクト専用画面に差し替わったが、
シェル（`AppShell.tsx`/`nav.ts`）自体は上記「ミニアプリ化フェーズ2」の案内画面・
リダイレクト画面もそのまま包んでいる。`client-daily` と同じ形で、
`src/components/layout/AppShell.tsx`（設定を渡すだけ）＋ `src/components/layout/nav.ts`
（メニューの中身）に整理した。旧 `Header.tsx` / `Sidebar.tsx` は削除済み。

- `scripts/check-frozen-css.mjs` の対象からは外れた（凍結アプリの CSS 差分を機械で
  見張る対象ではなくなった。詳細は同スクリプト冒頭のコメント）
- `scripts/verify-ui.mjs` は運用画面を v4 対象アプリと同じ基準（地の色 `#f7f8fa`・
  LINE Seed JP）で見る。表示画面だけ今までどおり別基準（下記）
- `shared/src/client/apps.ts` の `frozen` は元々このアプリには付いていなかった
  （09-live-timer-impl.md の段階で先に落ちていた）。一覧・アプリ切替には既に出ている
- ⚠️ **2026-08 のリリース準備で `apps.ts` の `liveops` エントリに `hidden: true` を
  付けた**（ユーザーの明示的な指示）。運用画面が制作技術支援のミニアプリへ移植済みで、
  単独のトップページタイル・アプリ切替・左メニュー・⌘K に出す入口としてはもう不要な
  ため。**エントリ自体・`/live/` の URL・`/live/display/:timerId` は消していない** —
  ミニアプリ導線（`/live/open?project=`）と旧URLの転送はこのアプリの実体を経由するので、
  `apps.ts` からエントリごと消すと `appOfPath()` がこの URL 群を解決できなくなる

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
  **`LIVE_PC_ONLY` はいま空。** 旧「組織の設定」の PC専用判断は移植先
  （`client-qsheet/src/pcOnlyScreens.ts` の `QSHEET_PC_ONLY`）に引き継いだ。
  `check-mobile-declared.mjs` は `<Redirect...>` という名前の部品を使うルートを
  転送とみなして対象から外すので、`pages/redirects/` 配下の5画面はどちらの表にも
  入れない（入れると「宣言だけ残っていてルートが無い」で lint が止まる）
- **画面**: `pages/{LiveHomeNoticePage,TimerDisplayPage}` ＋ `pages/redirects/`
  （旧URLのリダイレクト専用5画面）。旧運用5画面（`DashboardPage.tsx` 等）は
  `client-qsheet` 側に移植済みで、ファイル自体も削除済み（上記「ミニアプリ化フェーズ2」参照）
- **`/live/display/:timerId` は認証を通さない**（表示機・OBS から開く）。`DisplayRouter` が分岐している
- 視聴者カウンターは YouTube / Jstream / Zoom / Teams の合算。認証情報は暗号化して保存
- **Socket.IO** で タイマー・視聴者数を配信（`server/src/contexts/liveops/socket.ts`）
- **v4 のモックアップは表示画面のみ存在する**（`docs/design/v4/qsheet-v4-coding/mockups/live/Display.dc.html`）。
  運用画面のモックアップはまだ無い（今回のシェル統合は枠と情報設計の移し替えのみで、
  見た目自体の作り直しは別作業。`shared/CLAUDE.md`「前回の刷新が捨てられた理由」を参照）
