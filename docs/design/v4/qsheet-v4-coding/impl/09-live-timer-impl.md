# 09 計時・視聴者（計時LIVE の統合）— 実装設計

> **2026-08-21 作成。コードは1行も書いていません。**
> 上位の設計は [`../09-live-timer.md`](../09-live-timer.md)。
> この文書は**それを実装に落とすときに手が止まる箇所だけ**を、実装を読んで確かめた事実の上に書きます。
>
> ⚠️ **実装を読んで分かった食い違いは §12 に全部あります。着手前に §12 を読んでください。**
> いちばん大きいのは **09 §4・§5-4・§5-5 の DDL が Postgres でそのまま流れない**ことです
> （`liveops_programs.id` / `liveops_timers.id` は **UUID** で、設計書は `TEXT` で FK を張っています）。
> 次に大きいのは **「取得間隔の正がサーバーには存在しない」**ことです（§12-3）。

---

## 1. この段でやること

| # | やること | 出どころ |
| --- | --- | --- |
| 1 | `liveops_org_settings` を新設し、**計測は組織共通の鍵1本**で回す | 09 §5-4 |
| 2 | **視聴者の取得をサーバー側へ移す**（運用画面を閉じても止まらない） | 09 §5 |
| 3 | **自動停止は開始日の 23:59（JST）が既定**。手入力で延ばせる | 09 §5-2-1 |
| 4 | **同時に計測するのは1案件**を DB で担保する | 09 §5-7-b |
| 5 | `liveops_poll_log` に取得の記録を残す（失敗が誰にも見えない問題） | 09 §5-5 |
| 6 | 画面が無かった2つを出す（黄色のしきい値・運用画面に出すタイマー） | 09 §1-6 |
| 7 | 導線を制作資料のミニアプリに寄せ、見た目を v4 にする | 09 §2・§6 |
| 8 | **`/live/display/:timerId` を1文字も変えない**ことを構造で保証する | 09 §0-3・§8 |

**やらないこと**

- **タイマーの意味論を1つも変えない**（カウントダウンのみ・`+MM:SS`・サーバーが正・100ms 配信・
  リセットは尺ごと 0・±調整は計時中も効く・上限 5999 秒）
- **`liveops_snapshots` の形を変えない**（表示画面がこの表を読んでいる。→ §8）
- **`liveops_programs` を消さない**（配布済みの表示URLが壊れる）
- **`viewer_overlay_program_id` の UI**（09 §1-6 #3 で「今回は出さない」）
- **Singular Live 連携**（09 §1-6 #4）
- **個人ごとの鍵（`liveops_settings`）の廃止**。用途を「接続テスト専用」に絞るだけ

---

## 2. 実装前の事実確認（読んで確かめたもの）

### 2-1. ⚠️ 主キーの型（**DDL を書く前に必ず**）

| 表 | `id` の型 | どこ |
| --- | --- | --- |
| `liveops_programs` | **UUID**（`DEFAULT gen_random_uuid()`） | `server/src/shared/db/migrations/052_liveops_schema.sql:18` |
| `liveops_timers` | **UUID** | 同 `:47` |
| `liveops_snapshots` | **UUID**、`program_id UUID NOT NULL REFERENCES liveops_programs(id) ON DELETE CASCADE` | 同 `:34-35` |
| `liveops_settings` | **PK は `user_id TEXT`**（1人1行） | 同 `:9` |
| `liveops_teams_subscriptions` | `id TEXT`、`program_id UUID` | `095_liveops_zoom_teams.sql:32-33` |
| `users.id` / `projects.id` | **TEXT** | `052:4` のコメント／`001b_postgresql_schema.sql:104-105` |

**09 §4・§5-4・§5-5 の DDL は `TEXT` で FK を張っています。そのままでは流れません。** → §3-2 で直します。

### 2-2. いまの視聴者取得（どこで動いているか）

| 事実 | どこ |
| --- | --- |
| 取得は **`client-live` のブラウザ**が `setInterval` で回している | `client-live/src/hooks/useViewer.ts:161-167`（`startPolling`） |
| **自動では始まらない。「開始」ボタンを押したときだけ始まる** | `client-live/src/pages/DashboardPage.tsx:172-181`（`onClick={viewer.running ? stopPolling : startPolling}`） |
| 1回の取得で `GET /liveops/programs/:id` → YouTube → Jstream → Zoom(meeting) → Zoom(webinar) → Teams の**最大6リクエスト** | `useViewer.ts:64,78,98,110,119,133` |
| 取得のたびに `POST /liveops/snapshots` で1行入れる | 同 `:148-153` |
| 取得対象の ON/OFF は **`localStorage['lv_dash_platforms_{programId}']`**（端末ごと） | `DashboardPage.tsx:32-55` |
| ログは **画面の中のメモリだけ**（100件・`setLogs(... .slice(0,100))`）。閉じると消える | `useViewer.ts:54-56` |
| 取得間隔は **`liveops_settings.polling_interval_sec`（そのユーザーの行）**を画面が読んで渡す | `DashboardPage.tsx:64-67,85` ／ `settings.routes.ts:16-20,40` |
| 運用画面が使うタイマーは **常に `timers[0]`** | `DashboardPage.tsx:83` |

**したがって 09 §5-1 の「本番中に運用画面を閉じると取得が止まる」は正しい**（`useEffect` の
クリーンアップ `:181` で `clearInterval`）。
⚠️ **ただし 09 §5-7-b-1 の「いまのブラウザ側の実装は開いている間ずっと呼びます」は正しくありません** → §12-2。

### 2-3. YouTube / Jstream / Zoom / Teams の呼び出し

| 事実 | どこ |
| --- | --- |
| YouTube は `videos.list`（`part=liveStreamingDetails,statistics`）を**videoIds をカンマで束ねて1回**呼ぶ | `server/src/contexts/liveops/routes/proxy.routes.ts:25-28` |
| Jstream は `getLiveConnection`（CSV の最終行の末尾） | 同 `:53-64` |
| Zoom は `metrics/meetings/:id/participants?type=live` と `metrics/webinars/:id/…` を**別々に**呼ぶ | 同 `:86-93` |
| Teams は **Graph の push 通知**で `Map` に貯めた数を返すだけ（**サーバー再起動で 0 に戻る**） | 同 `:109-113` ／ `teams-subscription.ts:5,60,71` |
| 4本とも `requirePermission('liveops','reader')` の**画面用ルート**。**サービス関数として切り出されていない** | `proxy.routes.ts:12,16,44,71,109` |
| 鍵は `resolveKey(userId, column)` — **自分の鍵 → 無ければ組織内の他人の鍵**にフォールバック | `resolve-key.ts:15-30` |

⚠️ **YouTube の1回の呼び出しは `videoIds` を何本束ねても 1 ユニット**（`videos.list` は
`id` をカンマ区切りで受ける）。09 §5-7-b の「1案件 1日 約 8,640 回」は
**「案件あたり」ではなく「取得サイクルあたり1ユニット」**という前提で正しい数字です。
**ただし Zoom は meeting と webinar が別リクエスト**なので、
**「1サイクル＝1リクエスト」ではありません**（YouTube の割り当てには効きませんが、
`liveops_poll_log` の行数を消費数として使う設計（09 §5-7-b-4）には効きます → §12-6）。

### 2-4. 表示画面（**いちばん壊してはいけない画面**）

| 事実 | どこ |
| --- | --- |
| `/live/display/*` は **`useAuth` を使わない独立ルーター**（`window.location.pathname` を見て分岐） | `client-live/src/App.tsx:15-23,57-62` |
| 表示画面が呼ぶ API は**2本だけ**。どちらも**認証なし** | 下記 |
| ① `GET /api/v1/internal/liveops/timers/:id/display` → `{ id, viewer_overlay_program_id, program_id }` | `TimerDisplayPage.tsx:91` ／ `timers.routes.ts:11-22` |
| ② `GET /api/v1/internal/liveops/snapshots/:programId/display` → **最新1件**の記録 | `TimerDisplayPage.tsx:106` ／ `snapshots.routes.ts:10-24` |
| ②は **15 秒ごと**に読み直す | `TimerDisplayPage.tsx:119` |
| タイマーは Socket.IO の `/liveops` 名前空間から `state` を受ける（**トークン無しの接続を許可**） | `useTimer.ts:18-26` ／ `socket.ts:100,110-116` |
| 7つの切替は `localStorage['lv_display_{timerId}']`（**端末ごと・タイマーごと**） | `TimerDisplayPage.tsx:57-72,123-128` |
| `?programId=` で上書きできる | 同 `:88-90` |

**この2本の API と Socket の契約を変えなければ、表示画面は1行も直さずに済みます。** → §8

### 2-5. サーバーの常駐サービスの作法

