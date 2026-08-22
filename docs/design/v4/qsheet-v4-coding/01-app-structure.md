# 制作資料 v4 — アプリ全体の構造（ルーティング／トップ／ミニアプリ／ジャーニー）

> **2026-08-21: 4観点（機能欠落・AIループ・地雷・整合）の敵対的検査の指摘を反映済み。**
> 反映した内容と、まだ利用者の判断待ちの項目は [`README.md`](README.md) を先に読んでください。
>
> 第2段階（コーディング）の設計書 ①。**執筆時点ではコードは書いていませんでした。**
> ✅ **2026-08-22 追記: 実装済み**（`impl/03-app-structure-impl.md` の PR A〜G を経て、
> PR #288（A/B/C/E）と PR #290（A残・D・F・G）で全PR実装・マージ済み）。
> 第1段階のモック: [`../production-v4-native-mockups.md`](../production-v4-native-mockups.md)
> （① トップページ／②③ スケジュール表／④〜⑦ Qシート／⑧ 制作のジャーニー）
> 対象バンドル: [`client-qsheet/`](../../../../client-qsheet/CLAUDE.md)（ベースパス `/qsheet/`・ポート 5174）
>
> ⚠️ **この文書は「新しく足すもの」の設計です。**「今あるものを維持する」側
> （編集画面・本番4役割・公開音声）は [`06-editor.md`](06-editor.md) /
> [`07-onair-roles.md`](07-onair-roles.md) が持ちます。データモデルの前提修正は
> [`00-datamodel-fixes.md`](00-datamodel-fixes.md)。**migration 番号は README の採番表が正**です。

## 決めたこと（結論先出し）

1. **バンドルもベースパスも `/qsheet/` のまま**。`client-production` のような新バンドルは作らない。既存 URL（`/qsheet/editor/:id` `/qsheet/onair/:id` `/qsheet/rundown/:id` `/qsheet/prompter/:id` `/qsheet/audio/:id`）は**1つも変えない**。
2. **資料は必ず「資料ID 1本の URL」で開く。案件配下にネストしない**（`/qsheet/projects/:pid/editor/:id` を作らない）。案件の URL は**入口（ジャーニー）専用**にする。
3. **トップ（案件選択）は `/qsheet/home` に作り、`/qsheet` の向き先は1行で切り替えられる形にする。** 旧トップの一覧は `/qsheet/sheets` に移し、`/qsheet/editor`（一覧）は `<Navigate replace>` で送る。**`/qsheet` の意味が変わるかどうかだけは利用者の確認待ち**（→ §8-1・§9-1。実装コストが同じなので、後戻りできるほうを既定に置いた）。
4. トップの3つ（GLS発番前の案件／ネタ／案件に紐づかない資料単体）は、**前2つとも `projects` の行**（`gls_number IS NULL` と `stage='neta'`）で表す。**新しい案件テーブルは作らない**。
5. **資料単体には資料番号を採る**: 既存の `generateSequenceNumber()` をそのまま使い `SB-202608-0001` 形式（モックの `SB-2608-003` は仮の書式だったので、OPP コードと同じ桁に揃えた）。`qsheet_documents.doc_no TEXT`（部分 UNIQUE）を足す。**採るのは `project_id IS NULL` の新規のみ**、既存への一括後付けはしない。
6. **ミニアプリのレジストリは `shared/src/production/miniapps.ts` が唯一の正**（アイコンなど React 依存は client 側の `Record<MiniAppKey, …>` に分けて、追加忘れを型で落とす）。サーバーは `server/src/shared/production/miniapps.ts` に**意図的な複製**を置き、`scripts/check-collab-parity.mjs` の対に足して食い違いを検査する（サーバーは `server/src/` の外を import できないため）。
7. **ジャーニーに固定の判定式は作らない。** サーバーは「数えた事実」（資料の有無・件数・最終更新）だけ返し、画面は 3値の**手がかり**（資料なし／触ってある／最近動いた）に落とす。**「決まった」と言えるのは人が押したときだけ**（`production_journey_marks`）。
8. 「次に決めること」は**小さな決め打ちの手がかり関数の集合**で作り、**1件ずつ「無視する」ができて、無視したことも記録する**（役に立っているかを後で数えられるようにするため）。
9. **client/ の `DayTab.tsx` は入口だけにする。** 当日の枠の編集は制作資料側にしか置かない（同じ編集を2か所に作らない）。今の2本の API 呼び出しと技術資料のリストはそのまま残す。
10. **shared に置くのは「React も lucide も要らないもの」だけ**（登録データ・型・書式）。画面・アイコン・IME 安全な入力部品は `client-qsheet` に置いたまま動かさない。

---

## 0. 前提（実装を読んで確認した事実。推測ではない）

| 事実 | 出どころ |
| --- | --- |
| `qsheet_documents.project_id` / `episode_id` / `episode_code` / `broadcast_date` はすべて nullable | `server/src/shared/db/migrations/012_qsheet_schema.sql:7` |
| 案件は `projects` 1テーブルで「ネタ〜完了」まで持つ（`stage IN ('neta','d_hold','c_proposal','b_verbal','a_won','s_completed','e_lost')`）。GLS 番号は `gls_number TEXT UNIQUE` で **NULL 可**（発番は受注 `a_won` のとき） | `001b_postgresql_schema.sql:104` / `sales/services/project.service.ts:1324` |
| 「ヨミ」タブ＝`gls_number IS NULL AND stage <> 'e_lost'`、「進行中」＝`gls_number IS NOT NULL AND stage NOT IN ('s_completed','e_lost')` | `project.service.ts:400-406` |
| 採番はすべて `sequences` テーブル（`seq_name` PK）で**アトミック**。`generateSequenceNumber(seq, prefix)` → `PREFIX-YYYYMM-NNNN`、`generateGlsNumber` → `GLS-A001` | `shared/services/sequence.service.ts` |
| Qシートの API は `/api/v1/internal/qsheet/...`、`requireAuth + requirePermission('qsheet')` を**ルーター全体**に掛けている。公開の音声サポートだけ前に出して素通し | `contexts/qsheet/index.ts` / `routes/documents.routes.ts:12` |
| 資料の見える範囲は「作成者本人／共有先／`system_admin`」。**存在秘匿のため権限なしは 404** | `contexts/qsheet/access.ts` |
| 他アプリから案件を引く軽量 API が既にある（`GET /api/v1/internal/lookup/gls-options`・`/:projectId/episodes-options`、`requireAuth` のみ） | `contexts/platform/routes/lookup.routes.ts` |
| **サーバーは `server/src/` の外を import できない。** Yjs 変換層は `shared/src/collab/yjsDoc.ts` と `server/src/shared/collab/yjsDoc.ts` に**意図的に複製**され、`scripts/check-collab-parity.mjs` の `PAIRS` が一致を検査している | 両ファイル冒頭 / `scripts/check-collab-parity.mjs:21` |
| アプリ登録（ブロックアプリ一覧）の唯一の正は `shared/src/client/apps.ts`。`frozen: true` の印で v4 シェルの一覧から外れている。`shared/tests/apps.test.ts` が固定 | `shared/src/client/apps.ts` |
| 案件詳細の当日タブは `/sales/projects/:id/day`（`DayTab.tsx`）。`GET /qsheet/documents?project_id=` と `/techsheet/documents?project_id=` を叩き、**別バンドルなので素の `<a href>` で開いている** | `client/src/contexts/sales/pages/projectDetail/DayTab.tsx` |
| 凍結 CSS の検査 `scripts/check-frozen-css.mjs` に `client-qsheet` が入っている | `scripts/check-frozen-css.mjs:46` |

