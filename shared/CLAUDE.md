# shared — 全アプリの共通コード

**ここを触ると配信中の5アプリ全部に効く**（`client` / `client-daily` / `client-equipment` / `client-techops` / `client-live`）。
PR テンプレートの影響範囲「共通ライブラリ (`shared/`)」に印を付け、1アプリだけの PR とは分ける（`npm run build:changed` は
`shared/` を触ると全アプリを作り直す）。`client-awards` は**廃止・コード保存のみ**で shared の CSS / preset / シェルを読まない。

- **ビルド工程を持たない。** `main`/`types` は `src/index.ts`。各アプリが `@gmo-onair/shared/src/...` の深いパスで TypeScript のまま
  import する（1,651 か所・2026-09 実測）。**`tsconfig.json` も無い** — 各アプリの `tsc -b` に取り込まれ、CI（`typecheck:all`）で
  5通りの `compilerOptions` で型検査される
- **凍結アプリは 0**（`scripts/check-frozen-css.mjs` の `APPS` は空）。凍結のために作った仕組み（`client-v4/` の分離・`tokens-v4.css`
  の層・属性＋CSS の方式・`check:frozen`）は配線されたまま残す。統合は別途判断

| 触ったら回す検査 | 見るもの |
| --- | --- |
| `npm run lint` | `check-shared-wiring`（参照経路・peer 申告・帯と確認の器の数）／`check-tokens`（色の契約・`cn()` の段）／`check-ui-tokens`（部品の使い方・`app-foundation`）／`check-contrast-tokens`／`check-mobile-declared`／`check-form-submit`／`check-fonts-vendored`／`check-file-size`（`shared/src` も 400 行まで） |
| `npm run test` | `shared/tests/`（Vitest 164 ファイル）。**CI が回す。手元の gate にも必ず入れる** |
| `npm run verify:ui` | 実ブラウザで書体・桁揃い・横はみ出し・タップ寸法を実測 |
| `node scripts/check-collab-parity.mjs` | server と対の 10 ファイルの本文一致（`server` の `predev`/`prebuild` と CI が回す） |
| `npm run check:frozen` | `build:all` 後の dist CSS を md5 で突き合わせ（対象 0・受け皿として残す） |

## 参照のしかた（4つの経路）

| 経路 | 何で解決するか | 書き方 |
| --- | --- | --- |
| `import` 文 | 各アプリの `vite.config.ts` の `resolve.alias` | `@gmo-onair/shared/src/...` |
| 型チェック | 各アプリの `tsconfig.json` の `paths` | 同上 |
| CSS の `@import` | Vite の `resolve.alias` | `@gmo-onair/shared/src/client/base.css` |
| Tailwind の preset | Node の解決（`node_modules` の symlink） | `@gmo-onair/shared/tailwind.preset`（**パッケージ名で**。相対パスは検査が止める） |

- **4つが同じ実体を指さないと shared が二重に読み込まれ**、zustand のストアや React の context が2つできる。
  `scripts/check-shared-wiring.mjs` が `client*` 全部を機械で照合する
- **`package.json` の依存は必ず `"@gmo-onair/shared": "*"`。** 範囲を書くと**本番のビルドが落ちる**（`Dockerfile` が全ワークスペースの
  `version` を `0.0.0-build` にするため、範囲が外れて `npm ci` が公開レジストリを見る）
- **`tsconfig.json` の `paths` は指す先が無くても黙って `node_modules` に落ちる**（`tsc -b` は exit 0）。検査だけが歯止め
- **`src/` の中で shared を相対パス（`../../shared/...`）で参照しない**
- **shared が import する npm パッケージは `peerDependencies` に申告する**（`dependencies` にしない。Radix も React も実体が2つあると
  壊れる）。一部のアプリだけのものは `peerDependenciesMeta` で `optional`

## 中身のカタログ

### 画面が使う部品（`src/client/`）