| 事実 | どこ |
| --- | --- |
| `initLiveopsServices()` が起動時に `restoreSubscriptions()` → `startSubscriptionRenewal()` を呼ぶ | `server/src/contexts/liveops/index.ts:28-52` |
| 呼び出しは `server/src/index.ts:67-69`。**失敗しても `catch` して起動は続く** | 同 |
| 定時実行は `startScheduler()`（`index.ts:60-61`）。**15分ごとに起きて「今日まだ流していない＆時刻を過ぎた」仕事を流す** | `contexts/platform/services/scheduler.service.ts:1-24` |
| 二重送信は `scheduled_job_runs (job_key, run_date)` の**主キー**で止める | `177_notifications.sql:76-85` |
| **JST は `shared/utils/jst.ts`**（`jstDate` / `jstTime` / `jstParts` / `shiftYmd`）。`Intl` で `Asia/Tokyo` に直す | `jst.ts:27-61` |
| ⚠️ **`TZ=Asia/Tokyo` は効かない**（Alpine に tzdata が無い）。`new Date().getHours()` を使うと **JST と 9 時間ずれる** | `jst.ts:15-23` |
| SQL の中では `NOW() AT TIME ZONE 'Asia/Tokyo'` を使う（Postgres は自前の tzdata を持つ） | `jst.ts:22` |
| Socket の状態（`states` / `ticks`）は **プロセス内の `Map`**。**すでに単一プロセス前提** | `socket.ts:17-18` |

### 2-6. 秘密の暗号化

`server/src/contexts/liveops/crypto.ts` の `encrypt` / `decrypt` / `mask`。
**AES-256-GCM、形式は `iv:authTag:ciphertext`（hex）**、鍵は `process.env.ENCRYPTION_KEY`（64 hex 以上）。
**本番で未設定なら起動時に例外**（`crypto.ts:9-11`）。開発は `config.jwtSecret` から SHA-256 で導出（`:13`）。

### 2-7. 凍結・検査の状態

| 事実 | どこ |
| --- | --- |
| `client-live` は `frozen: true`（一覧・アプリ切替から外れている） | `shared/src/client/apps.ts:148` |
| `check-frozen-css.mjs` が `qsheet` / **`live`** / `awards` の CSS を見張る | `scripts/check-frozen-css.mjs:45-49` |
| `check-shared-wiring.mjs` の `V4_APPS` は `client` / `client-daily` / `client-equipment` の**3つだけ**。**凍結アプリが共通シェルを使うと落ちる** | `scripts/check-shared-wiring.mjs:207,236-238` |
| `check-mobile-declared.mjs` も v4 対象3アプリだけ（`client-live/src/pcOnlyScreens.ts` は無い） | `scripts/check-mobile-declared.mjs:23-45` |
| 1ファイル 400 行が上限 | `scripts/check-file-size.mjs:27` |
| サーバーは `/live` に `client-live/dist` を配る（SPA フォールバックつき） | `server/src/app.ts:144` |
| `client-live` のベースパスは `/live/`、`client-qsheet` は `/qsheet/`（**別バンドル**） | `client-live/vite.config.ts:7` ／ `client-qsheet/vite.config.ts:7` |

### 2-8. migration の実際の最大

```bash
$ ls server/src/shared/db/migrations/ | sed -n '$p'
211_drop_techsheet_schema.sql
```

**最大は 211。次に空いているのは 212。**（197・205 は欠番、**206 が2本ある**。
`migrate.ts:16` はファイル名の辞書順に流し、`_migrations` にファイル名で記録するだけなので、
**番号が重なっても CI は落ちません**。）

---

## 3. DDL

### 3-1. migration 番号

**実測の最大は `211_drop_techsheet_schema.sql`**（`ls server/src/shared/db/migrations/ | sed -n '$p'`）。
⚠️ **README §6 の採番表は「現在の最大が 210」を前提にしており、全部 1 つずれています。**

段ごとの実装設計を並行して書いているため、**予定番号は [`README.md`](README.md) §3 の表が正**です。
この段の予定は **`221_liveops_server_measure.sql`**（段1〜10 が 212〜219、08 が 220 を予定しているため、その次）。

⚠️ **予定であって確定ではありません。** `migrate.ts:16` はファイル名の辞書順に流すだけで、
**番号が重なっても CI は落ちません**。
**PR を出す直前に必ず `ls server/src/shared/db/migrations | sort | tail -3` で取り直し、
他の PR が先に入っていたら自分の番号を上げてリネームしてください。**
（一度 `main` に入ったファイル名は**絶対に変えないこと**。`_migrations` はファイル名で
実行済みを持つので、リネームすると既存 DB でもう一度流れます。）

**この文書の中では `NNN` と書きます。** **1ファイルにまとめます**
（`liveops_org_settings` だけ入って計測の列が無い、という中途半端な状態に意味が無いため）。
**09 は他のどの段にも依存しません**（`liveops_*` と `users` / `projects` にしか触らない）。

### 3-2. 本体

```sql
-- ============================================================
-- NNN: 計時・視聴者 — 視聴者の取得をサーバー側へ移す
--
-- ⚠️ 型に注意。liveops_programs.id / liveops_timers.id は **UUID**（052:18,47）。
--    users.id は TEXT（052:4）。ここを取り違えると ALTER が落ちる。
-- ⚠️ 既存の liveops_snapshots は**1列も変えない**。表示画面がこの表を読んでいる（§8）。
-- ============================================================

-- ── ① 組織共通の鍵（1行だけ） ────────────────────────────────
-- 列名は liveops_settings に揃える（`*_enc`）。暗号は既存の AES-256-GCM。
CREATE TABLE IF NOT EXISTS liveops_org_settings (
  id                      BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  youtube_api_key_enc     TEXT,
  jstream_token_enc       TEXT,
  zoom_account_id_enc     TEXT,
  zoom_client_id_enc      TEXT,
  zoom_client_secret_enc  TEXT,
  teams_tenant_id_enc     TEXT,
  teams_client_id_enc     TEXT,
  teams_client_secret_enc TEXT,
  -- ⚠️ 09 §5-2 は「既存の liveops_settings.polling_interval_sec をそのまま使う」と
  --    書いているが、あれは **PK が user_id の1人1行**の表で、サーバー側計測に
  --    「その人」がいない（§12-3）。取得間隔の正をここに置く。
  polling_interval_sec    INTEGER NOT NULL DEFAULT 10
                          CHECK (polling_interval_sec BETWEEN 5 AND 300),
  updated_by              TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 行は最初から1本だけ置く（無いと画面が「まだ無い」と「未設定」を区別できない）
INSERT INTO liveops_org_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- ── ② 計測の状態（liveops_programs に足す） ──────────────────
ALTER TABLE liveops_programs
  ADD COLUMN IF NOT EXISTS measuring          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS measure_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_started_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS measure_until      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_until_kind TEXT NOT NULL DEFAULT 'default'
                           CHECK (measure_until_kind IN ('default','manual')),
  ADD COLUMN IF NOT EXISTS measure_platforms  JSONB NOT NULL
                           DEFAULT '["youtube","jstream","zoom","teams"]'::jsonb,
  ADD COLUMN IF NOT EXISTS measure_last_ok_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS measure_fail_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS measure_owner      TEXT,     -- 取り合い用のインスタンス印
  -- ⚠️ 09 §4 は TEXT で書いているが liveops_timers.id は UUID
  ADD COLUMN IF NOT EXISTS main_timer_id      UUID REFERENCES liveops_timers(id) ON DELETE SET NULL;

-- ── ③ 同時 1 案件を **DB で** 担保する（§7） ─────────────────
-- 「measuring = true の行は全体で高々1行」を部分ユニーク索引で表す。
-- WHERE measuring で対象を true の行だけに絞ると、索引に入る値はすべて true に
-- なるので、その列を一意にする＝**全体で1行しか true にできない**。
CREATE UNIQUE INDEX IF NOT EXISTS liveops_single_measurement
  ON liveops_programs (measuring) WHERE measuring;

-- ── ④ 取得の記録（失敗が誰にも見えない問題・09 §5-5） ─────────
CREATE TABLE IF NOT EXISTS liveops_poll_log (
  id          BIGSERIAL PRIMARY KEY,
  program_id  UUID NOT NULL REFERENCES liveops_programs(id) ON DELETE CASCADE,  -- ⚠️ UUID
  at          TIMESTAMP NOT NULL DEFAULT NOW(),
  platform    TEXT NOT NULL,   -- youtube | jstream | zoom | teams | system
  level       TEXT NOT NULL CHECK (level IN ('ok','error','info')),
  count       INTEGER,
  units       INTEGER NOT NULL DEFAULT 0,   -- ⚠️ 消費した割り当て。§7-4
  message     TEXT
);
CREATE INDEX IF NOT EXISTS liveops_poll_log_prog
  ON liveops_poll_log (program_id, at DESC);
-- 「今日の消費」を数えるため（§7-4）。JST の境目ではなく**太平洋時間**で切る
CREATE INDEX IF NOT EXISTS liveops_poll_log_yt_at
  ON liveops_poll_log (at DESC) WHERE platform = 'youtube';

-- ── ⑤ 案件から 1:1 で引く（09 §4） ───────────────────────────
-- ⚠️ 張る前に重複を確かめること（§3-4）。重複があるとこの CREATE で migration ごと落ちる。
CREATE UNIQUE INDEX IF NOT EXISTS liveops_programs_project_key
  ON liveops_programs (project_id)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;
```

### 3-3. 09 の DDL から変えた点

