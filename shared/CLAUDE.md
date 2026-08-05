# shared — 全アプリの共通コード

**ここを触ると7アプリ全部に効く。** PR の影響範囲に必ず「共通ライブラリ」を入れること。

ビルド工程を持たない（`main`/`types` が `src/index.ts` を直接指す）。各アプリは
`@gmo-onair/shared/src/client/...` の深いパスで **TypeScript のまま** import する。

## 参照経路（4つある。ずれると shared が二重に読み込まれる）

| 経路 | 何で解決するか | 書き方 |
| --- | --- | --- |
| `import` 文（238か所） | 各アプリの `vite.config.ts` の `resolve.alias` | `@gmo-onair/shared/src/...` |
| 型チェック（同じ import 文） | 各アプリの `tsconfig.json` の `paths` | 同上 |
| CSS の `@import`（6アプリ） | Vite の `resolve.alias` | `@gmo-onair/shared/src/client/tokens.css` |
| Tailwind の preset（6アプリ） | Node の解決（`node_modules` の symlink） | `@gmo-onair/shared/tailwind.preset` |

**4つが同じ実体を指していないと、zustand のストアや React の context が2つできる**
（「片方で更新したのに反映されない」という再現条件の読めない不具合になる）。
`npm run lint` の `check-shared-wiring.mjs` が7アプリ分を機械的に照合する。

- **`package.json` の依存は必ず `"@gmo-onair/shared": "*"`。** 範囲（`^2.9.237` 等）を書くと
  **本番のビルドが落ちる** — Dockerfile の manifests ステージが全ワークスペースの `version` を
  `0.0.0-build` に書き換えるので範囲が外れ、`npm ci` が公開レジストリを見て 404 になる
- **`tsconfig.json` の `paths` は、指す先が無いと黙って `node_modules` にフォールバックする**
  （実測: 存在しないディレクトリに向けても `tsc -b` は exit 0）。**型チェックでは気づけない**ので、
  ずれを見つけられるのは上記の検査だけ
- **`shared` に `tsconfig.json` は無い。** そのため shared は各アプリの `tsc -b` に取り込まれる形で
  **7回・7通りの `compilerOptions` で型チェックされる**（`client-daily` / `client-live` だけ
  `noUnusedLocals: false`、`client-awards` は `forceConsistentCasingInFileNames` が無い）。
  正しく直すには shared を composite プロジェクトにして `references` で参照する必要があるが、
  それは `main`/`types` を `dist` に向ける変更＝238か所の import と CSS の `@import` に影響するため、
  v4.0.0 では手を付けない

## 中身

| 場所 | 何が入っているか |
| --- | --- |
| `src/client/tokens.css` | 設計トークン（色・書体・角丸）。DADS のプリミティブを import した上に GMO ブルーと意味づけを載せる |
| `src/client/base.css` | **共通の土台**（`html`/`body`/`#root` の高さ・書体・タップ領域・印刷）。`tokens.css` を import した上に敷く。**v4 対象3アプリだけ**が読む |
| `tailwind.preset.ts` | 全7アプリの `tailwind.config.ts` が `presets` で継承（**相対パス** `../shared/tailwind.preset` で参照） |
| `src/client/ui/` | shadcn/Radix のプリミティブ22本 |
| `src/client/dashboard/` | `DashboardHeader` / `KpiCard` / `SectionCard` / `EmptyState` / `chart-colors` |
| `src/client/{AppHeader,SharedHeader,AppSwitcher}.tsx`, `appNav.ts` | いまのヘッダーとアプリ切替（**v4 の S1/S2 で `src/client/shell/` に置き換える**） |
| `src/client/{createApi,createAuthHook,queryClient,uiStore}.ts` | axios・認証フック・react-query・UIストアのファクトリ |
| `src/client/{manual,mcpInfo,versionHistory}/` | ヘッダーから開くモーダル3種 |
| `src/collab/` | Yjs の同時編集（`server/src/shared/collab/` と**意図的に複製**。`scripts/check-collab-parity.mjs` が一致を検査し、違えばビルドを止める） |
| `src/constants/statuses.ts`, `src/utils/businessDays.ts`, `src/enums.ts`, `src/types.ts` | 業務の共通定義 |

