# 制作資料 v4 — データモデルの前提修正（v4.1 の最初の PR）

> **2026-08-21 新設。** 4観点の敵対的検査で、03/04/05 の3本が
> **実在しない `02-datamodel` という文書に前提を丸投げしていた**ことが分かったため、
> その空手形をここで正式に引き取ります（検査 機能#H1・整合#8）。
> **コードは書いていません。設計だけです。**
>
> **この文書は v4.1 の最初の PR にしてください。** ここが済むまで:
> - `led_xr` と `stage_diagram` は Excel で**書き出しのみ（ロック）**になり、
>   **11型のうち2型が往復しない版で実装が確定します**（03 §4-4）。
> - AI 提案の取り込みを先に入れると、**モバイルで開いた瞬間に値が見えなくなります**（05 §14-2 #6）。

---

## 決めたこと

1. **`stage_diagram` の参照を `templateIndex`（配列 index）から `templateId`（ID 参照）に変える。**
2. **モバイル編集のセル形ドリフトを潰す。PC の形を正とする。**
3. **台本の合計尺を出す関数を `shared/` に1本だけ置く**（`docTotalSec`）。
   今は3つの設計書が**実装と違うフォールバック無しの式**を書いており、
   ロール尺が空の台本で**静かに 0 分**になります。
4. **セルの参照方式を5本共通にする**（`blk.<type>#<n>` ＝ `blockRef`）。
   Excel・AI・MCP が同じ台本の同じセルを指すため。
5. **`Date.now()` 由来の id を全部 `genId()` にする**（`ledScenes` と `blocks`）。

**どれも「今あるデータを壊さずに移す」ので、移行は「読み込み時に1回だけ」の変換で行います**
（`splitMultiEntryRows()` と同じ場所・同じ作法）。

---

## 1. `stage_diagram`: `templateIndex` → `templateId`

### 1-1. 何が問題か（実装を読んで確認した事実）

`components/editor/StageDiagramCell.tsx:81` は `data.stageTemplates[]` の
**配列 index** をセルに持っています。したがって:

- **ひな形を1つ消すだけで、全行の立ち位置図がずれます。**
- Excel でひな形の並べ替えを許すと（03 §7-5）、**取り込んだ瞬間に全行が別の図を指します。**
- AI に数字を作らせると別のテンプレートが刺さるので、04 §2-4 は
  「`stage_diagram` は AI に書かせない」と決めています（**これは正しい判断ですが、
  原因のほうを直せば制約が1つ減ります**）。

### 1-2. 直し方

```ts
// data.stageTemplates[] の要素に id を足す
interface StageTemplate {
  id: string;          // ★追加。genId('stg') → 'stg_<uuid>'
  name: string;
  elements: StageElement[];
}

// stage_diagram セル
interface StageDiagramCell {
  templateId: string | null;   // ★ templateIndex から変更
  note?: string;
}
```

**移行（読み込み時に1回だけ）**

- 置き場所: `client-qsheet/src/lib/migrateEntries.ts`（`splitMultiEntryRows()` と同じファイル）。
  **`applyDataUpdate` の中ではなく、`data` を読み込んだ直後**に通す。
- 手順: ① `stageTemplates[i].id` が無ければ `genId('stg')` で採る
  ② 各セルの `templateIndex` を `stageTemplates[templateIndex]?.id` に変換
  ③ 変換できなかった（index が範囲外）セルは **`templateId: null`** にする（**黙って別の図を刺さない**）
  ④ `templateIndex` は**残さない**（両方あると次に読む人がどちらを信じるか分からなくなる）
- **サーバー側の複製は不要**です（`server/src/shared/collab/yjsDoc.ts` はトップレベルのキーしか見ない）。
  ただし 04 の索引作成（`qsheet_doc_index`）と 03 の Excel はこの形を前提にするので、
  **移行より先にそれらを実装しないこと。**

**検査**: `shared/tests/qsheetMigrate.test.ts` に
「`templateIndex: 1` の台本を読むと `templateId` が2番目のひな形の id になる」
「範囲外の index は `null` になる」の2本を固定する。

---

## 2. モバイル／PC のセル形ドリフト

### 2-1. 何が問題か

`components/editor/CueRowMobileEditor.tsx:39,337` は、モバイルから編集したときに:

- `remarks` / `item` / `lighting` / `stage_diagram` / `slide` に、**型を無視して
  `{ entries: [{ label }] }`** を書く（PC は `{ value }` や型ごとの形）
