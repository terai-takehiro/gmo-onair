# v4 ネイティブUI化計画（PC=macOSアプリ風・スマホ=iOSアプリ風）

> **この文書の位置づけ**: [docs/v4-plan.md](v4-plan.md)（元のv4刷新計画）を進めた先に、
> 2026-08-20 にユーザーから出た新しい指示（全画面をmacOS/iOSネイティブ級に、PC専用は
> 原則廃止）を受けて始めた追加の取り組みを記録する。v4-plan.md 自体は書き換えず、
> ここに積む。

## 決定事項（2026-08-20・ユーザー判断）

| 論点 | 決定 |
| --- | --- |
| 凍結4アプリ（制作資料/Qシート・技術資料・計時LIVE・リアルタイムCG） | **対象外のまま**。CLAUDE.md の凍結方針（URLは生かし見た目は今のまま）を維持する |
| ⏸ で意図して据え置いている画面 | **基本作り直す**（ただし旧カレンダー2画面は下記の通り「吸収してから退役」を優先する） |
| 既にv4化済み（✅）56画面 | **同時に見直す**。現状ほぼ「共通シェルのレスポンシブ」止まりで、カレンダーのみiOSアプリ風の専用モックを持つ。この水準を全画面に広げる |

## 調査で分かったこと（着手前の棚卸し）

### 旧カレンダー3画面のうち1つは、実はもう存在しなかった

`docs/v4-progress.md` は生成物だが、⏸（意図して据え置き）判定の画面については
**ファイルの実在を確認せずに「据え置き」と表示する作り**になっていた
（`scripts/v4-progress.mjs` の `isV4()` が `@@意図して据え置き@@` の印を早期リターンし、
`existsSync` を通らない）。そのため、実際には別の回で削除済みの
`PartnerSchedulePage.tsx`（旧「（旧）パートナー」・`/studio/partners`）が、
存在しない画面のまま進捗表に残り続けていた。

`/studio/partners` は2026-08の別の回で `① 予定`（統合カレンダー）へのリダイレクトに
置き換え済みで、作成・編集・絞り込みのすべてが統合カレンダー側の
`PersonalEventDialog`/`PartnerScheduleDialog` に一本化されている
（`App.tsx` のコメント参照）。**この回で `scripts/v4-progress.mjs` からこの行を削除し、
進捗表を実態に合わせた**（56/62 → 56/61）。

### 残り2つの旧カレンダー画面は「作り直す」より「吸収して退役させる」が正しい

ユーザーの「旧カレンダーはそもそも不要では？」という疑問を実装で確認した結果:

| 画面 | 何が固有か | 対応方針 |
| --- | --- | --- |
| （旧）スタジオカレンダー `/studio/studio-calendar` | ①**香盤ビュー**（部屋を縦に並べた「いつ空くか」表・① 予定のTimeGridとは別物）②**既存の部屋予約を直す唯一の導線**（① 予定の詳細ダイアログ `StudioBookingDetailDialog` は読むだけ） | ①②を ① 予定 に吸収してから、この画面自体を退役（URLは転送）させる |
| （旧）自分の予定 `/studio/my-calendar` | ①**取込元ごとの詳しい色分け**（Google/Outlook/ICS/共有・① 予定の3層モデルは持たない区別）②**外部カレンダー連携の設定**（OAuth・ICSフィード） | ①は① 予定の凡例に統合、②は ④ 設定（カレンダー） に移設してから退役 |

**作り直す前に消せる負債と、吸収してから消すべき機能を混同しない。** 旧スタジオ・
旧自分の予定は「見た目が古い」のではなく「① 予定にまだ無い機能を持っている」ので、
モックアップから作り直す対象ではなく、機能移設 → 退役の対象として扱う。

## 適用外・例外の扱い

- **凍結4アプリ**: 対象外（上記の通り）
- **既存の `pcOnlyScreens.ts` の `CLIENT_PC_ONLY`**（一括データ入力・打合せの場で複数列を
  並べて比べる画面など、PC向きと判断済みの画面）: 「原則スマホにも対応」の例外として残す。
  ただしスマホで開いたときの案内（`PcOnlyPanel`）自体はiOSアプリ風に磨く対象にする —
  「使えません」ではなく「ここはPCでどうぞ」を美しく伝える、という水準まで引き上げる
- **データビューア・DBバックアップ**: モックが無い（`docs/design/v4/` に仕様なし）。
  今回、macOS/iOSネイティブ級で新たに設計する

