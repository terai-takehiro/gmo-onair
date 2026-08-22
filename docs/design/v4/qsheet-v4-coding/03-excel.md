# 制作資料 v4 — Excel 互換（書き出し・取込・テンプレファイル）

> **2026-08-21: 4観点の敵対的検査の指摘を反映済み。** 反映内容と判断待ちの項目は
> [`README.md`](README.md) を先に読んでください。
> **最重要の変更は §8-1**（取込の適用が同時編集で入った行を黙って消す問題）です。
>
> 第2段階（コーディング）の設計書 ③。**執筆時点ではコードは書いていませんでした。**
> ✅ **2026-08-22 追記: 実装済み**（専用の実装設計ファイルは作らず、この文書のまま「段6」として
> 直接実装・マージ済み。§11-3 に残る唯一の未達項目〈旧CSV取込の削除条件〉を参照）。
> 兄弟: [`01-app-structure.md`](01-app-structure.md)（ルーティング・ミニアプリ・ジャーニー）
> 対象バンドル: [`client-qsheet/`](../../../../client-qsheet/CLAUDE.md)（ベースパス `/qsheet/`）
> 利用者の要望: 「エクセルでの読み込みをよく使う」「なるべく多くの項目を互換にしたい」
> 「エクセルのテンプレファイルについても工夫して制作してほしい」

## 決めたこと（結論先出し）

1. **入出力の正は `.xlsx` にする。** CSV は「他システムに渡すための書き出し」として残すが、**CSV 取込も新パイプラインの入口に一本化**する（同じ列定義・同じ検証・同じ取消を通す）。今の `client-qsheet/src/lib/csvImport.ts` のクライアント単独取込は撤去。
2. **書き出しは全部サーバーに寄せる。** 今は CSV 書き出しが `EditorPage.exportCsv()` と `PreviewModal.handleCsvDownload()` の **2 本あって出力が違う**（CM・VTR・ロール尺が片方だけ落ちる）。列定義をサーバーの 1 か所に置き、`.xlsx` も `.csv` も同じ関数から出す。**「2 本ある」を構造的に起こせなくする**のが目的。
3. **ライブラリは `exceljs` を新規に足す**（サーバー側のみ）。既存の `xlsx`（SheetJS CE 0.18.5）は**入力規則（ドロップダウン）もセル書式もシート保護も書けない**ので、名指しで頼まれたテンプレが作れない。他コンテキスト（機材・財務など）の `xlsx` はそのまま。→ §7・§11-2。
4. **Excel の「行」に ID 列を置き、取込は既定で差分マージ**にする。ID が既存の `sec_…`/`row_…` と一致すれば**その行を更新（id 温存）**、空・未知なら新規。**「出す → Excel で直す → 戻す」で行の同一性が切れない**のが今回いちばん効く変更（今は毎回 `genId()` で全採番し直し＝全行入れ替え）。
5. **列が無い＝その項目は「変更しない」**（空にしない）。今の CSV `replace` は、列名を 1 文字変えただけでその列の中身が台本全体から消える。**破壊的な `replace` モードは廃止**し、`merge`（既定）／`sync`（ファイルに無い行はゴミ箱へ退避）／`append` の 3 つにする。
6. **11 ブロック型のうち 10 型を往復可能にする。** 復元できないのは**画像の本体だけ**（`slide` / `scenario`・`video`・`audio`・`telop` の `image`）。`led_xr` と `stage_diagram` は **ID 参照をやめて名前参照にし、実体を専用シートに出す**ことで往復させる。→ §4。
7. **ヘッダは 2 行にする。** 1 行目＝日本語見出し（人が読む）、2 行目＝**機械キー（非表示行）**。データは 3 行目から。列を消しても・並べ替えても・見出しを書き換えても、**その列に付いた機械キーが一緒に動く**ので対応づけが壊れない。加えて隠しシート `_schema` にスキーマ版とブロック定義を持つ。→ §5-3。
8. **取込は「サーバーが解析・検証・合成」→「クライアントが `applyDataUpdate` で適用」**の 2 段。サーバーが DB を直接書くと、**同時共同編集（Yjs）の永続化に上書きされて消える**（`collab.ts` の `persist` が JSONB を毎回書き戻すため）。id の安全網（`backfillIds` → `yDocToData` → `ensureStableIds` の順序）もクライアント側にしかない。→ §8-1。
9. **取込前スナップショットを必ず DB に残す**（`qsheet_import_batches`）。ワンクリックで取り消せるようにする。今の `replace` は confirm で「元に戻せません」と言っているだけ。
10. **テンプレは「空のひな形」と「今の台本そのもの」の 2 種類を同じ生成器から出す。** ひな形だけ別に作ると必ず食い違うため。記入例シート・入力規則・尺列の文字列書式（`0:30` が時刻に化けるのを止める）・シート保護をここで作り込む。→ §5。

---

## 0-0. ⚠️ この文書の Excel と、機器設定の Excel は**全く別のもの**

**利用者の明示の判断（2026-08-21）**: 「なおエクセルは全く別のものだと理解しています。設計もそのようにしてください。」

制作資料には `.xlsx` を出す機能が 2 つありますが、**同じ名前で呼ぶだけの別物**です。
**共通化しません。共通の基盤も作りません。**

| | **台本の Excel**（この文書） | **機器設定の Excel**（[`08-recording-streaming.md`](08-recording-streaming.md)） |
| --- | --- | --- |
| 何のため | 台本を Excel で編集して**戻す** | 収録・配信の設定を**現場の Assistant に渡す** |
| 向き | **往復**（書き出し ↔ 取込） | **片道**（ONAiR → 現地。戻せない） |
| 読む相手 | **ONAiR 自身** | **別プロダクト**（`gmo-onair-assistant`・Rust） |
| ヘッダ | **2 行**（日本語＋非表示の機械キー）。データは 3 行目から | **1 行だけ。A1 から** |
| シート | 何枚でも・順不同・`_schema` の隠しシートあり | **データを必ず 1 枚目**（相手は 1 枚目しか読まない） |
| 空欄の意味 | **その項目を変更しない** | **現地の機器の設定を変えない** |
| 空行 | 無視してよい | **禁止**（相手の行番号がずれる） |
| 値の綴り | ONAiR が決める | **機器の綴りと完全一致**（大小区別・部分一致なし） |
| ライブラリ | **`exceljs`**（入力規則・書式・保護が要る） | `xlsx`（`buildExcelWorkbook`）で足りる |
| 取込 | **ある**（差分マージ・取消つき） | **無い**（片道なので） |

**実装で守ること**:

1. **モジュールを分ける。** `qsheet-excel.service.ts`（この文書）と
   `recording-excel.service.ts`（08）。**互いを import しない。**
2. **列定義・ヘッダ生成・検証を共有しない。** 前提が正反対なので、
   共有した瞬間にどちらかが壊れます。
3. **「似ているから」で後から寄せない。** 寄せると、
   **2 行ヘッダが機器設定側に混入して現地で読めなくなる**（相手は 2 行目をデータ行として読む）。
4. 例外なし。`Content-Disposition` の作り（`excelResponse`）すら、
   **どちらも既存の共通ユーティリティをそれぞれ呼ぶ**だけにとどめ、
   Excel 用の共通レイヤーは新設しません。

---

## 0. 前提（実装を読んで確認した事実。推測ではない）

| 事実 | 出どころ |
| --- | --- |
| CSV 書き出しが **2 本**あり、ヘッダーの「CSV」は CM(`_break`)・VTR(`_vtr`)・ロール尺・空ロールを**落とす**。往復できるのは印刷プレビュー側だけ | `client-qsheet/src/pages/EditorPage.tsx:134` / `src/components/editor/PreviewModal.tsx:154` |
| サイドバー「メタ」タブの **「現在の台本をExcel出力」「Excelから読み込み」は無反応**（`onExportExcel`/`onShowImport` がプロップ未配線） | `EditorSidebar.tsx:713-728` ↔ `EditorPage.tsx:763-780` |
| 取込は `file.text()` の **UTF-8 決め打ち**。`accept=".csv,text/csv"` | `CsvImportDialog.tsx:26` |
| 列の対応づけは **ブロックのラベル文字列の完全一致**のみ。手動マッピング UI は無い。`セクション` 列が無いと即エラー | `csvImport.ts:56-74` / `CsvImportDialog.tsx:118-136` |
| `slide` / `stage_diagram` / `led_xr` は **CSV から復元不可**（`parseCell` が `undefined` を返す）。書き出し側にも分岐が無く**常に空列** | `csvImport.ts:107-120` |
| 取込は **必ず新 id を採る**（`genId("sec")`/`genId("row")`）。id 欠落が「3→769→100万行」を起こした地雷はここでコメント固定されている | `csvImport.ts:124-127,151,157,166,184` / `shared/tests/qsheetCsvImport.test.ts` |
| `replace` はスナップショットもゴミ箱退避も取らない | `CsvImportDialog.tsx:55` |
| サーバーには **`xlsx@0.18.5`** が既に入っており、`buildExcelWorkbook` / `parseExcelBuffer` / `parseExcelHeaders` の共通ユーティリティがある。ただし**列幅（`!cols`）以外の書式は書いていない** | `server/package.json:42` / `server/src/shared/utils/excel.ts` |
| 機材に **「プレビュー → 手動マッピング → dry_run → commit」の実装済み前例**がある | `server/src/contexts/equipment/routes/excel.routes.ts` / `client-equipment/src/components/ExcelImportDialog.tsx` |
| 汎用の Excel リソースルーター（`/template`・`/import`・`/export-xlsx` を設定から生成）も既にある。ただし**1 リソース＝1 テーブル＝平らな行**が前提で、Qシート（入れ子＋複数シート）には**当たらない** | `server/src/shared/utils/excel-resource.ts` |
| collab の `persist` は Y state を保存するたび **`qsheet_documents.data` を毎回上書き**する（3000ms debounce ＋ 無人化時 flush） | `server/src/contexts/qsheet/collab.ts:62-73` |
| Y.Doc ↔ データ の変換層はサーバー／shared に**意図的な複製**があり `scripts/check-collab-parity.mjs` が一致を検査する。**差分器 `ydocDiff.ts` / `ydocOps.ts` はクライアントにしか無い** | `scripts/check-collab-parity.mjs:21` / `client-qsheet/src/lib/collab/` |
| 並び替え（move）は Yjs に atomic move が無く clone(delete+insert) で表現するため **CRDT identity を失う** | `ydocOps.ts:221` のコメント |
| Qシート API は `/api/v1/internal/qsheet/...`。見える範囲は「作成者本人／共有先／`system_admin`」で、**権限なしは存在秘匿のため 404** | `contexts/qsheet/index.ts` / `contexts/qsheet/access.ts` |
| 画像は FS 上（`server/uploads/qsheet/<32hex>.<ext>`）、配信 URL は `/api/v1/internal/qsheet/images/:filename`、**DB に記録なし**・5MB 上限・マジックバイト検証 | `routes/upload.routes.ts` |
| 本番イメージは `node:20-alpine` | `Dockerfile:43,63,155` |
| 移行番号は 210 まで使用済み。`01-app-structure.md` が 211・212 を予約している | `server/src/shared/db/migrations/` / `01-app-structure.md:7-1` |

