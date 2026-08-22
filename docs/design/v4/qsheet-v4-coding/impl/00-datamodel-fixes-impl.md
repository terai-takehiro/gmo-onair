# 段0 実装設計 — データモデルの前提修正

> 対象: [`../00-datamodel-fixes.md`](../00-datamodel-fixes.md) の5件。
> 段の位置づけは [`../README.md`](../README.md) §7（実装順序）の**段0**。DDL はありません。
>
> **この文書はコードを1行も変えずに、実装を読んで書いています。**
> 実データ（本番 DB / 検証 DB）の中身は**このセッションから接続できないため未確認**です。
> 「未確認」と書いた項目は、着手時に必ず実物で確かめてください。

---

## §1 この段でやること

| # | やること | 出どころ |
| --- | --- | --- |
| 1 | `stage_diagram` セルの参照を `templateIndex`（配列 index）から `templateId`（ID 参照）に変える | 00 §1 |
| 2 | モバイル編集が書くセルの形を PC の形に揃え、既に書かれた分を読み込み時に寄せる | 00 §2 |
| 3 | 台本の合計尺を出す関数を1本にする（`docTotalSec`）。ロール尺が空なら行の合計に落ちる | 00 §3 |
| 4 | セルの参照方式 `blk.<type>#<n>`（`blockRef`）を純関数として置く（画面はまだ変えない） | 00 §4 |
| 5 | `Date.now()` 由来の id を `genId()` に直す（`blocks[]` / `ledScenes[]`、＋実装で見つかった2か所） | 00 §4-3 |

---

## §2 実装前の事実確認

**読み方**: 「設計書の前提」→「実際のコード」→ ✅合っている / ⚠️ずれている / ➕設計書に無い。
食い違いの一覧は §8 に表でまとめ直しています。

### 2-1. `stage_diagram` の `templateIndex`（00 §1）

| 設計書の前提 | 実際のコード | 判定 |
| --- | --- | --- |
| セルは `data.stageTemplates[]` の配列 index を持つ（`StageDiagramCell.tsx:81`） | `client-qsheet/src/components/editor/StageDiagramCell.tsx:81` `const selectedIdx = cell?.templateIndex ?? -1;` / 書き込みは同 `:88` `onChange({ ...cell, templateIndex: parseInt(e.target.value) })` | ✅ |
| ひな形の要素に `id` が無い | `StageDiagramCell.tsx:19-22` の `interface StageTemplate { name; elements }`。保存側 `client-qsheet/src/components/editor/StageEditor.tsx:59` も `{ name: string; elements: StageElement[] }` | ✅ |
| 直す先は `StageDiagramCell.tsx` と `StageDiagramEditor.tsx`（00 §5 のファイル一覧） | **`StageDiagramEditor.tsx` はどこからも import されていない**（import しているのは `StageDiagramCell`（`CueRow.tsx:6`）、`StageDiagramPreview`（`RundownPage.tsx:9`）、`StageEditor`（`EditorPage.tsx:21`）だけ）。ひな形の実際の保存経路は `StageEditor.tsx` ＋ `client-qsheet/src/pages/EditorPage.tsx:867-889` | ⚠️ (D4) |
| 読み手は編集画面だけ | **読み手は3か所**。`StageDiagramCell.tsx:81` / `client-qsheet/src/pages/RundownPage.tsx:689-690` / `client-qsheet/src/components/editor/PreviewModal.tsx:738-739`。00 §5 のファイル一覧に後ろ2つが無い | ⚠️ (D3) |
| 変換できない index は `templateId: null` にする | 未選択は**範囲外ではなく `-1`** が正規に入る（`StageDiagramCell.tsx:86` の `<option value={-1}>-- 選択 --</option>` ＋ `:88` の `parseInt`）。`-1` も `null` に落とす必要がある | ⚠️ (D6) |
| ひな形の複製は素直にコピーすればよい | `EditorPage.tsx:530-541` `duplicateStageTemplate` は `JSON.parse(JSON.stringify(...))` の deep copy。**id を足したら、複製時に必ず `genId('stg')` で採り直す**（そのままだと id が重複し、地雷#2 と同じ壊れ方をする） | ➕ |
| — | ひな形の一覧・編集の導線も index 基準（`EditorSidebar.tsx:82-83` `onEditStageTemplate?: (idx: number) => void`、`:648-668` の `map((t, i) => ...)`）。`EditorPage.tsx:228` の `editingStageIdx` も index | ➕ |
| — | **サーバーに別実体がある**。`qsheet_stage_templates` テーブル＋CRUD API（`server/src/contexts/qsheet/routes/stage-templates.routes.ts`、配線は `server/src/contexts/qsheet/index.ts:15`）。**client-qsheet からの呼び出しは0件**（参照は `client/src/contexts/platform/pages/DataViewerPage.tsx:90,165` の表一覧のみ）。設計書はこの表に触れていない | ⚠️ (D12) |
| サーバー側の複製は不要（`yjsDoc.ts` はトップレベルのキーしか見ない） | `shared/src/collab/yjsDoc.ts:14-16` のとおり `stageTemplates` は `extras` に丸ごと入る。`client-qsheet/src/lib/collab/ydocDiff.ts:164-168` も変化キーのみ全置換 | ✅ |

### 2-2. モバイル／PC のセル形ドリフト（00 §2）

