# 段5 実装設計 — 進行台本の編集画面を作り直す（実物で裏取りした版）

> **前提**: [`../06-editor.md`](../06-editor.md)（設計）と [`../00-datamodel-fixes.md`](../00-datamodel-fixes.md)（データモデルの前提修正）。
> **この文書はコードを1行も変えていません。** 実装を全部読んで、06 の棚卸し表が実物と合っているかを確かめ、
> 抜けを足したものです。**行番号は 2026-08-21 時点の `claude/qsheet-v4-coding-guide-udbo1u` の実測値**です。
>
> 06 の主張は「**今ある機能を1つも落とさない**」で、その担保が棚卸し表です。
> 読んだ結果、**表に載っていない機能が 35 件**見つかりました（§3 の ★追加）。
> **書かれていないものは実装されません。** ここで足します。

---

## 1. この段でやること

1. **編集画面（`/qsheet/editor/:id`）の見た目を v4 に寄せる**。URL は1文字も変えない。
2. **06 §2 の棚卸し表を、実物で検証した §3 の表に差し替える**（★追加 35 件を含む）。
3. **`slide` に編集 UI を作る**（§5）。作らないと 11 型が実質 10 型になる。
4. **00 の5件（`templateId` / モバイルのセル形 / `docTotalSec` / `blockRef` / `genId`）を先に通す**。
   ⚠️ 00 §5 のファイル一覧には **`PreviewModal.tsx` と `RundownPage.tsx` が入っていません**。
   このまま実装すると**印刷とランダウンから立ち位置図が消えます**（§10-F）。
5. **モバイル編集を PC と同じ形に寄せる**（00 §2）。ただし実物のズレは 00 が挙げた4型だけではありません（§3・§6）。

**この段でやらないこと**: Excel（03）・AI（04）・MCP（05）・本番4画面（07）。
ただし**編集画面が書いた形をそれらが読む**ので、§2 の「データの形」がそれら全部の前提になります。

---

## 2. ブロック型 11 種の実物一覧

**型の定義は1か所だけ**: `client-qsheet/src/components/editor/EditorSidebar.tsx:87-99`（`BLOCK_TYPES`）。
これが「列を足す」ピッカーの並び順でもあります。**11 型で全部**です（他に隠れた型はありません）。

セルの読み書きは `client-qsheet/src/components/editor/CueRow.tsx` の `blocks.map()` の中で
**型名の分岐**によって決まります（`blk.type` の文字列比較・`CueRow.tsx:405-678`）。

| # | 型名 | 表示名 | PC の編集 UI | データの形（PC が書く形＝正） | 往復（CSV 取込） | ファイル:行 |
|---|---|---|---|---|---|---|
| 1 | `scenario` | シナリオ | あり（Qワード切替・話者ピル・本文・画像・ハイライト） | `{ entries: [{ name, html, isQWord, image?, highlight? }] }` | ○（`【名前】本文` を解釈） | `CueRow.tsx:412-476` / 取込 `csvImport.ts:77-82,110` |
| 2 | `video` | 映像 | あり（ラベルピル＋メモ＋画像） | `{ entries: [{ label, memo, image? }] }` | ○ | `CueRow.tsx:479-525` / `csvImport.ts:84-89,111-113` |
| 3 | `audio` | オーディオ (BGM/SE) | あり（同上） | 同上 | ○ | 同上 |
| 4 | `telop` | テロップ | あり（同上） | 同上 | ○ | 同上 |
| 5 | `audio_mic` | マイク香盤 | あり（ON/STBY/OFF の3値トグル・Ch・出演者・マイク種類・**前 cue から継承**） | `{ assignments: [{ ch, person, micType, state }] }` | ○（`Ch1:ON 田中/SM58` を解釈） | `CueRow.tsx:528-550` → `MicAssignmentCell.tsx:58-156` / `csvImport.ts:91-105,114` |
| 6 | `led_xr` | LED/XR | あり（シーン選択・壁/床の表示・Cue・トランジション・各「任意入力…」） | `{ entries: [{ sceneId, cueType, cueCustom, transition, transitionCustom }] }` | **×**（`csvImport.ts:115-117` が `undefined` を返す） | `CueRow.tsx:578-664` |
| 7 | `stage_diagram` | 立ち位置図 | あり（ひな形の選択＋SVG プレビュー＋メモ） | `{ templateIndex: number, note?: string }` ⚠️**配列 index 参照**（00 §1） | **×** | `CueRow.tsx:553-563` → `StageDiagramCell.tsx:79-106` |
| 8 | `slide` | スライド | **無し（破線の枠を描くだけ）** | **書き手なし。読み手だけ `cell.image`**（トップレベル） | **×** | 書き手なし `CueRow.tsx:566-575` ／ 読み手 `PreviewModal.tsx:713-718` |
| 9 | `lighting` | 照明 | あり（メモ欄 1 つ・分岐に落ちる） | `{ value: string }` | ○（`csvImport.ts:118` の `default`） | `CueRow.tsx:667-677` |
| 10 | `remarks` | 備考 | あり（同上） | `{ value: string }` | ○ | 同上 |
| 11 | `item` | 小道具 | あり（同上） | `{ value: string }` | ○ | 同上 |

### 2-1. `slide` に本当に書き込み経路が無いか（確かめた）

**ありません。** `CueRow.tsx:566-575` は `<div>` に `ImageIcon` と「スライド」の文字を描くだけで、
`onChange` も `updateCell` も呼びません。`blk.type === "slide"` を検索しても、
書き込み側は client 全体で 0 件です。

**ただし読み手は既にいます。**

- `PreviewModal.tsx:716` — `{ei === 0 && cell.image && <img src={cell.image} … />}`
  → **印刷は `cell.image`（トップレベル）を期待している**。
- `pdf.routes.ts:169` — `blocks.filter(b => b.type !== 'stage_diagram' && b.type !== 'slide')`
  → サーバー PDF は `slide` を**出力から外している**（06 §6 のとおり。ただしこの経路はクライアントから呼ばれていない）。

⚠️ **06 §3 は「セルの値は `cell.image`（`scenario` … の `entries[0].image` と同じ持ち方）」と書いていますが、
この2つは同じではありません。** `scenario` 系は `entries[0].image`、`slide` の既存の読み手は `cell.image` です。
**実装では `cell.image`（トップレベル）を正にしてください**（既に読み手がいる側に合わせる。§5）。

### 2-2. 型ごとに落ちているもの（実物）

| 事実 | どこ | 影響 |
|---|---|---|
| ヘッダーのアイコン表がある型は **8 種だけ**。`audio_mic` / `led_xr` / `lighting` にアイコンが無い | `CueTable.tsx:67-76`（`BLOCK_ICONS`） | 見た目が揃わない。v4 で全 11 型を `Record<BlockType, Icon>` にして**網羅を型で強制**する |
| `blocks[].width` は数値だと**無視される** | `CueTable.tsx:81-84` が `typeof width === "string"` のときだけプリセットを見る。新規作成は数値を入れる（`DashboardPage.tsx:503-507`） | 新規台本の列幅指定が効いていない（既定の 400/140 が出る） |
| 列の**ラベルを変える UI が存在しない** | `EditorSidebar.tsx:532` は `<span>{blk.label}</span>`（ただの表示）。`CueTable.tsx:836` も表示のみ | 06 §2-2 は「列の追加・削除・ラベル変更 → そのまま」と書いているが、**ラベル変更は今も無い**（§10-C） |

---

## 3. 落としてはいけない機能の棚卸し（実装で裏取り済み）

