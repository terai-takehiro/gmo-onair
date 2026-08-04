# shared — 全アプリの共通コード

**ここを触ると7アプリ全部に効く。** PR の影響範囲に必ず「共通ライブラリ」を入れること。

ビルド工程を持たない（`main`/`types` が `src/index.ts` を直接指す）。各アプリは
`@gmo-onair/shared/src/client/...` の深いパスで **TypeScript のまま** import する。
解決は root の npm workspaces が作る symlink だけに依存している（Vite の alias も
tsconfig の paths も無い。v4 の F1 で明示する）。

## 中身

| 場所 | 何が入っているか |
| --- | --- |
| `src/client/tokens.css` | 設計トークン（色・書体・角丸）。DADS のプリミティブを import した上に GMO ブルーと意味づけを載せる |
| `tailwind.preset.ts` | 全7アプリの `tailwind.config.ts` が `presets` で継承（**相対パス** `../shared/tailwind.preset` で参照） |
| `src/client/ui/` | shadcn/Radix のプリミティブ22本 |
| `src/client/dashboard/` | `DashboardHeader` / `KpiCard` / `SectionCard` / `EmptyState` / `chart-colors` |
| `src/client/{AppHeader,SharedHeader,AppSwitcher}.tsx`, `appNav.ts` | いまのヘッダーとアプリ切替（**v4 の S1/S2 で `src/client/shell/` に置き換える**） |
| `src/client/{createApi,createAuthHook,queryClient,uiStore}.ts` | axios・認証フック・react-query・UIストアのファクトリ |
| `src/client/{manual,mcpInfo,versionHistory}/` | ヘッダーから開くモーダル3種 |
| `src/collab/` | Yjs の同時編集（`server/src/shared/collab/` と**意図的に複製**。`scripts/check-collab-parity.mjs` が一致を検査し、違えばビルドを止める） |
| `src/constants/statuses.ts`, `src/utils/businessDays.ts`, `src/enums.ts`, `src/types.ts` | 業務の共通定義 |

- `src/client/ui/index.ts` は `data-table` / `filter-bar` / `pagination` を**再エクスポートしていない**（深いパスで import する）
- ストレージキー: `qs_user`(qsheet) / `ts_user`(techsheet) / `eq_user`(equipment) ほか

## v4 のトークン方針（重要）

v4.0.0 の対象は **`client` / `client-daily` / `client-equipment` の3アプリだけ**。
残る4アプリ（`client-qsheet` / `client-techsheet` / `client-live` / `client-awards`）は**凍結**で、
**今日と同じ見た目を保つ**。そのため:

| ファイル | 誰が読むか | 触り方 |
| --- | --- | --- |
| `src/client/tokens.css` | **凍結4アプリ**（＋v4対象も import 元として経由） | **値を変えない。** 名前の追加だけ可 |
| `src/client/tokens-v4.css`（v4 の T2 で新設） | **v4 対象3アプリだけ** | `tokens.css` を import した上で、v4 で変わる値（約5個＋書体）を上書き |
| `tailwind.preset.ts` | 全7アプリ | **追加だけ。** 既存キーの値を変えない（追加なら凍結アプリを壊さない） |

- 色は **RGB の3つ組 ＋ `<alpha-value>`** で持つ（`rgb(var(--primary) / <alpha-value>)`）。
  HSL の3つ組は元の色に戻せず、実際にコメントの hex と描画色が食い違っている。
  また `bg-primary/10` のような**半透明指定が765か所**あるので、色コードの直書きにはできない
- **`client-awards` は `tokens.css` を読んでいない**（自前の変数を持ち、共通 preset も継承していない）。
  凍結なのでこれは**直さない**

## 触るときの注意

- **`shared/` を触る PR は全アプリの再ビルドを起こす。** 「共通部分を触る PR」と
  「1アプリだけの PR」を意識して分けること（分ければ後者はビルドがスキップされる）
- `src/client/AppSwitcher.tsx` の `ONAIR_APPS` はアプリ色を**トークン外の hex 直書き**で持っている。
  同じアプリ一覧が `appNav.ts` の `ALL_APPS`・`client` の `BLOCK_APPS`・各 `Sidebar` にもあり、
  **4か所が既に食い違っている**（`studio` が「カレンダー」と「スタジオ予約」など）→ v4 の S1 で1つに統合
- `src/collab/` を変えたら `server/src/shared/collab/` も同じに直す（検査で止まる）
