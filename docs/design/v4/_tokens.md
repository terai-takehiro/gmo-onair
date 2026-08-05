# v4 の設計トークン（確定値）

これが**設計としての正**です。実際にモックで何回使われているかは
[`_tokens-observed.md`](_tokens-observed.md)（生成物）にあります。

実装では **`shared/src/client/tokens-v4.css` と `shared/tailwind.preset.ts` に集約**し、
画面から色コードや px を直接書かないこと（`npm run check:ui-tokens` が止めます）。

> **実装の状況**（Phase 1 の T1 / T2 時点）
> - **色は全部入っています。** 値が変わるものは `tokens-v4.css`、名前を足すものは
>   `tokens.css`。読むのは **v4 対象3アプリだけ**で、凍結4アプリは今日の色のまま
> - **角丸は役割名だけ入っています**（`rounded-card` / `rounded-control` など）。
>   下の9段の数字（`rounded-2xl` 等）は Tailwind の組み込みとぶつかり、
>   **まだ作り直していない画面の角まで変わる**ので入れていません。**画面では役割名を使ってください**
> - **書体（LINE Seed JP）と `palt`・数字の打ち消しは入っています。** 数字も本文と
>   同じ書体になりました（v4 前は Roboto Condensed が当たっていました）。
>   **`font-medium` / `font-semibold` は書かないでください** — 配信が 400/700/800 だけなので
>   黙って落ちます。型スケール（`text-h1` 等）がウェイトを内包しています

---

## 色

**色は RGB の3つ組で持ちます**（`--primary: 0 91 172`）。HSL の3つ組は元の色に戻せず、
実際にコメントの hex と描画色が食い違う事故が起きています。
Tailwind 側は `rgb(var(--primary) / <alpha-value>)` の形で参照します
（`bg-primary/10` のような半透明指定が765か所あるため、色コードの直書きにはできません）。

### 主要色
| 用途 | 値 | トークン名 |
| --- | --- | --- |
| プライマリ（GMO ブルー） | `#005bac` | `--primary` |
| プライマリ hover | `filter: brightness(1.08)` | — |
| プライマリ 淡 背景 | `#eaf4fb` / `#f4faff` | `--primary-surface` / `--primary-surface-weak` |
| プライマリ 淡 罫 | `#cfe4f4` / `#a6ceeb` | `--primary-border` / `--primary-border-strong` |

### 文字
| 用途 | 値 | トークン名 |
| --- | --- | --- |
| 主 | `#1a1d24` | `--foreground` |
| 副 | `#3c424c` | `--secondary-foreground` |
| 補助 | `#5d6470` | `--muted-foreground` |
| 薄 | `#9aa1ab` | `--fg-disabled` ← **下記の注意** |

> **`#9aa1ab` を読ませる文字に使わないこと（決定事項）**
> 白背景とのコントラストが **2.61:1** で、WCAG AA の本文 4.5:1 も、
> 文字以外の要素の 3:1 も満たしません。既存の検査は「これより濃い `#8b929c`（3.08:1）でも不可」
> として禁止しています。
> **使えるのは**: 入力欄のヒント文字（placeholder）・押せない状態・アイコンの塗り。
> **読ませる文字（表の補助情報・注記など）は `#5d6470` に上げる。**
> `verify-ui.mjs` の薄すぎる文字の判定値は下げません。

### 面と罫
| 用途 | 値 | トークン名 |
| --- | --- | --- |
| 面 白 | `#ffffff` | `--card` |
| 面 灰 | `#f7f8fa` | `--background` |
| 面 灰（表ヘッダー・注記帯） | `#fbfcfd` | `--surface-subtle` |
| 面 灰 濃 | `#f2f4f7` | `--muted` |
| 罫（外枠） | `#e6e9ed` | `--border` |
| 罫（ヘッダー下） | `#eef0f3` | `--border-subtle` |
| 罫（行間） | `#f2f4f7` | `--border-faint` |
| 薄罫（無効） | `#cbd2da` | `--border-disabled` |

### 状態（4系統 × 4スロット）

同じ接尾辞の文法で揃えます。`--<s>` = 塗り／帯の上の文字、`--<s>-foreground` = 塗りの上の文字、
`--<s>-surface` = 帯の背景、`--<s>-border` = 帯の枠線。

| 意味 | 文字 | 背景 | 罫 | トークン |
| --- | --- | --- | --- | --- |
| 完了・在籍・取引中 | `#197a4b` | `#e7f6ee` | `#bfe3ce` | `--success*` |
| 進行中・待ち・招待中 | `#c2410e` | `#fff7ed` | `#fed7aa`（hover `#fdba74`） | `--warning*` |
| 超過・未着・停止 | `#c7243a` | `#fef6f7` | `#f6cdd2` | `--destructive*` |
| 情報・別種 | `#4338ca` | `#eef2ff` | （導出） | `--info*` |
| 特別・表彰・AI | `#6d28d9` | `#f5f3ff` | （導出） | `--ai*` |

**名前について**: v4 の「danger」は既存の `destructive`、「special」は既存の `ai` に寄せます
（22個の共通部品と106画面が既に `bg-destructive` を使っており、`danger` / `special` は
検査の「勝手に作った名前」一覧に登録されています）。

停止・休職は灰（`--muted-foreground`）。

### アプリごとのアクセント
- 案件管理・共通・設定・財務・カレンダー・日常業務・機材管理: `#005bac`
- 制作資料（Qシート）: `#c2410e`

---

## 書体

**LINE Seed JP**（Google Fonts から配信あり・**400 / 700 / 800 のみ**）。