**「★追加」は 06 §2 の棚卸し表に1行も無かったもの**です。**35 件あります。**
「v4 での扱い」は 06 の語法（そのまま／作り直す／やめる）に合わせています。

### 3-1. 行とロールの編集

| 機能 | 現在の実装場所 | v4 でどう作り直すか | 落ちたときの現場への影響 |
|---|---|---|---|
| InsertGap（行間ホバーで ロール/CM/VTR を挿入） | `CueTable.tsx:490-528`、設置 `:552,570,625,681,920` | **そのまま**（見た目だけ） | 台本の途中に足せなくなる。末尾に足して並べ替える操作が毎回発生 |
| 複数行選択（クリック／Shift 範囲） | `CueTable.tsx:391-406`（`toggleRowSelect`）、案内バー `:539-550` | **そのまま** | まとめ移動ができない |
| 選択行のまとめてドラッグ移動 | `CueTable.tsx:414-429`（`moveRowsTo`）、判定 `:432-446` | **そのまま** | 同上 |
| 行のドラッグ並べ替え | ハンドラ `CueTable.tsx:1015-1044`（`CueRowSlot`）、適用 `:352-364` | **そのまま**。⚠️ Yjs に atomic move が無く clone (delete+insert) になる（`ydocOps.ts:215-225`） | 構成の入れ替えが矢印ボタン頼りになる |
| ロール（セクション）のドラッグ並べ替え | `CueTable.tsx:701-707`（通常）/ `:583-588`（CM）/ `:638-643`（VTR）、適用 `:341-350` | **そのまま** | 同上 |
| 行の複製 | `CueTable.tsx:366-377` | **そのまま**。⚠️ **すでに `clone.id = genId("row")` で採り直し済み**（`:370-372`）。この不変条件を壊さない | id 重複＝3→769→100万行の地雷 |
| 行の挿入（直下に空行） | `CueTable.tsx:380-388`、ボタン `CueRow.tsx:706-708` | **そのまま** | 途中に足せない |
| 行の削除（ゴミ箱へ） | `CueTable.tsx:278-294` → `trash.ts:28-47` | **そのまま** | 誤削除が戻せない |
| ロールの削除（中の行ごとゴミ箱へ） | `CueTable.tsx:238-250` | **そのまま** | 同上 |
| 行の上下移動（矢印） | `CueTable.tsx:296-306`、ボタン `CueRow.tsx:700-705` | **そのまま** | ドラッグできない環境で詰む |
| セル編集（IME 安全な入力） | `useBufferedValue.ts:27-98` / `BufferedInput.tsx` / `BufferedTextarea`(`CueRow.tsx:15-45`) / `EditablePill`(`CueRow.tsx:207-313`) | **そのまま（絶対に触らない）** | 「さくら」→「ささくさくらさくら」 |
| マイク「前 cue から継承」 | ボタン `MicAssignmentCell.tsx:89-104`、探索 `CueTable.tsx:313-331`、結線 `CueRow.tsx:537-546` | **そのまま** | Ch4本×全行を毎回打ち直し |
| **★追加** CM／VTR／改ページの3種セクション（追加・尺・ラベル・削除） | 追加 `CueTable.tsx:211-236`、描画 `:558-684`、メニュー `SectionMenu.tsx:35-57` | **そのまま**。3種の見た目（黒帯 / 藍グラデ / 破線）を v4 トークンに載せ替える | **06 の棚卸し表に1行も無い。** CM と VTR は本番の尺計算の骨で、落ちると進行が組めない |
| **★追加** 絶対時刻の積み上げ表示（開始時刻＋各ロール尺） | `CueTable.tsx:449-453`（`absSec`）、表示 `:594,650,722`（`fmtAbs`） | **そのまま**。`fmtAbs` は 00 §3 で shared へ移る | 「この項目は何時からか」が消える。当日の最重要表示 |
| **★追加** ロール通し番号 | `CueTable.tsx:485,690,719`（`rowNum`） | **そのまま** | 口頭で「3番目」と言えなくなる |
| **★追加** 尺未入力の警告（琥珀色リング＋ツールチップ） | `CueTable.tsx:612-618`(CM) / `:668-674`(VTR) / `:731-737`(ロール) | **そのまま** | 尺 0 のロールに気づけず、合計尺と絶対時刻が黙ってずれる |
| **★追加** 尺の blur 正規化（`normalizeDur`） | `CueTable.tsx:608-611,664-667,727-730` | **そのまま**。00 §3 で shared の `time.ts` に寄せる | `90` と `1:30` が混在したまま Excel/AI に流れる |
| **★追加** ドラッグ中の自動スクロール（端 90px で最大 22px/フレーム） | `CueTable.tsx:140-170` | **そのまま** | 長い台本で「画面外へ運べない」。ネイティブ DnD は自動で送らない |
| **★追加** ロール末尾へのドロップゾーン（「＋行を追加」ボタンが兼ねる） | `CueTable.tsx:891-916` | **そのまま** | 最終行の下に落とせない |
| **★追加** Qワード切替と赤い `Q→` | `CueRow.tsx:418-428,437` | **そのまま** | プロンプター/本番のきっかけ表示が消える |
| **★追加** 話者の自動色分け（10色・出演者名から自動割当） | `CueTable.tsx:455-483`、`CueRow.tsx:316-319,413` | **そのまま**。⚠️ `speakerNamesKey` は `names.join("")` で作られており、**`split("")` で1文字ずつに割り直している**（`:479`）＝2文字以上の名前で色が壊れる。**v4 で直す** | 誰の台詞か一目で分からない／今も色が壊れている |
| **★追加** 行ハイライト色（印刷向けパステル6色・行全体の背景に反映） | `HighlightPicker.tsx:12-19`、適用 `CueRow.tsx:394-397,403,452-455` | **そのまま** | 「ここは要注意」の共有手段が消える |
| **★追加** セル画像の添付・差し替え・削除＋大プレビュー | `CueRow.tsx:112-203`（`EntryImageButton`）、表示 `:457-472,506-521` | **そのまま**。⚠️ **`ImageDropZone.tsx` はどこからも import されていません**（死蔵・§10-A） | 台本に写真を貼れなくなる。`slide` の実装もここを流用する（§5） |

### 3-2. 列（ブロック）とロールのひな形

