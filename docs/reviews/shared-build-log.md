# shared — 共通コードの経緯ログ

**この文書は記録。現役ルールは [`shared/CLAUDE.md`](../../shared/CLAUDE.md)。**

2026-09-08（v4.6.10）に `shared/CLAUDE.md`（49.5KB）を「いま効くルールと部品のカタログ」に
書き直したとき、そこから外した**経緯・当時の実測・判断の理由・フェーズごとの導入史**
（P1〜P3・S1〜S3・T1b〜T3・M0〜M11・Phase 2／6・F3・G3／G4 …）を、
**元の節名の見出しのまま、本文をそのまま**ここに移した。
節の中には現役のルールも混ざっているが、正は `shared/CLAUDE.md` で、食い違ったらあちらが勝つ。
本文は移動時点のまま一切手を入れていない（元の文書に相対リンクは無かったので張り替えも無い）。

## 移した時点で古いと分かっている記述（2026-09-08 に確認）

| 元の記述 | 2026-09-08 時点の事実 |
| --- | --- |
| バレルが `data-table` / `filter-bar` / `scroll-area` を再エクスポートしていない | この3つは 2026-09 のレビュー棚卸しで**削除済み**（`shared/src/client/ui/index.ts` の頭注） |
| `src/client/dashboard/` に `chart-colors` がある | `chart-colors.ts` は無い（`tokens.css` / `tokens-v4.css` のコメントに名前だけ残っている） |
| import 文はアプリ側だけで約1,000か所 | 配信中5アプリの `src/` で 1,651 か所（実測） |
| `EmptyState` の既定 `title` は「データがありません」なので必ず渡す | 既定値そのものが廃止され `title` は**必須**になった（`docs/wording.md` が名指しで否定した文のため） |
| `awards` は凍結（`frozen: true`） | 2026-09-06 に**廃止**（段F・URL到達不可）。`frozen: true` は「一覧・切替に出さない印」として残っているだけ |
| `check-ui-tokens` の `app-foundation` は3アプリのまま | 変わらず（`client-techops` / `client-live` は未追加）— 現役の ⚠️ として `shared/CLAUDE.md` にも残した |

---

## 元の本文（v4.6.10 時点・そのまま）

以下の見出しは元の `shared/CLAUDE.md` の節名そのもの。

# shared — 全アプリの共通コード

**ここを触ると配信中の5アプリ全部に効く**（`client` / `client-daily` / `client-equipment` /
`client-techops` / `client-live`）。PR の影響範囲に必ず「共通ライブラリ」を入れること。
`client-awards`（リアルタイムCG）は**廃止・コード保存のみ**で、ビルド対象外・shared の
CSS / preset も読まない（`client-awards/CLAUDE.md`）。

**凍結アプリは 0 個になった**（v4.2.0 時点。`scripts/check-frozen-css.mjs` の `APPS` は空）。
この文書の決めごとの多くは「凍結アプリの見た目を変えない」ために生まれたが、
その縛り自体は消えた。ただし**仕組み（`client-v4/` の分離・`tokens-v4.css` の層・
`check:frozen` など）は配線されたまま残っている**ので、黙って壊さず、
各節の「現状」の説明に従うこと。

ビルド工程を持たない（`main`/`types` が `src/index.ts` を直接指す）。各アプリは
`@gmo-onair/shared/src/client/...` の深いパスで **TypeScript のまま** import する。

## 参照経路（4つある。ずれると shared が二重に読み込まれる）

| 経路 | 何で解決するか | 書き方 |
| --- | --- | --- |
| `import` 文（アプリ側だけで約1,000か所） | 各アプリの `vite.config.ts` の `resolve.alias` | `@gmo-onair/shared/src/...` |
| 型チェック（同じ import 文） | 各アプリの `tsconfig.json` の `paths` | 同上 |
| CSS の `@import`（配信中5アプリ） | Vite の `resolve.alias` | `@gmo-onair/shared/src/client/base.css` |
| Tailwind の preset（配信中5アプリ） | Node の解決（`node_modules` の symlink） | `@gmo-onair/shared/tailwind.preset`（**パッケージ名で**。相対パスは検査が止める） |

**4つが同じ実体を指していないと、zustand のストアや React の context が2つできる**
（「片方で更新したのに反映されない」という再現条件の読めない不具合になる）。
`npm run lint` の `check-shared-wiring.mjs` が `client-*` 全ディレクトリを機械的に照合する。

- **`package.json` の依存は必ず `"@gmo-onair/shared": "*"`。** 範囲（`^2.9.237` 等）を書くと
  **本番のビルドが落ちる** — Dockerfile の manifests ステージが全ワークスペースの `version` を
  `0.0.0-build` に書き換えるので範囲が外れ、`npm ci` が公開レジストリを見て 404 になる
- **`tsconfig.json` の `paths` は、指す先が無いと黙って `node_modules` にフォールバックする**
  （実測: 存在しないディレクトリに向けても `tsc -b` は exit 0）。**型チェックでは気づけない**ので、
  ずれを見つけられるのは上記の検査だけ
- **`shared` に `tsconfig.json` は無い。** そのため shared は各アプリの `tsc -b` に取り込まれる形で
  **CI では5回・5通りの `compilerOptions` で型チェックされる**（`client-daily` / `client-live` だけ
  `noUnusedLocals: false`）。正しく直すには shared を composite プロジェクトにして
  `references` で参照する必要があるが、それは `main`/`types` を `dist` に向ける変更＝
  約1,000か所の import と CSS の `@import` に影響するため、手を付けていない

## 中身