- `led_xr` に、**誰も読まない `cue`** を書く

**同じセルが、どちらの画面で編集したかによって別の形になります。**
Excel の往復（03）も AI の提案（04・05）も「セルはこの形」を前提にするので、
**どちらが正か決まっていない状態で往復を作ると、直した側が必ず壊れます。**

### 2-2. 直し方

- **PC の形を正とします**（読み手が全部 PC の形を前提にしているため。
  プロンプター・ランダウン・公開音声・印刷のすべて）。
- モバイル編集を PC と同じ形で書くように直す。
- **既に書かれてしまった `{ entries: [{ label }] }` は、読み込み時に1回だけ
  `{ value: label }` へ寄せる**（`migrateEntries.ts` に足す）。
  `led_xr` の `cue` は**捨てる**（誰も読んでいないので情報は失われない）。

**検査**: `shared/tests/qsheetMigrate.test.ts` に
「モバイルが書いた `remarks` を読むと `{ value }` になる」を固定する。

---

## 3. 合計尺を出す関数を1本にする（`docTotalSec`）

### 3-1. 何が問題か

02 §6-4・04 §2-3・05 §4-5 の**3本とも**「`sections[].duration` の合計（`parseDur`）」と
書いていましたが、**実装にはフォールバックがあります**:

```ts
// client-qsheet/src/pages/EditorPage.tsx:517（OnAirPage.tsx:92-93 も同じ形）
sections.reduce((acc, s) =>
  acc + (parseDur(s.duration) || s.rows.reduce((a, r) => a + parseDur(r.duration), 0)), 0)
```

**ロール尺が未入力で、行にだけ尺が入っている台本は現実に存在します**
（`CueTable.tsx:613,618` に「尺が未入力です」の警告 UI があり、
`csvImport.ts:190-195` はわざわざ行合計をロール尺へ埋め戻している）。

フォールバックを落とすと:

| 影響 | どう見えるか |
| --- | --- |
| 02 §6-4 の `gap_min` / 01 §4-4 の `duration_gap` | **「枠 90 分／台本 0 分（90分の余り）」** |
| 04 §2-3 の類似スコア「合計尺が ±20% 以内 → +3点」 | **常に外れる** |
| 04 の `budget_sec`（枠の長さが尺の上限） | AI に「まだ 90 分空いている」と伝わる |
| 04 §6-2 の few-shot「合計 68 分」 | **嘘の見本** |

**しかもエラーになりません。誰も気づきません。**

### 3-2. 直し方

`shared/src/schedule/time.ts` に置きます（02 §7-4 が `parseDur` / `fmtAbs` を
ここへ移すと既に決めているので、同居させるのが自然）。

```ts
/** 尺文字列 → 秒。"1:30" / "90" / "0:01:30" / "10'30" を読む */
export function parseDur(v: string | null | undefined): number;
/** 秒 → "1:30"（新規に書くときの正規形） */
export function fmtDur(sec: number): string;
/** 秒 → "25:30"（24時で折り返さない絶対時刻表示） */
export function fmtAbs(sec: number): string;
/** ★台本の合計尺（秒）。**ロール尺が空なら行の合計に落ちる**（実装と同じ挙動） */
export function docTotalSec(sections: Section[]): number;
```

**呼ぶのは全員**: サーバー（02 のブレイクダウン・04 の索引）／クライアント（編集画面・OnAir）／
Excel（03）／AI（04）／MCP（05）。`client-qsheet/src/lib/time.ts` は**再輸出だけ**にする。

**検査**: `shared/tests/scheduleTime.test.ts` に
**「ロール尺が空でも行の合計が返る」**を必ず1本固定する。ここが壊れると
上の表の4か所が同時に、静かに嘘になります。

---

## 4. セルの参照方式を5本共通にする（`blockRef`）

### 4-1. 何が問題か

- 実装は `row.cells[blockId]`（`PrompterPage.tsx:33`, `CueRow.tsx:367,376`）。
- **同じ型のブロックが2本ある状況は 03 が前提にしています**
  （機械キー `blk.<type>#<n>`、「同型ブロックが2本のときは見出し末尾に `(2)`」）。
- ところが 05 §4-3・§5-1 は `cells: Partial<Record<BlockType, string>>` と書いており、
  **2本目のシナリオ列が黙って落ちます。**