| 設計書の前提 | 実際のコード | 判定 |
| --- | --- | --- |
| モバイルは型を無視して `{ entries: [{ label }] }` を書く | `client-qsheet/src/components/editor/CueRowMobileEditor.tsx:39-41` `function setEntries(_blkType, entries) { return { entries }; }` を `:82` で全ブロックに適用（`audio_mic` だけ `:117-131` で別扱い）。値は `:268` の `entry.label` | ✅ |
| PC は `{ value }` | `client-qsheet/src/components/editor/CueRow.tsx:666-676`（`remarks` / `item` / `lighting` などの既定枝）が `(row.cells[blk.id] || {}).value` を読み書き | ✅ |
| モバイルは `led_xr` に**誰も読まない** `cue` を書く | 書くのは `CueRowMobileEditor.tsx:337-341`。**ただし読み手が居る**（同 `:338` `value={entry.cue || ""}`）。PC は `cueType` / `cueCustom`（`CueRow.tsx:618-636`）を使うので PC からは見えないだけ。**「誰も読んでいないので情報は失われない」は成立しません** | ⚠️ (D5) |
| — | `transition` も形が違う。PC は選択肢（`CueRow.tsx:103-106` `F.I.` / `C.I.` / `custom`＋`transitionCustom`）、モバイルは自由文（`CueRowMobileEditor.tsx:342-346`）。モバイルが書いた自由文は PC の `<select>` に一致せず**空表示**になる。設計書は `cue` しか挙げていない | ⚠️ (D5) |
| モバイルで書かれた値は PC で「形が違う」だけ | **もっと悪い**。`patchEntry0`（`CueRowMobileEditor.tsx:71-84`）はセルを `{ entries }` で**丸ごと置き換える**ので、`stage_diagram` の `templateIndex` / `note`、`slide` の `image` は**消えます**。しかも `BlockPanel` のヘッダーにある `HighlightPicker`（`:203-206`）も同じ経路なので、**色を付けただけで立ち位置図の選択が消える** | ➕ |
| 逆向き（PC で書いた `{value}` をモバイルで読む） | `getEntries`（`:33-37`）は `{ value }` を読まないので**モバイルで空に見える**。`{ entries }` と文字列だけ読む | ➕ |
| 書き込み経路は `applyDataUpdate` を通る | 通る。`CueRowMobileEditor` の `updateState` ← `CueRowSheet.tsx:74` ← `CueCardList.tsx:429` ← `CueTable.tsx:110` ← `EditorPage.tsx:758` の `updateData` → `applyDataUpdate`（`EditorPage.tsx:326-331`） | ✅ |
| — | ただし `patchRow`（`CueRowMobileEditor.tsx:58-68`）は `si`/`ri` の**配列 index**で行を特定する。同時編集で上にロールが入ると別の行を書く。今回この関数を作り直すので、ついでに id 基準にできる | ➕ |

### 2-3. 合計尺（00 §3）— **この段でいちばん重い食い違い**

| 設計書の前提 | 実際のコード | 判定 |
| --- | --- | --- |
| 実装は「ロール尺 → 無ければ行の合計」のフォールバックを持つ。`EditorPage.tsx:517` と `OnAirPage.tsx:92-93` は**同じ形** | **向きが逆の2種類がある。**<br>① `client-qsheet/src/pages/EditorPage.tsx:516-518` = `parseDur(section.duration) \|\| rows合計` → **ロール尺が勝つ**<br>② `client-qsheet/src/pages/OnAirPage.tsx:91-99` = `if (rowSum === 0 && secDur > 0) secDur を使う; else 行ごとに積む` → **行の合計が勝つ**<br>③ `client-qsheet/src/pages/RundownPage.tsx:233-241` は②と同じ形、総尺 `:251-254` はその結果の合計 | ⚠️ **(D1)** |
| — | **両方に尺が入っていて食い違う台本で、編集画面と本番画面の総尺が違います**（ロール 5:00・行合計 4:30 なら 5:00 と 4:30）。「1本にする」＝**どちらかの画面の数字が必ず変わる**。設計書はこの分岐を認識していない | ⚠️ **(D1)** |
| フォールバックを落とすと静かに 0 分になる | **サーバーの PDF が実際にその形**。`server/src/contexts/qsheet/routes/pdf.routes.ts:165` は `sections.reduce((s, sec) => s + parseDuration(sec.duration \|\| '0'), 0)` で**フォールバック無し**。ロール尺が空の台本の PDF は総尺 0 | ⚠️ (D16) |
| 「ロール尺が未入力の台本は現実に存在する」（`CueTable.tsx:613,618` の警告、`csvImport.ts:190-195` の埋め戻し） | `client-qsheet/src/components/editor/CueTable.tsx:611-619` / `:730-738` に「尺が未入力です」の警告、`client-qsheet/src/lib/csvImport.ts:187-194` が行合計をロール尺へ書き戻し | ✅ |
| `shared/src/schedule/time.ts` に置き、**サーバーも呼ぶ** | **サーバーは `shared/` を import できません。** `server/tsconfig.json` の `rootDir: "./src"` と、`server/src/shared/collab/yjsDoc.ts:2-3` の明記「**サーバーは server/src/ 外を import できないため意図的に複製している**」。実際 `server/src` に `@gmo-onair/shared` の import は**0件**。既存の作法は**複製＋乖離検査**（`scripts/check-collab-parity.mjs` の `PAIRS`、CI は `.github/workflows/ci.yml:88`） | ⚠️ **(D2)** |
| `client-qsheet/src/lib/time.ts` は再輸出だけにする | 現状の export は `parseDur` / `normalizeDur` / `fmtAbs` / `fmtMinSec` / `fmtMmSs` の**5本**。設計の4本（`parseDur` / `fmtDur` / `fmtAbs` / `docTotalSec`）に `normalizeDur`（＝設計の `fmtDur` 相当）・`fmtMinSec`・`fmtMmSs` が入っていない | ⚠️ (D13) |
| `parseDur(v: string \| null \| undefined)` | 実装は `parseDur(v: string \| number \| undefined \| null)`（`client-qsheet/src/lib/time.ts:8`）。`number` を落とすと呼び出し側が壊れる | ⚠️ (D13) |
| `fmtAbs` は「秒 → `25:30`」 | 実装は `HH:MM:SS`（`client-qsheet/src/lib/time.ts:35-41`）。`91800` → `25:30:00` | ⚠️ (D14) |
| — | サーバーには**別実装の `parseDuration`** がある（`pdf.routes.ts:15-27`）。正規表現が client と違う（末尾アンカーの有無・`"` を区切りに含むか）ので、同じ文字列で違う秒数になり得る | ⚠️ (D15) |
| — | `_pageBreak` のロールは `rows` を持たない（`CueTable.tsx:222-224` の `{ id: genId("sec"), _pageBreak: true }`）。`EditorPage.tsx:517` は `parseDur(section.duration) \|\| section.rows.reduce(...)` なので、**ページ区切りを1つ入れると `section.rows` が `undefined` で TypeError になる形**（型は `Section.rows: CueRow[]` 必須だが、生成側が `any` なので `tsc` は通る）。実機での再現は**未確認**だが、コード上は決定的。`docTotalSec` は `rows ?? []` で必ず守る。なお seed（`server/src/shared/db/seed-subapps.ts:182`）は `rows: []` を入れているので、検証データでは踏まない | ➕ (D7) |