### v4 の共通部品（P1 で入った）

| 部品 | 何を強制するか |
| --- | --- |
| `<Money value={n} />` `<MoneyCell width={n} />` | **`¥` と数字を別要素**にして、縦に並べたとき桁を一直線にする |
| `<StatValue size="lg\|md\|sm">` | 大きい数字のサイズを4段から選ばせる（`text-2xl` を直書きさせない） |
| `<Num value unit>` | 金額でない数字。等幅で桁をそろえる |
| `<DateRange start end />` | 期間の**開始／`〜`／終了を別要素**にする |
| `manYen(n)` / `compactYen(n)` / `toMan(n)` | 万円の丸めを**1か所**にする |
| `<PageTitle>` | ページ見出しの大きさをそろえる |

- **万円の丸めは `manYen` 1本。** 着手時点で**4通りに割れていて、同じ画面の中で
  食い違っていた**（KPI カード `¥1,234.568万` / 同じ画面のグラフ `¥1235万`）。
  負の数で結果が違う実装もあった（-15,000 円 → `¥-1万` と `¥-2万`）
- **1万円未満をそのままの円で出したいときは `compactYen`。** 5,000 円を「¥1万」と
  出すと倍に見えるので、この振る舞いは残してある（日常業務の週報がこの形）
- **テストがある** — `npm test`（`shared/src/client/ui/numbers.test.ts`）。
  画面を見ても間違いに気づけない計算なので、ここだけは書く

### UI 部品の置き場所と参照のしかた

- `src/client/ui/index.ts`（バレル）は **`data-table` / `filter-bar` / `pagination` /
  `table` / `searchable-select` / `currency-input` / `scroll-area` を再エクスポートしていない**。
  深いパスで名指しする: `import { Table } from '@gmo-onair/shared/src/client/ui/table';`
  → バレルに載せると**使わないアプリまで Radix を巻き込む**（`scroll-area` が要求する
  `@radix-ui/react-scroll-area` は案件管理にしか入っていない）
- **`motion` / `animated-number` は `client/src/components/ui/` に残してある。**
  `framer-motion` が案件管理にしか無いうえ、v4 は hover を色・罫線だけに絞り
  画面遷移も CSS の `animation` で行う（`docs/design/v4/_tokens.md`）。
  **v4 が離れていく方向の部品**なので他アプリに背負わせない（Phase 2 で整理）
- **`client-equipment/src/pages/EquipmentDetailPage.tsx` に独自の `SearchableSelect`** があり、
  prop の形も見た目も shared 版と違う。差し替えると画面が変わるので **Phase 4 でまとめる**

### npm パッケージは `peerDependencies` に申告する

`shared` はビルドせず TypeScript のまま配るので、**shared が import したパッケージは
それを使うアプリ側で解決されます**。申告が無くても npm workspaces のホイスティングで
たまたま解決できてしまうため、**F3 の着手時点で `lucide-react` / `class-variance-authority` /
Radix 9個が未申告**でした。`npm run lint` の `check-shared-wiring` が申告漏れを止めます。

`dependencies` ではなく **peer** にすること — Radix も React も**実体が2つあると壊れます**
（context が別インスタンスになりダイアログが開かない等）。一部のアプリしか使わないものは
`peerDependenciesMeta` で `optional` にしてあります。
- ストレージキー: `qs_user`(qsheet) / `ts_user`(techsheet) / `eq_user`(equipment) ほか

## 共通の土台 `base.css`（重要）

**v4 対象3アプリの `index.css` は `@import '@gmo-onair/shared/src/client/base.css';` から始め、
アプリ固有の CSS だけを書く。** `html`/`body`/`#root` をアプリ側で上書きしないこと
（`scripts/check-ui-tokens.mjs` の `app-foundation` が import の有無を見ている）。

- **凍結4アプリは読まない。** `tokens.css` を直読みするままが正しい（見た目を変えないため）
- **シェルの根は `h-screen`(=100vh) ではなく `h-full`。** iOS の `100vh` は URL バーを含むので
  実際の表示領域より高くなり、`#root` の `overflow: hidden` で下端が切れる