| 場所 | 部品・関数 | 要点 |
| --- | --- | --- |
| `ui/money.tsx` | `<Money value inline negativeIsDanger>` `<MoneyCell width>` | `¥` と数字を別要素にし**金額の右端**を揃える。縦に並べない場所は `inline` |
| `ui/numbers.tsx` | `<StatValue size>` `<Num value unit>` `<ManYen>` `manYen()` `compactYen()` `toMan()` | 数字の段と万円の丸め（`compactYen` は 1万円未満を円のまま）。`<PageTitle>` は旧部品（利用 0） |
| `ui/dateRange.tsx` | `<DateRange start end />` | 開始／`〜`／終了を別要素に |
| `ui/row.tsx` | `<Row density align divider interactive stackOnMobile>` `<RowHeader>` `<RowMain>` `<RowTitle>` `<RowSub>` `<RowSlot w align hideOnMobile placeholder>` `SlotWidth` | 一覧の1行。**列幅7段（56/72/96/128/160/200/240）の唯一の正**（`MoneyCell` の `width`・`TableBadge` の `w` もここを読む）。`stackOnMobile` は `<RowMain>` の `data-row-main` を狙う — 消すと縦積みが黙って効かない |
| `ui/tableBadge.tsx` | `<TableBadge label w fixedW>` | 固定幅の枠のバッジ（帯は和文4字まで 62px・中央寄せ。均等割り付けにしない・`Badge` の既定の flex を変えない）。5字以上が混ざる列は `fixedW` を実測して渡す |
| `ui/pageHeader.tsx` | `<PageHeader title sub icon primaryAction>` | 見出しと主アクション（1つ。PC は右上・スマホはシェルの下端） |
| `ui/pageShell.tsx` | `<PageShell width="full\|narrow">` | 本文の幅と余白。中間の段は作らない。`client-techops/src/pages/*Page.tsx` に必須 |
| `ui/filterChips.tsx` | `<FilterChips items value onChange label>` | 件数つきの絞り込み。`count` は**必須**（`null` = 未集計） |
| `ui/dialog.tsx` `ui/dialogSize.ts` | `Dialog*`・`DialogSize`（`sm` 420 / `md` 640 / `lg` 840 / `xl` 1080 / `full`） | 旧ダイアログ。幅の段は `Sheet` と共通（`dialogSize.test.ts`） |
| `ui/crud-form-dialog.tsx` `hooks/useCrudPage.ts` | `<CrudFormDialog>` `createUseCrudPage(api)` | 検索＋ページ送り＋一覧＋登録/編集/削除の定型 |
| `ui/` のほか | button input label card badge select checkbox enhanced-checkbox switch tabs textarea toggle-button-group tax-aware-amount-input table pagination searchable-select currency-input | shadcn / Radix。`Button` は `data-ui="button"`、`Switch` は `data-ui="switch"` を持つだけ（上書きは `tokens-v4.css`） |
| `states/` | `EmptyState`（`title` **必須**）`NoSearchResults` `Delayed` `SkeletonRows/Card/Kpi` `ErrorPanel` `humanizeError` `NotFoundPanel` `NoPermissionPanel` | 空（0件の理由を分ける）・読み込み中（1秒未満はスピナーを出さない）・エラー（HTTP コードを出さない）・知らない URL・権限なし（白紙にしない）。`EmptyState` の実体は `dashboard/EmptyState.tsx` の1つ |
| `notify.ts` `ui/notice.tsx` | `notifySuccess/Error/Info/Warning/ApiError` `<NoticeBar />` | 結果を**流れて消えない帯**1件で伝える（`alert()` の置き換え先） |
| `ui/confirm.tsx` | `confirmAction({ title, description, confirmLabel, tone })` `<ConfirmHost />` | `window.confirm()` の置き換え。器が無いと **`false` を返して実行しない** |
| `ui/{toast,toaster,use-toast}` | `toast` `<Toaster />` | 旧トースト。**`client-techops` だけ**（`src/lib/notify.ts` 経由・`<Toaster />` 1つ。他は 0 を検査）。新しい画面では使わない |
| `dashboard/` | `DashboardHeader` `KpiCard` `SectionCard` `EmptyState` | ダッシュボードの定型 |
| `format.ts` | `formatCurrency` `formatDate` `formatMonth` `formatShortDate` `localDateStr` `formatRelativeTime` | 表示整形（相対時刻は未来を「たった今」に丸める） |
| `hooks/` | `queryKeys` `useDebounced` | react-query の鍵の factory／入力が止まってから返す |
| `manual/` `mcpInfo/` `versionHistory/` | `ManualModal` `McpInfoModal` `VersionHistoryModal` | 本人メニューから開く3つのモーダル |
| `live/` | `socket`（`/liveops`）`useTimer` `DisplayCanvas` `displayLayout` | 計時・視聴者の運用画面（`client-techops`）用。表示画面 `client-live` は `socket`/`useTimer` の**意図的な複製**を持つ（`/live/display/` の見た目を変えない決まり） |
| `AppHeader` `SharedHeader` `AppSwitcher` `appNav.ts` | 旧ヘッダー | 廃止済み `client-awards` だけが import。削除待ち |