| # | 09 | この文書 | なぜ |
| --- | --- | --- | --- |
| 1 | `main_timer_id TEXT REFERENCES liveops_timers(id)` | **`UUID`** | `liveops_timers.id` は UUID（`052:47`）。**TEXT だと `ALTER` が型不一致で落ちます** |
| 2 | `liveops_poll_log.program_id TEXT REFERENCES liveops_programs(id)` | **`UUID`** | 同じ理由（`052:18`） |
| 3 | `TIMESTAMPTZ` | **`TIMESTAMP`** | 既存の liveops 全表が `TIMESTAMP`（`052:13,27-28,36`）。ここだけ型を変えると `captured_at` と比べるたびに読み手が迷います |
| 4 | `updated_by TEXT REFERENCES users(id)`（削除挙動なし） | **`ON DELETE SET NULL`** | 既定 `NO ACTION` だと**鍵を入れた人が退職すると `users` の行を消せなくなります** |
| 5 | （無し） | **`polling_interval_sec` を `liveops_org_settings` に置く** | 09 §5-2 は「`liveops_settings.polling_interval_sec` をそのまま使う」と書いているが、あれは1人1行の表で**サーバーには「その人」がいない** → §12-3 |
| 6 | （無し） | **`liveops_single_measurement` 部分ユニーク索引** | 09 §5-7-b-2 が「同時 1 案件を DB で担保する」と言っている**その実体**。設計書に索引が書かれていません → §7 |
| 7 | （無し） | **`liveops_poll_log.units`** | 09 §5-7-b-4 は「`liveops_poll_log` の行数がそのまま消費数になります」としているが、**Zoom は meeting と webinar で2行になる**ので行数＝YouTube の消費数ではありません → §12-6 |

### 3-4. 一意インデックスを張る前に必ず確かめること

```sql
-- 1案件に複数セッションがある既存行（09 §7-2 の確認）
SELECT project_id, COUNT(*) FROM liveops_programs
 WHERE project_id IS NOT NULL AND deleted_at IS NULL
 GROUP BY project_id HAVING COUNT(*) > 1;
```

**1行でも返ったら、この migration は落ちます。**
migration の中で自動的に統合しないこと（**どれを残すかは機械には決められない**）。
返ったら **§11 の確認2 を先に解いてから**着手します。

同じく `measuring` は全行 `FALSE` で入るので `liveops_single_measurement` は必ず張れます。

---

## 4. 視聴者取得をサーバー側へ移す

### 4-1. どこに置くか

```
server/src/contexts/liveops/
  viewer-sources.service.ts   ← 新設。YouTube / Jstream / Zoom を「取りに行く」関数だけ
  measure.service.ts          ← 新設。計測の開始・停止・スケジューラ・自動停止
  org-key.ts                  ← 新設。組織共通の鍵を読む（§6）
  routes/measure.routes.ts    ← 新設。開始・停止・状態・ログ
  routes/proxy.routes.ts      ← 既存。**中の呼び出しを viewer-sources.service.ts に置き換える**
  index.ts                    ← initLiveopsServices() に restoreMeasurements() を1行足す
```

⚠️ **新しい API クライアントを書かないこと**（09 §5-3）。
`proxy.routes.ts:25-28,53-56,95-98` の axios 呼び出しを **`viewer-sources.service.ts` に切り出し、
`proxy.routes.ts` はそれを呼ぶだけにする**。切り出しの PR では**挙動を1つも変えない**（§10 の PR 1）。

```ts
// viewer-sources.service.ts — 「鍵を渡すと数を返す」だけ。DB も HTTP も知らない
export async function fetchYoutube(apiKey: string, videoIds: string[]): Promise<Record<string, number | null>>;
export async function fetchJstream(token: string, lpid: string): Promise<number>;
export async function fetchZoom(cred: ZoomCred, kind: 'meeting'|'webinar', id: string): Promise<number>;
// Teams は取りに行かない。teams-subscription.ts の getCount(programId) を読むだけ
```

**鍵を引数で渡す**のがポイントです。`resolveKey(userId, …)` を内側で呼ぶ形のままだと、
**「その人」がいないサーバー側計測から呼べません**（§6）。

### 4-2. スケジュールの載せ方

09 §5-3 のとおり **Teams のサブスク更新と同じ形**（`liveops/index.ts:28-52` ／
`teams-subscription.ts:88-110`）に倣います。**`scheduler.service.ts`（15分ごと）には載せません** —
取得間隔は 5〜300 秒で、15分の粒度では足りないためです。

```
サーバー起動 (server/src/index.ts:67)
  └ initLiveopsServices()
      ├ restoreSubscriptions()      （既存・Teams）
      ├ startSubscriptionRenewal()  （既存・Teams）
      └ restoreMeasurements()       ◀ 新規
          ├ measuring = true の行を読む
          ├ measure_until を過ぎているものは stopMeasurement('auto') にして起こさない
          ├ measure_owner が自分でない行は **奪う**（§7-2。単一プロセス前提なので、
          │   前のプロセスの印が残っているだけ）
          └ 残りに setInterval を張る
```

- **1案件につき 1 つの `setInterval`**。`const ticks = new Map<string, NodeJS.Timeout>()`
  （`socket.ts:18` と同じ形）。開始で張り、停止・自動停止・打ち切りで `clearInterval`
- 間隔は **`liveops_org_settings.polling_interval_sec`**（§3-2 ①）。
  **開始した時点の値を使い、途中で変えても次の開始まで効かない**（`setInterval` を張り替えない。
  張り替えを許すと「変えた瞬間に2本走る」事故が起きます）
- ⚠️ **`initLiveopsServices()` は `catch` されている**（`index.ts:67-69`）ので、
  `restoreMeasurements()` が投げても**サーバーは起動します**。
  **投げたら計測が黙って復元されない**ので、**中で必ず `console.warn` を出す**こと

### 4-3. 1回の取得（`pollOnce(programId)`）

```
① liveops_programs を1行読む（youtube_urls / jstream_lpid / zoom_* / teams_meeting_url
                              / measure_platforms / measure_until / measuring）
② measuring が false → clearInterval して終わり（他のプロセス・他の経路で止められた）
③ measure_until を過ぎている → stopMeasurement('auto') して終わり（§5）
④ 組織共通の鍵を読む（§6）。無ければ stopMeasurement('no_key') して終わり
⑤ measure_platforms に入っているものだけ取りに行く
⑥ liveops_snapshots に **1行** INSERT（いまと同じ形。total_count は書かない → §8-2）
⑦ 記録（§4-5）と measure_last_ok_at / measure_fail_count の更新
```

⚠️ **③ を「①の前」に置かないこと。** `measure_until` は DB にあるので、
**1行読んでから判定する**のが正しい順です（画面から延ばされた値をその場で拾えます）。

⚠️ **⑤ の判定を `enabled.youtube && ytUrls.length > 0` のようにクライアントから写さないこと。**
サーバーは `measure_platforms`（JSONB の配列）を正にします（09 §5-4）。

### 4-4. 失敗したときの扱い

| 何が起きたか | どうする |
| --- | --- |
| 1プラットフォームが失敗（HTTP エラー・タイムアウト） | **他のプラットフォームは続ける。** そのプラットフォームだけ `count: null` として `liveops_poll_log` に `error` を1行。`measure_fail_count += 1` |
| 全プラットフォームが成功 | `measure_fail_count = 0` にリセットし、`measure_last_ok_at = NOW()` |
| **`measure_fail_count` が 5 に達した** | **計測を止める**（`stopMeasurement('failed')`）。`liveops_poll_log` に `platform='system', level='error'` を1行。画面の帯に理由を出す（09 §5-4 の末尾） |
| 組織共通の鍵が無い／復号できない | **開始させない・回っていれば止める。** 「組織共通の鍵が未設定です」と**はっきり出す**（黙って誰かの割り当てを食わない・09 §5-4） |
| Postgres が落ちている | `pollOnce` 全体を `try/catch` で包み、**`setInterval` は止めない**（DB が戻れば続く）。ただしログも書けないので `console.warn` だけ出す |

⚠️ **失敗しても間隔を詰めない**（09 §5-7-b-3）。再試行のバックオフも入れません
（縮む方向の実装は割り当てを一気に食います）。

⚠️ **`measure_fail_count` は「サイクル単位」で数える**こと。
「プラットフォームごとに +1」にすると **4プラットフォーム設定していると 2 サイクルで打ち切り**になります。
**1サイクルの中で1つでも失敗したら +1、全部成功したら 0** に倒します。

### 4-5. 記録（`liveops_poll_log`）

09 §5-5 のとおり「**`ok` は 10 回に 1 回だけ書く／失敗は毎回書く**」。

⚠️ **ただし `units` は毎回書く必要があります**（§7-4 の「今日の消費」を数えるため）。
**間引くのは `level='ok'` の行だけで、`platform='youtube'` の行は間引かない**——
これでは分かりにくいので、**分けます**:

| 種類 | 書く頻度 | 用途 |
| --- | --- | --- |
| `level='error'` | **毎回** | 原因を追う |
| `level='ok'` | **10 サイクルに1回** | 運用画面のログ欄 |
| `platform='youtube'` の `units` | **YouTube を呼んだら毎回**（`level` は `ok` でも `error` でも） | **割り当ての消費数**（§7-4） |

つまり **YouTube だけは毎サイクル1行**入り、他は間引かれます。
1案件を丸1日回すと **約 8,640 行/日**。**保存の決め**（09 §5-5）:

- 計測が終わったら **その案件の直近 500 行だけ残して消す**
- あわせて **`at < NOW() - INTERVAL '30 days'` を日次で消す**（`scheduler.service.ts` の
  仕事として1本足す。`job_key = 'liveops_poll_log_prune'`）

⚠️ **`units` を消すと「今日の消費」が数えられなくなります。**
消す前に **日次の合計を別に残す**（`liveops_poll_log` を消す仕事の中で、
`platform='youtube'` の `units` の日合計を `level='info', platform='system'` の1行に畳む）か、
**「今日の消費」は当日ぶんだけ数えられればよい**と割り切るか。
**この文書は後者を採ります**（当日の割り当ての話なので、過去の消費は運用に要らない）。
→ その代わり、**500 行に切り詰める処理は「計測が終わってから」**行い、**計測中は切り詰めない**こと。