### 2-4. `blockRef` と同型2本（00 §4）

| 設計書の前提 | 実際のコード | 判定 |
| --- | --- | --- |
| 実装は `row.cells[blockId]` | `PrompterPage.tsx:33-35` / `CueRow.tsx:366-368,376-381` ほか全画面 | ✅ |
| `blockId` の出どころが2種類（固定文字列と `blk_${Date.now()}`） | 新規既定3列 `EditorPage.tsx:259-263` が `"scenario"` / `"video"` / `"audio"` の固定文字列、追加列 `EditorSidebar.tsx:390-395` が `blk_${Date.now()}` | ✅ |
| 同型2本は 03 が前提にしている | 実装内で**既に扱いが不統一**。1本目しか見ない `find`: `PrompterPage.tsx:31` / `CueRow.tsx:395` / `RundownPage.tsx:609` / `PreviewModal.tsx:643`。全部見る `filter`: `CueTable.tsx:460` / `PreviewModal.tsx:124` / `server/.../pdf.routes.ts:120` | ⚠️ (D9) |
| `BlockType` 型がある前提（05 §4-3 の `Partial<Record<BlockType, string>>`） | **`BlockType` という型はリポジトリに存在しません**（`grep` 0件）。11型の唯一の定義は `client-qsheet/src/components/editor/EditorSidebar.tsx:87-99` の配列リテラル。ブロックの型はどこでも `type: string` | ⚠️ (D8) |
| 11型は `scenario` / `video` / `slide` / `telop` / `audio` / `audio_mic` / `led_xr` / `lighting` / `stage_diagram` / `remarks` / `item` | `EditorSidebar.tsx:87-99` と一致（11型）。`slide` は `CueRow.tsx:566-576` が破線の枠を描くだけで書き込み経路なし（06 §3 のとおり） | ✅ |
| `blockRef` は保存しない（Excel の中と1往復の中だけ） | 保存する場所は無い＝新規に置くだけ。**この段では消費者（03/04/05）がまだ居ないので、純関数とテストだけ置き、画面は変えない**のが安全（→ §6） | ➕ |

### 2-5. `genId()`（00 §4-3）

| 設計書の前提 | 実際のコード | 判定 |
| --- | --- | --- |
| `genId()` は `crypto.randomUUID` 優先 | `client-qsheet/src/lib/stableIds.ts:22-30` | ✅ |
| `blocks[].id` が `blk_${Date.now()}` | `EditorSidebar.tsx:393` | ✅ |
| `ledScenes[].id` が `led_${Date.now()}` | `EditorSidebar.tsx:259` | ✅ |
| 既存 id は温存する | `ensureStableIds`（`stableIds.ts:43-96`）は既存 id を触らない。サーバー種化の `backfillIds`（`server/src/contexts/qsheet/collab.ts:27-38`）も同じ | ✅ |
| `Date.now()` 由来は上の2か所 | **あと2か所ある**。`CueCardList.tsx:89,103` の `row_${Date.now()}_${random}`（乱数付きなので衝突しにくいが規約から外れている）、`TrashDrawer.tsx:51` の `restored-${Date.now()}`（**ロールの id を `Date.now()` で作る**。同じ秒に2件復元すると id が重複し、地雷#2 と同じ壊れ方をする） | ⚠️ (D10) |
| — | `sectionTemplates` は保存だけできて挿入経路が無い（`CueTable.tsx:757-764` が唯一の書き手、読み手0件）。しかも `JSON.parse(JSON.stringify({label, rows}))` で **rows を id ごと deep copy** し、テンプレ自体には id が無い。→ 06 §5-2 が「作り込む／やめる」の判断待ちとして持っているので、**この段では触らない** | ➕ (D11) |

### 2-6. 移行を置く場所と、書き込みの制約

| 事実 | 根拠 |
| --- | --- |
| `qsheet_documents.data` は Yjs の所有物。サーバーが書いても3秒で上書きされる | `server/src/contexts/qsheet/collab.ts:56-74` の `persist` が `updateToData(state)` を `UPDATE qsheet_documents SET data = $2` で丸ごと書き戻す |
| サーバーが `data` を読む唯一の書き込み向き経路は「ルームの種」だけ（初回1回） | `collab.ts:47-55` `loadSeed` → `docToUpdate(backfillIds(data))`。既に `qsheet_doc_yjs.state` があれば `data` は読まれない（`server/src/shared/collab/roomManager.ts:48-56`） |
| 既存の「読み込み時1回」の移行は**編集画面でしか走らない** | `splitMultiEntryRows` の呼び出しは `EditorPage.tsx:270` の1か所のみ（`grep` で確認）。`ensureStableIds` も同 `:271` |
| したがって onair / rundown / prompter / audio / PDF は**旧形の `data` を直接読む** | `RundownPage.tsx:689`、`PreviewModal.tsx:738`、`server/.../pdf.routes.ts`。公開音声は `audio_mic` しか見ないので今回の影響を受けない（`server/src/contexts/qsheet/routes/public-audio.routes.ts:60-86`） |
| 書き込みは `applyDataUpdate` 経由・`updater` は `prev` の関数 | `client-qsheet/src/lib/collab/ydocDiff.ts:187-192`。3手順（`backfillIds` → `yDocToData` → `ensureStableIds(updater(prev))`）が id 増殖の防波堤 |

---

## §3 変更するファイルの一覧

### 3-1. 新しく置く