| 場所 | 何が入っているか |
| --- | --- |
| `src/client/apps.ts` | **アプリ登録（唯一の正）**。名前・アイコン・色・URL・権限モジュール。`frozen: true` が残るのは廃止済みの `awards` だけ（`visibleApps()` の既定が外す） |
| `src/client/shell/` | **共通シェル**（上辺バー・左メニュー・スマホ下タブ）。配信中5アプリ全部が使う |
| **`src/client-v4/`** | v4 で足した部品の置き場所。**もとは「凍結アプリの Tailwind に走査させない」ための分離**だったが、いまは配信中5アプリ全部が `client/**` と `client-v4/**` の両方を走査する。分離の実益は「また凍結する段が出たときの受け皿」のみ — 統合するかは別途判断（フォローアップ） |
| `src/client/tokens.css` | 設計トークンの基層（色・書体・角丸）。**直読みするアプリは0** — 全アプリ `base.css` 経由 |
| `src/client/base.css` | **共通の土台**（`html`/`body`/`#root` の高さ・書体・タップ領域・印刷）。`tokens-v4.css` → `tokens.css` を import した上に敷く。配信中5アプリ全部が読む |
| `tailwind.preset.ts` | 配信中5アプリの `tailwind.config.ts` が `presets` で継承（`client-awards` は自前の設定で完結） |
| `src/client/ui/` | shadcn/Radix のプリミティブ22本 |
| `src/client/dashboard/` | `DashboardHeader` / `KpiCard` / `SectionCard` / `EmptyState` / `chart-colors` |
| `src/client/{AppHeader,SharedHeader,AppSwitcher}.tsx`, `appNav.ts` | **旧ヘッダー。配信中のアプリに利用者はもう居ない**（import しているのは保存のみの `client-awards` だけ）。削除はフォローアップ |
| `src/client/{createApi,createAuthHook,queryClient,uiStore}.ts` | axios・認証フック・react-query・UIストアのファクトリ。ストレージキーは**全アプリ `gmo_onair_user` に統一済み** |
| `src/client/live/` | 計時・視聴者ミニアプリの共通部品（`socket` / `useTimer` / `DisplayCanvas` / `displayLayout`）。**使うのは `client-techops`**（運用画面）。`client-live` 側の `lib/socket.ts` / `hooks/useTimer.ts` は**表示画面 `/live/display/` 専用の意図的な複製**（見た目を変えない決まり） |
| `src/client/{manual,mcpInfo,versionHistory}/` | ヘッダーから開くモーダル3種 |
| `src/collab/` | Yjs の同時編集（`server/src/shared/collab/` と**意図的に複製**。`scripts/check-collab-parity.mjs` が一致を検査し、違えばビルドを止める） |
| `src/constants/statuses.ts`, `src/utils/businessDays.ts`, `src/enums.ts`, `src/types.ts` | 業務の共通定義 |

> ⚠️ **ファイルを送るときは Content-Type を書かないこと**（`createApi.ts`・実際に踏んだ）。
> この instance は `headers: { 'Content-Type': 'application/json' }` を**全リクエストに固定**
> しており、**axios 1.x は中身が FormData でも Content-Type が JSON なら
> `formDataToJSON()` で素の JSON に変換して送ります**。`File` は列挙できる
> プロパティを持たないので、**`{"audio":{}}` になってファイルが丸ごと消えます**
> （実害: 打合せの録音・BOX へのファイル配置・トップの添付が「押しても何も起きない」）。
>
> **いまは request interceptor が入口で 1 回外します。** 呼び出し側で直して回らないこと —
> 書き込みは数百か所あり、どれがファイルを送るかは増えていきます。
> 外したあとは axios の XHR アダプタが境界文字列つきの `multipart/form-data` を
> ブラウザに任せて付けます（`multipart/form-data` を手で書いている箇所も同じ道を通る）。

### v4 の共通部品（P1 で入った）

| 部品 | 何を強制するか |
| --- | --- |
| `<Money value={n} />` `<MoneyCell width={n} />` | **`¥` と数字を別要素**にして、縦に並べたとき**金額の右端**をそろえる（⚠️ 桁ごとには揃いません・「書体」の節） |
| `<StatValue size="lg\|md\|sm">` | 大きい数字のサイズを4段から選ばせる（`text-2xl` を直書きさせない） |
| `<Num value unit>` | 金額でない数字。等幅で桁をそろえる |
| `<DateRange start end />` | 期間の**開始／`〜`／終了を別要素**にする |
| `manYen(n)` / `compactYen(n)` / `toMan(n)` | 万円の丸めを**1か所**にする |
| `<PageTitle>` | v4 より前の段の見出し部品。**使う画面は 0 になった**（全画面が `PageHeader` へ移行済み）。部品はまだ `ui/numbers.tsx` に残っている — 削除はフォローアップ |

### v4 の共通部品（Phase 2 で足した分）

| 部品 | 何を強制するか |
| --- | --- |
| `<PageHeader title sub primaryAction>` | 画面の見出しと**主アクションの置き場所**。PC は右上・スマホは**下端固定**。各画面が個別に `fixed bottom-0` を書かない |
| `<FilterChips items value onChange>` | 件数つきの絞り込みチップ。`count` は**必須** — 押す前に 0 件だと分かる |
| `formatRelativeTime(t)` | 「最後の動き」の相対表示。1分/1時間/24時間/7日の段と、**未来は「たった今」に丸める**（時計のずれで「-1分前」が出る） |

- **スマホの主アクションはシェルが置きます**（`src/client/shell/primaryAction.ts`）。
  シェルが下タブの上に空の差し込み口を1つ持ち、`PageHeader` が `createPortal` で描きます。
  **`fixed` にしていない**のが要点で、普通の流れに置けば本文のスクロール領域が
  その分縮むため、画面ごとに下余白を足して回らずに済みます（足し忘れると最後の行が押せない）
- **万円の丸めは `manYen` 1本。** 着手時点で4通りに割れ、同じ画面の中で食い違っていた
  （KPI カード `¥1,234.568万` / 同じ画面のグラフ `¥1235万`。負の数で結果が違う実装もあった）
- **1万円未満をそのままの円で出したいときは `compactYen`。** 5,000 円を「¥1万」と
  出すと倍に見えるので、この振る舞いは残してある（日常業務の週報がこの形）
- **テストがある** — `npm test`（`shared/tests/`）。
  画面を見ても間違いに気づけない計算なので、ここだけは書く。
  **`src/` の外に置くこと** — 各アプリの Tailwind の `content` が `../shared/src/client/**` を
  含むので、`src/` に置くと**テストの中のクラス名まで全アプリの CSS になる**。
  理由の詳細は `shared/tests/README.md`

### v4 の共通部品（P2 で入った）

