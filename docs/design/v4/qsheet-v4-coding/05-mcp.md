# 制作資料 v4 — MCP 対応（外部の AI から制作資料を読み書きする）

> **2026-08-21: 4観点の敵対的検査の指摘を反映済み。** 反映内容と判断待ちの項目は
> [`README.md`](README.md) を先に読んでください。
>
> 第2段階（コーディング）の設計書 ⑤。**コードは書いていません。**
> 兄弟: [`01-app-structure.md`](01-app-structure.md)（ルーティング・トップ・ジャーニー） /
> [`02-schedule.md`](02-schedule.md)（スケジュール表） / [`03-excel.md`](03-excel.md)（Excel 互換） /
> [`04-ai.md`](04-ai.md)（**AI 機能本体。この文書はその上に載る**）
> 対象: `server/src/contexts/mcp/`（ツール） + `server/src/contexts/qsheet/`（サービス）

## 決めたこと（結論先出し）

1. **MCP を出す目的は1つだけ: 「白紙の台本の最初の3割」を会話で埋めること。**
   ディレクターが Claude と話しながら、過去の似た回・当日の枠（スケジュール表）を下敷きに
   ロール（幕）と行の骨格を組み、細部は画面で詰める。本番の操作・共有設定・削除は出さない（§12）。
2. **書き込みは「提案まで」。台本そのものは MCP から変えない。**
   04-ai.md が決めた `qsheet_ai_proposals`（提案テーブル）に1行置くところまでが MCP の仕事で、
   台本への取り込みは**画面でクライアントが `applyDataUpdate` 経由で行う**（04 §3-1）。
   ⚠️ これは「ディレクターが会話だけで台本を組み上げる」が**第1版では成立しない**という意味です。
   会話 →（画面に戻って取り込み）→ 会話、の1手が入ります。理由と代案は §6。
3. **ツールは 8 本。read 5 / write 3。**
   read: `list_production_docs` / `get_production_journey` / `get_qsheet` / `get_day_schedule` / `find_similar_qsheets`。
   write: `create_qsheet` / `propose_qsheet_draft` / `discard_qsheet_proposal`。
   1本増えるたびに **82 ツール全部の `tools/list` が毎回重くなる**ので、粒度は動詞ごとではなく提案の種類ごとにまとめた。
4. **新しい提案テーブルを作らない。** 04 の `qsheet_ai_proposals` に相乗りし、
   MCP 由来を見分ける列（`source` / `idempotency_key` / `requested_by` / `read_feedback_digest`）だけを ALTER で足す。
   別表にすると**取り込み・確定・差分回収の経路が2本**になり、条件2（人の修正差分）が片方で切れる。
5. **`kind` も 04 と共有する**（`script_outline_draft` / `script_line_draft`）。
   サーバー生成と MCP 生成の切り分けは `ai_outputs.tool_name` と新しい `source` 列で行う。
   ⚠️ 現状 `get_ai_feedback_digest` は `kind` でしか切れないので、**混ざったまま集計される**（→ §10-3・§14）。
6. **制作資料のツールは OAuth actor 専用にする（静的 API キーでは 403）。**
   台本は「作成者本人／共有先／`system_admin` のみ・権限なしは 404 で存在秘匿」という設計
   （`contexts/qsheet/access.ts`）で、共有 actor `mcp-claude` に全台本を開けさせるとこの設計が丸ごと壊れる。
   **既存 19 カテゴリと扱いが違う唯一の点**なので要確認（→ §15）。
7. **見える範囲は必ず `canAccessDoc` を通す。** 一覧・検索・取得・提案のすべてで OAuth actor を
   実ユーザーに解決してから既存の判定に掛ける。MCP のためだけの判定を新しく書かない。
8. **類似検索は 04 の `qsheet_doc_index` を使う。** MCP のために別の検索を作らない
   （ILIKE の自前検索を足すと、画面と MCP で「似ている」の定義が2つになる）。
9. **AI に埋めさせるブロック型は 04 §2-4 に従い第1版は `scenario` のみ。**
   11型は1つも減らさないが、**AI が書く型は絞る**（`led_xr` の `sceneId`・`stage_diagram` の
   `templateIndex` は参照なので、AI に作らせるとデータが壊れる）。提案の型は 11 型ぶん用意して、
   第1版は検証で弾く（§5）。
10. **既存ツールは1文字も変えない。** 追加のみ。必須引数の追加・引数名変更・enum 値削除はしない
    （メール取込スキルが最短1時間おきに動いており、必須引数を1つ足すと次の実行から全部落ちる）。
11. **スケジュール表は読み取り専用。** 枠はひな形適用（02 §5）で人が作るほうが速く、
    重なり・拠点・部屋の制約が多くて AI の提案が当たらない。読めれば会話は成立する。

---

## 0. 前提（実装を読んで確認した事実。推測ではない）

| 事実 | 出どころ |
| --- | --- |
| MCP は `POST /api/v1/mcp` のみ（GET/DELETE は 405）。ステートレスで毎リクエスト `McpServer` を生成 | `server/src/app.ts:97-101` / `contexts/mcp/index.ts` |
| 認証は2方式。静的 API キー → actor は `config.mcpActorId`（既定 `'mcp-claude'`・`isOAuth:false`）／OAuth 2.1 → actor は実 `users.id`（`isOAuth:true`） | `contexts/mcp/auth.ts` |
| actor は `AsyncLocalStorage`（`actorContext`）に載り、ツールは `currentActorId()` で取る | `contexts/mcp/helpers.ts:13-19` |
| 権限ゲート `enforceToolPermissions()` は **`isOAuth === false` なら即 return**（静的キーはフルアクセス運用鍵） | `contexts/mcp/gate.ts:105` |
| **read ツール 44 本にはゲートが無い**（`gate.ts:14` に明記の既知の穴） | `contexts/mcp/gate.ts` |
| read/write の判定は名前ではなく「実装が `audit()` を呼ぶか」。write が `WRITE_TOOL_PERMISSIONS` に無いと `scripts/generate-mcp-tools.mjs` が `exit 1`（fail closed） | `scripts/generate-mcp-tools.mjs:73-80` |
| `mcp_audit_log.args` は**文字列だけ 1000 文字で切る**（配列・オブジェクトの要素数は無制限）。`result_summary` は切らない。`audit()` は fire-and-forget | `contexts/mcp/helpers.ts:85-96` |
| **`result_summary.created_id` を入れないと、画面の AI バッジ・AI 活動フィードに出ない**（逆引きに使われている） | `sales/services/project.service.ts:434` ほか |
| AI 出力の全文置き場は `ai_outputs.payload_snapshot`（**切り詰め禁止**）。差分は `ai_corrections`、成果は `ai_outcomes` | `migrations/134_*.sql` / `shared/services/ai-output.service.ts` |
| `get_ai_feedback_digest` は **`kind` と `window_days` でしか切れない**（`segment` 引数は 04 §6-1 が新設する提案） | `contexts/mcp/tools/aifeedback.tools.ts` |
| Qシートの見える範囲は「作成者本人／共有先／`system_admin`」。**権限なしは 403 ではなく 404** | `contexts/qsheet/access.ts` |
| Qシートの HTTP は `requireAuth + requirePermission('qsheet')` をルーター全体に。編集は `('qsheet','editor')` | `contexts/qsheet/routes/documents.routes.ts:11,113` |
| `qsheet_documents.data` は collab の `persist` が **3秒 debounce で丸ごと上書き**する。JSONB を直接 UPDATE しても次の persist で消える | `contexts/qsheet/collab.ts:62-73` |
| `YjsRoomManager` は `acquire / release / getState / applyUpdate / flush / isOpen` のみ。**サーバー発の変更を作る API も、それを配る口も無い** | `server/src/shared/collab/roomManager.ts` |
| セル・行・ロールへの明示 op（`insertRowAfter` / `setRowCell` …）は `client-qsheet/src/lib/collab/ydocOps.ts` にしかなく、サーバーは `server/src/` の外を import できない | `ydocOps.ts` / `scripts/check-collab-parity.mjs:21` |
| 冪等の作法は `idempotency_key TEXT` ＋ 部分 UNIQUE。**副作用の前に既存チェックして返す** | `migrations/126_*.sql` / `tools/projects.tools.ts:205-216` |
| MCP を叩く cron / GitHub Actions はリポジトリ内に1つも無い。呼んでいるのは Git 管理外のメール取込スキル（最短1時間おき） | `.github/workflows/*` / `tools/richContentSchema.ts:13-18` |

