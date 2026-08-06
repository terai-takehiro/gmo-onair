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
| `src/client/apps.ts` | **アプリ登録（唯一の正）**。名前・アイコン・色・URL・権限モジュール・凍結の印 |
| `src/client/shell/` | **共通シェル**（上辺バー・左メニュー・スマホ下タブ）。v4 対象3アプリだけが使う |
| `src/client/tokens.css` | 設計トークン（色・書体・角丸）。DADS のプリミティブを import した上に GMO ブルーと意味づけを載せる |
| `src/client/base.css` | **共通の土台**（`html`/`body`/`#root` の高さ・書体・タップ領域・印刷）。`tokens.css` を import した上に敷く。**v4 対象3アプリだけ**が読む |
| `tailwind.preset.ts` | 全7アプリの `tailwind.config.ts` が `presets` で継承（**相対パス** `../shared/tailwind.preset` で参照） |
| `src/client/ui/` | shadcn/Radix のプリミティブ22本 |
| `src/client/dashboard/` | `DashboardHeader` / `KpiCard` / `SectionCard` / `EmptyState` / `chart-colors` |
| `src/client/{AppHeader,SharedHeader,AppSwitcher}.tsx`, `appNav.ts` | **旧ヘッダー。凍結4アプリだけが使う**（v4 対象3アプリは `src/client/shell/` に移行済み） |
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
| `<PageTitle>` | ページ見出しの大きさをそろえる（**v4 より前の段**。下記参照） |

### v4 の共通部品（Phase 2 で足した分）

| 部品 | 何を強制するか |
| --- | --- |
| `<PageHeader title sub primaryAction>` | 画面の見出しと**主アクションの置き場所**。PC は右上・スマホは**下端固定**。73画面が個別に `fixed bottom-0` を書かない（`_rules.md`「3. スマホ」） |
| `<FilterChips items value onChange>` | 件数つきの絞り込みチップ。`count` は**必須** — 押す前に 0 件だと分かる |
| `formatRelativeTime(t)` | 「最後の動き」の相対表示。1分/1時間/24時間/7日の段と、**未来は「たった今」に丸める**（時計のずれで「-1分前」が出る） |

- **`<PageHeader>` と `<PageTitle>` は別物。** `PageTitle` は v4 より前の段
  （`text-xl lg:text-2xl` = 20/24px）で、まだ作り直していない 38 画面が使っています。
  ここを一度に変えると作り直していない画面の見出しだけが動くので分けてあります。
  **v4 で作り直した画面は `PageHeader`**（`text-h1` = 23px/800）。
  全画面が移り終わったら `PageTitle` を消します（Phase 7）
- **スマホの主アクションはシェルが置きます**（`src/client/shell/primaryAction.ts`）。
  シェルが下タブの上に空の差し込み口を1つ持ち、`PageHeader` が `createPortal` で描きます。
  **`fixed` にしていない**のが要点で、普通の流れに置けば本文のスクロール領域が
  その分縮むため、画面ごとに下余白を足して回らずに済みます（足し忘れると最後の行が押せない）

- **万円の丸めは `manYen` 1本。** 着手時点で**4通りに割れていて、同じ画面の中で
  食い違っていた**（KPI カード `¥1,234.568万` / 同じ画面のグラフ `¥1235万`）。
  負の数で結果が違う実装もあった（-15,000 円 → `¥-1万` と `¥-2万`）
- **1万円未満をそのままの円で出したいときは `compactYen`。** 5,000 円を「¥1万」と
  出すと倍に見えるので、この振る舞いは残してある（日常業務の週報がこの形）
- **テストがある** — `npm test`（`shared/tests/`）。
  画面を見ても間違いに気づけない計算なので、ここだけは書く。
  **`src/` の外に置くこと** — 各アプリの Tailwind の `content` が `../shared/src/client/**` を
  含むので、`src/` に置くと**テストの中のクラス名まで CSS になる**（実際に凍結4アプリの
  CSS に `rounded-card` / `text-h1` が増えた）。理由は `shared/tests/README.md`

### v4 の共通部品（P2 で入った）

| 部品 | 何を強制するか |
| --- | --- |
| `<Row density align divider interactive stackOnMobile>` | 一覧・表の1行。行高と区切り線を1か所にする |
| `<RowMain>` | **行の中で唯一伸びる子。** `min-w-0` + `flex-1` を内包する |
| `<RowTitle>` `<RowSub>` | 名前列の主／副テキスト。1行で省略する |
| `<RowSlot w align hideOnMobile placeholder>` | 固定幅の列。**7段しか受け付けない**。値が無い行も枠を残す |
| `<RowHeader>` | 表頭。**本文と同じ `<RowSlot>` を並べる**のでずれない |
| `<TableBadge label w>` | バッジを固定幅の枠に入れ、**和文は 62px で均等割り付け**する |