| 部品 | 何を強制するか |
| --- | --- |
| `<Row density align divider interactive stackOnMobile>` | 一覧・表の1行。行高と区切り線を1か所にする |
| `<RowMain>` | **行の中で唯一伸びる子。** `min-w-0` + `flex-1` を内包する |
| `<RowTitle>` `<RowSub>` | 名前列の主／副テキスト。1行で省略する |
| `<RowSlot w align hideOnMobile placeholder>` | 固定幅の列。**7段しか受け付けない**。値が無い行も枠を残す |
| `<RowHeader>` | 表頭。**本文と同じ `<RowSlot>` を並べる**のでずれない |
| `<TableBadge label w>` | バッジを固定幅の枠に入れる（**和文4字までは 62px の帯・文字は中央寄せ**） |

- **列幅の7段（`SlotWidth`）は `ui/row.tsx` が正。** `MoneyCell` の `width` も
  `TableBadge` の `w` もここを読む。**別々に持つとずれる**（「金額列は96px・
  バッジ列は100px」になる）。着手時点で手書きの列幅97か所のうち7段に乗っていたのは33%だけだった
- **`<Row stackOnMobile>` が `<RowMain>` を `data-row-main` 経由で狙っている。**
  この属性を消すとスマホの縦積みが黙って効かなくなる
- ⚠️ **バッジの文字を均等割り付けにしないこと**（一度やって戻した）。
  モックの指定には `text-align-last:justify` が書いてあるが、**同じ要素が
  `display:inline-flex` なので効いておらず、モックは中央寄せで描かれている**
  （`text-align` 系は flex の中身の配置に効かない）。これを「割り付けたいのだ」と
  読んで表示を block 系に変えたため、**「口頭決定」が「口 頭 決 定」に見えていた**
  （利用者から2度指摘された）。**`Badge` の既定の表示（flex）を変えないこと。**
  縦の整列は**幅の固定だけで足りている**
- **`text-badge` を効かせるには `cn()` の設定が必要**（下記）

### v4 の共通部品（P3 で入った）— 中身が無いとき・知らせる・訊く

| 部品 | 置き場所 | 何を強制するか |
| --- | --- | --- |
| `EmptyState` / `NoSearchResults` | `src/client/states/` | 「該当なし」で終わらせない。**0件の理由**（1件も無い／絞り込みが効いている）を分ける |
| `Delayed` + `SkeletonRows` / `SkeletonCard` / `SkeletonKpi` | 同上 | **1秒未満はスピナーを出さない**（点滅させない）。全画面ローディングを作らない |
| `ErrorPanel` + `humanizeError` | 同上 | 原因1文＋次の一手1文。**HTTP コード・スタックを画面に出さない** |
| `NotFoundPanel` | 同上 | 知らない URL で**真っ白にしない** |
| `NoPermissionPanel` | 同上 | 白紙にせず、**何の権限が要るか**を名前で出す |
| `notifySuccess` / `notifyApiError` ほか | `src/client/notify.ts` | 結果を**流れて消えない帯**で伝える（`alert()` の置き換え先） |
| `<NoticeBar />` | `src/client/ui/notice.tsx` | 帯の出る場所。**アプリのシェルに1つだけ** |
| `confirmAction()` / `<ConfirmHost />` | `src/client/ui/confirm.tsx` | 「〜しますか？」を画面の中で訊く。**一緒に何が消えるかを書ける** |

- **`EmptyState` の実装は1つだけ**（`src/client/dashboard/EmptyState.tsx`）。既存の利用が
  多かったので `states/` からは**再エクスポート**している。v4 の画面は `states` だけを
  見ればよい。ただし既定の `title`（「データがありません」）は v4 の決めごとに反するので、
  **必ず `title` と `description` を渡すこと**
- **`<NoticeBar />` と `<ConfirmHost />` は配信中5アプリのシェルに1つずつ。**
  `confirmAction` は器が無いと **`false` を返して実行しません**（黙って実行するより安全側）。
  つまり置き忘れると「削除ボタンを押しても何も起きない」になるので、
  `npm run lint` の `check-shared-wiring` が**数を数えて**止める
- **`states` / `notice` / `confirm` は `ui/index.ts` のバレルに載せない。**
  載せると使わないアプリのバンドルにも入る（描かないので純粋に無駄）。深いパスで名指しする

### 保存が黙って失敗しない仕組み（P3・重要）

`src/client/queryClient.ts` の MutationCache に**最後の受け皿**を置いてある。
着手時点で書き込みは約300か所あるのに `onError` は54か所しかなく、残りは
400 / 403 / 500 が返っても**画面に何も出ない**状態だった。

- 画面が自分で `onError` を持っているときは**黙る**（同じ失敗を2回出さない）
- `useMutation({ meta: { action: '案件の保存' } })` を渡すと「案件の保存に失敗しました」になる。
  `meta: { silent: true }` で受け皿を止められる
- `onError` の**引数の並びを取り違えると常に黙る**。並びは `(error, variables, context, mutation)` で
  **4番目が mutation**。`shared/tests/queryClient.test.ts` が実際に失敗させて固定している

### トーストは残っているが、新しい画面では使わない

`ui/{toast,use-toast,toaster}.tsx` は**まだ生きている** — `client-techops` が
`src/lib/notify.ts` のラッパー経由で使い、`main.tsx` に `<Toaster />` を置いている
（`check-shared-wiring` は `client-techops` だけ `<Toaster />` 1個を要求し、他は 0 を要求する）。

**バレルからは外してある。** 深いパスでしか import できない:
`import { toast } from '@gmo-onair/shared/src/client/ui/use-toast';`
新しい画面は帯（`notify.ts`）を使うこと。`client-techops` を帯へ寄せてトーストを
消すのは残作業（フォローアップ）。

### 共通シェル（S2 / S3 で入った）

`src/client/shell/` が **上辺バー 64px ＋ 左メニュー 248px ＋ スマホ下タブ**を持ち、
**配信中5アプリすべてが載っている**。

| ファイル | 役割 |
| --- | --- |
| `shell/AppShell.tsx` | 骨格。高さ・`<NoticeBar />`・`<ConfirmHost />`・3つのモーダル |
| `shell/AppTopbar.tsx` | 上辺バー。**アプリ名そのものが切替ボタン**／検索スロット／本人メニュー |
| `shell/AppSideMenu.tsx` | 左メニュー。権限フィルタ・現在地・折りたたみ |
| `shell/MobileTabs.tsx` | スマホ下端のタブ（高さ 56px ＋ `safe-area-inset-bottom`） |
| `shell/types.ts` | `ShellNavSection` / `ShellNavItem` / `ShellMobileTab` |

