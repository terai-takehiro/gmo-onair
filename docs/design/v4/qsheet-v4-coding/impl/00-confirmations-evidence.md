# 最優先の確認5件 — 実装で裏を取った事実

> [`../README.md`](../README.md) §4「最優先（これが決まらないと着手できない）」の5件について、
> **設計書の主張を実装で1つずつ確かめた**記録です。コードは1行も変えていません。
>
> **読み方**: 各件に「設計書の主張／実装で確かめた事実／判定／利用者に訊くときの一言／
> どちらを選ぶと何が増えるか」の5点を置いています。
> 判定は **合っている / ずれている / 未確認** の3つだけです。
> **確かめられなかったことは「未確認」と書きました**（README §5-2 が示すとおり、
> この一連の設計書は実装との食い違いが 32 件見つかっているので、書いてあることを信用していません）。
>
> 調査日: 2026-08-21 ／ 対象ブランチ: `claude/qsheet-v4-coding-guide-udbo1u`（`67407c1`）

---

## 1. 本番4画面の見た目を v4 に変えてよいか

### 設計書の主張

- 01 §0-1: 「`index.css` の tokens を差し替えると、**同じバンドルの
  `/qsheet/onair/:id` `/qsheet/rundown/:id` `/qsheet/prompter/:id` `/qsheet/audio/:id`
  の見た目も同時に変わる**」
- 01 §9-12 / 07 §2: 既定は「本番4画面＋公開音声だけ旧トークンで固定する」。
  `client-qsheet/src/styles/legacy-onair.css` に `tokens.css` の変数定義を
  `.qs-legacy-shell { … }` としてスコープ付きで複製し、4画面のルート要素に付ける。

### 実装で確かめた事実

**(a) 1バンドル・1 CSS であることは本当。**

| 事実 | 出どころ |
| --- | --- |
| Vite の入口は1つ（`index.html` → `main.tsx`）。`base: '/qsheet/'` | `client-qsheet/vite.config.ts:7` / `client-qsheet/index.html:31` |
| CSS の読み込みも1回だけ（`main.tsx` が `index.css` を import） | `client-qsheet/src/main.tsx:10` |
| その `index.css` の1行目の import が `tokens.css` | `client-qsheet/src/index.css:2` |
| 本番4画面は**同じ `<Routes>` の中の兄弟ルート**。`AppShell` の有無が違うだけ | `client-qsheet/src/App.tsx:43-48` |
| `React.lazy` / 動的 `import()` は `client-qsheet/src` に**0件**（実測）。分割されない | grep 実測（0件） |
| 凍結検査の対象に `qsheet` が入っている | `scripts/check-frozen-css.mjs:47` |
| アプリ登録の `frozen: true` | `shared/src/client/apps.ts:147` |
| `tokens-v4.css` は `tokens.css` を import したうえで**同じ名前の変数を `:root` で上書き**する差し替え式。読ませるかどうかは `base.css:38` の import 1行 | `shared/src/client/tokens-v4.css:45-48` / `shared/src/client/base.css:33-38` |
| 上書きされる変数は **27 個**（`--background` `--foreground` `--primary` `--border` `--radius` `--font-sans` ほか） | `shared/src/client/tokens-v4.css:48-122`（実測 27 宣言） |

**(b) 実際にどれだけ変わるかは画面によって違う。** 各画面のクラス名を数えた実測値:

| 画面 | 意味トークン由来の色指定 | 直書き色（`zinc-` 等） |
| --- | ---: | ---: |
| `OnAirPage.tsx` | **87** | 2 |
| `RundownPage.tsx` | **56** | 1 |
| `PrompterPage.tsx` | **24** | 3 |
| `AudioSupportPage.tsx` | **0** | **48** |

→ **進行・ランダウン・プロンプターは丸ごと変わる。公開音声（`/qsheet/audio/:id`）は
ほぼ変わらない**（`bg-zinc-950` などの直書きで作られている。`AudioSupportPage.tsx:156-390` 付近）。
**設計書は4画面を同列に扱っているが、公開音声だけは別枠**です。

**(c) ⚠️ 代替案「`.qs-legacy-shell` に変数を複製する」だけでは足りない。**
`tokens-v4.css` には**変数以外の規則が入っており、そちらはスコープを付けても止まりません**:

| 規則 | 出どころ | 本番4画面への当たり方 |
| --- | --- | --- |
| `:where(button, a, [role='button'], summary, [data-ui='button'])` に `transition` | `shared/src/client/tokens-v4.css:451-460` | 素の `<button>` が OnAir 9 / Rundown 8 / Prompter 3 個（実測）。全部当たる |
| 押している間 `transform: scale(0.97)` | `shared/src/client/tokens-v4.css:472-474` | 同上。**本番卓のボタンの手応えが変わる** |
| `:focus-visible` に `outline: 2px solid` | `shared/src/client/tokens-v4.css:539-542` | 全画面に当たる |
| `@media (max-width:1023px)` で `[data-ui='button']` を `min-height/width:44px` | `shared/src/client/tokens-v4.css:232-241` | Rundown 4 個・Prompter 1 個の `<Button>`（`client-qsheet/src/components/ui/button.tsx:1` が shared を再輸出、`shared/src/client/ui/button.tsx:55` が `data-ui="button"` を付ける） |
| `prefers-reduced-motion` の `*` 一括停止 | `shared/src/client/tokens-v4.css:501-510` | 全画面 |
| LINE Seed JP の同梱（`--font-sans` ごと） | `shared/src/client/tokens-v4.css:45` | `index.css:29,33` が `var(--font-sans)` を使っているので**書体が全画面で変わる** |