- **列幅の7段（`SlotWidth`）は `ui/row.tsx` が正。** `MoneyCell` の `width` も
  `TableBadge` の `w` もここを読む。**別々に持つとずれる**（「金額列は96px・
  バッジ列は100px」になる）。着手時点で手書きの列幅が97か所あり、
  **7段に乗っていたのは32か所（33%）だけ**だった
- **`<Row stackOnMobile>` が `<RowMain>` を `data-row-main` 経由で狙っている。**
  この属性を消すとスマホの縦積みが黙って効かなくなる
- **均等割り付けには `inline-block` が必須。** `Badge` の既定は `inline-flex` で、
  **flex の中の文字には `text-align` が効かない**（実測: 和文2字が 48px の帯に
  広がらず 24.6px のままだった）。`TableBadge` が表示を block 系に変えている
- **`text-badge` を効かせるには `cn()` の設定が必要**（下記）

### v4 の共通部品（P3 で入った）— 中身が無いとき・知らせる・訊く

| 部品 | 置き場所 | 何を強制するか |
| --- | --- | --- |
| `EmptyState` / `NoSearchResults` | `src/client/states/` | 「該当なし」で終わらせない。**0件の理由**（1件も無い／絞り込みが効いている）を分ける |
| `Delayed` + `SkeletonRows` / `SkeletonCard` / `SkeletonKpi` | 同上 | **1秒未満はスピナーを出さない**（点滅させない）。全画面ローディングを作らない |
| `ErrorPanel` + `humanizeError` | 同上 | 原因1文＋次の一手1文。**HTTP コード・スタックを画面に出さない** |
| `NotFoundPanel` | 同上 | 知らない URL で**真っ白にしない**（計時LIVE・CG・日常業務は `path="*"` が無い） |
| `NoPermissionPanel` | 同上 | 白紙にせず、**何の権限が要るか**を名前で出す |
| `notifySuccess` / `notifyApiError` ほか | `src/client/notify.ts` | 結果を**流れて消えない帯**で伝える（`alert()` 25 か所の置き換え先） |
| `<NoticeBar />` | `src/client/ui/notice.tsx` | 帯の出る場所。**アプリのシェルに1つだけ** |
| `confirmAction()` / `<ConfirmHost />` | `src/client/ui/confirm.tsx` | 「〜しますか？」を画面の中で訊く。**一緒に何が消えるかを書ける** |

- **`EmptyState` の実装は1つだけ。** `src/client/dashboard/EmptyState.tsx` が既に 29 ファイルで
  使われている（うち4つは凍結アプリ）ので、`states/` からは**再エクスポート**している。
  v4 の画面は `states` だけを見ればよい。ただし既定の `title`（「データがありません」）は
  v4 の決めごとに反するので、**必ず `title` と `description` を渡すこと**
- **`<NoticeBar />` と `<ConfirmHost />` は v4 対象3アプリのシェルに1つずつ。**
  `confirmAction` は器が無いと **`false` を返して実行しません**（黙って実行するより安全側）。
  つまり置き忘れると「削除ボタンを押しても何も起きない」になるので、
  `npm run lint` の `check-shared-wiring` が**数を数えて**止める（凍結アプリは 0 個が正）
- **`states` / `notice` / `confirm` は `ui/index.ts` のバレルに載せない。**
  載せると凍結4アプリのバンドルにも入る（描かないので純粋に無駄）。深いパスで名指しする

### 保存が黙って失敗しない仕組み（P3・重要）

`src/client/queryClient.ts` の MutationCache に**最後の受け皿**を置いてある。
書き込みは7アプリで **296 か所**あるのに `onError` の記述は **54 か所**しかなく、
残りは 400 / 403 / 500 が返っても**画面に何も出ない**（押した人には「押しても変わらない」
としか見えない）状態だった。

- 画面が自分で `onError` を持っているときは**黙る**（同じ失敗を2回出さない）
- `useMutation({ meta: { action: '案件の保存' } })` を渡すと「案件の保存に失敗しました」になる。
  `meta: { silent: true }` で受け皿を止められる
