# client-equipment — 機材管理（v4 対象）

いま効くルールだけを置く。経緯・当時の実測・撤回した方針は
[docs/reviews/daily-equipment-build-log.md](../docs/reviews/daily-equipment-build-log.md)。

## 役割と入口

- `/equipment/`・ポート 5175。**ルーターに `basename` は無い**（Vite の `base` だけ）ので `App.tsx` も `nav.ts` の `to` も `/equipment/...` から書く
- `shared/src/client/apps.ts`: `key: 'equipment'`・`permissionModule: 'equipment'`
- サーバー `server/src/contexts/equipment`（routes `equipment`／`excel`／`manufacturers`／`colors`／`cables`／`connectors`／`rental-catalog`、services `item`／`lending`／`maintenance`／`inventory`／`stats`。全部 `/equipment/*`）
- 権限はサーバーの route ごと `requirePermission('equipment', reader｜editor｜manager｜owner｜exporter)`（既定 reader・貸出/返却の書き込み editor・削除 manager）。**フロントの閲覧ゲートは無い**（`AppShell.tsx`）— 新設すると権限の無い既存の利用者が突然入れなくなる。入れるなら本番の `user_permissions` を数えてから別の作業で
- シェルは共通。ここにあるのは `components/layout/` の `AppShell.tsx`・`nav.ts`・`EquipmentSearchButton.tsx`（上辺の検索＝`/equipment/search` を開く・⌘K）と `manual/content.tsx`。左メニューは 現場／貸出／設定 の3塊（ダッシュボードは `end: true` 必須）、下タブは **ホーム／やること（＝貸出・返却）／探す**（`EQUIPMENT_MOBILE_TABS`）
- MCP は [docs/mcp-server.md](../docs/mcp-server.md) 機材管理の節（台帳の登録・編集は画面だけ）。設計の正は [equipment.md](../docs/design/v4/equipment.md)、レンタル機材検索の絵は [rental-search/](../docs/design/v4/rental-search/README.md)

## 画面一覧（URL → `src/pages/`）

| URL | 画面 | 入口 |
| --- | --- | --- |
| `/equipment` | ダッシュボード（押せば片づくものだけ） | `DashboardPage.tsx` ＋ `dashboard/` |
| `/equipment/items?view=items｜lend｜supply` | 機材台帳（機材／貸出機材／ケーブル・コネクタ。タブは URL） | `EquipmentLedgerPage.tsx` ＋ `equipmentList/`（`ItemsPanel.tsx`・`RentalPanel.tsx`）・`catalog/CatalogPanel.tsx` |
| `/equipment/items/:id` | 機材の詳細 | `EquipmentDetailPage.tsx` ＋ `detail/` |
| `/equipment/racks` | ラック図（PC 専用） | `RackLayoutPage.tsx` ＋ `rack/` |
| `/equipment/maintenance` | メンテナンス | `MaintenancePage.tsx` ＋ `maintenance/` |
| `/equipment/inventory` | 棚卸し（スマホは現場のスキャン） | `InventoryPage.tsx` ＋ `inventory/`（`MobileScanSession.tsx`・`useScanQueue.ts`） |
| `/equipment/scan` | QRスキャン（読み取り履歴つき） | `ScanPage.tsx` ＋ `scan/`（`useScanner.ts`） |
| `/equipment/search` | 探す（下タブ3つ目） | `SearchPage.tsx` ＋ `search/`（`standby.ts`） |
| `/equipment/rental-search` | レンタル機材検索（TOC・レスター。読むだけ） | `RentalSearchPage.tsx` ＋ `rental/`・`lib/rentalCatalogApi.ts` |
| `/equipment/lendings` | 貸出・返却 | `LendingListPage.tsx` ＋ `lending/` |
| `/equipment/settings?tab=loc｜maker｜cat｜rule` | 設定（保管場所／メーカー・色／貸出カテゴリ／貸出のルール。PC 専用・スマホのメニューに出さない） | `SettingsPage.tsx` ＋ `settings/` |
| 旧 URL 8本 | 転送だけ（`<Navigate replace>`・対応表は `App.tsx` 冒頭） | — |

## 決めごと（現役ルール）