- 04 も「`cells[scenarioBlockId]`」と書くだけで、**シナリオ列が2本あるとき
  どちらに書くかを決めていません。**

さらに `blockId` そのものが不安定です:

| どこで作られたか | id |
| --- | --- |
| 新規作成の既定3列（`DashboardPage.tsx:504`） | `"scenario"` / `"video"` / `"audio"` の**固定文字列** |
| サイドバーから足した列（`EditorSidebar.tsx:393`） | `blk_${Date.now()}` |

### 4-2. 直し方

**`blk.<type>#<n>`（`<n>` はその型の何番目か・1 始まり）を「`blockRef`」として5本共通の
参照方式に昇格します。**

```ts
// shared/src/qsheetAi/blockRef.ts（新規・純関数・React 依存なし）
export type BlockRef = string;                     // 'blk.scenario#2'
export function blockRefOf(blocks: Block[], blockId: string): BlockRef | null;
export function resolveBlockRef(blocks: Block[], ref: BlockRef): Block | null;
export function blockRefTable(blocks: Block[]): { ref: BlockRef; blockId: string;
                                                  type: BlockType; label: string }[];
```

- **03 の `_schema` シートが持つ対応表と、05 の `get_qsheet` が返す `blocks[]` は同じもの**
  （`blockRefTable()` の出力）。
- 04 の提案の `cells` も同じキーで書く。
- ⚠️ **`blockRef` は「今の並び」に依存する**ので、
  **保存された値として持たない**こと（Excel ファイルの中と、1回の API 往復の中だけで有効）。
  永続する参照が要るところは `blockId` を使う。
- **序数で当てるのは最後の手段。** 03 §8-3 のとおり、`blockId` が現存しないときは
  段②に落とさず `missing` にして手動割り当てへ回します。

### 4-3. `blocks[].id` を `genId('blk')` にする

`blk_${Date.now()}` は単発クリックでは衝突しにくいものの、
**v4 で「よく使う型をまとめて足す」導線を作った瞬間に衝突します**（検査 地雷#14）。
`ledScenes[].id` の `led_<Date.now()>`（`EditorSidebar.tsx:259`）も同じ。
**両方 `genId()` に直します。**

既存データの `blk_...` / `led_...` は**そのまま**（id は温存する。採り直すと参照が全部切れる）。
新しく作るものだけ `genId()` にする。

---

## 5. まとめ（この PR で触るファイル）

```
shared/src/schedule/time.ts                 parseDur / fmtDur / fmtAbs / docTotalSec（§3）
shared/src/qsheetAi/blockRef.ts             blockRef の解決（§4）
shared/tests/scheduleTime.test.ts           「ロール尺が空でも行の合計が返る」（§3）
shared/tests/qsheetMigrate.test.ts          templateIndex → templateId / モバイルのセル形（§1・§2）

client-qsheet/src/lib/time.ts               shared からの再輸出だけにする
client-qsheet/src/lib/migrateEntries.ts     読み込み時1回の変換を追加（§1・§2）
client-qsheet/src/components/editor/StageDiagramCell.tsx    templateId を読む
client-qsheet/src/components/editor/StageDiagramEditor.tsx  id を持つ
client-qsheet/src/components/editor/EditorSidebar.tsx       genId('blk') / genId('led')（§4-3）
client-qsheet/src/components/editor/CueRowMobileEditor.tsx  PC と同じセル形で書く（§2）
client-qsheet/src/pages/EditorPage.tsx      合計尺は docTotalSec を呼ぶ
client-qsheet/src/pages/OnAirPage.tsx       同上
```

**DDL はありません**（全部 `data` JSONB の中の話）。

---

## 6. 利用者に確認すべきこと

1. **立ち位置図のひな形を並べ替え・削除したときの既存行の扱い。**
   設計では「ひな形に id を持たせるので、並べ替えても削除しても既存行は正しい図を指し続ける／
   削除されたひな形を指していた行は**空になる**」です。
   **削除されたひな形を指していた行を、どう見せますか**（空／「削除済み」の表示）。
2. **モバイルと PC でセルの形が違っていた期間のデータをどうするか。**
   設計では**読み込み時に自動で PC の形へ寄せます**（人の操作は不要）。
   寄せずに「モバイルで作った行」として残したい理由がありますか。
3. **尺の書式。** 書き出し・AI が新しく書くときの正規形を `1:30` にしますか、`90`（秒）にしますか。
   （読むほうは3書式とも読めます。03 §12-3 と同じ質問です）
