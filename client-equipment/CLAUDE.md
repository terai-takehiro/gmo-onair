# client-equipment — 機材管理（v4 対象）

ベースパス `/equipment/`・ポート 5175。17画面・約11,900行。サーバー側は `server/src/contexts/equipment`。

## 画面（v4 で8画面・設定は1画面4タブに統合）

| v4 画面 | いまの実装 |
| --- | --- |
| ダッシュボード | `pages/DashboardPage` |
| 機材台帳（機材・貸出機材・ケーブル・コネクタのタブ） | `pages/EquipmentListPage` / `ModelGroupPage` / `CablePage` / `ConnectorPage` |
| ラック図 | `pages/RackLayoutPage` ＋ `pages/rackLayout/{RackDisplay,config}` |
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
- **棚卸し**は保管場所ごとに ✓／× を押す形（`found=1/2`）。下書き→実施中→完了
- 種別コード・状態・コンディション・種別色（`TYPE_BG`）はすべて `src/lib/constants.ts`

## 触るときの注意

- **1ファイル400行を上限にする。** いま超過しているもの:
  `pages/EquipmentListPage.tsx` 2,017行 / `pages/RackLayoutPage.tsx` 1,502行 /
  `pages/EquipmentDetailPage.tsx` 1,090行 / `pages/CablePage.tsx` 839行
- Excel の取込・出力が複数ページにある（機材・ケーブル・コネクタ）。列定義は各ページに散っている
- 本文の文字サイズが `client` と揃っていない → v4 の F2 で共通の下地に寄せる