- **`@media print` は `@layer base` の中に置く。** 外に出すと効かない — Tailwind は
  `@layer base` の中身を `@tailwind base` の位置へ移すが素の CSS は書いた場所に残り、
  `base.css` は `index.css` の先頭で import されるので `overflow: hidden` より前に出て負ける
  （実ブラウザで `overflow-y: hidden` を実測して見つけた。**印刷が1ページ目で切れる**）
- **`font-feature-settings: 'palt'` はまだ入れていない。** 数字に掛かると桁がずれるので、
  打ち消す `.font-number` と書体（LINE Seed JP）が揃う **T3 で入れる**

## v4 のトークン方針（重要）

v4.0.0 の対象は **`client` / `client-daily` / `client-equipment` の3アプリだけ**。
残る4アプリ（`client-qsheet` / `client-techsheet` / `client-live` / `client-awards`）は**凍結**で、
**今日と同じ見た目を保つ**。そのため:

| ファイル | 誰が読むか | 触り方 |
| --- | --- | --- |
| `src/client/tokens.css` | **凍結4アプリ**（＋v4対象も import 元として経由） | **値を変えない。** 名前の追加だけ可 |
| `src/client/tokens-v4.css` | **v4 対象3アプリだけ**（`base.css` 経由） | v4 で変わる値を上書き。**名前は足さない**（足すなら `tokens.css` へ） |
| `tailwind.preset.ts` | 全7アプリ | **追加だけ。** 既存キーの値を変えない（追加なら凍結アプリを壊さない） |

```
base.css  →  tokens-v4.css  →  tokens.css     ← v4 対象3アプリ
             tokens.css                        ← 凍結4アプリ
```

**`base.css` の import 1行が「v4 の色にするかどうか」の切り替え。** 戻したいときは
`./tokens.css` に戻せばよい。`check-tokens.mjs` が、上書きの名前が `tokens.css` に
実在すること（打ち間違えると**上書きにならず新しい変数を作るだけ**）と、
`base.css` が `tokens-v4.css` を読んでいることを検査する。

### 書体（T3 で入った）

| | v4 対象3アプリ | 凍結4アプリ |
| --- | --- | --- |
| 書体 | **LINE Seed JP** | Noto Sans JP（今日のまま） |
| 字詰め | `palt` 1 / `kern` 1 | なし |
| 数字 | **本文と同じ書体** ＋ `palt` 0 / `tnum` 1 | Roboto Condensed |

- **LINE Seed JP は 400 / 700 / 800 しか配信されていない**（500/600 を要求しても返らないことを実測）。
  `font-medium`(451) / `font-semibold`(214) は**黙って 400 / 700 に落ちる**。
  → **v4 の画面では `font-medium` / `font-semibold` を書かない。**
  型スケール（`text-h1` 等）がウェイトを内包しているのでその必要が無い
- **`palt` と `.font-number` の打ち消しは必ず一緒に動かす。** 本文の `palt` だけ入れると
  数字に掛かって 1 と 8 で幅が変わり、**金額を縦に並べたとき桁がずれる**
  （`base.css` の body ＋ `tokens-v4.css` の `.font-number` が対）
- **数字に別の書体を当てない。** 別書体だと**その書体が届く前の一瞬だけ数字の幅が変わり、
  列の幅がずれる**（v4 前は Roboto Condensed が当たっていた）
- `tailwind.preset.ts` の `fontFamily` は**トークン参照**（`var(--font-sans)` 等）。
  書体名をベタ書きすると v4 の書体に変えたとき**凍結アプリまで変わる**

### 角丸は数字の段を入れ替えていない（決定）

v4 の角丸9段は Tailwind の組み込みの名前（`rounded` / `rounded-xl` / `rounded-2xl` /
`rounded-3xl`）と**そのままぶつかり、まだ作り直していない画面の角まで変わる**
（`rounded` は 1,455 か所）。**v4 の画面は T1b で足した役割名**
（`rounded-card` / `rounded-control` / `rounded-note` など）**を使うこと。**
数字の段を入れ替えるかどうかは、画面を作り終えてから判断する。

