# スマホ最適化 洗い出し（2026-08-20）

## v3時代の遺物（そのほか（作り直し前））の整理状況（2026-08-20 追記2）

**PC専用35画面のうち、一部は「スマホ対応する」以前に「そもそも消せる／消せない」の判断が
先に要る**（ユーザー指摘）。左メニューの「そのほか（作り直し前）」に畳んである6画面を実コードで
1件ずつ調べた結果:

| 画面 | 判定 | 根拠 |
| --- | --- | --- |
| `/budget/detail`（案件月別詳細） | **① 削除済み** ✅ | 他画面からの生きた導線が無く、画面自身が既にv4の`RevenueListPage`/`PurchaseListPage`/`SgaListPage`（`project_id`/`recognition_month`で同じ絞り込みに対応済み）へ誘導している。独自機能は見当たらない。旧URLは`/budget/dashboard`へ転送する |
| `/budget/reports/vendors`（仕入先集計） | **③ 作り直しが必要** | v4の取引先マスター（`CounterpartyPage.tsx`）に「仕入先集計へ」ボタンが**現役である**。仕入先別ランキング＋CSV出力はv4のどこにも無い独自機能 |
| `/studio/studio-calendar`（旧スタジオカレンダー） | **③ 作り直しが必要** | コマ表（`KoubanView`）と**既存予約の編集**（v4統合カレンダーは新規作成のみで編集不可）がv4に無い独自機能 |
| `/studio/partners`（旧パートナー） | **② 削除済み** ✅ | v4統合カレンダー（`/studio/calendar`）の`NewEventChooser`が同じ`PartnerScheduleDialog`を呼んでおり、**作成・編集とも既に代替済み**と実装確認できた。旧URLは`/studio/calendar`へ転送する。⚠️ この画面自身は既にFullCalendarを撤去済みだったが、CLAUDE.md・統合カレンダー側のコメントに古い記述が残っていた |
| `/studio/my-calendar`（旧マイカレンダー） | **② 削除候補（要作業）** | 予定の作成・編集自体は統合カレンダーで代替済みだが、**サーバー側のGoogle/Outlook連携OAuthコールバックがこのURLへ直書きでリダイレクトしている**ため、削除前にリダイレクト先変更＋連携完了通知UIの移植（`CalendarSettingsPage`が自然な移設先）が要る |
| `/sales/customers/:id`（お客様の詳細） | **③ 作り直しが必要** | 一覧(`/sales/customers`)は削除済みだが、詳細ページへは取引先マスター・全社検索・「最近見た」から**現役の導線が3系統ある**。活動記録をその場で追記する書き込み機能がv4のどこにも無い独自機能 |

⚠️ **`client/CLAUDE.md`の「パートナーとマイは予定を作る導線がそこにしかない」という記述は、
実装と照合すると古くなっている**（統合カレンダーは後の回で作成・編集ダイアログを取り込み済みだが、
この記述が更新されていなかった）。ドキュメント側の訂正が別途要る。

**次にやるなら**: ①の`/budget/detail`はほぼノーリスクで削除できる（案件管理の「そのほか」棚卸しと
同じやり方）。②の2つは統合カレンダー側の代替を実機で確かめてから削除、`/studio/my-calendar`は
OAuthリダイレクト移設が前提。③の3つ（仕入先集計・旧スタジオカレンダー・お客様の詳細）は
独自機能があるため、消すのではなくv4へ作り直す（＝35画面のPC専用リストに残り、スマホ対応も
その作り直しと同時に検討する）対象になる。

## 対応状況（2026-08-20 追記）

