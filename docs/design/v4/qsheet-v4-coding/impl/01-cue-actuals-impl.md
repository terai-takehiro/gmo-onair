# 段1 実装設計 — `qsheet_cue_actuals` ＋ OnAir からの実尺記録

> **実装設計です。コードは1行も書いていません。**
> 上位の設計書は [`../07-onair-roles.md`](../07-onair-roles.md) §3 と
> [`../04-ai.md`](../04-ai.md) §5-3a、順序は [`../README.md`](../README.md) §7 の**段1**。
>
> **この文書は「設計書どおりに書けるか」を実装で確かめた結果を含みます。**
> 確かめた結果、設計書と食い違う点が **9 件**ありました（§11）。
> 特に **①`cue:reset` は run_id の運び手になれない**、
> **②直す対象の `flatCues` は書き手の関数ではない**、
> **③migration の実際の最大は 210 ではなく 211** の3件は、
> そのまま実装すると**動かない・番号がぶつかる**ものです。

---

## §1 この段でやること

**本番1回（run）のあいだ、キューが切り替わるたびに「そのキューに実際どれだけかかったか」を
1行ずつ DB に残す。** それだけです。

| やる | やらない |
| --- | --- |
| `qsheet_cue_actuals` を1本作る | AI は1行も呼ばない（`../04-ai.md` §8-2） |
| 進行（OnAir）から実尺を fire-and-forget で POST する | ランダウン／プロンプター／公開音声の**挙動を変えない** |
| 過去の run を読む GET を1本足す | 実尺を**画面に出す**（`RundownPage` の表示は今のまま） |
| 取得率（`runs_measured / broadcasts_total`）を数える SQL を置く | 取得率を画面や digest に出す（それは 04-c の段） |

**なぜ最初にやるか**: 「この型のロールは予定より平均 N 秒押す」は AI が無くても次回の尺見積もりに
効きます。逆に後回しにすると、AI を出した日から数か月は**集計する中身が空**です
（[`../README.md`](../README.md) §7・[`../04-ai.md`](../04-ai.md) §13-4）。

**この段が守る約束**

- `qsheet_documents.data` は Yjs の所有物。**サーバーは書かない**
  （`server/src/contexts/qsheet/collab.ts:68` が3秒ごとに丸ごと上書きする。同 `:77` が周期の 3000ms）。
  この段は `data` を**読むだけ**で、書き込み先は新しい表だけです。
- 公開URL5本（`editor` / `onair` / `rundown` / `prompter` / `audio`）と
  `/live/display/:timerId` は**1文字も変えない**。
- **本番中は AI を1回も呼ばない／記録は全部 best-effort。**
- **本番4画面の見た目を変えない。** 具体的な守り方は §6-4。

---

## §2 実装前の事実確認（実装を読んで確かめたこと）

**ここに書いた行番号は 2026-08-21 時点の `claude/qsheet-v4-coding-guide-udbo1u` のものです。**

### 2-1. 実尺の書き手は誰か（＝設計書の主張は本当か）

**設計書の主張は正しい。実装で裏が取れました。**

| 事実 | 場所 |
| --- | --- |
| 進行（OnAir）が emit するのは **`cue:update` の1本だけ** | `client-qsheet/src/pages/OnAirPage.tsx:356-359` |
| 進行は `cue:next` / `cue:prev` / `cue:jump` / `cue:play` / `cue:pause` / `cue:reset` を**受けるだけ** | `client-qsheet/src/pages/OnAirPage.tsx:337-346` |
| `cue:*` の**コマンドを emit しているのはランダウンだけ** | `client-qsheet/src/pages/RundownPage.tsx:320-341` |
| プロンプター・公開音声は **1つも emit しない** | `client-qsheet/src/pages/PrompterPage.tsx:98-133` / `client-qsheet/src/pages/AudioSupportPage.tsx:305-334` |
| 客観確認: `client-qsheet/src` 全体の `emit(` は 上記＋`presence:query`＋Yjs の3本のみ | `grep -rn "emit(" client-qsheet/src` |

→ **`cue:next` を計測点にすると、進行卓だけで回す本番は1行も残りません。**
設計書の「書き手は進行（OnAir）の1台に固定する」は妥当です。

**進行がすべての切り替わりを見られるか（＝1台に固定して漏れないか）**: 見られます。

- ローカル操作（Space / →← / CM の自動送り）は `setCur` を通る
  （`OnAirPage.tsx:208-237` の `go` / `next` / `prev`、`:192-200` の CM 自動送り）。
- ランダウンからの操作も `cue:next` / `cue:prev` / `cue:jump` を受けて `setCur` を通る
  （`OnAirPage.tsx:337-343`）。

→ **`cur` の変化を1か所で見張れば、操作の出どころに関係なく全部拾えます。**
これはランダウンが既にやっていることと同じ形です（`RundownPage.tsx:140-152`）。

### 2-2. cue（キュー）の単位と id の作られ方

**⚠️ 進行とランダウンは、別々の関数でキューを平坦化しています。**

| 画面 | 関数 | 型 | id |
| --- | --- | --- | --- |
| 進行（OnAir） | `buildCues` | `FlatCue { type, label, duration, start, oa, row? }` | **id を1つも持たない**（`row?.id` が取れるのは通常行だけ） |
| ランダウン | `flatCues` | `FlatCue { sectionLabel, sectionIdx, row, startTime, globalIndex }` | CM/VTR/ロール一括に **`cm-<sIdx>` / `vtr-<sIdx>` / `sec-<sIdx>`** を合成 |

- 進行の型定義: `OnAirPage.tsx:44-51`（**`id` も `sectionIdx` も無い**）
- 進行の平坦化: `OnAirPage.tsx:72-107`
  - `_pageBreak` は飛ばす（`:81`）／`_break`→CM（`:82-85`）／`_vtr`→VTR（`:86-89`）
  - 行の尺合計が 0 かつ `section.duration` があればロール全体を1キュー（`:92-98`）
  - それ以外は行ごとに1キュー（`:99-103`。ここだけ `row` が付く）
- ランダウンの平坦化: `RundownPage.tsx:208-250`。合成 id は `:218` / `:227` / `:237`

→ **設計書（07 §3-2 / 04 §5-3a）が「直せ」と言っている `RundownPage.tsx:218-240` の `flatCues` は、
書き手の関数ではありません。** 直すべきは **`OnAirPage.tsx:72-107` の `buildCues`** です（§11 #2）。

**配列 index 由来の合成 id が実在するか**: **実在します**（`RundownPage.tsx:218,227,237`）。
ただし**進行側にはそれすら無く**、CM/VTR/ロール一括のキューは `label` しか持ちません。
つまり進行から素直に取れる識別子は現状 **`row.id`（通常行のみ）** だけです。

### 2-3. `section_id` ＋ `pass_no` が実装から取れるか

**`section_id`: 取れます。ただし「必ず入っている」とは言えません。**

- `section.id` / `row.id` は `ensureStableIds()` が付けます（`client-qsheet/src/lib/stableIds.ts:22-30` の `genId`、
  `:43` の `ensureStableIds`）。
- **これを呼んでいるのは編集画面だけ**です（`client-qsheet/src/pages/EditorPage.tsx:272`、
  および共同編集の差分器 `client-qsheet/src/lib/collab/ydocDiff.ts:188-190`）。
  進行・ランダウン・プロンプター・公開音声は**素の `data` をそのまま読みます**
  （`OnAirPage.tsx:163-173` / `RundownPage.tsx:193-203`）。