なお `rounded-card` / `text-cardtitle` などの役割名クラスの上書き（`tokens-v4.css:185-206`）は、
**本番4画面では使用0件**（実測）なので効きません。

**(d) ⚠️ 設計書が触れていない副作用: ダークモードが壊れます。**

- `tokens.css:197` に `.dark { … }` があり、**ランダウンとプロンプターは `<html>` に
  `dark` を付けて動いています**（`RundownPage.tsx:181-186` / `PrompterPage.tsx:91-94`。
  プロンプターは常時ダーク固定）。
- `tokens-v4.css` に `.dark` の定義は**1件もありません**（実測 0 件）。
- `tokens-v4.css` は `@import './tokens.css'`（46行目）の**あと**に `:root { … }`（48行目）を書きます。
  `:root` と `.dark` は**詳細度が同じ (0,1,0)** なので、**後に出る `:root` が勝ちます**。
  → **`.dark` が効かなくなり、ランダウンとプロンプターが白地になります。**
- v4 の3アプリでこれが露見していないのは、**`client` / `client-daily` / `client-equipment` が
  `dark` クラスを1度も付けないから**です（実測 0 件）。

`.qs-legacy-shell` 方式を採るなら、**`.dark .qs-legacy-shell` の組も複製する**必要があります
（設計書には書かれていません）。

### 判定

**合っている（ただし2点で不正確・1点が抜けている）。**

- ✅ 「1バンドルで同時に変わる」— **本当**。
- ⚠️ 「本番4画面」— **正しくは3画面**。公開音声は直書き色なのでほぼ動かない。
- ⚠️ 「tokens を旧値でスコープ固定すれば凍結の約束が守れる」— **色と書体は守れるが、
  ボタンの手触り・フォーカス枠・スマホの 44px は守れない**（変数ではないため）。
- ❌（抜け）**ダークモードが死ぬ**件が設計書のどこにも無い。ランダウン／プロンプターは
  ダーク前提の画面なので、**これは見た目の微差ではなく本番中の可読性の問題**です。

### 利用者に訊くときの一言

> 制作資料は**1つのプログラムで7画面ぜんぶを描いています**。新しい画面を v4 の色にすると、
> **進行・ランダウン・プロンプターの3画面も同時に色と書体が変わります**（公開音声はもともと
> 黒地の作りなのでほぼ変わりません）。**本番の3画面だけ今の見た目のまま残す**こともできますが、
> 追加の作業が要り、しかも**ボタンを押したときの反応・キーボードの枠・スマホでのボタンの大きさは
> 完全には戻せません**。加えて、**ランダウンとプロンプターの黒背景（ダークモード）は
> 別途の手当てが要る**ことが分かりました。「本番3画面も v4 の見た目でよい」か、
> 「今のままにする（作業が増える）」か、どちらにしますか。

### どちらを選ぶと何が増えるか

| 選択 | 増える作業 | 見積り |
| --- | --- | --- |
| **(a) 本番3画面も v4 の見た目にする** | `index.css:2` を `base.css` に差し替え／`check-frozen-css.mjs:47` から `qsheet` を外す／`apps.ts:147` の `frozen: true` を落とす／**`.dark` の扱いを決める**（`tokens-v4.css` に `.dark` を足すか、Rundown/Prompter のダーク強制をやめるか）／本番3画面の目視確認 | **小〜中**。CSS の作業は小、**ダークの手当てと本番画面の目視確認が中** |
| **(b) 本番3画面だけ旧トークンで固定** | (a) の全部 ＋ `legacy-onair.css`（変数 27 個 × 明暗2組 ＝ 54 宣言）／4画面のルートに `.qs-legacy-shell` を付ける／**`tokens-v4.css` の変数以外の6規則を打ち消す指定を書く**（`:where()` 由来は詳細度0なので上書き可能だが、`@media` の 44px は個別に戻す必要あり）／このファイルを**この先ずっと `tokens-v4.css` と同期させる** | **中〜大**。初回の実装は中だが、**同期の負債が永久に残る**のがいちばん重い |

---

## 2. MCP は「提案まで」でよいか

### 設計書の主張

- 05 §6-3: 第2版でサーバー適用にするなら `roomManager` に2メソッド
  （`setBroadcaster` / `mutate`）を追加し、`ydocOps.ts` と `stableIds.ts` を
  `shared/` と `server/src/shared/` に**複製**し、`check-collab-parity.mjs` の `PAIRS` に足し、
  さらに**行単位の楽観ロック**（`UpdateRowOp.expect`）が要る。
- 05 §15-7: ツールが **82 → 90 本**に増える。

### 実装で確かめた事実