- 色は **RGB の3つ組 ＋ `<alpha-value>`** で持つ（`rgb(var(--primary) / <alpha-value>)`）。
  **T1 で HSL から変換済み。** HSL の3つ組は元の色に戻せず、**7トークンでコメントの hex と
  描画色が食い違っていた**（ブランド色 `--primary` が `#005bac` ではなく `#005aad`、
  `--destructive` は色相までずれて `#c7243a` ではなく `#c81919` だった）。
  変換は**いま描かれている色**から行ったので描画は不変。**本来の値に揃えるのは T2**
- `bg-primary/10` のような**半透明指定が765か所**あるので、色コードの直書きにはできない
- **`hsl(var(--…))` と書かないこと。** 3つ組を HSL として読むと全く違う色になる。
  `npm run lint` の `check-tokens.mjs` が止める（リアルタイムCG だけは自前の HSL
  トークンと自前の tailwind 設定で完結しているので対象外）

### v4 で足した名前（T1b・まだ画面では使っていない）

| 種類 | 名前 |
| --- | --- |
| 状態の帯 | `success-surface/-border`・`warning-surface/-border/-border-strong`・`destructive-surface/-border`・`info-surface/-border` |
| AI・表彰 | `ai`・`ai-foreground`・`ai-surface`・`ai-border` |
| 面と罫の段 | `surface-subtle`・`border-subtle`・`border-faint`・`border-disabled` |
| プライマリの淡い段 | `primary-surface`・`primary-surface-weak`・`primary-border`・`primary-border-strong` |
| 薄い文字 | `fg-disabled` — **読ませる文字には使わない**（白地で 2.61:1）。ヒント文字・押せない状態・アイコンの塗りだけ |
| 見分けの色 | `cat-1`〜`cat-8` — 意味を持たない系列用。**状態の色を流用しない** |
| 角丸の役割名 | `rounded-{badge-xs,badge,control,control-md,control-lg,note,card,app,chip}` |
| 型スケール | `text-{h1,h2,card,list,sub,sub-sm,th,badge,note}` — **サイズ・行間・ウェイトを束ねる** |

- **v4 の一群は明るい配色のみ。** モックに暗い配色が無く、使う予定の無い色を先に決めると
  誰も見ていない値を保守することになる。`check-tokens.mjs` はこの一群を例外として扱う
  （暗い配色を使うのは凍結アプリの放送画面だけで、そこは v4 のトークンを参照しない）
- **角丸の数字の段（`rounded` / `rounded-xl` / `rounded-2xl` / `rounded-3xl`）は T2 で入れ替える。**
  T1b で入れたら Tailwind の組み込みとぶつかり、**書き換えていない画面の角まで変わった**
  （`rounded` 4px→7px が1,455か所、`rounded-2xl` 16px→14px が7か所。ビルド出力を比べて発見）
- **型スケールがウェイトを内包している**ので、v4 の画面で `font-medium` / `font-semibold` を
  書く理由は無い（LINE Seed JP は 400/700/800 しか無く 500/600 は黙って落ちる）
- **`client-awards` は `tokens.css` を読んでいない**（自前の変数を持ち、共通 preset も継承していない）。
  凍結なのでこれは**直さない**

## 触るときの注意

- **`shared/` を触る PR は全アプリの再ビルドを起こす。** 「共通部分を触る PR」と
  「1アプリだけの PR」を意識して分けること（分ければ後者はビルドがスキップされる）
- `src/client/AppSwitcher.tsx` の `ONAIR_APPS` はアプリ色を**トークン外の hex 直書き**で持っている。
  同じアプリ一覧が `appNav.ts` の `ALL_APPS`・`client` の `BLOCK_APPS`・各 `Sidebar` にもあり、
  **4か所が既に食い違っている**（`studio` が「カレンダー」と「スタジオ予約」など）→ v4 の S1 で1つに統合
- `src/collab/` を変えたら `server/src/shared/collab/` も同じに直す（検査で止まる）