⚠️ **v4.1 でこのアプリを作り直す＝凍結を解く**ということなので、着手時に
`scripts/check-frozen-css.mjs` の対象から `qsheet` を外し、`shared/src/client/apps.ts` の
`frozen: true` を落とす作業が要る（これを忘れると CI が「CSS が変わった」で落ちる）。

### 0-1. 凍結解除の実際の範囲（検査で足した節）

**CI 対応だけでは済みません。** `client-qsheet/CLAUDE.md`「やってはいけないこと」が
明示的に禁じている3つに、この設計は正面からぶつかります。**着手前に利用者の判断が要ります**
（→ §9 の 12〜14）。

| 禁止事項（凍結中のルール） | この設計がやろうとしていること | 巻き添えになるもの |
| --- | --- | --- |
| `src/index.css` の `tokens.css` を `tokens-v4.css` に差し替えない | 新画面（トップ・ジャーニー・スケジュール表・設定）を v4 の見た目で作る | **同じバンドルの `/qsheet/onair/:id` `/qsheet/rundown/:id` `/qsheet/prompter/:id` `/qsheet/audio/:id` の見た目も同時に変わる** |
| 共通シェル（`shared/src/client/shell/`）に載せ替えない | §1-4 で載せ替える | 既存画面のヘッダー・左メニューの見た目 |
| トーストを帯（`NoticeBar`）に置き換えない | §6-1 で `notice` を使うと書いていた | `src/lib/notify.ts` 経由の **13 か所。放送中の「放送同期が切断されました」を含む** |

**決め（利用者が別の判断をするまでの既定）**:

1. **tokens は差し替える**が、**本番4画面＋公開音声だけは旧トークンで固定する**。
   `client-qsheet/src/styles/legacy-onair.css` に `tokens.css` の変数定義を
   `.qs-legacy-shell { … }` としてスコープ付きで複製し、本番4画面のルート要素に付ける。
   **「本番の業務が止まらないことが最優先」という凍結の約束を、見た目でも守る**ため。
   → 追加工数の見積もりと、代わりに「本番画面も v4 の見た目にしてよい」かは §9-12。
2. **トーストは残す。** `notify.ts` の 13 か所は**触らない**。`NoticeBar` は
   **新画面だけ**で使う。放送中の切断通知の出方を変えるのは、この PR の範囲外。
3. **`npm run verify:ime` は編集画面を叩く前提**で書かれている（§6-2）。
   **編集画面を作り直すなら、この検査も同じ PR で直す**（→ [`06-editor.md`](06-editor.md) §9）。

---

## 1. ルーティング

### 1-1. 決めた形

```
/qsheet/login                    ログイン                       ★既存のまま
/qsheet/home                     トップ（案件を選ぶ）            ← 新規。**画面はここに作る**
/qsheet                          → /qsheet/home か 旧一覧か      ← ⚠️ 向き先は1行で切り替える（§8-1・§9-1）
/qsheet/sheets                   進行台本の一覧（全案件横断）      ← 旧 /qsheet ・/qsheet/editor の一覧
/qsheet/schedules                スケジュール表の一覧（全案件横断） ← 新規ミニアプリ
/qsheet/projects/:projectId      案件の入口＝制作のジャーニー      ← 新規
/qsheet/docs/:docId              資料単体の入口＝ジャーニー        ← 新規（案件に紐づかない資料）
/qsheet/settings                 制作資料の設定（ハブ）             ← 新規
/qsheet/settings/schedule-templates  スケジュール表のひな形（02 §11-6） ← 新規
/qsheet/settings/masters         台本のマスター（話者・素材ID）      ← 新規

/qsheet/editor/:id               進行台本の編集                  ★既存のまま
/qsheet/onair/:id                本番・進行                     ★既存のまま
/qsheet/rundown/:id              本番・ランダウン                ★既存のまま
/qsheet/prompter/:id             本番・プロンプター               ★既存のまま
/qsheet/audio/:id                音声サポート（公開・認証なし）      ★既存のまま
/qsheet/schedules/:id            スケジュール表の編集              ← 新規ミニアプリ

/qsheet/editor                   → <Navigate to="/qsheet/sheets" replace>
/qsheet/*                        → <RedirectOnce to="/qsheet">    ★既存のまま
```

### 1-2. なぜ資料を案件配下にネストしないか

**本番当日に配る URL が資料ID 1本で成立している**からです（OBS のブラウザソース、
配布済み QR、役割別 URL、公開の音声サポート）。案件配下にもう1つの正解
（`/qsheet/projects/:pid/editor/:id`）を作ると、**同じ画面に2つの URL** ができ、
「どっちを配ったか」が現場で分からなくなります。一覧の絞り込みはクエリで表します。

```
/qsheet/sheets?project=<projectId>      その案件の進行台本だけ
/qsheet/sheets?date=2026-08-02          その日の進行台本だけ
/qsheet/sheets?scope=mine|shared|all    自分が作った／共有された
```

### 1-3. React Router 上の注意（実装時に機械的に守る）

- **静的な区切りを `:param` より先に置く**。`/qsheet/sheets` `/qsheet/settings` `/qsheet/docs/:id` は
  すべて `/qsheet/editor/:id` 等と別セグメントなので衝突しないが、将来 `/qsheet/:something` を
  足すと**一発で全部食われる**。`client/src/App.tsx:185` に同じ注意書きの前例がある。
- `AppShell` を被せる範囲は**今と同じ考え方**（本番4画面と公開音声はシェル無し）。
  ジャーニー・一覧・設定はシェル内。
- 転送は `RedirectOnce`（`shared/src/client/RedirectOnce.tsx`）を使う。既存 `App.tsx` と揃える。
- **別バンドルへの遷移は `navigate()` では飛べない**（`/sales/...` は `client` 側）。
  `window.location.assign()` を使う。`client-daily/src/App.tsx` に前例がある。

### 1-4. 左メニューと下タブ

共通シェル（`shared/src/client/shell/AppShell.tsx`）に載せ替える。渡す `sections`:

| 見出し | 項目 | to |
| --- | --- | --- |
| 制作 | 案件を選ぶ | `/qsheet`（`end`） |
| 制作 | 進行台本 | `/qsheet/sheets` |
| 制作 | スケジュール表 | `/qsheet/schedules` |
| 設定 | ひな形・マスター | `/qsheet/settings` |

スマホ下タブは3つ（`docs/design/v4/_rules.md`）: **案件 `/qsheet` ／ 資料 `/qsheet/sheets` ／ メニュー（`action:'menu'`）**。

---

## 2. トップページ（案件を選ぶ）

### 2-1. 4つの束と、その正体