| 主張 | 実装 | 出どころ |
| --- | --- | --- |
| 現行 MCP ツールは 82 本 | **82 本ちょうど**（`registerTool` の実測。19 ファイル） | `server/src/contexts/mcp/tools/*.tools.ts` |
| `roomManager` の実体 | `YjsRoomManager` クラス。公開メソッドは **`acquire` / `release` / `getState` / `applyUpdate` / `flush` / `isOpen` の6つだけ** | `server/src/shared/collab/roomManager.ts:35-137` |
| サーバーから Yjs へ書く経路が今あるか | **無い。** `qsheetRooms` を呼んでいるのは `socket.ts` の4行だけで、すべて**クライアントから来た更新の中継**。`Y.Doc` をサーバー側で直接編集する呼び出しは1件も無い | `server/src/contexts/qsheet/socket.ts:106,113,121,172`（grep 実測でここだけ） |
| 中継の仕組み | `socket.to(room).emit('yjs:update', …)` — **発信元の socket が起点**。サーバー発の更新を配る口が無い | `server/src/contexts/qsheet/socket.ts:121-123` |
| 複製と parity 検査は実在するか | **実在する。** `PAIRS` は現在2対（`yjsDoc.ts` / `projectCollabDoc.ts`）。コメント差以外が1行でも違えば `exit 1` | `scripts/check-collab-parity.mjs:20-24` |
| 昇格するファイルの重さ | `ydocOps.ts` = **225 行**（依存は `yjs` と、**すでに複製済みの** `shared/src/collab/yjsDoc.ts` と `genId` だけ）／`stableIds.ts` = **96 行**（import 0） | `client-qsheet/src/lib/collab/ydocOps.ts:7-9` / `client-qsheet/src/lib/stableIds.ts` |
| 楽観ロックが collab 経路に無いか | **無い。** `applyUpdate` は無条件に `Y.applyUpdate` するだけ。競合検出の仕組みは Yjs の CRDT に丸投げで、「AI が見た時点の値」を確かめる場所は存在しない | `server/src/shared/collab/roomManager.ts:105-111` |

**⚠️ 設計書が書いていない落とし穴を1つ見つけました。**
`applyUpdate` は `const room = this.rooms.get(docId); if (!room) return;`
（`roomManager.ts:106-107`）で、**部屋が開いていなければ黙って何もしません**。
つまり「誰も編集画面を開いていないとき」に既存メソッドをそのまま使うと、
**エラーも出さずに取り込みが消えます**。05 §6-3 の手順は `acquire` から始めているので
**設計としては正しい**のですが、「既存の `applyUpdate` を呼べばよい」と勘違いすると事故ります。

### 判定

**合っている。**
「サーバーから Yjs ルームへ書く経路は今まったく無い」は**実装どおり**で、
必要になる部品（2メソッド・複製2ファイル・parity・楽観ロック）の並びも正確です。
ツール本数 82 も実測と一致しました。

ただし**「重さ」の見積りは設計書が示唆するより軽い**と読めます。
昇格する2ファイルは合計 **321 行・外部依存ほぼ無し**で、複製と parity の仕組みは
**すでに動いている前提の上に1対足すだけ**です。重いのは**楽観ロック（`expect` の突合と
「その行だけ飛ばす」の設計・テスト）と、それを会話にどう見せるか**のほうです。

### 利用者に訊くときの一言

> 第1版では、Claude と会話して**台本の案を作るところまで**が会話で完結し、
> **「これで入れて」の一手だけは編集画面に戻って押す**形になります。
> 会話の中でそのまま反映させたい場合、**サーバーが台本を直接書き換える仕組み**を作ることになり、
> そこには「AI が読んだあとに人が直していたら、その行だけ黙って飛ばす」という
> **取り違え防止の仕掛け**が必要です。**一手を惜しむために、その仕掛けを第1版で払いますか。**

### どちらを選ぶと何が増えるか

| 選択 | 増える作業 | 見積り |
| --- | --- | --- |
| **(a) 提案まで（第1版の既定）** | 追加なし | — |
| **(b) 会話の中で取り込みまで** | `roomManager` に `setBroadcaster` / `mutate`（合わせて 30〜40 行程度）／`ydocOps.ts`+`stableIds.ts` の昇格と複製（321 行 × 2 か所）／`check-collab-parity.mjs:21` に2対追加／**行単位の楽観ロック（`expect` の比較・`row_changed` の返し方・部分適用の見せ方）**／「部屋が開いていないとき」の経路のテスト | **中**。部品の移設は**小**、**楽観ロックとその見せ方が中**。 判断のコストのほうが実装より大きい（04 §3-1 の「書き込みはクライアント」という決めを裏口から破る） |

---

## 3. Excel 読み込みは (A) 自社往復 か (B) 他社フォーマット取込 か

### 設計書の主張

- 03 §12-1: 「(A) ONAiR から書き出した台本を Excel で直して戻す」か
  「(B) 他社・他部署の別フォーマット Excel を取り込む」か。**(B) なら手動マッピング UI が機能の中心**になる。
- 03 §12-10: 「`/qsheet` の『Excel出力』『Excelから読み込み』ボタンは、**今は押しても何も起きません**」
- README §5-2 #30: 「Excel 出力が同じリリースで2系統になる（02=SheetJS・03=ExcelJS）。**ExcelJS に統一**」

### 実装で確かめた事実

**(a) 制作資料に Excel（.xlsx）の実装は1本もありません。あるのは CSV です。**

| 事実 | 出どころ |
| --- | --- |
| `xlsx`（SheetJS）は **server の依存にだけ**あり、`client-qsheet` は使っていない | `server/package.json:42`（grep 実測: client-qsheet に xlsx の import 0件） |
| 「Excel出力」の実体は**CSV を書き出す関数**。関数名も `exportCsv`、コメントも「Excel export (CSV-based for simplicity without xlsx dep)」、落ちるファイルも **`.csv`** | `client-qsheet/src/pages/EditorPage.tsx:132-134`, `:191` |
| 「Excelから読み込み」の実体は **CSV パーサ**（RFC 4180） | `client-qsheet/src/lib/csvImport.ts:9-37` |
| その CSV 取込のダイアログ | `client-qsheet/src/components/editor/CsvImportDialog.tsx` |