「要対応」1・2・4・5・6・7 は同日中に着手して直した（各コミットは下の項目に記載）。
残るは **3（機材台帳「機材」タブのスマホ対応）と 8（無参照部品の後片付け）**。
3 は CLAUDE.md 自身が「途中」と明記する既存の大きい未完了機能で、CSS/ブレークポイントの
修正では済まず設計から必要になるため、ユーザー判断でいったんこの回のスコープから外した
（別途、設計を相談してから着手する）。4 は `EquipmentDialog.tsx`（スマホで唯一残る追加導線）
側だけを直した — `EquipmentDetailPage.tsx` の別実装（重複）はそのまま残っており「要確認」に記載。

## 位置づけ

v4 対象3アプリ（`client` / `client-daily` / `client-equipment`）と共通ライブラリ `shared` を対象に、
「まだスマホ最適化が済んでいない箇所」をコードから洗い出した記録。

前提として、このプロジェクトは既に `shared/CLAUDE.md`「スマホの手触りは部品と型スケールで一度に効かせる
（Phase 6）」や `docs/reviews/codex-findings-v4.md` に大量の対応済み記録があるほど、スマホ対応の蓄積が厚い。
そのため今回は **①本当に未対応の実装漏れ** と **②意図してPC専用にした設計判断**（`pcOnlyScreens.ts`）を
明確に分けて記録する。②を「未対応」として直しにいかないこと。

各アプリの `pcOnlyScreens.ts` にある画面は「バグ」ではなく理由付きの設計判断。全一覧は各ファイルを参照
（`client/src/pcOnlyScreens.ts` / `client-daily/src/pcOnlyScreens.ts` / `client-equipment/src/pcOnlyScreens.ts`）。

## 要対応（実装漏れ・優先度が高い順の目安）

### client

1. ✅ **`/gpm/projects` のボード表示がスマホでも開ける**（`contexts/gpm/pages/GpmProjectListPage.tsx`）
   姉妹画面の案件一覧（`contexts/sales/pages/ProjectListPage.tsx`）は `useIsMobile()` で「ボード」トグル自体を
   隠し、`?view=board` 直リンクも一覧へ強制フォールバックしている（375px に1列も入らないため、という理由が
   CLAUDE.md にも明記済み）。GPM 側の一覧には同じガードが無く、`useIsMobile` を一切使っていない。押すと
   `w-60`（240px）固定カラムが5列並ぶカンバンが横スクロール前提で出る。**案件一覧のガードを移植し忘れたと
   見られる。`/gpm/projects` は `CLIENT_MOBILE_OK` 指定の画面なので許容された仕様ではない。**
   → 対応済み（`feb471d`）。`useIsMobile()` を追加し、スマホでは切替ボタンを隠して常にリストへ落とす。

2. ✅ **`/gpm/projects` の絞り込み帯がスマホでも畳まれない**（同ファイル 203〜242行目）
   検索欄・区分ボタン・並び順が `MobileFilterBar`（シート化）を使わず1行にそのまま並び、375px では折り返して
   縦に重なる。ファイル内コメントに「件数が増えたら移す」と意図的な簡略化である旨の記載があるため、優先度は
   1番より低いが、他画面と手触りが揃っていない点は残る。
   → 対応済み（`18ccb6b`）。案件一覧・機材台帳と同じ `shared/src/client-v4/mobileFilterBar.tsx` に載せ替えた。

### client-equipment

3. ⬜ **機材台帳「機材」タブのカスタム列・その場編集・親子の入れ子がスマホで使えない**
   （`pages/equipmentList/EquipmentCards.tsx` / `EquipmentTable.tsx` / `ItemsPanel.tsx`）
   PC版（`EquipmentTable`）だけが親子展開・カスタム列・その場編集を持ち、スマホ版（`EquipmentCards`）は
   `parent_name` を文字列で添えるだけで展開操作自体が無い。`client-equipment/CLAUDE.md` に「枠はv4・行の
   載せ替えは途中」と明記されている既知の未完了。
   → **未着手（意図的に見送り）**。CSS/ブレークポイントの修正では済まず設計から必要になる大きい機能追加
   のため、ユーザー判断でこの回のスコープから外した。着手するときは別途設計を相談してから。