- → **「安定 id が入る前に作られ、その後1度も編集画面で開かれていない台本」は
  `section.id` / `row.id` を持ちません。** 設計書の `section_id TEXT NOT NULL` は
  そのままでは満たせない場合があります（§11 #6・§10 #1）。

**`pass_no`: 実装からは取れません。進行が数えて送る値です。**

- 戻り（`prev`）は `OnAirPage.tsx:231-237`、ジャンプは `:339-343` にあり、
  **同じキューに2回入ることは普通に起こります**。
- 進行の中で「この run でこのキューに入った回数」を数える必要があります（§6-3）。

### 2-4. `run_id` をどう起こすか（設計書の①は成立しない）

**`cue:reset` に payload が無いのは事実です**（`server/src/contexts/qsheet/socket.ts:165-168`）。
しかし **`cue:reset` を emit しているのはランダウンだけ**（`RundownPage.tsx:332-336`）で、
**進行は `cue:reset` を受けて `stop()` するだけ**（`OnAirPage.tsx:346`）です。

→ **`cue:reset` は「書き手 → 全端末」の運び手になれません。** 向きが逆です。
run が始まるのは進行の `go()`（`OnAirPage.tsx:208-218`）で、**そこで進行が emit するものは
`cue:update` しかありません**（`:356-359`）。

→ **`run_id` は `cue:update` → `cue:sync` の相乗りで配る**のが、
既存のイベントを1つも増やさずに済む唯一の経路です（§4・§11 #1）。

### 2-5. サーバー側の socket 中継（何が起きているか）

`server/src/contexts/qsheet/socket.ts`:

| 行 | 内容 |
| --- | --- |
| `:37` | ネームスペースは `/qsheet` |
| `:48-56` | `docId` はハンドシェイクの query。room は `doc:<docId>` |
| `:59-90` | 認証は非同期（`ready`）。**匿名でも join・リッスンは可**（公開音声のため） |
| `:135-144` | **`cue:update` を受けて `cue:sync` として中継**（`currentCue` / `elapsed` / `isPlaying` / `timestamp`） |
| `:145-168` | `cue:next` / `prev` / `jump` / `play` / `pause` / `reset` を**そのまま中継**。`cue:reset` は payload 無し |
| 全部 | `socket.to(room)` = **送信者には返らない** |

⚠️ **`cue:update` というイベント名でクライアントに届くものは存在しません**（中継名は `cue:sync`）。
プロンプターは `socket.on('cue:update', ...)`（`PrompterPage.tsx:103`）を張っており、
**このリスナーは一度も発火しません**（§11 #7）。

### 2-6. migration の実際の最大番号

```
$ ls server/src/shared/db/migrations/ | sort | tail -3
209_column_level_drift_cleanup.sql
210_simplify_permission_modules.sql
211_drop_techsheet_schema.sql
```

**実際の最大は `211`** です（`README.md` §6 は「210 の前提」と書いてあり、**1 ずれています**）。
さらに **`206` は2本あります**（`206_drop_untracked_drift_tables.sql` /
`206_weekly_unreviewed_notification.sql`）。`server/src/shared/db/migrate.ts:16` は
`readdirSync(...).sort()` で**ファイル名の辞書順に流すだけ**なので、
番号がぶつかっても CI は落ちません（`README.md` §5-2 #31 が言っているとおり）。

→ **この段が取るのは `212`**（§3）。README §6 の採番表は**全体を +1 にずらす**必要があります（§11 #4）。

### 2-7. サーバーのルートの書き方（慣習）

`server/src/contexts/qsheet/routes/documents.routes.ts` を1本読んで確かめた慣習:

| 慣習 | 場所 |
| --- | --- |
| `router.use(requireAuth, requirePermission('qsheet'))` をファイル先頭で全ルートに掛ける | `documents.routes.ts:11` |
| 権限区画名は migration 210 の後も **`qsheet` のまま** | `210_simplify_permission_modules.sql` のヘッダ |
| `system_admin` は `requirePermission` を素通り | `server/src/shared/middleware/auth.ts:191-194` |
| ドキュメント単位のアクセスは `canAccessDoc(user, docId, createdBy)` | `server/src/contexts/qsheet/access.ts:18-30` |
| 返りは `{ success: true, data }` / 失敗は `{ success:false, error:{ code, message } }` | `documents.routes.ts:76-79` |
| DB は `queryAll` / `queryOne` / `execute`（`$1` 記法） | `server/src/shared/db/connection.ts:70-88` |
| 認証なしのルートは**認証ありより先に** `router.use` する | `server/src/contexts/qsheet/index.ts:11-12` |
| マウント先は `/api/v1/internal` | `server/src/app.ts:89`・`server/src/routes/index.ts:28` |
| **全体レート制限は無い**（`express-rate-limit` は auth / MCP のみ） | `grep -rn rateLimit server/src` |

best-effort の作法は `server/src/shared/services/ai-output.service.ts:8-13`
（「記録の失敗で業務処理を壊さない」）に前例があります。

---

## §3 DDL

**ファイル: `server/src/shared/db/migrations/212_qsheet_cue_actuals.sql`**

⚠️ **番号は実測の最大 `211` ＋1 で `212`**（§2-6）。
`../04-ai.md` §9 は実尺を `21n_qsheet_ai.sql` に同梱していますが、**段1 は AI より数か月先に出ます**。
AI の表と同じファイルに入れると、この段だけを出せません。**別ファイルに切ります**（§11 #5）。

```sql
-- ============================================================
-- 212: 本番の実尺 (qsheet_cue_actuals)
--
-- 何のための表か:
--   本番1回 (= 1 run) のあいだ、キューが切り替わるたびに
--   「そのキューに実際どれだけかかったか」を1行ずつ残す。
--   これまで実尺は RundownPage の useState にしか無く (揮発)、
--   ランダウンを開いていない本番では測定自体が存在しなかった。
--
--   ⚠️ AI の表ではない。AI 機能が1つも無くても
--   「この型のロールは予定より平均 N 秒押す」= 次回の尺見積もりに効く。
--   設計: docs/design/v4/qsheet-v4-coding/07-onair-roles.md §3
--         docs/design/v4/qsheet-v4-coding/04-ai.md §5-3a
--         docs/design/v4/qsheet-v4-coding/impl/01-cue-actuals-impl.md
--
-- 書き手:
--   進行 (OnAir) の1台だけ。ランダウンからの操作も cue:* を進行が受けてから
--   記録するので、二重送信が構造的に起きない。
--
-- 型の方針:
--   TIMESTAMPTZ に揃える。既存の qsheet_documents は TIMESTAMP (tz なし) で
--   deleted_at が TEXT という不整合を抱えているが、新しい表で踏襲しない
--   (02-schedule.md / 04-ai.md §9 と同じ判断)。
-- ============================================================

CREATE TABLE IF NOT EXISTS qsheet_cue_actuals (
  id             TEXT PRIMARY KEY,

  document_id    TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,

  -- 本番1回 = 1 run。リハ・本番・撮り直しを分ける。
  -- 進行が genId('run') で採り、cue:update -> cue:sync の相乗りで全端末に配る
  -- (cue:reset は「ランダウン -> 進行」向きなので運び手になれない)。
  run_id         TEXT NOT NULL,
  run_started_at TIMESTAMPTZ NOT NULL,

  -- ⚠️ globalIndex では持たない (行を1つ挿すと全部ずれる)。
  --    CM / VTR / ロール一括のキューは row_id を持たないので
  --    section_id は必ず入れる。
  --    section.id が取れないキューは、そもそも記録しない (§10 #1)。
  section_id     TEXT NOT NULL,
  row_id         TEXT,

  -- その run でその行に何回目に入ったか (1 始まり)。
  -- cue:jump / prev で戻ってやり直したとき、最初の (多くは失敗した) 尺で
  -- 上書きされないため。
  pass_no        INTEGER NOT NULL DEFAULT 1 CHECK (pass_no >= 1),

  cue_index      INTEGER,                      -- 記録時点の通し番号 (参考。突合には使わない)
  planned_sec    INTEGER CHECK (planned_sec IS NULL OR planned_sec >= 0),
  actual_sec     INTEGER NOT NULL CHECK (actual_sec >= 0),

  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by    TEXT REFERENCES users(id)
);

-- 同じキューの二重送信を無害にする (ON CONFLICT DO NOTHING の受け皿)。
-- row_id が NULL のキュー (CM / VTR / ロール一括) は section_id で一意にする。
-- ⚠️ NULL は UNIQUE で衝突しないので、部分索引を2本に割る必要がある。
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_cue_actuals_run_row
  ON qsheet_cue_actuals(run_id, row_id, pass_no) WHERE row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_cue_actuals_run_section
  ON qsheet_cue_actuals(run_id, section_id, pass_no) WHERE row_id IS NULL;

-- 台本ごとに新しい run から読む (GET /qsheet/runs/:documentId・集計)
CREATE INDEX IF NOT EXISTS idx_qsheet_cue_actuals_doc
  ON qsheet_cue_actuals(document_id, run_started_at DESC);

-- 取得率 (runs_measured) を数えるとき run 単位で畳む
CREATE INDEX IF NOT EXISTS idx_qsheet_cue_actuals_run
  ON qsheet_cue_actuals(run_id);
```

