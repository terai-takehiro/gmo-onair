# v4 の画面仕様

> **状態**: 現役の索引
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: `docs/design/` の入口。画面仕様・モック・設計文書のうち、どれが生成物でどれが手書きか、いまどの状態かをここで分ける

v4 UI/UX 刷新の design handoff（8ファイル・51画面のハイファイモックアップ）から、
**実装で必要な分だけ**を機械で取り出した生成物と、その後に手で書き足した設計文書
（テロップCG・隔週キープ・レギュラー案件・制作技術支援の作り直し ほか）を置いています。

> ⚠️ **`projects.md` は案件管理の一部しかカバーしていません（2026-08-13 判明）。**
> `mockups/README.md` が指定するとおり、案件管理の**ダッシュボード・案件作成・
> 案件一覧・案件詳細**は `mockups/v4-live-sales.dc.html` が正であり、
> `projects.md` を作る `extract-v4-design.mjs` は古い `v4-mockup-main.dc.html` しか
> 読んでいません（この4画面は JS の書き方が違うため機械抽出が効きません）。
> この4画面を触るときは `projects.md` だけで判断せず、
> [`../../v4-mock-deviations.md`](../../v4-mock-deviations.md) の
> 「`v4-live-sales.dc.html` との突き合わせ」節と、モック本体を必ず確認してください。
> `projects.md` は料金表・標準工程テンプレートなど、他の画面のぶんはそのまま使えます。

> ⚠️ **モックは世代が混ざっています。** どの画面をどのファイルで見るかは
> [`mockups/README.md`](mockups/README.md) 冒頭の表が正です（**新しい `v4-live*` が優先**。
> 古いほうを見ると、マージ済みの作業を巻き戻します）。

## どれを読むか

| 知りたいこと | 読む場所 | 種類 |
| --- | --- | --- |
| **守る規律**（縦の整列・金額表記・スマホ・用語・ページの外枠） | [`_rules.md`](_rules.md) | 手書き |
| **色・書体・角丸・寸法の確定値** | [`_tokens.md`](_tokens.md) | 手書き |
| **フォームの欄の並び順** | [`_form-order.md`](_form-order.md) | 手書き |
| **画面が扱うデータの項目名**（＝列定義） | 下の「生成物」のアプリ別ファイル | 生成物 |
| **レイアウト・見た目** | [`mockups/`](mockups/) を**ブラウザで開く**（2.3MB） | モック |
| どの値が実際に何回使われているか | [`_tokens-observed.md`](_tokens-observed.md) | 生成物 |
| モックと実装がずれている所 | [`../../v4-mock-deviations.md`](../../v4-mock-deviations.md) | 手書き |
| v4 でどこまで出来たか（サイトツリー） | [`../../v4-progress.md`](../../v4-progress.md) | 生成物 |
| 開発の段取り・用語（凍結・凍結解除中・廃止） | [`../../v4-plan.md`](../../v4-plan.md) | 手書き |

> **なぜ分けてあるか**
> モックアップは1ファイル 122KB〜675KB（合計 2.3MB）あります。画面を実装するたびに
> ここを検索すると、毎回同じ読み込みコストを払うことになります。
> **実装で本当に必要なのは「データの項目名」と「確定値」の2つだけ**なので、
> 1度機械的に抜き出して 39KB に落としてあります（**98%削減**）。
>
> 一方 **レイアウトはテキストで読むよりモックをブラウザで開くほうが速い**ので、
> そこは変換していません。モックは design reference です — **コードをコピーしないこと**。
> 既存コードベース（React + TypeScript + Tailwind）の流儀で作り直してください。

## 生成物と手書きの区別

### 生成物（`node scripts/extract-v4-design.mjs` が作る。手で直さない）

[`scripts/extract-v4-design.mjs`](../../../scripts/extract-v4-design.mjs) の `APPS` に載っている
`mockups/v4-mockup-*.dc.html` だけが対象です。