- **メニューの中身はシェルが決めない。** 各アプリの `src/components/layout/nav.ts` が渡す
- **上辺バーはトップページだけ形が違う**（モックの main 側）。`appKey === 'home'` のとき
  **アプリ切替ボタンとパンくずを出さず、検索を左に置く**。トップは**アプリの一覧そのもの**
  なので、切替ボタンは同じ物への2つ目の入口になる
- **補助3つ（マニュアル・版の履歴・MCP）は本人メニューの中**。上辺バーに
  アイコンは検索・通知・本人だけ。幅で置き場所が変わると「さっきあった所に無い」が起きる
- **通知は PC だけ枠つきの「通知」ボタン**（`client-v4/NotificationBell.tsx`）。
  スマホはベルだけ。件数は**同じ1つの要素**で、PC は文字の右に並び（`lg:static`）、
  スマホはベルの右上に重なる（2つ描くと片方だけ直る）
- **光らせるのは1つだけ**（`currentTo()`）。`isCurrent` は入れ子の項目で**両方 true になる**ため、
  一致した中でいちばん深いものだけを現在地にする。`shared/tests/apps.test.ts` で固定
- **`ShellNavSection.collapsible`** で塊を折りたためる。
  **いまいる画面がその中にあるときは自動で開く**（閉じたままだとどこも光らず迷子になる）
- **現在地の判定は `isCurrent()`。** `NavLink` の既定に任せない —
  機材管理は Vite の base が `/equipment/` なので URL に末尾のスラッシュが付き、
  `NavLink ... end` が一致せず**入口を開いても光らなかった**（実ブラウザで発見）
- **左メニューの項目は PC 38px / スマホ 44px。** モックは 38px だが、
  スマホでは指で押すので v4 の「最低 44px」が優先する
- **左メニュー下の「他のアプリ」は外した**（M4）。上辺バーのアプリ切替と
  **完全に重複**していた（どちらも `visibleApps()` の同じ一覧）
- **廃止した `awards` はどこにも出ない**（`frozen: true` を `visibleApps()` が外し、
  トップページのタイルからも除外済み。サーバーも配信しない）

### UI 部品の置き場所と参照のしかた

- `src/client/ui/index.ts`（バレル）は **`data-table` / `filter-bar` / `pagination` /
  `table` / `searchable-select` / `currency-input` / `scroll-area` を再エクスポートしていない**。
  深いパスで名指しする: `import { Table } from '@gmo-onair/shared/src/client/ui/table';`
  → バレルに載せると**使わないアプリまで Radix を巻き込む**（`scroll-area` が要求する
  `@radix-ui/react-scroll-area` は案件管理にしか入っていない）
- **`motion` / `animated-number` は `client/src/components/ui/` に残してある。**
  `framer-motion` が案件管理にしか無いうえ、v4 は hover を色・罫線だけに絞り
  画面遷移も CSS の `animation` で行う（`docs/design/v4/_tokens.md`）。
  **v4 が離れていく方向の部品**なので他アプリに背負わせない
- **`client-equipment/src/pages/EquipmentDetailPage.tsx` に独自の `SearchableSelect`** があり、
  prop の形も見た目も shared 版と違う。差し替えると画面が変わるので放置中（フォローアップ）

### npm パッケージは `peerDependencies` に申告する

`shared` はビルドせず TypeScript のまま配るので、**shared が import したパッケージは
それを使うアプリ側で解決されます**。申告が無くても npm workspaces のホイスティングで
たまたま解決できてしまう（実際に `lucide-react` / Radix 9個などが未申告だった）。
`npm run lint` の `check-shared-wiring` が申告漏れを止めます。

`dependencies` ではなく **peer** にすること — Radix も React も**実体が2つあると壊れます**
（context が別インスタンスになりダイアログが開かない等）。一部のアプリしか使わないものは
`peerDependenciesMeta` で `optional` にしてあります。

## 共通の土台 `base.css`（重要）

**配信中5アプリの `index.css` は `@import '@gmo-onair/shared/src/client/base.css';` から始め、
アプリ固有の CSS だけを書く。** `html`/`body`/`#root` をアプリ側で上書きしないこと。
`scripts/check-ui-tokens.mjs` の `app-foundation` が import の有無を見ている
（⚠️ 検査対象は当初の3アプリのままで、`client-techops` / `client-live` は未追加 — フォローアップ）。

- **`client-awards` は読まない**（自前トークンで完結・ビルド対象外）
- **シェルの根は `h-screen`(=100vh) ではなく `h-full`。** iOS の `100vh` は URL バーを含むので
  実際の表示領域より高くなり、`#root` の `overflow: hidden` で下端が切れる
- **`@media print` は `@layer base` の中に置く。** 外に出すと効かない — Tailwind は
  `@layer base` の中身を `@tailwind base` の位置へ移すが素の CSS は書いた場所に残り、
  `base.css` は `index.css` の先頭で import されるので `overflow: hidden` より前に出て負ける
  （実ブラウザで実測して見つけた。**印刷が1ページ目で切れる**）

## トークンの2層構造（歴史的経緯と現状）

もとは「v4 対象3アプリだけ v4 の色にし、凍結アプリは今日のまま」を実現するための構造。
**凍結アプリが 0 になったいまも、層はそのまま生きている**:

```
base.css  →  tokens-v4.css  →  tokens.css     ← 配信中5アプリ全部
```

| ファイル | 現状 |
| --- | --- |
| `src/client/tokens.css` | 基層。**直読みするアプリは 0**（`base.css` 経由でのみ届く）。DADS のプリミティブ＋GMO ブルーと意味づけ |
| `src/client/tokens-v4.css` | 上書き層＋v4 で足した名前・規則（`.dark` の暗側・スマホの当たり判定・動きの `.v4-*` など）。実質**ここが現役のトークン置き場** |
| `tailwind.preset.ts` | 配信中5アプリが継承。キーの値を変えると5アプリ一斉に効く |