### 4-6. 「計測中」を全員に見せる

09 §5-6 は「押した人のブラウザだけ → 全員に同じものが見える」としています。**実装は2択**:

| 案 | 中身 | 判断 |
| --- | --- | --- |
| **A（採る）** | `GET /liveops/programs/:id/measure` を **15 秒ごとに React Query で読む** | 表示画面が既に 15 秒で記録を読んでいる（`TimerDisplayPage.tsx:119`）ので、感覚が揃う。**新しい仕組みを足さない** |
| B | `/liveops` 名前空間に `measure:state` を流す | 即時に伝わるが、**表示画面のトークン無し接続にも届く**（`socket.ts:110-116`）。無認証の画面に「誰が始めたか」が出るのは避けたい |

**A を採ります。** 「誰がいつ始めたか」は `liveops` 権限のある画面だけが見ます。

---

## 5. 自動停止 — 開始日の 23:59（JST）

### 5-1. 既定値の計算（**ここを間違えると本番中に止まります**）

```ts
import { jstDate } from '../../shared/utils/jst';

/** 開始日（JST）の 23:59:59 を返す。⚠️ toISOString() を使わない */
function defaultMeasureUntil(now = new Date()): Date {
  const ymd = jstDate(now);                 // 'YYYY-MM-DD'（Intl で Asia/Tokyo に直す）
  const [y, m, d] = ymd.split('-').map(Number);
  // JST は UTC+9。23:59:59 JST = 同じ日の 14:59:59 UTC
  return new Date(Date.UTC(y, m - 1, d, 14, 59, 59));
}
```

⚠️ **`new Date().getHours()` / `setHours()` / `toISOString().slice(0,10)` を使わないこと。**
コンテナは UTC で動き、**`TZ=Asia/Tokyo` は Alpine に tzdata が無いので効きません**（`jst.ts:15-23`）。
`jst.ts` に無い計算（「その日の 23:59:59」）はここで1回だけ書き、**他の場所に写さない**こと。

⚠️ **サマータイムは無い**（JST は年中 UTC+9）ので `Date.UTC(..., 14, 59, 59)` で足ります。
**他の時間帯へ広げる予定が出たら、この関数を `Intl` ベースに書き直すこと。**

### 5-2. 手入力（イレギュラー）

| | 決め |
| --- | --- |
| 既定 | `measure_until_kind = 'default'`、`measure_until = defaultMeasureUntil()` |
| 手入力 | `measure_until_kind = 'manual'`、`measure_until = 入力値`。**24時間を超えてよい** |
| 途中で延ばす | 計測中でも `PATCH .../measure` で `measure_until` を変えられる（画面の帯から） |
| 上限 | **設けない。** ただし **開始から7日を超える指定は確認を挟む**（止めはしない） |
| 過去を入れたら | **400**（「終了時刻が過ぎています」）。開始できてしまうと1サイクルで止まる |

⚠️ **「開始から N 時間」にしないこと**（09 §5-2-1）。
朝に仕込んで夜に本番の日は、**開始が早いほど早く切れて本番中に止まります**。

### 5-3. 自動停止の判定はどこで行うか

**`pollOnce` の中（§4-3 の③）だけ**で行います。**別のタイマーを立てません。**

- 取得間隔は最大 300 秒なので、**最大 5 分遅れて止まります**。実害はありません
  （23:59 は「押し忘れの保険」であって、秒単位の締め切りではない）
- ⚠️ **サーバーが落ちている間に `measure_until` を過ぎたら、`restoreMeasurements()` が
  起こさずに `stopped` にする**（§4-2）。これが無いと、**翌朝の再起動で1日ぶん回り始めます**

### 5-4. 日をまたぐ計測の注意（09 §5-2-1・§5-7-b-5）

**YouTube の割り当てのリセットは太平洋時間の 0:00**（JST の 16:00〜17:00）で、**JST の日付とはずれます**。
23:59 JST までの既定でも、**JST 16:00 台に1回リセットが入ります**。
実装で守ること: **「今日の消費」を数えるときの「今日」は JST ではなく太平洋時間で切る**（§7-4）。

---

## 6. 組織共通の鍵1本で回す

### 6-1. 読む側

```ts
// server/src/contexts/liveops/org-key.ts
export type OrgKeys = {
  youtubeApiKey: string | null;
  jstreamToken: string | null;
  zoom: { accountId: string; clientId: string; clientSecret: string } | null;
  teams: { tenantId: string; clientId: string; clientSecret: string } | null;
};

/** liveops_org_settings の1行を復号して返す。**人の鍵にフォールバックしない**（09 §5-4） */
export async function loadOrgKeys(): Promise<OrgKeys>;
```

- **`resolve-key.ts` の `resolveKey` を呼ばない。** あれは「自分 → 無ければ他人」なので、
  **誰の割り当てを使っているのか誰にも分からなくなります**（`resolve-key.ts:23-29`）
- 復号できない（`decrypt` が `null`）ときは **`null` として扱い、計測を開始させない**。
  ⚠️ `decrypt` は失敗すると**例外を投げず `null` を返す**（`crypto.ts:38-40`）ので、
  「鍵は入っているのに復号できない」を**必ず「未設定」と同じ扱いにする**こと

### 6-2. 書く側

```
GET  /api/v1/internal/liveops/org-settings    liveops:manager   ← 伏せ字と has* だけ
PUT  /api/v1/internal/liveops/org-settings    liveops:manager   ← 暗号化して保存
POST /api/v1/internal/liveops/org-settings/test/:platform  liveops:manager
```

- **`liveops:manager` だけ**（09 §5-4）。`reader` には GET も出さない
- **応答に平文を1文字も含めない。** `mask()`（末尾4文字）と `hasYoutubeKey` などの真偽値だけ
  （既存の `settings.routes.ts:38-48` と同じ形）
- **空文字が来たら「変更しない」**（既存の `addField`（`settings.routes.ts:73-78`）と同じ作法）。
  **消したいときは明示的な `null`** を受ける（既存には無い経路なので新しく作る）

### 6-3. 鍵をコードに埋めないことの担保

| 担保 | 実体 |
| --- | --- |
| 鍵そのもの（YouTube API キー等）は **DB にしか無い** | `liveops_org_settings` の `*_enc` 列。ソースにも `.env` にも入らない |
| 暗号鍵は **環境変数 `ENCRYPTION_KEY`**。**本番で未設定なら起動時に例外** | `crypto.ts:6-11` |
| `.env` は `.gitignore` 済み。テンプレは `.env.example:20` の**コメント行だけ** | — |
| ログに出さない | `console.log`/`warn` に `OrgKeys` を渡さない。`liveops_poll_log.message` に**API が返した文言だけ**入れる。⚠️ **YouTube のエラー文には URL にキーが載る場合があるので、`message` は保存前に `key=[0-9A-Za-z_-]{20,}` を `key=***` に置換する** |
| 応答に出さない | §6-2 のとおり `mask()` だけ |

⚠️ **最後の1つ（エラー文からの漏れ）は 09 に書かれていません。**
いまの `proxy.routes.ts:39` は `err.response.data.error.message` をそのまま返しており、
**画面には出ますが DB には残っていません**。サーバー側計測では**DB に残る**ので、
**残す前に伏せる**必要があります。→ §12-5

### 6-4. 個人ごとの鍵（`liveops_settings`）は残す。用途を分ける

| | 使うところ |
| --- | --- |
| **組織共通の鍵**（新） | **サーバー側計測**（これだけ） |
| 個人ごとの鍵（既存） | 設定画面の**接続テスト**（`settings.routes.ts:123-236`）。「自分の鍵で試す」用 |

⚠️ **`proxy.routes.ts` の4本（`/youtube` `/jstream` `/zoom` `/teams`）は誰が使うのか。**
サーバー側計測に移したあと、**ブラウザからこれらを呼ぶ経路はゼロになります**。
09 は「取得の中身は既存の proxy をそのまま使う」と書いていますが、
**それはサービス関数の話で、HTTP ルートを残すかは別の判断です**。
**この文書は「残す」を採ります**（接続テストの `untested` の解決に Jstream の LPID が要る等、
デバッグの入口として意味がある）。ただし **`resolveKey` のフォールバックが残っている限り、
`/proxy/youtube` は「誰かの鍵で誰でも 1 ユニット消費できる」経路のままです。**
→ §11 の確認4。

⚠️ **設定画面の「他ユーザーのキーを共有利用中」の文言**（`SettingsPage.tsx:218,249,274,332`）は
**接続テストの文脈に限定して書き換える**こと（09 §5-4 の末尾）。
組織共通の鍵ができた後にこの文言が残ると、**「計測もその人の鍵で回っている」と読まれます**。

### 6-5. 移行

**組織共通の鍵は自動で入れません**（誰の鍵を昇格させるか機械には決められない・09 §5-4）。

- migration では `liveops_org_settings` の**空の1行を作るだけ**
- `liveops:manager` が設定画面で1回入れるまで、**計測は開始できない**
- ⚠️ **入るまでの間も、既存のブラウザ側の取得（`useViewer`）は今までどおり動きます** ——
  ただし §10 の PR 4 で `useViewer` を捨てるので、**PR 4 をマージする前に鍵を入れてもらう**こと。
  順番を逆にすると**視聴者の数え方が丸ごと止まります**