| 束 | 画面の呼び名 | データ上の正体 | 判定 |
| --- | --- | --- | --- |
| ① | 進行中の案件 | `projects` | `gls_number IS NOT NULL AND stage NOT IN ('s_completed','e_lost')` |
| ② | 案件化前（GLS未発番） | `projects` | `gls_number IS NULL AND stage IN ('d_hold','c_proposal','b_verbal')` |
| ③ | ネタ（検討中） | `projects` | `gls_number IS NULL AND stage = 'neta'` |
| ④ | この制作資料だけの資料 | `qsheet_documents`（＋今後のミニアプリの表） | `project_id IS NULL` |

**②③に新しいテーブルを作らないのが今回の判断です。** ONAiR の `projects` は
すでに「ヨミ〜完了」を1テーブルで持っており（`001b:101` のコメント）、ネタは
`stage='neta'` の行です。制作資料の側で別の「案件になる前の入れもの」を作ると、
**あとで案件化するときに移し替えが要る**＝必ず取りこぼします。

**「案件の行すら作りたくない」もの（打ち合わせ用に台本だけ作る等）は④で受けます。**
④の資料は後から `project_id` を入れるだけで①〜③に合流できます（列は既に nullable）。

### 2-2. 資料単体の ID 体系（採番規則）

```
書式      <接頭辞>-<YYYYMM>-<連番4桁>      例: SB-202608-0001
接頭辞    ミニアプリごと（レジストリが持つ）  SB=進行台本 / SD=スケジュール表
採番      generateSequenceNumber('prod_doc_sb', 'SB')  ← 既存関数をそのまま使う
連番      月ごとに 1 へ戻る（既存 OPP コードと同じ挙動）
```

- **モックの `SB-2608-003` は仮**でした。既存の `generateSequenceNumber` が
  `PREFIX-YYYYMM-NNNN` を返すので、**新しい採番コードを書かずに済む形に合わせます**
  （採番は並行実行で番号が重複した実績があり、`INSERT … ON CONFLICT … RETURNING` で
  アトミックにしてある。ここを自作し直す理由がない）。
- **採るのは `project_id IS NULL` で新規作成したときだけ。** 案件に紐づく資料の宛名は
  **GLS番号＋エピソードコード**（`GLS-A012-003`）で、そちらが正。
- **後から案件に紐づけても `doc_no` は消さない。** 配った番号が消えると追えなくなるため、
  表示は「GLS を主・資料番号を副（小さく）」にする。
- **既存資料への一括後付けはしない**（→ 迷ったところ・要確認）。

```sql
-- 211_qsheet_doc_no.sql（番号は着手時の最大＋1に振り直す。現在の最大は 210）
ALTER TABLE qsheet_documents
  ADD COLUMN IF NOT EXISTS doc_no TEXT;

-- NULL 同士は衝突しないので部分 UNIQUE で足りる
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsheet_documents_doc_no
  ON qsheet_documents (doc_no) WHERE doc_no IS NOT NULL;
```

⚠️ 新しく作るミニアプリの表にも**同じ名前・同じ型の `doc_no TEXT` ＋部分 UNIQUE**を置く
（レジストリの `docNoSeq` がどの表の番号かを持つ）。

### 2-3. トップの取得 API

`requireAuth + requirePermission('qsheet')` の下に新設（`contexts/qsheet` に置く。
既存の `contexts/production` は**エピソード・カレンダーで名前が埋まっている**ので使わない）。

```
GET /api/v1/internal/qsheet/scopes
    ?q=<検索語>            案件名・GLS番号・顧客名・資料名・資料番号を横断
    &group=active|pre_gls|neta|standalone   （省略＝全部）
    &limit=<既定 50・最大 200>
```

```ts
type ScopeGroup = 'active' | 'pre_gls' | 'neta' | 'standalone';

interface ScopeRef {
  type: 'project' | 'document';
  id: string;
  /** type='document' のときだけ。どのミニアプリの資料か */
  app?: MiniAppKey;
}

interface ScopeCard {
  group: ScopeGroup;
  ref: ScopeRef;
  /** GLS-A012 / SB-202608-0001 / null（ネタで未採番） */
  code: string | null;
  title: string;
  customerName: string | null;
  /** projects.stage をそのまま返す。表示語は client 側で引く（サーバーは言葉を持たない） */
  stage: string | null;
  /** 直近の「当日」。episodes.broadcast_date / recording_date と
   *  資料の broadcast_date のうち、今日以降でいちばん近い日（無ければ直近の過去） */
  nextDate: string | null;
  /** 自分が見られる資料だけを数える（見えないものを数に入れない） */
  docCounts: Record<MiniAppKey, number>;
  updatedAt: string;   // ISO8601
}

interface ScopesResponse {
  success: true;
  data: { group: ScopeGroup; label: string; items: ScopeCard[] }[];
}
```

**決めごと**

- **案件は「資料が1件も無くても出す」**（これから作るのだから）。
  一方 `docCounts` は**アクセス権で絞ってから数える**（`access.ts` の見える範囲）。
  数の正直さは `shared/tests/countHonesty.test.ts` の作法に合わせ、
  「見えないものは数に入れない・その代わり数の横に説明を出す」。
- **`sales` 権限を要求しない。** `lookup.routes.ts` に前例がある（Qシートから案件を引くための
  認証のみの軽量 API）。ただし今回は**顧客名まで返す**ので、`requirePermission('qsheet')` は掛ける。
  返す列は上の型の分だけに絞る（金額・確度は返さない）。
- **既定の並びは `nextDate` 昇順（今日に近い順）**、`nextDate` が無いものは `updatedAt` 降順で後ろ。
  「今日やること」から始まるトップにするため。
- 表示語（「ネタ（検討中）」など）は**サーバーに置かない**。`label` は client 側の
  `SCOPE_GROUP_LABEL: Record<ScopeGroup, string>` を正にする（`apps.ts` の教訓＝名前を2か所に書かない）。
  ⚠️ 上の型で `label` をレスポンスに入れているのは**将来 MCP から同じ API を叩くとき用の保険**。
  画面は使わない。**迷ったところ**なので、要らなければ落として構わない（→ 要確認）。

---

## 3. ミニアプリのレジストリ

### 3-1. 置き場所（サーバーが import できない問題への答え）

```
shared/src/production/miniapps.ts          ← 唯一の正（React も lucide も import しない）
server/src/shared/production/miniapps.ts   ← 意図的な複製。冒頭に「複製である」と書く
client-qsheet/src/miniapps/ui.tsx          ← アイコン・色（React/lucide はここだけ）
scripts/check-collab-parity.mjs            ← PAIRS に上の2ファイルの対を足す
shared/tests/miniapps.test.ts              ← key/接頭辞/採番名の重複禁止を固定
```

**なぜ複製するのか**: サーバーは `server/src/` の外を import しません
（`server/src/shared/collab/yjsDoc.ts` 冒頭に明記があり、`check-collab-parity.mjs` が
一致を検査しています）。同じ理由で同じやり方を採ります。**新しい仕組みは足しません。**

### 3-2. 型