---

## 0-2. 04-ai.md との関係（重複をどう解消したか）

この文書と 04 は**並行して書かれた**ため、最初の版では提案テーブルを別々に定義していました
（04 が `qsheet_ai_proposals`、こちらが `qsheet_ai_drafts`）。**04 を正とし、こちらを寄せます。**

| 論点 | 正 | この文書の扱い |
| --- | --- | --- |
| 提案の入れもの | 04 §3-2 `qsheet_ai_proposals` | 相乗り。MCP 由来を見分ける列だけ ALTER（§8） |
| `kind` の値 | 04 §1-1（`event_plan_draft` / `script_outline_draft` / `script_line_draft` / `production_chat`） | 同じ値を使う。MCP から出せるのは `script_outline_draft` / `script_line_draft` の2つだけ |
| 台本への取り込み | 04 §3-1（**クライアントが `applyDataUpdate` で書く**。サーバーは記録するだけ） | 従う。**MCP に取り込みツールを出さない**（§6 に理由と第2版の案） |
| 差分をいつ取るか | 04 §3-3（「確定」= 本番翌日 / `broadcast_date` 翌日 / 7日タイムアウトの最も早いもの） | 従う。MCP のために別の窓を作らない |
| 提案の中身の型 | 04 §11 `shared/src/qsheetAi/types.ts` | 同じ型を MCP の `payload` にそのまま使う（§5） |
| 類似検索 | 04 §2-3 `qsheet_doc_index` ＋ 重み付きスコア | 同じサービスを呼ぶだけ（§4-5） |
| 提案の API | 04 §10-2（`/qsheet/ai/proposals/...`） | そのまま使う。MCP のための新 API は作らない |

**この文書が独自に決めるのはこの4つだけです**: (a) どのツールを出すか、
(b) 誰として実行されるか（§3）、(c) MCP 由来の提案をどう見分けて数えるか（§10）、
(d) MCP に**出さない**もの（§12）。

---

## 1. 何のために MCP を出すのか

### 1-1. 会話の相手（Claude）が持っていないもの

| 無いもの | 渡し方 | なぜ要るか |
| --- | --- | --- |
| **過去の似た回の骨格** | `find_similar_qsheets`（04 の索引を引く。ロール名・尺・使われている列の構成。本文は返さない） | 「去年の表彰式と同じ流れで」が会話の実際の始まり方。ここが埋まらないと Claude は一般論の台本を書く |
| **当日の枠** | `get_day_schedule`（02 のスケジュール表） | 「リハ 13:00-15:00、本番 18:00-19:30」が決まっていれば、ロールの尺の合計がそこに収まるかを言える |
| **今どこまで出来ているか** | `get_production_journey`（01 §4） | 「次に決めること」が既に計数として出ている。AI は**それを読むだけ**でよく、自分で判定式を作らない。⚠️ **キーは `shared/src/production/journey.ts` の `SUGGESTION_KEYS` を参照すること。文字列を書き写さない**（検査 整合#15。初版はここに4件しか書いておらず、01 の5件と食い違っていた） |

### 1-2. 想定シナリオ（第1版で実際に起きること）

```
ディレクター「12/5 の祝賀会、去年と同じ流れで台本の骨だけ作って」
  → get_production_journey(project_id)              … その日は「枠 1件・台本 なし」
  → get_day_schedule(project_id, date)              … 本番 18:00-19:30（90分）
  → find_similar_qsheets(project_id)                … 去年の回（類似 17点・8ロール・合計 92分）
  → get_qsheet(似た回の id, mode='outline')         … ロール名と尺
  → get_ai_feedback_digest(kind='script_outline_draft')  … 「尺が短めに直されがち」等
  → create_qsheet(project_id, broadcast_date)       … 空の台本を作る（冪等）
  → propose_qsheet_draft(kind='script_outline_draft', payload)   … 提案を1件置く
Claude「8ロール・合計 88 分で組みました。編集画面の『AIの提案』に入れてあります。
        取り込むと台本に入ります。乾杯は 3 分にしています」
ディレクター（画面で内容を見て、要らない行を外して「取り込む」）
  → クライアントが applyDataUpdate で流し込み、POST /proposals/:id/apply が id を記録
  → 以降の直し（乾杯 3→5分）は本番翌日の「確定」で ai_corrections に載る（04 §3-3）
```

**「取り込む」だけが画面に戻る**、という形です。ここを会話に戻せるかは §6。

### 1-3. 成立しない使い方（設計から外したもの）

- **本番中に Claude と話しながら進行する。** 本番の操作（`cue:*`・タイマー）は出しません（§12）。
- **無人バッチが台本を作る。** 静的キーを拒否する（決めたこと6）ので構造的にできません。
- **AI が台本を完成させる。** 立ち位置図・画像・スライドはテキストで往復しません（03 §4-2）。骨格までです。

### 1-4. これは AI 機能なので、会社方針が掛かる

`.claude/skills/ai-feedback-loop/` の5条件が全部掛かります。**ただし条件1〜3・5の設計は 04 が持っています。**
この文書が足すのは「MCP 由来をどう見分けて数えるか」だけです（§10）。

---

## 2. 全体の形

```
 Claude（会話・OAuth で ONAiR に繋がっている）
   │
   │ read:  list_production_docs / get_production_journey / get_qsheet /
   │        get_day_schedule / find_similar_qsheets / get_ai_feedback_digest
   │
   │ write: propose_qsheet_draft                     ← 台本は変わらない
   ▼
 qsheet_ai_proposals (state='open', source='mcp')  ──→ ai_outputs（payload 全文・kind は 04 と共有）
   │
   ▼
 編集画面「AIの提案」トレイ（04 §3-4 の取り込み）
   │  クライアントが applyDataUpdate で data へ流し込む
   │  POST /qsheet/ai/proposals/:id/apply  ← applied_payload と採番された id を記録
   ▼
 人が画面で直す（尺・台詞・マイク…）
   │
   ▼
 締めバッチ（04 §3-3・本番翌日 03:00 など）→ ai_corrections / ai_outcomes
   │
   ▼
 get_ai_feedback_digest → 次の propose がそれを読んでから書く
```

**MCP は左半分だけ**です。右半分（取り込み・確定・差分）は 04 の設計をそのまま使います。

---

## 3. 権限とアクター

### 3-1. 制作資料のツールは OAuth actor 専用（新しい扱い）

既存 19 カテゴリはすべて静的 API キーで叩けます（フルアクセス運用鍵）。**制作資料だけは許しません。**

- 台本は**文書単位の秘匿**（作成者／共有先／`system_admin`）で、`mcp-claude` という
  共有 actor には「誰の台本まで見てよいか」が定義できない。
- 権限なしを 404 で返す既存方針（存在秘匿）は、共有 actor がいると意味を失う。
- 無人バッチが台本を書かないことを、運用の約束ではなく**構造**で保証できる。
- ~~04 §3-3 の締め処理は `if (userId === config.mcpActorId) return;` を使う~~
  → **この根拠は落としました（検査 整合#9）。** 04 の `settleProposal` は翌日のバッチで
  `applied_payload` と現在の `data` を突合するだけで **`userId` がスコープに存在せず、
  そんな防御は実装できません**（04 側もその行を削除しました）。
  **存在しない防御を根拠にしない。** 結論（OAuth 専用）は残りの3つで十分立ちます。

```ts
// server/src/contexts/mcp/tools/production.access.ts（新規）
export interface ProductionActor {
  id: string;                            // users.id
  role: string;                          // 'system_admin' など
  permissions: Record<string, string>;   // { qsheet: 'editor' } — access.ts が期待する形
}

/**
 * 制作資料ツール共通の入口。**全ツール（read も write も）の先頭で呼ぶ。**
 * - 静的 API キー actor は 403（read ツールにはゲートが無いので、ここで止めるしかない）
 * - OAuth actor を実ユーザーへ解決し、canAccessDoc / requirePermission と同じ判定に使う
 */
export async function requireProductionActor(minLevel?: 'editor'): Promise<ProductionActor>;
```

- 静的キーのとき: `throw new AppError('FORBIDDEN', '制作資料のツールは ONAiR ログイン連携（OAuth）でのみ使えます。共有APIキーでは台本を開けません。', 403)`
- `minLevel='editor'` のときは `user_permissions.qsheet` が `editor` 以上か `role='system_admin'`
  （`gate.ts` の `LEVEL_ORDER` をそのまま使い回す）。