| 機能 | 現在の実装場所 | v4 でどう作り直すか | 落ちたときの影響 |
|---|---|---|---|
| 列幅リサイズ | `CueTable.tsx:179-199`、ハンドル `:840-846` | **そのまま**（幅は `data.blocks[].widthPx`） | 台本列が狭いまま |
| 列（ブロック）の並べ替え | 表頭 `CueTable.tsx:789-818`、サイドバー `EditorSidebar.tsx:496-523` | **そのまま**。⚠️ `blockRef`（00 §4）は「今の並び」依存なので**保存された値として持たない** | 現場ごとの並びが作れない |
| 列の折りたたみ | `EditorPage.tsx:222,231-237`（`collapsedBlocks`）、描画 `CueTable.tsx:823-829` | **そのまま** | 11 列を同時に見られない |
| ロールの折りたたみ | `EditorPage.tsx:223,239-245`（`collapsedSections`）、描画 `CueTable.tsx:769` | **そのまま** | 長い台本で目的の場所へ行けない |
| 列の追加・削除 | `EditorSidebar.tsx:389-403`、ピッカー `:472-487` | **そのまま**。⚠️ 新規 id は `genId('blk')`（00 §4-3。現状 `blk_${Date.now()}`） | 列を足せない |
| 列の**ラベル変更** | **実装が無い**（`EditorSidebar.tsx:532` は表示のみ） | **新規に作る**（06 は「そのまま」と書いているが、そのままにする対象が無い・§10-C） | 「台本」を「進行」に直せない（今も直せない） |
| セクションメニュー（CM/改ページ/VTR 追加・テンプレとして保存・削除） | `SectionMenu.tsx:12-79`、結線 `CueTable.tsx:752-765` | **そのまま**。「テンプレとして保存」だけ §9-2 | ロール操作の入口が消える |
| 「テンプレとして保存」（`sectionTemplates`） | 保存 `CueTable.tsx:757-764`。**読み手 0 件** | **要確認**（06 §5-2 の (a)/(b)。§9） | 現状も使えていない |
| **★追加** マスター管理（人物／映像／音声／テロップ／マイク種類） | `EditorSidebar.tsx:101-115,546-563`、`MasterSection`（`:~200-245`） | **そのまま**。入力欄はローカル state → Enter で確定なので IME は安全 | 話者ピル・ラベルピルの候補が出なくなり、表記ゆれが一気に増える |
| **★追加** マイク Ch 定義（番号＋ラベル・未定義なら Ch1〜4） | `EditorSidebar.tsx:424-449,566-613`、既定 `MicAssignmentCell.tsx:28-30` | **そのまま**。⚠️ Ch ラベルは**生の `<input onChange>`**（`:595-601`・§6） | マイク香盤が既定 4ch 固定になる |
| **★追加** LED/XR シーン定義（壁・床・並べ替え・削除） | `EditorSidebar.tsx:247-365`、参照 `CueRow.tsx:581,599-603` | **そのまま**。⚠️ 新規 id は `genId('led')`（現状 `led_${Date.now()}`・`:259`） | LED/XR 列がシーンを選べない空欄になる |
| **★追加** 立ち位置図エディタ（人・箱の配置／保存／**別名で保存して続けて編集**） | `StageEditor.tsx`(368行)、結線 `EditorPage.tsx:866-890`、`onSaveCopy` `:882-887` | **そのまま**。⚠️ ひな形に `id` を持たせる（00 §1-2） | 立ち位置図を作れない |
| 立ち位置図ひな形の「複製して編集」 | `EditorSidebar.tsx:656-663`、`EditorPage.tsx:530-541` | **そのまま**。⚠️ 複製時に `genId('stg')` を採る | 「1人足すだけ」の転用ができない |
| **★追加** サーバー側の立ち位置図ひな形 API 4本（`qsheet_stage_templates`） | `stage-templates.routes.ts:14-126`。**クライアントからの呼び出し 0 件** | **要確認**（`sectionTemplates` と同じ「書けるが読めない」構図。§9） | 現状も誰も使っていない。放置すると v4 でも死蔵が増える |

### 3-3. 保存・同時編集

| 機能 | 現在の実装場所 | v4 でどう作り直すか | 落ちたときの影響 |
|---|---|---|---|
| Yjs 常時同期（3秒 debounce で JSONB を丸ごと上書き） | `roomManager.ts:104-132`（`applyUpdate`→`scheduleSave`→`flush`）、書き込み `collab.ts:56-74` | **そのまま**。この設計群の全部がこれを前提にしている（§3-4） | 同時編集が成立しない |
| `applyDataUpdate` の3手順 | `ydocDiff.ts:187-193`（`backfillIds` → `yDocToData` → `ensureStableIds(updater(prev))`） | **そのまま（絶対に触らない）**。`updater` は必ず `prev` の関数 | 定数を返すと同時編集の行が黙って消える |
| Ctrl+S / Cmd+S 手動保存（稿番号を1つ上げる） | ハンドラ `EditorPage.tsx:464-479`、実処理 `:482-506`、ボタン `:599-610`（`aria-keyshortcuts`） | **そのまま**。「保存された感」が要る | 押しても何も起きない＝不安で無駄に再読込される |
| 競合バナー＋楽観ロック 409＋自動保存停止 | 送信 `EditorPage.tsx:296`、409 `:310-321`、バナー `:729-741`、サーバー `documents.routes.ts:159-181` | **そのまま**。⚠️ 02 §4 の 409 は進行表の話で別物 | 黙った上書き合戦が復活 |
| プレゼンス表示（誰が開いているか） | `PresenceAvatars.tsx`、購読 `EditorPage.tsx:442-458`、サーバー `socket.ts:25-34,76-95` | **そのまま**。⚠️ `presenceList()` は未 export（`socket.ts:28`）。03 §8-6 が使うので export を足す | 「今誰が触っているか」が消える |
| セルカーソル（誰がどのセルを見ているか） | 属性 `CueRow.tsx:372,407,415,…`（`data-collab-cell`）、送信 `EditorPage.tsx:376-389`、描画 `:391-426` | **そのまま**（DOM 直接操作でメモ化を壊さない作りを維持） | 同じセルを2人で潰し合う |
| ゴミ箱と復元 | `trash.ts:1-97` / `TrashDrawer.tsx:19-201`、入口 `EditorPage.tsx:611-630` | **そのまま（用途を限定）**。⚠️ 復元時に `genId()` で採り直す（06 §5-1） | 誤削除が戻せない |
| **★追加** 自動保存（2秒 debounce・**非 collab 時のみ**） | `EditorPage.tsx:428-438` | **そのまま**。collab 退避時の唯一の保存経路 | 退避モードで編集が消える |
| **★追加** collab の安全網（8秒同期しなければ HTTP 保存へ退避）と `?collab=0` の緊急スイッチ | `EditorPage.tsx:214-218,362-374` | **そのまま**。**v4 でも `?collab=0` を残す**（同期障害時に現場が自力で逃げられる唯一の手段） | Socket が死んだ日に編集が丸ごと保存されない |
| **★追加** 保存ステータスバッジ（保存済み／保存中／未保存／エラー／競合＋最終保存時刻） | `EditorPage.tsx:579-597`、`aria-live="polite"` | **そのまま** | 保存されたか分からず、二重に触る |
| **★追加** 読み込み時の移行2種と「変わったら未保存にする」 | `EditorPage.tsx:258-283`（`splitMultiEntryRows` → `ensureStableIds` → `setDirty(true)`） | **そのまま**。00 の移行（`templateId`・モバイルのセル形）も**必ずこの位置**に足す（`migrateEntries.ts`） | id 無しのまま collab に入り、行が倍々に増える |
| **★追加（重大）** collab モードでは `PUT /qsheet/documents/:id` が**一度も飛ばない** | `EditorPage.tsx:430-431`（自動保存を return）・`:484-495`（手動保存も return）。列を書くのは PUT だけ（`documents.routes.ts:189-196`） | **v4 で決める**。`title` / `broadcast_date` / `status` / `episode_*` は**列にも書く経路**を1本作る（例: 3秒 persist と同じ場所でサーバーが `data.meta` から列へ写す） | **一覧の検索が編集後のタイトルに当たらない**（検索は `d.title ILIKE`・`documents.routes.ts:67`）。カード表示は `meta.title` を優先するので**気づけない**（`DashboardPage.tsx:164`） |
| **★追加** `status` を変える UI が**どこにも無い** | client-qsheet 全体で `status` の更新 UI 0 件。サーバーは不正値を黙って `'draft'` に落とす（`documents.routes.ts:186`） | **06 §8 のとおり 400 で返すように直す**＋**状態を変える導線を作るかを決める**（§9） | 04 の「確定済み Qシート」の件数が永久に 0。一覧の状態絞り込みも意味を持たない |

### 3-4. 資料まわり・出力