---

## 1. なぜ CSV では足りないのか（判断の根拠）

要望は「なるべく多くの項目を互換に」です。CSV で今すぐ困るのは次の 5 点で、**うち 4 点は CSV の表現力の問題**です。

| # | 困りごと | CSV で直せるか |
| --- | --- | --- |
| 1 | 尺 `0:30` が Excel で時刻型に化けて `0:30:00` になる | **直せない**（CSV にセル書式が無い） |
| 2 | 話者・マイク状態・LED シーンを**選ばせたい**（打ち間違いが致命的） | **直せない**（入力規則が無い） |
| 3 | ID 列・通し# を**触らせたくない** | **直せない**（保護が無い） |
| 4 | マイク香盤・LED シーン・立ち位置図など**表が入れ子**になるものを持ちたい | **直せない**（1 シートしかない） |
| 5 | 日本語版 Excel で開いて保存すると CP932 に落ちて取込が文字化けする | 判定を足せば直せる（→ §8-4 で対処） |

よって **.xlsx を正**にします。ただし CSV を捨てると「他ツールに渡す」用途が消えるので、**書き出しの CSV は残す**（列は .xlsx の「進行台本」シートと同じ・1 行目の日本語見出しのみ）。

---

## 2. ライブラリの選定

### 2-1. 決定: サーバーに `exceljs` を足す（Qシート専用）

必要な機能と、`xlsx@0.18.5`（SheetJS Community Edition）で書けるか:

| 必要なもの | SheetJS CE | ExcelJS |
| --- | --- | --- |
| 複数シート・列幅 | ○ | ○ |
| **入力規則（ドロップダウン）** | **×**（CE は data validation を書けない） | ○ `cell.dataValidation` |
| **セル書式（`@` 文字列書式・太字・背景色）** | **×**（スタイルは Pro 限定） | ○ |
| **シート保護・セルのロック解除** | × | ○ `worksheet.protect()` / `cell.protection` |
| **隠しシート・隠し行** | ×（`Hidden` の書き出し不可） | ○ `worksheet.state='veryHidden'` / `row.hidden` |
| 定義名（ドロップダウンの参照元） | △ | ○ `workbook.definedNames.add()` |
| ウィンドウ枠の固定 | × | ○ `worksheet.views` |
| 画像の埋め込み | × | ○ `workbook.addImage()` |
| 読み取り | ○ | ○ |

「テンプレファイルを工夫して」という要望は、**上の表の×が全部要る**という意味です。SheetJS CE のままでは満たせません。

**副次的な理由（安全側）**: npm 上の `xlsx` は 0.18.5 で更新が止まっており（SheetJS が npm 配布をやめたため）、この版には既知の脆弱性（プロトタイプ汚染・ReDoS）が残ります。**利用者がアップロードしてくる未知のファイルを解く**のは今回が初めてなので、新しい取込経路は更新の続いているライブラリ（ExcelJS, MIT）で解くほうが筋が良い。→ 実際の `npm audit` 結果は着手時に確認（§11-2）。

**やらないこと**: 既存の機材・財務などの `xlsx` を ExcelJS に移すのは**この設計の範囲外**。サーバーイメージに Excel ライブラリが 2 つ入るのは承知の上で、Qシートだけ先に ExcelJS にする（全面移行の是非は別途）。

### 2-2. クライアントには Excel ライブラリを入れない

解析も生成も**すべてサーバー**。クライアントは
`multipart/form-data` で投げて、返ってきた JSON を見て、blob をダウンロードするだけ。

- 理由①: 列定義を 1 か所（サーバー）に閉じ込められる。「CSV 書き出しが 2 本」の再発を構造的に防げる。
- 理由②: `client-qsheet` のバンドルに 1MB 級のライブラリを足さずに済む（v4 のスマホ対応方針と相性が悪い）。
- 理由③: 未知のファイルを解く処理をブラウザに置かない。

---

## 3. Excel ファイルの全体構成（シート一覧）

`.xlsx` 1 ファイル＝台本 1 本。シートは**論理名**で識別し、実シート名を変えられても A2 セルの目印で追えるようにする（§5-3）。

| # | 論理名 | シート名（既定） | 役割 | 取込 |
| --- | --- | --- | --- | --- |
| 1 | `info` | 台本情報 | メタ（タイトル・稿種別・日付・場所ほか） | **○ 往復** |
| 2 | `script` | 進行台本 | ロール／行／CM／VTR／改ページ＋全ブロック列 | **○ 往復（主役）** |
| 3 | `mic` | マイク香盤 | 行 × Ch の割当（`audio_mic` の実体） | **○ 往復** |
| 4 | `micch` | マイクCh | `masters.micChannels`（Ch 番号とラベル） | **○ 往復** |
| 5 | `led` | LEDシーン | `data.ledScenes`（ID・名前・壁・床） | **○ 往復** |
| 6 | `stage` | 立ち位置図ひな形 | `data.stageTemplates` の名前 | **○ 往復** |
| 7 | `stagepos` | 立ち位置図の要素 | ひな形の中身（人／四角の座標） | **○ 往復** |
| 8 | `masters` | マスター | 話者・映像ID・音声ID・テロップID・マイク種別 | **○ 往復**（ドロップダウンの元） |
| 9 | `images` | 画像（参照のみ） | 行 × 列 × ファイル名 | △ 参照の差し替えのみ |
| 10 | `example` | 記入例 | 実物のサンプルと罠の注意書き | × 読み飛ばす |
| 11 | `_schema` | `_schema`（`veryHidden`） | スキーマ版・台本ID・ブロック定義 | 内部 |

**`sectionTemplates`（ロールのひな形）と `trash`（ゴミ箱）は Excel に出しません。**
前者は「rows を deep copy して持つ」ため Excel に出すと行 id の重複を誘発し、後者は
人が消したものの置き場なので、ファイルに出す意味がありません（→ §11-1 の迷い）。

⚠️ **`sectionTemplates` そのものが地雷です（検査 機能#M3）。**
「テンプレとして保存」（`SectionMenu.tsx` / `CueTable.tsx:762`）は**保存しかできず、
読み手が実装に 0 件**です。しかも `CueTable.tsx:762` は rows を **id ごと deep copy** するので、
将来「テンプレから挿入」を作った瞬間に**同一 row id が 2 つ生まれ、
3→769→100万行の地雷を踏みます。**
→ [`06-editor.md`](06-editor.md) §5 が「適用時は必ず `genId` で採り直す／保存時に id を落とす」
または「機能ごと廃止」を引き取りました。

---

## 4. 11 ブロック型の Excel 表現（これが本題）

### 4-1. 早見表

「往復」＝ 書き出し → Excel で編集 → 取込 で元に戻るか。

| # | type | 既定の見出し | Excel での置き場所 | 往復 |
| --- | --- | --- | --- | --- |
| 1 | `scenario` | シナリオ | 進行台本 4 列（話者／本文／Q／画像） | **○**（画像を除く） |
| 2 | `video` | 映像 | 進行台本 3 列（ID／メモ／画像） | **○**（画像を除く） |
| 3 | `slide` | スライド | 進行台本 1 列（画像）＋ 画像シート | **×**（参照差し替えのみ） |
| 4 | `telop` | テロップ | 進行台本 3 列（ID／メモ／画像） | **○**（画像を除く） |
| 5 | `audio` | オーディオ (BGM/SE) | 進行台本 3 列（ID／メモ／画像） | **○**（画像を除く） |
| 6 | `audio_mic` | マイク香盤 | **マイク香盤シート**（＋進行台本に要約列） | **○**（OFF も表現できる） |
| 7 | `led_xr` | LED/XR | 進行台本 3 列（シーン名／Cue／トランジション）＋ **LEDシーンシート** | **○** |
| 8 | `lighting` | 照明 | 進行台本 1 列 | **○** |
| 9 | `stage_diagram` | 立ち位置図 | 進行台本 2 列（ひな形名／メモ）＋ **立ち位置図 2 シート** | **○** |
| 10 | `remarks` | 備考 | 進行台本 1 列 | **○** |
| 11 | `item` | 小道具 | 進行台本 1 列 | **○** |

**11 種類は 1 つも減らしません。** 今 CSV で復元不可の 3 型のうち、`led_xr` と `stage_diagram` は
**参照を「配列 index / 内部 ID」から「名前」に変える**ことで往復できるようになります。
残る `slide`（＝画像そのもの）だけが往復不可です。

### 4-2. 往復できないもの（はっきり書く）

