# client-equipment — 機材管理（v4 対象）

ベースパス `/equipment/`・ポート 5175。17画面・約11,900行。サーバー側は `server/src/contexts/equipment`。

## 画面（v4 で8画面・設定は1画面4タブに統合）

| v4 画面 | いまの実装 |
| --- | --- |
| ダッシュボード | `pages/DashboardPage` |
| 機材台帳（機材・貸出機材・ケーブル・コネクタのタブ） | `pages/EquipmentListPage` / `ModelGroupPage` / `CablePage` / `ConnectorPage` |
| ラック図 | `pages/RackLayoutPage` ＋ `pages/rack/{RackList,RackUnitTable,cellContent,printConstants,PrintRackArea}` |
| メンテナンス | `pages/MaintenancePage` |
| 棚卸し | `pages/InventoryPage` |
| QRスキャン | `pages/ScanPage` |
| 貸出・返却 | `pages/LendingListPage` |
| 設定（保管場所／メーカー・色／貸出カテゴリ／貸出の決めごと） | `pages/LocationPage` / `ManufacturerPage` / `ColorPage` / `RentalCategoryPage` / `RentalSettingsPage` |

- ルートは `src/App.tsx`（`/equipment` 以外は接頭辞なしの絶対パスで書かれている点に注意）
- `/equipment/rental-categories` は**ルートはあるがメニューに出ていない**（v4 で設定タブに入れる）

## このアプリ固有の決めごと

- **機材IDは「拠点-種別-連番5桁」**（例 `Y-C-00001`）。拠点コードは `lib/constants.ts` の `LOC_CODES`
- **機材は「常設が基本」。** 貸出は機材台帳で「貸出可」にチェックした機材だけが対象
- **資産管理は日常では畳む。** 台帳・詳細のヘッダーの「資産管理を表示」トグルで、
  列・資産情報カード・固定資産／リースの絞り込みがまとめて出入りする（既定は非表示）
- **ラック図**は1U単位。前面／背面を切替え、反対面に機材がある U を橙で示す。
  セル色は色マスタ（`ColorPage`）由来。高さで文字組みが変わる（1U=型名＋No. / 2U=型名／機材名 / 3U以上=機材名／型名）
- **v4 大④: 12本を横に並べるのをやめ、左に一覧・右に1本にした。** 横並びだと
  1本が画面に収まらず、どのラックを見ているかも分からなかった。一覧には
  実装U／総U の帯を出す（**実装Uは面をまたいで数える** — 前面だけで数えると
  背面に詰まっているラックが空いて見える）
- **図の下に実装一覧の表を出す**（U位置・ID・機材・種別・割付）。1U のセルには
  型番と管理番号が入らないので、図で位置・表で中身、の2枚組にする。
  **空きは連続した区間でまとめる**（「3,4,5,6」ではなく「3-6」）。
  左右に割り付けた U は空きに数える（半分だけ埋まっているため）
- **印刷は今までどおり絞り込んだラックを全部出す。** 画面で1本ずつ見るのと
  紙に全部並べるのは別の用途。**印刷の寸法（`rack/printConstants.ts` の
  `PRINT_U_H` / `PRINT_RACK_BODY_BUDGET_PX`）は実機で合わせた値で、上げると
  1ページ目で切れる**。大④ では位置だけ動かし、計算には手を入れていない
- **画面の中身は `print:hidden` で印刷から外す。** `body * { visibility: hidden }`
  だけだと**場所は取ったまま**なので、刷り終わったあとに白紙が1枚増える
  （実測: 2ページ → 3ページ。`print:hidden` を足して 2ページに戻した）
- **棚卸し**は保管場所ごとに ✓／× を押す形（`found=1/2`）。下書き→実施中→完了
- **スマホで棚卸しを開くと ⑨ 現場のスキャンになる**（`pages/inventory/MobileScanSession.tsx`）。
  確認できた / 見つからない / のこり の3つを出し、QR を読むと「あった」が付く。
  **押した印は端末に溜めてから送る**（`shared/src/client-v4/offlineQueue.ts`）
  — 機材庫・搬入口は電波が届かず、1件ごとに通信して失敗で止まると作業が終わる
- **⑨ に貸出を載せてはいけない。** 溜めて送る列は**鍵で上書き**なので、
  載せてよいのは**何回やっても結果が同じ操作**だけ（棚卸しの印・返却）。
  貸出は2回押すと2本できる。**画面にもその理由が書いてある**
- **手打ちの機材IDは形で弾かない。** カメラはゴミを拾うので `lib/qrCode.ts` の
  形に合わないものを捨てるが、**手打ちは人が打った文字**。形だけで弾くと
  **台帳にある ID を打っても「読み取れない形」と言われる**（検証データの
  `EQ-0001` で実際に起きた）。手打ちは一覧に当ててから「ありません」と言う
- **QR の読み方は `src/lib/qrCode.ts` の1本。** ⑥ QRスキャンと ⑨ の両方が使う
  （写すと、片方だけシールの形を足したときに読めない端末ができる）