| 機能 | 現在の実装場所 | v4 でどう作り直すか | 落ちたときの影響 |
|---|---|---|---|
| 稿を上げる（`draftType` / `draftNumber`） | `EditorPage.tsx:486-490,497-501`、表示 `:508-513`、選択 `:694-703` | **そのまま**。値は `連番/準備稿/決定稿`（03 §7-1） | 「第◯稿」が配れない |
| 共有ダイアログ | `DashboardPage.tsx:300-410`（一覧側のみ）、API `documents.routes.ts:238-343` | **作り直す**（一覧と編集画面の両方から開く・01 §7-4） | 作った台本を誰にも見せられない |
| 画像アップロード | 実物は `CueRow.tsx:112-203`（`EntryImageButton`）→ `POST /qsheet/upload-image`（`upload.routes.ts:44-95`） | **そのまま**。5MB 上限・マジックバイト検証あり。⚠️ ファイル名は**内容ハッシュではなく `crypto.randomBytes(16)`**（`:81`）＝重複排除しない（§10-E） | 画像を貼れない |
| 音声共有（QR＋URL コピー） | `AudioShareDialog.tsx:18-119`、ボタン `EditorPage.tsx:650-662`（**`audio_mic` 列がある時だけ出る**） | **そのまま**。失効できない問題は 07 §4 | 音声さんに URL を配れない |
| 印刷／PDF プレビュー | `PreviewModal.tsx`(791行)。設定 `:82-92`（用紙 A4/A3 縦横・文字サイズ・余白・白黒・列の取捨・改ページ方式`flow`/`role`・`qs_print_pagemode` を localStorage 保存） | **そのまま（正にする）**。06 §6 の判断を維持。⚠️ **印刷ウィンドウが Google Fonts を外部から読む**（`:355-356,376-377`）— v4 の同梱フォント方針（`npm run fonts`）と衝突するので**同じ PR で同梱フォントに差し替える** | 台本が紙で出せない＝本番が回らない |
| CSV 書き出し（2本ある） | `EditorPage.tsx:134-194`（`exportCsv`）と `PreviewModal.tsx:154-226`（`handleCsvDownload`） | **やめる**（03 §13・サーバー1本へ） | — |
| CSV 取込 | `csvImport.ts:1-202` / `CsvImportDialog.tsx`、結線 `EditorPage.tsx:344-354` | **やめる**（新経路が1リリース回ってから別 PR・03 §11-2 #9）。⚠️ `replace` は `sections` を丸ごと差し替えるので**下見の間に他人が足した行を消す**（`EditorPage.tsx:350`） | §9 で確認 |
| アプリ内マニュアル | `manual/content.tsx`(429行) ← `Header.tsx:4,16` → `shared/src/client/AppHeader` | **作り直す**。⚠️ **今の本文が実在しない機能を説明している**（`:230`「サイドバーの『メタ』タブに『現在の台本をExcel出力』『Excelから読み込み』があります」＝配線されていない・§10-A2） | 検索キーワード（印刷・改ページ等）ごと消える |
| **★追加** 稿・放送日・収録日・開始時刻・場所のヘッダー編集 | `EditorPage.tsx:688-726` | **そのまま**。⚠️ タイトル `:557-563`・場所 `:720` は**生の `<input onChange>`**（§6） | 台本の属性を編集画面から直せない |
| **★追加** リハーサル日・撮影場所・作成者（サイドバー「メタ」） | `EditorSidebar.tsx:678-710` | **そのまま**。⚠️ **場所がヘッダーとサイドバーで二重に編集できる**（同じ `meta.location`）。v4 でどちらか1つに寄せる | 入力欄が消える／二重編集で混乱 |
| **★追加** 合計尺の表示 | `EditorPage.tsx:516-518,722-725` | **作り直す**（00 §3 の `docTotalSec` を呼ぶ形に） | 「枠 90 分／台本 0 分」の嘘表示 |
| **★追加** ランダウン／プロンプター／ON AIR への遷移 | `EditorPage.tsx:665-676` | **そのまま**（URL は 5本とも不変） | 本番画面へ行けない |
| **★追加** サイドバー「Excel入出力」の 2 ボタンが**押しても何も起きない** | UI `EditorSidebar.tsx:713-730`、props `:80-81`。**`EditorPage.tsx:762-810` が `onShowImport` / `onExportExcel` を渡していない** | **03 の新経路に結線する**（この段では「押せない状態を放置しない」ことだけ決める） | 現状も動かない。マニュアルは動くと書いている |
| **★追加** `episodeId` / `onEpisodeChange` を渡しているが**サイドバーに紐付け UI が無い** | `EditorPage.tsx:769,776-779`、`EditorSidebar.tsx:74,79`（受け取るだけで未使用） | **決める**（01 のジャーニーに寄せるなら props ごと落とす） | 台本を案件・エピソードに紐付ける導線が編集画面に無い |

### 3-5. モバイル編集（lg 未満＝1024px 未満）

**分岐は `CueTable.tsx:102-115`**。`useMediaQuery("(min-width: 1024px)")` が false のとき
`CueCardList` に丸ごと差し替わります（表は出しません）。

| 機能 | 現在の実装場所 | v4 でどう作り直すか | 落ちたときの影響 |
|---|---|---|---|
| カード一覧 | `CueCardList.tsx:234-433` | **そのまま** | スマホで台本が読めない |
| 行のボトムシート | `CueRowSheet.tsx:44-87`（88vh の Dialog） | **そのまま** | 行を編集できない |
| セル編集 | `CueRowMobileEditor.tsx:48-349` | **作り直す**（00 §2。PC と同じセル形で書く） | Excel/AI/印刷が読めない形のデータが増え続ける |
| サイドバーのシート | `EditorSidebarSheet.tsx`、FAB `EditorPage.tsx:812-828` | **そのまま** | 列とマスターを触れない |
| **★追加** モバイルの InsertGap（タップで3種展開） | `CueCardList.tsx:177-228` | **そのまま**。⚠️ **06 は「スマホでは長押しメニューに置き換える」と書いているが、既にタップ展開式がある**（作り直す理由が無い） | 途中に足せない |
| **★追加** 行サマリ（話者＋本文 30 字＋他ブロックのラベル） | `CueCardList.tsx:46-62` | **そのまま** | どの行か分からずタップできない |
| **★追加（重大）** モバイルの**削除がゴミ箱を通らない** | 行 `CueCardList.tsx:110-119`、ロール `:153-159`（`pushToTrash` を呼ばない） | **作り直す**（PC と同じく `makeTrashItem`→`pushToTrash` を通す） | **スマホで消したものは戻せません**。PC と挙動が違うことを誰も知らない |
| **★追加** モバイルにロール尺の編集欄が無い（CM/VTR だけ編集可） | `CueCardList.tsx:396-411` | **作り直す**（通常ロールにも尺を出す） | スマホで尺を直せず、合計尺と絶対時刻が組めない |
| **★追加** モバイルのハイライト読取が `blockId === "scenario"` 決め打ち | `CueCardList.tsx:310`（`row.cells?.scenario`） | **作り直す**（`blocks.find(b=>b.type==='scenario')` に） | サイドバーから足した台本列（`blk_...`）ではハイライトが出ない |
| **★追加** `row.label`（行ラベル）は**モバイルだけが書き、PC は表示も編集もしない** | 書き `CueRowMobileEditor.tsx:96-102`、読み `CueCardList.tsx:329-331`・`trash.ts:85` | **決める**（PC にも出すか、モバイルから落とすか）。**片側だけにあるフィールドを放置しない** | スマホで付けたラベルが PC で消えたように見える |
| **★追加** モバイルに無い操作（PC にはある） | 複製・Shift 範囲選択・列の折りたたみ・列幅・ゴミ箱・印刷（`EditorPage.tsx:642` が `hidden sm:inline-flex`）・音声共有（`:655` が `hidden md:flex`）・CSV（`:632,637` が `hidden md:flex`）・ランダウン/プロンプター（`:665,669`） | **§6 で決める**（全部出すのではなく、「スマホでやる作業」を宣言して並べる） | 出先で必要な操作にたどり着けない |