| パス | 何を | なぜ |
| --- | --- | --- |
| `shared/src/schedule/time.ts` | `parseDur` / `normalizeDur`（設計の `fmtDur`）/ `fmtAbs` / `fmtMinSec` / `fmtMmSs` / **`docTotalSec(sections)`**。`parseDur` の引数は `string \| number \| null \| undefined`（既存の受け口を狭めない）。`docTotalSec` は `(s.rows ?? [])` で守る | 00 §3。02 §7-4 が `parseDur` / `fmtAbs` をここへ移すと決めている |
| `server/src/shared/schedule/time.ts` | 上の**意図的な複製**（ヘッダーのコメントだけ差し替え） | サーバーは `shared/` を import できない（D2）。`yjsDoc.ts` と同じ作法に揃える |
| `shared/src/qsheet/blockTypes.ts` | `export const QSHEET_BLOCK_TYPES = [...] as const;` と `export type BlockType = typeof QSHEET_BLOCK_TYPES[number];`（11型） | `BlockType` は今どこにも無い（D8）。`blockRef` も 03/04/05 もこの型を前提にしている |
| `shared/src/qsheet/blockRef.ts` | `blockRefOf` / `resolveBlockRef` / `blockRefTable`（純関数・React 非依存） | 00 §4。設計書は `shared/src/qsheetAi/blockRef.ts` と書いているが、`qsheetAi` は 04 の持ち物。**段0 の成果物は AI に限らない**ので `qsheet/` に置く（→ §7 Q-E） |
| `shared/tests/scheduleTime.test.ts` | 「ロール尺が空でも行の合計が返る」「`rows` の無いロールで落ちない」「`_break`/`_vtr` のロールがロール尺で数えられる」 | 00 §3 の指定＋D7 |
| `shared/tests/qsheetMigrate.test.ts` | 「`templateIndex:1` → 2番目のひな形の id」「範囲外は `null`」「`-1` は `null`」「モバイルの `remarks` が `{value}` になる」「2回通しても変わらない（冪等）」 | 00 §1・§2 の指定＋D6 |
| `shared/tests/qsheetBlockRef.test.ts` | 「同型2本が `#1` / `#2` になる」「並べ替えると ref が変わる（＝保存してはいけない）ことを固定する」 | 00 §4 |
| `docs/changelog.d/<枝の名前>.md` | 1文（→ §6） | 作業 PR で版を上げないため（`scripts/check-changelog.mjs`） |

### 3-2. 直す

| パス | 何を | なぜ |
| --- | --- | --- |
| `client-qsheet/src/lib/time.ts` | 中身を消して `shared/src/schedule/time.ts` の再輸出だけにする。**export 名は5本とも残す**（`normalizeDur` / `fmtMinSec` / `fmtMmSs` を落とすと `CueTable.tsx:17` / `PreviewModal.tsx:3` が壊れる） | 00 §3、D13 |
| `client-qsheet/src/lib/migrateEntries.ts` | `splitMultiEntryRows` の隣に `migrateStageTemplateRefs(data)` と `migrateMobileCellShapes(data)` を足し、**`normalizeQsheetData(data): MigrateResult` 1本にまとめて export**。既存の `MigrateResult`（`data` / `changed` / `splitRows`）の形を踏襲する | 00 §1・§2。`splitMultiEntryRows` と同じ「読み込み時1回」の場所 |
| `client-qsheet/src/pages/EditorPage.tsx` | ① `:270` を `normalizeQsheetData` 呼び出しに差し替え（`splitMultiEntryRows` はその中へ）② `:515-518` の総尺を `docTotalSec(doc.data.sections)` に置換 ③ `:530-541` `duplicateStageTemplate` で `id: genId('stg')` を採り直す ④ `:867-889` の `StageEditor` の保存で新規テンプレに `genId('stg')` を採る ⑤ `editingStageIdx`（`:228`）を `editingStageId: string \| null` に変える | 00 §1・§3 |
| `client-qsheet/src/components/editor/StageEditor.tsx` | `template` の型を `{ id: string; name: string; elements: StageElement[] }` にし、`onSave` / `onSaveCopy` が id を保って（複製は採り直して）返す | 00 §1 |
| `client-qsheet/src/components/editor/StageDiagramCell.tsx` | `StageTemplate` に `id: string` を足し、`selectedIdx` を `selectedId` に。`<select>` の `value` を id に、`-- 選択 --` は `""`。**共通の読み取り関数 `resolveStageTemplate(cell, templates)` を export** して他の読み手が同じ規則を通るようにする | 00 §1、D3 |
| `client-qsheet/src/pages/RundownPage.tsx` | `:689-690` を `resolveStageTemplate` 経由に | D3 |
| `client-qsheet/src/components/editor/PreviewModal.tsx` | `:738-739` を `resolveStageTemplate` 経由に | D3 |
| `client-qsheet/src/components/editor/EditorSidebar.tsx` | ① `:259` `led_${Date.now()}` → `genId('led')` ② `:393` `blk_${Date.now()}` → `genId('blk')` ③ ひな形一覧（`:82-83`, `:648-668`）のコールバックを index から id に | 00 §4-3・§1 |
| `client-qsheet/src/components/editor/CueRowMobileEditor.tsx` | ① `setEntries`（`:39-41`）を廃止し、**型ごとに PC と同じ形で書く**（`scenario`/`video`/`audio`/`telop` は `{entries:[…]}`、`remarks`/`item`/`lighting` は `{value}`、`stage_diagram` は `{templateId, note}`、`slide` は `{image}`、`led_xr` は `{entries:[{sceneId, cueType, cueCustom, transition, transitionCustom}]}`）② `patchEntry0` が**セルを丸ごと置換しない**ようにする（既存キーを保つ）③ `getEntries`（`:33-37`）を `{value}` も読めるようにする ④ `patchRow`（`:58-68`）を `si`/`ri` から `row.id` 基準に | 00 §2、D5、2-2 の➕ |
| `client-qsheet/src/pages/OnAirPage.tsx` | 総尺・キュー積み上げ（`:91-99`）を `docTotalSec` と同じ規則に寄せる（**どちらの向きにするかは Q-A の判断待ち**） | 00 §3、D1 |
| `server/src/contexts/qsheet/routes/pdf.routes.ts` | `parseDuration`（`:15-27`）と `:165` の総尺を、複製した `server/src/shared/schedule/time.ts` の `parseDur` / `docTotalSec` に置き換える | D15・D16 |
| `scripts/check-collab-parity.mjs` | `PAIRS` に `['server/src/shared/schedule/time.ts', 'shared/src/schedule/time.ts']` を足す | 複製が黙ってずれないように（D2） |