## 進め方

1. **監査**（並列エージェント・エリアごと）: 既存56画面のスマホ実装が「iOSアプリ風に
   作り込まれているか」「共通シェルのレスポンシブ止まりか」を分類し、画面ごとの
   具体的な不足点を洗い出す → 本ドキュメントの「監査結果」に反映
2. 監査結果と上記の据え置き2画面の吸収計画から、優先度付きバックログを作る
3. バッチ単位で並列エージェントに実装させる（エリアごとに1エージェント・作業が衝突する
   場合は worktree で分離）
4. 各バッチ終了ごとに `npm run typecheck` / `npm run lint` / `npm run test` /
   `npm run verify:ui` を通し、`node scripts/v4-progress.mjs --write` で進捗表を作り直す

## 監査結果（2026-08-20・並列7エージェント・63画面）

詳細（画面ごとの不足点）は [docs/v4-native-ui-audit-2026-08-20.md](v4-native-ui-audit-2026-08-20.md)
（生データ: [.json](v4-native-ui-audit-2026-08-20.json)）。判定基準はカレンダー ① 予定
（承認済みモックに基づく専用モバイルレイアウトを持つ）を「ネイティブ級」の基準にした。

| 判定 | 件数 | 意味 |
| --- | --- | --- |
| ✅ ネイティブ級 | 10 | 承認済みモックに基づく専用モバイルレイアウトを持つ（それでも仕上げの余地はある） |
| 🔧 レスポンシブ止まり | 21 | 崩れてはいないが「PC画面を狭めただけ」。共通トークン（Row/RowSlot の stackOnMobile・hideOnMobile）任せで、下シート・カード積み・専用ナビ等のiOSアプリらしい作り込みが無い |
| ❓ PC専用（要再検証） | 9 | `pcOnlyScreens.ts` でPC専用扱いだが、理由が「影響が大きい」等の重要性の話で幅・列数の技術的根拠を欠く、または実装が既にモバイル対応可能な形（stackOnMobile済み等）になっている。**顧客・取引先マスターが M10 の棚卸しで「実測したら表ですらなくカードだった」と判明し開放された前例と同型** |
| 🖥️ PC専用（妥当） | 23 | 一括データ入力・複数列比較・打合せの場で映す等、実装を確認しても妥当な理由がある |

### 見つかった重要な誤り1件

**② 部屋の空き（`/studio/rooms`）は「① 予定と並ぶネイティブ級」ではなかった。** 監査を始める前の
私（着手前の会話）はこの画面もカレンダー①と同様にPC・スマホ両方が承認済みモックに沿って
作り込まれていると述べたが、実装を確認した結果 **モバイル分岐が1行も無く**、PC側（macOS風の
ツールバー・常設ミニカレンダー）だけが作り込まれ、スマホは `overflow-x-auto` で部屋×時間の帯を
そのまま横スクロールさせているだけだった（`pcOnlyScreens.ts` の `CLIENT_PC_ONLY` に列挙済み・
理由自体は妥当）。`docs/v4-progress.md` の該当行も「PC は…作り直し済み」とだけ書いており
「スマホは」の一文が① 予定にだけあってこの画面には無いことを見落としていた。

## バックログ（優先度順）

### A. 土台（部品）を直すと複数画面に一度に効くもの — 最優先

個別画面を1枚ずつ直すより、GMOの方針（「効くのは部品の側」）どおり共通部品を直すのが先。