### 3-1. 設計書の DDL から変えたところ

| 変えた | なぜ |
| --- | --- |
| ファイルを `212_qsheet_cue_actuals.sql` に独立 | 段1 は AI より先に出る。同梱すると単独で出せない（§11 #5） |
| `pass_no` / `planned_sec` / `actual_sec` に `CHECK` | 進行が壊れた値を送っても表に入らないようにする。`actual_sec < 0` は時計の巻き戻しで起こりうる |
| `idx_qsheet_cue_actuals_run` を追加 | 取得率（`COUNT(DISTINCT run_id)`）が全件走査にならないように |
| `recorded_from` のような書き手識別列は**足さない** | いまの書き手は1つだけ。第2の計測点を作ると決めた日に `ALTER TABLE ADD COLUMN` すればよい（§10 #5） |

### 3-2. README §6 の採番表を +1 にずらす（この段の後に来る PR 用）

| 旧（README §6） | 新（実測 211 起点） | 中身 |
| --- | --- | --- |
| — | **212** | **`212_qsheet_cue_actuals.sql`（この段。README には無かった）** |
| 211 | 213 | `qsheet_documents.doc_no` |
| 212 | 214 | ジャーニーのピン |
| 213 | 215 | スケジュール表5本＋共有1本 |
| 214 | 216 | AI（提案・壁打ち・索引・ナレッジ）**から実尺を抜いたもの** |
| 215 | 217 | Excel 取込の履歴 |
| 216 | 218 | MCP 3列 |
| 217 | 219 | 公開音声のトークンと失効 |

⚠️ **この表は「段1 が先にマージされたら」の話です。** 番号は**マージされた順**でしか決まりません
（版番号と同じ問題）。並行して枝を切るときは、**PR を出す直前に `ls | sort | tail -1` を撮り直す**こと。

---

## §4 socket 契約

### 4-1. 決め: `run_id` は `cue:update` → `cue:sync` に相乗りさせる

**設計書（07 §3-2 ①）の「`cue:reset` の payload に載せる」は採れません**（§2-4・§11 #1）。
`cue:reset` はランダウンが進行へ送るもので、書き手（進行）から出る向きのイベントではないからです。

**進行から出る唯一のイベントは `cue:update`** です。ここに2つ足します。

```ts
// クライアント → サーバー (OnAirPage.tsx:358 の payload に2つ足すだけ)
socket.emit('cue:update', {
  currentCue: number,
  elapsed: number,
  isPlaying: boolean,
  runId: string | null,          // ★追加。run が立っていないときは null
  runStartedAt: string | null,   // ★追加。ISO8601
});

// サーバー → 他の端末 (socket.ts:138-143 の中継に2つ足すだけ)
socket.to(room).emit('cue:sync', {
  currentCue, elapsed, isPlaying,
  runId: data.runId ?? null,           // ★追加 (そのまま素通し)
  runStartedAt: data.runStartedAt ?? null,  // ★追加
  timestamp: Date.now(),
});
```

**これが安全な理由**

- **新しいイベントを1つも増やさない。** 中継の分岐も増えない（フィールドを2つ素通しするだけ）。
- **古いクライアントと混在しても壊れない。** 受け手は既存の3フィールドしか見ていないので、
  余分なキーは無視されます（`RundownPage.tsx:282-286` / `AudioSupportPage.tsx:310-314`）。
- **送り手が古い場合は `undefined` → `?? null`** で潰れます。

### 4-2. 二重 run（進行を2タブ開いた本番）の扱い

進行を2つ開いて両方で `go()` を押すと、**run_id が2つ立ちます**。
そのままだと同じ本番が2 run に割れ、取得率も実尺も水増しされます。

**決め: 後から立った run が、先に立った run に合流する。**

- 進行に **`cue:sync` のリスナーを1つ足す**。ただし **`runId` / `runStartedAt` だけを読み、
  `currentCue` / `elapsed` / `isPlaying` には一切触らない**
  （触ると進行の計時が他端末に引きずられます。**それは絶対にやらない**）。
- 受け取った `runStartedAt` が自分のものより**早ければ**、自分の `runId` をそれに差し替える。
  同時刻なら `runId` の辞書順で小さいほうを採る（決定的にするため）。
- 差し替え前に書いた行は、その短い run に残ります。**集計側で「同じ台本・同じ時間帯に
  複数 run があれば、行数の多いほうを採る」**で吸収します（§10 #3）。

⚠️ **段1 から落としてもよい部分です。** 進行を2タブ開く運用が無いなら、
`cue:sync` のリスナーもサーバーの2フィールドも要りません（run_id は進行のローカルで足ります）。
**「本番の画面に触る行数を最小にする」ことを優先するなら、4-2 は別 PR に切って後から入れられます**（§9 PR3）。

### 4-3. シーケンス

```
    進行(OnAir)              サーバー(/qsheet)         ランダウン        API
        |                          |                      |             |
  [Space] go()                     |                      |             |
   runId = genId('run')            |                      |             |
   runStartedAt = now              |                      |             |
   cur: -1 -> 0                    |                      |             |
   cueEnterAt = now                |                      |             |
   pass[sec_a|row_1] = 1           |                      |             |
        |-- cue:update ----------->|                      |             |
        |   {cur:0, runId, ...}    |-- cue:sync --------->|             |
        |                          |   (runId 素通し)      |             |
        |                          |                      |             |
        |                          |<-- cue:next ---------| [Space]     |
        |<-- cue:next -------------|                      |             |
   next(): cur 0 -> 1              |                      |             |
        |                                                               |
   ┌─ useEffect([cur, running]) ─────────────────────────────────────┐  |
   │  出て行った cue = 0 (sec_a / row_1 / pass 1)                    │  |
   │  actual_sec = round((now - cueEnterAt - pausedMs)/1000)         │  |
   │  planned_sec = cues[0].duration                                 │  |
   │  cueEnterAt = now ; pausedMs = 0                                │  |
   │  pass[sec_a|row_2] = (前回 + 1)                                  │  |
   └─────────────────────────────────────────────────────────────────┘  |
        |------------------ POST /qsheet/runs/:documentId/cues --------->|
        |   (await しない・失敗しても画面に何も出さない)                    | INSERT
        |<------------------------- 204 No Content ---------------------|  ON CONFLICT
        |                                                               |  DO NOTHING
  [ESC] stop() / cue:reset                                              |
   cur -> -1  ⇒ 同じ effect が最後の cue を1件流す                        |
   runId = null                                                         |
```