### 3-3. 触らないと決めたもの（理由つき）

| パス | 触らない理由 |
| --- | --- |
| `client-qsheet/src/components/editor/StageDiagramEditor.tsx` | どこからも import されていない死んだファイル（D4）。**この段では消さない**（削除は 06 の作り直しでまとめる。段0 の PR を「見た目が変わらない」ままにしたい） |
| `client-qsheet/src/components/editor/CueTable.tsx:757-764`（`sectionTemplates`） | 06 §5-2 が「作り込む／やめる」の判断待ち（README §4-24）。判断前に触ると両方の選択肢を狭める |
| `client-qsheet/src/components/editor/TrashDrawer.tsx:51` / `CueCardList.tsx:89,103` | `Date.now()` 由来だが 00 §4-3 の対象外。**§7 Q-F に上げて判断を仰ぐ**（TrashDrawer はロール id なので優先度が高い） |
| 公開URL5本のパス | 1文字も変えない（README §3-1） |
| DDL / migration | 段0 に DDL は無い（README §6）。なお採番表の前提「現在の最大が 210」は実際には **211**（`server/src/shared/db/migrations/211_drop_techsheet_schema.sql`）→ D17 |

---

## §4 移行の扱い

### 4-1. 制約の整理

1. **サーバーは `data` を書けない**（README §3-3）。書いても `collab.persist` が3秒で上書きする（`server/src/contexts/qsheet/collab.ts:56-74`）。例外は新規 INSERT だけ。
2. **一斉変換の経路が存在しない。** 既存の「読み込み時1回」は `EditorPage.tsx:270` の1か所だけで、**編集画面を開いた台本しか直りません**。
3. 本番当日に `onair` / `rundown` / `prompter` しか開かない台本は、**いつまでも旧形のまま**でいられる。

### 4-2. 決め — 「寄せる場所」と「読む場所」を分ける（2層）

**(a) 正規化は `client-qsheet/src/lib/migrateEntries.ts` に置き、`EditorPage` の読み込み直後に1回だけ通す。**

- `normalizeQsheetData(data)` は純関数。`splitMultiEntryRows` と同じファイル・同じ返り値の形にする。
- 呼ぶのは `EditorPage.tsx:257-281` の `useEffect`（`splitMultiEntryRows` と `ensureStableIds` の間）。
- 変換したら既存どおり `setDirty(true)` / `setSaveStatus("unsaved")` に落とし、**保存または collab の `applyDataUpdate` 経由で書き戻す**。

**`applyDataUpdate` の `updater` の中では正規化しません。** 理由は2つ:

- `updater` は**打鍵のたびに走る**。全ロール・全行・全セルの走査を打鍵ごとに乗せることになる。
- `prev` は Y.Doc の**今の値**。他の人が旧形のセルを書いた瞬間、自分の打鍵が**自分の触っていないセルを書き換える**。同時編集で「触っていない場所が動く」のはいちばん追えない壊れ方で、`ydocDiff` の設計（セル単位 LWW）とも合わない。

**(b) 読み手には当面フォールバックを残す。** 新しく書くのは新形だけ、読むときだけ旧形も見る。

| 対象 | 読み方 |
| --- | --- |
| `stage_diagram` | `resolveStageTemplate(cell, templates)` の1本に集約し、`cell.templateId` が無ければ `cell.templateIndex`（`0` 以上かつ範囲内のときだけ）を見る |
| `remarks` / `item` / `lighting` | `cell.value ?? cell.entries?.[0]?.label ?? (typeof cell === 'string' ? cell : '')` |
| `led_xr` | `cueType` が無ければ `cue` を見る（`cue` が `V明け`/`Qワード`/`卓D` のいずれかなら `cueType` 扱い、そうでなければ `custom` 相当として表示） |

**理由**: サーバーが `data` を書けない以上、「全部直ってから読み手を切り替える」日は来ません。読み手にフォールバックが無いと、**編集画面を開かないまま本番を迎えた台本の立ち位置図が、当日 `rundown` で空白になります。** 段0 の目的は「Excel の往復を可能にすること」であって、本番画面を壊すことではない。

**(c) フォールバックをいつ外すか。** README §7 の段6（Excel）に入る前。判断の材料は
`SELECT count(*) FROM qsheet_documents WHERE data::text LIKE '%templateIndex%' AND deleted_at IS NULL;`
を検証・本番で1回ずつ叩けば足ります（**新しい記録の仕組みは作りません**）。0 になったら読み手のフォールバックを外す PR を1本出す。

### 4-3. 直せないものは、直せないと書く

モバイルが `stage_diagram` / `slide` のセルを丸ごと置き換えて消した `templateIndex` / `note` / `image` は、
**`data` の中にもう残っていないので復元できません**（2-2 の➕）。移行で拾えるのは `{entries:[{label}]}` の `label` だけです。
「モバイルで触った立ち位置図の選択が消えている台本がある」ことは、利用者に**そのまま伝えてください**（→ §7 Q-C）。

### 4-4. 新規 INSERT の既定値

`EditorPage.tsx:259-263` の既定3列（`"scenario"` / `"video"` / `"audio"` の固定 id）は**そのまま**にします。
`genId('blk')` にすると既存台本と新規台本で id 規約が割れ、03 の `_schema` 対応表の読み方が2通りになる。
固定文字列は「同じ型が2本」にはならない（`addBlock` は必ず `genId('blk')` を採る）ので、`blockRef` の `#1` は安定します。

---

## §5 検証手順

### 5-1. 機械で回すもの