| ファイル | 元のモック | 画面数 | アプリのいまの状態 |
| --- | --- | --- | --- |
| [`projects.md`](projects.md) | `v4-mockup-main.dc.html` | 8 | v4 対象（案件管理。上の注意のとおり4画面は `v4-live-sales.dc.html` が正） |
| [`gpm.md`](gpm.md) | `v4-mockup-project.dc.html` | 7 | v4 対象（プロジェクト管理。データの持ち方は [`../gpm-model.md`](../gpm-model.md) → [`../gpm-merge.md`](../gpm-merge.md)） |
| [`finance.md`](finance.md) | `v4-mockup-finance.dc.html` | 8 | v4 対象 |
| [`schedule.md`](schedule.md) | `v4-mockup-calendar.dc.html` | 4 | v4 対象 |
| [`settings.md`](settings.md) | `v4-mockup-settings.dc.html` | 7 | v4 対象 |
| [`equipment.md`](equipment.md) | `v4-mockup-equipment.dc.html` | 8 | v4 対象 |
| [`daily.md`](daily.md) | `v4-mockup-dailyops.dc.html` | 6 | v4 対象。ウィークリー活動報告とタスク・依頼は 2026-09 の再設計モック（下の手書きの表）で作り直した |
| [`production.md`](production.md) | `v4-mockup-production.dc.html` | 3 | **凍結解除中**（制作技術支援。作り直しの設計は [`qsheet-v4-coding/`](qsheet-v4-coding/README.md)・残作業は [`client-techops/CLAUDE.md`](../../../client-techops/CLAUDE.md)）。生成物の中の「制作資料」「凍結 — v4.1 以降」はスクリプトの `APPS` の文言のまま（⚠️ 要確認: 直すなら `APPS` を直して再生成する） |
| [`_tokens-observed.md`](_tokens-observed.md) | 上の8本の `style="..."` | — | 観測値。設計の正は `_tokens.md` |

`mockups/v4-mockup-graphics.dc.html`（テロップCG の初版モック）は `APPS` に無いので生成物は作られません
（設計は手書きの `graphics*.md`）。

### 手書き（方針が変わったときだけ直す。各文書の冒頭に「状態」欄がある）