---

## 7. 同時に計測するのは1案件

### 7-1. なぜ1案件か（数字の確認）

| | |
| --- | --- |
| YouTube Data API v3 の既定の割り当て | **1日 10,000 ユニット** |
| `videos.list` は **1回 1 ユニット**（`videoIds` を何本束ねても1回） | `proxy.routes.ts:25-28` が1回で全 videoIds を投げている |
| 取得間隔 10 秒 → 1日 `86400 / 10 = 8,640` 回 | **10,000 の 86%** |
| 余白 | **1,360 ユニット**。**1案件を丸1日回すと、その日は他に何もできない** |
| 引き上げ申請 | **不要**（利用者の判断・09 §5-7-b） |

### 7-2. 排他のかけ方（**画面で断るだけにしない**）

**3段で守ります。**

```sql
-- ① 開始: 「いま誰も回していない」ことを条件に、1文で自分のものにする
UPDATE liveops_programs
   SET measuring = TRUE,
       measure_started_at = NOW(),
       measure_started_by = $2,
       measure_until = $3,
       measure_until_kind = $4,
       measure_fail_count = 0,
       measure_owner = $5          -- インスタンス印（起動ごとの UUID）
 WHERE id = $1
   AND deleted_at IS NULL
   AND measuring = FALSE
   AND NOT EXISTS (SELECT 1 FROM liveops_programs WHERE measuring)
RETURNING id;
```

| 段 | 何で守るか | 抜けるのは |
| --- | --- | --- |
| ① | 上の `UPDATE … RETURNING` の**戻り行数**。0 行なら「いま回っている案件」を返して**断る** | 同時に2本の `UPDATE` が走ると `NOT EXISTS` は両方 true を見うる（READ COMMITTED） |
| ② | **`liveops_single_measurement` 部分ユニーク索引**（§3-2 ③）。①をすり抜けても**2本目の COMMIT が一意違反で落ちる** | — |
| ③ | `restoreMeasurements()` が起動時に `measuring = true` の行を数え、**2行以上あれば全部止めて `system` ログを1行残す** | — |

**②が本体です。** 09 §5-7-b-2 は「同時 1 案件を DB で担保する」と言っていますが、
**その索引が設計書に書かれていません**（§12-4）。

⚠️ **一意違反（`23505`）を 500 にしないこと。**
`UPDATE` を `try/catch` で包み、`err.code === '23505'` なら
**「いま『◯◯』が計測中です（△△が 13:40 に開始）」を 409 で返す**。

### 7-3. `measure_owner`（インスタンス印）

- サーバー起動時に `const INSTANCE_ID = randomUUID()` を1つ作る
- `restoreMeasurements()` は `measuring = true` の行を見つけたら、
  **`measure_owner` が自分でなくても奪う**（`UPDATE … SET measure_owner = INSTANCE_ID`）。
  いまは**単一プロセス**（`socket.ts:17-18` の `Map` が既にそれを前提にしている）なので、
  他のプロセスの印が残っているのは**前のプロセスの残骸**だからです
- ⚠️ **サーバーを2つに増やす日が来たら、この「奪う」を「奪わない」に変える**必要があります。
  そのときは `measure_owner` ＋ ハートビート（`measure_last_ok_at`）で
  「生きている持ち主がいるか」を見る形にします。**いまは作りません**（`socket.ts` の
  タイマー状態が既に単一プロセス前提なので、ここだけ多重化しても意味がない）。
  **この一文をコードのコメントに残すこと**

### 7-4. 「計測していない番組は1回も呼ばない」（09 §5-7-b-1）

**サーバー側計測に移すことで自動的に満たされます** ——
`setInterval` は `measuring = true` の案件にしか張らないためです。

⚠️ **ただしブラウザ側の経路（`proxy.routes.ts`）が残る限り、
「運用画面を開いた人が『開始』を押す」で 1 ユニット消費できます**（§6-4）。
**PR 4 で `useViewer.ts` の `startPolling` / `pollOnce` を消す**こと。
消さずに残すと、**サーバーとブラウザが二重に取りに行って割り当てが倍**になります。

**「今日の消費」の出し方**（09 §5-7-b-4）:

```sql
-- ⚠️ 「今日」は **太平洋時間**。YouTube の割り当てのリセットが太平洋時間 0:00 のため（§5-4）
SELECT COALESCE(SUM(units), 0) AS used
  FROM liveops_poll_log
 WHERE platform = 'youtube'
   AND at >= date_trunc('day', NOW() AT TIME ZONE 'America/Los_Angeles')
             AT TIME ZONE 'America/Los_Angeles';
```

運用画面に「**今日の消費 8,412 / 10,000**」と出す。**10,000 は定数**（引き上げたら直す）。
9,000 を超えたら帯を橙にし、**新しい計測の開始を確認付きにする**（止めはしない）。

---

## 8. `/live/display/:timerId` を1文字も変えない

### 8-1. 変えないことの「証明」（＝契約の一覧）

**表示画面が外に依存しているのは次の5つだけです。この5つを変えなければ、画面は1行も直さずに動きます。**

| # | 契約 | 実体 | この段で触るか |
| --- | --- | --- | --- |
| 1 | **URL `/live/display/:timerId`**（無認証） | `client-live/src/App.tsx:19,57-62`（`pathname.startsWith('/live/display/')` で認証を迂回） | **触らない** |
| 2 | `GET /api/v1/internal/liveops/timers/:id/display` → `{ id, viewer_overlay_program_id, program_id }`、**認証なし** | `timers.routes.ts:11-22` | **触らない** |
| 3 | `GET /api/v1/internal/liveops/snapshots/:programId/display` → **最新1件**の `{ captured_at, youtube_count, jstream_count, zoom_count, teams_count, total_count }`、**認証なし** | `snapshots.routes.ts:10-24` | **触らない** |
| 4 | Socket.IO `/liveops` 名前空間の `timer:join` → `state`（**トークン無しの接続を許可**） | `socket.ts:100,110-116,137-145` ／ `useTimer.ts:18-26` | **触らない** |
| 5 | `localStorage['lv_display_{timerId}']` の7つの切替 | `TimerDisplayPage.tsx:57-72,123-128` | **触らない** |

**サーバー側計測が触るのは `liveops_snapshots` への INSERT だけ**で、
**書き手がブラウザからサーバーに変わるだけ**です（09 §4 の末尾のとおり）。
契約 3 は「最新1件を返す」だけなので、**誰が書いたかを知りません**。

### 8-2. INSERT で守ること

```sql
INSERT INTO liveops_snapshots
  (id, program_id, youtube_count, jstream_count, zoom_count, teams_count, details)
VALUES ($1, $2, $3, $4, $5, $6, $7);
```

- ⚠️ **`total_count` を書かない。** `GENERATED ALWAYS AS (…) STORED` の列です
  （`052:39` で作られ、`095:22-28` で zoom/teams を含む式に作り直されている）。
  **書こうとすると INSERT が落ちます**
- ⚠️ **`captured_at` も書かない**（`DEFAULT NOW()`）
- `details` は **`{ ytDetails: [...] }`**（いまの `useViewer.ts:152` と同じ形）。
  **キー名を変えないこと** — 表示画面は使っていませんが、運用画面の内訳表示が読みます
- `id` は `uuidv4()`（`snapshots.routes.ts:35` と同じ）

### 8-3. 検査で守る（口約束にしない）

- `shared/tests/` に **表示画面の契約を固定する小さいテスト**を1本置く
  （`shared/tests/crossAppLinks.test.ts` と同じ形。**文字列を固定して見張るだけ**）:
  - `client-live/src/App.tsx` に `'/live/display/'` の文字列が残っていること
  - `client-live/src/pages/TimerDisplayPage.tsx` に
    `'/api/v1/internal/liveops/timers/'` と `'/api/v1/internal/liveops/snapshots/'` が残っていること
  - `server/src/contexts/liveops/routes/snapshots.routes.ts` の `/:programId/display` が
    **`canRead` を通っていない**こと（認証を足すと表示画面が真っ白になる）
- `git diff --stat -- client-live/src/pages/TimerDisplayPage.tsx` が
  **見た目の作り直し以外で動いていない**ことを PR の説明に書く

### 8-4. 表示画面の「中身だけ作り直す」の範囲

09 §1-5 は「URL・無認証ともそのまま。**中身だけ作り直す**」としています。
**中身を作り直すと `TimerDisplayPage.tsx` は当然変わります。** §8-3 のテストは
「**外との契約を表す5つの文字列が消えていないか**」を見るものであって、
「ファイルが変わっていないか」ではありません。**そこを混同しないこと。**

⚠️ **表示画面の作り直しは、他の画面と別の PR に切る**こと（§10 の PR 6）。
本番の出力そのものなので、**戻すときに1本だけ戻せる**形にしておきます。

### 8-5. 計時LIVE を制作資料に統合するときの移行