```ts
// shared/src/production/miniapps.ts
/** ⚠️ **05-mcp.md の `app` enum はこの型を import する。文字列を書き写さない**（検査 整合#1） */
export type MiniAppKey = 'sheet' | 'schedule';
export type JourneyStage = 'day' | 'flow' | 'script';

export interface MiniAppDef {
  /** URL・API・数の集計キーに出る安定キー。**あとから変えない** */
  key: MiniAppKey;
  /** 画面に出す名前。**ここ以外に書かない** */
  label: string;
  /** 一覧画面の名前（「香盤表一覧」のように別名があるもの用。省略時は label） */
  listLabel?: string;
  /** 資料番号の接頭辞。**重複禁止**（テストで固定） */
  docPrefix: string;
  /** 採番の seq_name。**重複禁止** */
  docNoSeq: string;
  /** 資料を入れる表。doc_no 列を持つこと */
  table: string;
  /** 一覧の URL */
  listPath: string;
  /** 資料1件の URL のひな形。`:id` を置換して使う */
  docPath: string;
  /** この道具が主に効くジャーニーの段（複数可） */
  stages: JourneyStage[];
  /** false のあいだは一覧・レジストリ由来の導線に出さない（作りかけを隠す） */
  enabled: boolean;
}

export const MINI_APPS: MiniAppDef[] = [
  { key: 'sheet',    label: '進行台本',
    docPrefix: 'SB', docNoSeq: 'prod_doc_sb', table: 'qsheet_documents',
    listPath: '/qsheet/sheets',    docPath: '/qsheet/editor/:id',
    stages: ['flow', 'script'], enabled: true },
  { key: 'schedule', label: 'スケジュール表',
    docPrefix: 'SD', docNoSeq: 'prod_doc_sd', table: 'qsheet_schedules',
    listPath: '/qsheet/schedules', docPath: '/qsheet/schedules/:id',
    stages: ['day'], enabled: true },
];

export const MINI_APP_BY_KEY: Record<MiniAppKey, MiniAppDef> = /* … */;
export function docPathOf(key: MiniAppKey, id: string): string;
export function miniAppOfPath(pathname: string): MiniAppDef | undefined;  // 長い path から先に見る
export function enabledMiniApps(): MiniAppDef[];
```

```tsx
// client-qsheet/src/miniapps/ui.tsx — アイコンだけ。**Record で網羅を強制する**
import { ClipboardList, CalendarRange, type LucideIcon } from 'lucide-react';
export const MINI_APP_UI: Record<MiniAppKey, { icon: LucideIcon; accent: string }> = {
  sheet:    { icon: ClipboardList, accent: 'var(--accent-production)' },
  schedule: { icon: CalendarRange, accent: 'var(--accent-schedule)' },
};
```

**検査での変更点（整合 #1・#16）**

- キーを `dayplan` → **`schedule`**、表を `production_dayplans` → **`qsheet_schedules`**、
  URL を `/qsheet/dayplan*` → **`/qsheet/schedules*`** に直しました。
  **02-schedule.md のテーブル名が正**で、01 が仮に置いた名前を捨てた形です。
  `enabled` も `true` にします（`false` のままだと 02 が作った画面が左メニューにも
  「＋新しく作る」にも出ません）。
- **`listLabel: '香盤表一覧'` を落としました。** 同じものが `進行台本` /
  `香盤表一覧` / `Qシート` / `台本` の4通りで呼ばれており、
  `docs/wording.md` ルール1（1つの事実に複数の表記を作らない）に当たります。
  **画面と帳票に出す名前は `label` だけ**（`進行台本` / `スケジュール表`）。
  `Qシート` / `qsheet` は **URL・テーブル名・MCP ツール名の内部識別子**としてのみ残します
  （`awards` が「リアルタイムCG」の内部識別子として残っているのと同じ扱い）。
  `香盤表` を現場の言葉として残すなら、`docs/wording.md`「残す言葉（社内語）」に
  説明つきで足してから `listLabel` を復活させてください（→ §9-15）。

`Record<MiniAppKey, …>` にしてあるので、**`MiniAppKey` を1つ足すとここがコンパイルエラーになる**
＝アイコンの付け忘れが起きません（`apps.ts` が「4か所に一覧があって食い違った」問題への手当て）。

### 3-3. どう一覧に出るか（レジストリを1回書けば全部に出る場所）

| 出る場所 | 何を読むか |
| --- | --- |
| 左メニューの「制作」セクション | `enabledMiniApps()` の `listLabel`／`listPath` |
| トップの案件カードの件数バッジ | `ScopeCard.docCounts[key]` ＋ `MINI_APP_UI[key].icon` |
| ジャーニーの各段に出る道具 | `MINI_APPS.filter(a => a.stages.includes(stage))` |
| 「＋新しく作る」のメニュー | `enabledMiniApps()`（案件が選ばれていれば `project_id` を渡す） |
| 資料番号の採番 | `MINI_APP_BY_KEY[key].docPrefix / docNoSeq`（サーバー側の複製を読む） |
| 案件詳細「当日タブ」の件数 | 後述の summary API（同じレジストリで組み立てる） |

**新しいミニアプリを足す手順は「`MINI_APPS` に1行足す → `MINI_APP_UI` に1行足す
（足さないとビルドが落ちる） → 画面とルートを足す → parity 検査を通す」の4つだけ**にします。

⚠️ **`shared/src/client/apps.ts`（ブロックアプリの一覧）とは別物**です。あちらは
「ONAiR にどんなアプリがあるか」、こちらは「制作資料の中にどんな道具があるか」。
混ぜない（混ぜると凍結の印や権限モジュールの意味が壊れる）。

---

## 4. 制作のジャーニー（段階ビュー）

> 利用者の言葉: **「進み具合はあくまでコンセプトであり、何ができていれば次がこれ、という
> 画一的なものではない」**。したがって**完成度の判定式は作りません**。

### 4-1. 3段の定義と、そこで見せるもの

| 段 | キー | 見る単位 | 主な道具 |
| --- | --- | --- | --- |
| 当日の枠 | `day` | その日1日（会場×時間） | スケジュール表 |
| 番組の流れ | `flow` | 1本の進行台本のロール／尺 | 進行台本（一覧・折りたたみ） |
| 台本の中身 | `script` | 行・セル（台詞・マイク・テロップ・立ち位置） | 進行台本（編集）／本番4役割 |

- URL は `/qsheet/projects/:projectId?zoom=day|flow|script&date=YYYY-MM-DD`。
  **段はクエリで持つ**（画面遷移させない＝「親を見失わずに子を開く」というモックの狙い）。
  ⚠️ シェルの画面遷移アニメは URL を鍵にしているが、`AppShell.tsx` のコメントどおり
  **同じ画面の中の状態変化では再生しない**ので、段を切り替えても画面全体は動かない。
- 日が特定できないとき（案件全体を俯瞰）は `date` 省略で**日の一覧**を出す。

### 4-2. 「進み具合」の出し方 — 手がかり3値＋人のピン

サーバーは**判定しない**。数えた事実だけ返す。

```ts
export type HintTone = 'blank' | 'touched' | 'recent';

export interface StageHint {
  stage: JourneyStage;
  /** blank = その段の資料が1件も無い
   *  touched = 資料がある
   *  recent = 資料があり、直近7日以内に更新されている */
  tone: HintTone;
  /** 画面に出す事実。**形容詞を使わない**（「まだ足りない」ではなく「3件・4日前に更新」） */
  facts: { key: string; label: string; count?: number; at?: string | null }[];
  /** 人が押したピン。**これだけが「決まった」と言える根拠** */
  mark: { kind: 'settled' | 'watch'; note: string | null; by: string; at: string } | null;
}
```