⚠️ **`gate.ts` への登録も別途必要**（write が表に無いと `generate-mcp-tools.mjs` が落ちる）。
ハンドラ側と二重になりますが**二重で正しい**です — gate は OAuth のときだけ効き、静的キーを素通しします。

```ts
// gate.ts の WRITE_TOOL_PERMISSIONS に追加
create_qsheet:             { module: 'qsheet', level: 'editor' },
propose_qsheet_draft:      { module: 'qsheet', level: 'editor' },
discard_qsheet_proposal:   { module: 'qsheet', level: 'editor' },
```

### 3-2. 行単位の見える範囲

| ツール | 判定 |
| --- | --- |
| `list_production_docs` / `find_similar_qsheets` | SQL に `created_by = :me OR EXISTS(shares)` を足す（`system_admin` は素通し）。**見えないものは件数にも入れない**（`shared/tests/countHonesty.test.ts` の作法） |
| `get_qsheet` / `propose_qsheet_draft` | `canAccessDoc(actor, docId, created_by)` が false なら **404**（403 にしない） |
| `get_day_schedule` | 02 §9-3 の `access.ts` 追加分に従う |
| `get_production_journey` | 01 §4-5 と同じ（閲覧は `qsheet` reader・資料の中身は返さない） |
| `create_qsheet` / `propose_*` / `discard_*` | 上に加えて `qsheet` `editor` 以上 |

### 3-3. 公開URL（音声サポート）と MCP の関係

音声サポートは認証前に出ている無認証経路で、失効カラムは migration 209 で DROP 済み
（URL を知れば誰でも見られる／取り消せない）。
**MCP には無認証の経路を作りません。** 発行・失効を MCP から操作できるようにもしません（§12）。

---

## 4. ツール定義

置き場所: **`server/src/contexts/mcp/tools/production.tools.ts`**（新規・カテゴリキー `production`）。
`server.ts` の `buildMcpServer()` に `registerProductionTools(server);` を1行、
`scripts/generate-mcp-tools.mjs` の `CATEGORY_LABELS` に
`production: "制作資料（進行台本・スケジュール表）"` を足す。

> `inputSchema` は既存の作法どおり **zod の生シェイプ**（`z.object()` で包まない）。
> `description` は AI との契約書ですが、**8本ぶん全部が毎回 `tools/list` に載る**ので、
> 契約に効かない説明（画面の使い方・背景）は書かない。

### 4-1. `list_production_docs`（read）

```ts
inputSchema: {
  project_id: z.string().optional().describe('案件 id（GLS番号ではない。分からなければ list_projects で引く）'),
  gls_number: z.string().optional().describe('GLS番号（GLS-A012）。project_id の代わりに使える'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // ⚠️ 文字列を書き写さず 01 §3-2 の MiniAppKey を import して enum を組む（検査 整合#1）
  app: z.enum(MINI_APP_KEYS).optional().describe('省略＝両方'),  // 'sheet' | 'schedule'
  q: z.string().max(100).optional().describe('資料名・資料番号の部分一致'),
  limit: z.number().int().optional(),
  page: z.number().int().optional(),
}
```

```ts
interface ProductionDocRow {
  app: MiniAppKey;               // 'sheet' | 'schedule'（01 §3-2 から import）
  id: string;
  docNo: string | null;          // SB-202608-0001 / SD-…（01 §2-2）
  title: string;
  projectId: string | null;
  glsNumber: string | null;
  date: string | null;           // qsheet.broadcast_date / schedules.service_date
  status: string;                // draft|rehearsal|on_air|archived / draft|fixed|archived
  /** sheet のみ。**jsonb_typeof のガード付き**で取る（data 全文は読まない）。
   *  ガードが無いと、sections が配列でない壊れた行1件で一覧が丸ごと 500（検査 地雷#15） */
  sectionCount?: number;
  updatedAt: string;             // ISO8601
  updatedByName: string | null;
}
interface ListProductionDocsResult {
  docs: ProductionDocRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  note?: string;                 // 「共有されていない資料は含みません」（数の正直さ）
}
```

### 4-2. `get_production_journey`（read）

01 §4-5 の API をそのまま呼ぶ薄いラッパー。

```ts
inputSchema: {
  project_id: z.string().optional(),
  document_id: z.string().optional().describe('案件に紐づかない資料単体のとき'),
  from: z.string().optional(), to: z.string().optional(),   // YYYY-MM-DD
}
// 返り値 = 01 §4-5 の JourneyResponse['data']（days[].stages / suggestions を含む）
```

`description` に必ず書くこと: **「`tone`（blank/touched/recent）は完成度ではなく『触られたか』です。
遅れている・進んでいるといった評価をユーザーに返さないでください」**
（01 §4-2「形容詞を使わない」をツールの契約に落とす）。

### 4-3. `get_qsheet`（read）

**台本全文を既定で返さない**のが肝です（`data` 1本で数百 KB になり得る）。

```ts
inputSchema: {
  document_id: z.string(),
  mode: z.enum(['outline', 'section', 'full']).optional()
    .describe('既定 outline（ロールの一覧と尺だけ）。section は section_id 必須。full は 400 行まで'),
  section_id: z.string().optional(),
  include_text: z.boolean().optional().describe('本文（台詞・メモ）を含める。既定 false'),
}
```

```ts
interface QsheetOutline {
  id: string; docNo: string | null; title: string; status: string;
  /** ★検査（整合#14）で修正。`meta.draft` は型に残っているだけで誰も読み書きしていない。
   *  実装は draftType ∈ {'numbered','準備稿','決定稿'} ＋ draftNumber で、「第3稿」は計算結果 */
  meta: { draftType: 'numbered' | '準備稿' | '決定稿'; draftNumber: number | null;
          draftLabel: string;                                  // 表示用「第3稿」
          broadcastDate?: string; startTime?: string;
          broadcastStartTime?: string; location?: string; author?: string };
  /** ★検査（整合#7）。`ref` が5本の設計書共通のセル参照方式（03 の機械キーと同じ文字列） */
  blocks: { ref: string; blockId: string; type: BlockType; label: string }[];
  sections: {
    id: string; label: string; duration: string | null; rowCount: number;
    marker: 'break' | 'pageBreak' | 'vtr' | null;             // 挿入行は rows を持たない
  }[];
  /** totalSec は docTotalSec()（00-datamodel-fixes.md §3）。素朴な合計を使わない */
  totals: { sections: number; rows: number; totalSec: number; durationText: string | null };
  masters: { persons: string[]; video: string[]; audio: string[]; telop: string[]; micTypes: string[];
             micChannels: { ch: number; label?: string }[] };
  ledScenes: { id: string; name: string }[];                  // wall/floor の中身は返さない
  /** ★00-datamodel-fixes.md §1 の後は id 参照。移行前は index も併記する */
  stageTemplates: { id: string; name: string }[];
}

interface QsheetRows {
  sectionId: string; label: string;
  rows: { id: string; label: string | null; duration: string | null;
          /** ★キーは **BlockType ではなく blockRef**（`blk.scenario#2` など） */
          cells: Record<string, string> }[];                   // 列ごとに1行のテキストへ畳む
  truncated: boolean;
}
```

⚠️ **`cells` のキーを `BlockType` から `blockRef` に変えました（検査 整合#7）。**
実装は `row.cells[blockId]`（`PrompterPage.tsx:33`, `CueRow.tsx:367,376`）で、
**同じ型のブロックが2本ある状況は 03 が前提にしています**（機械キー `blk.<type>#<n>`、
「同型ブロックが2本のときは見出し末尾に `(2)`」）。
`Partial<Record<BlockType, string>>` のままだと **2本目のシナリオ列が黙って落ちます。**

→ **03 の `blk.<type>#<n>` を5本共通の参照方式に昇格**し、
`shared/src/qsheetAi/blockRef.ts` に `resolveBlockRef(blocks, ref)` を置きます
（[`00-datamodel-fixes.md`](00-datamodel-fixes.md) §4）。
`get_qsheet` が返す `blocks[]` は `_schema` シートが持つ対応表と**同じもの**です。
04 の提案の `cells` も同じキーで書きます（初版は「`cells[scenarioBlockId]`」とだけ書いており、
シナリオ列が2本あるときどちらに書くかを決めていませんでした）。

**セルをテキストに畳む規則**（返り値を小さく保つため。**書き戻しは提案の型で行う**ので往復はしない）:

| 型 | 返す文字列 |
| --- | --- |
| `scenario` | `名前｜本文`（`include_text=false` なら `名前｜(120字)`）。HTML タグは除去済みの平文 |
| `video` / `audio` / `telop` | `ラベル｜メモ` |
| `audio_mic` | `ch1:山田(ハンド/on) ch2:…`（`assignments` を ch 昇順で） |
| `led_xr` | `シーン名｜cueType｜transition`（`sceneId` はシーン名に解決してから返す） |
| `stage_diagram` | `ひな形名｜note`（`templateId` を名前に解決。移行前は `templateIndex`） |
| `slide` | 画像のファイル名（**06-editor.md §3 で書き込み経路を作るまでは常に空文字**） |
| `remarks` / `item` / `lighting` | `value` をそのまま |

- 画像は**URLだけ**返す。この URL は `requireAuth + qsheet editor` が掛かっているので
  Claude からは開けません。**それでよい**（開けたら困る）。
- `mode='full'` で 400 行を超える台本は `error: 'TOO_LARGE'` にして `section` 指定を促す。

### 4-4. `get_day_schedule`（read）

```ts
inputSchema: {
  schedule_id: z.string().optional(),
  project_id: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('project_id と併用'),
}
```

```ts
interface DayScheduleResult {
  id: string; title: string; serviceDate: string;
  locationName: string | null; slotMin: number;
  viewStartMin: number; viewEndMin: number;
  columns: { id: string; group: 'venue' | 'prep' | 'ops'; label: string; roomName: string | null }[];
  items: {
    id: string; columnId: string; title: string; kind: string;
    startMin: number; endMin: number; startText: string; endText: string;  // 日跨ぎは 25:30（02 §7-2）
    assignee: string | null; note: string | null;
    qsheetDocumentId: string | null;
    linkBroken: boolean;      // join が外れた＝消された台本へのリンク（02 §3-3）
  }[];
}
```

`description` に書くこと: **「`kind='onair'` の長さと台本のロールの尺の合計がつり合っているかを
見るのに使ってください。尺を自動で書き戻してはいけません（02 §6-3）」**。

### 4-5. `find_similar_qsheets`（read）

**04 §2-3 の `qsheet_doc_index` と同じスコア関数を呼ぶだけ**にします
（MCP のために別の「似ている」を作らない）。

```ts
inputSchema: {
  document_id: z.string().optional().describe('この台本に似た回を探す（いちばん精度が高い）'),
  project_id: z.string().optional().describe('document_id が無いとき。案件の属性で探す'),
  exclude_document_id: z.string().optional(),
  limit: z.number().int().optional(),        // 既定 3・最大 5（few-shot と同じ本数）
}
```

```ts
interface SimilarQsheet {
  id: string; title: string; docNo: string | null;
  projectName: string | null; customerName: string | null;
  serviceDate: string | null;
  score: number;                        // 04 §2-3 の重み付きスコア（画面と同じ値）
  reasons: string[];                    // 「同じ顧客」「同じ案件種別」「同じ拠点」…
  sections: { label: string; duration: string | null; rowCount: number }[];  // 本文は返さない
  blockTypes: BlockType[];
  totals: { sections: number; rows: number; totalSec: number };
  isReference: boolean;                 // 04 §2-7「見本にしてよい」印
}
```

- **`is_reference = false` の台本は返さない**（04 §2-7 の守秘の印）。
- **見える範囲で絞ってから返す。** 新しく入った人には結果が空になりますが、
  「共有されていない他人の台本を見せる」よりは正しい（→ §15 で要確認）。
- ⚠️ **04 §2-7 との食い違いを解消しました（検査 地雷#5・AIループ#F18）。**
  初版の 04 は「骨格は全社共有の情報として扱う」、こちらは「見える範囲で絞る」と書きながら、
  **両方が「同じスコア関数を呼ぶだけ」と書いていました。実装は片方の意味しか持てません。**
  → 04 側で `findSimilarDocs({ viewerId, scope: 'visible' | 'org_outline' })` と
  引数で明示的に分け、**既定を `'visible'`** にしました。
  **MCP は `scope:'visible'` のみ許可**（`org_outline` を MCP から呼ばせない）。
  04 §14-4 と §15-4 は**同じ質問**なので、README で1つに統合しています。

### 4-6. `create_qsheet`（write）

```ts
inputSchema: {
  title: z.string().max(500),
  project_id: z.string().optional(),
  episode_id: z.string().optional(),
  broadcast_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  block_types: z.array(z.enum(BLOCK_TYPES)).optional()
    .describe('既定の列。省略時は scenario / video / audio の3列（今の新規作成と同じ）'),
  idempotency_key: z.string().max(200).optional()
    .describe('同じ意図で二度呼んでも1本しか作らない鍵。例 mcp:<project_id>:<YYYY-MM-DD>:qsheet'),
  ...REQUESTED_BY,
}
```

```ts
interface CreateQsheetResult {
  created: boolean;                 // false = 既存を返した（冪等）
  existing?: boolean;
  document: { id: string; docNo: string | null; title: string; url: string };  // /qsheet/editor/<id>
}
```

- **中身は空**（`sections: []`）で作る。骨格は `propose_qsheet_draft` の仕事。
- 作成者は OAuth actor。**共有（`qsheet_document_shares`）は触らない**（§12）。
- `audit('create_qsheet', args, { created_id: doc.id, doc_no }, args.requested_by)` を必ず呼ぶ。
  呼ばないと read と誤判定され、ゲート検査から漏れ、画面の AI バッジにも出ません。
- ⚠️ **これは AI 生成物ではない**（人が言った題名で空の器を作るだけ）ので `ai_outputs` には残しません。
  残すと「無修正採用率」の分母に中身の無い行が混ざります。

### 4-7. `propose_qsheet_draft`（write・台本は変わらない）

```ts
inputSchema: {
  document_id: z.string(),
  kind: z.enum(['script_outline_draft', 'script_line_draft'])
    .describe('script_outline_draft=ロールと尺の並び / script_line_draft=セリフ。' +
              '**04-ai.md と同じ値**。1回の提案で混ぜない'),
  /** 提案の本体。shared/src/qsheetAi/types.ts の型（04 §11）。§5 の検証を通る */
  payload: <ScriptOutlineProposal | ScriptLineProposal>,
  /** 生成に使った材料の要約。ai_outputs と qsheet_ai_proposals.context に入る */
  context: z.object({
    based_on_document_ids: z.array(z.string()).max(5).optional(),
    schedule_id: z.string().optional(),
    onair_window_min: z.number().int().optional().describe('当日の枠の本番の長さ（分）'),
    note: z.string().max(1000).optional().describe('なぜこの構成にしたか（人が読む）'),
  }).optional(),
  read_feedback_digest: z.boolean().optional()
    .describe('生成前に get_ai_feedback_digest を読んだか。**読まずに出した割合も測ります**'),
  model: z.string().max(100).optional().describe('生成したモデル名（ai_outputs.model）'),
  prompt_version: z.string().max(50).optional(),
  idempotency_key: z.string().max(200).optional(),
  ...REQUESTED_BY,
}
```

```ts
interface ProposeDraftResult {
  created: boolean; existing?: boolean;
  proposal: {
    id: string; documentId: string; kind: string; state: 'open';
    summary: { sections: number; rows: number; totalDurationText: string | null };
  };
  /** 検証で落ちたもの。**黙って落とさない**（400 にもしない） */
  dropped: { path: string; reason: 'unsupported_type' | 'no_block' | 'bad_reference' | 'html' | 'multi_entry'; detail?: string }[];
  warnings: string[];   // 例「この台本に led_xr の列がありません」「masters.persons に無い名前: 中村」
  /** 人がどこで取り込むか。**AI はこの文をユーザーに伝える** */
  next_step: string;    // 「編集画面の『AIの提案』から内容を確認して取り込んでください: /qsheet/editor/<id>」
}
```

**このとき起きること**（04 の経路にそのまま乗る）:
1. `recordAiOutput({ kind, targetTable:'qsheet_documents', targetId: document_id, payload, toolName:'propose_qsheet_draft', model, promptVersion, actorId: currentActorId(), requestedBy, sourceChannel:'mcp' })`
2. `qsheet_ai_proposals` に `state='open'` / `source='mcp'` / `ai_output_id` で1行
3. `audit('propose_qsheet_draft', args, { created_id: proposal.id, document_id, kind, rows: n }, requested_by)`

⚠️ **`payload` は `mcp_audit_log` では 1000 文字で切られます**（文字列だけ・再帰的に）。
教師データの正は `ai_outputs.payload_snapshot`（切り詰めなし）です。役割分離は既存どおり。

