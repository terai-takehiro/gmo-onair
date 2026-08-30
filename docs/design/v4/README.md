# v4 の画面仕様

v4 UI/UX 刷新の design handoff（8ファイル・51画面のハイファイモックアップ）を、
**実装で必要な分だけ**取り出して置いてあります。

> ⚠️ **`projects.md` は案件管理の一部しかカバーしていません（2026-08-13 判明）。**
> `mockups/README.md` が指定するとおり、案件管理の**ダッシュボード・案件作成・
> 案件一覧・案件詳細**は `mockups/v4-live-sales.dc.html` が正であり、
> `projects.md` を作る `extract-v4-design.mjs` は古い `v4-mockup-main.dc.html` しか
> 読んでいません（この4画面は JS の書き方が違うため機械抽出が効きません）。
> この4画面を触るときは `projects.md` だけで判断せず、
> [`../../v4-mock-deviations.md`](../../v4-mock-deviations.md) の
> 「`v4-live-sales.dc.html` との突き合わせ」節と、モック本体を必ず確認してください。
> `projects.md` は料金表・標準工程テンプレートなど、他の画面のぶんはそのまま使えます。

> 📱 **iOS ネイティブ風のスマホ見た目探索（コード変更なし）**:
> [`ios-native-mobile-mockups.md`](ios-native-mobile-mockups.md)。
> 上の「モックが正」を置き換えるものではなく、実装済み画面の見た目・手触りを
> iOS ネイティブ寄りに作り直すとどうなるかを Claude Design のキャンバスで試したもの。

## どれを読むか

| 知りたいこと | 読む場所 | 大きさ |
| --- | --- | --- |
| **守る規律**（縦の整列・金額表記・スマホ・用語） | [`_rules.md`](_rules.md) | 5KB |
| **色・書体・角丸・寸法の確定値** | [`_tokens.md`](_tokens.md) | 8KB |
| **画面が扱うデータの項目名**（＝列定義） | 下のアプリ別ファイル | 2〜8KB |
| **レイアウト・見た目** | [`mockups/`](mockups/) を**ブラウザで開く** | 2.3MB |
| どの値が実際に何回使われているか | [`_tokens-observed.md`](_tokens-observed.md)（生成物） | 5KB |
| 開発の段取り | [`../../v4-plan.md`](../../v4-plan.md) | — |

> **なぜ分けてあるか**
> モックアップは1ファイル 122KB〜675KB（合計 2.3MB）あります。画面を実装するたびに
> ここを検索すると、毎回同じ読み込みコストを払うことになります。
> **実装で本当に必要なのは「データの項目名」と「確定値」の2つだけ**なので、
> 1度機械的に抜き出して 39KB に落としてあります（**98%削減**）。
>
> 一方 **レイアウトはテキストで読むよりモックをブラウザで開くほうが速い**ので、
> そこは変換していません。モックは design reference です — **コードをコピーしないこと**。
> 既存コードベース（React + TypeScript + Tailwind）の流儀で作り直してください。

## アプリ別

| アプリ | 仕様 | 画面数 | v4.0.0 |
| --- | --- | --- | --- |
| 共通・案件管理 | [`projects.md`](projects.md) | 8 | **対象** |
| プロジェクト管理（新規） | [`gpm.md`](gpm.md) | 7 | **対象** |
| 財務管理 | [`finance.md`](finance.md) | 8 | **対象** |
| カレンダー | [`schedule.md`](schedule.md) | 4 | **対象** |
| 設定 | [`settings.md`](settings.md) | 7 | **対象** |
| 機材管理 | [`equipment.md`](equipment.md) | 8 | **対象** |
| 日常業務 | [`daily.md`](daily.md) | 6 | **対象** |
| 制作資料（Qシート） | [`production.md`](production.md) | 3 | 凍結 — v4.1 以降 |

スマホ（13画面）は `projects.md` の元モック（`v4-mockup-main.dc.html`）に入っています。

**モックが無いアプリ**: 技術資料・計時LIVE。
デザインが出ていないので**そもそも作り直せません**。凍結のまま置きます。
リアルタイムCG は 2026-08-30 に再設計モックを起こしました
（[`graphics.md`](graphics.md) ＋ `mockups/v4-mockup-graphics.dc.html`・
制作技術支援のミニアプリ「テロップCG」として作り直す検討段階）。

## 共通シェル

- 上辺バー **64px** → [`mockups/AppTopbar.dc.html`](mockups/AppTopbar.dc.html)
- 左メニュー **248px** → [`mockups/AppSideMenu.dc.html`](mockups/AppSideMenu.dc.html)

この2つは**必ず共通コンポーネントにすること**（画面ごとにコピーしない）。
モック側でも `dc-import` で共有しています。

## 更新のしかた

アプリ別ファイルと `_tokens-observed.md` は**生成物**です。手で直さないでください。

```bash
node scripts/extract-v4-design.mjs
```

デザインが更新されたら `mockups/` を差し替えて再実行します。
`_rules.md` と `_tokens.md` は手で書いたものなので、方針が変わったときだけ直します。

## 元の handoff 文書

- [`mockups/README.md`](mockups/README.md) — ハンドオフの説明（画面一覧・設計方針・トークン）
- [`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md) — 設計方針の原文
- [`mockups/github.md`](mockups/github.md) — v4 の画面 → 現行の実装ファイルの対応表
  （**どのファイルを触るか調べるときはここが一番速い**）
- [mobile.md](mobile.md) — **スマホ 13 画面**（モックの端末枠から切り出し）・決めごと8つ・作る順番