```bash
npx tsc -b client-qsheet          # ⚠️ npm run typecheck は qsheet を見ない (D18)
npm run typecheck                 # shared / server 側の呼び出しが壊れていないか
npm run lint                      # check-changelog / check-file-size(shared/src は 400 行制限) ほか
npm run test                      # shared の Vitest。新しい3本がここで回る
node scripts/check-collab-parity.mjs   # server と shared の time.ts が同じか (npm run lint には入っていない)
npm run build:changed && npm run check:frozen   # ⚠️ 下記
```

- **`check:frozen` に注意。** 制作資料は凍結アプリで、ビルド後の CSS を md5 で突き合わせています（`scripts/check-frozen-css.mjs`）。
  モバイル編集の作り直しで**新しい Tailwind のクラス名を1つ書き足すと基準がずれて落ちます**。
  段0 は「見た目を変えない」段なので、**落ちたら基準を更新するのではなく、クラス名を増やさない書き方に直す**のが正解です。
- `check-file-size.mjs` の走査対象に `client-qsheet` は入っていませんが **`shared/src` は入っています**（上限 400 行）。
  `shared/src/schedule/time.ts` を膨らませないこと。

### 5-2. 手で確かめるもの（この段で壊れやすい点）

検証用 DB（`npm run verify:up`・ポート 5433・本番とは完全分離）で行います。**本番 DB では一切試さない。**

| # | 確かめること | 手順 | 期待 |
| --- | --- | --- | --- |
| 1 | 旧形が正しく移る | 検証 DB の `qsheet_documents.data` に `stageTemplates` を3つ・ある行に `templateIndex: 1` を入れて編集画面で開く | 2番目のひな形が選ばれたまま表示される |
| 2 | **ずれないこと**（この段の本題） | 1 の状態で1番目のひな形を削除する | 残った行は**2番目のひな形を指し続ける**（今は1番目にずれる） |
| 3 | 黙って別の図を刺さない | `templateIndex: 99` と `templateIndex: -1` の行を作って開く | どちらも「未選択」。**別の図が入らない** |
| 4 | **編集画面を開かずに本番画面が壊れないこと** | 旧形のまま `/qsheet/rundown/<id>` と `/qsheet/onair/<id>` を開く（編集画面は一度も開かない） | 立ち位置図が出る（互換レイヤ。§4-2(b)） |
| 5 | 公開URL5本が変わっていない | `editor` / `onair` / `rundown` / `prompter` / `audio` を順に開く | 全部 200。パスが1文字も変わっていない |
| 6 | モバイル → PC の往復 | 375px 幅で `remarks` に文字を入れ、PC 幅で同じセルを見る | 同じ文字が見える（今は PC で空） |
| 7 | **モバイルで触っても消えないこと** | 375px で `stage_diagram` ブロックの色（`HighlightPicker`）だけ触り、PC でそのセルを見る | ひな形の選択と `note` が残っている（今は消える） |
| 8 | `led_xr` の自由文 | 旧データの `cue: "V明け"` と `cue: "本番きっかけ"` を入れて開く | 前者は Cue の選択肢に、後者は「任意入力」に載る（捨てない。Q-B の判断次第） |
| 9 | 総尺が5か所で一致する | ロール尺が空・行にだけ尺がある台本で、編集画面・OnAir・ランダウン・印刷プレビュー・PDF の総尺を見比べる | **全部同じ**（今は PDF が 0） |
| 10 | 総尺の向き（Q-A の確認） | ロール 5:00・行合計 4:30 の台本を作って同じ5か所を見る | 決めたほうの値で**全部同じ**。**どちらに決めても片方の画面の数字が変わるので、必ず利用者に見せてから出す** |
| 11 | ページ区切りで落ちない | 編集画面でページ区切りを1つ入れる | 総尺の欄が壊れない（D7） |
| 12 | id が衝突しない | サイドバーの列追加を素早く5回連打／LEDシーン追加を5回連打 | `blk_` / `led_` の id が5つとも別。列が消えたり重なったりしない |
| 13 | **行が増殖しない**（地雷#2） | 同じ台本を2タブで開き、交互に20回打鍵して行数とロール数を数える | 増えない。`qsheet_doc_yjs.state` のサイズが跳ねない |
| 14 | 冪等 | 移行済みの台本をもう一度開く | `changed` が `false`（`setDirty` が立たない＝保存が走らない） |

---

## §6 PR の切り方

**1つの PR にまとめません。** 変わる画面の範囲が3つとも違い、戻すときの単位が揃わないためです。
ただし **B と C は同じリリースに入れます**（03 §4-4 が「00 が済むまで `led_xr` と `stage_diagram` は書き出しのみ」と決めているので、片方だけ出しても Excel には進めない）。

| PR | 中身 | なぜ分けるか |
| --- | --- | --- |
| **A**「合計尺を1本にする」 | `shared/src/schedule/time.ts` ＋ サーバー複製 ＋ `check-collab-parity` への追加 ＋ 5か所の呼び出し置換 ＋ `scheduleTime.test.ts` ＋ `blockTypes.ts` / `blockRef.ts` / `qsheetBlockRef.test.ts`（純関数のみ・画面は変えない） | **数字が変わる**唯一の PR。Q-A の判断が要るので単独で出し、レビューで「どの画面の数字がいくつからいくつに変わるか」を出す。`blockRef` はまだ誰も呼ばないので、ここに相乗りさせて PR を1本減らす |
| **B**「立ち位置図の参照を id にする」 | `stageTemplates[].id` ＋ `templateId` 移行 ＋ 読み手3か所の共通化 ＋ `genId('stg')` ＋ `qsheetMigrate.test.ts`（立ち位置図の分） | 立ち位置図しか動かない。壊れても影響範囲が1型に閉じる |
| **C**「モバイルのセル形を PC に揃える」 | `CueRowMobileEditor` の書き込み修正 ＋ モバイル形の移行 ＋ `genId('blk')` / `genId('led')` ＋ `qsheetMigrate.test.ts`（セル形の分） | モバイルしか動かない。`check:frozen` に引っかかりやすいのもここだけ |

各 PR は出した直後に `.claude/skills/pr-watch` で見張り、マージしたら `npm run reviews:debt` で指摘を棚卸しへ移します（CLAUDE.md の必須手順）。