### 台帳
- 機材IDは 拠点-種別-連番5桁（`Y-C-00001`）。拠点 `LOC_CODES`（Y 用賀／S 渋谷）・種別・状態・コンディション・`TYPE_BG` は `lib/constants.ts`
- 機材は常設が基本。貸出できるのは「貸出可」`equipment_items.is_rental_listed` だけ（台帳の `RentalCell` と設定「貸出のルール」の一覧が同じ1列に書く）
- 資産管理は日常では畳む（`equipmentList/EquipmentAssetFields.tsx`・既定は非表示）
- タブは URL `?view=` に出す。変えたら機材の絞り込み（`tab/sect/locs/q/sort/dir/children`）は持ち越さない
- ケーブル・コネクタは1枚の表（`catalog/CatalogPanel.tsx`。コネクタの m・色は `—`）。保存先は行の `source` が決める。列の出し入れ・表編集は外し Excel 取込に寄せた
- 貸出カテゴリの管理は設定の1か所（`settings/RentalCategoriesTab.tsx`・並びは ↑↓ の入れ替え）
- 行は `Row`（`equipmentList/EquipmentTable.tsx`＋`EquipmentCells.tsx`）: 列幅は `types.ts` の `COL_W` 7段・段差は `LEAD_W` の中だけ・伸びるのは商品名（`RowMain`）だけ。列の出し入れ・その場編集・親子の入れ子の3つは残す
- 既定8列で 1,300px を超えるので枠ごと横に流す（列は潰さない）。「操作」は右に `sticky`、行に必ず背景色を持たせ枠は `bg-inherit`、隠れた列があるあいだだけ影（`useSticksOverContent`）
- 描くのは見えている行だけ（`useRowWindow.ts`＋`rowWindowMath.ts`。流れる親は共通シェルの `<main>`・`window.scrollY` は常に 0）。行は平らな配列にし、`onSelectOne` の番号は `items` のまま
- 同じ機材を3回描かない: スマホのカード・印刷用の表は CSS で隠さず描くほうを止める（`ItemsPanel.tsx`。`PrintArea.tsx` は刷るときだけ）。`PrintTable.tsx` は本物の `<table>` のまま（`index.css` の `#eq-print-area table`）

### スマホ（768px 未満）
- 台帳は `md:`=768px でカード（`equipmentList/EquipmentCards.tsx`）。判定は `hooks/useMediaQuery.ts` の `MD_UP`（共通 `useIsMobile()` は 1023px なので使わない）。表とカードの両方を直す
- 道具帯（`ItemsToolbar.tsx`）は「機材を追加」だけ（Excel 取込／出力・印刷・出す列・表で編集 は表に効くもの）。編集はカードの鉛筆から `FormDialog`
- 絞り込みは `MobileFilters.tsx`（枠は `shared/src/client-v4/mobileFilterBar.tsx`）。送る値は PC と同じで `ItemsPanel` の `applyFilterPatch` 1か所。保管場所はドロップダウンを重ねず並べる
- カードは PC の行を縮めない（`EquipmentCards`／`LendingCards`／`MaintenanceCards`／`ScanHistoryCards`／`SearchCards`／`InventoryCards`／`KpiRail`）。値・並び・行き先は PC と同じ関数（`dashboard/kpiCells.ts`・`search/standby.ts`）。`useIsMobile()` は薄い親で1回

### ラック図
- 左に一覧・右に1本（`rack/RackList.tsx`）。一覧の帯は 実装U／総U で、実装Uは前面・背面をまたいで数える
- 1U 単位・前面／背面を切替。反対の面に機材がある U は右の番号を amber で示す（表示中の1本だけで判定）。セル色は色マスタ由来。文字組みは高さで変わる（`rack/cellContent.tsx`: 1U 型名＋No.／2U 型名／機材名／3U以上 機材名／型名）
- 図の下に実装一覧（`rack/RackUnitTable.tsx`）。空きは連続区間で「3-6」、左右に割り付けた U は空きに数える、「空き 0U」も出す
- 印刷は絞り込んだラックを全部出す（`rack/PrintRackArea.tsx`）。`printConstants.ts` の `PRINT_U_H`／`PRINT_RACK_BODY_BUDGET_PX` は実機で合わせた値。上げると1ページ目で切れる
- 画面の中身は `print:hidden` で印刷から外す（`visibility: hidden` だけだと白紙が1枚増える）