| できないこと | 代わりに持たせるもの |
| --- | --- |
| **画像の本体**（`slide.image` / 各 entry の `image`） | ファイル名（`<32hex>.<ext>`）を**読み取り専用列**に出す。ID が一致した行は**既存の画像がそのまま残る**（取込で消えない）。既に台本内にある別の画像を指したいときは、そのファイル名を書き換えれば**参照の差し替えだけ**できる。**新しい画像を Excel から入れることはできない**（アップロードはアプリの画面で行う） |
| 画像の**新規アップロード** | しない。理由: `.xlsx` に埋まった画像はマジックバイト検証・5MB 上限・重複ハッシュ命名の既存経路（`upload.routes.ts`）を通らず、`.xlsx` を経由した任意ファイル投入口になる |
| `sectionTemplates` / `trash` | 出さない（§3 の注） |
| 同時編集中の**他人の変更** | 出さない。取込は「編集者が自分ひとりのとき」に行う前提（dry_run 画面で他の接続者がいれば警告を出す。→ §8-6） |

### 4-3. 型ごとの列定義（進行台本シート）

機械キーの書式は **`blk.<type>#<n>.<field>`**（`<n>` はその型の何番目のブロックか・1 始まり）。
不透明な `blockId` ではなく型と序数にしたのは、**別の台本で作ったファイルでも当たる**ようにするため
（新規作成の台本は blockId が `"scenario"`/`"video"`/`"audio"` の固定文字列、サイドバー追加分は別物、という食い違いが現にある）。正確な blockId は `_schema` シートが持つ。

```ts
// ① scenario
'blk.scenario#1.speaker'  '<ラベル>:話者'   → entries[0].name        入力規則: 話者一覧
'blk.scenario#1.text'     '<ラベル>:本文'   → entries[0].html        折り返し表示・上寄せ
'blk.scenario#1.q'        '<ラベル>:Q'      → entries[0].isQWord     入力規則: ○ / (空)
'blk.scenario#1.image'    '<ラベル>:画像'   → entries[0].image       ロック（読み取り専用）

// ②④⑤ video / telop / audio （3 型で同形）
'blk.video#1.label'       '<ラベル>:ID'     → entries[0].label       入力規則: 映像ID一覧
'blk.video#1.memo'        '<ラベル>:メモ'   → entries[0].memo
'blk.video#1.image'       '<ラベル>:画像'   → entries[0].image       ロック

// ③ slide
'blk.slide#1.image'       '<ラベル>:画像'   → cell.image             ロック

// ⑥ audio_mic
'blk.audio_mic#1.summary' '<ラベル>'        → 要約表示のみ・ロック
//   実体は「マイク香盤」シート。要約の書式: "Ch1:ON 田中/SM58 ／ Ch2:STBY 鈴木 ／ Ch3:OFF"

// ⑦ led_xr
'blk.led_xr#1.scene'      '<ラベル>:シーン'         → entries[0].sceneId を**シーン名**で表す  入力規則: LEDシーン名
'blk.led_xr#1.cue'        '<ラベル>:Cue'            → cueType / cueCustom                     入力規則: V明け/Qワード/卓D（他は自由入力→custom）
'blk.led_xr#1.transition' '<ラベル>:トランジション' → transition / transitionCustom           入力規則: F.I./C.I.（他は自由入力→custom）

// ⑧⑩⑪ lighting / remarks / item
'blk.lighting#1.value'    '<ラベル>'        → cell.value

// ⑨ stage_diagram
'blk.stage_diagram#1.template' '<ラベル>:ひな形' → **ひな形名**で表す  入力規則: ひな形名一覧
'blk.stage_diagram#1.note'     '<ラベル>:メモ'   → cell.note
```

**同じ日本語見出しが 2 つできる場合**（同型ブロックが 2 本など）は、見出しの末尾に `(2)` を足す。
機械キーは序数が違うので衝突しない。

### 4-4. `led_xr` と `stage_diagram` を往復させるために必要な前提（データモデル側の変更）

⚠️ **検査（機能#H1・整合#8）で持ち主を実在の文書に直しました。**
初版はここで `[02-datamodel]` を参照していましたが、**そのような文書はこのフォルダに
ありません**（`02` はスケジュール表）。**リンク切れの前提は必ず実装から抜け落ちます。**
下の3件（＋`blocks` の id・尺の合計）は
**[`00-datamodel-fixes.md`](00-datamodel-fixes.md)（v4.1 の最初の PR）が正式に引き取りました。**
この文書の設計はそこに依存します。

1. **`stage_diagram` セルを `templateIndex`（配列 index）から `templateId`（ID 参照）に変える。**
   現状は `data.stageTemplates[]` の **index** を持っているので、ひな形を 1 つ消すだけで
   全行の立ち位置図がずれます。Excel でひな形の並びを変えられるようにするなら**必須**。
   - `stageTemplates[]` の要素に `id: string`（`stg_<uuid>`）を足す
   - 読み込み時に一度だけ `templateIndex` → `templateId` へ移す（`splitMultiEntryRows` と同じ「読み込み時 1 回」の場所）
2. **`Date.now()` 由来の id を `genId()` に直す**（同一ミリ秒で 2 つ作ると衝突する）。
   - `ledScenes[].id` … `led_<Date.now()>` → `genId('led')`（`EditorSidebar.tsx:259`）
   - **`blocks[].id` … `blk_${Date.now()}` → `genId('blk')`**（`EditorSidebar.tsx:393`。
     検査 地雷#14 で追加。単発クリックでは衝突しにくいが、**v4 で「よく使う型をまとめて足す」
     導線を作った瞬間に衝突します**）
3. **モバイル編集のセル形ドリフトを先に潰す。** モバイルは `remarks`/`item`/`lighting`/`stage_diagram`/`slide` に
   型を無視して `{entries:[{label}]}` を書き、`led_xr` には誰も読まない `cue` を書いている
   （`CueRowMobileEditor.tsx:39,337`）。**Excel の往復とモバイル編集で書式が食い違うと、
   どちらが正か決められなくなる**ので、Excel 対応より前に直す。

> ⚠️ 1〜3 が済むまでは、`led_xr` と `stage_diagram` の列は**書き出しのみ（ロック）**で出す。
> 「往復できる」と書いておいて壊れるほうが害が大きい。
>
> ⚠️ **これは「11型のうち2型が Excel で往復しない版で実装が確定する」ことを意味します。**
> したがって [`00-datamodel-fixes.md`](00-datamodel-fixes.md) は
> **v4.1 の最初の PR**（Excel より前）に置いてください。順序が逆になると、
> 往復しない版が本番に出て「11型は減らさない」という条件が実質破れます。

---

## 5. テンプレ .xlsx の設計（ここが「工夫して」と名指しされた部分）

### 5-1. テンプレは 2 種類、生成器は 1 つ

| 種類 | 何が入っているか | 使う場面 |
| --- | --- | --- |
| **空のひな形** | 記入例シート・各シートの見出し・入力規則・書式のみ。データ行 0（＋記入例 3 行） | 新しい台本を Excel から起こす |
| **今の台本そのもの** | 上に加えて現在の全データ | 既存台本を Excel で一括修正する（**利用者の主用途**） |

**同じ生成器**（`buildQsheetWorkbook(doc, { empty })`）から出します。別々に作ると必ず食い違うため。

### 5-2. ヘッダの作り（2 行ヘッダ）

```
1 行目  日本語見出し     太字・背景色・ウィンドウ枠固定の上側        （人が読む）
2 行目  機械キー         行を非表示（row.hidden = true）             （プログラムが読む）
3 行目〜 データ
```

- 列を消す → 機械キーも一緒に消える → 取込側は「その列は無い＝**変更しない**」と扱う（消さない）
- 列を並べ替える → 機械キーも一緒に動く → **そのまま当たる**
- 1 行目の見出しを日本語で書き換える → **機械キーが残っているので当たる**
- 2 行目ごと消された → 隠しシート `_schema` の列一覧 → 日本語見出し → 手動マッピング、と段を下げる（§8-3）

> **なぜ隠しシートだけにしないか**: 隠しシートは「列がどこにあるか」を位置で持つので、
> 列を 1 本消された瞬間に全部ずれます。**キーを列そのものに貼る**ほうが壊れない。

### 5-3. 各シートの目印（シート名を変えられても追う）

各シートの **A2 セル（機械キー行の先頭）** に `#sheet:script` のような目印を入れる。
読み取り側はこの目印でシートを識別し、無ければシート名で探す。
利用者がシートを日本語名でリネームしても取込が通る。

### 5-4. セル書式（Excel 側の事故を止める）

| 対象 | 書式 | 理由 |
| --- | --- | --- |
| **尺** 列 | `numFmt: '@'`（文字列） | `0:30` が時刻型に化けて `0:30:00` になるのを止める。**これをやらないと往復しない** |
| 日付（放送日・収録日・リハ日） | `@` | DB 側が `broadcast_date TEXT` で、日付型にするとタイムゾーンで 1 日ずれる |
| ID・所属ロールID・通し# | `@` ＋ グレー文字 ＋ **ロック** | 触らせない |
| 本文（`scenario:本文`） | `alignment: { wrapText: true, vertical: 'top' }`、幅 60 | 台本本文は長い |
| Ch 番号 | `0`（整数） | |
| すべてのシート | `views: [{ state:'frozen', xSplit: 4, ySplit: 2 }]` | 見出しと ID 列を常に表示 |
| 進行台本シート | **オートフィルタを付けない** | 並べ替えられると行の順序＝台本の順序が壊れる。記入例シートに赤字で明記 |

### 5-5. 入力規則（ドロップダウン）

元データは `マスター` シートと各定義シートに置き、**定義名**で参照する（古い Excel でも別シート参照が効く）。