### `docs/changelog.d/<枝の名前>.md` に置く1文（案）

- **A** — `feature/<Issue>-qsheet-doc-total-sec.md`:
  > 制作資料の合計尺を出す計算を1本にまとめた。編集画面・進行・ランダウン・印刷・PDF で別々の式になっており、**ロール尺が空の台本では PDF の総尺が 0 分**、編集画面と進行画面で違う数字が出ていた。
- **B** — `feature/<Issue>-qsheet-stage-template-id.md`:
  > 制作資料の立ち位置図が、ひな形を1つ消すだけで**全行が別の図を指してしまう**のを直した。ひな形に id を持たせ、行は id で参照するようにした（既存の台本は開いたときに自動で移る）。
- **C** — `feature/<Issue>-qsheet-mobile-cell-shape.md`:
  > 制作資料をスマホで編集したときに、備考・小道具・照明などが**PC で見ると空になる**問題を直した。保存の形を PC に揃え、既に保存されている分は開いたときに自動で寄せる。

---

## §7 未決・要確認

### 7-1. この段の実装で新しく出てきたもの（**利用者の判断が要る**）

| # | 訊くこと | 決まらないと何が起きるか |
| --- | --- | --- |
| **Q-A** | ⚠️ **合計尺は「ロール尺が勝つ」「行の合計が勝つ」のどちらにしますか。** 今は編集画面が前者、進行・ランダウンが後者で、**両方に尺が入っている台本では別の数字が出ています**（D1） | どちらに決めても**片方の画面の総尺が変わって見えます**。決めずに1本化すると、現場が「数字が変わった」と気づいた日に原因が分からない |
| **Q-B** | **スマホで `LED/XR` の Cue / トランジションに打った自由文を残しますか。** 設計書は「捨てる」ですが、**スマホからは今も見えています**（D5） | 捨てると、スマホで入れた文字が黙って消えます。残すなら「任意入力」に寄せます |
| **Q-C** | **スマホで立ち位置図・スライドのセルを触ると、PC で選んだ図や画像が消えていた**期間があります（色を付けただけでも消える）。消えた分は復元できません。これを利用者に通知しますか | 黙って直すと、「前は図が出ていたのに」の問い合わせに答えられない |
| **Q-D** | **`qsheet_stage_templates` テーブル（サーバーに CRUD API があるが画面から一度も呼ばれていない）を残しますか、消しますか**（D12） | 立ち位置図のひな形の置き場が2つあるまま。03 の Excel（`stage` シート）でどちらを正にするかが決まらない |
| **Q-E** | `blockRef` の置き場を `shared/src/qsheet/` にしてよいか（設計書は `shared/src/qsheetAi/`）。**AI 専用ではなく Excel・MCP も使う**ため | 04 を実装する人が `qsheetAi/` を探して見つからない |
| **Q-F** | `TrashDrawer.tsx:51` の `restored-${Date.now()}`（**ゴミ箱から復元したロールの id**）を `genId('sec')` に直してよいか（D10。00 §4-3 の対象外） | 同じ秒に2件復元すると id が重なり、地雷#2（行の増殖）を踏みます |

### 7-2. README §4 に既にあるもの（**重複して訊かない**。番号で参照）

| README §4 の # | 内容 | 00 の対応 |
| --- | --- | --- |
| 21 | 尺の書式（`1:30` / `90` / `0:01:30`）をどれに揃えるか | 00 §6-3。**A の PR で `normalizeDur` の出力形が決まる**ので、A を出す前に要る |
| 26 | スマホで台本を編集しているか（PC と違う形で保存されたセルが自動で寄る） | 00 §6-2。C の PR の前提 |
| 24 | 「テンプレとして保存」（`sectionTemplates`）を使っているか | 06 §10-2。**段0 では触らないと決めた**（§3-3） |
| 4 | `slide` に編集 UI を作るか | 06 §3。C で `slide` のセル形を `{image}` に揃えるところまではやるが、**入れる UI は 06 の仕事** |
| — | 削除されたひな形を指していた行の見せ方（空／「削除済み」） | 00 §6-1。**既定は「空（未選択）」**で作ります（検証手順 #3） |

### 7-3. 未確認（着手時に必ず実物で確かめる）

- 旧形（`templateIndex`）が入っている台本の**実件数**。本番・検証とも**未確認**（このセッションからは DB に接続していません）。
- モバイル形（`{entries:[{label}]}`）で保存されたセルの**実件数**、および `stage_diagram` / `slide` で値が消えている台本の有無。**未確認**。
- `EditorPage.tsx:517` がページ区切りで実際に TypeError になるか。コード上は決定的だが、**ブラウザでの再現は未確認**。
- migration の実際の最大番号は **211**（README §6 は 210 前提）。段0 に DDL は無いので影響しないが、段1 以降で振り直しが要る。

---

## §8 設計書との食い違い