- **`tone` は完成度ではなく「触られたか」**。`blank` は「まだ何も無い」であって
  「遅れている」ではない。画面の文言も**事実だけ**にする
  （✗「祝賀会がまだ枠だけです」 → ○「祝賀会：当日の枠 1件 ／ 進行台本 なし」）。
- **7日という窓は `recent` の判定にだけ使う**。ONAiR の案件は数か月更新され続けるので、
  「7日以上動いていない＝止まっている」とは**言わない**（正常な業務更新を異常として数えない）。
- モックの「3本のバー」は**塗りつぶしの割合をやめ、3値の濃さ**にする。
  割合にすると「分母は何か」を決めることになり、それが画一的な判定式そのものになるため。

### 4-3. 人のピン（`production_journey_marks`）

```sql
-- 212_production_journey_marks.sql
CREATE TABLE IF NOT EXISTS production_journey_marks (
  id          TEXT PRIMARY KEY,
  scope_type  TEXT NOT NULL CHECK (scope_type IN ('project','document')),
  scope_id    TEXT NOT NULL,                    -- projects.id / qsheet_documents.id
  target_date TEXT,                             -- 'YYYY-MM-DD'。NULL = その案件の全体
  stage       TEXT NOT NULL CHECK (stage IN ('day','flow','script')),
  kind        TEXT NOT NULL CHECK (kind IN ('settled','watch','dismissed')),
  hint_key    TEXT,                             -- kind='dismissed' のとき、消した手がかりのキー
  note        TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at  TIMESTAMPTZ                       -- 取り消し（行は消さない＝いつ外したかを残す）
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_marks_live
  ON production_journey_marks (
    scope_type, scope_id, COALESCE(target_date, ''), stage, kind, COALESCE(hint_key, '')
  ) WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journey_marks_scope
  ON production_journey_marks (scope_type, scope_id) WHERE cleared_at IS NULL;
```

- **`TIMESTAMPTZ` にしている**のは意図的です。既存の `qsheet_documents` は
  `updated_at TIMESTAMP`（tz なし）・`deleted_at TEXT` に `NOW()` を入れているという
  不整合があり（データモデル調査の指摘 6・7）、**新しい表で同じ間違いを増やさない**ため。
- 消さずに `cleared_at` を立てるのは、**「決まった」と言ったあとに戻したこと自体が
  ジャーニーの情報**だからです（締切前によく起きる）。

### 4-4. 「次に決めること」

サーバー側に**小さな関数を1手がかり1つ**置き、配列に登録する形にする（大きな判定器を作らない）。

```ts
export interface Suggestion {
  key: string;        // SUGGESTION_KEYS のどれか（dismissed の鍵になるので不変）
  stage: JourneyStage;
  /** 事実の文。命令形にしない（「〜がありません」で止める） */
  text: string;
  /** 押したときの行き先。作れないときは null（黙って何も起きない導線を作らない） */
  to: string | null;
  dismissed: boolean;
}
```

初期の手がかり（**これで全部。増やすときは1件ずつ足す**）。
**キーは `shared/src/production/journey.ts` の `SUGGESTION_KEYS` に定数で置き、
05-mcp.md はそこを参照する**（文字列を書き写すと 01 と 05 で件数が食い違う。検査 整合#15 で
実際に4件と5件に割れていた）:

| key | 出る条件（数えるだけ） | どこから数えるか |
| --- | --- | --- |
| `no_schedule` | その日にスケジュール表が0件 | `qsheet_schedules` の件数 |
| `no_sheet` | その日に進行台本が0件 | `qsheet_documents` の件数 |
| `sheet_no_rows` | 進行台本はあるが `sections` が0 | `jsonb_array_length`（§4-5） |
| `duration_gap` | 当日の枠と台本の尺が**両方ある**ときだけ、差を出す（多い/少ないは言うが良し悪しは言わない） | **`qsheet_doc_index.total_sec`**（04 §2-3） |
| `mic_unassigned` | `audio_mic` 列があるのに `assignments` が空の行がある | **`qsheet_doc_index`**（04 §2-3 に `mic_unassigned_rows INTEGER` を足す） |

⚠️ **`duration_gap` と `mic_unassigned` は `data` を全部展開しないと出せません**（検査 整合#13）。
1案件に数十件の資料があるとジャーニーを開くたびに全 JSONB を展開することになるので、
**この2件は 04 の `qsheet_doc_index` から読みます**（索引の作り直しは 04 §2-3 が
「確定時＋日次バッチ」と決めているので、そこに乗せる）。
**索引に無い資料では、この2件の手がかりを出しません**（「出せない」と画面に書かない。
数の正直さの作法どおり、無いものは黙って出さない）。
`no_schedule` は 01 の初版で `no_dayplan` でしたが、キー名をミニアプリのキーに揃えました。

- **1件ずつ「無視する」ができる**（`POST /journey/marks` の `kind:'dismissed'` ＋ `hint_key`）。
- **無視したことも記録する。** 何が役に立たなかったかを後で数えるためで、
  ここが将来 AI に「次に決めること」を書かせるときの**教師データの置き場所**になる。
  ⚠️ 現状これは AI ではありません（決め打ちの計数）。**AI にした瞬間に会社方針の5条件が掛かる**ので、
  そのときは `ai_outputs(kind='journey_next_action')` に全文で残し、`ai_corrections` に
  人の直しを取り、`production_journey_marks` の dismissed を成果指標側に紐づけること
  （`.claude/skills/ai-feedback-loop/`）。**今は経路だけ空けておく。**

### 4-5. ジャーニーの API

```
GET /api/v1/internal/qsheet/scopes/project/:projectId/journey?from=YYYY-MM-DD&to=YYYY-MM-DD
GET /api/v1/internal/qsheet/scopes/document/:docId/journey
```

```ts
interface JourneyDay {
  date: string | null;            // null = 日が決まっていない資料
  /** その日の見出し（エピソードコード・回数・会場）。無ければ null */
  label: string | null;
  stages: StageHint[];            // 常に day / flow / script の3件（順序固定）
  docs: { app: MiniAppKey; id: string; title: string; docNo: string | null; updatedAt: string }[];
  /** ★検査（整合#2）で追加。**枠と台本の対**。これが無いとジャーニーの背骨が繋がらない */
  frames: {
    scheduleId: string;
    itemId: string;
    columnLabel: string;
    title: string;
    kind: string;                 // 02 §3-3 の ItemKind
    startMin: number;
    endMin: number;
    /** 02 §6-1「枠→流れの唯一の橋」。null = まだ台本が無い */
    documentId: string | null;
    /** id はあるが JOIN が外れた＝台本が消されている（02 §3-3） */
    linkBroken: boolean;
    /** 枠の長さ − 台本の合計尺（分・正なら枠が余る）。**両方あるときだけ**。無ければ null */
    durationGapMin: number | null;
  }[];
  suggestions: Suggestion[];
}

interface JourneyResponse {
  success: true;
  data: {
    scope: ScopeCard;
    days: JourneyDay[];           // date 昇順。date=null は末尾
  };
}
```

```
POST   /api/v1/internal/qsheet/journey/marks
       body: { scope_type, scope_id, target_date?, stage, kind, hint_key?, note? }
       201 → { success: true, data: Mark }
DELETE /api/v1/internal/qsheet/journey/marks/:id     （cleared_at を立てる。行は消さない）
```