- 「`tokens.css` の値を変えない」という旧ルールの理由（凍結の見た目を守る）は消えたが、
  **`check-tokens.mjs` の検査は生きている**: `tokens-v4.css` の上書き名が `tokens.css` に
  実在すること（打ち間違えると**上書きにならず新しい変数を作るだけ**）を見る。
  2層を1つに畳むかは別途判断（フォローアップ）。それまでは
  **値の上書きは `tokens-v4.css`・新しい名前は `tokens.css`** の分担を守る
- 色は **RGB の3つ組 ＋ `<alpha-value>`** で持つ（`rgb(var(--primary) / <alpha-value>)`）。
  `bg-primary/10` のような半透明指定が多数あるので、色コードの直書きにはできない。
  **`hsl(var(--…))` と書かないこと** — 3つ組を HSL として読むと全く違う色になる。
  `check-tokens.mjs` が止める（`client-awards` だけは自前の HSL トークンで完結しているので対象外）

### 書体（T3 で入った）

配信中5アプリの書体は **LINE Seed JP**（`palt` 1 / `kern` 1。数字は本文と同じ書体 ＋
`palt` 0 / `tnum` 1）。例外は2つ:
**計時LIVE の表示画面 `/live/display/`** は見た目を変えない決まりなので
`client-live/src/index.css` が Noto Sans JP を絶縁して当てている。
**`client-awards`** は自前（Google Fonts）。なお `client-techops` / `client-live` の
`index.html` には旧画面向けの Google Fonts 読み込みも残っている。

- **LINE Seed JP は 400 / 700 / 800 しか配信されていない**（500/600 を要求しても返らないことを実測）。
  `font-medium` / `font-semibold` は**黙って 400 / 700 に落ちる**。
  → **v4 の画面では `font-medium` / `font-semibold` を書かない。**
  型スケール（`text-h1` 等）がウェイトを内包しているのでその必要が無い
- ⚠️ **数字は等幅になっていません（実測・2026-08）。** かつてここには「`tnum` で
  桁が一直線になる」と書いてあったが、数字の subset を読み込ませて 16px で測ると、
  無指定・`palt 1`・`tabular-nums`・`palt 0 + tnum 1` の**4通りとも同じ幅**だった
  （`1111111111` = 77.56px / `8888888888` = 114.20px。比較用 monospace は 99.33px/99.33px
  なので測り方は等幅を検出できる）。つまり **LINE Seed JP の数字はプロポーショナル**。
  **揃うのは「金額の列の右端」** — `MoneyCell` が幅を固定し `Money` の `justify-between` が
  右端に寄せるので、縦に読むときに効く右端は揃う。揃わないのは桁ごとの位置だけ
- **`palt` の打ち消し（`.font-number` の `palt 0`）は残してある。** いまの書体では
  数字の幅を変えないが、**書体を替えた日に効く**（外すと、替えた瞬間に
  何が起きるか分からなくなる）
- **数字に別の書体を当てない。** 別書体だと**その書体が届く前の一瞬だけ数字の幅が変わり、
  列の幅がずれる**（v4 前は Roboto Condensed が当たっていた）
- `tailwind.preset.ts` の `fontFamily` は**トークン参照**（`var(--font-sans)` 等）。
  書体名をベタ書きすると、書体を替えるとき1か所で済まなくなる

### 角丸は数字の段を入れ替えていない（決定）

v4 の角丸9段は Tailwind の組み込みの名前（`rounded` / `rounded-xl` / `rounded-2xl` /
`rounded-3xl`）と**そのままぶつかり、まだ作り直していない画面の角まで変わる**
（実際に入れて `rounded` 4px→7px が1,455か所動き、戻した）。**v4 の画面は役割名**
（`rounded-card` / `rounded-control` / `rounded-note` など）**を使うこと。**

**ただし `--radius` は `tokens-v4.css` で 12px にしてある。** shadcn の部品
（ボタン・入力欄・選択欄）は `rounded-md` = `calc(var(--radius) - 2px)` を使うので、
これだけで**ボタンと入力欄が 10px** になる（モックの実測: ボタン 119 個中 10px が最多）。

### v4 だけの Tailwind 設定は `tailwind.v4.preset.ts`（別ファイル）

もとは凍結アプリに効かせないための分離。いまは**配信中5アプリ全部が
`presets: [preset, v4Preset]` の順で継承している**（`check-shared-wiring` が照合する）ので、
`tailwind.preset.ts` との実質的な効き先は同じ。統合はフォローアップ。

いま入っているのは**存在しない太さを潰す1件**だけ:

| キー | 値 | なぜ |
| --- | --- | --- |
| `fontWeight.medium` | `400` | LINE Seed JP に 500 が無い。**すでに 400 で描かれている**ので見た目は変わらず、開発ツールに出る値が実描画と一致するようになる |
| `fontWeight.semibold` | `700` | 同上（600 が無い） |

（`check-ui-tokens` の `missing-font-weight` が `font-medium`/`font-semibold` の
残数を数えており、減らす作業自体は続ける）

### ボタンの文字は太字

モックの `<button>` 119 個のうち 94 個が 700 / 11 個が 800。一方 shadcn の `Button` は
`font-medium` を持つので 400 に落ち、**押せるものが本文と同じ太さ**になる。

`button.tsx` の `font-medium` は書き換えず、`Button` に `data-ui="button"` という
**属性だけ**を足し、`tokens-v4.css` で `:root [data-ui='button'] { font-weight: 700 }` と
上書きしている（凍結アプリに効かせないための方式だったが、仕組みはそのまま生きている）。

- **`:root` は飾りではない。** `.font-medium` はクラス1つ = 詳細度 (0,1,0)、属性1つも (0,1,0) で
  同点になり、同点なら**後ろに書かれた Tailwind のユーティリティが勝つ**。`:root` を足して
  (0,2,0) にして初めて効く

### v4 で足した名前（T1b）