| 列 | 選択肢 | 元 |
| --- | --- | --- |
| 種別 | ロール / 行 / CM / VTR / 改ページ | 固定 |
| 色 | なし / 黄 / 桃 / 水 / 緑 / 灰 | 固定（→ §5-8） |
| `scenario:話者` | 話者一覧 | `マスター!$A` → 定義名 `話者一覧` |
| `scenario:Q` | ○ | 固定 |
| `video/audio/telop:ID` | 各 ID 一覧 | `マスター!$B/$C/$D` |
| マイク香盤 `状態` | ON / STBY / OFF | 固定 |
| マイク香盤 `人` | 話者一覧 | `マスター!$A` |
| マイク香盤 `マイク種別` | マイク種別一覧 | `マスター!$E` |
| `led_xr:シーン` | LED シーン名 | `LEDシーン!$B` → 定義名 `LEDシーン名` |
| `led_xr:Cue` | V明け / Qワード / 卓D | 固定・**`allowBlank:true` かつ `showErrorMessage:false`** |
| `led_xr:トランジション` | F.I. / C.I. | 同上 |
| `stage_diagram:ひな形` | ひな形名 | `立ち位置図ひな形!$B` |
| 立ち位置図の要素 `種類` | 人 / 四角 | 固定 |

> **`showErrorMessage:false` にする列がある理由**: `cueType` は `custom` を許すので、
> 一覧に無い文字を入れられないと機能が減ってしまう。**選択肢は「よく使う値の近道」であって
> 制約ではない**列を分けて設計する（上表で明示した 2 列）。

### 5-6. シート保護

- `worksheet.protect(undefined, { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true })`
- 既定で全セルがロックなので、**編集させる列だけ `cell.protection = { locked: false }`** にする
- **パスワードは付けない**（利用者が必要なら外せる。付けると「触れない！」という問い合わせが増えるだけで、保護は事故防止であってセキュリティではない）

### 5-7. 記入例シート（`example`）

単なるサンプル行ではなく、**この設計で分かっている罠を先に書く**。

1. 「**尺は文字列で入れてください。** `1:30` / `90` / `0:01:30` が使えます。Excel が時刻に変えてしまった場合はセル書式を『文字列』に戻してから入力し直してください」
2. 「**CM は種別列で `CM` を選んでください。** ロール名が『CMあけトーク』でも CM 行にはなりません」（今の CSV は名前が `CM` で始まるだけで CM 行に化ける）
3. 「**ID 列を消さないでください。** 消すと『新しい行』として増えます（元の行は残ります）」
4. 「**列を消しても構いません。** 消した列の内容は変更されません（消えません）」
5. 「**行を並べ替えるときは行ごと切り取り／挿入**してください。オートフィルタでの並べ替えは付けていません」
6. 「**画像はここでは変えられません。** 画像の追加・差し替えはアプリの画面で行ってください」
7. 「**新しい行を追加するときは ID 列を空**にしてください。マイク香盤シートからその行を指したいときだけ、自分で覚えやすい名前（例 `新1`）を入れてください」
8. サンプル: ロール 1 本＋行 3 本＋CM 1 本＋VTR 1 本（＝全種別が 1 回ずつ出る）

### 5-8. 色の扱い

`scenario` の `highlight` は CSS 色文字列で、実際には**行全体の背景色**として使われています（`CueRow.tsx:397`）。
そこで Excel では**行の属性**として `色` 列に置き、名前で表します。

```
なし → ''         黄 → #FEF3C7    桃 → #FCE7F3
水   → #DBEAFE    緑 → #DCFCE7    灰 → #F3F4F6
```

- 書き出し: 既知の色は名前、未知の色は**元の文字列をそのまま**書く（往復させるため）
- 取込: 名前なら対応する値、`#` で始まればそのまま、それ以外は警告して無視
- **セル自体にもその色で背景を塗る**（Excel 上でも同じ見た目になる。往復には使わない、見た目だけ）

---

## 6. 進行台本シートの列（固定列）

| 機械キー | 日本語見出し | 幅 | 書式 | 保護 | 意味 |
| --- | --- | --- | --- | --- | --- |
| `kind` | 種別 | 8 | `@` | 編集可 | `ロール` / `行` / `CM` / `VTR` / `改ページ` |
| `id` | ID | 16 | `@` | **ロック** | `sec_…` / `row_…`。**空＝新規**。ファイル内の参照キーも兼ねる |
| `parentId` | 所属ロールID | 16 | `@` | **ロック** | 種別=行 のとき、上のロールの ID。並べ替えへの保険 |
| `no` | 通し# | 6 | `0` | **ロック** | 表示専用（取込では読まない） |
| `name` | ロール名 | 24 | `@` | 編集可 | 種別=ロール/CM/VTR のとき使う |
| `dur` | 尺 | 8 | `@` | 編集可 | ロールなら `section.duration`、行なら `row.duration` |
| `rowLabel` | 行ラベル | 16 | `@` | 編集可 | `row.label` |
| `color` | 色 | 8 | `@` | 編集可 | §5-8 |

**行の並び順が正**。ロール行の下に並んだ「行」がそのロールに属する。
`parentId` は保険で、**食い違ったときは並び順を優先**し、dry_run で警告する
（利用者が意図して行を別ロールへ移した、という読みが自然なため）。

### 6-1. 種別ごとの意味

| 種別 | セクションの形 | 備考 |
| --- | --- | --- |
| `ロール` | `{ id, label, duration, rows: [...] }` | 続く「行」を集める |
| `行` | `{ id, duration, label, cells }` | 直前のロールに属する |
| `CM` | `{ id, label, duration, _break: true, rows: [] }` | 名前が空なら `CM` |
| `VTR` | `{ id, label, duration, _vtr: true, rows: [] }` | |
| `改ページ` | `{ id, _pageBreak: true }` | 他の列は無視 |

**`_pageBreak` が Excel に出るのは今回が初めて**です（CSV は両方とも落としていた）。

---

## 7. 各シートの列定義

### 7-1. 台本情報（`info`）— キー / 値の 2 列

| キー（ロック） | 値 | 対応 | 往復 |
| --- | --- | --- | --- |
| タイトル | | `qsheet_documents.title` ＋ `meta.title` | ○ |
| 稿種別 | | `meta.draftType`（**`連番` / `準備稿` / `決定稿`**） | ○ 入力規則 |
| 稿番号 | | `meta.draftNumber` | ○ |
| 放送日 | | `meta.broadcastDate` ＋ 列 `broadcast_date` | ○ |
| 収録日 | | `meta.recordingDate` | ○ |
| リハーサル日 | | `meta.rehearsalDate` | ○ |
| 場所 | | `meta.location` | ○ |
| 作成者 | | `meta.author` | ○ |
| 台本開始時刻 | | `meta.startTime` | ○ |
| 放送開始時刻 | | `meta.broadcastStartTime` | ○ |
| 状態 | | `qsheet_documents.status`（下書き/リハ/本番/保管） | ○ 入力規則 |
| 更新日時 | | `updated_at` | **× ロック** |
| 資料番号 | | `doc_no`（`01-app-structure.md` §2-2） | **× ロック** |
| 台本ID | | `qsheet_documents.id` | **× ロック**（**取込先の照合に使う**） |

> **`meta` が往復するのは今回が初めて**です（CSV には列自体が無く、全部落ちていた）。

⚠️ **稿種別の入力規則を直しました（検査 整合#14）。** 初版は選択肢を
`準備稿 / 決定稿 / 第N稿` にしていましたが、実装は
`meta.draftType ∈ { 'numbered', '準備稿', '決定稿' }` ＋ `meta.draftNumber` で、
**「第3稿」は表示のための計算結果**です（`EditorPage.tsx:510-512`）。
`第3稿` という生値を取り込むと `draftType='第3稿'` になり、
**`EditorPage.tsx:488` の「`numbered` のとき稿番号を +1 する」が黙って効かなくなります**
（`docs/wording.md` が社内語として定義した『稿を上げる』が壊れる）。

→ 選択肢は **`連番` / `準備稿` / `決定稿`**。生値との対応表（`連番 ↔ numbered`）は
`_schema` シートに持たせる（§5-8 の色と同じ持ち方）。
`meta.draft` は型に残っているだけで誰も読み書きしていないので、**Excel に出しません。**

⚠️ **`DocumentData` の外にある列を誰が書き戻すか（検査 機能#H3）。**
この表は `title` / `broadcast_date` / `status` を「○ 往復」としていますが、
§8-1 の適用は `data` にしか触れません。**決め:**

- 取込の適用が成功したあと、クライアントが **`PUT /qsheet/documents/:id` を1回**
  投げる（`title` / `broadcast_date` / `status` / `project_id` / `episode_id`）。
  失敗したら `data` 側も undo（§9-4）して「取り込めませんでした」を出す。
- ⚠️ **`status` は現行の PUT が不正値を黙って `'draft'` に落とします**（04 §0）。
  Excel の入力規則を `下書き / リハ / 本番 / 保管` に固定し、
  **対応表を `_schema` に持つ**（`下書き ↔ draft`）。対応が取れない値は
  dry_run でエラーにして**取り込まない**（黙って `draft` に落とさない）。

### 7-2. マイク香盤（`mic`）

| 機械キー | 見出し | 保護 | 意味 |
| --- | --- | --- | --- |
| `rowId` | 行ID | 編集可 | 進行台本シートの `id` 列の値と一致させる（新規行なら自分で付けた名前） |
| `rowRef` | 行の目印 | ロック | 「第1部 / 3行目 / オープニング…」（人が見て分かるように） |
| `blockKey` | 列 | ロック | `blk.audio_mic#1`（マイク香盤ブロックが 2 本あるとき用） |
| `ch` | Ch | 編集可 | 整数 |
| `state` | 状態 | 編集可 | ON / STBY / **OFF**（← 今の CSV では表現できない） |
| `person` | 人 | 編集可 | 入力規則: 話者一覧 |
| `micType` | マイク種別 | 編集可 | 入力規則: マイク種別一覧 |

- 1 行 = 1 割当。`rowId` でグルーピングして `{ assignments: [...] }` を組み立てる（Ch 昇順）
- **`/` を含む人名・マイク種別が壊れない**（今の CSV は `" / "` 区切りの 1 セル詰めなので壊れる）
- `rowId` が解決できない行 → dry_run でエラー行として出し、取込しない

### 7-3. マイクCh（`micch`）

