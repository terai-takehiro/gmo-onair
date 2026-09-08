# client-live — 計時・視聴者（表示画面と旧URLの入れ物）

制作技術支援の**ミニアプリ**。運用画面（ダッシュボード・タイマー管理・番組設定・組織の鍵設定・表示レイアウト編集）は
`client-techops` の `/techops/live/…` に移植済み（[client-techops/CLAUDE.md](../client-techops/CLAUDE.md)）。
このバンドルに残るのは **表示画面・案内画面・旧URLの転送**だけ。ベースパス `/live/`・ポート 5178。
アプリ一覧・ホーム・⌘K には出ない（`shared/src/client/apps.ts` の `liveops` は `hidden: true`）。
**エントリ自体は消さない** — `appOfPath()` が `/live/*` を解決できなくなる。
経緯は [docs/reviews/techops-build-log.md](../docs/reviews/techops-build-log.md)。

## 入口（正は `src/App.tsx`）

| URL | ファイル | 何をするか |
| --- | --- | --- |
| `/live/display/:timerId` | `pages/TimerDisplayPage.tsx` | **表示画面。公開・認証なし。** `App.tsx` の `DisplayRouter`（`AuthenticatedApp` もシェルも通らない別ルーター） |
| `/live/` | `pages/LiveHomeNoticePage.tsx` | 案内（`/techops/top` へ。manager には `/techops/live-legacy` のリンク） |
| `/live/login` | `pages/LoginPage.tsx` | |
| `/live/open?project=` | `pages/redirects/RedirectFromOpen.tsx` | → `/techops/live/:project`。ミニアプリ登録（`miniapps.ts`）はもう `/techops/live/:ownerKey` を直接指すので、旧URLとしてだけ残る |
| `/live/settings` | `pages/redirects/RedirectFromSettings.tsx` | → `/techops/live-org-settings` |
| `/live/program/:id`（`/timers`・`/settings`） | `pages/redirects/RedirectFromProgram*.tsx` | `GET /liveops/programs/:id` で解決（`useLegacyProgramRedirect.ts`）: `project_id` → `/techops/live/:projectId…`、無ければ `qsheet_program_id` → `/techops/live/:qsheetProgramId…`、両方無し → `/techops/live-legacy?program=:id`（実データに辿り着ける先へ送る。「案件から開き直して」は別の program を作るだけで不可） |

転送先は別バンドルなので `window.location.replace()`（`pages/redirects/RedirectStatus.tsx`）。`RedirectOnce` は使えない。

## 表示画面 `/live/display/:timerId` の例外

- **本番中に会場モニター・OBS が読む。認証を通さない・見た目を変えない。**
- 契約は `shared/tests/liveDisplayContract.test.ts` が文字列で固定する: `App.tsx` の `'/live/display/'` 分岐、`TimerDisplayPage.tsx` が読む
  `/api/v1/internal/liveops/timers/` と `/api/v1/internal/liveops/snapshots/`、`timers.routes.ts` の `/:id/display` と
  `snapshots.routes.ts` の `/:programId/display` に `requireAuth`/`canRead` を付けない、`measure.service.ts` の INSERT。**通り続けること**
- `src/lib/socket.ts`（`/liveops` 名前空間）と `src/hooks/useTimer.ts` は**表示画面専用として凍結**。運用画面は `shared/src/client/live/{socket,useTimer}.ts` の別複製を使う
- **機能を足すのは利用者の明示的な指示があるときだけ。** 前例は自由配置レイアウト
  （[13-live-display-layout-editor.md](../docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md) §1-2）: `GET /:id/layout`
  （`liveops_timer_display_layouts`・migration 233。契約テストの監視対象 `/:id/display` から名前を離してある）を1回だけ読み、
  `shared/src/client/live/DisplayCanvas.tsx` で描く。無ければ従来の固定3パターン。フェーズ色・プラットフォーム色は
  `TimerDisplayPage.tsx` と `DisplayCanvas.tsx` で同じ値（変えるときは両方）
- **書体の絶縁**: `src/index.css` は `base.css` 経由（→ `tokens-v4.css`）で運用画面を v4 化しているが、表示画面は
  `#root:has(.timer-display-font / .split-timer-font / .viewer-header-ja)` で Noto Sans JP に固定。`.timer-panel-font` は運用画面用なので入れない
- `scripts/verify-ui.mjs` の `FROZEN_PREFIX`（`/live/display/`）と `check-ui-tokens.mjs` の `NOT_A_SCREEN` で検査対象外

## 内部識別子（表示名だけ「計時LIVE」→「計時・視聴者」に変えた）

| 識別子 | 値（変えない） |
| --- | --- |
| ディレクトリ・ベースパス | `client-live/`・`/live/` |
| DB | `liveops_programs`・`liveops_timers`・`liveops_snapshots`・`liveops_display_templates` など `liveops_*` |
| Socket.IO | `/liveops`（`server/src/contexts/liveops/socket.ts`） |
| `localStorage` | `lv_display_{timerId}` |
| `AppKey` / `MiniAppKey` | `'liveops'` |
| **権限区画** | **`'qsheet'`**（`liveops` 区画は migration 232 で統合。`requirePermission('liveops')` は無く、`src/hooks/usePermissions.ts` も `'qsheet'` を見る） |

## 決めごと

- シェルは共通（`shared/src/client/shell/`）。残るのは `components/layout/AppShell.tsx`（`appKey="liveops"`・設定を渡すだけ）と
  `components/layout/nav.ts`（`buildLiveNav(programId)`）。転送画面が一瞬マウントされる間の現在地表示のため、番組配下の項目は消していない
- **画面を足したら `src/pcOnlyScreens.ts` の `LIVE_PC_ONLY`（いま空）か `LIVE_MOBILE_OK`（`/`・`/display/:timerId`）に入れる**。
  `pages/redirects/` の5画面は入れない（`<Redirect…>` は転送として `check-mobile-declared.mjs` の対象外。入れると lint が止まる）
- **案件に紐づかない新規スタンドアロン作成は復活させない。** 既存データへの到達性は `/techops/live-legacy`
- 視聴者数は YouTube / Jstream / Zoom / Teams の合算。資格情報は暗号化して保存（`server/src/contexts/liveops/crypto.ts`）
- モックは `docs/design/v4/qsheet-v4-coding/mockups/live/`。設計は [12-live-timer-decision.md](../docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md)
- 検査: `npx tsc -b client-live`・`npm run lint`・`npm run test`（`liveDisplayContract`）・`typecheck:all`/`build:all` の対象（既定の3アプリには入らない）

## 残作業

- 旧URL転送の撤去時期は未決（[qsheet-techops-migration-plan.md §6](../docs/reviews/qsheet-techops-migration-plan.md)）