| # | やること | 注意 |
| --- | --- | --- |
| 1 | `/live/program/:programId` → `/live/?project=…` の**リダイレクトを残す**（09 §2-3） | ブックマークされている。`RedirectOnce`（`shared/src/client/RedirectOnce`）が既にある |
| 2 | `/live/program/:programId/timers` → `/live/timers`、`/live/program/:programId/settings` → `/live/sources` も同様 | — |
| 3 | セッション一覧（`/live/` の `SessionHomePage`）をやめ、案件の文脈で運用画面を出す | ⚠️ **`/live/` そのものは残る**（`server/src/app.ts:144` が `/live` に SPA を配っている） |
| 4 | 案件のミニアプリを初めて開いたとき `liveops_programs` を1件自動で作る | ⚠️ `liveops_programs_project_key`（§3-2 ⑤）があるので**2件目は作れない**。`ON CONFLICT DO NOTHING` ではなく、**先に SELECT して無ければ INSERT** を1トランザクションで |
| 5 | `project_id` が無い既存セッションの扱い | → §11 の確認1 |
| 6 | **`client-live` の凍結を解く** | `shared/src/client/apps.ts:148` の `frozen: true` を落とし、`check-frozen-css.mjs:45-49` から `live` を外し、`check-shared-wiring.mjs:207` の `V4_APPS` に `client-live` を足す。→ §12-7 |
| 7 | `docs/wording.md` に「計時・視聴者」を足す（09 §2-1・§7-7） | 改称の確認が要る |

⚠️ **`/live/` は `client-qsheet` とは別バンドルです**（`client-live/vite.config.ts:7`）。
「制作資料のミニアプリ」として上辺バーのセグメントに並べても、
**押すとページ全体が読み直されます**（バンドルをまたぐため）。
09 はここに触れていません。→ §12-8

---

## 9. 検証手順

**本番・検証の DB には一切触りません。** 検証用 Postgres（ポート 5433・`onair_verify`）だけを使います。

```bash
npm run verify:up
source /tmp/onair-verify/env.sh
npm run typecheck && npm run lint && npm run test
```

### 9-1. DDL

| # | 確かめること |
| --- | --- |
| 1 | migration が流れる（`_migrations` に新ファイル名が入る） |
| 2 | `liveops_org_settings` に **2行目を作れない**（`CHECK (id)` ＋ BOOLEAN PK） |
| 3 | `polling_interval_sec` に 4 も 301 も入らない |
| 4 | `main_timer_id` に**実在するタイマーの UUID**を入れられる（型が合っている） |
| 5 | `measuring = true` の行を**2つ作れない**（`liveops_single_measurement` の一意違反） |
| 6 | `measuring = false` の行は**何行でも作れる**（部分索引が効いている） |
| 7 | 1案件に2セッションがある状態で `liveops_programs_project_key` を張ると**落ちる**（§3-4 の前提確認） |
| 8 | 案件を消すと `liveops_poll_log` も消える（CASCADE） |
| 9 | ⚠️ **`liveops_snapshots` に `total_count` を書こうとすると落ちる**（§8-2 の確認） |

### 9-2. 計測（時計を動かして確かめる）

| # | 確かめること | どうやって |
| --- | --- | --- |
| 1 | 鍵が未設定なら**開始できない**（400。「組織共通の鍵が未設定です」） | `liveops_org_settings` を空のまま POST |
| 2 | 2案件目の開始が **409** で、いま回っている案件と開始者が返る | 1案件を開始 → 別案件を開始 |
| 3 | **一意違反が 500 にならない**（409 に落ちる） | 同時に2本 POST |
| 4 | `measure_until` が **開始日の 23:59:59 JST** になる | JST 00:30 と JST 23:50 の両方で（`Date` を差し替えてテスト） |
| 5 | ⚠️ **UTC で走るコンテナで日付がずれない** | `TZ` を空にして `defaultMeasureUntil()` の単体テスト。**JST 08:00 前後**（UTC の日付が前日）を必ず含める |
| 6 | 過去の時刻を手入力すると **400** | — |
| 7 | `measure_until` を過ぎたら**次の取得で止まる** | `measure_until` を1分後にして待つ |
| 8 | **サーバー再起動で復元される**（`measuring = true` の案件が再び回る） | プロセスを落として上げる |
| 9 | **再起動時に `measure_until` を過ぎていたら起こさない** | `measure_until` を過去にして再起動 |
| 10 | 失敗5回で打ち切り、`system` のログが1行残る | 鍵を壊した値に差し替える |
| 11 | ⚠️ **`measure_fail_count` がサイクル単位**（4プラットフォームで2サイクル打ち切りにならない） | 全部失敗する状態で 4 サイクル回す |
| 12 | **運用画面を閉じても記録が増え続ける** | ブラウザを閉じて `liveops_snapshots` の件数を数える |
| 13 | **表示画面の数字が止まらない** | `/live/display/:id` を開いたままにして 60 秒 |
| 14 | 停止すると記録が増えなくなる | — |

### 9-3. 割り当て

| # | 確かめること |
| --- | --- |
| 1 | 計測していない案件は **YouTube を1回も呼ばない**（運用画面を開いただけ・一覧を出しただけ） |
| 2 | `liveops_poll_log` の `units` の合計が、YouTube を呼んだ回数と一致する |
| 3 | 「今日の消費」が**太平洋時間**で切り替わる（JST 16:00 台にリセットされる） |
| 4 | ⚠️ **ブラウザ側の `useViewer` が消えている**（`grep -rn "startPolling" client-live/src` が空） |

### 9-4. 秘密

| # | 確かめること |
| --- | --- |
| 1 | `GET /liveops/org-settings` の応答に**平文が1文字も無い**（`****` だけ） |
| 2 | `reader` が `GET /liveops/org-settings` を**取れない**（`manager` だけ） |
| 3 | ⚠️ **`liveops_poll_log.message` にキーが残らない**（`key=AIza…` を含むエラー文を仕込んで、`key=***` になること） |
| 4 | `console` にキーが出ない（`grep -rn "OrgKeys\|apiKey" server/src/contexts/liveops/*.ts` で `console` に渡していないこと） |

### 9-5. 表示画面（**壊していないことの確認**）

| # | 確かめること |
| --- | --- |
| 1 | `/live/display/:timerId` が**ログインなしで開く**（別ブラウザ・シークレットウィンドウ） |
| 2 | タイマーが動く（Socket が繋がる） |
| 3 | 3レイアウト（タイマーのみ／6:4／視聴者のみ）が歯車から切り替わる |
| 4 | 白ベース反転が効く |
| 5 | 切替が**この端末にだけ**残る（別のブラウザでは既定に戻る） |
| 6 | `?programId=` の上書きが効く |
| 7 | §8-3 のテストが通る |

### 9-6. 画面

```bash
npm run verify:ui
npm run build:all && npm run check:frozen     # 凍結の基準を更新するとき
```

- **375px で横スクロールが出ない**こと。タップ対象 44px 以上（±調整は 46px・09 §3-4）
- 数字は `tabular-nums`（桁が揺れない）
- 計時中のリセットは**下から出るシート**（スマホ）／ダイアログ（PC）
- ⚠️ **トーストを `NoticeBar` に置き換えない**（放送中の切断通知を含む・09 §6）

---

## 10. PR の切り方

**7本に割ります。**

| # | PR | 中身 | なぜ分けるか |
| --- | --- | --- | --- |
| **1** | `refactor(live): 視聴者の取得をサービス関数に切り出した` | `viewer-sources.service.ts` を新設し、`proxy.routes.ts` がそれを呼ぶだけにする。**挙動を1つも変えない** | 差分が「移しただけ」と読めるうちに入れる |
| **2** | `feat(live): 組織共通の鍵を持てるようにした` | §3-2 ① の DDL ＋ `org-key.ts` ＋ §6-2 の API ＋ 設定画面の「組織共通の鍵」の節。**計測はまだ動かない** | 鍵を先に入れてもらう必要がある（§6-5） |
| **3** | `feat(live): 視聴者の取得をサーバー側に移した` | §3-2 ②③④ の DDL ＋ `measure.service.ts` ＋ `measure.routes.ts` ＋ `restoreMeasurements()`。**画面はまだ古いまま** | **いちばん大きい。単独で戻せるようにする** |
| **4** | `feat(live): 運用画面を計測の状態で回すようにした` | 運用画面が `useViewer` ではなく計測の状態を読む。**`useViewer.ts` を消す** | ⚠️ **3 と 4 の間は二重に取りに行かない**こと。3 では**画面の「開始」ボタンを無効にして「サーバーで計測します」と出す** |
| **5** | `feat(live): 黄色のしきい値と運用画面のタイマーを選べるようにした` | §3-2 ② の `main_timer_id` を使う画面 ＋ `warning_threshold_sec` の UI（API は既にある） | 小さく独立している |
| **6** | `feat(live): 表示画面を v4 の見た目にした` | `TimerDisplayPage.tsx` ＋ §8-3 のテスト | **本番の出力。1本だけ戻せるように** |
| **7** | `feat(live): 計時・視聴者を制作資料のミニアプリにした` | 導線・URL の付け替え・リダイレクト・凍結解除・レジストリ | 01 のレジストリ待ち（→ §12-8） |

⚠️ **PR を出したらその場で `.claude/skills/pr-watch` を使って見張ること。**
⚠️ **マージしたらレビュー指摘を `npm run reviews:debt` で棚卸しへ移すこと。**

### changelog.d の1文案

`docs/changelog.d/<枝の名前>.md` に1ファイル。**版の3か所は触らない。**