4. ✅（部分対応） **機材の新規登録・編集ダイアログが375pxでも常にフル項目・密グリッド**
   （`EquipmentDialog.tsx` / `EquipmentAssetFields.tsx` / `EquipmentDetailPage.tsx` の編集フォーム）
   台帳・詳細画面では「資産管理は日常では畳む」設計判断があるのに、登録・編集ダイアログには反映されていない。
   ダイアログ実効幅 ≈311pxに対し `grid-cols-3`〜`grid-cols-4` を組んでおり、1セル65〜96px まで圧縮される。
   `ItemsToolbar` の「機材を足す」はスマホでも残る唯一の追加導線（`isMobile` 分岐なし）なので実際に露出する。
   **さらに同じ密グリッドパターンが `EquipmentDialog` と `EquipmentDetailPage.tsx` の2箇所に別実装で重複**
   しており、直すときは両方直す必要がある。
   → `EquipmentDialog.tsx`（スマホで唯一残る追加導線）側は対応済み（`4d3a64b`）。「資産・保証／親機材」を
   折りたたみにした（新規登録は畳んで開始・既存の編集は開いたまま）。**`EquipmentDetailPage.tsx` 側の
   別実装（重複）は未対応のまま**（下の「要確認」参照）。

### client-daily / client-equipment（横断・優先度中）

5. ✅ **「検索を消す（×）」ボタンが28px（`h-7 w-7`）で44pxタップ規則の対象外**
   `InviewPage.tsx` / `InviewDayPage.tsx` / `SecurityCardsPage.tsx`（client-daily）、
   `components/parts/SearchField.tsx`（client-equipment）の4箇所。共通の `Button`（`data-ui="button"`）を
   経由せず素の `<button>` を書いているため、`tokens-v4.css` の44px強制ルールが効かない。**同じコードが4箇所に
   複製されている**ため、1箇所直しても残りが直らない点も合わせて要対応。
   → 対応済み（`c69f3ed`）。4箇所とも `data-ui="button"` を付けて44px規則の対象にした。

### shared（3アプリ共通に効く）

6. ✅ **`Pagination`（`shared/src/client/ui/pagination.tsx`）の前へ/次へボタンが36px（`h-9`）**
   `Button` 部品を経由しない生 `<button>` のため44px規則の対象外。`client` の `CompanyListPage.tsx`
   （`/sales/companies`）・`CounterpartyPage.tsx`（`/budget/vendors`）は両方とも `MOBILE_OK` 画面なので、
   実際にスマホで36pxのページ送りボタンが出る。
   → 対応済み（`3caf0c4`）。`data-ui="button"` を付けて44px規則の対象にした。

7. ✅ **`CrudFormDialog`（`shared/src/client/ui/crud-form-dialog.tsx`）だけがSheet化されていない**
   `shared/CLAUDE.md` は「一覧から1件ずつ片づける画面は下から出るシートを使う」をv4の決めごとにしているが、
   この部品だけ中央固定Dialogのまま。`CompanyListPage.tsx` / `CounterpartyPage.tsx`（ともにMOBILE_OK）の
   新規追加・編集がここを通る。壊れてはいないが、フッターの保存/キャンセルが画面下端に固定されない。
   → 対応済み（`b82467a`）。`client-v4/sheet.tsx` の `<Sheet>` に載せ替えた。外部から見える props は不変。

8. **（軽微・要確認寄り）`DataTable` / 生 `Table`・`FilterBar` が無参照のままスマホ未対応で残置**
   `shared/src/client/ui/data-table.tsx`・`table.tsx`・`filter-bar.tsx` はどのアプリからもimportされていない
   （`FilterChips` 等の後継部品に役割が移った残骸と見られる）。実害は今は無いが、`ui/index.ts` の案内文が
   これらを「使える部品」として紹介しており、次に誰かがテーブルを作る際にモバイル未対応のまま採用される
   リスクがある。非推奨の注記を足すか削除するかの判断が要る。