| # | 設計書の記述 | 実際 | 影響 | どうするか |
| --- | --- | --- | --- | --- |
| **D1** | 00 §3-1「`OnAirPage.tsx:92-93` も同じ形」（ロール尺 → 行合計のフォールバック） | **向きが逆**。`EditorPage.tsx:516-518` はロール尺が勝ち、`OnAirPage.tsx:91-99` / `RundownPage.tsx:233-241` は行の合計が勝つ | **大**。「実装と同じ挙動の関数を1本置く」が成立しない。1本化すると必ずどちらかの画面の数字が変わる | Q-A で利用者に決めてもらう。00 §3-2 の「（実装と同じ挙動）」という但し書きを訂正する |
| **D2** | 00 §3-2「呼ぶのは全員: **サーバー**／クライアント／Excel／AI／MCP」 | サーバーは `shared/` を import できない（`server/tsconfig.json` の `rootDir: "./src"`、`server/src/shared/collab/yjsDoc.ts:2-3` に明記）。`server/src` の `@gmo-onair/shared` import は 0 件 | **大**。設計どおりに書くとサーバーがビルドできない | 既存の作法（意図的な複製＋`scripts/check-collab-parity.mjs`）に揃える。`PAIRS` に1行足す |
| **D3** | 00 §5 のファイル一覧に `templateIndex` の読み手が編集画面しか無い | 読み手は3か所（`StageDiagramCell.tsx:81` / `RundownPage.tsx:689` / `PreviewModal.tsx:738`） | 中。2か所直し漏れると本番当日に図が出ない | ファイル一覧に2本足し、読み取りを `resolveStageTemplate` 1本に寄せる |
| **D4** | 00 §5 が `StageDiagramEditor.tsx` を「id を持つ」ように直すと書いている | **どこからも import されていない死んだファイル**。実際のひな形編集は `StageEditor.tsx` ＋ `EditorPage.tsx:867-889` | 中。直しても何も変わらない | ファイル一覧を `StageEditor.tsx` と `EditorPage.tsx` に差し替える。死んだファイルの削除は 06 に回す |
| **D5** | 00 §2-2「`led_xr` の `cue` は**捨てる**（誰も読んでいないので情報は失われない）」 | `CueRowMobileEditor.tsx:338` が読んで表示している。`transition` も PC は選択肢・モバイルは自由文で、モバイルの値は PC で空表示になる（設計書に記述なし） | 中。捨てると利用者が入れた文字が消える | Q-B。既定は「捨てずに `cueType:'custom'` ＋ `cueCustom` に寄せる」 |
| **D6** | 00 §1-2「変換できなかった（index が範囲外）セルは `templateId: null`」 | 未選択は範囲外ではなく **`-1`**（`StageDiagramCell.tsx:86,88`） | 小。書き漏らすと `-1` が id 検索に落ちて例外 or 誤選択 | 移行の条件を「`0` 以上かつ `templates.length` 未満」に書く |
| **D7** | — | `addPageBreak`（`CueTable.tsx:222-224`）が `rows` の無いロールを作り、`EditorPage.tsx:517` の `section.rows.reduce` が TypeError になる形（型では通る） | 中。ページ区切りを入れると編集画面が落ちる（**実機は未確認**） | `docTotalSec` を `(s.rows ?? [])` で書き、テストに1本固定する |
| **D8** | 00 §4／05 §4-3 が `BlockType` 型を前提にしている | **リポジトリに存在しない**。11型の定義は `EditorSidebar.tsx:87-99` の配列リテラルだけ | 中。`blockRef` も 03/04/05 も土台が無い | `shared/src/qsheet/blockTypes.ts` を新設（00 §5 のファイル一覧に無い追加） |
| **D9** | 00 §4-1「05 §4-3 は同型2本を落とす」 | **実装も既に不統一**。1本目しか見ない `find` が4か所（`PrompterPage.tsx:31` / `CueRow.tsx:395` / `RundownPage.tsx:609` / `PreviewModal.tsx:643`）、全部見る `filter` が3か所 | 中。`blockRef` を足しても画面はこの4か所で1本目のままになる | 段0 では純関数だけ置き、**画面の統一は 06 の棚卸しに1行として渡す** |
| **D10** | 00 §4-3 が挙げる `Date.now()` 由来は `blocks[]` と `ledScenes[]` の2か所 | あと2か所（`CueCardList.tsx:89,103` の行 id、**`TrashDrawer.tsx:51` のロール id**） | 中。TrashDrawer は地雷#2（id 重複）に直結 | Q-F |
| **D11** | 00 §4-3 は `sectionTemplates` に触れていない | `CueTable.tsx:757-764` が rows を **id ごと deep copy** し、テンプレ自体に id が無い | 中。挿入側を作った日に id が重複する | 06 §5-2 が判断待ちで持っているので**段0 では触らない**（重複して設計しない） |
| **D12** | — | サーバーに `qsheet_stage_templates` テーブル＋CRUD API があるが、client-qsheet からの呼び出しが0件 | 中。立ち位置図のひな形の置き場が2つある | Q-D |
| **D13** | 00 §3-2 の関数一覧が4本（`parseDur` / `fmtDur` / `fmtAbs` / `docTotalSec`）。`parseDur` の型は `string \| null \| undefined` | 実装は5本（`parseDur` / `normalizeDur` / `fmtAbs` / `fmtMinSec` / `fmtMmSs`）。`parseDur` は `number` も受ける | 小。落とすと `CueTable.tsx:17` / `PreviewModal.tsx:3` が壊れる | 5本とも移し、`fmtDur` は `normalizeDur` の別名にしない（名前を増やさない） |
| **D14** | 00 §3-2「`fmtAbs`: 秒 → `25:30`」 | 実装は `HH:MM:SS`（`time.ts:35-41`）。`25:30:00` | 小 | 実装の書式を正とし、設計書の説明を直す |
| **D15** | — | サーバーに別実装の `parseDuration`（`pdf.routes.ts:15-27`）があり、正規表現が client と違う | 小〜中。同じ文字列で違う秒数になり得る | 複製した `server/src/shared/schedule/time.ts` に寄せる |
| **D16** | 00 §3-1「実装にはフォールバックがあります」 | **サーバーの PDF にはありません**（`pdf.routes.ts:165`）。ロール尺が空の台本の PDF 総尺は 0 | 中。00 §3-1 の表の「静かに 0 分になる」が**すでに1か所で起きている** | A の PR で直す。検証手順 #9 |
| **D17** | README §6「現在の最大が 210」 | 実際は **211**（`211_drop_techsheet_schema.sql`） | 小（段0 に DDL 無し） | 段1 以降の採番でずらす。README §6 の但し書きどおり着手時に確認 |
| **D18** | — | `npm run typecheck` は v4 対象3アプリのみで **client-qsheet を見ない** | 中。型エラーに気づかず PR を出せる | §5 のとおり `npx tsc -b client-qsheet` を手元の gate に必ず入れる（CI は `typecheck:all` で見る） |
| **D19** | — | 制作資料は `check:frozen`（凍結 CSS の md5 突合）の対象 | 中。モバイル編集の作り直しで Tailwind のクラスが増えると落ちる | クラス名を増やさない書き方にする。基準の更新で逃げない |