**(b) 「ボタンが押しても何も起きない」は本当。ただし別の場所に動く導線があります。**

- サイドバーの「Excel入出力」の2つのボタンは `onExportExcel` / `onShowImport` を呼びますが
  （`EditorSidebar.tsx:716`, `:723`）、**この2つは省略可能な prop で
  （`EditorSidebar.tsx:80-81`）、`EditorPage` から渡されていません**
  （`EditorPage.tsx:763-780` の `<EditorSidebar …>` に該当 prop 無し／`EditorSidebarSheet` も同様）。
  → **`undefined` なので押しても本当に何も起きません。設計書の指摘は正しい。**
- ただし**ヘッダーのツールバーには動く「CSVエクスポート」「CSVインポート」があります**
  （`EditorPage.tsx:632`, `:637`）。どちらも `hidden md:flex` なので **PC 幅でだけ見えます**。
  → 「Excel 経路がまったく使われていない」のではなく、**"Excel" と書いてあるボタンだけが死んでいて、
  "CSV" と書いてあるボタンは生きている**、が正確です。

**(c) 今の実装は疑いようもなく (A)（自社往復）向けに作られています。**

| 根拠 | 出どころ |
| --- | --- |
| 取込は**この台本自身のブロック名と完全一致**する列しか拾わない（`norm(h) === norm(b.label)`）。別名の吸収も、人が対応を選ぶ画面も無い | `client-qsheet/src/lib/csvImport.ts:68-71` |
| 「セクション」列が無ければ**その場でエラー**（`「セクション」列が見つかりません`）。これは書き出し側が必ず出す列名 | `client-qsheet/src/lib/csvImport.ts:57-58` / 書き出し側の見出し `["#","セクション","尺", …]` は `EditorPage.tsx:136` |
| どのブロックにも当たらない列は `unmatchedHeaders` に入れて**黙って捨てる** | `client-qsheet/src/lib/csvImport.ts:50`, `:73` |
| 読み戻しの解析は**自分の書き出し形式を前提**にしている（`Ch1:ON 田中/SM58` を正規表現で戻す等） | `client-qsheet/src/lib/csvImport.ts:91-104` |

**(d) 11型のうち3型は今も往復しません。**
`slide` / `stage_diagram` / `led_xr` は取込時に `undefined` を返します
（コメント: 「画像 / 構造データは CSV から復元不可」）— `client-qsheet/src/lib/csvImport.ts:113-116`。
ブロック型が11種類あることは `client-qsheet/src/components/editor/EditorSidebar.tsx:87-98` で確認しました。

**(e) ⚠️ 設計書が知らないと思われる事実: (B) の部品はもう社内にあります。**

| 事実 | 出どころ |
| --- | --- |
| **列の対応を人が選ぶ Excel 取込**は機材管理で稼働中 | `client-equipment/src/components/ExcelImportDialog.tsx` / `client-equipment/src/components/ConsumableExcelImportDialog.tsx` |
| サーバー側も `mapping?: Record<string, string｜null>` を受け、明示スキップ・正規化フォールバック・見つからない列の警告まで実装済み | `server/src/shared/utils/excel.ts:96-133` |
| その口を使っているルート | `server/src/contexts/equipment/routes/excel.routes.ts:246` / `cables.routes.ts:271` / `connectors.routes.ts:263` |

つまり **(B) を選んでも「機能の中心を新規に作る」ことにはならず、動いている実装を写せます。**

**(f) ⚠️ ExcelJS はこのリポジトリに入っていません。**
`package.json` 全走査で `exceljs` は0件、`node_modules/exceljs` も無し。
README §5-2 #30 の「ExcelJS に統一」は、**既存を統一する話ではなく新しい依存を1つ増やす話**です
（既存の Excel 実装は全部 SheetJS）。

### 判定

**ずれている（3点）。**

- ✅ 「Excel のボタンが死んでいる」— **本当**（ただし CSV のボタンは生きている）。
- ❌ 前提の「Excel 読み込みがある」— **無い**。あるのは CSV で、しかも**(A) 専用の作り**。
  「(A) か (B) か」ではなく、**「今あるのは (A) の CSV だけ。(B) は0から」**が実態です。
- ❌ 「(B) なら手動マッピング UI が機能の中心になる（＝重い）」— **社内に動く実装があるので、
  設計書が言うほど重くありません**。
- ❌ 「ExcelJS に統一」— **統一ではなく新規依存の追加**。

### 利用者に訊くときの一言

> 制作資料の「Excel出力／Excelから読み込み」のボタンは、**調べたところ押しても何も起きない状態**でした
> （動いているのは隣の「CSVエクスポート／CSVインポート」で、PC 幅でだけ出ます）。
> しかもその CSV 取込は、**ONAiR が書き出した形そのものしか読めません**
> （列の名前が1文字違うと無視されます）。
> **お使いになりたいのは (A) ONAiR から出した台本を Excel で直して戻す、ですか。
> それとも (B) 他社・他部署から届いた別の形の Excel を読み込む、ですか。**
> (B) の場合は**実物のファイルを1つ**いただけると設計が正確になります。
> なお (B) の「どの列がどれか人が選ぶ画面」は**機材管理で既に動いているので、それを写せます**。

### どちらを選ぶと何が増えるか