- **凍結アプリは `<NoticeBar />` を置いていないので今日と同じ挙動**（描く相手がいない）
- `onError` の**引数の並びを取り違えると常に黙る**。並びは `(error, variables, context, mutation)` で
  **4番目が mutation**。`shared/tests/queryClient.test.ts` が実際に失敗させて固定している

### トーストは残っているが、v4 では使わない

`ui/{toast,use-toast,toaster}.tsx` は**消していない** — 凍結アプリの Qシートが 13 か所で
使っており、**放送中の「放送同期が切断されました」も含まれる**。消すと凍結アプリの挙動が変わる。

**ただしバレルからは外した。** 深いパスでしか import できない:
`import { toast } from '@gmo-onair/shared/src/client/ui/use-toast';`
v4 の3アプリは帯（`notify.ts`）を使うこと。Qシートを v4 に載せ替えるとき（v4.1 以降）に消す。

### 共通シェル（S2 / S3 で入った）

`src/client/shell/` が **上辺バー 64px ＋ 左メニュー 248px ＋ スマホ下タブ**を持ち、
**v4 対象3アプリすべてが載っています**。凍結4アプリは旧シェル（各アプリの
`src/components/layout/`）のままです。

| ファイル | 役割 |
| --- | --- |
| `shell/AppShell.tsx` | 骨格。高さ・`<NoticeBar />`・`<ConfirmHost />`・3つのモーダル |
| `shell/AppTopbar.tsx` | 上辺バー。**アプリ名そのものが切替ボタン**／検索スロット／本人メニュー |
| `shell/AppSideMenu.tsx` | 左メニュー。権限フィルタ・現在地・「他のアプリ」 |
| `shell/MobileTabs.tsx` | スマホ下端のタブ（高さ 56px ＋ `safe-area-inset-bottom`） |
| `shell/types.ts` | `ShellNavSection` / `ShellNavItem` / `ShellMobileTab` |

- **メニューの中身はシェルが決めない。** 各アプリの `src/components/layout/nav.ts` が渡す。
  **案件管理だけ v4 の情報設計に差し替え済み**（3つの塊 + 折りたたみの「そのほか」）。
  ほかのアプリは今までのままで、その入口の画面を作り終えたときに差し替える
- **光らせるのは1つだけ**（`currentTo()`）。`isCurrent` は入れ子の項目
  （`/sales/projects` と `/sales/projects/confirmed/studio`）で**両方 true になる**ため、
  一致した中でいちばん深いものだけを現在地にする。`shared/tests/apps.test.ts` で固定
- **`ShellNavSection.collapsible`** で塊を折りたためる。**v4 で作り直す前の画面を畳む**ため。
  メニューから消すと動いている画面に辿り着けず、全部並べると v4 の並びが読めない。
  **いまいる画面がその中にあるときは自動で開く**（閉じたままだとどこも光らず迷子になる）
- **`<NoticeBar />` と `<ConfirmHost />` はシェルが持つ。** アプリ側に置かないこと
  （`check-shared-wiring.mjs` が数を数える。シェル自身が描いているかも見る）
- **現在地の判定は `isCurrent()`。** `NavLink` の既定に任せない —
  機材管理は Vite の base が `/equipment/` なので URL に末尾のスラッシュが付き、
  `NavLink ... end` が一致せず**入口を開いても光らなかった**（実ブラウザで発見）
- **左メニューの項目は PC 38px / スマホ 44px。** モックは 38px だが、
  スマホでは指で押すので v4 の「最低 44px」が優先する
- 旧ヘッダー（`SharedHeader` / `AppHeader` / `AppSwitcher` / `appNav`）は
  **凍結4アプリが使うので残してある**

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

**ただし `--radius` は `tokens-v4.css` で 12px にしてある。** shadcn の部品
（ボタン・入力欄・選択欄）は `rounded-md` = `calc(var(--radius) - 2px)` を使うので、
これだけで**ボタンと入力欄が 10px** になる（モックの実測: ボタン 119 個中 10px が最多）。
`rounded` などの数字の段は動かないので、**まだ作り直していない画面の角は今までのまま**。

### v4 だけの Tailwind 設定は `tailwind.v4.preset.ts`（別ファイル）

`tailwind.preset.ts` は**凍結4アプリも継承している**ので、そこに書くと4アプリの見た目が動く。
v4 対象3アプリの `tailwind.config.ts` が `presets: [preset, v4Preset]` の順で継承する。

いま入っているのは**存在しない太さを潰す1件**だけ:

| キー | 値 | なぜ |
| --- | --- | --- |
| `fontWeight.medium` | `400` | LINE Seed JP に 500 が無い。**すでに 400 で描かれている**ので見た目は変わらず、開発ツールに出る値が実描画と一致するようになる |
| `fontWeight.semibold` | `700` | 同上（600 が無い） |

（実測: 400 と 500 の描画は 1 ピクセルも違わない。600 と 700 も同じ。
`check-ui-tokens` の `missing-font-weight` が 610 か所を数えており、減らす作業自体は続ける）

### ボタンの文字は太字（v4 だけ）

モックの `<button>` 119 個のうち **94 個が 700 / 11 個が 800**。一方 shadcn の `Button` は
`font-medium` を持つので v4 では 400 に落ち、**押せるものが本文と同じ太さ**になる。

`button.tsx` の `font-medium` を直接書き換えると**凍結4アプリのボタンまで太くなる**ので、
`Button` には `data-ui="button"` という**属性だけ**を足し、`tokens-v4.css`（v4 対象3アプリしか
読まない）で `:root [data-ui='button'] { font-weight: 700 }` と上書きしている。

- **`:root` は飾りではない。** `.font-medium` はクラス1つ = 詳細度 (0,1,0)、属性1つも (0,1,0) で
  同点になり、同点なら**後ろに書かれた Tailwind のユーティリティが勝つ**。`:root` を足して
  (0,2,0) にして初めて効く
- 凍結アプリは `tokens-v4.css` を読まないので、**DOM に属性が1つ増えるだけ**
  （4アプリのビルド CSS が変更前と**1バイトも違わない**ことを確認済み）

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
| 型スケール | `text-{h1,h2,cardtitle,list,sub,sub-sm,th,badge,note}` — **サイズ・行間・ウェイトを束ねる** |

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

### 段を足したら `cn()` にも教える（P2 で判明・最重要）

`src/client/utils.ts` の `cn()` は tailwind-merge で「あとに書いたクラスが前を打ち消す」を
実現しているが、**判断は既定の Tailwind のクラス名一覧に基づく**。`text-badge` のような
独自の名前は一覧に無いので `text-...` を**色**の指定だと解釈し、「サイズとは衝突しない」と
判断する。結果**両方残り、CSS の順番で組み込みの `text-xs` が勝つ**。

- 型スケールを足したら `V4_FONT_SIZES` に、角丸の役割名を足したら `V4_RADII` に**必ず追記**。
  `npm run lint`（`check-tokens.mjs`）が `tailwind.preset.ts` との食い違いを止める
- **`fontSize` のキーに色名と同じ名前を使わない。** `text-card` は
  「font-size:15px」と「color: 面の白」の**両方の規則**になり、文字が白地に白で消える。
  だから型スケールは `cardtitle`。これも `check-tokens.mjs` が検査する
- 気づけたのは**実ブラウザで font-size を実測したとき**だけだった（型・lint・
  CSS の突き合わせのどれにも出ない）。だから `shared/tests/utils.test.ts` で固定してある

## 触るときの注意

- **`shared/` を触る PR は全アプリの再ビルドを起こす。** 「共通部分を触る PR」と
  「1アプリだけの PR」を意識して分けること（分ければ後者はビルドがスキップされる）
- **`shared/src/` に新しいクラス名を書くと、凍結4アプリの CSS にも入る。**
  各アプリの Tailwind の `content` が `../shared/src/client/**` を含むため、
  **そのアプリが描かない部品のクラスまで CSS になる**。実際に左メニューへ
  `lg:min-h-[32px]` を1つ足しただけで凍結3アプリの CSS が 28 バイト増えた
  （`tests/` を `src/` の外に置いてあるのと同じ理由）。
  → **shared に手を入れたら凍結4アプリの CSS のハッシュを必ず突き合わせること。**
  既にある値で足りるならそれを使う（上の例は `lg:min-h-[38px]` で解決した）
- **アプリ一覧は `src/client/apps.ts` が唯一の正**（S1 で統合済み）。
  以前は `AppSwitcher` の `ONAIR_APPS`・`appNav` の `ALL_APPS`・`client` の `BLOCK_APPS`・
  各 `Sidebar`・`NoPermissionPanel` の5か所にあり、**すでに食い違っていた**
  （`studio` が「カレンダー」と「スタジオ予約」、技術資料のアイコンが2種類、
  計時LIVE のアイコンがどの対応表にも無く既定の箱に落ちていた）。
  **アイコンは部品そのもの**を持つので、名前→部品の対応表（7個あった）はもう要らない
- `src/collab/` を変えたら `server/src/shared/collab/` も同じに直す（検査で止まる）