**バレル（`ui/index.ts`）** に載せているのは button / input / label / card / badge / dialog / select / checkbox / enhanced-checkbox / switch /
tabs / textarea / crud-form-dialog / toggle-button-group / tax-aware-amount-input / money / numbers / dateRange / row / tableBadge。
**それ以外**（`pagination` `table` `searchable-select` `currency-input` `confirm` `notice` `toast*` `filterChips` `pageHeader` `pageShell`・
`states/`・`notify.ts`）は深いパスで名指しする — 載せると使わないアプリのバンドルにも入り、Radix を要求するものはそのアプリに無い
パッケージまで巻き込む。`src/client/index.ts` は `cn` `queryClient` `useUiStore` `createApi` `createAuthHook`、`src/index.ts` は
`enums.ts` `types.ts` だけを出す。

### アプリの土台（`src/client/`）

| ファイル | 何をするか |
| --- | --- |
| `apps.ts` | **アプリ登録の唯一の正。** `APPS`（並び順＝画面の並び順）`APP_BY_KEY` `APP_LABELS` `canOpenApp` `visibleApps` `appOfPath`。名前・アイコン（lucide の部品そのもの）・色（hex）・入口・`permissionModule`・`external`・`comingSoon`。`frozen: true` は廃止した `awards` だけ（`visibleApps()` の既定が外す）、`hidden: true` は `liveops`（`appOfPath()` が引くので消さない） |
| `createApi.ts` | axios の factory（`storageKey` `loginPath` `publicPaths`）。**FormData のときは入口の interceptor が `Content-Type` を外す**（JSON 固定のままだと axios 1.x が `File` を `{}` に潰す）。`gmo_onair_token` を Bearer で付け、401 は `loginPath` へ |
| `createAuthHook.ts` | `useAuth` の factory。ストレージキーは全アプリ `gmo_onair_user`（`legacyStorageKeys` で移行）。権限は `gmo_onair_permissions` |
| `queryClient.ts` | 共通の react-query。`MutationCache` の **`onError` が保存失敗の最後の受け皿**（画面が `useMutation({ onError })` を持てば黙る・`meta: { action, silent }`・401 は黙る）。並びは `(error, variables, context, mutation)` で **4番目が mutation**（`queryClient.test.ts`）。retry は中断と 4xx で諦め、他は2回・書き込みは 0 回 |
| `isCanceled.ts` | 中断を失敗扱いしない印 |
| `uiStore.ts` | `currentUserId`（`x-user-id` ヘッダー）と旧ヘッダーの `sidebarOpen` |
| `RedirectOnce.tsx` `SubAppLoginRedirect.tsx` `historyDiagnostic.ts` | `<Navigate replace>` の代替／サブアプリの `/<app>/login` 転送／`replaceState` の呼び過ぎ警告 |
| `utils.ts` | `cn()`（tailwind-merge）。**独自の段は `V4_FONT_SIZES` / `V4_RADII` に教える** — 教えないと `text-badge` が `text-xs` を打ち消せない |

### スマホ・v4 の部品（`src/client-v4/`）

**新しく足す部品はここに置く**（`src/client/` は全アプリの Tailwind が走査して CSS に入る）。