| 文書 | 何か | 状態（2026-09-08） |
| --- | --- | --- |
| [`_rules.md`](_rules.md) | 守る規律5つ | 現役の決めごと |
| [`_tokens.md`](_tokens.md) | トークンの確定値 | 現役の決めごと |
| [`_form-order.md`](_form-order.md) | フォームの並び順 | 現役の決めごと |
| [`mobile.md`](mobile.md) | スマホ 13 画面の仕様 | 実装済み（記録） |
| [`graphics.md`](graphics.md) | テロップCG 初版設計（出力の契約・部品の思想） | 実装済み（記録）。UI は次の文書が正 |
| [`graphics-redesign.md`](graphics-redesign.md) | テロップCG 再設計（UI の正・段A〜F） | 実装済み（記録） |
| [`graphics-design-specs.md`](graphics-design-specs.md) | テロップCG の数値（組版・セーフエリア） | 現役の決めごと |
| [`graphics-awards-migration-plan.md`](graphics-awards-migration-plan.md) | 段6 アワード・クイズの移植 | 実装済み（記録） |
| [`production-manual.md`](production-manual.md) | **運営マニュアル**（制作技術支援の新ミニアプリ）。各ミニアプリの情報を A4横の冊子に差し込み PDF で配る | **設計（未実装）**。§10 の7件の判断待ち |
| [`venue-layout.md`](venue-layout.md) | **会場図面**（制作技術支援の新ミニアプリ・会場図面シミュレーター）。用賀の図面を2軸で縮尺合わせして取り込み、備品・人・カメラを実寸で置いて一気に並べ、運営マニュアルに差し込む | **設計（未実装）**。§14 の8件は判断済み（2026-09-13）・着手できる |
| [`wiki.md`](wiki.md) | **Wiki**（新しいブロックアプリ）。Markdown で書いた文章を木に並べ、探せて、AI が読める。手入力を「AI で整える」で Markdown に。見直し期限と「足りないページ」で古びない | **設計（未実装）**。§10 の全件 12 件は判断済み（2026-09-22）・着手できる |
| [`keep-report.md`](keep-report.md) | 隔週キープの数字・資料ビルダー | 現役の決めごと（段1〜4 実装済み） |
| [`regular-series.md`](regular-series.md) | レギュラー案件のロジック | 現役の決めごと（実装済み） |
| [`ios-native-mobile-mockups.md`](ios-native-mobile-mockups.md) | iOS ネイティブ風の見た目探索 | 参考（当時の記録） |
| [`production-v4-native-mockups.md`](production-v4-native-mockups.md) | 制作技術支援 v4化の第1段階モック | 参考（当時の記録） |
| [`qsheet-v4-coding/README.md`](qsheet-v4-coding/README.md) 以下 | 制作技術支援 作り直しの設計書 00〜14 と [`impl/`](qsheet-v4-coding/impl/README.md) | 実装済み（記録）。段ごとの状態は README §2 の表 |
| [`rental-search/README.md`](rental-search/README.md) | レンタル機材検索のモック | 実装済み（記録） |
| [`../gpm-model.md`](../gpm-model.md) / [`../gpm-merge.md`](../gpm-merge.md) | プロジェクト管理のデータの持ち方 | 実装済み（記録） |
| [`../qsheet-recording-streaming.md`](../qsheet-recording-streaming.md) | 収録設定・配信設定の初版設計 | 実装済み（記録） |
| [`mockups/README.md`](mockups/README.md) | ハンドオフの原文（画面一覧・設計方針・トークン） | 現役の決めごと（原文） |
| [`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md) | 設計方針の原文 | 現役の決めごと（原文） |
| [`mockups/github.md`](mockups/github.md) | 2026-08-02 の同期記録 | 参考（当時の記録）。現状はコードが正 |
| [`mockups/keep-report/`](mockups/keep-report/README.md)・[`mockups/regular/`](mockups/regular/README.md)・[`mockups/native/telop-cg/`](mockups/native/telop-cg/README.md)・[`mockups/tasks-redesign/`](mockups/tasks-redesign/README.md)・[`mockups/weekly-redesign/`](mockups/weekly-redesign/README.md) | 2026-09 に足した再設計モックの説明 | 実装済み（記録） |
| [`mockups/native/production-manual/`](mockups/native/production-manual/README.md) | 運営マニュアルのモック（PC 4・スマホ 1・A4横の実寸 1・地図 1） | 設計（未実装） |
| [`mockups/native/venue-layout/`](mockups/native/venue-layout/README.md) | 会場図面のモック（PC 5・スマホ 1・地図 1） | 設計（未実装） |
| [`mockups/native/wiki/`](mockups/native/wiki/README.md) | Wiki のモック（PC 7・スマホ 2・地図 1） | 設計（未実装・判断済み） |

### モックの元ファイル（`.dc.html`。ブラウザで開く）

| 置き場所 | 中身 |
| --- | --- |
| [`mockups/`](mockups/) | ハンドオフの本体。`v4-live*.dc.html`（新しい世代）・`v4-mockup-*.dc.html`・共通シェル・[`gpm-format-alignment.html`](mockups/gpm-format-alignment.html)（プロジェクト管理のフォーマット統一案） |
| `mockups/native/qsheet-top/` | 制作技術支援トップの Claude Design 作業ファイル（説明は [`production-v4-native-mockups.md`](production-v4-native-mockups.md)） |
| [`mockups/native/production-manual/`](mockups/native/production-manual/README.md) | 運営マニュアル（新ミニアプリ）の Claude Design 作業ファイル（設計は [`production-manual.md`](production-manual.md)） |
| [`mockups/native/venue-layout/`](mockups/native/venue-layout/README.md) | 会場図面（新ミニアプリ）の Claude Design 作業ファイル（設計は [`venue-layout.md`](venue-layout.md)） |
| [`mockups/native/wiki/`](mockups/native/wiki/README.md) | Wiki（新しいブロックアプリ）の Claude Design 作業ファイル（設計は [`wiki.md`](wiki.md)） |
| `qsheet-v4-coding/mockups/live/`・`qsheet-v4-coding/mockups/tech-settings/` | 計時の表示画面・収録／配信設定のモック（説明は [`qsheet-v4-coding/impl/08-recording-streaming-impl.md`](qsheet-v4-coding/impl/08-recording-streaming-impl.md) ほか） |
| [`rental-search/`](rental-search/README.md) | レンタル機材検索 |
| [`../qsheet-recording-streaming/mockups/`](../qsheet-recording-streaming/mockups/README.md) | 収録・配信設定の初版モック |

## モックが無いアプリ・別トラックのアプリ

- **計時・視聴者**（`client-live/`）: **v4 対象**。運用画面は制作技術支援のミニアプリへ移植済み
  （`client-techops/src/pages/live/`・設計は [`qsheet-v4-coding/12-live-timer-decision.md`](qsheet-v4-coding/12-live-timer-decision.md)）。
  v4 のモックは表示画面だけ（[`qsheet-v4-coding/mockups/live/Display.dc.html`](qsheet-v4-coding/mockups/live/Display.dc.html)）。
  **表示画面 `/live/display/` だけは見た目を変えない例外**（[`client-live/CLAUDE.md`](../../../client-live/CLAUDE.md)）
- **リアルタイムCG**（`client-awards/`）: **廃止**（2026-09-06・段F）。後継の**テロップCG**は
  `client-techops/src/pages/graphics/` に実装済み。設計は [`graphics-redesign.md`](graphics-redesign.md)（UI の正）・
  [`graphics.md`](graphics.md)（初版）・[`graphics-design-specs.md`](graphics-design-specs.md)（数値）・
  [`graphics-awards-migration-plan.md`](graphics-awards-migration-plan.md)（アワード演出の移植）、
  絵は [`mockups/native/telop-cg/`](mockups/native/telop-cg/README.md)。初版モック `mockups/v4-mockup-graphics.dc.html` は経緯として残す。
  経緯は [`../../v4-plan.md`](../../v4-plan.md) の「用語」と [`client-awards/CLAUDE.md`](../../../client-awards/CLAUDE.md)
- **技術資料**: アプリごと削除済み（PR #278・migration 211）。後継は制作技術支援の収録設定・配信設定
  （[`../qsheet-recording-streaming.md`](../qsheet-recording-streaming.md) → [`qsheet-v4-coding/08-recording-streaming.md`](qsheet-v4-coding/08-recording-streaming.md)）
- **スマホ（13画面）**: `projects.md` の元モック（`v4-mockup-main.dc.html`）の端末枠に入っています。
  切り出したものが [`mobile.md`](mobile.md)。全画面をネイティブ級にする追加の取り組みは
  [`../../v4-native-ui-plan.md`](../../v4-native-ui-plan.md)

## 共通シェル

- 上辺バー **64px**・左メニュー **248px**。モックは新しい世代の
  [`mockups/ShellTopbar.dc.html`](mockups/ShellTopbar.dc.html) / [`mockups/ShellSideMenu.dc.html`](mockups/ShellSideMenu.dc.html) を見る
  （旧世代の `AppTopbar.dc.html` / `AppSideMenu.dc.html` は各 `v4-mockup-*.dc.html` が `dc-import` で読むため据え置き）
- 実装は `shared/src/client/shell/`（`AppShell` / `AppTopbar` / `AppSideMenu` / `MobileTabs`）の**1か所だけ**。画面ごとにコピーしない

## 更新のしかた

アプリ別ファイルと `_tokens-observed.md` は**生成物**です。手で直さないでください。

```bash
node scripts/extract-v4-design.mjs
```

デザインが更新されたら `mockups/` を差し替えて再実行します。
手書きの文書は方針が変わったときだけ直し、直したら冒頭の「状態」「最終確認」も更新します。

## 元の handoff 文書

- [`mockups/README.md`](mockups/README.md) — ハンドオフの説明（画面一覧・設計方針・トークン）。**どの世代のモックを見るかの表は冒頭**
- [`mockups/DESIGN_POLICY.md`](mockups/DESIGN_POLICY.md) — 設計方針の原文
- [`mockups/github.md`](mockups/github.md) — 2026-08-02 の同期記録（v4 の画面 → 当時の実装ファイルの対応表）。
  現状はコードが正で、いまの対応は [`../../v4-progress.md`](../../v4-progress.md)