| 種類 | 名前 |
| --- | --- |
| 状態の帯 | `success-surface/-border`・`warning-surface/-border/-border-strong`・`destructive-surface/-border`・`info-surface/-border` |
| AI・表彰 | `ai`・`ai-foreground`・`ai-surface`・`ai-border` |
| 面と罫の段 | `surface-subtle`・`border-subtle`・`border-faint`・`border-disabled` |
| プライマリの淡い段 | `primary-surface`・`primary-surface-weak`・`primary-border`・`primary-border-strong` |
| 薄い文字 | `fg-disabled` — **読ませる文字には使わない**（白地で 2.61:1）。ヒント文字・押せない状態・アイコンの塗りだけ |
| 見分けの色 | `cat-1`〜`cat-8` — 意味を持たない系列用。**状態の色を流用しない**。⚠️ **`cat-5`（山吹 #d2a400）は文字に使わない** — 白地でコントラストが足りず `verify-ui` の「薄すぎる文字」で落ちる（罫線・塗りなら可） |
| 角丸の役割名 | `rounded-{badge-xs,badge,control,control-md,control-lg,note,card,app,chip}` |
| 型スケール | `text-{h1,h2,cardtitle,list,sub,sub-sm,th,badge,note}` — **サイズ・行間・ウェイトを束ねる** |

- **v4 の一群は明るい配色が基本。** 暗側は `tokens-v4.css` の `.dark` が持つ
  （制作技術支援の本番系画面が `<html>` に `.dark` を付けて使う。`tokens.css` の
  `.dark` は `:root` と同じ詳細度で**書かれた順に負ける**ため、`tokens-v4.css` 側に
  暗側の値を移植してある — 消すと本番の暗い画面が壊れる）
- **型スケールがウェイトを内包している**ので、v4 の画面で `font-medium` / `font-semibold` を
  書く理由は無い

### スマホの手触りは部品と型スケールで一度に効かせる（Phase 6）

375px の29画面を実ブラウザで測ったところ、44px 未満のタップ対象が263件・
13px 未満の文字が728種あった。**画面ごとに直すと必ず取り残しが出る**ので、
`tokens-v4.css` の `@media (max-width: 1023px)` に置いてある:

| 規則 | 効く先 |
| --- | --- |
| `:root [data-ui='button'] { min-height/min-width: 44px }` | `Button` 全部（アイコンだけのボタンを含む） |
| `:root .text-note` / `:root .text-sub` `{ font-size: 13px }` | 説明文・注記帯／行の2行目・絞り込みチップ |
| `:root [data-ui='empty-desc'] { font-size: 13px }` | `EmptyState` の説明文 |
| `:root [data-drawer='closed'] { visibility: hidden }` | 閉じた左メニュー（タブ順・読み上げから外す） |
| `:root input:not(...)`, `:root select { min-height: 44px }` | 素の入力欄・選択欄（M5）。`Button` には効いていたが `<input>` / `<select>` は誰も上げていなかった |
| `:root .min-h-tap { min-width: 44px }` | 段の切り替え（A/B/C/D・月/年）。高さは 44px なのに幅が 34〜38px だった。`min-width` は狭いものを広げるだけ |
| `--line-height-jp: 1.6` ／ `.text-h1` 20px ／ `.text-h2` 17px（M6） | 型スケールが PC の文書向け（本文 15px・行間 1.75）だった。行間だけ詰める — **文字は小さくしない**（「本文 13px 以上」を割る） |
| `[data-ui='switch']::after` / `.v4-tap::after` | **見た目を変えずに当たり判定だけ 44px**。トグルの帯(24px)や ○ の印(20px) は大きくすると別の部品に見えるので、透明な擬似要素をかぶせる。**`overflow: hidden` の中では効かない**（はみ出しが切られる） |

**上げていないもの（意図的）**: `.text-sub-sm`(11.5px) / `.text-th`(11.5px) /
`.text-badge`(11px)。件数の数字・列見出し・バッジの札で、決めごとが言う「本文」ではなく、
**上げると `TableBadge` の固定幅に収まらず札の文字が切れる**。

- `Row interactive` と `searchable-select` は shared の部品側に直接
  `min-h-tap ... lg:min-h-0` を書いてある

> ⚠️ **`shared/src/client/**` に書いたクラス名は、コメント・説明文の中でも
> Tailwind に拾われ、全アプリの CSS に規則が入ります。**
> 凍結アプリがあった時代に**4回**これを踏みました — コメントに `in​visible` と
> 書いただけで凍結3アプリの CSS が61バイト増え、しかも3回は
> **「そのクラスは書けません」という説明文の中に実物を書いて**いて直っていませんでした。
> 教訓は3つ:
> 1. **見た目の切り替えはクラス名でなく属性 ＋ `tokens-v4.css`** に寄せる
> 2. **説明・コメントの中でも実物のクラス名を書かない**
> 3. **「変えていない」はビルド出力を突き合わせてから言う** — その機械化が
>    `npm run check:frozen`（`scripts/frozen-css-baseline.json` と md5 を照合。
>    `npm run build:all` のあとに回す）。**いまは凍結アプリが 0 個なので `APPS` は
>    空＝実質何も照合しない**が、また「見た目を止める」段が出たときの受け皿として
>    仕組みは残してある

### 動きの決めごと（手触りの回）

- **画面遷移はシェルが1回だけ掛ける**（`shell/AppShell.tsx` が URL を鍵にする）。
  画面ごとに書くと、掛け忘れた画面だけカクッと出る
- **鍵はパスまで。クエリを含めない** — `?tab=` まで鍵にすると、
  絞り込みを押すたびに画面ぜんぶが動いて酔う
- **`transition: all` を使わない。** 高さ・幅の切り替えまで拾って、
  開閉するパネルがぬるっと伸びる（速くしたのに遅く見える）
- **`prefers-reduced-motion: reduce` を必ず見る。** 止め方は
  `animation-duration: 0.01ms`。**0 にすると `both` の最終状態が当たらず、
  要素が消えたままになる**
- **キーボードの現在地は `tokens-v4.css` の既定に任せる。** 実測で
  82% に何も出ていなかったので、部品ごとに `focus-visible:ring-2` を足して回るのをやめ、
  `:where(...):focus-visible` の既定を1つ置いた（詳細度 0 なので、既に持っている部品は
  そのまま勝つ）。**`:focus` にしないこと** — マウスで押しただけで枠が残る