**要点**

1. **記録の起点は socket ではなく `cur` の変化**です。だから操作の出どころ（キーボード／CM 自動送り／
   ランダウンからの `cue:*`）に関係なく、**1か所で全部拾えます**。
2. **二重送信が構造的に起きない**のは、書き手が1台しかないからです。
   ランダウンや公開音声は POST しません。
3. run が立っていない（`runId === null`）ときは**何も送りません**。
   ランダウンだけで回している本番は記録されません（設計どおり。取得率で見張ります）。

---

## §5 サーバー実装

### 5-1. ファイル

```
server/src/shared/db/migrations/212_qsheet_cue_actuals.sql   ← §3
server/src/contexts/qsheet/services/cue-actual.service.ts    ← 新規 (services/ ディレクトリも新規)
server/src/contexts/qsheet/routes/runs.routes.ts             ← 新規
server/src/contexts/qsheet/index.ts                          ← router.use を1行追加
server/src/contexts/qsheet/socket.ts                         ← cue:sync に2フィールド素通し (§4-1)
shared/src/qsheet/cueActuals.ts                              ← 型 (クライアントと共有)
```

⚠️ `../04-ai.md` §12 は `routes/runs.routes.ts` と `services/cue-actual.service.ts` を
**AI のファイル一覧の中に**書いています。段1 で先に作るので、**AI の PR ではこの2本を作らない**こと。

### 5-2. 型（`shared/src/qsheet/cueActuals.ts`）

```ts
/** 進行 (OnAir) が1キューぶん記録するときに送るもの。 */
export interface CueActualInput {
  run_id: string;
  run_started_at: string;   // ISO8601
  section_id: string;       // ★必須。CM/VTR/ロール一括は row_id=null で section_id のみ
  row_id: string | null;
  pass_no: number;          // 1 始まり
  cue_index: number | null;
  planned_sec: number | null;
  actual_sec: number;
}

/** GET /qsheet/runs/:documentId が返す1行。 */
export interface CueActualRow extends CueActualInput {
  id: string;
  document_id: string;
  recorded_at: string;
  recorded_by: string | null;
}

export interface RunSummary {
  run_id: string;
  run_started_at: string;
  cue_count: number;
  total_actual_sec: number;
  total_planned_sec: number | null;
}
```

**`shared/` に置く理由**: 進行（`client-qsheet`）とサーバーの両方が同じ形を使うため。
`shared/` を触ると全アプリに効きますが、**新規ファイルを1本足すだけ**で
既存のバレルには載せません（凍結アプリの CSS には影響しません）。

### 5-3. service（`services/cue-actual.service.ts`）

```ts
import { v4 as uuid } from 'uuid';
import { execute, queryAll } from '../../../shared/db/connection';
import type { CueActualInput, CueActualRow, RunSummary } from '@gmo-onair/shared/src/qsheet/cueActuals';

/** 進行が送ってくる値の検算。**投げずに null を返す**（本番中に 500 を作らない）。 */
export function sanitizeCueActual(raw: unknown): CueActualInput | null { /* … */ }

/**
 * 実尺を1件記録する (best-effort)。
 *  - ON CONFLICT DO NOTHING: 同じ (run_id, row/section, pass_no) の二重送信を無害にする
 *  - **例外を投げない**。呼び出し側 (ルート) は結果を見ずに 204 を返す
 */
export async function recordCueActual(
  documentId: string, input: CueActualInput, userId: string | null
): Promise<void> {
  try {
    await execute(
      `INSERT INTO qsheet_cue_actuals
         (id, document_id, run_id, run_started_at, section_id, row_id,
          pass_no, cue_index, planned_sec, actual_sec, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [uuid(), documentId, input.run_id, input.run_started_at, input.section_id, input.row_id,
       input.pass_no, input.cue_index, input.planned_sec, input.actual_sec, userId]
    );
  } catch (e) {
    // 記録の失敗で本番を止めない (ai-output.service.ts:8-13 と同じ作法)
    console.warn('[qsheet-cue-actual] 記録に失敗しました', e);
  }
}

export async function listRuns(documentId: string): Promise<RunSummary[]> { /* … */ }
export async function listCueActuals(documentId: string, runId?: string): Promise<CueActualRow[]> { /* … */ }
```

⚠️ **`ON CONFLICT DO NOTHING` に列を書かない**こと（`ON CONFLICT (run_id, row_id, pass_no)` とは書けません）。
一意制約が**部分索引2本**なので、推論に列を書くと `row_id IS NULL` 側で
`no unique or exclusion constraint matching` になります。**列指定なしの `DO NOTHING` が正解**です。

### 5-4. ルート（`routes/runs.routes.ts`）

```ts
const router = Router();
router.use(requireAuth, requirePermission('qsheet'));   // documents.routes.ts:11 と同じ

// 実尺の記録 — 本番中に走る唯一の書き込み
router.post('/runs/:documentId/cues', async (req, res) => {
  // ① まず 204 を返す ... のではなく、**軽い検査だけしてから**返す。
  //    重い処理 (DB) の完了は待たない。
  const input = sanitizeCueActual(req.body);
  if (!input) { res.status(204).end(); return; }          // ★400 にしない (§5-5)

  const doc = await queryOne(
    'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
    [req.params.documentId]
  );
  if (!doc || !(await canAccessDoc(req.user!, req.params.documentId, doc.created_by ?? null))) {
    res.status(204).end(); return;                        // ★403 にしない (§5-5)
  }

  void recordCueActual(req.params.documentId, input, req.user!.id);  // await しない
  res.status(204).end();
});