### 3-6. この段が守る不変条件（実装を読んで確定した事実）

| 不変条件 | 根拠（実物） |
|---|---|
| `qsheet_documents.data` は Yjs の所有物。サーバーは**丸ごと上書き**する | `collab.ts:65-73` が `updateToData(state)` の結果で `UPDATE … SET data = $2` |
| 上書きの間隔は「dirty になってから最大 3 秒に1回」＋**ルーム無人化時に flush** | `roomManager.ts:113-120`（`saveTimer` があれば予約しない）、`:83-96`（`release` で flush→evict）、`collab.ts:77`（`saveDebounceMs = 3000`） |
| 種（seed）は**初回だけ** JSONB から作られ、以後は Y state が正 | `roomManager.ts:46-60` |
| 書き込みは必ず `applyDataUpdate` 経由 | `EditorPage.tsx:324-341` が唯一の入口（`updateData`）。`collabMutate` → `ydoc.transact(…, 'local')`（`useCollabDoc.ts:161-165`） |
| 公開 URL 5 本 | `App.tsx:36-48`（`/qsheet/editor/:id` `/onair/:id` `/rundown/:id` `/prompter/:id` `/audio/:id`）— **1文字も変えない** |
| Y.Doc の構造は server と shared で**完全一致**が要る | `check-collab-parity.mjs:19-23`（コメント以外が1行違えば CI が止まる） |

---

## 4. 作り直しの進め方

### 4-1. 選択肢

| 案 | 中身 | 危険 |
|---|---|---|
| (A) 一気に置き換える | `EditorPage` 以下を新規に書き、旧を消す | 11 型 × 35 件の★追加 × 5 本の読み手（印刷・OnAir・ランダウン・プロンプター・公開音声）を**同時に**当てることになる。落ちた1件に気づくのは本番当日 |
| (B) 内側から差し替える | 葉（セル）→ 行 → 表 → 外枠 の順に、**古い部品と新しい部品を同じ画面に共存させながら**入れ替える | PR が増える。中間状態で見た目が混ざる |
| (C) 別ルートに新画面を作って切り替える | `/qsheet/editor2/:id` を作る | **URL を増やさない**という 01 §1 の決めと衝突。現場が2つの URL を持つ |

### 4-2. 推奨: **(B) 内側から差し替える**

**理由は3つで、どれも実装の事実から出ています。**

1. **`data` の形を変えずに済む段と、変える段を分けられる。**
   00 の5件（`templateId`・モバイルのセル形・`docTotalSec`・`blockRef`・`genId`）は
   **見た目と無関係**で、しかも印刷・ランダウンという**本番画面の読み手**に波及します（§10-F）。
   一気に置き換えると「見た目が変わったから壊れたのか、形を変えたから壊れたのか」が切り分けられません。

2. **凍結解除の影響（`index.css` のトークン差し替え）が本番4画面に及ぶ**（01 §0-1・06 §7）。
   葉から替えるなら、**新トークンを使う部品を1つずつ増やす**形にでき、
   「今日の本番で使える状態」を各段で保てます。一気に替えると戻し方が「全部戻す」しかありません。

3. **`CueRow.tsx` の型分岐（`:405-678`）が 11 型の唯一の実装**です。
   ここを型ごとに `cells/<type>.tsx` へ切り出すのは**純粋な移動**で、
   `shared/tests` に「型ごとの読み書きが往復する」テストを先に置けば**機械的に安全**にできます。
   外枠（`EditorPage`）から替えると、この移動が見た目の変更と混ざります。

### 4-3. 段ごとの「今日の本番で使える状態」の保ち方

| 段 | やること | 出したあと必ず成り立っていること |
|---|---|---|
| 0 | 00 の5件（DDL 無し）＋**印刷とランダウンの `templateIndex` 追随**（§10-F） | 立ち位置図が編集・印刷・ランダウンの3か所で同じ図を指す |
| 1 | `CueRow.tsx` の型分岐を `components/editor/cells/<type>.tsx` へ**移動だけ**（挙動を変えない） | 11 型の見た目と保存内容が1バイトも変わらない（`shared/tests` の往復テストで固定） |
| 2 | `slide` の編集 UI（§5）＋モバイルのセル形の是正（00 §2） | `slide` が空欄でなくなる。モバイルで書いた値が PC で読める |
| 3 | 表（`CueTable`）と行（`CueRow`）の見た目を v4 トークンへ。**操作の実装は触らない** | §3 の「そのまま」が全部そのまま動く（実機で1行ずつ確認） |
| 4 | 外枠（`EditorPage`）のヘッダー・情報バー・サイドバーを v4 へ。**凍結解除はここ** | 本番4画面と公開音声の見た目の変化が、事前に合意した範囲に収まっている |
| 5 | モバイル（ゴミ箱・ロール尺・ハイライトの blockId・`row.label` の決着） | スマホの削除が戻せる。375px で横スクロールしない |
| 6 | 印刷（同梱フォント化）＋マニュアル本文の更新 | 紙とキーワード検索が今までどおり |

**各段の共通の受け入れ条件**: `npm run typecheck` / `npm run lint` / `npm run test` /
`node scripts/check-collab-parity.mjs` が通り、**`?collab=0` でも `?collab=1` でも同じ操作ができる**こと。

---

## 5. `slide` の編集 UI（確認④が「作る」だった場合の実装形）

### 5-1. 決め（実物に合わせた訂正を含む）

- **セルの形は `{ image?: string, note?: string }`（トップレベル）**。
  ⚠️ 06 §3 の「`entries[0].image` と同じ持ち方」は誤りです。**既存の読み手 `PreviewModal.tsx:716` は `cell.image` を読みます。**
  読み手がいる側に合わせないと、作った瞬間に印刷に出ません。
- **アップロードは既存の `EntryImageButton`（`CueRow.tsx:112-203`）を流用**する。
  06 §3 が挙げる `ImageDropZone.tsx` は**どこからも import されていない死蔵**です（§10-A）。
  段1で `cells/` に切り出すとき、`EntryImageButton` を `cells/_ImageButton.tsx` として共有部品にする。
- **新しい API は要りません。** `POST /qsheet/upload-image`（`upload.routes.ts:44-95`）をそのまま呼ぶ。
  5MB 上限・マジックバイト検証（JPEG/PNG/GIF/WebP）・パス脱出防止はサーバー側に既にある。
- **Excel はファイル名を読み取り専用列に出すだけ**（03 §4-2）。画像の本体は往復しない。

### 5-2. 触るところ

```
client-qsheet/src/components/editor/cells/slide.tsx   新規（段1の切り出しで作る器の中身）
client-qsheet/src/components/editor/CueRow.tsx:566-575 破線の枠 → 上記へ差し替え
client-qsheet/src/components/editor/CueRowMobileEditor.tsx  slide を fallback から外す（00 §2）
client-qsheet/src/lib/csvImport.ts:115-117            変更しない（画像は CSV で往復しない）
shared/tests/qsheetCells.test.ts                      「slide は cell.image で往復する」を固定
```