| `ch` | Ch |（整数・必須）
| `label` | ラベル |

`masters.micChannels` に往復。**これで「CSV に Ch5 があっても画面に出ない」が直ります**
（`MicAssignmentCell` は `masters.micChannels` が空だと Ch1〜4 しか描かない）。

### 7-4. LEDシーン（`led`）

| `id` | シーンID | ロック・空＝新規 |
| `name` | シーン名 | 必須・**台本内で一意**（重複はエラー） |
| `wall` | 壁 |
| `floor` | 床 |

進行台本シートの `led_xr:シーン` 列は**この `name` で引き当てる**。名前が見つからないときは
dry_run で「新しいシーンとして作る / 空にする」を選ばせる（既定は**作る**）。

### 7-5. 立ち位置図ひな形（`stage`）／立ち位置図の要素（`stagepos`）

**ひな形**

| `id` | ひな形ID | ロック・空＝新規 |
| `name` | ひな形名 | 必須・一意 |
| `count` | 要素数 | ロック（表示専用） |

**要素**

| `templateId` | ひな形ID | ひな形シートの `id`（または `name`）と一致 |
| `type` | 種類 | 人 / 四角（入力規則） |
| `label` | ラベル | |
| `x` | X | 0〜800（整数） |
| `y` | Y | 0〜600（整数） |
| `r` | 半径 | 種類=人 のとき（既定 40） |
| `w` | 幅 | 種類=四角 のとき（既定 160） |
| `h` | 高さ | 種類=四角 のとき（既定 50） |

座標系は 800 × 600（`StageEditor.tsx:16` の実装どおり）。**立ち位置図は Excel で完全に作れる**ようになります。
範囲外の座標は dry_run で警告し、クランプする。

### 7-6. マスター（`masters`）— 5 列の縦リスト

| A 話者 | B 映像ID | C 音声ID | D テロップID | E マイク種別 |

`data.masters` に往復。**ドロップダウンの元**でもある（定義名で 500 行分の範囲を張る）。

取込での自動追加は **`video` / `audio` / `telop` の3種類だけ**にします。

⚠️ **`persons` と `micTypes` を自動で足さないのは、認証なしの公開URLに漏れるからです**
（検査 地雷#17）。`/qsheet/documents/:id/public-audio` は
**`masters.persons` と `masters.micTypes` をそのまま全件返します**
（`public-audio.routes.ts` の payload。認証なし・migration 209 で失効カラムが DROP 済みで
**取り消せない**）。Excel に書いた名前が、URL を知る全員に見えるようになります。

- `persons` / `micTypes` は dry_run で**明示のチェック**にする（既定は外す）。
- あわせて、**公開エンドポイントが返す `persons` を「その台本のマイク香盤に実際に
  出てくる名前だけ」に絞る改修**を [`07-onair-roles.md`](07-onair-roles.md) §4 が引き取りました
  （02 §9-4 の「失効できない公開URL」と同じ課題）。

### 7-7. 画像（`images`）— 読み取り専用

| `rowId` | 行ID | | `blockKey` | 列 | | `file` | ファイル名 | | `note` | 備考 |

取込では**読み飛ばす**。参照の差し替えは進行台本シートの `:画像` 列で行う。

### 7-8. `_schema`（`veryHidden`）

| キー | 値の例 |
| --- | --- |
| `schemaVersion` | `1` |
| `appVersion` | `4.2.0` |
| `documentId` | `abc-…`（取込先の照合） |
| `exportedAt` | `2026-08-21T09:00:00.000Z` |
| `exportedBy` | ユーザーID |
| `blocks` | JSON 文字列 `[{ key:'blk.scenario#1', blockId:'scenario', type:'scenario', label:'台本' }, …]` |
| `sheets` | JSON 文字列 `{ script:'進行台本', mic:'マイク香盤', … }` |
| `colors` | JSON 文字列（§5-8 の対応表） |

**`schemaVersion` が上がったら**: 取込側は 1 つ前まで読めるようにし（`v1` は永久に読む）、
読めない版は「新しい版のファイルです。書き出し直してください」で止める。

---

## 8. 取込の設計

### 8-1. 全体の流れ（なぜサーバーが DB を直接書かないか）

```
① クライアント: ファイルを選ぶ
      POST /qsheet/documents/:id/excel/parse     (multipart: file)
② サーバー: 解析して「何が入っていたか」を返す（まだ何も変えない）
      → { parseId, detected, mapping, warnings }
③ クライアント: 列マッピング UI で対応づけを確認・修正、モードを選ぶ
      POST /qsheet/documents/:id/excel/plan      (JSON: parseId, mapping, mode, current)
④ サーバー: current（クライアントが持っている最新のデータ）に取込内容を合成し、
   差分（追加/更新/据え置き/退避/エラー）と **適用後の完全なデータ** を返す。
   同時に qsheet_import_batches へ before_data 付きで記録し batchId を返す
      → { batchId, summary, rows[], data }
⑤ クライアント: 差分を確認して「取り込む」
   → **既存の編集と同じ経路** applyDataUpdate(ydoc, prev => applyOps(prev, plan.ops)) で適用
      POST /qsheet/documents/:id/excel/batches/:batchId/applied   (適用済みを記録)
⑥ 取り消したくなったら
      POST /qsheet/documents/:id/excel/batches/:batchId/undo → before_data を返す
   → クライアントが同じく applyDataUpdate で戻す
```

**サーバーが `qsheet_documents.data` を直接 UPDATE しない理由（2 つとも実装上の事実）**

1. **collab に上書きされて消える。** `collab.ts` の `persist` は Y state を保存するたびに
   `qsheet_documents.data` を**丸ごと書き戻し**ます。誰かがエディタを開いていれば、
   サーバーが JSONB に書いた取込結果は次の debounce（3 秒）で消えます。
2. **id の安全網がクライアントにしかない。** `applyDataUpdate` は
   `ops.backfillIds` → `yDocToData` → `ensureStableIds(updater(prev))` の**順序が固定**で、
   ここを通さないと差分器が「全部新規」と判定して行が倍々に増えます（実測 3→769→100万行）。
   差分器 `ydocDiff.ts` / `ydocOps.ts` は `client-qsheet` にしかありません。

#### ⚠️ **`updater` は必ず `prev` の関数にすること（検査 地雷#1・P0）**

初版は `applyDataUpdate(ydoc, () => plan.data)` と書いていました。**これは同時編集で
入った行を黙って削除します。**

`applyDataUpdate` は `prev` を**その瞬間の Y.Doc** から読みます（`ydocDiff.ts` の
`applyDataUpdate`）。一方 `plan.data` は**クライアントが `plan` を要求したときに送った
`current` から合成された固定スナップショット**です。parse → マッピング確認 → 下見 →
「取り込む」の間に他人（**あるいは自分の別タブ・スマホ**）が足した行は `plan.data` に
存在しないので、`diffRows` の削除分岐に落ちて `ops.deleteRow` されます。

**`merge` の約束「ファイルに無い既存行はそのまま残す」は `current` 相対でしか成立しません。**
§8-6 の「2人以上なら警告」では防げません（自分の別タブで起きるため）。

**決め: `plan` は「完全な `data`」ではなく、id をキーにした操作リストを返す。**

```ts
type PlanOp =
  | { op: 'update_row';     sectionId: string; rowId: string; set: Partial<CueRow> }
  | { op: 'add_row';        sectionId: string; afterRowId: string | null; row: CueRow }
  | { op: 'trash_row';      sectionId: string; rowId: string }
  | { op: 'update_section'; sectionId: string; set: Partial<Section> }
  | { op: 'add_section';    afterSectionId: string | null; section: Section }
  | { op: 'trash_section';  sectionId: string }
  | { op: 'set_extra';      key: 'masters' | 'ledScenes' | 'stageTemplates' | 'meta'; value: unknown };
```

適用は `applyDataUpdate(ydoc, prev => applyOps(prev, plan.ops))`。
**`applyOps` は `client-qsheet/src/lib/excel/applyPlan.ts` に置く純関数**で、
`prev` に無い `rowId` の `update_row` は**黙って飛ばす**（消された行を復活させない）。

**妥協案（工数が惜しい場合）**: `plan` が `base_fingerprint`（全 section/row id の
順序付きハッシュ）を返し、適用直前に `yDocToData(ydoc)` から同じ指紋を計算して
**不一致なら適用させず再 plan を促す**。`plan.data` を返す形は残せますが、
**他人が1行足しただけで取り込みがやり直しになる**ので、操作リストのほうが実用的です。

⚠️ **同じ規約が 04-ai.md の `lib/applyProposal.ts` にも掛かります。**
04 §12 は「`applyDataUpdate` の3手順を崩さない」としか書いておらず、
**updater が `prev` を無視した定数を返してよいか**を規定していませんでした。
04 側にも明記しました。

> **検討して捨てた案**: サーバーが `qsheetRooms` の Y.Doc を直接いじる。
> `roomManager` に `mutate()` を足し、`ydocDiff`/`ydocOps` をサーバーへ複製し、
> `check-collab-parity.mjs` の対を増やせば可能です。しかし **同時編集の中核をもう 2 ファイル複製する**
> コストに対して、得るものが「エディタを開いていなくても取り込める」だけなので、今回は採らない。
> （取込は現状もエディタ画面からしか行わない。）

### 8-2. 取込モード

| モード | ファイルに**ある**行 | ファイルに**無い**既存行 | 用途 |
| --- | --- | --- | --- |
| **`merge`（既定）** | ID 一致＝更新 / 空・未知＝追加 | **そのまま残す** | 一部だけ直したファイルを戻す |
| `sync` | 同上 | **削除し、取消は `qsheet_import_batches` から**（下の ⚠️） | Excel 側を完全な正として揃える |
| `append` | **全部追加**（ID は読まない） | そのまま残す | 別の台本から章をまるごと持ってくる |

- **`replace` は作りません。**（今の CSV の `replace` は、列名を 1 文字変えただけで
  その列の中身が台本全体から消え、スナップショットも取っていない。）