// 過去の run と実尺 (本番中には呼ばれない。落ちてよい)
router.get('/runs/:documentId', async (req, res) => { /* 通常どおり 200 / 403 / 500 */ });
```

`server/src/contexts/qsheet/index.ts`:

```ts
router.use('/qsheet', runsRoutes);   // documents.routes.ts と同じ '/qsheet' 配下
```

→ 実 URL は `POST /api/v1/internal/qsheet/runs/:documentId/cues`（`app.ts:89`）。

### 5-5. best-effort を「具体策」に落とす

| どこ | 何をする | なぜ |
| --- | --- | --- |
| POST の返り | **常に 204**。検査に落ちても・権限が無くても 204 | 画面は結果を見ない。4xx を返すと axios が例外を投げ、**未処理の Promise 拒否**になる。本番中にコンソールを汚さない |
| POST の中身 | `void recordCueActual(...)`（**await しない**） | DB が詰まっても HTTP の応答は即返る |
| service | **try/catch で `console.warn` に落とす。再送しない** | 失われるのは1キューぶんの実尺。取り返すために本番を止めない |
| 認可 | `canAccessDoc` は**通す**（進行を開ける人＝アクセス権のある人） | 認可を緩めない。ただし**落ちても 204** |
| ログ | 失敗は `warn` 1行。**成功時は何も出さない** | 1本番で 100〜200 行出るとログが埋まる |
| 監査 | `audit()` を**呼ばない** | 業務操作ではなく計測。1本番で数百行の監査ログを作らない |
| トランザクション | **使わない**（1行 INSERT） | |
| バッチ | **しない**（1キュー1リクエスト） | 溜めると、本番が終わった瞬間にタブを閉じられて全部消える。**1件ずつ落としきるほうが取りこぼしが少ない** |

⚠️ **「常に 204」は検査のしにくさと引き換えです。** 開発時に何が落ちたか分かるよう、
`NODE_ENV !== 'production'` のときだけ `console.warn` に検査の失敗理由を出します（本文には出さない）。

---

## §6 クライアント実装（進行 / OnAir）

### 6-1. 触るファイルは1本だけ

`client-qsheet/src/pages/OnAirPage.tsx` と、新規の `client-qsheet/src/lib/cueActualsApi.ts`。
**ランダウン・プロンプター・公開音声は1行も触りません。**

### 6-2. `buildCues` に id を運ばせる（`OnAirPage.tsx:44-51, 72-107`）

```ts
interface FlatCue {
  type: "cue" | "cm" | "vtr";
  label: string;
  duration: number;
  start: number;
  oa: number;
  row?: CueRow;
  sectionId?: string;   // ★追加。section.id をそのまま運ぶ (合成しない)
  rowId?: string;       // ★追加。通常行だけ。CM/VTR/ロール一括は undefined
}
```

- CM（`:84`） → `sectionId: s.id`（`rowId` なし）
- VTR（`:88`） → `sectionId: s.id`
- ロール一括（`:95`） → `sectionId: s.id`
- 通常行（`:101`） → `sectionId: s.id, rowId: row.id`

⚠️ **`cm-<index>` のような合成 id を作らないこと。** ロールを1本足しただけで
別のキューと同じ id になり、設計が避けたはずの「1行挿すと全部ずれる」が起きます。
**`section.id` が無いキューは `sectionId` を `undefined` のままにし、記録しません**（§2-3・§10 #1）。

**画面には一切出しません。** `FlatCue` に読まないフィールドが2つ増えるだけで、
JSX は1文字も変わりません。

### 6-3. 計測は「`cur` の変化」を見る useEffect 1本で行う

ランダウンが既にやっている形（`RundownPage.tsx:140-152`）と同じです。**既存のハンドラは1つも書き換えません**
（`go` / `next` / `prev` / `tog` / `stop` / socket リスナーは今のまま）。

```ts
// ── 実尺の記録 (追加。既存の計時ロジックには触らない) ──
const runIdRef        = useRef<string | null>(null);
const runStartedAtRef = useRef<string | null>(null);
const cueEnterAtRef   = useRef<number | null>(null);  // 現在キューに入った時刻 (ms)
const pausedMsRef     = useRef(0);                    // 現在キュー内で止まっていた合計 (ms)
const pauseBeganRef   = useRef<number | null>(null);
const prevCurRef      = useRef(-1);
const passCountRef    = useRef<Map<string, number>>(new Map());
const wasRunningRef   = useRef(false);
```

**① 一時停止の計上**（`paused` を見る effect を1本足す。`tog()` は触らない）

```ts
useEffect(() => {
  if (paused) { pauseBeganRef.current = Date.now(); }
  else if (pauseBeganRef.current != null) {
    pausedMsRef.current += Date.now() - pauseBeganRef.current;
    pauseBeganRef.current = null;
  }
}, [paused]);
```

⚠️ **`cueEl` を実尺に使わないこと。** `cueEl` は `running && !paused` のときしか進みません
（`OnAirPage.tsx:182`）。ランダウンだけが操作していて進行の `running` が false のままの本番では
**常に 0** になります。**壁時計（`Date.now()`）から止まっていた分を引く**のが正解です。

**② run の開始・終了**

```ts
// running が false -> true で run を立てる (go() でも cue:play 経由でも通る)
useEffect(() => {
  if (running && !wasRunningRef.current) {
    runIdRef.current        = genId('run');
    runStartedAtRef.current = new Date().toISOString();
    passCountRef.current.clear();
    pausedMsRef.current = 0;
    pauseBeganRef.current = null;
    cueEnterAtRef.current = Date.now();
  }
  wasRunningRef.current = running;
}, [running]);
```

`stop()`（ESC / `cue:reset`）は `cur` を `-1` にするので、③ が**最後のキューを1件流してから**
`runIdRef` を落とします。

**③ キューの切り替わり（本体）**

```ts
useEffect(() => {
  const prev = prevCurRef.current;
  prevCurRef.current = cur;
  if (prev === cur) return;

  const runId = runIdRef.current;
  const enterAt = cueEnterAtRef.current;

  // 出て行ったキューを記録する (prev >= 0 のときだけ)
  if (runId && enterAt != null && prev >= 0 && prev < cues.length) {
    const c = cues[prev];
    if (c.sectionId) {                       // ★id が無いキューは黙って飛ばす
      const pausedNow = pausedMsRef.current +
        (pauseBeganRef.current != null ? Date.now() - pauseBeganRef.current : 0);
      const actual = Math.max(0, Math.round((Date.now() - enterAt - pausedNow) / 1000));
      const key = `${c.sectionId}|${c.rowId ?? ''}`;
      postCueActual(id!, {                    // ★await しない
        run_id: runId,
        run_started_at: runStartedAtRef.current!,
        section_id: c.sectionId,
        row_id: c.rowId ?? null,
        pass_no: passCountRef.current.get(key) ?? 1,
        cue_index: prev,
        planned_sec: c.duration ?? null,
        actual_sec: actual,
      });
    }
  }

  // 入ったキューの pass_no を数える
  if (cur >= 0 && cur < cues.length) {
    const c = cues[cur];
    if (c.sectionId) {
      const key = `${c.sectionId}|${c.rowId ?? ''}`;
      passCountRef.current.set(key, (passCountRef.current.get(key) ?? 0) + 1);
    }
  }

  cueEnterAtRef.current = cur >= 0 ? Date.now() : null;
  pausedMsRef.current = 0;
  pauseBeganRef.current = null;
  if (cur < 0) { runIdRef.current = null; runStartedAtRef.current = null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [cur]);
```

⚠️ **依存配列に `cues` を入れないこと。** `cues` は `OnAirPage.tsx:175` で
**毎レンダー作り直される配列**（`useMemo` が無い）なので、依存に入れると effect が毎レンダー走ります。
`cur` だけを見て、`cues` は effect の中で読みます（`RundownPage.tsx:141-152` も同じ理由で
`// eslint-disable-next-line react-hooks/exhaustive-deps` を置いています）。

**④ 最後のキュー**

`next()` は最終キューで `running` を false にするだけで `cur` を動かしません（`OnAirPage.tsx:225-228`）。
そのままだと**最後の1キューが記録されません。** `running` が true→false になった時点で
現在キューを1件流します（③ と同じ関数を切り出して呼ぶ）。

⚠️ その後 ESC で `stop()` すると `cur` が -1 になり、**同じキューがもう1度流れます**。
これは **`ON CONFLICT DO NOTHING`（同じ `run_id` / `section_id` / `pass_no`）が黙って捨てる**ので無害です。
**「二重に流れても構造的に安全」なことが、この設計の要**です。

**⑤ タブを閉じられた場合は記録されません。** `beforeunload` で送ることはしません
（`sendBeacon` は axios の認証ヘッダを載せられず、確実性も上がらないため）。取りこぼしは
取得率（§7-2）で見えます。

### 6-4. 「見た目を変えない」をどう守るか

| 守ること | 具体策 |
| --- | --- |
| **Tailwind のクラスを1つも足さない** | 追加するのは `useRef` / `useEffect` / 型のフィールドだけ。JSX は1文字も変えない。⚠️ `client-qsheet` の Tailwind は**自分のソースを走査する**ので、**クラス名を1つ書き足すだけで `dist` の CSS が変わり `npm run check:frozen` が落ちます**（`scripts/check-frozen-css.mjs`・基準は `scripts/frozen-css-baseline.json` の `qsheet.md5`） |
| **トーストを増やさない** | 記録の成功も失敗も**画面に出さない**。`notify.ts` の13か所は触らない（`client-qsheet/CLAUDE.md`・07 §1-1） |
| **`NoticeBar` に寄せない** | 「放送同期が切断されました」は今のまま（`OnAirPage.tsx:332-334`） |
| **`index.css` の tokens を差し替えない** | この段は tokens に触らない（凍結解除の判断は段3） |
| **キーボード操作を変えない** | `OnAirPage.tsx:271-307` は読むだけ |

### 6-5. `lib/cueActualsApi.ts`

```ts
import api from './api';
import type { CueActualInput } from '@gmo-onair/shared/src/qsheet/cueActuals';

/** 実尺を1件送る。**await しない・例外を握り潰す・再送しない**。 */
export function postCueActual(documentId: string, input: CueActualInput): void {
  void api.post(`/qsheet/runs/${documentId}/cues`, input, { timeout: 5000 })
    .catch(() => { /* 本番中。何も出さない */ });
}
```

⚠️ `.catch()` を**必ず付ける**こと。付けないと、ネットワークが切れた本番で
未処理の Promise 拒否が毎キュー出ます。

---

## §7 撮り直し・戻り（`pass_no`）

### 7-1. 何を守るための番号か

`cue:jump` / `prev` で**同じキューに2回以上入る**のは、リハでも本番でも普通に起こります
（`OnAirPage.tsx:231-237, 339-343`）。`pass_no` が無いと、
`ON CONFLICT DO NOTHING` が**捨てるのは2回目＝実際に使われたほう**になります
（`README.md` §5-2 #17）。

### 7-2. 決め

| 決め | 中身 |
| --- | --- |
| 数え方 | **その run でそのキューに「入った」回数**（1 始まり）。出るときではなく**入るとき**に増やす（§6-3 ③） |
| 鍵 | `section_id` と `row_id`（無ければ空文字）を縦棒でつないだ文字列。**`cue_index` は鍵にしない**（行を挿すとずれる） |
| リセット | run の開始時（`running` false→true）に `Map` を空にする |
| 集計の既定 | **`MAX(pass_no)` の行**＝最後に通った版を使う |
| 戻って**やり直さなかった**場合 | `prev` で戻ってそのまま次へ進むと、そのキューは `pass_no=2` の短い行を作ります。`MAX(pass_no)` を採ると**短いほうが勝ちます** |

⚠️ **上の最後の1行が既知の弱点です。** 設計書（04 §5-3a）は `MAX(pass_no)` と書いていますが、
「戻って確認しただけ」と「撮り直した」を実装で区別する手がかりはありません。

**この段での扱い**: **`MAX(pass_no)` を既定にしつつ、集計側で
`actual_sec` が `planned_sec` の 20% 未満の pass は「通過しただけ」として落とす**、
という下駄を**集計クエリ側に**置きます（表には落とさない）。
閾値に根拠はないので、**§10 #4 の「運用で確かめる」に載せます**。表の中身は生のまま残るので、
後から基準を変えられます。

### 7-3. run をやり直したとき（リハ → 本番）

`cue:reset` / ESC で `cur` が -1 になり、`runIdRef` が落ちます。次に `go()` すると
**新しい `run_id`** が立ちます。リハと本番は**別の run** として並びます。
どちらが本番かを表は知りません。**`run_started_at` が最も遅い run を「本番」とみなす**のを
既定にします（集計側の決め。表には持たせない）。

---

## §8 検証手順

### 8-1. 検証用 Postgres に migration を流す

```bash
npm run verify:up                    # 使い捨ての Postgres (ポート5433・本番とは完全分離)
source /tmp/onair-verify/env.sh      # DATABASE_URL などを読む
```

`up.sh` の中で `npm run db:migrate -w server` まで走ります（`scripts/dev-verify/up.sh:68-69`）。
**流れたかを目で確かめます。**

```bash
psql -h 127.0.0.1 -p 5433 -U postgres -d onair_verify -c \
  "SELECT name FROM _migrations WHERE name LIKE '212%';"
psql -h 127.0.0.1 -p 5433 -U postgres -d onair_verify -c "\d qsheet_cue_actuals"
psql -h 127.0.0.1 -p 5433 -U postgres -d onair_verify -c \
  "\di qsheet_cue_actuals*"     -- 部分索引2本＋通常索引2本が出ること
```

⚠️ **`--fresh` で1度は「まっさらから 212 まで通る」ことを確かめる**こと
（既存 DB に足すだけの検証だと、`REFERENCES qsheet_documents(id)` の順番の問題を見逃します）。

```bash
npm run verify:fresh && source /tmp/onair-verify/env.sh
```

### 8-2. 一意制約が効いているか（**この段のいちばん大事な検証**）

```sql
INSERT INTO qsheet_documents (id, title, data, created_by)
VALUES ('doc-v1', '検証台本', '{}'::jsonb, 'v-admin');

-- 通常行: 同じ (run, row, pass) を2回
INSERT INTO qsheet_cue_actuals (id,document_id,run_id,run_started_at,section_id,row_id,pass_no,actual_sec)
VALUES ('a1','doc-v1','run-1',NOW(),'sec_a','row_1',1,95) ON CONFLICT DO NOTHING;
INSERT INTO qsheet_cue_actuals (id,document_id,run_id,run_started_at,section_id,row_id,pass_no,actual_sec)
VALUES ('a2','doc-v1','run-1',NOW(),'sec_a','row_1',1,999) ON CONFLICT DO NOTHING;
-- ⇒ 1行だけ・actual_sec は 95 のまま (先勝ち)

-- 撮り直し: pass_no が違えば入る
INSERT INTO qsheet_cue_actuals (id,document_id,run_id,run_started_at,section_id,row_id,pass_no,actual_sec)
VALUES ('a3','doc-v1','run-1',NOW(),'sec_a','row_1',2,88) ON CONFLICT DO NOTHING;
-- ⇒ 2行になる

-- CM/VTR (row_id = NULL): section_id で一意になること
INSERT INTO qsheet_cue_actuals (id,document_id,run_id,run_started_at,section_id,row_id,pass_no,actual_sec)
VALUES ('b1','doc-v1','run-1',NOW(),'sec_cm',NULL,1,60) ON CONFLICT DO NOTHING;
INSERT INTO qsheet_cue_actuals (id,document_id,run_id,run_started_at,section_id,row_id,pass_no,actual_sec)
VALUES ('b2','doc-v1','run-1',NOW(),'sec_cm',NULL,1,61) ON CONFLICT DO NOTHING;
-- ⇒ ★ここが落ちやすい。1行であること (NULL は UNIQUE で衝突しないので
--   部分索引を2本に割っていないと2行入る)

SELECT section_id, row_id, pass_no, actual_sec FROM qsheet_cue_actuals ORDER BY id;
-- 期待: a1(sec_a,row_1,1,95) / a3(sec_a,row_1,2,88) / b1(sec_cm,NULL,1,60) の3行

-- FK の CASCADE
DELETE FROM qsheet_documents WHERE id = 'doc-v1';
SELECT COUNT(*) FROM qsheet_cue_actuals;   -- 0
```

### 8-3. API（サーバーだけ立てて叩く）

```bash
source /tmp/onair-verify/env.sh    # PORT=3999・開発モードは x-user-id ヘッダー認証
npm run dev -w server &

curl -si -X POST localhost:3999/api/v1/internal/qsheet/runs/doc-v1/cues \
  -H 'content-type: application/json' -H 'x-user-id: v-admin' \
  -d '{"run_id":"run-1","run_started_at":"2026-08-21T10:00:00Z","section_id":"sec_a",
       "row_id":"row_1","pass_no":1,"cue_index":0,"planned_sec":90,"actual_sec":95}'
# ⇒ 204 / 本文なし
```

**必ず確かめる4つ**

| 送るもの | 期待 |
| --- | --- |
| 同じ body をもう1回 | **204。行は増えない** |
| `actual_sec` を落とした body | **204**（400 にしない）。行は増えない |
| 権限の無いユーザー（`x-user-id: v-none`） | **204**。行は増えない。⚠️ ここで 403 を返すと本番中に例外が出ます |
| DB を落として（`verify:down`）から POST | **204**。サーバーのログに `warn` が1行。**500 にならない** |

`GET /api/v1/internal/qsheet/runs/doc-v1` は通常どおり 200 / 403 を返してよい（本番中に呼ばれないため）。

### 8-4. 画面（実ブラウザ）

1. 検証環境で台本を1本開き、`/qsheet/onair/<id>` で **Space → →← → ESC** を1周する
2. `SELECT * FROM qsheet_cue_actuals ORDER BY recorded_at;` に**キューの数だけ行が入る**こと
3. `/qsheet/rundown/<id>` を別タブで開いて**ランダウンから NEXT を押す** →
   進行が受けて記録すること（**ランダウンは POST しない**）
4. **`P` で一時停止して30秒放置 → 再開 → NEXT** → `actual_sec` に30秒が**入っていない**こと
5. **戻る（←）→ 進む** → 同じ `section_id` / `row_id` で `pass_no=2` の行が増えること
6. **サーバーを落として本番を回す** → 画面に**何も出ない**・計時が1秒も止まらないこと

### 8-5. 門（gate）

```bash
npm run typecheck      # v4 対象3アプリ + server
npm run typecheck:all  # ★ client-qsheet は既定に入っていないので、これも回す
npm run lint
npm run test           # shared の Vitest
npm run build:changed
npm run check:frozen   # ★ qsheet の CSS が1バイトも動いていないこと (build:all のあと)
```

⚠️ **`npm run typecheck` の既定は v4 対象3アプリだけで、`client-qsheet` は入っていません**
（ルート `CLAUDE.md`）。この段は `client-qsheet` を触るので **`typecheck:all` が必須**です。

⚠️ **`check:frozen` は `npm run build:all` の後**でないと `dist` が無くて意味がありません。
**基準（`scripts/frozen-css-baseline.json`）を更新して通してはいけません。**
更新が要る＝**クラス名を足してしまった**ということです。

---

## §9 PR の切り方

**1 PR = 1画面**が目安なので、画面を触るのは PR2 の1本だけにします。

| PR | 中身 | 触るもの | 目安 |
| --- | --- | --- | --- |
| **PR1** | `212_qsheet_cue_actuals.sql` ＋ service ＋ `runs.routes.ts`（POST/GET）＋ 型 | `server/` `shared/`（**画面は0行**） | 中 |
| **PR2** | 進行（OnAir）からの記録 | `client-qsheet/src/pages/OnAirPage.tsx` ＋ `lib/cueActualsApi.ts` | 中 |
| **PR3**（任意） | `run_id` の socket 相乗り（§4-1）＋ 進行の `cue:sync` リスナー（§4-2） | `server/.../socket.ts` ＋ `OnAirPage.tsx` | 小 |
| **PR4**（任意） | 取得率と実尺の集計クエリ（`runs_measured / broadcasts_total`） | `server/` のみ | 小 |

**PR1 を先に出す理由**: PR1 だけなら**本番の画面に1行も触りません**。
migration が本番で無事に流れたことを確かめてから、初めて放送画面に手を入れられます。

**PR3 を分ける理由**: 中継（`socket.ts:135-144`）は**放送中に流れている唯一の経路**です。
実尺の記録そのものは PR3 が無くても成立します（`run_id` は進行のローカルで足りる）。
**進行を2タブ開く運用が実在するかを確かめてから**入れるのが安全です（§10 #3）。

**PR タイトル**（`種類(アプリ): 何をしたか`）

- PR1 `feat(qsheet): 本番の実尺を残す表と記録APIを足した`
- PR2 `feat(qsheet): 進行(OnAir)から本番の実尺を記録するようにした`
- PR3 `feat(qsheet): run_id を cue:sync に相乗りさせて進行の二重起動をまとめた`
- PR4 `feat(qsheet): 実尺の取得率を数えられるようにした`

**`docs/changelog.d/` に置く1文**（枝名 `claude/qsheet-v4-coding-guide-udbo1u` →
ファイル名 `claude-qsheet-v4-coding-guide-udbo1u.md`）:

> **本番の実尺（キューごとに実際どれだけかかったか）を残すようにした。** これまで実尺は
> ランダウン画面のメモリ上にしか無く、画面を閉じると消え、ランダウンを開いていない本番では
> 測定自体が存在しなかった。進行（OnAir）が本番1回を1つの run として、キューが切り替わるたびに
> 予定尺と実尺を1行ずつ残す（`qsheet_cue_actuals`）。撮り直し・戻りは `pass_no` で分けて
> 上書きしない。**記録は全部 best-effort**（送りっぱなし・失敗しても画面に何も出さない・
> サーバーが落ちていても計時は1秒も止まらない）で、本番中に AI は1回も呼ばない。
> 画面の見た目・URL・キーボード操作は1つも変えていない。
> 検証: `npm run typecheck:all` / `npm run lint` / `npm run test` / `npm run check:frozen` OK。

⚠️ **版の3か所（`package.json` / `CLAUDE.md` / `README.md`）は触らない**こと
（`npm run lint` の `check-changelog.mjs` が止めます）。

⚠️ **PR を出したらその場で `.claude/skills/pr-watch` で見張る**（ルート `CLAUDE.md`）。
**マージしたらレビュー指摘を `npm run reviews:debt` で棚卸しに移す。**

---

## §10 未決・要確認

| # | 何を | いま分かっていること | どう決めるか |
| --- | --- | --- | --- |
| **1** | **`section.id` を持たない台本がどれくらいあるか** | 安定 id を付けるのは編集画面だけ（`EditorPage.tsx:272`）。**未確認**（本番 DB を見ていない） | `SELECT COUNT(*) FROM qsheet_documents WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(data->'sections') s WHERE s->>'id' IS NULL);` を**検証環境で**。多いなら「進行を開いたときに id を補う」経路が要る（ただし `data` はクライアントしか書けないので、編集画面を1度開いてもらう運用でも足りる） |
| **2** | **進行卓（OnAir）を開かずに回す本番があるか** | あるなら実尺は0行（07 §3-4） | **利用者に訊く**（07 §5 の4番と同じ質問）。あるなら計測点をもう1つ考える |
| **3** | **進行を2タブ開く運用があるか** | あると run が2つに割れる（§4-2） | 利用者に訊く。無ければ PR3 は不要 |
| **4** | **「戻って確認しただけ」を実尺から落とす基準** | §7-2 の「予定尺の 20% 未満」は**根拠のない仮の数字** | 運用3か月ぶんの `pass_no >= 2` の分布を見て決める。**表には落とさず集計側に置く**ので、後から変えられる |
| **5** | **第2の書き手（プロンプター等）を作るか** | 作るなら `recorded_from` 列が要る | #2 の答え次第。`ALTER TABLE ADD COLUMN` で足せるので**先回りしない** |
| **6** | **`broadcasts_total` の分母をどう数えるか** | ⚠️ **`qsheet_documents.broadcast_date` は `TEXT`**（`012_qsheet_schema.sql:17`）。`::date` の直キャストは壊れた値1件で全体が落ちる | `WHERE broadcast_date ~ '^\d{4}-\d{2}-\d{2}$'` で守ってからキャストする。空の台本がどれくらいあるかは **未確認**（README §8 #5 と同じ宿題） |
| **7** | **run の長さの上限** | 1本番のキュー数は**未確認**（README §8 #7 と同じ宿題） | `GET /qsheet/runs/:documentId` に `LIMIT` を置くかを、実件数を見てから決める |
| **8** | **`ON CONFLICT DO NOTHING` の「先勝ち」でよいか** | 二重送信では先が正しい（§6-3 ④の再送は必ず長い値） | この段は先勝ちで確定。**後勝ちにしてはいけない** |
| **9** | **時計のずれ** | `run_started_at` / `actual_sec` は**進行の端末の時計**。サーバー時刻ではない | 段1 は端末の時計をそのまま採る（実尺は差分なのでずれの影響は小さい）。`run_started_at` が明らかに未来／過去なら `recorded_at` で気づける |

---

## §11 設計書との食い違い

**⚠️ 実装を読んで確かめた結果です。番号は重大度順。**

| # | 設計書の記述 | 実装 | どうするか |
| --- | --- | --- | --- |
| **1** | 07 §3-2 ①「OnAir が `runId` を `cue:reset` の payload に載せて配る」／04 §5-3a も同じ | **`cue:reset` を emit しているのはランダウンだけ**（`RundownPage.tsx:332-336`）。**進行は受けて `stop()` するだけ**（`OnAirPage.tsx:346`）。進行が emit するのは `cue:update` だけ（`:356-359`） | **`cue:update` → `cue:sync` に相乗りさせる**（§4-1）。`cue:reset` は向きが逆で運び手になれない |
| **2** | 07 §3-2 / 04 §5-3a「**`flatCues` が `section.id` を運ぶように直すこと**（`RundownPage.tsx:218-240`）」 | **書き手は進行で、進行のキュー平坦化は別の関数**（`OnAirPage.tsx:72-107` の `buildCues`）。しかも進行の `FlatCue` は**合成 id すら持たず、id のフィールドが1つも無い**（`:44-51`） | **直すのは `OnAirPage.tsx` の `buildCues`**（§6-2）。ランダウンの `flatCues` は**触らない**（表示の話で、書き手ではない） |
| **3** | README §6「現在の最大が **210** の前提」 | **実際の最大は `211_drop_techsheet_schema.sql`**。さらに **`206` は2本ある** | この段は **`212`**。README §6 の採番表は**全体 +1**（§3-2） |
| **4** | 04 §9「DDL まとめ（**`212_qsheet_ai.sql`**）」「**`211_qsheet_schedule.sql`** の後に置く」／04 §12 も `212_qsheet_ai.sql` | README §6 は同じものを **214 / 213** と書いている | **04 の中の番号は古い。README §6 が正**（README 自身がそう書いている）。ただし README も起点が1ずれているので、結局**両方直す**必要がある |
| **5** | 04 §9 / §12「実尺は `21n_qsheet_ai.sql` に同梱」 | 段1 は AI より数か月先に出る（README §7） | **`212_qsheet_cue_actuals.sql` に独立**。AI の migration からは実尺を抜く（§3・§5-1） |
| **6** | 04 §5-3a の DDL「`section_id TEXT NOT NULL`」 | **`section.id` / `row.id` を付けるのは編集画面だけ**（`EditorPage.tsx:272` / `stableIds.ts:43`）。進行・ランダウンは素の `data` を読む（`OnAirPage.tsx:163-173`）。**id を持たない台本がありうる** | `NOT NULL` は維持し、**id が無いキューは記録しない**（§6-2）。実際にどれくらいあるかは **未確認**（§10 #1） |
| **7** | 04 §5-3c「プロンプターで実際に読まれたか＝実尺にその行の記録があれば本番で使われたと言える」 | **プロンプターは `cue:update` を待っているが、そのイベント名でクライアントに届くものは存在しない**（`PrompterPage.tsx:103` ／ 中継名は `cue:sync`・`socket.ts:138`）。プロンプターは**進行に追随しておらず**、ランダウンの `cue:next/prev/jump` にだけ反応する | **この段では直さない**（放送中の画面の挙動を変える修正になるため）。ただし**「プロンプターで読まれた」の根拠は実尺ではなく進行の cue 送出**であることを 04 §5-3c に書き足すべき。プロンプター自体の不具合としては**別 PR**（07 §1-1 は「そのまま」と書いているが、これは見た目ではなく**壊れているリスナー**） |
| **8** | 07 §3-1「実際に測っているのは `RundownPage.tsx:129-145`」 | 実際は **`:129-152`**（`useEffect` が `:141-152`）。**内容は設計書のとおり**（`useState` のみ・揮発） | 行番号だけの誤差。直すなら 07 §3-1 |
| **9** | 07 §1-1「進行の cue 送出 `OnAirPage.tsx:358`（`cue:update`）」 | 行番号は正しい。ただし**この effect は `showEl` に依存しており、走行中は約100msごと（毎秒10回）emit している**（`:179-189` の 100ms タイマー → `:356-359`） | 事実として記録。**`run_id` を相乗りさせても新しい通信は1本も増えない**という根拠になる（§4-1）。逆に「`cue:update` は稀にしか飛ばない」と誤解して設計すると間違える |

### 11-1. 設計書のうち、実装で**裏が取れた**もの（変更不要）

- 「**進行は `cue:next` を出さない。出すのはランダウンだけ**」（07 §3-1・04 §5-3a）→ **そのとおり**（§2-1）
- 「`cue:reset` に payload が無い」（07 §3-2・04 §5-3a）→ **そのとおり**（`socket.ts:165-168`）
- 「`cm-<index>` / `vtr-<index>` / `sec-<index>` という配列 index 由来の合成 id がある」（04 §5-3a）→
  **そのとおり**（`RundownPage.tsx:218,227,237`）。ただし**進行側には無い**（#2）
- 「実尺は `useState` にしか無い」（04 §5-3a）→ **そのとおり**（`RundownPage.tsx:135`）
- 「`data` はサーバーが書かない（Yjs が3秒ごとに丸ごと上書き）」→ **そのとおり**
  （`collab.ts:68` の `UPDATE ... SET data`、`:77` の `3000`）
- 「本番中の書き込みは計時をブロックしないこと」→ この段は `data` に触らず、
  新しい表に1行 INSERT するだけ（§5-5）