| ファイル | 部品 | 決めごと |
| --- | --- | --- |
| `mobile.ts` | `MOBILE_MAX`(1023) `useIsMobile()` `duePresets()` `dueLabel()` | 判定は Tailwind の `lg` と同じ幅。期限は 明日18:00／3日後18:00／端末のピッカー（自作の日付ホイールを作らない）。過ぎたものを「あと -2日」と出さない |
| `sheet.tsx` | `<Sheet open title sub footer size wide rise onSubmit swipeDownHandle>` | 下から出るシート（Radix Dialog が土台・上限 85vh・主ボタンは下端固定・`safe-area-inset-bottom`）。PC は中央ダイアログ。左端 24px からのスワイプで閉じる。`rise` は 24px せり上がる opt-in |
| `formDialog.tsx` | `<FormDialog>` `<FormDialogFooter>` `formGrid2` | CRUD の登録・編集フォーム（`Sheet` の薄いラッパー）。旧 `<form onSubmit>` の画面は **`onSubmit` を渡す**（渡さないと Enter 送信が効かない） |
| `mobileFilterBar.tsx` | `<MobileFilterBar>` `<MobileFilterField>` `<MobileFilterSegments>` | 絞り込みを1行に畳んでシートで開く。検索は畳まない・効いている数は**呼ぶ側が渡す** |
| `pcOnly.tsx` | `<PcOnlyPanel>` `<PcOnlyNote>` `<PcOnlyGate table>` `PcOnlyEntry` | 「PC で触る画面」の案内（①何の画面 ②なぜ PC ③代わり ④それでも開く、の順）。表は各アプリの `src/pcOnlyScreens.ts` |
| `NotificationBell.tsx` | `<NotificationBell api>` | 上辺バーのベル（シェルは `notificationSlot` の受け口だけ） |
| `flip.ts` `rail.ts` | `useFlip(ref)` `useRail()` | 並び替えで行を滑らせる（鍵は `data-flip-key`。検査用の `data-row` と兼ねない。新しい行は `data-row-in`）／横スクロールのレール（慣性・8px までクリック・続きがある側だけ `mask-image`） |
| `pullToRefresh.tsx` `swipeAction.tsx` `edgeSwipeBack.ts` | `<PullToRefresh>` `<SwipeAction>` `useEdgeSwipeBack()` | 引っ張って再取得／左スワイプでアクション（既存のボタン列は消さない）／左端 24px から 96px 引くと戻る |
| `taskDoneButton.tsx` | `<TaskDoneButton>` `TASK_DONE_LABEL` | 「対応済にする」文字ボタン（チェックボックスをやめた）。文言はここが持つ |
| `recent.ts` | `readRecent(uid)` `pushRecent(item, uid)` `removeRecent` `clearRecent` | 最近見たもの（端末の中だけ・8件・`uid` を突き合わせて他人の分は出さない）。別の端末では出ないと画面に書く |
| `offlineQueue.ts` | `createQueue(name)` `flushQueue()` | 端末に溜めて後で送る。鍵で上書き＝**何回やっても結果が同じ操作だけ**載せる（行を作る操作は載せない）。`pending()` が 0 でなければ画面に出す |
| `downscaleImage.ts` `recording.ts` | `downscaleImage()` `MAX_EDGE`(1600) / `extensionForAudio()` `recordingFileName()` | 送る前に写真を縮める（拡大しない・重くなったら元・失敗したら元を送る）／録音の拡張子を `MediaRecorder.mimeType` から決める |
| `richContent.tsx` `noteText.ts` | `<RichContent>` `RichBlock` `parseNoteText()` | AI が組み立てた「意味の単位」を型スケールで描く（AI に HTML を書かせない・知らない `type` は飛ばす）。素のテキストは `parseNoteText` で読み替える（消さない・並べ替えない） |

### 業務ロジック（`src/` 直下・画面を持たない）

サーバーは `shared/` を import できない（`server/tsconfig.json` の `rootDir`）。**server と同じ答えが要るものは意図的に複製し、
`scripts/check-collab-parity.mjs` の `PAIRS`（10 対）か `shared/tests/` の parity テストが一致を固定する。**

| ディレクトリ | 中身 | server 側の対 |
| --- | --- | --- |
| `collab/` | `yjsDoc.ts`（Qシート）`projectCollabDoc.ts`（案件）— Y.Doc 変換層 | `server/src/shared/collab/`（PAIRS） |
| `production/` | `miniapps.ts`（ミニアプリ登録の唯一の正）`journey.ts` `episodeSpec.ts`（「回を足す」の入力）`docNo.ts` | `server/src/shared/production/`（PAIRS。`docNo` は表示用のみ） |
| `qsheet/` | `blockTypes.ts`（11型）`blockRef.ts`（`blk.<type>#<n>`）`cueActuals.ts` `graphicsTicker.ts` | `server/src/shared/qsheet/`・`contexts/qsheet/types/`（PAIRS。`graphicsTicker` は画面のみ） |
| `schedule/` | `kinds.ts`（区分と配色）`time.ts` `span.ts` `timeline.ts` `types.ts` | `server/src/shared/schedule/`（PAIRS は `time`・`kinds`。`span` は Excel 書き出しに写し） |
| `keepReport/` | 隔週キープの型・計算・構成（`types` `calc` `binding` `templates` `buildStandardDeck` `deckDiff` `packDiff` `tsv` `entity` `formatAssets`） | `server/src/contexts/dailyops/services/keep-*.ts`（`shared/tests/keepReport*.test.ts`） |
| `utils/` | `businessDays.ts` `financeDocChain.ts`（受領書類のひとつづり・支払サイト）`gmoGroup.ts` `inboxDesk.ts` | `server/src/shared/services/finance-chain.ts`・`gmo-group.ts`（parity テスト） |
| `constants/statuses.ts` `enums.ts` `types.ts` | ステータス定義（`statusOf()`）・列挙・共通の型 | — |

## 共通シェル（`src/client/shell/`）

**上辺バー 64px ＋ 左メニュー 248px ＋ スマホ下タブ**。配信中5アプリ全部が載っている（`check-shared-wiring` が照合）。