> **視聴者数の集計をサーバー側に移し、運用画面を閉じても本番中の数字が止まらないようにした。**
> これまでは運用画面を開いているブラウザが取りに行っていたため、本番中に画面を閉じると
> `liveops_snapshots` に記録が増えなくなり、会場モニターと OBS が読む表示画面
> （`/live/display/:timerId`）の数字が最後の記録のまま固まっていた。「計測」を明示的に始めて
> 終える単位にし、サーバーが取得間隔ごとに回す形にした。⚠️ **YouTube の割り当ては1日 10,000
> ユニットで、取得間隔 10 秒だと1案件で約 8,640 使う**ため、**同時に計測できるのは1案件**とし、
> 画面で断るだけでなく部分ユニーク索引で担保した。押し忘れによる浪費は**開始日の 23:59（JST）の
> 自動停止**で止め、24時間を超える番組は終了時刻を手で入れて延ばせるようにした。計測に使う鍵は
> **組織共通の1本**（`liveops_org_settings`）にし、**人の鍵にはフォールバックしない**（誰の割り当てを
> 使っているか分からない今の形をやめる）。サーバー側の失敗が誰にも見えなくなるため、取得の記録を
> `liveops_poll_log` に残すようにした。⚠️ **`/live/display/:timerId` の URL・無認証・API 契約・Socket
> 契約は1文字も変えていない**（書き手がブラウザからサーバーに変わるだけで、表示画面は
> `liveops_snapshots` の最新1件を読み続ける）。
> 検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。検証用 Postgres（5433）で DDL・
> 排他・JST の日付境界・再起動復元を実測。

---

## 11. 未決・要確認

### 11-1. 09 §7 が挙げた確認（未決のまま）

| # | 論点 | 実装がどう分岐するか | 既定 |
| --- | --- | --- | --- |
| 1 | **案件に紐づいていない既存セッションをどうするか** | 資料単体として残すなら、案件を持たない `liveops_programs` を運用画面から開く経路が要る（＝URL に programId が要る＝09 §2-3 の「programId を URL に出さない」と衝突） | 移行時に人が案件を選ぶ |
| 2 | ⚠️ **1案件に複数セッションがある既存データはあるか** | **これが「ある」だと migration が落ちます**（§3-4）。着手前に検証 DB ではなく**本番の件数を数えてもらう**必要があります | — |
| 3 | 権限区画を `liveops` のままにしてよいか | `qsheet` に寄せると、既存の `liveops` 権限者が全員締め出される | `liveops` のまま（09 §0-6） |
| 4 | `viewer_overlay_program_id` を画面に出すか | 出さない前提。**ただし表示画面は読んでいる**（`TimerDisplayPage.tsx:95`）ので、**列は消せません** | 出さない |
| 5 | Singular Live 連携 | 触らない | 触らない |
| 7 | 「計時LIVE」→「計時・視聴者」の改称でよいか | `docs/wording.md` に追記 | 改称する |

### 11-2. この文書で新しく出た確認

| # | 論点 | なぜ聞くか |
| --- | --- | --- |
| 1 | **取得間隔の正を組織共通にしてよいか**（§3-2 ①・§12-3） | いまは1人1行（`liveops_settings.polling_interval_sec`）。**サーバーには「その人」がいない**ので、どこかに1本置くしかありません。「案件ごとに変えたい」なら `liveops_programs` に持つ形になります |
| 2 | **計測の開始・停止を誰ができるか** | 09 は書いていません。既定は **`liveops:manager`**（`proxy.routes.ts:13` の `canWrite` と同じ）。⚠️ **`reader` にすると、現場の誰でも「今日の割り当てを1案件ぶん使い切る」ボタンを押せます** |
| 3 | **`liveops_poll_log` を何日残すか** | §4-5 は「計測が終わったら 500 行／30 日で消す」。**「今日の消費」しか使わない**なら 7 日でも足ります |
| 4 | ⚠️ **`/proxy/*` の HTTP ルートを残すか**（§6-4） | 残すと「`liveops` の reader なら誰でも 1 ユニット消費できる」経路が残ります。**接続テストだけなら `settings.routes.ts:123` の `/test/:platform` で足ります** |
| 5 | **`measure_platforms` の初期値を何にするか** | §3-2 は4つ全部 ON。**ただし「設定されていないプラットフォーム」は取りに行かない**（`youtube_urls` が空なら呼ばない）ので実害はありません。「既定は YouTube だけ」にしたいかどうか |
| 6 | **9,000 ユニットを超えたときに開始を止めるか**（§7-4） | 既定は「確認を挟むが止めない」。止めるなら**本番中に開始できない日が出ます** |

---

## 12. 設計書と実装の食い違い

### 12-1. ⚠️ 09 の DDL は Postgres でそのまま流れない（**最重要**）

| 09 の記述 | 実装 | 何が起きるか |
| --- | --- | --- |
| §4: `ADD COLUMN main_timer_id TEXT REFERENCES liveops_timers(id)` | `liveops_timers.id` は **UUID**（`052:47`） | **`ALTER TABLE` が型不一致で落ちる**。migration がロールバックされ、それ以降の migration も全部止まる |
| §5-5: `liveops_poll_log.program_id TEXT NOT NULL REFERENCES liveops_programs(id)` | `liveops_programs.id` は **UUID**（`052:18`） | 同上 |
| §5-4: `liveops_org_settings.updated_by TEXT REFERENCES users(id)` | `users.id` は **TEXT** | ✅ **これは正しい** |

**`migrate.ts:33-39` はトランザクションで包んで `ROLLBACK` するので、DB は壊れませんが起動が止まります。**
→ §3-2 で全部 UUID に直しました。

### 12-2. ⚠️ 「いまのブラウザ側の実装は開いている間ずっと呼びます」は正しくない

09 §5-7-b-1 の記述:

> 1. **計測していない番組は 1 回も呼ばない。** 運用画面を開いただけ・一覧を出しただけで
>    `videos.list` を呼ばないこと（**いまのブラウザ側の実装は開いている間ずっと呼びます**）。

**実際には、いまも「開始」ボタンを押すまで1回も呼びません。**
`useViewer` の `setInterval` は `startPolling()` の中でしか張られず（`useViewer.ts:161-167`）、
`DashboardPage.tsx:172-181` はそれをボタンの `onClick` に繋いでいるだけです。
`useEffect` による自動開始はありません（`:176-181` は**停止とリセットだけ**）。

**影響**: 「開けば消費する」を根拠に急ぐ理由はありません。
ただし **§7-4 の指摘（サーバーとブラウザの二重取得）は依然として正しく、PR 4 で `useViewer` を消す必要があります。**

### 12-3. ⚠️ 「既存の `polling_interval_sec` をそのまま使う」は成立しない

09 §5-2 の表:

> | 間隔 | 既存の `liveops_settings.polling_interval_sec`（5〜300秒・既定 10）をそのまま使う |

`liveops_settings` は **PK が `user_id` の1人1行の表**（`052:9`）で、
値は**画面が自分の行を読んで `useViewer` に渡している**だけです（`DashboardPage.tsx:64-67,85`）。
**サーバー側計測には「その人」がいないので、どの行を読むのか決められません。**

（`initLiveopsServices` の Teams トークンは
`ORDER BY updated_at DESC LIMIT 1` で「誰かの行」を拾っています（`index.ts:33-40`）が、
**これはまさに 09 §5-4 が「誰の割り当てを使っているか分からない」と批判している形**です。
取得間隔で同じことをするのは筋が通りません。）

→ §3-2 ① で **`liveops_org_settings.polling_interval_sec`** に置きました。

⚠️ **`liveops_settings.polling_interval_sec` は残します**（接続テストの画面が使う）。
**2つある状態になるので、設定画面で「どちらが計測に効くか」を明示すること。**

### 12-4. ⚠️ 「同時 1 案件を DB で担保する」の実体が書かれていない

09 §5-7-b-2 は

> 2. **同時 1 案件を DB で担保する。**「画面で断る」だけでは多重起動で抜けます
>    （→ §5-3 の `measure_owner` による取り合いの解決と同じ仕組みで、**開始時に本数を数えて弾く**）。

としていますが、**`measure_owner` は「どのインスタンスが持っているか」の印で、
「全体で1本」を担保しません**（インスタンスが1つでも、同じインスタンスが2案件を回せます）。
「開始時に本数を数えて弾く」は **READ COMMITTED では競合すると両方通ります**。

→ §3-2 ③ の**部分ユニーク索引 `liveops_single_measurement`** が本体です。§7-2 で3段にしました。

### 12-5. ⚠️ エラー文に API キーが載る経路が塞がれていない

いまの `proxy.routes.ts:39` は

```ts
res.status(status).json({ success: false, message: err?.response?.data?.error?.message || 'YouTube API error' });
```

で、**API が返した文言をそのまま画面に返しています**。画面だけなら痕跡は残りませんが、
09 §5-5 の `liveops_poll_log.message` は**「失敗の理由（API が返した文言）」を DB に保存します**。
Google の 400 系のエラー文には**リクエスト URL が含まれることがあり、そこに `key=` が載ります**。

→ §6-3 で「保存前に `key=[0-9A-Za-z_-]{20,}` を伏せる」を足しました。**09 には書かれていません。**

### 12-6. ⚠️ 「`liveops_poll_log` の行数がそのまま消費数になります」は正しくない

09 §5-7-b-4:

> **こちらで呼んだ回数を数えます**（`liveops_poll_log` の行数がそのまま消費数になります）。

- **Zoom は meeting と webinar で2回呼びます**（`proxy.routes.ts:86-93` ／ `useViewer.ts:110,119`）
- **Teams は API を呼びません**（`Map` を読むだけ・`proxy.routes.ts:112`）
- 09 §5-5 自身が「**`ok` は 10 回に 1 回だけ書く**」と言っており、**間引いた行は数に入りません**

