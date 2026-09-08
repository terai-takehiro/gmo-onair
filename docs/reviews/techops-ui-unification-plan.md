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