1. **`shared/src/client/ui/dialog.tsx` の中央固定モーダルを、スマホでは下シートに倒す。**
   カレンダー①予定の「部屋を押さえる」だけが自前で下シートを実装しており（`StudioBookingDialog.tsx`
   の `rounded-t-[20px]` 等の個別実装）、他の全ダイアログ（案件・財務・機材管理・日常業務の
   登録/編集フォームのほぼ全て）は中央固定モーダルのまま。**この1箇所を直すと `responsive_only`
   21画面の大半のダイアログが一度にiOSアプリらしくなる**（`client-v4/sheet.tsx` の既存Sheet部品を
   共通ダイアログのモバイル既定にする方向で検討）
   - ~~カレンダー①予定の残り6ダイアログをこの土台に統一~~ **✅ 完了（第1バッチ）**（2026-08-20）。
     `shared/src/client-v4/formDialog.tsx`（`<FormDialog>`／`<FormDialogFooter>`）を新設し、
     既存の `<Sheet>` をそのまま土台にした（合成可能な `Dialog`/`DialogContent`/`DialogHeader`
     風のAPIは検討したが、「骨格をpropsと子要素の2通りで表現できてしまう」ため見送り、
     `<Sheet>` と同じフラットなpropsを踏襲。理由はコミットメッセージと `formDialog.tsx`
     冒頭のコメント参照）。載せ替えたのは
     `PersonalEventDialog.tsx` / `PartnerScheduleDialog.tsx` / `StudioBookingDetailDialog.tsx` /
     `pages/calendar/FilterDialogs.tsx`（`RoomFilterDialog`/`UserFilterDialog`/`LayerFilterDialog`
     の3つを含む）/ `StudioBookingDialog.tsx`（自前の下シート実装をやめて土台に集約。
     iOSスタイルの「キャンセル/保存をヘッダーに置く」独自レイアウトは
     `<Sheet>` の決めごと「主ボタンはシートの下端に固定」に合わせてフッターへ移した）。
     `npx tsc -b client` / `npm run lint` / `npm run test`（1142件）OK。
   - ~~機材管理・日常業務の24ファイル~~ **✅ 完了（第3バッチ）**（2026-08-20・並列6エージェント）。
     `client-equipment`（Excel取込2・カスタム列1・機材台帳/ラック図/棚卸し4・equipmentList4・
     貸出/メンテナンス3・設定4）／`client-daily`（TasksPage・受付2種・内覧会・セキュリティカード。
     `IntakeLogTab.tsx`は表示専用のため見送り）を移行。`wide`判定基準（旧幅・複数列グリッドの
     有無で判断）は正しく踏襲されている（スポットチェック済み）。
     `npx tsc -b client-equipment client-daily` / `npm run lint` / `npm run test`（1141件）OK
   - ~~財務・GPM・設定・カレンダー残り・共通部品の25件~~ **✅ 完了（第4バッチ）**（2026-08-20・
     並列5エージェント）。finance 6件（`RevenueDialog.tsx`は明細が1400px級の表なので**見送り**）／
     gpm 7件／platform 5件／production 4件（`BusinessProjectView.tsx`の明細ダイアログは
     RevenueDialogと同じ理由で**見送り**）／`ExcelToolbar.tsx`。
     `SearchPalette.tsx`・`IntakeLogTab.tsx`・`EquipmentDetailPage.tsx`・`RackLayoutPage.tsx`
     の残りは表示・確認専用と確認して対象外。
     `npx tsc -b client` / `npm run lint` / `npm run test`（1141件）OK。
     - ⚠️ **このバッチで見つけた土台の欠け（直した）**: `UserDialog.tsx`の移行で、
       旧`<form onSubmit>`の送信ボタン（フッター）が`<Sheet>`では本文と別divの
       兄弟要素になり、**Enterキー送信・`<button type="submit">`が効かなくなる**
       ことが判明した（ボタンを`onClick`にすり替えて回避）。同じ穴が以後の
       全バッチで繰り返されるのを防ぐため、`Sheet`/`FormDialog`に`onSubmit`
       propを追加した（本文とフッターを1つの`<form>`で束ねる・opt-in）。
       **以後のバッチは、旧実装が`<form onSubmit>`を使っていた画面ではこの
       `onSubmit`を使うこと**（`shared/CLAUDE.md`に記録済み）
   - **残り53件**（`grep -rlE "components/ui/dialog['\"]" --include="*.tsx" client
     client-daily client-equipment` で再洗い出し・引用符を問わない形。表示専用が
     混じっているので実際に移行対象になるのはこれより少ない見込み）:
     - **sales(20)**: `sales/components/{CustomerDialog,SimulationDialog}.tsx` /
       `sales/pages/activityLog/ActivityLogDialog.tsx` /
       `sales/pages/company/CompanySummaryDialog.tsx` /
       `sales/pages/flow/ApplyFlowDialog.tsx` / `sales/pages/pricing/PricingDialogs.tsx` /
       `sales/pages/projectDetail/LostDialog.tsx` /
       `sales/pages/projectDetail/thread/RecordDialog.tsx` /
       `sales/pages/projectForm/dialogs/{CategorySwitchDialog,GlsDialog,RelinkDialog}.tsx` /
       `sales/pages/projectGroup/{GroupFormDialog,PurchaseDialog,RevenueDialog}.tsx` /
       `sales/pages/projectLedger/{BulkEditDialog,ColumnPicker,PastePlanDialog}.tsx` /
       `sales/pages/salesReview/TargetDialog.tsx`
     - **tasks(9)**: `tasks/components/{ColumnDialog,EpisodesPanel,TaskDialog,
       TemplatePickerDialog}.tsx` / `tasks/components/KanbanView/KanbanColumn.tsx` /
       `tasks/components/TaskListView/TaskListGroup.tsx` /
       `tasks/components/intake/IntakeReview.tsx` /
       `tasks/pages/taskList/AddTaskDialog.tsx`
     - ⚠️ **前回「54件」としていたのはシングルクォートimportのみを拾う数え方だった。**
       ダブルクォート込みで数え直すと76件で、正しい残数は53件（sales 20・tasks 9・第4バッチ
       時点までに片付いた分を除く）。**次に数え直すときも必ず引用符を問わない形**
      （`grep -rlE "components/ui/dialog['\"]"`）を使うこと