### 参考（低優先・一貫性のみ）

- 機材詳細のQRコード表示ダイアログ（`EquipmentDetailPage.tsx:362-380`）だけ `max-h-[90vh] overflow-y-auto`
  を明示していない（`DialogContent` の既定値でカバーされるため実害はほぼ無い）。

## 意図的にPC専用（見直しの対象・1件ずつ検討中）

これまでは「バグではなく設計判断」として対応対象から外していたが、**2026-08-20
以降、この一覧も1件ずつ見直しの対象にする**（ユーザー方針）。チェックは
「スマホに開放した／開放しないと決め直した」のどちらかが済んだ印で、
「検討して現状維持と決めた」も済みに数える（何もしていない、と区別するため）。

出どころは各アプリの `pcOnlyScreens.ts`（`why`/`instead` の原文はそちらを参照）。

### client（`client/src/pcOnlyScreens.ts`）

**案件管理**
- [ ] `/sales/tasks/gantt` ガントチャート — 横に長い時間軸。代替: やることを開く
- [ ] `/sales/billing` 見積・請求（全案件） — 金額・期日・状態が横に並ぶ表。代替: 案件一覧
- [ ] `/sales/projects/ledger` 案件台帳 — 列20・取り消せない一括更新。代替: 案件一覧
- [ ] `/sales/projects/:id/edit` 案件を直す — 入力欄40以上。代替: 案件一覧
- [ ] `/sales/flow-templates` 標準工程テンプレート — 型を変えると全案件に効く
- [ ] `/sales/pricing` 料金表 — 単価表、桁違いが見積金額に影響
- [ ] `/sales/project-groups`（+`/:id`） グループ（費用の分け合い）— 全体を見ながら按分。**左メニューからも非表示**
- [ ] `/sales/activity-logs` 営業活動記録・営業レビュー — 3列を並べて打合せの場で映す分析タブを含む。代替: 案件一覧
- [ ] `/sales/customers/:id` お客様の詳細 — v4未リニューアル。**③作り直しが必要**（上の「v3時代の遺物」節を参照。独自の書き込み機能あり、現役導線3系統あり単純削除不可）

**財務管理**
- [ ] `/budget/dashboard` 財務ダッシュボード — 引き算の関係を1枚で見る
- [ ] `/budget/revenues` 売上の台帳 — 金額の桁を縦にそろえて読む表
- [ ] `/budget/purchases` 仕入の台帳 — 同上
- [ ] `/budget/sga` 販管費の台帳 — 同上
- [ ] `/budget/documents` 受け取った書類 — 取り消せない台帳登録操作
- [ ] `/budget/import` 取り込み — 3段の取込作業。**左メニューからも非表示**
- [x] ~~`/budget/detail` 案件月別詳細~~ — **削除済み**。旧URLは`/budget/dashboard`へ転送する
      （上の「v3時代の遺物」節を参照。生きた導線無し・独自機能無し）
- [ ] `/budget/reports/vendors` 仕入先集計 — 仕入先×月の表。**左メニューからも非表示**。
      **③作り直しが必要**（v4取引先マスターから現役導線あり・独自集計＋CSVがv4に無い）

**カレンダー**
- [ ] `/studio/rooms` 部屋の空き — 部屋×時間の表。代替: 今日の予約を見る
- [ ] `/studio/settings` カレンダーの設定 — 部屋・外部カレンダー・サイネージ
- [ ] `/studio/studio-calendar` （旧）スタジオカレンダー — 月マス目・横7列。
      **③作り直しが必要**（コマ表・既存予約の編集がv4統合カレンダーに無い）
- [x] ~~`/studio/partners` （旧）パートナースケジュール~~ — **削除済み**。旧URLは`/studio/calendar`へ転送する
      （v4統合カレンダーで作成・編集とも代替済みと実装確認済み）