- **`sync` で 1 件でも消える行があるときは、確認チェックボックスを必須**にする。

⚠️ **`sync` の退避先を `data.trash` から変えました（検査 地雷#11）。** 理由は2つとも実装上の事実です:

1. **Yjs が太る。** `trash` は `data` のトップレベル extra なので、`ydocDiff` は変化のたびに
   **`setExtra` で配列まるごと置換**します。100 行退避すると、3 秒ごとに書かれる
   `qsheet_doc_yjs.state`（BYTEA・**1文書1行の全体スナップショット**）に丸ごと乗り、
   Yjs はトゥームストーンを残すので**縮みません。**
2. **復元で id が重複する。** `makeTrashItem` は payload を **`id` ごと deep copy** します
   （`lib/trash.ts`）。取込で同じ id の行が復活したあとに復元すると `sections` に
   同じ id が 2 つ並び、`keyById` が片方を握りつぶして差分が壊れます。
   §8-5 の 3 つのアサートは `plan` の中身しか見ないので**検知できません。**

→ **`sync` の取消は `qsheet_import_batches.before_data`（既に全文を持っている）＋
ワンクリック取消（§9-4）で行います。** ゴミ箱（`TrashDrawer`）は
**人が画面で消したもの専用**として残します（機能は落としません。
[`06-editor.md`](06-editor.md) §5）。

**それでも `trash` を使いたい場合**は (a) 復元時に `genId()` で id を採り直す、
(b) 1 回の取込で退避できる件数に上限を置く、の両方を必ず実装すること。
なお §11-2 #8 の「要望が無ければ最初は `merge` と `append` だけ」を採るのが
いちばん一貫します。

### 8-3. 列の対応づけ（マッピングの段）

上から順に試し、当たった時点で確定する。

| 段 | 方法 | いつ効くか |
| --- | --- | --- |
| ① | `_schema` の `documentId` が取込先と一致 → `blocks` の `blockId` で確定 | 自分の台本を書き出して戻したとき（**いちばん普通の使い方**） |
| ①' | ①で `blockId` が**現在の台本に無い**（書き出し後に列を消した／作り直した） → **`status:'missing'` にして `unmatchedHeaders` へ落とし、手動割り当てに回す** | 検査（機能#M2・地雷#13）で追加 |
| ② | 2 行目の機械キー `blk.<type>#<n>.<field>`。**同型かつ同ラベル**（`_schema.blocks[].label`）が一致したときだけ序数を信じる | 他の台本のファイル・列を並べ替えた・見出しを日本語で書き換えた |
| ③ | 1 行目の日本語見出しを NFKC 正規化して完全一致（`normalizeHeader` と同じ規則） | 機械キー行を消された |
| ④ | 見出しから記号・括弧・空白を落として一致（`オーディオ (BGM/SE)` → `オーディオbgmse`） | 手で作り直したファイル |
| ⑤ | **手動マッピング UI** | 他社フォーマットの台本を持ってきたとき |

**判定結果は 3 分類**して UI に出す（機材の `ExcelImportDialog` の作りに揃える）:

| 表示 | 意味 | 取込への影響 |
| --- | --- | --- |
| ✓ 一致 | 列 → ブロック が決まった | 更新する |
| — 見つからない | この台本のブロックに対応する列がファイルに無い | **既存値を変更しない**（消さない） |
| ⚠ 無視される列 | ファイルにあるが対応先が決まらない | 何もしない。**手動で割り当てられる** |

⚠️ **序数キーは「列を消されると別の列に書き込む」（検査 機能#M2・地雷#13）。**
`blk.<type>#<n>` の `<n>` は「その型の何番目か」なので、**同型の前のブロックを消すと繰り上がり、
`blk.scenario#2` の中身が `blk.scenario#1` に入ります。**
編集画面には列の並べ替え（`CueTable.tsx:788-802`）も列の削除も実在します。
そこで **①で `blockId` が現存しなければ段②に落とさず `missing` にする**（上表 ①'）、
**②の序数一致は dry_run で必ず警告を出す**、の2つを入れます。
**序数で当てるのは最後の手段**で、黙って当てないのが肝です。

**手動マッピング UI は作ります。** 機材の実装（`Select` を 1 列ずつ並べ、`__none__` で明示スキップ）
とほぼ同じで、`mapping: Record<機械キー, Excelの列見出し | null>` をそのまま `plan` に渡す。
「他社フォーマットの台本を Excel で受け取る」が主用途なら、ここが機能の中心になります（→ §12）。

### 8-4. 文字コード（CSV のとき）

`.xlsx` は zip 内が UTF-8 なので問題なし。`.csv` のときだけ次の順で判定する。

1. UTF-8 BOM（`EF BB BF`）がある → UTF-8
2. UTF-16 BOM → UTF-16
3. UTF-8 として厳格デコードできる（`new TextDecoder('utf-8', { fatal: true })` が例外を投げない）→ UTF-8
4. それ以外 → **CP932**（`new TextDecoder('shift_jis')`）

Node の `TextDecoder` は full-ICU が要ります。**`node:20-alpine` に full-ICU が入っているかは着手時に必ず確かめる**
（確認: `docker run --rm node:20-alpine node -e "console.log(new TextDecoder('shift_jis').decode(Buffer.from([0x93,0x8c,0x8b,0x9e])))"` が `東京` を出すか）。
出なければ `--with-intl=full-icu` のイメージに替えるか、CP932 のみ自前変換表を同梱する。→ §11-2。

### 8-5. id の生成規則（**地雷を踏まないための決めごと**）

```
進行台本シートの ID 列の値 v について:

  v が既存の section.id / row.id と完全一致  → その要素を更新（id は温存）
  v が空                                     → 新規。sec_<uuid> / row_<uuid> を採る
  v が既存に無い文字列                       → 新規。sec_<uuid> / row_<uuid> を採る
                                                （v は「ファイル内の参照キー」としてのみ使う）
  v がファイル内で重複                       → **エラーで取込を止める**
```

- 採番は **サーバー**が `crypto.randomUUID()` で行い、`sec_<uuid>` / `row_<uuid>` の**既存規約に完全に揃える**
  （`server/src/contexts/qsheet/collab.ts` の `backfillIds` と同じ書式）。
- `plan.data` は**全 section / 全 row に id が入った完全なデータ**として返す。
  クライアントは `applyDataUpdate` に渡すだけ。`ensureStableIds` は二重の安全網として通るが、
  そこで何も足されないのが正常。
- **サーバー側で 3 つをアサートし、破れば 422 で止める**（`plan` を返さない）:
  1. 全 section / 全 row に `id` がある
  2. `id` に重複が無い
  3. 行数が `current` の行数 × 10 ＋ 1000 を超えていない（**指数的複製の早期検知**。
     3→769→100万行の再発を、症状が出る前に止める）
- **これらを `shared/tests/` の Vitest で固定する**（既存の `qsheetCsvImport.test.ts` と同じ役目）。
  - 「同じファイルを 2 回取り込んでも行数が増えない」（冪等性）
  - 「ID を保った往復（書き出し → 取込）でデータが完全に一致する」（golden ファイル比較）
  - 「ID 列を空にして取り込むと、その行だけ増える」

### 8-6. 順序と、同時編集との関係（正直に書く）

Excel の並び順を正として既存行を並べ替えると、Yjs 上は **clone(delete + insert)** になり
CRDT の identity を失います（`ydocOps.ts:221`）。**取込と同時に他の人がその行を編集していると、
その編集は取りこぼされます。**

対策（完全には消せないので、見えるようにする）:

- `plan` のレスポンスに「今この台本を開いている人数」を入れ、**2 人以上なら dry_run 画面に警告**を出す
  （人数はソケットの presence（`presenceList(docId)`）から取れる。
  ⚠️ **`presenceList()` は `server/src/contexts/qsheet/socket.ts:28` のモジュール内関数で
  export されていません。export を1つ足す作業が要ります**。検査 地雷#16）
- ⚠️ **この警告は §8-1 の「行が消える」問題の対策にはなりません**（自分の別タブでも起きるため）。
  行の消失は `plan.ops` 方式で構造的に防ぎます。ここで扱っているのは**並べ替えによる
  他人の編集の取りこぼし**だけです。
- 並べ替えが発生する行数を差分サマリに出す（「12 行の並び順が変わります」）
- 記入例シートに「取込は自分ひとりのときに」と書く

### 8-7. 上限

| 対象 | 上限 | 超えたら |
| --- | --- | --- |
| ファイルサイズ | 10MB | 413 |
| 展開後の合計セル数 | 500,000 | 422 |
| 1 シートの行数 | 20,000 | 422 |
| 1 シートの列数 | 300 | 422 |
| `parseId` の保持 | プロセス内 Map・10 分 TTL・1 ユーザー 3 件 | 期限切れは 410（再アップロード） |

`parseId` をプロセス内に持つのは collab と同じ**単一プロセス前提**（`roomManager.ts` の注記）。
複数インスタンス化するときは collab の pub/sub と一緒に見直す。

---

## 9. API

すべて `/api/v1/internal/qsheet` 配下。既存どおり `requireAuth` ＋ `requirePermission('qsheet', …)` に加え、
**`canAccessDoc` を全経路で通す**（権限なしは**403 ではなく 404**。存在秘匿の既存方針に揃える）。

| メソッド | パス | 権限 | 用途 |
| --- | --- | --- | --- |
| POST | `/documents/:id/export` | `qsheet` reader ＋ `canAccessDoc` | .xlsx / .csv 書き出し |
| GET | `/excel/template` | `qsheet` reader | 空のひな形 .xlsx |
| POST | `/documents/:id/excel/parse` | `qsheet` editor ＋ `canAccessDoc` | 解析（変更しない） |
| POST | `/documents/:id/excel/plan` | 同上 | 差分の下見（DB は変えない・batch を作る） |
| POST | `/documents/:id/excel/batches/:batchId/applied` | 同上 | 適用済みを記録 |
| POST | `/documents/:id/excel/batches/:batchId/undo` | 同上 | 取込前の内容を返す |
| GET | `/documents/:id/excel/batches` | 同上 | 取込履歴（直近 20 件） |