| 選択 | 増える作業 | 見積り |
| --- | --- | --- |
| **(A) 自社往復** | 列定義を1本に固める／`.xlsx` の書き出し（SheetJS の `buildExcelWorkbook` が既にある）／11型のうち往復しない3型（`slide`/`stage_diagram`/`led_xr`）をどうするか決める | **中**。往復の正しさ（id の突合・取消）が本体 |
| **(B) 他社フォーマット取込** | (A) の全部 ＋ 列対応を選ぶ画面（**機材管理から流用可**）／尺・話者の書き方の揺れの吸収／**実物ファイルが要る** | **中〜大**。ただし**「大」の主因は UI ではなく、他社の書き方の揺れを吸収する規則をどこまで作るか** |
| **両方** | (B) に (A) が含まれる（自社の書き出し＝列名が完全一致するファイル） | **大** |

---

## 4. `slide`（スライド）を編集可能にするか

### 設計書の主張

- 06 §3: 「`CueRow.tsx:565-574` は**破線の枠を描くだけで、書き込み経路がありません**（読みだけの幽霊型）」
- 06 §3: 「**新しい仕組みは1つも要りません。** 既存の `ImageDropZone` と `/qsheet/upload-image` をそのまま流用」

### 実装で確かめた事実

| 主張 | 実装 | 出どころ |
| --- | --- | --- |
| 破線の枠を描くだけ | **本当。** `<div className="… border-dashed …">` にアイコンと「スライド」の文字を置くだけ。`onChange` も `onDrop` も `<input>` も無い。**コメントには `Slide cell (image drop zone)` と書いてあるが、drop zone は存在しない** | `client-qsheet/src/components/editor/CueRow.tsx:565-576`（設計書の `565-574` はほぼ正確） |
| 読み出し側は既にある | **ある。** 印刷プレビューは `cell.image` を読んで `<img>` で出す。**誰も書かない値を読む口だけが先にできている** | `client-qsheet/src/components/editor/PreviewModal.tsx:713-718` |
| CSV でも復元不可 | **そのとおり**（`slide` は `undefined` を返す） | `client-qsheet/src/lib/csvImport.ts:113-116` |
| 11型のうち1つ | **11型で確認**（`scenario` `video` `slide` `telop` `audio` `audio_mic` `led_xr` `lighting` `stage_diagram` `remarks` `item`） | `client-qsheet/src/components/editor/EditorSidebar.tsx:87-98` |

**画像アップロードの経路は完成しており、他の型では実際に使われています。**

| 事実 | 出どころ |
| --- | --- |
| API は `POST /api/v1/internal/qsheet/upload-image`（**base64 の JSON body**。multer ではない）。5MB 上限・**マジックバイトで実体を検証**・ランダム16バイトのファイル名・パス脱出の二重チェック | `server/src/contexts/qsheet/routes/upload.routes.ts:44-94` |
| 保存先は**サーバーのファイルシステム** `server/uploads/qsheet/`。配信は `GET /api/v1/internal/qsheet/images/:filename`（`Cache-Control: immutable` / `nosniff`） | `server/src/contexts/qsheet/routes/upload.routes.ts:13`, `:88`, `:99-135` |
| ルーターの登録 | `server/src/contexts/qsheet/index.ts:17`（`requirePermission('qsheet','editor')` が全体に掛かる — `upload.routes.ts:9`） |
| **実際に使っている部品**: `EntryImageButton`（`CueRow.tsx` 内のローカル部品）が `scenario` と `video`/`audio`/`telop` の**エントリ単位**で画像を添付している | `client-qsheet/src/components/editor/CueRow.tsx:108-149`（アップロードは `:137`）／使用箇所は `:447` と `:500` |

**⚠️ 設計書の1点が事実と違います。**
06 §3 は「既存の **`ImageDropZone`** を流用」と書いていますが、
**`ImageDropZone.tsx` はどこからも import されていません**（grep 実測 0 件）。
実際に本番で動いているのは `CueRow.tsx` 内のローカル部品 `EntryImageButton` のほうです。
`ImageDropZone.tsx` は同じ API を叩く**未使用のファイル**で、
「使われている実績のある部品」と言えるのは `EntryImageButton` です
（`ImageDropZone` はドラッグ＆ドロップ対応で、`slide` のセルには**そちらのほうが向いていますが、
一度も画面に出たことがないものを流用する**ことになります）。

もう1点、**保存の持ち方が他型と違います**。`scenario`/`video`/`audio`/`telop` は
`entries[i].image`（エントリ単位）ですが、`slide` は `audio_mic`/`stage_diagram` と同じ
**行単位のセル**として扱われています（`client-qsheet/src/lib/migrateEntries.ts:48`）。
06 §3 が言う `cell.image` はこの行単位の持ち方と整合し、`PreviewModal.tsx:716` の読み方とも一致します。
**設計書の結論は正しい**が、「`entries[0].image` と同じ持ち方」という説明文だけは不正確です。

### 判定

**合っている（部品名1件が不正確）。**

- ✅ 「書き込み経路が無い」— **本当**。行番号もほぼ正確（565-576）。
- ✅ 「新しい仕組みは要らない」— **本当**。API・保存先・配信・権限すべて既にある。
- ⚠️ 「既存の `ImageDropZone` を流用」— **`ImageDropZone` は未使用ファイル**。
  動いている実績があるのは `EntryImageButton`。どちらを使うかは実装時の判断だが、
  **「既に動いているものを流用する」という説明は `ImageDropZone` については成り立ちません**。

### 利用者に訊くときの一言