```css
--font-sans: 'LINE Seed JP', 'Noto Sans JP', -apple-system, 'Hiragino Sans', 'BIZ UDPGothic', 'Meiryo', sans-serif;
```
- 本文に `font-feature-settings: 'palt' 1, 'kern' 1`（日本語のプロポーショナル送り）
- **数字だけ** `font-variant-numeric: tabular-nums` ＋ `'palt' 0, 'tnum' 1`
  （本文と同じ `palt` のままだと 1 と 8 で幅が変わり、縦に並べたとき桁がずれる）
- 数字に別の書体を当てないこと（書体が未ロードの瞬間だけ数字の幅が変わり、列幅がずれる）

> **500 / 600 が無い。** コードには `font-medium`(621) / `font-semibold`(336) = **957か所**あり、
> 黙って 400 / 700 に落ちます。対策は3つ:
> ① preset で `medium:'400'` `semibold:'700'` に潰す（描画は同じ・DevTools の値が実描画と一致する）
> ② **下の型スケールがウェイトを内包**するので `font-semibold` を書く理由が消える
> ③ 検査で増加を止める（ベースライン 957 から減らしていく）

### 型スケール（サイズ・行間・ウェイトを1クラスに束ねる）
| 役割 | サイズ / ウェイト | Tailwind |
| --- | --- | --- |
| 画面見出し（h1） | 23px / 800 | `text-h1` |
| 節見出し（h2） | 19px / 800 | `text-h2` |
| カード見出し | 15px / 800 | `text-cardtitle` ← **`text-card` にはできない** |
| 一覧の主テキスト | 13.5px / 700 | `text-list` |
| 一覧の副テキスト | 12.5px / 400 | `text-sub` |
| 一覧の副テキスト（小） | 11.5px / 400 | `text-sub-sm` |
| 表ヘッダー | 11.5px / 800（色 `--fg-disabled`） | `text-th` |
| バッジ | 11px / 700–800 | `text-badge` |
| 注記 | 12px / 400（`line-height: 1.75`） | `text-note` |
| KPI 数値 | 15–17px / 800 | `<StatValue>` |
| スマホ 本文 | 13–14px / 700 | — |
| スマホ 主ボタン | 15px / 800 | — |

> **`text-card` という名前は使えない（P2 で判明）。** `colors` に `card`（面 白）があるので
> `text-card` は**色の指定としても生成され**、同じクラス名で「font-size:15px」と
> 「color: 白」の2つの規則ができます。当てた文字が白地に白で消えます。
> → 型スケール側を `cardtitle` にしました。`check-tokens.mjs` が色名との衝突を検査します。
>
> **型スケールを足したら `shared/src/client/utils.ts` の `V4_FONT_SIZES` にも足すこと。**
> `cn()`（tailwind-merge）は独自の名前を知らないため、教えないと
> `text-xs` の上に `text-badge` を重ねても**打ち消せず 12px のまま描かれます**
> （実際に踏んで、和文4字のバッジが幅 62px の枠に収まらず2行になりました）。
> 角丸の役割名も同じで `V4_RADII` に足します。どちらも `check-tokens.mjs` が止めます。

---

## 角丸（9段・確定）

観測結果（[`_tokens-observed.md`](_tokens-observed.md)）で **11 種類**使われていたので、
**下の9段に正規化**します。丸めた3つは、使われている要素の高さから判断しました。

| 用途 | 値 | Tailwind | 吸収するもの |
| --- | --- | --- | --- |
| バッジ小 | 6px | `rounded-xs` | |
| バッジ | 7px | `rounded-sm` | |
| ボタン小 | 9px | `rounded-md` | **8px**（高さ26〜30px の小コントロールで82回） |
| ボタン | 10px | `rounded-lg` | **11px**（高さ40〜44px の入力・大ボタンで74回） |
| チップ・入力 | 12px | `rounded-xl` | **13px** |
| 注記帯 | 14px | `rounded-2xl` | |
| カード | 16px | `rounded-3xl` | |
| アプリ外枠 | 18px | `rounded-4xl` | |
| ピル | 999px | `rounded-full` | |

役割エイリアス: `rounded-control`(=7px 入力・小バッジ) / `rounded-card`(=16px) / `rounded-chip`(=999px)。
**`rounded-[Npx]` の直書きは検査で止めます**（段が増えると縦に並べたとき角の丸みが揃わない）。

---

## 余白・寸法

4px 基準。よく使う値: `gap: 4 / 6 / 8 / 9 / 10 / 11 / 12 / 14 px`

| 用途 | padding |
| --- | --- |
| 表の行 | `9px 16px` |
| 一覧の行 | `11px 16px` |
| カードヘッダー | `13px 16px` |
| 本文領域 | `22px 26px 26px` |

| 要素 | 値 |
| --- | --- |
| 上辺バー 高さ | **64px** |
| 左メニュー 幅 | **248px** |
| 右サイドパネル 幅 | 290–360px |
| 一覧の行高 | 42–48px（padding 由来） |
| バッジ 高さ | 22–24px |
| ボタン 高さ | 30px（小）/ 34px / 38px（主） |
| アイコン | 13 / 14 / 15 / 16 / 17px |
| スマホ 画面 | 340 × 700px（内側 320 × 680px 相当） |
| スマホ タップ対象 | **最低 44px**・標準 46–52px・主ボタン 52px |

## 影
- アプリ外枠: `0 30px 70px -34px rgba(16,24,40,.26)`
- スマホ筐体: `0 30px 60px -24px rgba(16,24,40,.5)`

## 動き
- 画面遷移: `animation: screenIn .34s cubic-bezier(.22,.61,.36,1) both`
- hover: **色・罫線のみ**（`transform` は使わない）

## アイコン
**lucide**（実装では `lucide-react` のコンポーネントを直接使う）。
モックは `<i data-lucide>` を `<svg>` に差し替える方式で増殖する問題があったが、
`lucide-react` なら起きない。