### 4-8. `discard_qsheet_proposal`（write）

```ts
inputSchema: {
  proposal_id: z.string(),
  reason: z.string().max(500).optional().describe('なぜ使わないか（短くてよい）'),
  ...REQUESTED_BY,
}
// → { discarded: true, proposal_id }
```

04 §10-2 の `POST /proposals/:id/discard` と同じサービスを呼びます（`reject` を1行積む）。
`reason` は `qsheet_ai_proposals.discard_reason` に入れます（04 §3-2 に列を移しました）。

⚠️ **`audit('discard_qsheet_proposal', args, { proposal_id }, args.requested_by)` を必ず呼ぶこと**
（検査 地雷#18）。`scripts/generate-mcp-tools.mjs:73` は**本文中に `audit(` があるかどうかだけで
read/write を判定します。** §4-6・§4-7 は audit を明記しているのに §4-8 だけ書いていませんでした。
権限自体は `gate.ts` が名前で効くので守られますが、`mcp-tools.json` の分類がずれます。
→ §16 のチェックリストも「**write 3本とも** audit を呼ぶ」に直しました。

**これは「無駄なツール」ではありません。** 見送りが記録されないと、条件3の「拾いすぎ」
（提案が多すぎる／的外れ）が測れません。`inquiry_intake` の見送り率が digest に入っているのと同じ理由です。

### 4-9. `get_ai_feedback_digest`（既存・変更は description のみ）

04 §10-5 が `kind` 一覧に4つ追記します。**この文書からは何も変えません。**
`propose_qsheet_draft` の description に「生成前に必ず一度読む」と書くことで経路を閉じます。

---

## 5. 提案の payload と、11ブロック型の扱い

型の正は **04 §11 `shared/src/qsheetAi/types.ts`**。ここでは**MCP から来た payload をどう検証するか**だけ決めます。
検証は `shared/src/qsheetAi/validate.ts`（新規・純関数）に置き、**画面から生成した提案も同じ関数を通す**
（サーバー生成と MCP 生成で受け入れる形が違う、という状態を作らない）。

| BlockType | 第1版で AI が書けるか | 書ける場合の形（実装に合わせる） | 書けない理由 |
| --- | --- | --- | --- |
| `scenario` | **○** | `{ entries: [{ name, html, isQWord }] }`。**`html` には平文を入れる**（読み側がタグを除去する） | — |
| `video` / `audio` / `telop` | △（第2版） | `{ entries: [{ label, memo }] }` | 素材 ID の実在確認ができない。`masters` に無い値を並べると datalist が汚れる |
| `audio_mic` | ✕ | `{ assignments: [{ ch, person, micType, state }] }` | `ch` は `masters.micChannels` の定義順。人の割り当ては当日変わる |
| `led_xr` | ✕ | `{ entries: [{ sceneId, cueType, … }] }` | `sceneId` は `data.ledScenes` への参照。**存在しない id を作られると壊れる**（04 決めたこと6） |
| `stage_diagram` | ✕ | `{ templateIndex, note }` | **配列 index 参照**。並べ替えで全行がずれる（データモデル調査の指摘1） |
| `slide` | ✕ | — | **現状の実装に書き込み経路が無い**（`CueRow.tsx:566` は枠を描くだけ） |
| `remarks` / `item` / `lighting` | △（第2版） | `{ value }` | 書けるが、第1版は骨格に集中する |

**11型は1つも減らしません。** 減らすのは「AI が書く型」であって、台本が持てる型ではありません。

**検証（`validate.ts` がやること）**

1. **型の対応**: `cells` のキーは `BlockType`。上の表で ✕ の型は落として `dropped[].reason='unsupported_type'`。
2. **列の存在**: その台本の `blocks` に同じ `type` の列が無ければ落として `no_block`（**列を勝手に足さない**）。
3. **参照**: `sceneId` / `templateIndex` が実在しなければ落として `bad_reference`。
4. **HTML 禁止**: `text` に `<` を含んだら落として `html`（04 決めたこと7。表示時に消えるうえ XSS の口）。
5. **1行1エントリ**: `entries` は必ず要素1個（v2.8.155 で統一済み）。複数入れると
   読み込み時に `splitMultiEntryRows()` が1行を N行へ割ります → `multi_entry`。
6. **`highlight` は受け付けない**。`scenario` の `highlight` は**行全体の背景色**として効きます
   （`CueRow.tsx:397`）。AI に色を選ばせる理由がありません。
7. **id を含めない**。提案の要素は一時キー（`S1` / `S1.R3`）だけを持ち、
   `sec_<uuid>` / `row_<uuid>` は**取り込み時にクライアントが `ensureStableIds` 経由で採番**します
   （id を先に決めると差分器の順序保証の外に出る＝3→769→100万行の地雷）。

**落としたものは必ず返す。** `dropped[]` を空で返して黙って捨てると、AI は次も同じものを出します。
`warnings` に「この台本に led_xr の列がありません」と書くのは、**次の会話で人が列を足せるようにする**ためです。

---

## 6. なぜ MCP に「取り込む」ツールを出さないのか（いちばん迷ったところ）

### 6-1. 出さないと決めた理由

- 04 §3-1 が「**書き込みはクライアントがやる。サーバーは記録するだけ**」と決めており、
  MCP から取り込み口を作るとその決定を裏口から破ります（03-excel.md も同じ判断で
  「サーバーが DB を直接書かず**クライアントが適用**する」にしています）。
- サーバーから台本を書くには、今は**無い部品**が3つ要ります（§6-3）。
- 04 §3-4 の改ざん防止（「提案に無い要素は黙って落とす」）は、人がプレビューで取捨選択することが前提です。
  MCP から一括適用すると、**この取捨選択の記録（条件2のいちばん濃い部分）が消えます。**

### 6-2. その代わり失うもの（正直に書く）

**「ディレクターが Claude と話しながら台本を組む」は、第1版では会話だけで完結しません。**
提案を作るところまでが会話で、取り込みは画面に戻ります。
利用者がここに不満を持つ可能性は高いと考えています（→ §15 で確認）。

ただし、**失うのは「1手」だけ**です。提案の内容は会話で何度でも直せます
（`propose` をもう一度呼べば新しい提案が並ぶ）。取り込みの瞬間だけが画面です。

### 6-3. 第2版でサーバー適用にするなら要るもの（設計だけ残す）

```ts
// server/src/shared/collab/roomManager.ts に追加
setBroadcaster(fn: (docId: string, update: Uint8Array) => void): void;
async mutate(docId: string, fn: (ydoc: Y.Doc) => void): Promise<{ changed: boolean }>;
```

手順: `acquire` → `const sv = Y.encodeStateVector(ydoc)` → `Y.transact(ydoc, () => fn(ydoc), 'server')`
→ `const update = Y.encodeStateAsUpdate(ydoc, sv)` → 空でなければ `dirty=true` → **`await flush(docId)`**
→ `broadcaster?.(docId, update)` → `release(docId)`。
⚠️ `release` は無人になったら flush して evict するので、**flush を先に呼んでから release**すること。

```ts
// contexts/qsheet/socket.ts の初期化時に1回だけ
qsheetRooms.setBroadcaster((docId, update) => {
  nsp.to(`doc:${docId}`).emit('yjs:update', Buffer.from(update));
});
```

さらに、明示 op をサーバーでも使えるようにする必要があります（サーバーは `server/src/` の外を import できない）:

```
shared/src/collab/ydocOps.ts          ← client-qsheet/src/lib/collab/ydocOps.ts を昇格（Yjs 以外に依存が無い）
shared/src/collab/stableIds.ts        ← client-qsheet/src/lib/stableIds.ts を昇格
server/src/shared/collab/ydocOps.ts   ← 意図的な複製（冒頭に「複製である」と書く）
server/src/shared/collab/stableIds.ts ← 同上
scripts/check-collab-parity.mjs       ← PAIRS に上の2対を足す
```

**差分器（`ydocDiff.ts`）は昇格しません。** サーバー側では明示 op だけを使い、
`applyDataUpdate` の順序保証（`backfillIds` → `yDocToData` → `ensureStableIds`）を
再実装しない、というのが第2版でも守るべき線です。

**そして、サーバー適用にするなら行単位の楽観ロックが要ります**（collab 経路には楽観ロックが無く、
HTTP 側の `expected_updated_at` は collab では機能しないため）:

```ts
interface UpdateRowOp {
  op: 'update_row'; sectionId: string; rowId: string;
  set: { duration?: string; label?: string; cells?: Partial<Record<BlockType, ProposedCell>> };
  /** ★必須。AI が見た時点の値（get_qsheet が返したテキスト表現）。
      現在の値と違えばその行だけ skip し、reason='row_changed' を返す */
  expect: { duration?: string | null; cells?: Partial<Record<BlockType, string>> };
}
```

**この一式（roomManager 2メソッド＋複製2ファイル＋parity＋楽観ロック）が、
「会話だけで完結する」の値段**です。第1版では払わない、という判断です。

---

## 7. 冪等性

既存の作法（`idempotency_key` ＋ 部分 UNIQUE・**副作用の前に既存チェックして返す**）に揃えます。

| ツール | 方式 |
| --- | --- |
| `create_qsheet` | `qsheet_documents.idempotency_key` ＋ 部分 UNIQUE。既存があれば採番の**前**に `{ created: false, existing: true, document }` を返す |
| `propose_qsheet_draft` | `qsheet_ai_proposals.idempotency_key` ＋ 部分 UNIQUE。同じ鍵で `state='open'` の提案があれば**それを返す**（新しい提案を作らない）。`applied` / `discarded` 済みなら `{ created: false, existing: true, note: '同じ鍵の提案は既に処理済みです' }` |
| `discard_qsheet_proposal` | **鍵は要らない**。`state` が状態機械そのもの。`discarded` を二度呼んでも成功扱い |

鍵の作り方（description に書く）: `mcp:<document_id>:<kind>:<話の区切り>`。
**AI が「意図単位」で作る文字列**という既存の作法（`email:<Message-ID>:project`）に揃えます。

⚠️ **提案は「同じ会話の中で作り直す」のが普通**なので、鍵を必須にしません。
必須にすると「もう少し短くして」の作り直しが全部弾かれます。
**作り直しは新しい提案として並ぶ**のが正しく、古いほうは人が見送るか `expires` で落ちます。

---

## 8. DDL

新規テーブルはありません。**04 の `qsheet_ai_proposals` に列を足すだけ**です。

```sql
-- 21z_qsheet_mcp.sql
-- ⚠️ 番号は README.md の採番表が正（設計書5本が 211・212 を取り合っていた）。
--    migrate.ts はファイル名順に流すだけなので **CI は落ちず、黙って想定と違う順で流れる**。

-- ▼ MCP 由来の提案を見分ける・数えるための列（04 §3-2 の表に足す）
-- ★検査（AIループ#F5・F16／整合#12）で `source` / `discard_reason` / `expires_at` は
--   **04 §3-2 の DDL 本体へ移しました**（04 が提案テーブルの正で、04 単独で実装すると
--   期限処理と「なぜ見送ったか」がまるごと落ちるため）。ここに残すのは MCP 固有の3列だけ。
ALTER TABLE qsheet_ai_proposals
  -- AI が聞き取った指示者名（mcp_audit_log.requested_by と同じ意味）
  ADD COLUMN IF NOT EXISTS requested_by TEXT,
  -- 生成前に get_ai_feedback_digest を読んだか（読ませるための可視化。§10-2）
  ADD COLUMN IF NOT EXISTS read_feedback_digest BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_ai_proposals_idem
  ON qsheet_ai_proposals (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_proposals_source
  ON qsheet_ai_proposals (source, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsheet_ai_proposals_expiring
  ON qsheet_ai_proposals (expires_at) WHERE state = 'open';

-- ▼ create_qsheet の冪等キー（migration 126 と同じ形）
ALTER TABLE qsheet_documents ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_qsheet_documents_idem
  ON qsheet_documents (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
```

- **`source` に既定値 `'server'` を入れる**ので、04 が先に入っていても後から入っても壊れません。
- `qsheet_documents` に足す `idempotency_key` は**部分 UNIQUE**（`deleted_at IS NULL` 込み）。
  消した台本の鍵を使い回せるようにするためで、これも migration 126 と同じ形です。

---

## 9. API（画面側）

**新しい HTTP API は作りません。** 04 §10-2 の提案 API をそのまま使います。

| メソッド | パス | この文書での扱い |
| --- | --- | --- |
| GET | `/qsheet/ai/proposals?document_id=&state=` | 編集画面の「AIの提案」トレイ。**MCP 由来もここに出る**（`source` を表示に足すだけ） |
| GET | `/qsheet/ai/proposals/:id` | そのまま |
| POST | `/qsheet/ai/proposals/:id/apply` | そのまま（**取り込みはクライアント**。§6） |
| POST | `/qsheet/ai/proposals/:id/discard` | `discard_qsheet_proposal` が呼ぶのと同じサービス |
| POST | `/qsheet/ai/proposals/:id/settle` / `/wrong` | そのまま |

**画面に足すのは1つだけ**: 提案カードに「**どこから来たか**」を出す
（`source='mcp'` なら「Claude との会話から・指示者: 〇〇」）。
AI 出力を人の目に触れさせるときの決まり（誰が・いつ・どのモデルで作ったか）を満たすためで、
MCP 由来だけ出どころが違うので明示が要ります。

---

## 10. フィードバックループ（MCP がこの設計に足す分）

条件1〜3・5 の本体は 04 §5 が持ちます。ここでは **MCP から入った提案を、どう見分けて数えるか**だけ決めます。

### 10-1. 5条件の充足（MCP 側の担当）

| 条件 | MCP 側で何をするか | 弱いところ |
| --- | --- | --- |
| **1. 出力を記録** | `propose_qsheet_draft` が `recordAiOutput({..., sourceChannel: 'mcp' })` で**全文**を残す。`toolName='propose_qsheet_draft'` が経路の印になる | **`model` / `prompt_version` は AI が渡さないと空**。MCP 経由で未設定なのが既知の穴（`onair-current-state.md` #3）。引数に入れて渡させるが、**渡されない前提で `by_model` を読むこと** |
| **2. 人の修正差分** | **何もしない。** 04 §3-3 の締め処理（取り込み時の `applied_ids` を鍵に、本番翌日に突合）にそのまま乗る | MCP から取り込みができない第1版では、**提案が取り込まれないまま消える**割合が高くなる可能性がある。それ自体は `discarded` / `expired` として数える |
| **3. 成果・顧客反応** | `discard_qsheet_proposal` の `reason` と、`state='expired'`（放置）を負の成果として積む。**`source='mcp'` 別に集計できるようにする** | 「会話で作ったほうが当たるのか」を答えるには `source` 別の比較が要る。digest がまだ切れない（§10-3） |
| **4. 改善に戻す経路** | `propose_qsheet_draft` の description に「生成前に `get_ai_feedback_digest(kind=...)` を読む」を書き、読んだかを `read_feedback_digest` に記録して**読まずに出した割合も測る** | 契約はあくまで description。守らせる強制力は無い（記録して後から言うしかない） |
| **5. レビュー頻度と担当** | 04 §5-5 の月1レビュー（`ops_reports.kind='ai_review_production'`）に**MCP 由来の項目を足す**: `source='mcp'` の件数・取り込み率・見送り率・`read_feedback_digest` の割合 | 担当は 04 と同じ（制作管理のマネージャー）。**MCP 側の担当を別に立てない** |

### 10-2. 「digest を読んだか」を記録する理由

条件4は「経路がある」だけでは回りません。**読まずに出した提案の割合**が分かると、
description を強くするか、`propose` 側で digest を強制的に添付するかの判断ができます。
`read_feedback_digest` は**そのためだけの列**です（AI の自己申告なので厳密ではありませんが、
0% と 80% の区別はつきます）。

### 10-3. サーバー生成と MCP 生成が同じ `kind` に混ざる問題（未解決）

`get_ai_feedback_digest` は `kind` と `window_days` でしか切れません。
`script_outline_draft` に「画面から ONAiR のサーバーが生成したもの」と
「Claude が会話で書いたもの」が混ざると、**無修正採用率がどちらの数字でもなくなります。**

考えた案は3つ:

| 案 | 良い点 | 悪い点 |
| --- | --- | --- |
| A. `kind` を分ける（`script_outline_draft_mcp`） | digest を1文字も変えずに切れる | 分母が2つに割れて、どちらも薄くなる。04 の kind 定数と二重管理になる |
| B. `source` 列＋ digest に軸を足す | 正しい。04 §6-1 が `segment` 引数を足す予定なので**一緒に足せる** | 04 の実装待ち。先に MCP だけ入れると当面は混ざったまま |
| C. 当面は混ぜたままにして、`ai_outputs.tool_name` で後から SQL で切る | 何も作らなくてよい | digest（＝AI が読む経路）には出ない。人が SQL を書かないと分からない |