- [ ] `/studio/my-calendar` （旧）マイカレンダー — 月マス目・横7列。
      **②削除候補（要作業）**（サーバーのOAuthリダイレクト先変更＋通知UI移植が前提）

**設定**
- [ ] `/settings/sites` 拠点・部屋 — 拠点1つで予約可能部屋と見積金額の両方が変わる
- [ ] `/settings/users` 権限とメンバー — 12区画×5段の表
- [ ] `/settings/money` お金のルール — 以後の書類すべてに効く。**左メニューからも非表示**
- [ ] `/settings/hours` 休日・営業時間 — 時刻選択欄が縦に並ぶ。**左メニューからも非表示**
- [ ] `/settings/notify` 通知とテンプレート — 文面を貯める画面。**左メニューからも非表示**
- [ ] `/settings/data-viewer` データビューア — DBの中身をそのまま出す道具。**左メニューからも非表示**
- [ ] `/settings/db-backups` DBバックアップ — 復元は取り消せない操作。**左メニューからも非表示**

**プロジェクト管理（GPM）**
- [ ] `/gpm/projects/new` プロジェクトを作る — 5段フォームで体制・工程・金額をまとめて決める
- [ ] `/gpm/projects/:id`（+`/:tab`） プロジェクトの詳細 — 工程表と体制図が横に伸びる
- [ ] `/gpm/templates` プロジェクトの標準工程 — 型を変えると全プロジェクトに効く

### client-daily（`client-daily/src/pcOnlyScreens.ts`）
- [ ] `/inquiries` 入ってきた情報 — 差出人・要件・希望日・人数・予算が横に並ぶ一覧。代替: やることを開く

### client-equipment（`client-equipment/src/pcOnlyScreens.ts`）
- [ ] `/equipment/racks` ラック図 — 1Uずつの升目に機材を並べる図。代替: 機材台帳を開く
- [ ] `/equipment/settings` 機材管理の設定 — 保管場所・メーカー・色・貸出の決めごと。**左メニューからも非表示**

**合計: client 30画面（`/budget/detail`・`/studio/partners` 削除済みにつき -2） + client-daily 1画面 + client-equipment 2画面 = 33画面**
（`/sales/project-groups` と `/sales/project-groups/:id`、`/gpm/projects/:id` と `/:id/:tab` は
それぞれ実質1画面として数えた）。

## 凍結4アプリ（対象外）

`client-qsheet` / `client-techsheet` / `client-live` / `client-awards` は v4.0.0 では作り直さない方針
（CLAUDE.md「ブロックアプリ一覧」）。今回の洗い出しの対象外。

## 要確認（優先度・スコープの判断が必要）

- 機材台帳「機材」タブのスマホ対応をどこまで作り込むか（＝上記3の着地点）
- 登録・編集ダイアログの資産・ラック項目をスマホでは折りたたむべきか（＝上記4の着地点）
- `CompanyListPage.tsx` の役割バッジ列・操作ボタン列に `hideOnMobile` が付いていない点が意図的か書き漏れか
- `KpiCard` の `onClick` 使用箇所で44px規則が実測で満たされているか（375px実機確認が必要）

## 次のアクション案

1・2・4（部分）・5・6・7 は対応済み（上記参照）。残るのは:

- **3（機材台帳「機材」タブ）**: 設計から必要な大きい機能追加。着手するときは
  カスタム列・その場編集・親子展開をスマホカードでどこまで作り込むか（要確認の1点目）を
  先に決めてから進める。
- **4 の残り（`EquipmentDetailPage.tsx` 側の重複実装）**: `EquipmentAssetFields.tsx` を
  再利用する形に寄せられるか、それとも別実装のまま同じ折りたたみを足すかの判断が要る。
- **8（無参照部品の後片付け）**: 実害は無いので優先度は低いまま。