| ファイル | 役割 |
| --- | --- |
| `AppShell.tsx` | 骨格（根は `h-full`・`<main>` だけがスクロール）。`<NoticeBar />` `<ConfirmHost />`・3つのモーダル・差し込み口・画面遷移の `v4-screen-in`（**URL のパスを鍵に1回だけ**。クエリは含めない）・PC の左メニュー隠し（`data-side-collapsed`・`gmo_onair_v4_sidebar_collapsed`） |
| `AppTopbar.tsx` | **アプリ名そのものが切替ボタン**（`visibleApps()` の既定）／パンくず／`searchSlot`／`notificationSlot`／本人メニュー（ログアウト・マニュアル・版の履歴・MCP・ユーザー切替）。`appKey === 'home'` では切替とパンくずを出さず検索を左に置く。スマホは `☰`／ロゴ 18px（`[data-shell-logo]`）／ベル／本人だけ（本人メニューがログアウトとマニュアルの唯一の入口）。切替・パンくず・氏名は `v4-wide-only` |
| `AppSideMenu.tsx` | 左メニュー（項目 PC 38px / スマホ 44px）。`isCurrent()` `currentTo()` `visibleSections()` `pathOf()`。権限フィルタ・`collapsible` の自動展開・引き出し（`data-drawer`）・`mobileHiddenPaths`（`matchPath` で照合。前方一致にしない） |
| `MobileTabs.tsx` | 下タブ（56px ＋ `safe-area-inset-bottom`）。**3つが基本**、`action: 'menu'` で引き出しを開く |
| `primaryAction.ts` `sideMenuSlot.ts` | 差し込み口の DOM を context で配る（`usePrimaryActionSlot` `useSideMenuTopSlot`）。`createPortal` で描く。**`fixed` にしない**ので本文のスクロール領域が勝手に縮む |
| `types.ts` | `ShellNavItem`（`to` `icon` `end` `tag` `module` `modules` `adminOnly` `external` `wrap`）`ShellNavSection`（`title` `collapsible` `note`）`ShellMobileTab` `ShellUser` `ShellAccess`（`can`）`ShellChrome`（`appKey` `appLabel` `crumb` `searchSlot` `notificationSlot` `note`） |

- **メニューの中身はシェルが決めない。** 各アプリの `src/components/layout/nav.ts` が `sections` / `mobileTabs` を渡す。
  アプリ一覧・並び順・名前は `apps.ts` だけが持つ
- **光らせるのは1つ**（`currentTo()` が一致した中でいちばん深いもの）。現在地は `isCurrent()` で判定し `NavLink` の既定に任せない
  （`/equipment/` の末尾スラッシュ・`?view=` 付きの行き先で光らなかった）。`shared/tests/apps.test.ts` で固定
- **`collapsible` の塊はいま開いている画面があれば自動で開く**（閉じたままだとどこも光らない）
- **左メニュー下の「他のアプリ」は置かない**（上辺バーの切替と同じ一覧）
- **「PC で触る画面」は宣言する。** 各アプリの `src/pcOnlyScreens.ts` に `…_PC_ONLY`（`PcOnlyEntry[]`）と `…_MOBILE_OK` の2表を持ち、
  `scripts/check-mobile-declared.mjs` が `App.tsx` のルートと突き合わせてどちらにも無い画面で `lint` を止める（転送は数えない）。
  `<PcOnlyGate table>` はシェルに1つ。`hidden: true` の画面はスマホの左メニューからも消す（`mobileHiddenPaths`。ルートは消さない）。
  画面ごとに `useIsMobile()` で隠さない（数えられなくなる）。PC専用は原則廃止していく方針
  （[docs/v4-native-ui-plan.md](../docs/v4-native-ui-plan.md)）なので表は縮む方向

## 土台の CSS とトークン

```
index.css（各アプリ） → base.css → tokens-v4.css → fonts/lineseedjp.css
                                                  → tokens.css → @digital-go-jp/design-tokens
```