### 5-3. 気をつけること

- **`ei !== 0` の分岐を消さない**。`PreviewModal.tsx:716` は `ei === 0` のときだけ画像を出す
  （1行=1エントリに統一済みだが、印刷側は複数エントリ時代の分岐を残している）。
- **削除は `undefined` を書く**（`""` にしない）。`ydocDiff.ts:83` が `undefined` を「セル削除」として扱う。
- **`note` を足すなら 03 の列定義にも足す**。片側だけに足すと Excel で消えます。

**作らない選択をする場合**は、`06-editor.md` §10 の先頭に
「**11 型のうち `slide` は表示のみ**」を明記してください（黙って空欄のままにしない）。

---

## 6. モバイル（375px）と IME

### 6-1. まず宣言する（今は宣言する場所すら無い）

- `scripts/check-mobile-declared.mjs:26-46` の `APPS` に **`client-qsheet` が入っていません**。
- `client-qsheet/src/pcOnlyScreens.ts` も**存在しません**。

→ **凍結を解く PR で、qsheet を `check-mobile-declared.mjs` に足し、`pcOnlyScreens.ts` を作る。**
これをやらないと「どの画面が手つかずか誰にも分からない」状態が qsheet だけ残ります。

**この段での宣言（案）**: `/qsheet/editor/:id` は **MOBILE_OK**（カード一覧＋ボトムシートで編集できる）。
ただし §3-5 の3件（ゴミ箱・ロール尺・ハイライトの blockId）を直すまでは
「**モバイルで消したものは戻せない**」ので、直すまでは宣言しない。

### 6-2. 375px で破綻させないための実測点

| 場所 | 今どうなっているか | v4 で確かめること |
|---|---|---|
| ヘッダーの操作列 | ボタンが `hidden sm:` / `hidden md:` / `hidden lg:` で段階的に消える（`EditorPage.tsx:611-683`） | **375px で残るのは「戻る・タイトル・保存・ON AIR」だけ**。印刷も音声共有もゴミ箱も出ない。これで良いかを決める |
| 情報バー | `hidden sm:flex`（`:688`）→ 375px では**放送日も開始時刻も編集できない** | サイドバーの「メタ」に集約するか、シートに出す |
| 表 | lg 未満は表を出さない（`CueTable.tsx:102-113`）ので横スクロールは起きない | `CueCardList` 側で `overflow-x-auto` が要る箇所は `MicAssignmentMobilePanel`（`CueRowMobileEditor.tsx:169`）だけ。ここは既に付いている |
| タップ領域 44px | カードの行操作は `min-h-9`（36px）（`CueCardList.tsx:345,354,362,370`）。ロール操作は `size-9`（36px）（`:275,281,289`） | **36px は iOS HIG の 44px を下回る。** v4 で `min-h-11`（44px）へ |
| FAB | `size-14` ＋ `env(safe-area-inset-bottom)`（`EditorPage.tsx:817-822`） | そのまま（既に safe-area を見ている） |
| ボトムシート | `h-[88vh] overflow-y-auto`（`CueRowSheet.tsx:59,67`） | そのまま（`CLAUDE.md` の `max-h-[90vh]` 方針を満たす） |

### 6-3. IME — **「そのまま」にしてはいけない箇所がある**

`useBufferedValue.ts:21` は **「生の `<input value={…} onChange={…}>` で文字列を編集しないこと」** と
明記していますが、**実物には生の入力が残っています**。collab では1打鍵ごとに
`applyDataUpdate` → Y.Doc → snapshot → props と1レンダー遅れて戻るため、**同じ壊れ方の条件が揃っています。**

| 生の入力が残っている場所 | 何を編集しているか |
|---|---|
| `EditorPage.tsx:557-563` | 台本のタイトル |
| `EditorPage.tsx:720` | 撮影場所 |
| `CueTable.tsx:596-601` / `:652-657` / `:740-745` | CM ラベル / VTR ラベル / ロール名 |
| `CueTable.tsx:605-619` / `:661-675` / `:724-738` | CM 尺 / VTR 尺 / ロール尺 |
| `MicAssignmentCell.tsx:124-131` / `:132-139` | マイク香盤の出演者名 / マイク種類 |
| `StageDiagramCell.tsx:97-103` | 立ち位置図セルのメモ |
| `EditorSidebar.tsx:595-601` | マイク Ch のラベル |
| `EditorSidebar.tsx:693-698` / `:702-707` | 撮影場所 / 作成者 |
| `CueRowMobileEditor.tsx:96-112,241-254,267-284,337-346` | **モバイル編集の全入力**（shared の `Input`/`Textarea` を直接 `onChange`） |

**v4 での扱い**: 上記を **`BufferedInput` / `BufferedTextarea` に載せ替える**。
とくに**モバイル編集は全部が生**なので、00 §2 のセル形是正と**同じ PR**で直す
（どうせ `CueRowMobileEditor.tsx` を書き換えるため）。

⚠️ **`EditablePill`（`CueRow.tsx:207-313`）は `useBufferedValue` を使っていません**が、
`composingRef` で自前に composition を見ており（`:225,242-247,257-262`）**壊れていません**。
「Buffered ではないから危ない」と早合点して置き換えないこと（置き換えるなら pill の見た目と
「クリックで編集開始→Enter/blur で確定」の挙動を1つも落とさない）。

---

## 7. 検証手順

| # | 何を見るか | コマンド／手順 | このセッションでの実施 |
|---|---|---|---|
| 1 | 型 | `npm run typecheck`（既定3アプリ）＋ `npm run typecheck:all`（qsheet を含む6アプリ） | **未実施**（設計のみのため） |
| 2 | Lint | `npm run lint` | 未実施 |
| 3 | shared の Vitest（`qsheetCsvImport.test.ts` を含む） | `npm run test` | 未実施 |
| 4 | **IME** | `npm run verify:ime`（`scripts/verify-ime.mjs`） | **未実施・未確認**。実行に `playwright-core`（既定 `/tmp/node_modules/...`）と Chromium（既定 `/opt/pw-browsers/chromium-1194/...`）が要る。**このサンドボックスでは確認していない** |
| 5 | 書体・桁揃い・横はみ出し | `npm run verify:ui` | 未実施 |
| 6 | Y.Doc 構造の server/shared 一致 | `node scripts/check-collab-parity.mjs` | 未実施 |
| 7 | 凍結 CSS | `npm run check:frozen`（`scripts/check-frozen-css.mjs:47` から `qsheet` を外す作業が要る） | 未実施 |
| 8 | モバイル宣言 | `node scripts/check-mobile-declared.mjs`（**qsheet を追加してから**・§6-1） | 未実施 |
| 9 | 375px の実機 | DevTools のモバイルエミュレーション（iPhone SE 相当） | 未実施 |

### 7-1. `verify:ime` について（06 §9-2 の前提は誤り）

06 §9-2 は「**`npm run verify:ime` は編集画面を叩く前提**なので、画面を作り直したら**検査側の対象セレクタも直す**」
と書いていますが、**実物は違います。**

- `scripts/verify-ime.mjs:50-51` は `scripts/fixtures/ime-harness` を一時ディレクトリへコピーして
  **専用ハーネスをビルド**します。編集画面は一度も開きません。
- ハーネスが依存しているのは **`@qsheet/lib/useBufferedValue`** の1本だけ
  （`scripts/fixtures/ime-harness/src/main.tsx:13`、エイリアスは `verify-ime.mjs:58` で
  `client-qsheet/src/lib` に解決）。
- セレクタは `#raw` / `#buffered`（`verify-ime.mjs:120-123`）で、**ハーネス内の要素**です。