**権限**: ピンを押せるのは「その案件の資料を1件でも触れる人」。実装は既存の
`canAccessDoc` を流用できないので（案件単位のため）、**`requirePermission('qsheet','editor')` で足す**。
資料の中身は返さないので、閲覧側は `requirePermission('qsheet')` のみ。

**数え方の実装メモ**（N+1 を作らない）:
`days` は「その案件の `episodes`（`broadcast_date`/`recording_date`）」と
「その案件の資料の `broadcast_date`」の**和集合**で作る。資料は
`project_id = $1` で1回引いて JS 側で日ごとに束ねる（1案件の資料は多くて数十件）。
⚠️ `flow`/`script` の事実（ロール数・行数）は `data` JSONB を読む必要があるので、
**一覧では読まない**（`data` は台本全体で重い）。`sections` の件数だけが要るので、
SQL 側で次のように取る（**`jsonb_typeof` のガードを必ず付ける**。`data` の既定値は `'{}'` で
`->` は NULL になり無害だが、`sections` が配列でない壊れた行が1件でもあると
`jsonb_array_length` が例外を投げ、**その1件のために全員の一覧が 500 で落ちます**。検査 地雷#15）:

```sql
CASE WHEN jsonb_typeof(d.data->'sections') = 'array'
     THEN jsonb_array_length(d.data->'sections') ELSE 0 END AS section_count
```

同じガードを **05-mcp.md §4-1 の `list_production_docs`** にも掛けること（04 §6-4 だけが
言及していて 01・05 に無い、という食い違いが検査で見つかりました）。

`frames[]` は `qsheet_schedule_items`（02 §3-3）を
`LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL` で引き、
`durationGapMin` は **`qsheet_doc_index.total_sec`** と突き合わせて出す（`data` は開かない）。
尺の合計は必ず `shared/src/schedule/time.ts` の **`docTotalSec()`** を通す
（[`00-datamodel-fixes.md`](00-datamodel-fixes.md) §3。素朴に `sections[].duration` を足すと
**ロール尺が空の台本で 0 分になり、枠がまるごと空いているように見えます**）。

---

## 5. client/ の案件詳細「当日タブ」（`DayTab.tsx`）との関係

### 5-1. 決めたこと

- **当日の枠・流れ・台本の編集は制作資料側にしか置かない。** DayTab は入口のまま。
  ⚠️ ここを曖昧にすると、案件詳細にもスケジュール表の編集が生えて**2つの正解**ができる。
- DayTab の一番上に**ジャーニーへの大きな導線**を1つ足す:
  `window.location.assign('/qsheet/projects/' + projectId)`。
  すぐ下の既存の2つのリスト（制作資料・技術資料）は**そのまま残す**。
- DayTab の現在の注記（「進み具合は凍結アプリ側の作りに依存するので、いまは出しません」）は、
  v4.1 で **`GET /qsheet/scopes/project/:id/journey` の `stages`（3値の手がかり）を出す**形に置き換える。
  ⚠️ ただし**判定式ではない**ので、文言は「第3稿 確定」のような断定ではなく
  「進行台本 3件・3日前に更新」にする（モックの `ver: '第3稿 確定'` は
  `data.meta.draftType/draftNumber` から作れるが、それは**人が付けた稿番号**なので出してよい）。
- 逆方向（制作資料 → 案件詳細）も1本置く: ジャーニー画面の見出しから
  `/sales/projects/:id/day` へ（`sales` 権限が無い人には出さない）。

### 5-2. 触るファイルと、触らないファイル

| ファイル | v4.1 での扱い |
| --- | --- |
| `client/src/contexts/sales/pages/projectDetail/DayTab.tsx` | 導線を1つ足す＋注記を差し替え。**API 呼び出しは今のまま**（`?project_id=`） |
| `client/src/contexts/sales/pages/projectDetail/tabs.ts` | 触らない（タブの並びは変えない） |
| 技術資料側の `DocList` | 触らない（`client-techsheet` は凍結のまま） |

---

## 6. shared / client-qsheet の線引き

### 6-1. 置き場所の規則

| 置き場所 | 条件 | 今回置くもの |
| --- | --- | --- |
| `shared/src/production/` | **React も lucide も import しない**純データ・純関数。サーバーも同じ内容が要る | `miniapps.ts`（レジストリ）／`journey.ts`（`JourneyStage`・`HintTone`・`Suggestion` の型と定数）／`docNo.ts`（資料番号の書式と表示整形） |
| `server/src/shared/production/` | 上の**意図的な複製**（サーバーは `server/src/` の外を import できない） | `miniapps.ts` / `journey.ts` |
| `shared/src/client/` | 全アプリで同じに見えるべき UI・シェル | 追加なし（既存の `AppShell` / `Row` / `states` をそのまま使う）。⚠️ **`notice`（`NoticeBar`）は新画面だけ**。既存画面のトーストは `notify.ts` のまま触らない（§0-1） |
| `client-qsheet/src/` | 制作資料にしか出てこないもの | 画面・ルーティング・アイコン（`miniapps/ui.tsx`）・IME 安全な入力部品・Yjs 配線・台本の JSONB 型 |

### 6-2. **shared に上げないと決めたもの**（と理由）

- **`BufferedInput` / `BufferedTextarea` / `EditablePill`（IME 安全な入力）** —
  上げたくなるが**v4.1 では上げない**。理由: ①検査（`npm run verify:ime`）が Qシートの
  画面を叩く前提で書かれている ②凍結中の他アプリのビルドに影響を出したくない。
  ③制作資料の3画面（トップ・スケジュール表・Qシート）は**同じバンドル**なので、
  `client-qsheet/src/lib/input/` にまとめれば共有できる。
  他アプリが必要にした時点で上げる。**素の `<input value onChange>` に戻さないことは絶対**
  （「さくら」→「ささくさくらさくら」の実バグ）。
- **台本の JSONB 型（`DocumentData` / `Block` / `CueRow`）** — 画面都合で動くので client に置く。
  ⚠️ ただし `shared/src/collab/yjsDoc.ts` は**この形を前提に往復している**ので、
  トップレベルのキー（`meta`/`blocks`/`masters`/`sections`＋`extras`）を変えるときは
  **変換層とサーバー側の複製の両方**を直す（`check-collab-parity.mjs` が守る）。
- **表示語（グループ名・段の名前）** — サーバーにもレジストリにも置かず、client の
  `Record<Key, string>` を正にする（名前を2か所に書かない）。

### 6-3. 検査に足すもの

| 検査 | 足すこと |
| --- | --- |
| `scripts/check-collab-parity.mjs` | `PAIRS` に `['server/src/shared/production/miniapps.ts','shared/src/production/miniapps.ts']` と `journey.ts` の対 |
| `shared/tests/miniapps.test.ts`（新規） | `key`・`docPrefix`・`docNoSeq`・`listPath`・`docPath` の重複禁止／`docPath` に `:id` が含まれること／`enabled:false` が導線に出ないこと |
| `shared/tests/apps.test.ts`（既存） | `qsheet` の `frozen` を落とすときに一緒に直す |
| `scripts/check-frozen-css.mjs` | 着手時に `qsheet` の行を外す |

---

## 7. まとめ（新規 DDL・新規 API・ファイル配置）

### 7-1. DDL（この設計書で決めた分だけ）

