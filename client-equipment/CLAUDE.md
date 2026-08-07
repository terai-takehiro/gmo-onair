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

- **1ファイル400行を上限にする。** いま超過しているもの:
  `pages/EquipmentListPage.tsx` 2,017行 / `pages/RackLayoutPage.tsx` 1,270行 /
  `pages/EquipmentDetailPage.tsx` 1,090行 / `pages/CablePage.tsx` 839行
- Excel の取込・出力が複数ページにある（機材・ケーブル・コネクタ）。列定義は各ページに散っている
- **`html`/`body`/`#root` はこのアプリで触らない。** 高さ・書体・印刷は
  `shared/src/client/base.css`（F2 で集約済み）。`.heading-*` / `.font-number` の複製も削除済み
- **ラック図・機材台帳の印刷**は `index.css` の `@media print` 2ブロック。`base.css` が
  印刷時に高さの固定を外す前提なので、`html`/`body` の `overflow` をここで書かないこと
