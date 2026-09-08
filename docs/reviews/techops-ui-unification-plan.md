# 制作技術支援（client-techops）UI 統一計画

**発端**: 「各ページの UI のデザイン思想が統一されていない。フォントの太さやサイズ、ページ幅など」
（2026-09-08・ユーザー指摘）。全 131 ファイルを機械的に数えた結果を下に置く。

**原因**: 凍結解除を段階的に進めている途中で、**v4 化を通ったブロック**（テロップCG・レンタル・
収録・設定書き出し・トップ）と、**client-live から移植しただけ／旧 Qシートのままのブロック**
（計時・スケジュール・配信・進行台本・エディタ）が同居している。
ページ幅は v4 側にも規約が無かった（`_rules.md` に本文幅の記述が無い）ため、
v4 化済みの画面同士でも割れていた。

---

## 監査の実測値（2026-09-08 時点）

| 観点 | 実測 |
| --- | --- |
| **ページ幅・余白** | ページ直下の枠が **8通り**（幅なし / `screen-2xl` / `6xl` ×2種の余白 / `5xl` ×2 / `4xl` / `3xl` ×2） |
| **見出し `<h1>`** | **11通り・14px〜24px**。`text-h1` は 7 か所（テロップCGのみ）、`truncate text-lg font-bold` 6 か所、`text-sm font-bold` 3 か所ほか |
| **`<h2>`** | `text-cardtitle` 8 か所 に対し手書き 17 か所 |
| **文字サイズ** | 生 Tailwind **535**（`text-xs` 298 / `text-sm` 187 / `text-base` 21 / `text-lg` 14 / `text-xl` 7 / `text-2xl` 5 / `text-3xl` 2 / `text-4xl` 1）vs v4 トークン **430** |
| **太さ** | `font-medium` 83 + `font-semibold` 78 = **161 か所が黙って 400/700 に落ちる**（LINE Seed JP は 400/700/800 のみ。本番4画面を除いても 151） |
| **角丸** | `rounded-lg` 93 / `rounded-md` 88 / `rounded-xl` 17 と、役割名 `rounded-card` 79 / `rounded-control-md` 55 / `rounded-note` 21 が混在 |
| **`PageHeader`** | 使用は **7 ファイルのみ**。残りは `<h1>` 手書き |
| **自前の上辺バー** | 3 画面（組織の鍵設定・既存セッション・過去実績の移行）がシェルのヘッダーと二重に持つ |
| **`env(safe-area-inset-bottom)` の誤用** | 5 画面。インライン指定が `p-*` の下余白に勝って **0px** になっていた |

---

## 決めたこと（段0・実施済み）

- **`<PageShell>` を新設**（`shared/src/client/ui/pageShell.tsx`）。幅は
  `full`（制限なし・一覧/表/ダッシュボード）と `narrow`（`max-w-3xl`・設定/フォーム）の**2段だけ**。
  余白は `p-3 lg:p-6` ＋ `gap-4 lg:gap-5`（案件管理の v4 画面と同じ値）
- **中間の段（`max-w-4xl` `5xl` `6xl` `screen-2xl`）は作らない**
- **`<h1>` は書かない。`<PageHeader>` を使う**
- **ページ側で `env(safe-area-inset-bottom)` を書かない**（共通シェルが持っている）
- 規約の正は [`docs/design/v4/_rules.md`](../design/v4/_rules.md) の「5. ページの外枠」

## 触らないもの（`client-techops/CLAUDE.md` の禁止事項そのまま）

- **本番中に使う4画面**: `OnAirPage.tsx` / `RundownPage.tsx` / `PrompterPage.tsx` /
  `AudioSupportPage.tsx` と、そこから呼ばれるコンポーネント
- **表本体**: `CueTable.tsx` / `CueRow*.tsx` / `components/editor/cells/*` / `EditorSidebar.tsx`
- **トーストを帯（`NoticeBar`）に置き換えない**
- `'Roboto Condensed'` の生 `fontFamily`（`index.html` の Google Fonts を外す段で別途）
- 見た目の統一以外の**挙動・文言・API・データの変更をしない**

---

## 結果（2026-09-08・段0＋A〜G 実施後）

| 観点 | 統一前 | 統一後 |
| --- | --- | --- |
| ページ直下の枠 | **8通り** | `<PageShell>` の**2段**（`full` / `narrow`）。30ファイルが使用 |
| 見出し `<h1>` | **11通り・14px〜24px** | `<PageHeader>`（`text-h1` = 23px/800）。31ファイルが使用（統一前 7） |
| 生 Tailwind の文字サイズ | 535 | **229**（対象外の範囲が 211・対象内の残りは 18） |
| v4 の型スケール | 430 | **719** |
| `font-medium` / `font-semibold` | 161 | **89**（対象外の範囲が 88・対象内の残りは 1） |
| 自前の上辺バー | 4画面 | **0** |
| `env(safe-area-inset-bottom)` の誤用 | 5画面 | **0** |