```sql
-- 21x_qsheet_doc_no.sql       ← 番号は README の採番表が正
ALTER TABLE qsheet_documents ADD COLUMN IF NOT EXISTS doc_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsheet_documents_doc_no
  ON qsheet_documents (doc_no) WHERE doc_no IS NOT NULL;

-- 21y_production_journey_marks.sql   （4-3 のとおり）
```

⚠️ **番号は [`README.md`](README.md) の採番表を見て振り直すこと。**
設計書5本が 211・212 を取り合っており（01=211/212・02=211・03=213・04=212）、
**`migrate.ts` はファイル名順に流すだけなので CI は落ちません — 黙って想定と違う順で流れます。**
`212_qsheet_ai.sql` は `qsheet_schedules` に FK を張るので**順序依存が実在**します。

**スケジュール表の表（`qsheet_schedules` ほか）はこの文書では決めません。**
ここで決めるのは「①レジストリに載ること ②`doc_no TEXT` ＋部分 UNIQUE を持つこと
③`broadcast_date` 相当の**日**を1本持ち、ジャーニーの `days` に並べられること」の3点だけです。
**②は 02-schedule.md §3-1 の DDL に `doc_no TEXT` が無かった**ので、
検査を受けて 02 側に追記しています（検査 整合#1）。

### 7-2. 新規 API 一覧

| メソッド | パス | 権限 | 返すもの |
| --- | --- | --- | --- |
| GET | `/api/v1/internal/qsheet/scopes` | `qsheet` | `ScopeCard[]`（4束） |
| GET | `/api/v1/internal/qsheet/scopes/project/:projectId/journey` | `qsheet` | `JourneyResponse` |
| GET | `/api/v1/internal/qsheet/scopes/document/:docId/journey` | `qsheet`＋`canAccessDoc` | 同上 |
| POST | `/api/v1/internal/qsheet/journey/marks` | `qsheet` editor | `Mark` |
| DELETE | `/api/v1/internal/qsheet/journey/marks/:id` | `qsheet` editor | `{ success: true }` |

既存 API の変更（**壊さない範囲**）:

| 変更 | 内容 |
| --- | --- |
| `POST /qsheet/documents` | `project_id` が無いとき **`doc_no` を採って返す**。リクエストの型は変えない（増えるのはレスポンスの列だけ） |
| `GET /qsheet/documents` | クエリに `date`（`broadcast_date` 一致）と `scope=mine\|shared\|all` を追加。**既定の挙動は今のまま** |
| `GET /qsheet/documents` のレスポンス | `doc_no` が増える（`SELECT d.*` なので自動で増える） |

⚠️ **レスポンス型を明記します**（検査 機能#L2）。現行の一覧画面は `share_count` と
`canManage` を読んでいますが（`DashboardPage.tsx:63,145,202,212`）、
どちらも 01 の初版に書かれておらず、書かれていないものは実装されません。

```ts
interface DocumentListRow {
  id: string; title: string; doc_no: string | null;
  project_id: string | null; episode_id: string | null; episode_code: string | null;
  broadcast_date: string | null; status: string;
  created_by: string | null; creator_name: string | null;
  updated_at: string;
  /** 共有中バッジ。`qsheet_document_shares` の件数（**自分に見えるものだけ数える**） */
  share_count: number;
  /** 共有・削除ボタンの出し分け。`created_by === me || role === 'system_admin'` */
  canManage: boolean;
  section_count: number;   // jsonb_typeof ガード付き（§4-5）
}
```

### 7-3. ファイル配置

```
shared/src/production/miniapps.ts            レジストリ（唯一の正）
shared/src/production/journey.ts             段・手がかり・提案の型と定数
shared/src/production/docNo.ts               資料番号の書式・表示整形
shared/tests/miniapps.test.ts                重複禁止の固定

server/src/shared/production/miniapps.ts     ↑の複製（parity 検査対象）
server/src/shared/production/journey.ts      ↑の複製
server/src/contexts/qsheet/routes/scopes.routes.ts     トップ・ジャーニー
server/src/contexts/qsheet/routes/journey-marks.routes.ts
server/src/contexts/qsheet/services/journey.service.ts  事実を数えるだけ
server/src/contexts/qsheet/services/docNo.service.ts    issueDocNo(app) → sequence
server/src/shared/db/migrations/211_qsheet_doc_no.sql
server/src/shared/db/migrations/212_production_journey_marks.sql

client-qsheet/src/App.tsx                    §1 のルート
client-qsheet/src/miniapps/ui.tsx            アイコン（Record で網羅強制）
client-qsheet/src/pages/TopPage.tsx          案件を選ぶ
client-qsheet/src/pages/JourneyPage.tsx      /qsheet/projects/:id ・ /qsheet/docs/:id
client-qsheet/src/pages/SheetListPage.tsx    /qsheet/sheets（旧 DashboardPage の一覧部）
client-qsheet/src/pages/ScheduleListPage.tsx /qsheet/schedules（02 が作る）
client-qsheet/src/pages/SettingsPage.tsx     /qsheet/settings
client-qsheet/src/lib/input/                 IME 安全な入力部品（今の editor/ から集約）
```

### 7-4. `DashboardPage.tsx`(832行) の解体先（検査 機能#H6 で追加）

初版は「旧 DashboardPage の一覧部」の1行しか書いておらず、**残りの機能に行き先が
1つもありませんでした。書かれていないものは実装されません。**

| 現行の機能 | 実装箇所 | v4 での行き先 |
| --- | --- | --- |
| タイトル検索・`project` フィルタバナー | `DashboardPage.tsx` | **SheetListPage**（`?project=` `?date=` `?scope=` は §1-2 のクエリに載せ替え） |
| 一覧（カード／表） | 同上 | **SheetListPage** |
| 新規作成ダイアログ（GLS案件選択 → エピソード選択 → 既定ブロック3種） | `:465-485,504-509` | **TopPage の「＋新しく作る」**（レジストリ由来・§3-3）。⚠️ 02 §6-2「枠から台本を作る」と**2つ目の作成経路**になる。→ §9-16 |
| 共有ダイアログ（`/qsheet/share-users`・`/documents/:id/shares`） | `:266-269` | **SheetListPage**（行メニュー）＋ **06-editor.md**（編集画面のヘッダー） |
| 共有中バッジ | `:266` | SheetListPage（`share_count`・§7-2） |
| `canManage` による共有・削除ボタンの出し分け | `:202,212` | SheetListPage（`canManage`・§7-2） |
| 削除確認ダイアログ | `:807-825` | SheetListPage |
| OnAir・ランダウンの起動 | 同上 | **SheetListPage の行メニュー**（本番4役割は [`07-onair-roles.md`](07-onair-roles.md)） |

⚠️ **新規作成の初期値（`data.blocks` の3種・`masters` の空配列）を2か所に持たない。**
`POST /qsheet/documents` のサービス関数を**唯一の正**にし、TopPage も 02 §6-2 も
そこを呼びます（検査 整合#11）。

---

## 8. 未確定の判断と、そう判断した根拠（迷ったところ）