→ **正しい完了条件はこうです**:
**`client-qsheet/src/lib/useBufferedValue.ts` を移動・改名するなら、
`scripts/fixtures/ime-harness/src/main.tsx:13` の import 1行を同じ PR で直す。**
01 §7-3 は IME 部品を `client-qsheet/src/lib/input/` へ集約すると書いているので、**移動は起こります。**

### 7-2. 実機で1行ずつ見るもの（§3 の「そのまま」）

InsertGap（PC/モバイル両方）／Shift 範囲選択／まとめてドラッグ移動／行とロールのドラッグ＋自動スクロール／
行の複製（**id が変わること**）／列とロールの折りたたみ／列幅／列の並べ替え／マイクの前 cue 継承／
Ctrl+S（稿番号が上がる）／競合バナー（別タブで PUT して 409 を出す）／ゴミ箱の削除と復元／
プレゼンスとセルカーソル（2 ブラウザ）／印刷（A4縦・A3横・`flow` と `role` の両方・白黒）／
QR 共有／`?collab=0` での編集と保存。

---

## 8. PR の切り方

**1 PR = 1画面が目安**ですが、編集画面は 06 の棚卸しだけで 30 行、実物では 60 行以上あります。
**「同じ日に壊れ方が混ざらない」ことを基準に割ります。**

| # | PR タイトル（案） | §3 のどの行を持つか | 大きさの目安 | 前提 |
|---|---|---|---|---|
| 1 | `fix(qsheet): 立ち位置図のひな形を ID 参照にし、印刷とランダウンも追随させる` | 00 §1 ＋ §10-F（`StageDiagramCell` / `StageDiagramEditor` / **`PreviewModal.tsx:738`** / **`RundownPage.tsx:690`**） | 小（DDL 無し） | — |
| 2 | `fix(qsheet): 合計尺・尺の書式・ブロック参照を shared に1本化する` | 00 §3・§4（`docTotalSec` / `parseDur` / `fmtAbs` / `normalizeDur` / `blockRef`）＋ §3-4 の合計尺 | 小〜中 | 1 |
| 3 | `refactor(qsheet): セルの実装を型ごとのファイルに切り出す（挙動は変えない）` | §2 の 11 型全部（`CueRow.tsx:405-678` → `cells/<type>.tsx`）＋ `EntryImageButton` の共有化 | 中（純粋な移動） | 2 |
| 4 | `feat(qsheet): スライド列に画像を入れられるようにする` | §5（`cells/slide.tsx`） | 小 | 3 |
| 5 | `fix(qsheet): モバイル編集を PC と同じセル形にし、IME 安全な入力に載せ替える` | 00 §2 ＋ §3-5 の `CueRowMobileEditor` ＋ §6-3 のモバイル分 | 中 | 3 |
| 6 | `fix(qsheet): モバイルの削除をゴミ箱に通し、ロール尺とハイライトを直す` | §3-5 の ★追加 3 件（ゴミ箱・ロール尺・blockId 決め打ち）＋ タップ 44px | 中 | 5 |
| 7 | `feat(qsheet): 進行台本の表を v4 の見た目にする` | §3-1・§3-2 の「そのまま」全部（見た目だけ・**操作の実装は触らない**）＋ アイコン 11 型網羅 ＋ 列ラベル変更 UI | **大**（ここが本体） | 3 |
| 8 | `feat(qsheet): 編集画面の外枠を v4 にし、Qシートの凍結を解く` | §3-3・§3-4 の外枠（ヘッダー・情報バー・サイドバー・共有ダイアログ）＋ `check-frozen-css` から qsheet を外す ＋ `apps.ts` の `frozen` を落とす | 大（**本番4画面の見た目に波及**・確認① が前提） | 7 |
| 9 | `fix(qsheet): 生の入力欄を IME 安全な部品に載せ替える` | §6-3 の PC 分（タイトル・場所・ロール名・尺・マイク・メモ） | 中 | 7 |
| 10 | `fix(qsheet): 印刷の書体を同梱フォントにし、マニュアル本文を実物に合わせる` | §3-4 の印刷（`PreviewModal.tsx:355-356,376-377`）＋ `manual/content.tsx`（Excel 入出力の記述） | 小〜中 | 8 |
| 11 | `fix(qsheet): 共同編集中もタイトル・放送日・状態が列に反映されるようにする` | §3-3 の ★追加（重大） | 中（サーバー側） | 8 |
| 12 | `chore(qsheet): 制作資料をモバイル宣言の検査対象に入れる` | §6-1（`check-mobile-declared.mjs` ＋ `pcOnlyScreens.ts`） | 小 | 6 |

**別 PR（1リリース回してから）**: CSV 書き出し2本の撤去・CSV 取込の撤去（03 §13）、`pdf.routes.ts` の廃止（06 §6-2）。

### 8-1. `docs/changelog.d/<枝の名前>.md` の1文案

- PR1: `制作資料: 立ち位置図のひな形を並べ替え・削除しても、各行が正しい図を指し続けるようにした（印刷・ランダウンも同じ図を出す）。`
- PR4: `制作資料: スライド列に画像を入れられるようにした（これまでは枠が出るだけで書き込めなかった）。`
- PR6: `制作資料: スマートフォンで削除した行・ロールもゴミ箱から戻せるようにし、ロールの尺をスマートフォンから直せるようにした。`
- PR7: `制作資料: 進行台本の編集画面を新しい見た目にした（操作は今までどおり）。`
- PR11: `制作資料: 共同編集中にタイトルや放送日を直しても、一覧の検索に反映されるようにした。`

---

## 9. 未決・要確認

**06 §10 の6件はそのまま残ります**（`slide` を作るか／「テンプレとして保存」／印刷はブラウザのままか／
ゴミ箱の保持件数と日数／CSV 取込を使っているか／モバイルで編集しているか）。
**実装を読んで新たに増えた確認は次の9件です。**

| # | 確認すること | 決まらないと何が起きるか | 根拠 |
|---|---|---|---|
| 1 | **台本の「状態」（`status`）を人が変える画面を作るか。** 今はどこにも無く、全部 `draft` のまま | 04 の「確定済み Qシート」の件数が永久に 0。一覧の状態絞り込みも意味を持たない | `documents.routes.ts:186`／client 側に更新 UI 0 件 |
| 2 | **共同編集中にタイトルを直したとき、一覧の検索に当たってほしいか。** 今は当たらない（列が更新されない） | 「検索で出てこない台本」が増え続ける。カード表示は `meta.title` 優先なので**気づけない** | `EditorPage.tsx:430-431,484-495`／`documents.routes.ts:67` |
| 3 | **`row.label`（行ラベル）を PC にも出すか、モバイルから落とすか** | スマホで付けたラベルが PC で消えたように見える | `CueRowMobileEditor.tsx:96-102` vs `CueRow.tsx`（表示なし） |
| 4 | **撮影場所がヘッダーとサイドバーの2か所で編集できるが、どちらに寄せるか** | 同じ値を2か所で触れる状態が v4 に持ち越される | `EditorPage.tsx:720` と `EditorSidebar.tsx:693-698` |
| 5 | **編集画面から案件・エピソードに紐付ける導線が要るか。** 今は props だけ渡って UI が無い | 紐付けは新規作成時にしかできない（後から直せない） | `EditorSidebar.tsx:74,79`（未使用） |
| 6 | **サーバーの立ち位置図ひな形 API（`qsheet_stage_templates`・4本）をどうするか。** 呼び手が 0 件 | `sectionTemplates` と同じ「書けるが読めない」死蔵が増える。組織共通のひな形を作るなら**ここが器** | `stage-templates.routes.ts:14-126` |
| 7 | **375px で、印刷・音声共有・ゴミ箱・CSV をヘッダーから出すか。** 今は全部隠れている | 出先で必要な操作にたどり着けないまま v4 になる | `EditorPage.tsx:611-683` の `hidden sm:/md:/lg:` |
| 8 | **`?collab=0`（緊急スイッチ）を v4 でも残すか** | 同期障害の日に現場が自力で逃げる手段が無くなる | `EditorPage.tsx:215` |
| 9 | **サイドバーの「Excel入出力」2ボタン（今は押しても何も起きない）を、03 の新経路が来るまでどうするか** | マニュアルが「使える」と書いた機能が使えない状態が続く | `EditorSidebar.tsx:713-730`／`manual/content.tsx:230` |

