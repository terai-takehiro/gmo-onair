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

1. ~~`shared/src/client/ui/dialog.tsx` の中央固定モーダルを、スマホでは下シートに倒す。~~
   **✅ ほぼ完了（第1・3・4・5バッチ）**（2026-08-20・全体で計6バッチ・並列27エージェント）。
   v4対象3アプリのCRUDフォームダイアログ（当初把握の76か所）のほぼ全てを
   `shared/src/client-v4/formDialog.tsx` の `<FormDialog>` へ移行した。残るのは
   意図して見送った6件のみ（`IntakeLogTab.tsx`・`EquipmentDetailPage.tsx`・
   `RackLayoutPage.tsx`・`SearchPalette.tsx`・`finance/pages/ledger/RevenueDialog.tsx`・
   `production/.../BusinessProjectView.tsx` — いずれも表示専用の確認ダイアログか、
   1400px級の明細テーブルで`wide`の760px上限でも収まらない複合エディタ）。
   移行過程で `Sheet`/`FormDialog` に `wide`（PC幅760px・opt-in）と `onSubmit`
   （本文とフッターを1つの`<form>`で束ねてEnterキー送信を復元・opt-in）の
   2つの土台機能を追加した（詳細は下の完了ログ・`shared/CLAUDE.md`）。
   カレンダー①予定の「部屋を押さえる」は当初 `StudioBookingDialog.tsx` が
   自前で下シートを実装していた（`rounded-t-[20px]` 等の個別実装）が、これも
   第1バッチで `<FormDialog>` に集約済み（下記）。
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
   - ~~sales(18)・tasks(8)の残り26ファイル~~ **✅ 完了（第5バッチ）**（2026-08-20・
     並列8エージェント）。案件管理（取引先まわり・活動記録/工程/料金/レビュー・
     案件詳細・GLS系3件・費用を分け合うグループ・案件台帳）とタスク（カラム/タスク/
     エピソード/テンプレート・投入確認・タスク追加）を移行。`KanbanColumn.tsx`・
     `TaskListView/TaskListGroup.tsx`は確認専用ダイアログのみで対象なしと確認して
     見送り（判断は一貫していた）。`onSubmit`（新設）を`CustomerDialog.tsx`・
     `PricingDialogs.tsx`の2件で使用し、Enterキー送信を復元。
     `npx tsc -b client` / `npm run lint` / `npm run test`（1141件）OK。
   - **A-1 完了。** 残る6件（`IntakeLogTab.tsx`・`EquipmentDetailPage.tsx`・
     `RackLayoutPage.tsx`・`SearchPalette.tsx`・`finance/pages/ledger/RevenueDialog.tsx`・
     `production/.../BusinessProjectView.tsx`）は表示専用または1400px級の明細
     テーブルで、意図して`FormDialog`の対象外とした（次に手を入れるなら
     `RevenueDialog`系は「wideの上限を超える専用の広いシート」を新設するか
     どうかの設計判断が要る・急ぎではない）
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
   - ~~残り2画面（顧客360・GPMプロジェクト詳細、大規模）~~ **✅ 完了（第9バッチ）**
     （2026-08-20・並列2エージェント）。
     - 顧客360: v4未着手だった画面をPageHeader/Row/FormDialog等のv4トークンに全面刷新し、
       PC/スマホ両方をネイティブ級に作り直したうえでスマホへ開放
     - GPMプロジェクト詳細: 7タブを実測し6タブをスマホへ開放（「請求」のみ2,042行の
       共用コンポーネントが未対応のためPC専用のまま）。**実測で見積タブに実際の横はみ出し
       バグを発見・修正**（`Row`に`stackOnMobile`が漏れ、固定4列408pxが375px幅を超えていた）。
       案件詳細⑥と同じ段階別モバイルタブ絞り込みも新設
     - `npx tsc -b client` / `npm run lint` / `npm run test`（1144件）/ ビルド、すべてOK。
       両エージェントとも実Postgres+実ブラウザ(Playwright)で375px実測済み
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

- ~~小規模6画面（システムの情報・GPMダッシュボード・内覧会開催日一覧/当日受付・
  QRスキャン・探す(機材管理)）~~ **✅ 完了（第6バッチ）**（2026-08-20・並列6エージェント）。
  いずれもPC/スマホの薄い親分岐＋カード型専用レイアウトを新設（`HoldCards.tsx`/
  `ProjectCards.tsx`と同じ考え方）。内覧会当日受付では左スワイプでの受付/取消も追加し、
  実装中に見つけたCSSスタッキングの不具合（下敷きがカードより上に描かれる）も
  実ブラウザで検証して修正済み。`npx tsc -b client client-daily client-equipment` /
  `npm run lint` / `npm run test`（1141件）/ 3ワークスペースの個別ビルド、すべてOK
- ~~中規模12画面~~ **✅ 完了（第7バッチ）**（2026-08-20・並列12エージェント）。
  取引先マスター（役割絞り込みを下シート化＋カード化）・取引先(仕入先/パートナー)
  （カード化＋電話発信リンクを代替導線に）・探す(案件管理)（キャンセル演出＋最近見た
  ものの削除＋結果カード化）・設定トップ（iOS設定風のセクション区切りリスト）・
  GPMプロジェクト一覧/全タスク（カード化）・ウィークリー活動報告（週ピッカーシート＋
  トピックスをFormDialog化＋自動集計カード化）・デイリーニュース・セキュリティ
  カード（ドリルダウン化）・機材ダッシュボード/メンテナンス/貸出返却（カード化）。
  `npx tsc -b client client-daily client-equipment` / `npm run lint` /
  `npm run test`（1144件）/ 3ワークスペース個別ビルド、すべてOK