### 9-1. 書き出し

```ts
// POST /api/v1/internal/qsheet/documents/:id/export
interface ExportRequest {
  format: 'xlsx' | 'csv';
  /** 省略時は「今の台本」。'empty' なら記入例だけのひな形 */
  content?: 'full' | 'empty';
  /** csv のときは 'script' 固定（CSV は 1 シートしか表せない） */
  sheets?: 'all' | 'script';
  /** 画像のサムネイルを .xlsx に埋め込む（往復しない・確認用）。既定 false */
  embedImages?: boolean;
  /**
   * エディタから呼ぶときは、クライアントが持っている最新のデータを渡す。
   * 省略すると qsheet_documents.data（collab 下では最大 3 秒古い）を使う。
   */
  current?: DocumentData;
}
// 200: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
//      または text/csv; charset=utf-8 (BOM 付き)
// Content-Disposition: attachment; filename*=UTF-8''<タイトル>_<YYYYMMDD>.xlsx
```

> **GET ではなく POST** にしたのは `current` を載せるため。ブラウザから直リンクで落としたい
> 一覧画面などは `current` を省いた POST を `fetch` → `blob` で受ける（`ExcelImportDialog` の
> `responseType: 'blob'` と同じ作りで済む）。

### 9-2. 解析

```ts
// POST /documents/:id/excel/parse   multipart/form-data: file
interface ExcelParseResponse {
  parseId: string;                    // 10 分有効
  source: { kind: 'xlsx' | 'csv'; fileName: string; sizeBytes: number; encoding?: string };
  schema: { version: number | null; documentId: string | null; sameDocument: boolean };
  sheets: { logical: string; name: string; found: boolean; rows: number }[];
  columns: {
    key: string;                      // 機械キー ('blk.scenario#1.text' など)
    label: string;                    // この台本での日本語見出し
    matchedHeader: string | null;     // ファイル側の見出し
    matchedBy: 'schema' | 'machineKey' | 'header' | 'loose' | null;
    status: 'matched' | 'missing';    // missing = 変更しない
  }[];
  unmatchedHeaders: { header: string; columnIndex: number; sample: string[] }[];
  counts: { sections: number; rows: number; breaks: number; vtrs: number; pageBreaks: number };
  warnings: string[];
  errors: string[];                   // 1 件でもあれば plan に進めない
}
```

### 9-3. 下見（dry run）

```ts
// POST /documents/:id/excel/plan   application/json
interface ExcelPlanRequest {
  parseId: string;
  mode: 'merge' | 'sync' | 'append';
  /** 機械キー → ファイル側の見出し。null = 明示スキップ。省略時は parse の自動判定 */
  mapping?: Record<string, string | null>;
  /** クライアントが持っている最新のデータ（Yjs から取ったもの）。必須 */
  current: DocumentData;
  /** LED シーン・立ち位置図ひな形が見つからないときの扱い。既定 'create' */
  onMissingReference?: 'create' | 'blank' | 'error';
}

type RowAction = 'add' | 'update' | 'keep' | 'trash' | 'error';

interface ExcelPlanResponse {
  batchId: string;
  summary: {
    sections: { add: number; update: number; keep: number; trash: number };
    rows:     { add: number; update: number; keep: number; trash: number };
    reordered: number;                // 並び順が変わる行数
    masters:  { persons: number; video: number; audio: number; telop: number; micTypes: number };
    ledScenes: { add: number; update: number };
    stageTemplates: { add: number; update: number };
    errors: number;
  };
  /** 行ごとの下見（先頭 500 件。全件は必要になったら分割取得） */
  entries: {
    sheetRow: number;                 // Excel 上の行番号（利用者が探せるように）
    kind: 'ロール' | '行' | 'CM' | 'VTR' | '改ページ';
    id: string | null;
    action: RowAction;
    ref: string;                      // 「第1部 / 3 / オープニング…」
    changedColumns: string[];         // 日本語見出し
    messages: string[];
  }[];
  /** 適用後の完全なデータ。クライアントはこれを applyDataUpdate に渡す */
  data: DocumentData;
  /** 今この台本を開いている人数（2 以上なら警告） */
  activeEditors: number;
  warnings: string[];
}
```

### 9-4. 適用の記録・取り消し

```ts
// POST /documents/:id/excel/batches/:batchId/applied
interface AppliedRequest { after: DocumentData }
interface AppliedResponse { batchId: string; appliedAt: string }

// POST /documents/:id/excel/batches/:batchId/undo
// 24 時間以内・その台本で最後に適用された batch のみ（それ以外は 409）
interface UndoResponse { batchId: string; data: DocumentData }   // = before_data
```

---

## 10. DDL

```sql
-- 21x_qsheet_import_batches.sql
-- ⚠️ 番号は README.md の採番表が正（設計書5本が 211・212 を取り合っている。
--    migrate.ts はファイル名順に流すだけなので CI は落ちず、黙って想定と違う順で流れる）

CREATE TABLE IF NOT EXISTS qsheet_import_batches (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  mode            TEXT NOT NULL CHECK (mode IN ('merge','sync','append')),
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('xlsx','csv')),
  file_name       TEXT NOT NULL DEFAULT '',
  file_size       INTEGER NOT NULL DEFAULT 0,
  file_sha256     TEXT,                       -- 同じファイルの二重取込に気づくため
  schema_version  INTEGER,                    -- _schema シートの版 (無ければ NULL)
  mapping         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- 機械キー → 見出し
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- ExcelPlanResponse.summary
  before_data     JSONB NOT NULL,             -- 取込直前の data 全文 (**切り詰めない**)
  after_data      JSONB,                      -- 適用後の data 全文 (下見のみなら NULL)
  applied_at      TIMESTAMPTZ,                -- NULL = 下見しただけ
  undone_at       TIMESTAMPTZ,
  created_by      TEXT REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qsheet_import_batches_doc
  ON qsheet_import_batches (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qsheet_import_batches_applied
  ON qsheet_import_batches (document_id, applied_at DESC) WHERE applied_at IS NOT NULL;
```

- **`TIMESTAMPTZ` を使います。** `qsheet_documents` は `TIMESTAMP`（tz なし）ですが、
  `qsheet_doc_yjs` は `TIMESTAMPTZ` で既に食い違っています。新しい表は正しいほうに揃える。
- **保持**: ⚠️ **実サイズを測るまでは「適用済み 10 件・下見は 3 日」から始めます**（検査 地雷#22）。
  この表は `before_data` ＋ `after_data` で **1 回の取込あたり台本 2 本ぶんの JSONB** を持ちます。
  初版の「適用済み 90 日・直近 20 件」だと **40 本ぶん**になり、
  §11-2 #3 で自分が「実サイズ未測」と書いているとおり**測る前に本番で膨らみます。**
  `SELECT pg_column_size(data) FROM qsheet_documents ORDER BY 1 DESC LIMIT 10` を測ってから
  90 日 / 20 件に緩める。
- **`before_data` を切り詰めない**のは、取り消しに全文が要るからです。
  台本 1 本の JSONB がどれくらいになるかの実測が無いので、上限は未確定（→ §11-1）。

**この表が持つ「人の直し」の記録について**: 取込は AI 機能ではないので
「AIを使い捨てにしない」原則の適用対象ではありません。ただし将来 AI が台本を下書きするなら、
`before_data` / `after_data` の対は**そのまま人間の修正差分**になります。
`ai_corrections` に寄せるかどうかは AI 機能を作るときに決める（今は決めない）。

---

## 11. 未確定の判断と、そう判断した根拠（迷ったところ）

### 11-1. 迷って、こう決めた

| # | 判断 | 根拠 | 迷い |
| --- | --- | --- | --- |
| 1 | ID 列を**表に出す**（隠さない） | 隠すと利用者が知らずに行を作り直してしまう。表に出してロックし、記入例で説明するほうが事故が少ない | 業務用の表に `row_7f3a…` が並ぶのは見た目が悪い。**短い表示用 ID（`R0001`）に置き換える案**も考えたが、二重の対応表を持つことになるので採らなかった |
| 2 | マイク香盤を**別シート**にする | 1 セル詰めは `/` や `OFF` で現に壊れている。Ch 数が可変なので列にも展開できない | 「1 行の情報が 2 シートに分かれる」のは Excel では扱いにくい。**Ch1〜4 だけメインシートに列展開**する折衷案もあり得る（→ 利用者に確認） |
| 3 | 画像は**往復させない** | `.xlsx` 埋め込み画像はマジックバイト検証・サイズ上限・ハッシュ命名の既存経路を通らない。任意ファイル投入口になる | 「Excel で画像を貼りたい」と言われる可能性は高い。その場合は**取込時にサーバーが `upload.routes.ts` と同じ検証を通して保存**する経路を足せば実現できる（作れる。今回はやらない、というだけ） |
| 4 | サーバーが DB を直接書かず**クライアントが適用**する | collab の `persist` が JSONB を上書きする／id の安全網がクライアントにしかない（§8-1） | エディタを開いていないと取り込めない。一覧から直接取り込みたいと言われたら、`roomManager.mutate()` ＋ 差分器のサーバー複製が要る |
| 5 | `replace` を**廃止**する | 列が 1 本欠けただけで台本全体からその列が消える。スナップショットも無い | 今の既定は `append` なので、`replace` を使っている人はそもそも少ないはず（未確認） |
| 6 | 書き出しを**全部サーバー**に寄せる | 「CSV が 2 本あって出力が違う」を構造的に消せる | エディタで編集中の内容を出すのに `current` を POST で送る必要があり、大きい台本ではリクエストが重くなる |
| 7 | ドロップダウンの一部を**制約にしない**（`showErrorMessage:false`） | `cueType`/`transition` は `custom` を許す仕様。制約にすると機能が減る | 打ち間違いは防げない。dry_run の警告で拾う |
| 8 | シート保護に**パスワードを付けない** | 保護は事故防止であってセキュリティではない。付けると「編集できない」の問い合わせが増える | 何も知らずに ID 列を消す人は止められない |
| 9 | `led_xr` / `stage_diagram` を**名前参照**にする | ID・index 参照は Excel 上で人が扱えない。名前なら書ける・読める | 名前を変えると別物として扱われる（ID 列があるので、ID を保てば改名は往復する） |
| 10 | 移行番号 **213** | 210 まで使用済み・211/212 は `01-app-structure.md` が予約 | 着手順で入れ替わる。**着手時に最大＋1 に振り直す** |