---

## 10. 設計書との食い違い（棚卸し漏れを含む）

| # | 設計書の記述 | 実物 | 影響と直し方 |
|---|---|---|---|
| **A** | 06 §2-4・§3: 画像アップロードは **`ImageDropZone.tsx`** ／ 「既存の `ImageDropZone` をそのまま流用」 | **`ImageDropZone.tsx` はどこからも import されていない**（`grep` で定義 1 件のみ）。実際に動いているのは `CueRow.tsx:112-203` の `EntryImageButton` | `slide` の実装で「流用」する先を間違える。**§5 のとおり `EntryImageButton` を正にする**。`ImageDropZone.tsx` は削除するか、共有部品として復活させるかを決める |
| **A2** | `manual/content.tsx:230`「サイドバーの『メタ』タブに『現在の台本をExcel出力』『Excelから読み込み』があります」 | ボタンはあるが `onClick={undefined}`（`EditorPage` が props を渡していない） | **マニュアルが存在しない機能を説明している。** PR10 で本文を直す |
| **B** | 06 §9-2・01 §6-2・§9-14: 「`verify:ime` は編集画面を叩く前提」「検査側の対象セレクタも直す」 | ハーネス（`scripts/fixtures/ime-harness`）を別ビルドして叩くだけ。編集画面は開かない。依存は `@qsheet/lib/useBufferedValue` の1本 | **完了条件を書き換える**（§7-1）。正しくは「`useBufferedValue.ts` を移動するなら harness の import 1行を直す」 |
| **C** | 06 §2-2「列の追加・削除・**ラベル変更** → そのまま」 | **ラベル変更 UI が存在しない**（`EditorSidebar.tsx:532` も `CueTable.tsx:836` も表示のみ） | 「そのまま」にすると v4 でも直せない。**新規に作る**（PR7） |
| **D** | 06 §2-1「行の複製 … ⚠️ 複製時は必ず `genId()` で id を採り直す」 | **すでに実装済み**（`CueTable.tsx:370-372`） | 警告ではなく「この不変条件を壊さない」と書く。⚠️ 一方 **`TrashDrawer` の復元は id ごと戻す**（`:32,44,70`）ので、**そちらが本当の穴** |
| **E** | 06 §3「重複ハッシュ命名」 | `crypto.randomBytes(16)` のランダム名（`upload.routes.ts:81`）。**内容の重複は排除しない** | 同じ画像を貼るたびにファイルが増える。設計の記述を訂正するか、内容ハッシュにするかを決める |
| **F**（重大） | 00 §5「この PR で触るファイル」に **`PreviewModal.tsx` と `RundownPage.tsx` が無い** | `templateIndex` の読み手は4か所: `StageDiagramCell.tsx:81,88` / **`PreviewModal.tsx:738-739`** / **`RundownPage.tsx:690-691`** | **このまま実装すると、印刷とランダウン（本番画面）から立ち位置図が消えます。** エラーは出ません。PR1 に必ず含める |
| **G** | 06 §1「これらが5本の設計書のどこにも1度も出てこない」→ 棚卸し表を作った | その棚卸し表にも **CM／VTR／改ページ・絶対時刻・尺未入力の警告・Qワード・話者の色分け・ハイライト・画像添付・マスター管理・LED シーン定義・立ち位置図エディタが1行も無い**（§3 の ★追加 35 件） | **「棚卸し表があるから安心」が最も危ない。** §3 の表を正にする |
| **H** | 06 §2-5「カード一覧 → そのまま」 | モバイルは**削除がゴミ箱を通らない**・**ロール尺が編集できない**・**ハイライトの blockId が決め打ち** | 「そのまま」にすると PC と挙動が違う状態を v4 に持ち越す。**作り直す**（PR6） |
| **I** | 06 §2-3「Yjs 常時同期 → そのまま」 | collab 有効時は **PUT が一度も飛ばない**ため `title`/`status`/`broadcast_date`/`episode_*` の**列**が更新されない | 一覧の検索が編集後のタイトルに当たらない。**06 に無い論点**（§3-3・§9-2） |
| **J** | 06 §10-4「ゴミ箱に何件まで残しますか（既定 100 件）」「何日で自動的に消えてよいですか」 | **現状は上限も自動削除も無い**（`trash.ts:44-47` は無条件 push） | 「今の既定を変える」ではなく「**新しく作る**」機能。設計書の書きぶりが実装済みに読める |
| **K** | 06 §6-1「`pdf.routes.ts:84`」「`:168`」 | `:83` が `POST /export-pdf`、`:169` が `stage_diagram`/`slide` の除外（1行ずれ） | 軽微。ただし「クライアントから1度も呼ばれていない」は**正しい**（`grep` で 0 件） |
| **L** | 06 §2-1「InsertGap … スマホでは長押しメニューに置き換える」 | **モバイルには既にタップ展開式の InsertGap がある**（`CueCardList.tsx:177-228`） | 作り直す理由が無い。「そのまま」に直す |
| **M** | 06 §7・01 §0-1 の凍結解除の作業一覧 | `scripts/check-mobile-declared.mjs` に **qsheet が入っていない**／`client-qsheet/src/pcOnlyScreens.ts` が無い | 凍結を解く PR に**この2件を足す**（§6-1・PR12） |

### 10-1. 設計書の記述で、実装と合っていたもの（確認済み）

`data` は Yjs の所有物で 3 秒 debounce の丸ごと上書き（`collab.ts:56-74` / `roomManager.ts:113-131`）／
`applyDataUpdate` の3手順（`ydocDiff.ts:187-193`）／`sectionTemplates` の読み手 0 件（`CueTable.tsx:762` が唯一の書き手）／
`presenceList()` が未 export（`socket.ts:28`）／`slide` に書き込み経路が無い（`CueRow.tsx:566-575`）／
`stage_diagram` が配列 index 参照（`StageDiagramCell.tsx:81`）／`blk_${Date.now()}`・`led_${Date.now()}`
（`EditorSidebar.tsx:393,259`）／`PreviewModal` が実際に使われている印刷経路であること／
`pdf.routes.ts` に呼び手がいないこと／モバイルが `{entries:[{label}]}` と `cue` を書くこと
（`CueRowMobileEditor.tsx:39,265-285,337-346`）／`documents.routes.ts` が不正 `status` を `'draft'` に落とすこと（`:186`）。

**さらに 06 が挙げていない `Date.now()` 由来の id を2つ見つけました**（00 §4-3 は `blk_`/`led_` の2つだけ）:
`TrashDrawer.tsx:51` の `restored-${Date.now()}` と、`CueCardList.tsx:89,103` の
`row_${Date.now()}_${random}`。**どちらも `genId()` に寄せてください。**