### 棚卸し・QR・探す
- 棚卸しは保管場所ごとに ✓／×（`inventory_check_items.found` は INTEGER 0/1/2。ブール化して送ると型エラー）。下書き→実施中→完了。増えた機材は `POST /inventory-checks/:id/sync`
- スマホの棚卸しは現場のスキャン（`inventory/MobileScanSession.tsx`）。押した印は端末に溜めて後で送る（`useScanQueue.ts`→`shared/src/client-v4/offlineQueue.ts`）。溜まった件数は常に画面に出す。終わった棚卸しに積まない・断られたものは列から外して理由を出す
- 溜めて送る列に貸出を載せない（列は鍵で上書き＝何回やっても同じ結果の操作だけ。貸出は2回押すと2本できる）
- QR の読み方は `lib/qrCode.ts` の `extractCode` 1本（QRスキャンと現場のスキャンが共用）。カメラ制御 `scan/useScanner.ts` は `ScanPage` で1回だけ呼ぶ
- 手打ちの機材IDは形で弾かない（カメラは形で捨てるが、手打ちは一覧に当ててから「ありません」）
- 読み取り履歴は見つからなかったものも残す（`equipment_scans`・migration 168）
- 探すは台帳の写しではない（打つ欄と当たったものだけ。ケーブル・コネクタも一緒に探す。QR の入口がいちばん上）。機材はサーバー `GET /equipment/items?search=`（台帳と同じ口）、ケーブル・コネクタは画面側。鍵は `['equipment-search', …]` で台帳と別
- `GET /equipment/items?search=` はハイフン・空白・`_` を無視（`item.service.ts` が ID・型名・製造番号を両側から `REPLACE`。台帳の検索にも効く）。`lending/LendingSelectStep.tsx` も同じ緩め方

### 貸出・メンテナンス・設定
- 貸出の登録は2段階（`lending/LendingDialog.tsx`: 機材を選ぶ→貸出先と日付）。「返却遅延」は画面が返却予定日から導く（サーバーは知らない。送ると全件が出る）
- ダッシュボードの本日・明日の持ち出しは予定（`equipment_lendings.status='planned'`＋`planned_out_date`・migration 168）、入庫は返却予定日。予定が無ければ 0 で正しい。ケーブル・コネクタの合計はここで数えない
- メンテナンスはスマホに残す（現場で「壊れている」を登録する）。状態 報告済→対応中→完了（完了で `completed_at`）。`record_type` は 故障／修理／メンテナンス／点検／記録（`log`・migration 294）、修理引取／返送日は `repair_sent_at`／`repair_returned_at`
- 設定はタブを URL `?tab=` に出す。保管場所は 拠点・種別（ラック／オペ卓／AV盤）・建物・フロア・エリアを持ち、種別がラックの場所だけ U を持ちラック図に並ぶ。貸出のルールの6スイッチは `equipment_settings`（キー×値・migration 168）に押した瞬間保存、書けるのは `owner`（値は見せて押せなくする）
- レンタル機材検索は読むだけ（`rental-catalog.routes.ts` → `qsheet/services/rental.service` を再利用・データは `qsheet_rental_items`）。予約リスト・今すぐ取得は制作技術支援 `/techops/rental/:ownerKey` にだけ置く

## 触るときの注意

- 検査: `npx tsc -b client-equipment`・`npx eslint client-equipment`・`npm run lint`・`npm run test`
- 画面を足したら `src/pcOnlyScreens.ts` の `EQUIPMENT_PC_ONLY` か `EQUIPMENT_MOBILE_OK` へ（M2。無いと `npm run lint` が止まる）。PC 専用は ラック図・設定（`hidden: true`）の2枚。旧 URL 8本は表に書かない（転送は画面ではない）。M2／M8／M9 は [mobile.md](../docs/design/v4/mobile.md)
- 1ファイル400行が上限（`docs/v4-plan.md` B-4・`scripts/check-file-size.mjs`）。いま超過: `pages/RackLayoutPage.tsx` 1,090／`pages/EquipmentDetailPage.tsx` 1,031／`manual/content.tsx` 442／`components/ExcelImportDialog.tsx` 408
- `html`／`body`／`#root` は触らない（`shared/src/client/base.css`・F2）。`index.css` の `@media print` は2ブロック（機材台帳・ラック図）。`base.css` が印刷時に高さの固定を外す前提なので `overflow` を書かない
- `RowSlot hideOnMobile` は 640px で列を出し始める（`Row stackOnMobile` の折り返し終了と同時）。列が多い表は `lib/rowVisibility.ts` の `HIDE_UNTIL_WIDE`（`sm:hidden lg:flex`）で1段うしろへ
- Excel の取込・出力は3か所（`components/ExcelImportDialog.tsx`＋`excel.routes.ts`／`components/ConsumableExcelImportDialog.tsx`＋`cables.routes.ts`・`connectors.routes.ts`）。列定義は散在
- 設定タブの CRUD は `hooks/useCrudPage.ts`（shared の `createUseCrudPage`）

## 残作業

- 400行超の4ファイルの分割・Excel の列定義の一本化
- QRスキャンからその場で貸出・返却はまだ無い（相手・用途・期日が要るので入力の設計から）
- ⚠️ 要確認: `docs/mcp-server.md` 機材管理の注記「HTTP の `/lendings` 系は reader のまま書き込める」は、いまの `equipment.routes.ts`（書き込み editor・削除 manager）と食い違う

## 経緯の記録

[docs/reviews/daily-equipment-build-log.md](../docs/reviews/daily-equipment-build-log.md)
