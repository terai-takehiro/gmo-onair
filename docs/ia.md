# 情報設計 (IA) — v4 の入口の決めごと

新しいメニュー・入口を足したくなったときに読む文書。**基準は「入口は1つ」**。

旧レール式 IA（v2.9〜v3.1 期の `/today`・共通レール・`railItems.ts`）は v3.2.0 のロールバックで実装ごと消えた。当時の全文と「§4.5」「Phase N」等の引用先は [archive/2026/ia-v2.9-rail-era.md](archive/2026/ia-v2.9-rail-era.md)。

## 原則

1. **入口は1つ。** 同じ行き先を2か所のメニューに並べない。新しいメニューを足す前に、
   既にある入口（アプリ切替・左メニュー・トップのタイル・検索）で足りないかを先に確かめる。
   足りないなら、どれか1つに足す — 複数に足すと片方だけ直された日に食い違う
2. **アプリ登録の唯一の正は `shared/src/client/apps.ts`。**
   名前・アイコン・色・URL・権限モジュール・廃止（`frozen`）・非表示（`hidden`）の印と**並び順**はここだけが持つ。
   アプリ切替・左メニューの「他のアプリ」は `visibleApps()` がここから作る
3. **メニューの中身は各アプリの `src/components/layout/nav.ts`。**
   共通シェル（`shared/src/client/shell/`）は器だけで、項目を決めない
4. **トップのタイルは `DAILY_KEYS`（`client/src/contexts/platform/pages/HomePage.tsx`）と
   `EVENT_KEYS`（同 `home/AppTiles.tsx`）の対。** どちらも `apps.ts` の `key` で照合するので、
   **`key` を改名したら必ず追随する**（取り残すとそのアプリのタイルが黙って消える）
5. **旧URLは消さない。** アプリ内は `App.tsx` の転送（`<Navigate>` / `RedirectKeepQuery` / `RedirectOnce`）、
   バンドルをまたぐものはサーバー側のブリッジ（旧 `/qsheet/*` など）で生かす
6. **リンク切れは機械で見つける。** 画面内リンクは `scripts/check-links.mjs`、
   文書間リンクは `scripts/check-md-links.mjs`（どちらも `npm run lint` が回す）

## 壊してはいけない契約（リリースをまたいで維持する）

| 契約 | いまの形 | 守っている場所 |
| --- | --- | --- |
| **本番進行の5URL** | `/techops/{editor,onair,rundown,prompter,audio}/:id` | `client-techops/src/App.tsx` |
| **旧 `/qsheet/*`** | **無期限ブリッジ**（印刷済み QR コード・OBS ブラウザソースが旧URLを指す）。サーバーは `/qsheet` と `/techops` で同じ `client-techops/dist` を配信し、アプリ側の `RedirectQsheetToTechops` が `/qsheet/…` → `/techops/…` へクエリ付きで転送する。API の接頭辞と Socket.IO は `/qsheet` のままで、Socket.IO は `/qsheet`・`/techops` の両ネームスペースへ配信する。撤去の判断は [reviews/qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md) §6 | `server/src/app.ts`（`serveApp`）・`client-techops/src/App.tsx`・`server/src/contexts/qsheet/socket.ts`（`NAMESPACES`） |
| **音声サポートの公開URL** | `/techops/audio/:id?token=…`。認証なし・**`?token=` 必須**（2026-08-23 の段階③でトークン無しの旧URLは 410、失効済みも 410、不明は 404）。パスの資料 ID は Socket.IO の room 名なので変えない | `server/src/contexts/qsheet/routes/public-audio.routes.ts`・`services/audio-share.service.ts`（`ACCEPT_LEGACY_AUDIO_ACCESS = false`） |
| **サイネージURL** | `/signage/:roomId?token=…`。トークンは ICS と同じ `studio_calendar_settings.feed_token`。再生成すると既発行の URL・サイネージが全部無効になる | `client/src/App.tsx`・`server/src/contexts/production/routes/studio.routes.ts` |
| **ICS フィード** | `/api/v1/internal/studios/calendar.ics?token=…`。トークンは `studio_calendar_settings`（単一行）に永続化し、認証なし・トークンで検証 | `server/src/contexts/production/routes/studio.routes.ts` |
| **MCP のエンドポイントとツール名** | 旧 `qsheet` 系（`get_qsheet` / `find_similar_qsheets` / `create_qsheet` / `propose_qsheet_draft` / `discard_qsheet_proposal`）は新名（`get_sheet` …）と**二重登録**。権限ゲートも二重に持ち、撤去は両方同時に | `server/src/contexts/mcp/tools/production.tools.ts`・`server/src/contexts/mcp/gate.ts` |
| **金額** | 税抜で保持する（取込は税込 → 税抜へ換算） | `server/src/contexts/platform/services/kessan-import.service.ts` ほか |
| **`billing_key`** | 売上・仕入 = 回のコード + 税枝番（`GLS001-001-1`）、販管費 = 発生日 + 税枝番（`20260228-1`）。税枝番は `tax-category.service.ts` の1か所で決める | `server/src/shared/services/billing-key.service.ts` |
| **GLS 採番** | `sequences` への `INSERT … ON CONFLICT … RETURNING` で原子的に採る（read-then-write にしない）。回の番号も同じ形 | `server/src/shared/services/sequence.service.ts` |
| **権限は2段** | ①モジュール権限（`user_permissions`。区画は `sales` / `dailyops` / `equipment` / `qsheet` / `awards`、レベルは reader / editor / manager。「型」を押すと書き換わる）で「どのアプリを触れるか」を決め、②案件メンバー（`project_members`）が「どの案件のものが見えるか」を広げる（例: スケジュール表は作成者・共有先・案件メンバー・管理者が開ける）。権限とメンバーの管理は `system_admin` だけ | `server/src/contexts/platform/services/permission-role.service.ts`・`server/src/contexts/qsheet/access.ts`・[reviews/permission-model-simplification-plan.md](reviews/permission-model-simplification-plan.md) |

`permissionModule`（`apps.ts`）の現状: 案件管理と同じ `sales` にプロジェクト管理・財務管理・カレンダー・設定の4入口を統合済み。
制作技術支援と計時・視聴者は `qsheet`（表示名の改名と独立。既存利用者の権限 JSON のキーなので変えない）。
`awards` は廃止アプリだが区画は残る。