> 台本の「スライド」の欄は、**今は破線の四角が出るだけで、何も入れられません**（11 種類のうち、
> ここだけ書き込む口がありません）。一方で、**画像を貼り付ける仕組み自体は既にあって、
> シナリオ・映像・音声・テロップの欄では実際に使われています**（サーバーへの保存も配信も動いています）。
> **スライドの欄も同じやり方で画像を入れられるようにしますか。**
> 作らない場合は「11 種類のうちスライドだけは見るだけ」という状態が v4 でも続きます。

### どちらを選ぶと何が増えるか

| 選択 | 増える作業 | 見積り |
| --- | --- | --- |
| **(a) 作る** | `CueRow.tsx:565-576` の `<div>` を差し替え（`EntryImageButton` を行単位で使うか、`ImageDropZone` を初めて画面に出すか）／セルの値を `cell.image` に決める／Yjs の差分（`ydocOps`）で行単位セルとして扱えることの確認／削除・差し替えの導線 | **小**。**API も保存先も権限も既にあり、読み出し側（印刷）も既に書かれている** |
| **(b) 作らない** | 06 §10 の先頭に「11型のうち `slide` は表示のみ」と明示（設計書の指示どおり）／Excel の列を出すかの判断（03 §11-2 #5） | **なし**（ただし「11型を1つも減らさない」が実質破れる） |

---

## 5. 実尺の記録を AI 実装より先に入れてよいか

### 設計書の主張

- README §4-5: 「『AI が置いた尺がどれだけ押したか』は**現在まったく記録されていません**」
- 04 の要点8: 「本番の実尺は現在どこにも保存されていない（**`RundownPage.tsx:135` の `useState` だけ**）」
- 04 §13-4: 「先に実尺表だけ入れて数か月データを貯めてから AI 機能を作るほうが、
  初回から digest が効いて立ち上がりが速いかもしれません」
- README §5-2 #3: 「04 は『`cue:next` を発火した端末が POST』としていたが、
  **OnAir は `cue:next` を出さない**（出すのはランダウンだけ）」

### 実装で確かめた事実

**(a) 保存はどこにもされていません。**

| 事実 | 出どころ |
| --- | --- |
| Qシートのテーブルは **4本だけ**（`qsheet_documents` / `qsheet_stage_templates` / `qsheet_document_shares` / `qsheet_doc_yjs`）。**実尺を入れる表は存在しない** | `012_qsheet_schema.sql:7`, `:29` ／ `102_qsheet_document_shares.sql:4` ／ `113_qsheet_yjs_state.sql:5`（qsheet の migration はこの3本のみ） |
| 実尺を書く API・サービス・ジョブは**1本も無い**（`cue_actuals` / `actual_sec` などの grep で0件） | 全 `server/src` 走査 |

**(b) ⚠️ ただし「まったく記録されていない」は言い過ぎです。計測のロジックは既にあります。**

`RundownPage.tsx` は**キューごとの実尺を実際に測って、画面に出しています**:

| 事実 | 出どころ |
| --- | --- |
| `actualDurations`（キュー index → 実測秒）を保持 | `client-qsheet/src/pages/RundownPage.tsx:135` |
| キューが切り替わったとき、直前キューの実測を記録。**順送り（`currentCue === prev + 1`）のときだけ**記録し、ジャンプ・巻き戻しは捨てる | `client-qsheet/src/pages/RundownPage.tsx:139-150` |
| 通過済みキューの実尺として**画面に表示している** | `client-qsheet/src/pages/RundownPage.tsx:598-605` |
| ただし `useState` なので**再読み込みで消える**。`cue:reset` でも全消し | `client-qsheet/src/pages/RundownPage.tsx:154-157`, `:297` |
| キーが**配列 index（`cue.globalIndex`）**。README §5-2 #16 が指摘する「ロールを1本足すと別のキューと同じ id になる」と同じ問題を**現行実装が既に抱えている** | `client-qsheet/src/pages/RundownPage.tsx:605` |

→ **04 の要点8（「`RundownPage.tsx:135` の `useState` だけ」）は正確**です。
**README §4 の要約（「まったく記録されていません」）だけが言い過ぎ**で、
利用者にそのまま伝えると「じゃあ0から作るのか」と受け取られます。

**(c) 「書き手」についての設計書の指摘は正しい。**

| 事実 | 出どころ |
| --- | --- |
| `OnAirPage` は `cue:next` を**受ける側**（`socket.on`） | `client-qsheet/src/pages/OnAirPage.tsx:337-346` |
| `cue:next` を**出す**のは `RundownPage` | `client-qsheet/src/pages/RundownPage.tsx:321` |
| `OnAirPage` が出すのは `cue:update`（`{ currentCue, elapsed, isPlaying }`）。**経過秒は OnAir が持っている**が、中継されるだけで保存されない | `client-qsheet/src/pages/OnAirPage.tsx:358` ／ 受け側 `server/src/contexts/qsheet/socket.ts:135` |

→ 「`cue:next` を発火した端末が POST」だと**ランダウンを開いていない本番では1件も記録されない**、
という README §5-2 #3 の指摘は**実装どおり**です。
07 §3 が書き手を OnAir に寄せた判断は妥当ですが、**そうすると
`RundownPage` に既にある計測ロジックは使えず、OnAir 側に書き直しになります**
（OnAir は `elapsed` を持っているので難しくはありません）。

**(d) `planned_sec` に当たるもの＝台本の中の尺の文字列。**