| ファイル | 役割 |
| --- | --- |
| `src/client/base.css` | 共通の土台。`html`/`body`/`#root` の `height:100%`＋`overflow:hidden`（シェルの根は **`h-full`**。`100vh` は iOS で下端が切れる）・書体・`palt`/`kern`・`-webkit-tap-highlight-color: transparent`・日付入力 44px・`@media print`（**`@layer base` の中に置く**。外だと `overflow:hidden` に負けて印刷が1ページ目で切れる）。配信中5アプリの `index.css` が先頭で `@import` し、`html`/`body`/`#root` をアプリ側で上書きしない。`check-ui-tokens` の `app-foundation` が import・preset・`content` を見る（⚠️ 要確認: 対象は `client` / `client-daily` / `client-equipment` の3つのままで `client-techops` / `client-live` は未追加） |
| `src/client/tokens.css` | 基層。DADS（デジタル庁）のプリミティブ＋GMO ブルー＋意味づけ・`.dark`・v4 で足した名前・旧書体。**直読みするアプリは 0** |
| `src/client/tokens-v4.css` | **現役のトークン置き場。** v4 の確定値で上書きし、`.dark` を再宣言し（`tokens.css` の `.dark` は書かれた順で `:root` に負ける。消すと制作技術支援の本番3画面が白くなる）、属性＋素の CSS の規則（下表）を持つ |
| `src/client/fonts/lineseedjp.css` + `lineseedjp/` | LINE Seed JP の `@font-face` 372 個（124 unicode-range × 400/700/800）と woff2 一式（約 6.9MB・`OFL.txt` 同梱）。`scripts/vendor-fonts.mjs` の生成物で**手で直さない** |
| `tailwind.preset.ts` | 配信中5アプリが `presets: [preset, v4Preset]` の順で継承し、`content` に `../shared/src/client/**` と `../shared/src/client-v4/**` を持つ。`fontFamily` はトークン参照（書体名をベタ書きしない）、型スケール `fontSize`、`minHeight/minWidth.tap`(44px)、色は `rgb(var(--x) / <alpha-value>)`、`borderRadius` は `lg/md/sm`＋役割名9段、DADS plugin |
| `tailwind.v4.preset.ts` | `fontWeight.medium: 400` / `semibold: 700` だけ（LINE Seed JP に 500/600 が無い）。5アプリ全部が継承するので効き先は `tailwind.preset.ts` と同じ（統合は別途判断） |

**色**: 値は RGB の3つ組（`--primary: 0 91 172`）、参照は `rgb(var(--primary) / <alpha-value>)`（`bg-primary/10` の半透明指定が多数ある
ので色コードの直書きにできない）。`hsl(var(--…))` と書かない。**値の上書きは `tokens-v4.css`・新しい名前は `tokens.css`。**
接尾辞は `--<s>` 塗り／`-foreground` **塗りの上の**文字／`-surface` 帯の面／`-border` 帯の枠。`scripts/check-tokens.mjs` が ①0〜255
②明暗の定義がそろっている（v4 で足した一群は明るい側だけ）③preset が参照する名前が実在 ④`tokens-v4.css` の上書き名が `tokens.css` に実在
⑤`hsl(` の残り ⑥`fontSize` のキーが色名と同名でない（`text-card` は色と大きさの2規則になる）⑦`V4_FONT_SIZES` / `V4_RADII` との一致、を検査する。

| v4 で足した名前 | 使いどころ |
| --- | --- |
| `success/warning/destructive/info-{surface,border}`・`warning-border-strong` | 状態の帯（`text-<s>-foreground` を淡い面に載せると白地に白 — `check-contrast-tokens` が止める） |
| `ai`・`ai-{foreground,surface,border}` | AI・表彰 |
| `surface-subtle` `border-subtle` `border-faint` `border-disabled` | 面と罫の段 |
| `primary-surface` `primary-surface-weak` `primary-border` `primary-border-strong` | 選択中の行・hover の面・淡い枠 |
| `fg-disabled` | ヒント文字・押せない状態・アイコンだけ（白地で 2.61:1。読ませる文字に使わない） |
| `cat-1`〜`cat-8` | 意味を持たない系列。状態の色を流用しない。`cat-5`（山吹）は文字に使わない |
| `text-{h1,h2,cardtitle,list,sub,sub-sm,th,badge,note}` | 型スケール。**サイズ・行間・ウェイトを束ねる**ので `font-medium` / `font-semibold` を書く理由が無い |
| `rounded-{badge-xs,badge,control,control-md,control-lg,note,card,app,chip}` | 角丸の役割名。Tailwind の数字の段（`rounded` / `rounded-xl` …）は入れ替えていない（1,455 か所の角が動く） |
| `min-h-tap` `min-w-tap` | 44px |

**`tokens-v4.css` が持つ規則**（見た目の切り替えは**属性 ＋ ここ**に寄せる。`shared/src/client/` にクラス名を書くと全アプリの CSS に入る）