- 種別コード・状態・コンディション・種別色（`TYPE_BG`）はすべて `src/lib/constants.ts`

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。残っているのは
  `components/layout/AppShell.tsx` と `components/layout/nav.ts` だけ。
  `nav.ts` の `to` は **`/equipment/...` から書く** — このアプリはルーターの `basename` を
  持たず Vite の `base` だけで動くため（日常業務は `basename="/daily"` なので `/tasks`）。
  **閲覧のフロント側ゲートは足していない** — 無いのが現状で、新設すると
  権限を持たない既存の利用者が突然入れなくなる

- **機材台帳の行は `Row` に載せ替えた**（`equipmentList/EquipmentTable.tsx` ＋ `EquipmentCells.tsx`）。
  `<table>` の列幅は**中身が決める**ので、絞り込みを変えるたびに列が動き、
  同じ「種別」の列が画面によって違う幅になっていた。7段の固定幅
  （`types.ts` の `COL_W`）に寄せると、**出す列を変えても残った列は同じ位置**のまま。
  - **この一覧が持っている3つはそのまま**（列の出し入れ・その場編集・親子の入れ子）。
    実ブラウザで **11 列 × 34 行の左端が 1px 以内で揃っている**ことを測ってある
    （列を増やしても・子を開いても・その場編集の間も揃ったまま）
  - **段差は行の頭（`LEAD_W`）の中だけ**に出す。列側に入れると子の行だけずれる
  - **伸びるのは商品名だけ**（`RowMain`）。行に1つだけ、が `Row` の決まり
  - 既定の8列でも 1,300px を超えるので**枠ごと横に流す**（列は潰さない）。
    そのぶん**「操作」は右に貼り付ける** — 流れる形にすると直す・消すが既定で
    画面の外に出て、毎日使う画面で横に送らないと押せなくなる。
    **貼り付ける枠は下が透けてはいけない**ので、行に必ず背景の色を持たせ
    （`bg-card` / `bg-primary-surface-weak` / `bg-muted`）、操作の枠は `bg-inherit` で受け取る
  - **印刷は触っていない。** `PrintTable.tsx` は本物の `<table>` のままで、
    `index.css` の `#eq-print-area table` もそのまま効く（紙は表のほうが正しい）
- **画面を足したら `src/pcOnlyScreens.ts` のどちらかの表に入れること**（M2）。
  `EQUIPMENT_PC_ONLY` か `EQUIPMENT_MOBILE_OK` で、**どちらにも入っていないと
  `npm run lint` が止まります**。決め方は `client/src/pcOnlyScreens.ts` の冒頭。
  - PC 向きは**ラック図と設定の2枚だけ**。棚卸し・QRスキャン・貸出・返却・
    機材を探す は現場で使うのでスマホに残す
  - **メンテナンスはスマホに残す**（ご判断）。現場で「これ壊れている」を
    その場で登録したい、が実際に起きるため
  - `/equipment/locations` など8本の旧 URL は**表に書かない** — どれも
    `/equipment/settings?tab=…` や台帳のタブへの転送で、画面ではない
- **機材台帳は 768px 未満でカードに切り替わる**（`equipmentList/EquipmentCards.tsx`）。
  PC 用の行（`EquipmentTable.tsx`）は `hidden md:block` の中なので、
  **スマホに 1,300px の表は出ていない**。ここを触るときは両方を直すこと
- **スマホでは道具帯のボタンを5つ落とす**（M8・`equipmentList/ItemsToolbar.tsx`）。
  Excel 取込・Excel 出力・印刷・出す列・表で直す は**どれも表に効くもの**で、
  上のとおり 768px 未満では**表そのものが出ていません**。押しても何も起きない
  ボタンが5つ並ぶと画面が壊れて見えます。残すのは「機材を足す」だけ
  （現場で「これ増えた」を入れるのは実際に起きる）
- **スマホの絞り込みは `equipmentList/MobileFilters.tsx`**（M8）。枠は共通の
  `shared/src/client-v4/mobileFilterBar.tsx`。**送る値は PC と同じ**で、
  `ItemsPanel` の `applyFilterPatch` 1か所に集めてある（写すと片方だけ軸が増える）。
  設置場所だけ形が違う — PC は押すと開くドロップダウンだが、シートの中に
  さらにドロップダウンを重ねないため**そのまま並べる**。
  実測: 最初のカードに着くまで **約 1,100px → 約 285px**
- **1ファイル400行を上限にする。** いま超過しているもの:
  `pages/RackLayoutPage.tsx` 1,269行 / `pages/EquipmentDetailPage.tsx` 1,090行 /
  `manual/content.tsx` 443行 / `components/ExcelImportDialog.tsx` 414行
  （`EquipmentListPage.tsx` 2,017行 と `CablePage.tsx` 839行は分割済み。
  台帳は `pages/EquipmentLedgerPage.tsx` 67行 ＋ `pages/equipmentList/` に分かれている）
- Excel の取込・出力が複数ページにある（機材・ケーブル・コネクタ）。列定義は各ページに散っている
- **`html`/`body`/`#root` はこのアプリで触らない。** 高さ・書体・印刷は
  `shared/src/client/base.css`（F2 で集約済み）。`.heading-*` / `.font-number` の複製も削除済み
- **ラック図・機材台帳の印刷**は `index.css` の `@media print` 2ブロック。`base.css` が
  印刷時に高さの固定を外す前提なので、`html`/`body` の `overflow` をここで書かないこと