| 事実 | 出どころ |
| --- | --- |
| 実体は `qsheet_documents.data`（JSONB）の中の `section.duration` と `row.duration`。**専用カラムではなく、`"1:30"` のような文字列** | `012_qsheet_schema.sql:10` ／ 使用例 `client-qsheet/src/lib/csvImport.ts:190-193`, `client-qsheet/src/pages/EditorPage.tsx:147` |
| 誰がいつ書き換えるか | **編集画面を開いた人が、いつでも**。同時共同編集なので Yjs 経由で即反映され、3秒 debounce で JSONB にも同期される（`server/src/contexts/qsheet/collab.ts:62-73`）。**CSV 取込でも書き換わる**（`csvImport.ts:190-193` はロール尺が空なら行の合計で埋める） |
| **つまり「AI が置いた尺」と「人が本番当日に直し終わった尺」が同じ場所に上書きで入る** | 上記のとおり（04 §5-3a の指摘＝README §5-2 #4 と一致） |

### 判定

**合っている（要約の1語が言い過ぎ）。**

- ✅ 「どこにも保存されていない」— **本当**（表も API も無い）。
- ⚠️ 「まったく記録されていない」（README §4）— **計測して画面に出す実装は既にある**。
  消えるのが問題であって、0から作るわけではありません。04 本文のほうが正確です。
- ✅ 「OnAir は `cue:next` を出さない」— **本当**。
- ✅ 「`planned_sec` は人が直した後の値なので AI の評価に使えない」— **本当**
  （同じ JSONB を人も AI も上書きする）。

### 利用者に訊くときの一言

> 「予定していた尺に対して、実際に何秒かかったか」は、**ランダウン画面では今も測って表示しています**。
> ただし**画面を閉じると消えて、どこにも残りません**。台本に書いてある尺のほうも、
> 本番当日に人が直すと上書きされるので、**あとから『AI の見積もりが何秒ずれたか』は追えません。**
> **先に「実尺を残す」だけを入れて数か月まわしてから AI を作ると、
> AI が最初から実績を踏まえた尺を出せます。** 順番はどちらにしますか。

### どちらを選ぶと何が増えるか

| 選択 | 増える作業 | 見積り |
| --- | --- | --- |
| **(a) 実尺を先に入れる** | 表1本（migration）／保存 API 1本／**OnAir 側に計測を移す**（`elapsed` は既にある。ランダウンの `139-150` のロジックを写す）／**キューの id を index から `section_id`＋`pass_no` に変える**（README §5-2 #16・#17 の指摘。**ここが本体**） | **中**。表と API は小、**キューの id を安定させるのが中** |
| **(b) AI と同時に出す** | (a) の全部を AI と同じリリースで／ただし**初回の digest は空**なので、AI の尺は実績抜きで始まる | **中**（作業量は同じ。**効きが遅れるだけ**） |
| **(c) 実尺を入れない** | 04 の成果指標（条件3）が**測れないまま**になり、「AIを使い捨てにしない」の5条件が1つ欠ける | **なし**（ただし方針違反） |

---

## 6. この5件のうち、実は訊かなくても決められるもの

**2件あります。**

### ④ `slide` を編集可能にするか → **訊かずに「作る」で進めてよい**

理由:

1. **利用者が既に「11種類を1つも減らさない」と決めています**（06 §3 が引く絶対条件）。
   `slide` を作らないと**その決めが実質破れる**ので、「作るか」を訊くと
   **既に決まっていることを訊き直す**ことになります。
2. **判断の材料になるはずの「工数」が実質ゼロ**です。API（`upload.routes.ts:44-94`）も
   保存先も配信も権限も**既に本番で動いており**、読み出し側（`PreviewModal.tsx:713-718`）は
   **`cell.image` を読む口が既に書かれています**。書く口だけが無い。
3. 「作らない」を選ぶ合理的な理由が**実装側に見当たりません**。
   （利用者が「スライドの欄は現場では使っていない」と言う可能性はありますが、
   それは「作るか」ではなく「**そもそも `slide` という型が要るか**」という別の質問です。
   訊くならこちらを訊くべきです。）

→ **§4 の最優先から外し、06 §10 の「中」に落としてよい**と考えます。
訊くとしても「**スライドの欄は現場で実際に使っていますか**」に置き換えるほうが実になります。

### ⑤ 実尺の記録を先に入れるか → **順番は訊かなくてよい。訊くべきは別のこと**

理由:

1. **「実尺を記録する」こと自体は決まっています**（04 §5-3a・07 §3 とも、
   条件3の代替が無いと明言）。訊いているのは**順番だけ**です。
2. その順番は**実装側の都合で答えが出ます**: 実尺の表と保存 API は
   AI 機能のどの部分にも依存しません（04 §13-4 自身が「厳密には AI 機能ではない」と認めている）。
   **後に回す理由が無く、先に入れて損をする筋書きが1つもありません**
   （先に入れて AI をやめても、実尺は単独で次回の見積もりに効く）。
3. 逆に**訊かないと決められないのはこちら**です:
   **「本番でランダウン画面を開かない日がありますか」**。
   `cue:next` を出すのはランダウンだけ（`RundownPage.tsx:321`）で、
   OnAir は受けるだけ（`OnAirPage.tsx:337`）。**進行卓だけで回す運用があるなら、
   07 §3 の「書き手を OnAir に固定」が正解**ですが、**そこは実装からは分かりません**。

→ **§4 の5件目は「先に入れてよいか」ではなく
「本番でランダウンを常に開いていますか」に差し替える**ほうが、
返ってきた答えがそのまま設計に効きます。