**決定: B を採ります。C は採りません（検査 AIループ#F12）。**
「当面は混ざったまま」を許すと、**混ざった期間のデータは後から切り分けられません。**
04 §6-1 の第3引数を `segmentKey` の文字列ではなく
**`{ segmentKey?: string; source?: 'server'|'mcp' }` のオブジェクト**にして、
**04 と同時に入れます**（digest を2回いじらない）。
`source` 列を先に持つ、という判断はそのまま（後から埋め直せないため）。

あわせて、MCP から来た自己申告の `model` は **`mcp:` を前置して保存**します
（`mcp:claude-opus-4`）。検証できない値とサーバーが入れた値を `by_model` の同じ列に
混ぜないためで、digest 側は1文字も変えずに読み分けられます（04 §6-5c）。

### 10-4. 放置された提案（`expired`）

`state='open'` のまま `expires_at`（既定 14日）を過ぎたものは、
04 の締めバッチのついでに `discarded` へ落とし、`discard_reason='expired'` を入れます。
**放置は「見送り」と同じ意味の成果**です（提案が的外れだったか、多すぎた）。

⚠️ **`state='expired'` という表記は消しました（検査 整合#12）。**
`state` の CHECK は `open|applied|discarded|failed` で **`'expired'` は入りません。**
`state='discarded'` ＋ `discard_reason='expired'` が正です。
落とすときに `recordCorrections(outputId, [{ fieldPath:'(全体)', type:'reject',
note:'未使用のまま期限切れ' }])` を積むこと（04 §3-3。積まないと
**生成したのに使われなかった提案が集計上「存在しなかったこと」になります**）。

⚠️ 04 §3-3 の `timeout`（7日）は**取り込み済みの提案の差分を締める**タイムアウトで、
こちらは**取り込まれなかった提案を落とす**期限です。**別物なので同じ定数にしないこと。**

---

## 11. 既存の無人バッチを壊さない

- **既存 82 ツールの引数・名前・enum は1文字も変えない。** 変更は追加のみ。
  メール取込スキル（`/root/.claude/skills/sales-mail-gmoonair/`・**Git 管理外**）が最短1時間おきに
  動いており、必須引数を1つ足すと次の実行から全部落ちます。
- 今回の 8 本は名前空間が重なりません（`*_qsheet*` / `*_production*` / `*_day_schedule`）。
- **静的キーを拒否する変更は既存バッチに影響しません**（バッチは制作資料のツールを呼ばない＝新設なので呼びようがない）。
  ただし `requireProductionActor` を**既存ツールに広げてはいけません** — 広げた瞬間にメール取込が全部 403 になります。
- ⚠️ **`tools/list` が 82 → 90 本になります。** description は毎回全部が送られるので、
  **既存バッチ1回あたりのトークンも増えます。** 今回の 8 本の description は
  「AI が守るべき契約」だけに絞ること。効くようならカテゴリ単位の出し分けが要りますが、
  **今回は作りません**（実測してから決める → §15）。
- 追加後は必ず `node scripts/generate-mcp-tools.mjs` を流して `client/public/mcp-tools.json` を更新し、
  **`docs/mcp-server.md` の表と件数を手で直す**（手書きなので、v4 時点で11種抜けていた実績があります）。

---

## 12. MCP を出さないほうがよい部分（正直に書く）

「何でも MCP にすると監査と権限が破綻する」ので、**出さないと決めたもの**を理由つきで並べます。

| 出さないもの | 理由 |
| --- | --- |
| **台本への取り込み（apply）** | §6。04 が「書き込みはクライアント」と決めており、取捨選択の記録（条件2の濃い部分）も画面にある |
| **本番の操作**（`cue:update` / `cue:next` / タイマー / ランダウンの進行） | 本番中に AI が1拍遅れて進行を送ると事故が事故のまま残る。しかも Socket.IO の中継はサーバーに何も保存されず、**監査ログでは何が起きたか再現できない** |
| **公開URL（音声サポート）の発行・失効** | 権限の外にデータを出す操作。失効カラムは migration 209 で DROP 済みで**失効させられない**（配ったら取り消せない）。まず画面と DB を直すのが先 |
| **共有設定（`qsheet_document_shares`）の変更** | 「見える範囲を AI が広げられる」のが最悪の失敗の形。台本の秘匿は 404 で存在ごと隠す設計で、その根っこを AI に渡さない |
| **削除**（文書のソフトデリート・行やロールの削除・`trash` の操作） | 消す判断は人。誤って消えたときに「AI がやった」を切り分けられる状態を保つ |
| **並べ替え** | Yjs に atomic move が無く clone(delete+insert) で identity を失う（`ydocOps.ts:221`）。並行編集を静かに取りこぼす操作を AI に持たせない |
| **ジャーニーのピン（`production_journey_marks` の `settled` / `watch` / `dismissed`）** | 01 §4-2 の「**『決まった』と言えるのは人が押したときだけ**」がジャーニーの芯。AI が押せたらこの指標は即座に無意味になる |
| **スケジュール表の書き込み** | ひな形適用（02 §5）で人が作るほうが速い。重なり・拠点・部屋・日跨ぎの制約が多く提案が当たらない。**読めれば会話は成立する** |
| **Excel 取込の適用** | 03 §8-1 で「クライアントが適用する」と決めた。MCP から適用口を作るとその決定を裏口から破る |
| **マスター（`persons` / `micTypes` …）の編集** | 文書ごとの語彙。AI が足すと表記ゆれが増え datalist が汚れる。未登録の語を使ったら `warnings` に出して人に足させる |
| **画像のアップロード** | `upload.routes.ts` のマジックバイト検証・5MB 上限・ハッシュ命名を通す必要がある。MCP から任意ファイルの投入口を作らない |
| **立ち位置図の座標編集・LED シーンの新規作成** | テキストで往復しない（03 §4-2）。既存を名前で指すところまで |
| **`system_admin` 相当の横断読み取り** | 「作成者／共有先のみ」を MCP からだけ緩めない。空振りするのが正しい |
| **壁打ち（`production_chat`）を MCP ツールにすること** | 04 §4 の壁打ちは**画面の中で ONAiR のサーバーが LLM を呼ぶ**機能。MCP 越しの Claude が使うと「Claude が Claude に相談する」二重呼び出しになり、記録も二重になる |

**もう一段の判断**: 制作資料のツールを**別の MCP エンドポイント**（`/api/v1/mcp/production`）に
分ける案も考えました。監査と権限を分離でき、`tools/list` のコストも切り離せます。
**今回は採りません** — 認証・ゲート・監査の実装が2系統になり、片方だけ直す事故
（`lend_security_card` のゲート漏れと同じ形）を確実に呼ぶからです。
分けるならエンドポイントではなく**ツールの出し分け**でやるべきで、それは実測してから。

---

## 13. 動作確認の手順（MCP 専用の自動テストが無いため）

`npm run test` は `shared` の Vitest だけで、**MCP のツールを叩くテストは1本もありません**。
着手時は次の順で確かめます。

1. `npm run typecheck` / `npm run lint` / `npm run test`
2. `node scripts/generate-mcp-tools.mjs` が **exit 0**（write ツールのゲート登録漏れが無い）
3. `docs/mcp-server.md` 末尾の curl 手順（initialize → tools/list → tools/call）。
   ⚠️ **静的キーでは 403 になるのが正しい**ので、疎通確認は OAuth を通す必要があります
   （既存ツールと手順が違う唯一の点。ここでつまずくと「壊れている」と誤解されます）
4. 検証環境（`dev.gmo-onair.jp`）で: 権限の無いユーザーの OAuth で `get_qsheet` が **404**、
   `qsheet` reader で `propose_qsheet_draft` が **403**、editor で通ること
5. 提案が編集画面のトレイに出て、取り込み → 本番翌日の締め（`/settle` を手で叩く）で
   `ai_corrections` に行が入ること。**ここまで通って初めて条件2が閉じます**
6. `shared/tests/qsheetDraftValidate.test.ts` で §5 の検証（11型の可否・HTML 禁止・1行1エントリ）を固定

---

## 14. 未確定の判断と、そう判断した根拠（迷ったところ）

### 14-1. 迷って、こう決めた