2. **`PcOnlyPanel`（PC専用画面をスマホで開いたときの案内）をiOSアプリ風に磨く。**
   `pc_only_justified` 23画面すべてがこの1部品を経由する。「使えません」ではなく「ここはPCで」を
   美しく伝える1箇所の改善で23画面に効く
3. ~~`pc_only_questionable` 9画面の理由を実測で書き直す~~ **✅ 完了（小・中の7画面）**（2026-08-20）。
   実ブラウザ375px（headless Chromium）で1画面ずつ確認し、7画面すべて `CLIENT_PC_ONLY` から
   `CLIENT_MOBILE_OK` へ移した:
   - 費用を分け合うグループ一覧・拠点部屋: グリッド/Rowが数pxまで押し潰され、横スクロールバーは
     出ないまま画面外に切れる崩れ（`document.scrollWidth` では検知できない種類）を発見し修正
   - 権限とメンバー・通知とテンプレート: 実測の結果崩れ無し。理由文が権限モデル単純化前の
     古い実装を指していた（stale）ので実態に合わせて書き直した
   - GPM標準工程テンプレート・お金のルール: 和文は1文字ごとに折り返せるため、隣接する固定幅の
     兄弟要素に押されて欄が数pxまで潰れ縦一文字になる崩れを発見し修正
   - 休日・営業時間: 表の見出し行だけ `stackOnMobile` が漏れていた崩れを発見し修正
   - 残り2画面（顧客360・GPMプロジェクト詳細、大規模）は別バッチで扱う
   - ⚠️ **副次的にもう1つ実装バグを発見し、根本原因（SQL）を直した**: 「お金のルール」の
     値引き上限で、上限を1件も決めていない役割の編集フォームが常に開いた状態で表示される
     不具合（画面幅に無関係）。原因は `GET /money-rules` の SQL が `LEFT JOIN` で
     `l.role_id`（`role_discount_limits` 側の列）を返しており、上限が未設定の役割では
     この列ごと `NULL` になっていたため（フロントの `editing === l.role_id` が
     `null === null` で常に真になっていた。保存を押すと `PUT /money-rules/limits/null` を
     叩く実害もあった）。`r.id AS role_id`（`permission_roles` 側の列）に直した
   （`server/src/contexts/finance/routes/money-rules.routes.ts`）

### B. 旧カレンダー2画面の機能吸収（このドキュメント上部で決定済み）

- ~~香盤ビュー・予約を直す導線を ① 予定に吸収 → 旧スタジオカレンダーを退役~~
  **✅ 完了**（2026-08-20）。①香盤ビューは `DesktopToolbar.tsx` に月・週・一覧と並ぶ
  4つ目の表示切替として追加した（`KoubanView.tsx` をそのまま再利用。マスを押すと
  その部屋・時間で新規作成できる）。②「既存の部屋予約を直す唯一の導線」は
  `StudioBookingDetailDialog` の「編集」を `StudioBookingDialog` の編集モードへ
  つないで解消した（従来は読むだけ）。スマホ側（`rooms/MobileToday.tsx`）も同様に
  編集をつないだ（香盤はPC専用のまま — 旧画面も日表はPCのみだった）。
  `/studio/studio-calendar` は `/studio/calendar` へ `RedirectKeepQuery` で転送し、
  `StudioCalendarPage.tsx`（1002行）は削除した。
  ⚠️ **旧スタジオカレンダーが持っていた「カレンダー連携」ダイアログ（部屋の合算
  フィード＋サイネージURL）は固有機能ではなかった** — ④ 設定の「サイネージ」タブ
  （`SignageTab.tsx`）が実装を確認すると既に同じAPI・同じ機能を持っており、移設不要
  だった