### 残る3件は訊かないと決められません

- **①凍結**: 「本番の業務が止まらないことが最優先」という**約束と衝突する**判断で、
  しかも**完全には戻せない副作用**（ボタンの手触り・ダークモード）があります。実装からは決められません。
- **②MCP**: 「一手を惜しむか」は**期待値の問題**で、実装からは決まりません。
- **③Excel**: **(B) の実物ファイルが無いと設計そのものが書けません**。
  加えて「今のボタンが死んでいた」ことは利用者に伝える必要があります
  （＝**今の使い方に合わせるより、これから使いやすい形に倒してよい**可能性が高い）。

---

## 付録: 設計書が事実を外していた点（この調査で見つかったもの）

| # | 設計書の記述 | 実装 | 重さ |
| --- | --- | --- | --- |
| 1 | 01 §0-1 / 07 §2「**本番4画面**の見た目が同時に変わる」 | **3画面**。公開音声（`AudioSupportPage.tsx`）は意味トークンの使用**0件**・直書き 48 件でほぼ変わらない | 小（訊き方が変わる） |
| 2 | 01 §0-1 / 07 §2「`.qs-legacy-shell` に変数を複製すれば本番画面の見た目は今のまま」 | **変数以外の規則が6種類**（`:where(button…)` の `transition`・`:active` の `scale(0.97)`・`:focus-visible` の `outline`・スマホ 44px・`prefers-reduced-motion`・同梱書体）あり、**変数のスコープでは止まらない** | **中** |
| 3 | （記述なし） | **`tokens-v4.css` に `.dark` が1件も無く、`:root` が `.dark` を詳細度同点＋後勝ちで潰す。** ランダウン・プロンプターは `<html>` に `dark` を付けて動いている（`RundownPage.tsx:181-186` / `PrompterPage.tsx:91-94`） | **大**（本番画面が白地になる） |
| 4 | 03 §12-1 の前提「エクセルでの**読み込み**」 | 制作資料に **.xlsx の実装は1本も無い**。`exportCsv`（`EditorPage.tsx:134`）と CSV パーサ（`csvImport.ts`）だけ。`xlsx` 依存も `client-qsheet` には無い | **中** |
| 5 | 03 §12-1「(B) なら**手動マッピング UI が機能の中心**になる（＝重い）」 | **機材管理に動くマッピング UI と backend が既にある**（`client-equipment/src/components/ExcelImportDialog.tsx` / `server/src/shared/utils/excel.ts:96-133`）。写せる | 中（見積りが過大） |
| 6 | README §5-2 #30「Excel 出力を **ExcelJS に統一**」 | **`exceljs` はリポジトリに存在しない**（`package.json` 全走査で0件）。既存は全部 SheetJS。統一ではなく**新規依存の追加** | 中 |
| 7 | 03 §12-10「Excel のボタンは押しても何も起きない」 | **正しい**（`onExportExcel`/`onShowImport` が `EditorSidebar` に渡されていない）。ただし**ヘッダーの「CSVエクスポート／CSVインポート」は動いている**（`EditorPage.tsx:632,637`。`hidden md:flex` で PC 幅のみ） | 小（補足） |
| 8 | 06 §3「既存の **`ImageDropZone`** を流用」 | **`ImageDropZone.tsx` はどこからも import されていない**（未使用ファイル）。動いているのは `CueRow.tsx:108-149` の `EntryImageButton` | 小 |
| 9 | 06 §3「`cell.image`（`entries[0].image` と**同じ持ち方**）」 | `slide` は `audio_mic`/`stage_diagram` と同じ**行単位のセル**（`migrateEntries.ts:48`）。結論（`cell.image`）は正しいが説明が不正確 | 小 |
| 10 | README §4-5「実尺は**まったく記録されていない**」 | **計測して画面に出す実装は既にある**（`RundownPage.tsx:135,139-150,598-605`）。保存されないだけ。04 本文（「`useState` だけ」）のほうが正確 | 小（要約だけの問題） |
| 11 | 05 §6-3 の手順（`acquire` から始める） | **正しい。** ただし `roomManager.applyUpdate` は**部屋が開いていないと黙って何もしない**（`roomManager.ts:106-107`）。「既存メソッドで足りる」と誤読すると取り込みが無言で消える | 小（注意書き） |
| 12 | 06 §3「`CueRow.tsx:565-574`」 | 実際は **565-576**（1〜2行のずれ） | 極小 |

**確認できた主張**（＝そのまま利用者に出してよいもの）: 1バンドル1CSS ／
`check-frozen-css.mjs:47` と `apps.ts:147` の凍結 ／ MCP 82 本 ／
サーバーから Yjs へ書く経路が無いこと ／ parity 検査の実在 ／
`slide` に書き込み経路が無いこと ／ 画像アップロード経路の実在 ／
実尺の表が無いこと ／ OnAir が `cue:next` を出さないこと ／
`planned_sec` 相当が JSONB の文字列で誰でも上書きできること。

### 未確認のもの（この調査では確かめられなかった）

- **凍結アプリの CSS を実際にビルドして差分を測ってはいません**（`npm run build:all` が要るため、
  今回の作業範囲外）。上の①は**ソースの読みからの断定**で、バイト単位の実測ではありません。
- **本番・検証環境の実際の見え方**は確認していません（ネットワークに出ていません）。
- **`slide` / Excel / ランダウンが現場でどれだけ使われているか**は、
  実装からは分かりません（利用ログの仕組みがありません）。