| 規則 | 効く先 |
| --- | --- |
| `--radius: 12px` | shadcn の `rounded-md` = `calc(var(--radius) - 2px)` → ボタン・入力欄が 10px |
| `:root [data-ui='button'] { font-weight: 700 }` | `Button`（`button.tsx` は `font-medium` のまま・属性だけ。`:root` で詳細度 (0,2,0) にしないと後ろに出る Tailwind に負ける） |
| `:root .text-cardtitle` 14.5px／`.rounded-card` 14px／`.rounded-note` 12px／`.rounded-badge` `.rounded-control`（`-l-`/`-r-` も）`[data-ui='table-badge']` 6px | モックの実測に合わせた上書き（preset の値は変えない） |
| `.font-number { 'palt' 0, 'tnum' 1 }` | 数字に字詰めを掛けない（`base.css` の `palt 1` と**必ず対で**動かす） |
| `@media (max-width: 1023px)`: `[data-ui='button']` 44×44・`input`/`select` 44px・`.min-h-tap { min-width: 44px }`・`.text-note` `.text-sub` `[data-ui='empty-desc']` 13px・`--line-height-jp: 1.6`・`.text-h1` 20px・`.text-h2` 17px・`[data-page-sub]` 1行省略・`[data-ui='switch']::after` `.v4-tap::after`（見た目を変えず当たり判定だけ 44px。`overflow:hidden` の中では効かない）・`[data-drawer='closed'] { visibility: hidden }`・`[data-shell-logo]` 18px | スマホの手触り（タップ対象 44px・本文 13px 以上）。`.text-sub-sm` `.text-th` `.text-badge` は**上げない**（`TableBadge` の固定幅から溢れる）。画面ごとに `min-h-tap` を書き足さない |
| `@media (min-width: 1024px) [data-side-collapsed='true']` | PC の左メニュー隠し（`transition` は付けない） |
| 動き: `.v4-screen-in` `.v4-card-in` `.v4-toast-in` `.v4-bar` `.v4-bar-grow` `.v4-lift` `.v4-gloss` `.v4-skeleton` `.v4-rec-dot` `.v4-wave` `.v4-press` `[data-reveal]` `[data-v4-sheet='rise']` `[data-flip='run']` `[data-row-in]`・押せるものの共通 `transition`（色・罫線・影・変形の4つ。**`transition: all` にしない**）・`:active` 0.97 倍（消すとスマホで押しても1ドットも変わらず二重に押される）・`:where(...):focus-visible` の既定（`:focus` にしない・`outline`）・`[data-cursor='on']` | Tailwind の `animation` キーに足さず素の CSS クラス（`.v4-*`）にする。`[data-reveal]` の既定は「見える」（JS が落ちても白紙にしない）。`prefers-reduced-motion: reduce` は `animation-duration: 0.01ms`（0 だと `both` の最終状態が当たらず消えたまま）で止め、繰り返す動きは名指しで止める |
| `.v4-eyebrow`（字間 .1em の小見出し）`.v4-wide-only`（≧1024px だけ出す）`.v4-rail` `.thread-body` | `tracking-[.1em]` / `hidden lg:block` の置き換え先／横スクロールのレール／AI が整えた本文の9タグ |

**書体**: 配信中5アプリは **LINE Seed JP**（同梱。本文 `palt` 1 / `kern` 1・数字は `palt` 0 / `tnum` 1）。例外は `/live/display/` の表示画面
だけ（`client-live/src/index.css` が `:has()` で Noto Sans JP に絶縁）。

- **400 / 700 / 800 しか無い。** `font-medium` / `font-semibold` は黙って 400 / 700 に落ちる（`v4Preset` が潰す）→ **v4 の画面では書かない**。
  `check-ui-tokens` の `missing-font-weight` が残数を数える
- **数字は等幅ではない**（プロポーショナル・実測）。揃うのは `MoneyCell` の固定幅＋`Money` の `justify-between` による**金額の右端**だけ。
  `palt 0 / tnum 1` は書体を替えた日に効くので残す
- **数字に別の書体を当てない**（届く前の一瞬だけ幅が変わり列がずれる）。`--font-mono-num` は `var(--font-sans)`
- **Google Fonts は読まない**（開発コンテナから出られず、社内ネットで塞がれると全画面が崩れる）。⚠️ 要確認: `client-techops` /
  `client-live` の `index.html` には旧画面向けの Noto Sans JP の読み込みがまだ残っている
- 欠けたら `npm run lint`（`check-fonts-vendored` = `vendor-fonts.mjs --check`）が止める。入れ直しは `npm run fonts`。`document.fonts` の
  大半が `unloaded` なのは正常（使う範囲だけ読む）で、`"error"` だけ調べる。`OFL.txt` を消さない

## 決めごと

**置き場所とクラス名**
- `shared/src/client/**` に書いたクラス名は**コメント・説明文の中でも** Tailwind に拾われ全アプリの CSS に入る。既にある値で足りるなら
  それを使い、見た目の切り替えは属性＋`tokens-v4.css`、v4 で足す部品は `src/client-v4/`
- **「変えていない」はビルド出力を突き合わせてから言う**（`npm run check:frozen`。対象 0 でも仕組みは残す）
- `motion` / `animated-number` は `client/src/components/ui/` に残す（`framer-motion` が案件管理にしか無く、v4 は hover を色・罫線、
  遷移を CSS animation に絞る）。同ディレクトリの他のファイルは shared への再エクスポート