- ~~残り3画面（大規模）~~ **✅ 完了（第8バッチ）**（2026-08-20・並列3エージェント）。
  - ⑥案件詳細: OverviewTabをスマホ専用カード化（実装中に2列グリッドの区切り線が
    2行目左端にも出る表示バグを発見・修正）。TasksTabはスマホ常にリスト表示にし、
    かんばん/ガント切替をPC専用にした（案件一覧の「ボードはスマホに出さない」前例
    に倣う判断）。やり取り／見積／書類／当日／ふりかえりの5タブ本体のモバイル専用化は
    時間の都合で見送り（次バッチ候補）
  - タスク依頼(daily): v4トークン（PageHeader/TableBadge/型スケール）に全面移行。
    9マスボードの横スクロールをやめ、タップした区画のタスクだけをカード縦積みで
    見せる方式に組み直した
  - 機材台帳: カードに鉛筆ボタンを追加しFormDialog（既に移行済み）を編集モードで
    開く形でその場編集を復元。カスタム列もダイアログ内で編集可能にした（PCと同じ
    APIを共有）。親子の入れ子（子機材個別の編集導線）は設計が別途要るため見送り
  - `npx tsc -b client client-daily client-equipment` / `npm run lint` /
    `npm run test`（1144件）/ 3ワークスペース個別ビルド、すべてOK
- **C. 完了。** 残る宿題（次バッチ候補・急ぎではない）: 案件詳細の残り5タブの
  モバイル専用化・機材台帳の親子入れ子編集

### D. `native` 10画面の仕上げ（小規模な磨き込み）

- ~~機能として欠けていた3点~~ **✅ 完了（第10バッチ）**（2026-08-20・並列3エージェント）。
  - タスク一覧（④）: スマホに新規追加ボタン（既存のAddTaskDialog=FormDialog）と
    延期（`duePresets()`流用の明日/3日後/日時選択）を追加。担当変更は画面の軽さを
    崩すため見送り（PCへ案内のまま）
  - 棚卸し（⑤）: 一覧（回を選ぶ画面）が素のRowリストのままだった穴をカード積みに。
    新規作成ダイアログは既にFormDialog化済みと確認し重複作業せず
  - 請求・入金（②・MobileCollect）: 実装（`LIST_LIMIT=300`）を確認し、件数が多いと
    探せない実害があると判断。財務台帳3画面と共通の`LedgerSearch`を再利用し取引先名
    検索を追加（「記録するだけ」の単一目的設計・並び順は変更なし）
  - `npx tsc -b client client-equipment` / `npm run lint` / `npm run test`（1144件）/
    両ワークスペースのビルド、すべてOK
- **見送った残りのgaps**（純粋な操作感の演出で、機能欠落ではないため優先度を下げた）:
  トップページ（AI入力シートのスワイプダウン閉じ・タイル長押し並べ替え）・
  案件管理ダッシュボード（pull-to-refresh・ドリルダウン下シート）・案件作成
  （スワイプバック）・案件一覧（カードのスワイプアクション）・① 予定（残り5ダイアログの
  下シート化はA-1で既に完了済み。凡例絞り込みの下シート化のみ未対応）・③ 仮押さえ
  （確認ダイアログの下シート化・スワイプ確定）。急ぎなら次バッチで着手可能

## バグ調査（第11バッチ・2026-08-20）

A〜Dのバックログ完了後、今回のセッション全体の変更（`5816cfe..HEAD`・224ファイル）を
対象に、マルチエージェントでバグの観点だけのレビューを実施した。
**発見（10エージェント・エリア別）→ 各候補を独立2名で懐疑的に検証（デフォルト
「再害無し」で判定）→ 実害ありと確認できたものだけ修正**、という3段構成。

- 発見: 3件の候補（10エリア中3エリアから。他7エリアは0件）
- 検証: 3件とも2名の検証者のうち少なくとも1名が実害ありと判断し、確認済みとした
- 修正した3件:
  1. **GPMプロジェクト詳細**: 完了/失注段階のプロジェクトで未解決の未確認事項が
     残っていても、スマホのタブ集合(`MOBILE_TABS_BY_PHASE.done`)に「未確認事項」が
     無いため、ダッシュボード等から直接リンクを踏むと問答無用で概要へリダイレクトされ、
     **その項目を見る・解決する手段がスマホのどこにも無くなっていた**。
     `effectiveMobileTabs()`を新設し、タブバーと段階違いリダイレクト判定の**両方**が
     同じ関数を通るようにして修正（片方だけ直すと同じ食い違いが再発するため）
  2. **メンバー編集（設定）**: FormDialog移行で`<form onSubmit>`のネイティブ`required`
     検証が失われ、**氏名・メールを空欄のまま保存できていた**（サーバー側もチェック無し
     でそのままUPDATE）。兄弟ダイアログ（RoleDialog/ClosedDayDialog）と同じ
     `disabled={!name.trim() || !email.trim()}`で塞いだ
  3. **AI投入確認シート（タスク）**: FormDialog移行で旧`onInteractOutside`ガードが
     失われ、**背景の誤クリック1回で入力中の下書き（原文・AI抽出行・編集内容）が
     確認もAPIの呼び出しも無いまま消えていた**。`Sheet`/`FormDialog`に
     `onInteractOutside`のopt-in propを追加（`wide`/`onSubmit`と同じ設計）し、
     この画面に適用して修正
- 事後に横展開チェック: `git log -p`でセッション全体の差分から`onInteractOutside`の
  削除箇所を検索し、上記1件以外に同種の削除が無いことを確認済み（見落としの横展開なし）
- 検証: `npx tsc -b client` / `npm run lint` / `npm run test`（1144件）/ `client`ビルド、
  すべてOK

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