`check-ui-tokens.mjs` の記録も締めた（`page-safe-area-by-hand` は 6→**0** で記録ごと消滅、
`page-h1-by-hand` は 18→**5**、`page-width-by-hand` は 15→**1**）。
残る 6 件はすべて**触らないと決めた範囲**（本番4画面と廃止済みの `DeviceSettingsHome`）。

### 対象内であえて残したもの（理由つき）

| 箇所 | 件数 | 理由 |
| --- | --- | --- |
| `components/live/TimerDisplay.tsx` の `text-4xl` | 1 | タイマーの数字そのもの。表示ロジック・等幅指定は変えない決め |
| `components/schedule/*` の素の `<select>` / `<textarea>` / 読み取り専用欄の `text-sm` | 14 | `shared/src/client/ui/input.tsx` が `sm:text-sm`（14px）のままなので、ここだけ 12.5px にすると**同じフォームの中で新しい不揃い**ができる。shared の入力部品を直す段で一緒に揃える |
| `pages/rental` / `settings-export` の `text-base` | 3 | 価格の強調と全幅CTAのラベル。型スケールに対応する役割の行が無い |

### 検査をどこまで当てているか（`check-ui-tokens.mjs`）

| 規則 | 当てている範囲 | なぜそこまでか |
| --- | --- | --- |
| `page-width-by-hand` | v4 対象4アプリの **`…Page.tsx`** | `src/pages/` の下には画面でない部品が **521 個**ある（ダイアログ・カード）。ディレクトリで見るとそれらもページ扱いになり、ダイアログを広げただけで見当違いの案内で lint が止まる。ルーターの `element={<…/>}` 68 個を数えると画面はすべて `Page` で終わる |
| `page-h1-by-hand` | v4 対象4アプリ（見出し部品の実装本体を除く） | 画面の名前は `<PageHeader>` が出す。**大きさではなくタグ**を見る（`text-h1` の手書きも、`className` が次の行にある書き方も拾う） |
| `page-safe-area-by-hand` | 画面（`pages` / `contexts`）のみ | 逃げを持っているのは共通シェル。シェル・下タブ側はここが本体 |
| **`page-shell-missing`** | **制作技術支援だけ** | 下記 |

**`page-shell-missing`（画面が `<PageShell>` を使っているか）を制作技術支援だけに当てている理由。**
幅トークンの列挙だけでは「本文の幅と余白は `<PageShell>` から来る」を守らせられない
（`max-w-2xl` でも `max-w-[900px]` でも `px-8` でも素通りする）ため足したが、
実測すると次の状態で、他アプリに当てると**直せない違反が 79 件並ぶ**。

| アプリ | ルート部品（`…Page.tsx`） | `PageShell` 未使用 |
| --- | --- | --- |
| 制作技術支援 | 33 | **7**（ログイン・編集・本番3画面・公開音声・テロップCG出力＝共通シェルの外） |
| 案件管理 | 54 | 54 |
| 日常業務 | 13 | 13 |
| 機材管理 | 12 | 12 |

直せない違反を並べると**検査ごと無視される**（`missing-font-weight` を凍結アプリに
当てていないのと同じ理由）。**他アプリへ広げるかはアプリを跨ぐ決めごとなので、
利用者の判断を待つ**（下表の N）。

### まだ残っている作業（次の段）

| # | 範囲 | 生 `text-*` | `font-medium`/`semibold` | なぜ今回やらないか |
| --- | --- | --- | --- | --- |
| H | `components/editor/*` | 84 | 64 | 表本体・`EditorSidebar` は `client-techops/CLAUDE.md` で禁止（並行 PR が触る） |
| I | 本番4画面（`OnAir` / `Rundown` / `Prompter` / `AudioSupport`） | 76 | 10 | 同上。放送中に使うため作り直しは別建て |
| J | `components/ai/*` | 18 | 4 | 今回のブロック分担から漏れていた（編集画面から呼ばれるダイアログ群） |
| K | `components/excel/*` | 16 | 7 | 同上 |
| L | `pages/EditorPage.tsx` | 9 | 3 | 編集画面の外枠。H と同じ段で |
| M | `shared/src/client/ui/input.tsx` の `sm:text-sm` | — | — | **全アプリに効く**ので単独で判断が要る（上表の「残した 14 件」の前提） |
| N | `page-shell-missing` を案件管理・日常業務・機材管理へ広げる | — | — | 79 画面を `<PageShell>` に載せ替える宣言になる。**アプリを跨ぐ決めごと**（上記の表） |
| O | `verify:ui` に案件/番組の id が要る画面を並べる | — | — | `verify:up` の固定シードに案件が無い。**この PR で最も手を入れた画面群がまだ測れていない**（収録・配信・計時ダッシュボード・テロップCG・レンタル・スケジュール表・ハブ） |

**あわせて見つけた既存の不具合**（統一とは別に直したもの・残したもの）:

- ✅ 直した: `MiniAppSwitcher` の根が `shrink-0` と `overflow-x-auto` を同時に持ち、
  「狭い画面では横スクロールできる帯」が効かず 375px で右端の項目に届かなかった。
  計時ダッシュボードにだけあった回避（`w-full min-w-0 sm:w-auto` で包む）を
  収録設定・配信設定にも入れた。**部品側の `shrink-0` は据え置き**（他の呼び出し元への影響が読めない）
- ✅ 直した: スマホのテロップ一覧で外側と内側の `px-4` が二重に効き、左余白が 32px になっていた
- ⏳ 残した: `pages/sheets/DocCard.tsx` の ONAIR ボタンがスマホで 26px 前後（44px 未満）。
  高さを上げるとカード1行目の高さが変わるため、カードを作り直す段で
- ⏳ 残した: `settings-export/CopyFromDialog` の `h-[52px]`（隣の `ExportDialog` は `h-11`）

---

## ブロック分担（ファイルが重ならないように切る）

| # | ブロック | 対象 |
| --- | --- | --- |
| A | 計時・視聴者 | `pages/live/*`, `components/live/*` |
| B | スケジュール | `pages/schedule/*`, `components/schedule/*` |
| C | 収録・配信 | `pages/recording/*`, `pages/streaming/*`, `components/device-settings/*` |
| D | 進行台本・AIナレッジ | `SheetListPage.tsx`, `pages/sheets/*`, `pages/ai-knowledge/*` |
| E | トップ・ハブ | `ProductionTopPage.tsx`, `TopPage.tsx`, `JourneyPage.tsx`, `pages/top/*`, `components/journey/*` |
| F | テロップCG・レンタル・設定書き出し | `pages/graphics/*`, `pages/rental/*`, `pages/settings-export/*` |
| G | 検査の追加 | `scripts/check-ui-tokens.mjs`（段0 の決まりを機械で止める） |

各ブロックで**同じ5つ**を行う: ①`<PageShell>` 化 ②`<PageHeader>` 化（自前の上辺バー廃止を含む）
③生 `text-*` → 型スケール ④`font-medium`/`font-semibold` 除去 ⑤角丸を役割名へ。

## 対応表（生 Tailwind → v4 の型スケール）

| 元 | 置き換え先 | 実寸 |
| --- | --- | --- |
| `text-2xl` / `text-xl` + `font-bold`（画面の名前） | `<PageHeader>`（`text-h1`） | 23px / 800 |
| `text-lg` + `font-bold`（節の見出し） | `text-h2` | 19px / 800 |
| `text-base` / `text-sm` + `font-semibold`（カード見出し） | `text-cardtitle` | 15px / 800 |
| `text-sm` + `font-bold`（一覧の行の主題） | `text-list` | 13.5px / 700 |
| `text-sm`（本文） | `text-sub` | 12.5px / 400 |
| `text-xs`（補足） | `text-sub-sm` | 11.5px / 400 |
| `text-xs` + `font-bold`（表の見出し） | `text-th` | 11.5px / 800 |
| `text-xs` + `font-bold`（バッジの中） | `text-badge` | 11px / 700 |
| `text-xs` の注記・説明文（行間を広く） | `text-note` | 12px / 400 |

**型スケールはウェイトを内包している**ので、当てたら `font-*` は消すこと
（`text-list font-bold` のように重ねない）。

## 対応表（角丸 → 役割名）

| 元 | 置き換え先 | 実寸 |
| --- | --- | --- |
| `rounded-sm` / `rounded`（バッジ・チップの中） | `rounded-badge-xs` / `rounded-badge` | 6px / 7px |
| `rounded-md`（入力・小さいボタン・小バッジ） | `rounded-control` / `rounded-control-md` | 7px / 9px |
| `rounded-lg`（高さ 40〜44px のボタン・入力） | `rounded-control-lg` | 10px |
| `rounded-lg` / `rounded-xl`（注記の帯・お知らせ） | `rounded-note` | 14px |
| `rounded-lg` / `rounded-xl` / `rounded-2xl`（カード・パネル） | `rounded-card` | 16px |
| `rounded-full`（ピル・アバター） | `rounded-chip`（ピル）／`rounded-full` のまま（円） | — |

**`rounded-[...]`（任意の値）は `check-ui-tokens.mjs` の `hand-radius` が止める。**
迷ったら「それは何か」で選ぶ（大きさで選ばない）。

## 作業の進め方（各ブロック共通）

1. `docs/design/v4/_rules.md` の「5. ページの外枠」と、この文書の対応表2つを読む
2. **担当ブロックのファイルだけ**を触る。他のブロックのファイルは開いてよいが編集しない
3. **見た目の統一以外は変えない** — 文言・条件分岐・API 呼び出し・状態管理・アクセシビリティ属性はそのまま
4. 検証: `npx tsc -p client-techops/tsconfig.json` と、触ったファイルへの `npx eslint`
5. **git 操作をしない**（commit / add / checkout / stash すべて）。並行して別ブロックが
   同じ作業ツリーで動いているため、まとめてコミットするのは親セッションの仕事