- **押している間の 0.97 倍は消さないこと。** `base.css` が
  `-webkit-tap-highlight-color: transparent` を当てているので、
  これが無いとスマホで**押しても画面が1ドットも変わりません**
  （通信が返るまで無反応 → もう一度押される → 二重に登録される）

### 「PC で触る画面」は宣言する（M1 / M2）

**スマホで縮めない。** モックの「スマホに置かないもの」（`docs/design/v4/mobile.md` の
`spNotOnPhone`）に対して、実装は判断せずに縦に畳んだだけの画面が大半で、
案内の文面と見た目もバラバラだった。

| 置き場所 | 何を強制するか |
| --- | --- |
| `src/client-v4/pcOnly.tsx` の `<PcOnlyPanel>` | 案内1枚。**①何の画面か ②なぜ PC なのか ③代わりにできること ④それでも開く**の順。④が最後なのは、上に置くと理由を読まずに押されるため |
| 同 `<PcOnlyNote>` | 画面の一部だけ出せないときの帯（案件一覧のボードなど） |
| 同 `<PcOnlyGate>` | 表を見て差し替える。**アプリのシェルに1つだけ** |
| 各アプリの `src/pcOnlyScreens.ts` | `…_PC_ONLY`（PC で触る）と `…_MOBILE_OK`（スマホ）の2つの表 |
| `scripts/check-mobile-declared.mjs` | **`App.tsx` のルートと突き合わせ、どちらにも入っていない画面があれば `npm run lint` を止める** |

- **画面ごとに `useIsMobile()` を書いて分岐させないこと。** 書き忘れても
  「出ないだけ」なので誰も報告せず、作った側は PC で見ているので気づきません。
  **数えられる形にするのが目的**です（検査はこの表を読む）
- **「それでもこのまま開く」を置く**（ご判断）。出張先で見積の金額だけ
  確かめたい、は実際に起きます。**先に理由を読ませてから本人に選ばせる**形にしてあります
- **`src/client/` ではなく `src/client-v4/` に置くこと**（部品の置き場所の決まり）
- 転送（`<Navigate>` と `Redirect…` という名前の部品）は画面として数えません
- **`hidden: true` を付けると、スマホの左メニューからも消えます**（M6・ご判断）。
  シェルに `mobileHiddenPaths` で渡すと `AppSideMenu` が落とします。
  **前方一致ではなく `matchPath` で照合する** — `/settings` を前方一致にすると
  `/settings/sites` まで巻き込みます。**ルートは消しません**（共有 URL は案内が出る）
- ⚠️ **PC専用は原則廃止していく方針が別途動いている**（`docs/v4-native-ui-plan.md`・2026-08〜）。
  この仕組み自体は生きているが、`…_PC_ONLY` の表は縮んでいく方向

### スマホの上辺バーは「ロゴだけ」（モック `v4-live`）

| どこ | 中身 |
| --- | --- |
| **スマホ（全画面共通）** | `☰` ／ **ロゴ 18px** ／ 余白 ／ ベル ／ 本人 |
| PC（≧1024px） | ロゴ 20px ／ 区切り ／ アプリ切替 ／ パンくず … 検索 ／ ベル ／ 本人 |

**上辺バーは「どのサービスか」だけを答える。** どのアプリ・どの画面にいるかは
パンくずと左メニュー、そして本文の見出しが答える。

- 3 回変えた末の確定: ページ名（M7）→ アプリ名のチップ（M10）→ **ロゴだけ**。
  375px では `☰` ＋ チップ ＋ ベル ＋ 本人 で横がいっぱいになり、
  上辺バーが「いまどこか」を言うためだけに 1 行使っていた
- **アプリ切替とパンくずは `v4-wide-only`**（≧1024px）で出し分ける。
  **トップページでは PC でも出さない**（トップはアプリの一覧そのもの）
- **ロゴの高さは属性 ＋ `tokens-v4.css`**（`[data-shell-logo]`）。
  シェルに幅つきのクラス名を書かない（上の警告ブロック参照）
- **ベルと本人はスマホでも残す**（**本人メニューがログアウトとマニュアルの
  唯一の入口**なので消せない）
- **字間 .1em の小見出しと「広い画面でだけ出す」は素の CSS クラス**
  （`tokens-v4.css` の `.v4-eyebrow` / `.v4-wide-only`）。`tracking-[.1em]` / `lg:block` と
  書かないための置き換え先

### スマホ専用の部品は `client-v4/` に置く（M0）