- ~~取込元の詳しい色分け・外部連携設定を ① 予定／④ 設定に吸収 → 旧自分の予定を退役~~
  **✅ 完了**（2026-08-20）。①取込元ごとの色分け（個人予定・Google・Outlook・ICS購読・
  共有の5色）は `useCalendarEvents.ts` の「自分」レイヤー計算に統合し、① 予定の凡例
  （PC: `CalSidebarExtras.tsx`／スマホ: `FilterDialogs.tsx` の `LayerFilterDialog`）に
  「自分」を出しているときだけ表示するようにした。②外部カレンダー連携の設定は
  **実装を確認すると `CalendarSettingsPage.tsx`（④ 設定）の「外部カレンダー」タブ
  （`FeedsTab.tsx`）が既に同じ機能を持っていた**（この画面より先に作られていた）ため
  移設は不要だった。ただし**サーバーの Google/Outlook OAuth コールバックが
  `/studio/my-calendar` へ直書きでリダイレクトしていた**（`google-oauth.routes.ts` /
  `ms-oauth.routes.ts`）ため、退役前にリダイレクト先を `/studio/settings?tab=feed` へ
  張り替え、連携完了時の通知バナー（旧画面が出していたもの）を `CalendarSettingsPage.tsx`
  へ移設した（張り替えを忘れると「連携したのに何も起きない」画面になっていた）。
  `/studio/my-calendar` は `/studio/calendar` へ `RedirectKeepQuery` で転送し、
  `MyCalendarPage.tsx` は削除した
- ~~② 部屋の空きに専用モバイルレイアウトを追加~~ **✅ 完了**（2026-08-20）。
  `rooms/MobileRoomAvailability.tsx`（① 予定と同じ `MobileMonthGrid` で日付選択）＋
  `rooms/RoomAvailabilityCards.tsx`（選んだ日の部屋ごとの空き帯をカードで縦積み。
  帯の計算 `laneBlocks` はPC版と完全共用）を新設し、`CLIENT_PC_ONLY` から
  `CLIENT_MOBILE_OK` へ移した。typecheck/lint/test(1142件)OK。
  ⚠️ ブラウザ自動化ツールが無く実機375pxのスクリーンショット確認は未実施

### C. `responsive_only` 21画面のネイティブ化（Aの土台修正が効いた後、個別の作り込みが要るもの）

小規模から着手: ③仮押さえ改善(スワイプ)・棚卸し一覧・QRスキャン・探す(案件管理/機材管理)・
内覧会開催日一覧・当日受付 → 中規模: 案件詳細のタスクタブ(v3のカンバン/ガント残存)・
GPM系一覧3画面・日常業務(週報/ニュース/セキュリティカード)・機材管理(台帳/メンテ/貸出返却) →
大規模: システムの情報・日常業務タスク依頼(v4未着手)。詳細は監査結果の表を参照。

### D. `native` 10画面の仕上げ（小規模な磨き込み）

トップページ・案件管理ダッシュボード・案件作成・案件一覧・タスク一覧・① 予定・③ 仮押さえ・
財務②請求入金・棚卸し。監査結果の gaps 列を参照（スワイプ操作・下シートへの統一など）。

## 気になったが今回は直していないこと

- **`npm run check:frozen` が凍結3アプリ（Qシート・技術資料・計時LIVE）で
  基準とのズレ（99952→99891・63972→63881・66938→66877。どれも数十バイト減）を
  検出し続けている。** 第2バッチの3エージェントそれぞれが「自分の変更を含まない
  クリーンな HEAD でも同じバイト数のズレが再現する」ことを確認しており、
  この回の変更が原因ではない（`client-v4/` はどのアプリも触っていない・
  client の変更もこのアプリのTailwindスキャン対象外）。ただし**いつからこの
  ズレが発生しているのか・原因（フォント同梱の変化や依存パッケージの版など）は
  未調査のまま**。基準（`scripts/frozen-css-baseline.json`）を
  `--update` で動かす前に、まず原因を突き止めるのが筋（減っているだけで
  実害は無さそうだが、確認せずに基準だけ動かすと本当の変化を見逃す）