### 11-2. まだ決まっていない・着手前に確かめること

| # | 未確定 | 確かめかた |
| --- | --- | --- |
| 1 | **`node:20-alpine` に full-ICU が入っているか**（CP932 の CSV を読むのに要る） | §8-4 の `docker run` 一行。入っていなければ CP932 の変換表を同梱するか、CSV 取込を UTF-8 のみに割り切る |
| 2 | **`exceljs` を足してよいか**（サーバーに Excel ライブラリが 2 つになる） | `npm audit` の結果と、既存 `xlsx` 経路の移行コストを見て判断。全面移行なら別 PR |
| 3 | **`before_data` の実サイズ** | 本番の `SELECT pg_column_size(data) FROM qsheet_documents ORDER BY 1 DESC LIMIT 10`。数 MB を超えるなら上限と圧縮を決める |
| 4 | **`stageTemplates` の index → id 移行**（§4-4） | → [`00-datamodel-fixes.md`](00-datamodel-fixes.md) §1 が引き取りました。**これが済むまで `stage_diagram` は書き出しのみ** |
| 5 | **`slide` に編集 UI が無い**（今は幽霊型） | → [`06-editor.md`](06-editor.md) §3 が引き取りました。**既存の `/qsheet/upload-image` 経路をそのまま流用して `slide` セルを作る**のが既定です（作らないと「11型を1つも減らさない」が実質破れます） |
| 6 | **モバイル／PC のセル形ドリフト**（§4-4-3） | → [`00-datamodel-fixes.md`](00-datamodel-fixes.md) §2。**PC の形を正**とし、Excel の往復より先に潰す |
| 11 | **印刷／PDF の出力が2本あるまま** | → [`06-editor.md`](06-editor.md) §6。この文書は書き出しを xlsx/csv に一本化したのに**印刷に一言も触れておらず**、`PreviewModal`（ブラウザ印刷・791行）と `pdf.routes.ts`（誰も呼んでいない）が残っています。放置すると「出力が2本」問題が印刷で再発します（検査 機能#M4） |
| 7 | **1 行 = Excel 1 行 でよいか** | `scenario` の本文が長いと 1 行が縦に伸びて読みにくい。実物の台本を見てから決める（→ §12） |
| 8 | **`sync` モードを出すか** | 危ないので、要望が無ければ最初は `merge` と `append` だけ出す |
| 9 | **旧 CSV 取込をいつ消すか** | 下の「11-3. 着手条件（2026-08-22 に具体化）」参照。`csvImport.ts` と `CsvImportDialog.tsx` を消す PR を別に立てる |
| 10 | **エディタ以外（一覧画面）から取り込みたいか** | 要望があれば §11-1 の #4 を作り直す |

### 11-3. 着手条件（2026-08-22 に具体化・上の表 #9 の詳細）

**「新経路が本番で1リリース回ってから」だけでは、いつ着手してよいか誰にも判定できません。**
`docs/reviews/phase3-2-plan.md`（顧客・仕入先の旧ID解決の着手条件）が採った形に倣い、
判定できる条件に分解します。**いずれも未達**なので、いま `csvImport.ts` /
`CsvImportDialog.tsx` を消してはいけません。

| # | 条件 | 状況（2026-08-22 時点） |
| --- | --- | --- |
| ① | 新しい `.xlsx` 経路（`excel.routes.ts` 一式・migration `224_qsheet_import_batches.sql`）が**本番で公開**されている | ❌ **未達**。実装は `main`（検証環境）にマージ済みだが、直近の GitHub Release は `v4.1.7`（2026-08-18公開）— この Excel 実装より前の版で、まだ本番デプロイされていない |
| ② | ①のあと、**次の通常リリースを1回挟む**観察期間が経過している | ❌ **未達**（①が済んでいないため起算できない） |
| ③ | 旧CSV取込（`csvImport.ts` 経由）の実利用が、観察期間中ほぼ0件だったことを確認している | ❓ **確認手段が無い**。現状、旧CSV取込の呼び出しを記録する仕組みが無い。①の本番公開までに、顧客・仕入先の旧ID解決（`docs/reviews/phase3-2-plan.md`）で採ったのと同じ形——使われたときだけ記録する小さいログPR——を先に入れておくことを推奨する（無くても③を「未確認のまま」削除PRを出すことは可能だが、実利用があった場合に気づけない） |

**次に読む人へ**: ①が満たされたら（=本番でこのExcel実装を含むリリースが公開されたら）、
このセクションに公開バージョン・日時を追記し、②の観察期間の起算日を明記すること。

---

## 12. 利用者に確認すべきこと

1. **「エクセルでの読み込み」は具体的にどちらですか。**
   - (A) ONAiR から書き出した台本を Excel で一括修正して戻す
   - (B) 他社・他部署から届いた **別フォーマットの台本 Excel** を取り込む
   → **(B) なら手動マッピング UI（§8-3 ⑤）が機能の中心**になり、テンプレの重要度は下がります。
   **(B) の実物のファイルを 1 つ**いただけると設計が正確になります（列名・尺の書き方・話者の書き方）。
2. **普段お使いの Excel は何ですか。** デスクトップ版 Windows / Mac / **Excel Online** / Google スプレッドシート / Numbers。
   → Excel Online と Google スプレッドシートは**入力規則とシート保護の挙動が違い**、隠しシートの扱いも異なります。
   Google スプレッドシート経由が多いなら、保護より「記入例シートでの注意書き」に重心を移します。
3. **尺はどう書きたいですか。** `1:30` / `90`（秒）/ `0:01:30`。今の実装は 3 つとも読めますが、
   **書き出しでどれに揃えるか**を決めたい（既定は「入っている文字列をそのまま」）。
4. **マイク香盤を別シートにしてよいですか。**（§11-1 #2）
   Ch1〜4 くらいならメインシートに列展開したほうが見やすい、という可能性があります。
5. **立ち位置図を Excel で作りたいですか。**（座標を数字で書くことになります）
   要らなければ「ひな形の名前だけ」に減らして、シートを 2 つ削れます。
6. **画像を Excel で扱いたいですか。**
   - 見るだけでよい → サムネイル埋め込み（`embedImages`）を既定 ON にします
   - Excel から画像を**入れたい** → §11-1 #3 の経路を作ります（作れます）
7. **「ファイルに無い行を消す（`sync`）」は要りますか。** 危ないので、要らなければ出しません。
8. **取込の取り消しは何時間さかのぼれれば十分ですか。**（設計では 24 時間・直近 1 件）
9. **CSV は残しますか。** 書き出しだけ残す想定ですが、CSV 取込を使い続けている業務があるか。
10. **`/qsheet` の「Excel出力」「Excelから読み込み」ボタンは、今は押しても何も起きません**（§0）。
    いつからそうだったかご存じですか。＝ Excel 経路は**現状ほぼ使われていない**可能性があり、
    そうであれば「今の使い方に合わせる」より「これから使いやすい形にする」ほうを優先できます。

---

## 13. ファイル配置（この設計で増えるもの）

```
server/src/contexts/qsheet/excel/
  schema.ts            機械キー・列定義・シート論理名 — **列定義の唯一の正**
  workbook.ts          buildQsheetWorkbook(doc, opts) → ExcelJS.Workbook（空ひな形も同じ関数）
  csv.ts               同じ列定義から CSV を出す／CSV を読む（文字コード判定つき）
  parse.ts             .xlsx/.csv → 中間表現（シート・見出し・生データ）
  map.ts               マッピングの段（§8-3）
  plan.ts              中間表現 + current → ExcelPlanResponse（**id 規則と 3 つのアサートはここ**）
  cells/               型ごとの読み書き（scenario.ts / labelMemo.ts / mic.ts / ledXr.ts / stage.ts / plain.ts）
server/src/contexts/qsheet/routes/excel.routes.ts       §9 の 7 本
server/src/contexts/qsheet/services/importBatch.service.ts
server/src/shared/db/migrations/213_qsheet_import_batches.sql

client-qsheet/src/components/excel/ExcelImportDialog.tsx   parse → マッピング → 下見 → 適用
client-qsheet/src/components/excel/ColumnMappingTable.tsx  §8-3 の 3 分類 ＋ 手動割り当て
client-qsheet/src/components/excel/ImportDiffTable.tsx     行ごとの下見
client-qsheet/src/lib/excel/applyPlan.ts                   applyOps(prev, plan.ops) の純関数 ＋ applyDataUpdate 呼び出し（§8-1）

shared/tests/qsheetExcelRoundtrip.test.ts     往復・冪等・id 重複禁止・行数暴走の検知（§8-5）

消すもの（新経路が 1 リリース回ってから・別 PR）:
  client-qsheet/src/lib/csvImport.ts
  client-qsheet/src/components/editor/CsvImportDialog.tsx
  EditorPage.exportCsv() / PreviewModal.handleCsvDownload()  → サーバーの 1 本に置き換え
```

> **`shared/` には置きません。** 列定義を使うのはサーバーだけで、クライアントは
> サーバーが返す JSON（`columns` / `entries`）を表示するだけです。
> shared に置くと `server/src/` から import できないため**複製＋parity 検査**が要りますが、
> **クライアントが必要としないものを複製する理由がありません**（`yjsDoc.ts` の複製は
> 両側が実際に使うから成立している）。