- `client-equipment/src/pages/detail/SearchableSelect.tsx` は独自実装（prop も見た目も違う）。差し替えは別途
- テストは `shared/tests/`（**`src/` の外**）。`src/` に置くとテストの中のクラス名まで CSS になる

**部品の使い方**（`check-ui-tokens` が止めるもの）
- 金額は `<Money>` / `formatCurrency`、万円は `manYen`、大きい数字は `<StatValue size>`、期間は `<DateRange>`、列幅は7段、角丸は役割名
  （`rounded-[Npx]` 不可）、色は共通トークン（生パレット・文字の透明度は不可）、空は `<EmptyState title description>`、読み込みは
  `<Delayed><SkeletonRows/></Delayed>`、`alert()` / `confirm()` は不可、ボタン高さは 32/36/40/44/48、画面名は `<PageHeader>`、外枠は
  `<PageShell>`、ホームバーの逃げは書かない、伸びる列の `truncate` には `min-w-0`、Excel は `safeReadWorkbook()`、AI がやったことに人名を出さない
- 段を足したら `cn()` にも教える（`V4_FONT_SIZES` / `V4_RADII`）。`fontSize` のキーに色名と同じ名前を使わない
- `useIsMobile()` で早期 return しない（幅が変わるとフックの数が変わって落ちる）。薄い親で**部品ごと入れ替える**
- フックと CSS は**同じ回で**出し入れする（片方だけ消えて何も起きない機能が残った実例あり）
- `onSubmit` を渡したフォームでは**すべてのボタンに `type`** を書く（`check-form-submit`。`<Button>` の既定は変えない）

**知らせる・訊く・保存**
- 結果は `notify*`（帯）で伝え、トーストは新しい画面で使わない。`<NoticeBar />` と `<ConfirmHost />` はシェルが1つずつ持つ（アプリ側に置かない）
- 取り消せない操作は `confirmAction({ tone: 'danger', description })` で「一緒に何が消えるか」を書く
- 書き込みは `useMutation({ meta: { action: '案件の保存' } })` で失敗文言を出す。自前で描くなら `meta: { silent: true }`。
  `mutate(vars, { onError })` の形は受け皿から見えない
- `AbortController` を自分で作らない（`queryFn({ signal })`）。中断は `isCanceled()` で失敗扱いにしない
- ファイル送信で `Content-Type` を手で書かない（`createApi` の interceptor が外す）

**その他**
- `src/collab/` `production/` `qsheet/` `schedule/` `utils/` を変えたら server の対も同じに直す（parity 検査が止める）
- `apps.ts` の並び・名前はそこだけ動かす。`permissionModule` は権限 JSON のキーなので `key` の改名に連動させない（`techops` は `'qsheet'` のまま）
- `localStorage` の鍵: `gmo_onair_user` `gmo_onair_token` `gmo_onair_permissions` `gmo_onair_v4_sidebar_collapsed` `gmo_onair_recent`。
  旧 `gmo_onair_sidebar_open` は旧ヘッダー用で混ぜない
- ⚠️ 要確認（削除・統合の時期は人の判断）: 旧ヘッダー4ファイル／`PageTitle`／`client-techops` のトースト／`client-v4/` と `client/` の統合／
  `tokens.css`・`tokens-v4.css` の2層／`tailwind.v4.preset.ts` の統合

## テスト

`npm test`（ルート）／`npm run test -w shared`。方針・一覧は [`tests/README.md`](tests/README.md)。**画面を見ても間違いに気づけない
計算だけ**を固定する（画面のテストは書かない・`verify:ui` が実測する）。server の**純粋関数**も `../../server/src/...` を直接 import して
よい（DB・HTTP を触るものは入れない）。各アプリの `@/` は `vitest.config.mts` が import 元のワークスペースへ読み替える。

## 経緯の記録

導入の順序・当時の実測・判断の理由（P1〜P3・S1〜S3・T1b〜T3・M0〜M11・Phase 2／6 …）は
[docs/reviews/shared-build-log.md](../docs/reviews/shared-build-log.md)。設計の正は
[docs/design/v4/_rules.md](../docs/design/v4/_rules.md)（5つの規律）・[`_tokens.md`](../docs/design/v4/_tokens.md)（確定値）・
[`_form-order.md`](../docs/design/v4/_form-order.md)（フォームの並び）・[`mobile.md`](../docs/design/v4/mobile.md)（スマホ）。
凍結・廃止の定義は [docs/v4-plan.md](../docs/v4-plan.md) の「用語」。