| 部品 | 何を強制するか |
| --- | --- |
| `client-v4/sheet.tsx` の `<Sheet>` | **下から出るシート**。一覧から1件ずつ片づける画面で**画面遷移させない**（決めごと「終わらせるのはシートで」）。主ボタンは下端に固定・中身だけスクロール・`safe-area-inset-bottom` を足す。**`rise` を渡すと 24px だけせり上がる**（書きかけを持ったまま開け閉めするシート向け・opt-in） |
| `client-v4/formDialog.tsx` の `<FormDialog>` / `<FormDialogFooter>` | **CRUD の登録・編集フォーム用の入れ物**（`<Sheet>` の薄いラッパー）。旧 `Dialog` 系のフォームをこちらへ載せ替えると、スマホで自動的に下シートになる。PC の既定幅は 560px（`wide` で 760px）。**旧 `<form onSubmit>` を使っていた画面は `onSubmit` を渡すこと** — 渡さないと Enter 送信・`<button type="submit">` が効かなくなる（初期バッチで発見） |
| `client-v4/mobileFilterBar.tsx` の `<MobileFilterBar>` | **一覧の絞り込みを1行に畳んでシートで開く**（M8）。検索だけ外に出す／効いている数をボタンに出す／下端に「ぜんぶ外す」と「結果を見る」。**数え方は呼ぶ側が渡す** — 何が既定かは画面ごとに違うので、共通側に持たせると必ずどちらかが嘘になる |
| `client-v4/mobile.ts` の `useIsMobile()` | スマホか PC かの判定。**`lg`(1023px) と同じ値**を使う（CSS と JS がずれると片方だけ切り替わる） |
| `client-v4/mobile.ts` の `duePresets()` / `dueLabel()` | 期限は**明日18:00 / 3日後18:00 / 日時を選ぶ**（入力は端末に任せる・自作の日付ホイールを作らない）。**過ぎたものを「あと -2日」と出さない** |
| `client-v4/recent.ts` | **最近見たもの**（端末の中だけ・8件）。サーバーに表を作らない —「見た」は業務の記録ではない。**別の端末では出ないことを画面に書くこと** |
| `tokens-v4.css` の末尾（動き） | 画面遷移 `screenIn`・カード `cardIn`・帯 `toastIn`/`barGrow`・押した瞬間の 0.97 倍・`[data-reveal]`・`.v4-skeleton`・`.v4-rail` ほか。**Tailwind の `animation` キーに足さず、素の CSS クラス（`.v4-*`）にする**。⚠️ 隠して見せる系の既定は「見える」— JS が落ちた日に白紙にしない。**繰り返す動きは `prefers-reduced-motion` で名指しで止める**（`*` の一括だと 1 コマだけ流れて半端な明るさで固まる） |
| `client-v4/flip.ts` の `useFlip()` | **並び替え・絞り込みで行を滑らせる**（FLIP）。①再測定をループさせない ②行の鍵は `data-flip-key`（検査用の `data-row` と兼ねない）③新しく現れた行は滑らせずフェードイン ④シートを閉じるのと同じコマで測らない。滑りの `transition` は動かす回だけ付ける |
| `client-v4/rail.ts` の `useRail()` | **横スクロールのレール**。①離すと慣性で減衰 ②8px までクリック扱い・10px 超で直後のクリックを1回捨てる ③縦ホイールを横送りに変換（端では変換しない）④続きがある側だけ `mask-image` ⑤動きを減らす設定では慣性を付けない |
| `client-v4/NotificationBell.tsx` | 上辺バーのベル（社内通知）。シェル側は `notificationSlot` の受け口だけ。押したときの移動は素の遷移（行き先がアプリをまたぐ） |
| `client-v4/downscaleImage.ts` | **送る前に写真を縮める**（AI の費用を下げる・長辺 1600px / JPEG 0.8）。⚠️ 読めなくしない — 拡大しない／元より重くなったら元を使う／縮められなかったら元を送る。判定は `shared/tests/downscaleImage.test.ts` で固定 |
| `client-v4/offlineQueue.ts` | **端末に溜めて後で送る列**。鍵で上書きなので同じ操作は列に1つ。**載せてよいのは何回やっても結果が同じ操作だけ**（棚卸しの印・返却）。「行を作る操作」を載せると二重登録の原因になる |

このほか `swipeAction` / `pullToRefresh` / `edgeSwipeBack` / `recording` / `richContent` /
`noteText` も同じ場所にある（一覧はディレクトリを直接見る）。

- **`useIsMobile()` で早期 return しない。** 同じ部品の中で `if (mobile) return …` と
  書くと、幅が変わったときに**フックの数が変わって React が落ちる**。
  「どちらを描くか決めるだけ」の薄い親を作り、**部品ごと入れ替える**こと
- 計算だけのもの（`duePresets` / `dueLabel` 等）は `shared/tests/` で固定してある
- ⚠️ **「片方だけ入れた機能は死ぬ」の実例**: スクロールで上辺バーを畳む機能（M9）は、
  CSS 規則だけが別の回で消え、**印を付ける JS だけが残って何も起きない状態**が続いていた
  （動かない機能のために毎回の再描画だけを払っていた）。フックと CSS は**同じ回で**出し入れする

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
- **`shared/src/client/` に新しいクラス名を書くと、そこを走査する全アプリの CSS に入る**
  （コメント・説明文の中でも。上の警告ブロック参照）。使う実体の無い規則で CSS を
  太らせないため、**既にある値で足りるならそれを使い、新しい見た目の切り替えは
  属性 ＋ `tokens-v4.css` に寄せる**。v4 で足す部品は `shared/src/client-v4/` へ
- **アプリ一覧は `src/client/apps.ts` が唯一の正**（S1 で統合済み）。
  以前は5か所にあり、**すでに食い違っていた**。**アイコンは部品そのもの**を持つので、
  名前→部品の対応表はもう要らない
- `src/collab/` を変えたら `server/src/shared/collab/` も同じに直す（検査で止まる）

## 書体は同梱している

`src/client/fonts/lineseedjp/` に **LINE Seed JP の woff2 一式（約6MB）**が入っている
（`scripts/vendor-fonts.mjs` の生成物 / **SIL Open Font License 1.1** © LY Corporation）。
`fonts/lineseedjp.css` を `tokens-v4.css` から読むので、**`base.css` を読む配信中5アプリ**に効く。

- **なぜ外から読むのをやめたか**: 開発コンテナのブラウザは `fonts.googleapis.com` に
  出られないので、`npm run dev` は**ずっと代替書体**だった。字幅はラテンで最大 13% 違い、
  **一覧の GLS番号・日付・金額の桁揃えを本番と違う幅で見ていた**ことになる。
  本番も Google Fonts が届く前提で、社内ネットで塞がれた日に全画面が崩れた
- **6MB を配るわけではない**: Google の `unicode-range` の刻み方をそのまま持ってきたので、
  ブラウザは**使う範囲だけ**落とす。利用者が最初に受け取る量は今までと同じ
- **`document.fonts` で見ると `@font-face` が372個（124 unicode-range × 3ウェイト）並び、
  大半が `unloaded` になる。** これは不具合ではない — ページで実際に使われていない範囲は
  宣言されたまま読み込まれないのが、この分割方式の正しい挙動（層3実機点検で確認・
  2026-08-23）。`status` が `"error"`（読み込み**失敗**）のものが実在するときだけ調べる
  （`node scripts/vendor-fonts.mjs --check` でファイル欠落・破損を確認できる）
- **Google Fonts の読み込みが残っている場所**: `client-live`（表示画面の Noto Sans JP）と
  `client-techops`（旧画面向け）の `index.html`、および保存のみの `client-awards`
- **`OFL.txt` を消さないこと**。OFL は license を書体と一緒に配ることを求める
- 入れ直しは `npm run fonts`。**欠けたら `npm run lint` が止まる**
  （`check-fonts-vendored.mjs`）— 欠けても画面は出てしまうので、
  「なんとなく字が違う」以外に気づく手がかりが無い