**行数と YouTube の消費数は一致しません。**
→ §3-2 ④ で `units` 列を足し、§4-5 で「YouTube だけは毎サイクル1行」に決めました。

### 12-7. ⚠️ 凍結を解く作業の範囲が 09 に書かれていない

09 §6 は「シェルを制作資料の上辺バー＋ミニアプリのセグメントに」「背景をグレーのキャンバスに」と
**v4 の見た目に変える前提**ですが、`client-live` は `frozen: true` のままです。

| 検査 | いまの状態 | 直すもの |
| --- | --- | --- |
| `shared/src/client/apps.ts:148` | `frozen: true` | 落とす（一覧・アプリ切替に出る） |
| `scripts/check-frozen-css.mjs:45-49` | `live` を見張る | 外す |
| `scripts/check-shared-wiring.mjs:207` | `V4_APPS` に `client-live` が無い | **足す。足さないと「凍結アプリを共通シェルに載せ替えないこと」で lint が落ちます**（`:236-238`） |
| 同 `:242-253` | 凍結アプリは `<NoticeBar />` `<ConfirmHost />` が **0 個**であることを期待 | v4 に入ると **1 個**が期待値になる（共通シェルが持つぶんで満たす） |
| 同 `:254-256` | `<Toaster />` は `client-qsheet` だけ 1 個 | ⚠️ **09 §6 は「トーストを `NoticeBar` に置き換えない」と言っています。** `client-live` にトーストを足すなら**この行の期待値も変える**必要があります。→ §11 の確認と一緒に決める |
| `scripts/check-mobile-declared.mjs:23-45` | v4 対象3アプリだけ | `client-live` を足し、`client-live/src/pcOnlyScreens.ts` を新設する |

### 12-8. ⚠️ 「制作資料のミニアプリ」だが**別バンドル**である

09 §2-1 は「Qシート／スケジュール表と並ぶミニアプリ」とし、§2-3 は URL を `/live/*` のままにします。
しかし `client-live` は **`base: '/live/'` の独立したバンドル**（`client-live/vite.config.ts:7`）で、
`client-qsheet` は `base: '/qsheet/'`（`client-qsheet/vite.config.ts:7`）です。

**したがって、上辺バーのセグメントで「Qシート ↔ 計時・視聴者」を切り替えると、
毎回ページ全体が読み直されます**（`server/src/app.ts:143-144` が別々の SPA を配っている）。

**選べるのは2つだけ**です:

| 案 | 中身 | 代償 |
| --- | --- | --- |
| **A（09 の既定）** | `/live/*` のまま。切替でページが読み直される | 見た目は繋がるが**体感は繋がらない**（1〜2秒の白）。⚠️ ただし **`/live/display/:timerId` は無傷** |
| B | 計時の運用画面を `client-qsheet` に移し、`/qsheet/live` にする | ⚠️ **`/live/` の運用画面の URL が変わる**（表示画面は `/live/display/` のまま `client-live` に残す）。**バンドルが2つに割れて、タイマーの Socket 接続コードが二重になる** |

**この文書は A を採ります**（09 §0-3 の「配布済みの URL を守る」が最優先で、
B は `client-live` を「表示画面だけの殻」にする大工事になるため）。
**ただし「押すと白くなる」ことを 09 は書いていないので、利用者に伝えること。**

### 12-9. ミニアプリ・レジストリの型に載らない（08 と同じ問題）

01 §3-2 の `MiniAppDef` は `docPrefix` / `docNoSeq` / `table` / `docPath` を**全部必須**にしており、
`MiniAppKey` は `'sheet' | 'schedule'` の2つに固定されています。
**計時・視聴者は「案件に1つの道具」で、資料番号も一覧も1件ずつの URL も持ちません。**

→ **08 の実装設計 §10-2 と同じ提案**（`kind: 'document' | 'panel'` の判別子を足す）。
**08 と 09 で2件まとめて 01 の担当に投げること。**

### 12-10. 事実として正しかったもの（確認済み・直す必要なし）

| 09 の記述 | 確認 |
| --- | --- |
| 「本番中に運用画面を閉じると取得が止まる」 | ✅ `useViewer.ts:181` の `useEffect` クリーンアップで `clearInterval` |
| 「`liveops_snapshots` を変えないことが重要。表示画面はこの表を読んでいる」 | ✅ `snapshots.routes.ts:10-24` ／ `TimerDisplayPage.tsx:106` |
| 「Teams は既に push でサーバー側」「サーバー再起動で 0 に戻る」 | ✅ `teams-subscription.ts:5,60,71`（プロセス内の `Map`） |
| 「`warning_threshold_sec` は既にあるので DDL は不要。API と画面を足すだけ」 | ✅ `052:55` ＋ `timers.routes.ts:65,73,90,94` が既に受けている |
| 「運用画面が使うタイマーは常に `timers[0]`」 | ✅ `DashboardPage.tsx:83` |
| 「取得対象の ON/OFF は端末の `localStorage['lv_dash_platforms_{programId}']`」 | ✅ `DashboardPage.tsx:34,54` |
| 「ログは画面の中のメモリだけ・100件」 | ✅ `useViewer.ts:54-56` |
| 「表示画面は無認証で、`App.tsx` がパスを見て専用ルーターを立てる」 | ✅ `App.tsx:15-23,57-62` |
| 「視聴者数は記録を 15 秒ごとに読む」 | ✅ `TimerDisplayPage.tsx:119` |
| 「`resolve-key.ts` が他人の鍵にフォールバックする」 | ✅ `resolve-key.ts:23-29` |
| 「Teams のサブスク更新と同じ形に倣う」 | ✅ `liveops/index.ts:28-52` ／ `teams-subscription.ts:88-110` |
| 「`toISOString()` を使うと1日ずれる」「JST 固定」 | ✅ `jst.ts:1-23`（**`TZ` は Alpine で効かない**まで書いてある） |
| 「暗号化は既存と同じ AES-256-GCM（`liveops/crypto.ts`）」 | ✅ `crypto.ts:17-41` |
| 「migration 210 で7区画に統合済みなので区画を増やさない」 | ✅ `210_simplify_permission_modules.sql:1-30` |
| 「`videos.list` は 1 回 1 ユニット」「取得間隔 10 秒で 1日 約 8,640」 | ✅ 実装は videoIds を**1回で束ねて**投げている（`proxy.routes.ts:25-28`）ので、この数え方で正しい |

### 12-11. PR5〜7 着手時の追記（2026-08-22・利用者から「凍結解除が進んでいると思っていた」の指摘を受けて着手）

PR1〜4（視聴者取得のサーバー移行本体）はマージ済みだったが、**PR5〜7（しきい値UI・
表示画面のv4化・凍結解除本体）が未着手のまま長期間放置されていた**ことが発覧した。
以下の順で着手し、§12-7〜12-9 の指摘を踏まえてスコープを絞った。

- **PR5**（main_timer_id/しきい値UI）・**PR6**（表示画面のv4化）: §10 の記述どおり実装。
  検証で `programs.routes.ts` の既存バグ（`projectId` 省略時に `project_id` がNULL上書きされる）
  も見つかり合わせて修正した。
- **PR7（この節が対象）**: §12-7 が指摘する「凍結を解く作業」は、実際には
  **v4 共通シェルへの載せ替え一式**（`check-shared-wiring.mjs` の `V4_APPS` 登録・
  `NoticeBar`/`ConfirmHost` 個数期待値の変更・`check-mobile-declared.mjs` 対応・
  `check-frozen-css.mjs` からの除外）を指しており、これは**制作資料（Qシート）自身も
  まだ終えていない作業**（CLAUDE.md「まだ v4 の共通シェルには載せ替えていない」）。
  そのため PR7 では**制作資料の段3が最初に踏んだのと同じ最小の一歩**——
  `apps.ts` の `frozen: true` を落とすことだけ——を実装し、`check-frozen-css.mjs` /
  `verify-ui.mjs` の `FROZEN_PREFIX` / `check-shared-wiring.mjs` の `V4_APPS` /
  `MINI_APPS` レジストリへの登録は**あえて触っていない**。理由:
  - 表示画面（`/live/display`）以外の運用画面（ダッシュボード・設定等）はまだ旧shellのまま
    見た目を変えていないので、`check-frozen-css.mjs` から外すと「見た目を変えていない」
    という保証を機械が見なくなる（qsheetが段3→段5 PR8の間そうだったのと同じ中間状態）
  - §12-9 が指摘したとおり `MiniAppDef`（`kind: 'document' | 'panel'`）は
    「同一バンドル内のURL」を前提にしており、`client-live` は独立バンドル
    （§12-8「案A」= `/live/*` のまま・切替でページが読み直される、を維持）なので
    無理に型へ押し込めると `panelPathOf`/`miniAppOfPath` の前提が崩れる
  - **改名（「計時LIVE」→「計時・視聴者」・§11-1 #7 の既定）も見送った** — 40本超の
    ファイルにまたがる名称変更で、この段の範囲を大きく超えるため
  - `shared/tests/apps.test.ts` を `frozen` が `['awards']` だけになるよう更新し、
    `visibleApps()` の既定で `qsheet` と並んで `liveops` も出ることを固定した

  **残作業**（v4共通シェルへの載せ替え・ミニアプリのレジストリ登録・改名）は、
  制作資料自身の共通シェル載せ替えと合わせて別段で行うことを推奨する。