| # | 判断 | 根拠 | 迷い |
| --- | --- | --- | --- |
| 1 | **取り込みツールを出さない**（提案まで） | 04 §3-1 の「書き込みはクライアント」を破らない。取捨選択の記録が条件2の濃い部分 | **会話だけで完結しない。**利用者の期待とずれる可能性がいちばん高い箇所。第2版の設計は §6-3 に残した |
| 2 | **静的 API キーを拒否**する | 台本は文書単位の秘匿で、共有 actor に見える範囲を定義できない。04 の締め処理が `mcpActorId` を「AI 自身の更新」として捨てるので、人の修正まで捨てる恐れもある | 既存 19 カテゴリと扱いが違う。**疎通確認の手順が変わる**（§13） |
| 3 | **04 の表に相乗り**（新テーブルを作らない） | 取り込み・確定・差分の経路が2本になると、片方で条件2が切れる | 04 の DDL に依存するので、04 が変われば追随が要る。`source` の既定値で衝突は避けた |
| 4 | **`kind` を 04 と共有**する（`_mcp` を作らない） | 分母を割りたくない。04 の kind 定数と二重管理にしたくない | **当面は digest で混ざる**（§10-3）。`source` 列は先に持つが、読める場所が無い期間ができる |
| 5 | AI が書く型を **`scenario` のみ**（第1版） | 04 決めたこと6。参照型（`sceneId` / `templateIndex`）を作らせるとデータが壊れる | 「マイク香盤も下書きしてほしい」と言われる可能性はある。`audio_mic` は参照ではなく値なので、**第2版でいちばん先に開けられる**のはここ |
| 6 | ツールは **8本** | 1本増えるたびに全バッチの `tools/list` が重くなる | `add_rows` / `update_durations` のように動詞で割ったほうが AI は間違えにくい。まとめた分 `payload` の型が複雑になった |
| 7 | 提案の期限 **14日**（`expired`） | 本番が終わった提案を残しても使われない | 数か月先の本番の台本を早めに組む使い方だと、提案が先に消える |
| 8 | `create_qsheet` は **`ai_outputs` に残さない** | 空の器を作るだけで AI 生成物ではない。残すと無修正採用率の分母が汚れる | 「AI が案件から台本を起こした」という活動としては見えなくなる（`mcp_audit_log` には残る） |
| 9 | 移行番号 **215** | 210 まで使用済み | **設計書どうしが 211・212 で衝突している**（§8 のコメント）。着手時に5本まとめて振り直す |

### 14-2. まだ決まっていない・着手前に確かめること

| # | 未確定 | 確かめかた |
| --- | --- | --- |
| 1 | `tools/list` の実コスト増（82→90本） | 追加の前後で `tools/list` の応答バイト数を測る。CLAUDE.md に「TOKEN 消費量の増大要因を実測」の前例がある |
| 2 | `source` 別に digest を切れるようにする時期 | 04 §6-1 の `segment` 引数と**一緒に入れる**。単独で digest をいじらない |
| 3 | MCP 由来の提案が「取り込まれない率」 | 運用1か月。高いなら §6 の判断（取り込みを出さない）を見直す材料になる |
| 4 | `find_similar_qsheets` が空振りする割合 | 共有されていない台本は出ない。新しく入った人ほど空になる。案件メンバーへの自動共有（02 §11-8）と一緒に決める |
| 5 | `get_qsheet(mode='full')` の 400 行という上限 | 実際の台本の行数分布を検証環境で数える（`jsonb_array_length` の合計） |
| 6 | PC / モバイルのセル形ドリフト（`remarks` 等をモバイルが `{entries:[{label}]}` で書く／`led_xr` の `cue`） | v4 で片方に寄せる。**寄せる前に AI 提案の取り込みを入れると、モバイルで開いた瞬間に値が見えなくなる**。提案機能の前提条件 |
| 7 | `slide` の書き込み経路を v4 で作るか | 作らないなら提案から除外したまま（§5 の表）。作るなら型に足す。**アップロードは MCP から出さない** |
| 8 | 第2版でサーバー適用にするか | §6-3 の一式（roomManager 2メソッド＋複製2ファイル＋parity＋行単位の楽観ロック）を払う価値があるか。#3 の実測を見てから |

---

## 15. 利用者に確認すべきこと

1. **MCP を出す目的はこれで合っているか。** 「白紙の台本の最初の3割を会話で埋める」に絞りました。
   ほかに期待していること（例: 台本から機材リストを起こす・過去回の横断集計・メールの企画書から枠を起こす）が
   あれば、ツールの本数と種類が変わります。
2. **⚠️ いちばん大事: 「提案まで」で良いか。**
   第1版では、Claude と会話して提案を作り、**取り込みは編集画面に戻って人が押す**形になります。
   「会話の中で『入れて』と言ったら入ってほしい」なら、§6-3 の一式（サーバー適用）を第1版で払う判断が要ります。
3. **制作資料のツールを ONAiR ログイン連携（OAuth）専用にしてよいか。**
   共有 API キーでは使えなくなります（既存ツールと扱いが違う唯一の点）。
   これは「無人バッチが台本を作れない」ことも意味します。
4. **他人の台本を検索できないままで良いか。** 今の設計では、共有されていない台本は
   `find_similar_qsheets` に出ません。「過去回を下敷きにする」が主目的なのに、
   新しく入った人ほど下敷きが無い状態になります。案件メンバーへの自動共有を入れるなら
   02 §11-8 の判断と揃えて一度に決めたい。
5. **AI に書かせる型を `scenario` だけにして良いか**（04 と共通の確認）。
   マイク香盤（`audio_mic`）も下書きしてほしいなら、第2版でいちばん先に開けられます。
6. **提案の期限14日で足りるか。** 数か月先の本番の台本を早めに組む使い方があるなら延ばします。
7. **ツールが 82 → 90 本に増えることを許容できるか。** 既存の無人バッチ1回あたりのトークンも
   少し増えます。気になるなら、まず read 3本（`get_qsheet` / `get_day_schedule` /
   `find_similar_qsheets`）＋ write 2本（`create_qsheet` / `propose_qsheet_draft`）の**5本で始める**案もあります。
8. **月1レビュー（04 §5-5）に MCP 由来の項目を足して良いか。**
   見るのは件数・取り込み率・見送り率・digest を読んだ割合の4つです。
9. **本番の操作（進行・タイマー）を MCP から触りたい要望はあるか。**
   設計では意図的に外しました。要望がある場合でも「今どこを流しているか」を**読むだけ**に限る形なら検討できます。

---

## 16. ファイル配置（この設計で増えるもの）

```
server/src/contexts/mcp/tools/production.tools.ts        新規 8ツールの登録
server/src/contexts/mcp/tools/production.access.ts       新規 requireProductionActor（静的キー拒否）
server/src/contexts/mcp/server.ts                        1行追加（registerProductionTools）
server/src/contexts/mcp/gate.ts                          WRITE_TOOL_PERMISSIONS に3件（module 'qsheet'）
server/src/contexts/qsheet/services/ai-proposal.service.ts  ★04 が作る。MCP はそれを呼ぶだけ
server/src/shared/db/migrations/215_qsheet_mcp.sql       新規 ALTER 2本（番号は着手時に振り直す）

shared/src/qsheetAi/types.ts                             ★04 が作る（提案の型）
shared/src/qsheetAi/validate.ts                          新規 §5 の検証（画面と MCP で共用）
shared/tests/qsheetDraftValidate.test.ts                 新規 11型の可否・HTML 禁止・1行1エントリを固定

client-qsheet/src/components/editor/AiProposalTray.tsx   ★04 が作る。`source` の表示だけ足す

scripts/generate-mcp-tools.mjs                           CATEGORY_LABELS に production を追加
client/public/mcp-tools.json                             生成し直す
docs/mcp-server.md                                       表と件数を手で直す（手書きなので忘れやすい）
```

★ = 04-ai.md が作るもの。**この文書のためだけに新しく作るファイルは 5 つ**です。

**着手時のチェックリスト**（既存の作法。`docs/mcp-server.md` 準拠）

1. write ツールは成功時に必ず `audit(...)`。`result_summary` に `created_id` を入れる
   （入れないと画面の AI バッジ・AI 活動フィードに出ない）
2. `gate.ts` に `module: 'qsheet'` / `level: 'editor'` を登録（漏れると `generate-mcp-tools.mjs` が `exit 1`）
3. ハンドラの先頭で `requireProductionActor()`（**read も write も**。read にはゲートが無いため）
4. ロジックは 04 の service を再利用する（画面と同じ結果・同じ副作用）
5. `recordAiOutput()` の `kind` は 04 が export する定数を import する（**文字列を書き写さない**）
6. §13 の手順で実機確認する