| # | 判断 | 根拠 | 迷い |
| --- | --- | --- | --- |
| 1 | **画面は `/qsheet/home` に作り、`/qsheet` をどちらに向けるかは1行で切り替えられる形にする**（検査 地雷#M7 で既定を反転） | ジャーニーの入口が奥にあると使われないので**最終的には `/qsheet` をトップにしたい**。ただしブックマークの意味が黙って変わるのは利用者の確認が要る判断で、**実装コストが同じなら後戻りできるほうを既定に置く** | 確認が取れたら `/qsheet` → `<Navigate to="/qsheet/home">`（トップ）に倒す。取れないうちは `/qsheet` は今の一覧のまま。`/qsheet/sheets` への導線はどちらの場合もトップ最上部に必ず置く → §9-1 |
| 2 | 資料は**案件配下にネストしない** | 本番当日に配る URL が資料ID 1本で成立しており、2つ目の URL を作ると現場が混乱する | 案件からの遷移でパンくずが弱くなる。`?from=<projectId>` を付けて戻り先だけ持たせる（**URL の正は変えない**）ことで妥協した |
| 3 | ネタ・案件化前を **`projects` で表す**（新テーブルを作らない） | `projects` が既に `stage='neta'` を持ち、案件化＝行の更新で済む。別テーブルにすると移し替えで取りこぼす | 「案件の行を作るのが重い」と感じる人がいるかもしれない。その受け皿が④の資料単体 |
| 4 | 資料番号は `SB-202608-0001`（モックの `SB-2608-003` を採らない） | 既存 `generateSequenceNumber` がこの形。**採番コードを自作しない**（並行採番で重複した実績があり、既存はアトミック） | 現場が口頭で言うには長い。短くするなら**専用の採番関数を書く**ことになる → 要確認 |
| 5 | 既存の資料単体に doc_no を**後付けしない** | 番号は「人が口頭で言う宛名」で、配ったことのない番号が増えると混乱する | 一覧の見た目が揃わない（番号のある資料と無い資料が混ざる）。揃えたいなら一括採番 → 要確認 |
| 6 | 進み具合は**3値の手がかり＋人のピン**。％バーを出さない | 利用者の「画一的なものではない」という言葉。％にすると分母＝判定式を決めることになる | モックは3本のバーだった。**見た目はバーのままで、塗りを3段階に固定**すれば印象は保てる |
| 7 | `recent` の窓を **7日** | 差分の時間窓の目安が7日（既知の地雷）。ただし**「止まっている」判定には使わない** | 案件によっては1か月動かないのが普通。7日を「最近動いた」の意味に限定して逃げた |
| 8 | 手がかりは**5つで打ち止め**、増やすときは1つずつ | 大きな判定器にすると、外したときに全体の信用が落ちる | `image_missing`（画像404）と `no_techsheet` は入れたかったが、前者は配信経路に認証が掛かっていて確認が重く（`upload.routes.ts`）、後者は凍結アプリを読むことになるので見送り |
| 9 | レジストリを **shared＋server 複製** | サーバーは `server/src/` の外を import できない（既存の明文化された制約） | 複製は嫌だが、**新しい仕組みを増やすほうが害が大きい**と判断。既存の parity 検査に相乗りする |
| 10 | `ScopesResponse` に `label` を持たせる | MCP から同じ API を叩くときに名前が要る | 名前を2か所に持つことになる（`apps.ts` の教訓に反する）。画面は使わない約束にしたが、**落としてよい** → 要確認 |
| 11 | ジャーニーのピンは **`system_admin` でなくても押せる**（`qsheet` editor） | 現場のディレクターが押すもの | 案件単位の権限が資料単位の `canAccessDoc` と揃わない（案件の資料が1件も見えない人でもピンを押せてしまう）。**要確認** |

---

## 9. 利用者に確認すべきこと

1. **`/qsheet` を「案件を選ぶ」に変えてよいか。** 変えない場合は `/qsheet/home` を新設し、
   `/qsheet` は今の一覧のままにします（どちらでも実装できます）。
   - ✅ **2026-08-22 に第三の答えで解決した。** 「案件を選ぶ」でも「今の一覧」でもなく、
     **アプリ全体のトップ**（`/qsheet/top`・ミニアプリのタイル）を新設し `QSHEET_ROOT` を
     `'top'` にした。詳細は README §4 確認13・`ProductionTopPage.tsx`。
2. **資料番号の書式**。`SB-202608-0001`（既存の採番の形）でよいか、
   モックどおり短い `SB-2608-003` にしたいか（後者は採番関数を1本書き足します）。
3. **接頭辞の割り当て**。進行台本＝`SB`／スケジュール表＝`SD` でよいか（現場の呼び方に合わせたい）。
4. **既存の「案件に紐づかない資料」に番号を後付けするか**（しない前提で設計しています）。
5. **ネタ・案件化前は `projects` の行として作る**運用でよいか。
   「案件を作らずに資料だけ先に作る」を主にするなら、トップの既定の並びを④優先に変えます。
6. **進み具合の見せ方**。3値（資料なし／触ってある／最近動いた）＋人が押す「決まった」ピン、
   という形でよいか。**％や「第3稿」を自動で判定して出すことはしません**という点の確認。
7. **「次に決めること」の初期5件**（`no_schedule` / `no_sheet` / `sheet_no_rows` /
   `duration_gap` / `mic_unassigned`）で過不足がないか。文言は事実だけ（命令形にしない）にします。
8. **ジャーニーのピンを押せる人の範囲**。`qsheet` の編集権限がある人全員でよいか、
   案件の担当者だけに絞るか。
9. **案件詳細「当日タブ」の扱い**。入口だけ（＋手がかりの表示）に留める方針でよいか。
   当日タブの中で編集までしたい要望があるなら、設計を変えます。
10. **スケジュール表の名前**。アプリ内では「スケジュール表」、URL は `/qsheet/schedules/:id`、
    表は `qsheet_schedules`（02 が正）に揃えました（呼び名が「当日進行表」なら合わせます）。
11. **凍結を解く作業を同じ PR に含めてよいか**（`check-frozen-css.mjs` から `qsheet` を外す・
    `apps.ts` の `frozen: true` を落とす）。含めないと CI が落ちます。

**ここから下は検査（2026-08-21）で足した確認事項です。**

12. ⚠️ **`index.css` の tokens を `tokens-v4.css` に差し替えると、
    同じバンドルの本番4画面（進行・ランダウン・プロンプター・公開音声）の見た目も同時に変わります。**
    (a) 本番画面も v4 の見た目にしてよい／(b) 本番画面だけ旧トークンで固定する（追加工数あり・§0-1 の既定）
    のどちらですか。**「URL は生かし、見た目は今のまま」という凍結の約束に直接効きます。**
13. **`notify.ts` のトースト13か所を帯（`NoticeBar`）に寄せますか。**
    設計では**寄せません**（放送中の「放送同期が切断されました」を含むため）。
14. **編集画面を作り直すと `npm run verify:ime` の検査対象も直す必要があります。**
    同じ PR でよいですか。
15. **「香盤表」を現場の言葉として残しますか。** 残すなら `docs/wording.md` の
    「残す言葉（社内語）」に足したうえで一覧の見出しに使います。残さないなら「進行台本」に統一します。
16. **台本の作成経路を2本にしてよいか。**
    (a) トップの「＋新しく作る」（案件を選んで作る）と (b) 02 §6-2「本番の枠から台本を作る」の
    2つができます。片方に寄せますか、両方残しますか。
