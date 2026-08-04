# shared — 全アプリの共通コード

**ここを触ると7アプリ全部に効く。** PR の影響範囲に必ず「共通ライブラリ」を入れること。

ビルド工程を持たない（`main`/`types` が `src/index.ts` を直接指す）。各アプリは
`@gmo-onair/shared/src/client/...` の深いパスで **TypeScript のまま** import する。

## 参照経路（4つある。ずれると shared が二重に読み込まれる）

| 経路 | 何で解決するか | 書き方 |
| --- | --- | --- |
| `import` 文（238か所） | 各アプリの `vite.config.ts` の `resolve.alias` | `@gmo-onair/shared/src/...` |
| 型チェック（同じ import 文） | 各アプリの `tsconfig.json` の `paths` | 同上 |
| CSS の `@import`（6アプリ） | Vite の `resolve.alias` | `@gmo-onair/shared/src/client/tokens.css` |
| Tailwind の preset（6アプリ） | Node の解決（`node_modules` の symlink） | `@gmo-onair/shared/tailwind.preset` |

**4つが同じ実体を指していないと、zustand のストアや React の context が2つできる**
（「片方で更新したのに反映されない」という再現条件の読めない不具合になる）。
`npm run lint` の `check-shared-wiring.mjs` が7アプリ分を機械的に照合する。

- **`package.json` の依存は必ず `"@gmo-onair/shared": "*"`。** 範囲（`^2.9.237` 等）を書くと
  **本番のビルドが落ちる** — Dockerfile の manifests ステージが全ワークスペースの `version` を
  `0.0.0-build` に書き換えるので範囲が外れ、`npm ci` が公開レジストリを見て 404 になる
- **`tsconfig.json` の `paths` は、指す先が無いと黙って `node_modules` にフォールバックする**
  （実測: 存在しないディレクトリに向けても `tsc -b` は exit 0）。**型チェックでは気づけない**ので、
  ずれを見つけられるのは上記の検査だけ
- **`shared` に `tsconfig.json` は無い。** そのため shared は各アプリの `tsc -b` に取り込まれる形で
  **7回・7通りの `compilerOptions` で型チェックされる**（`client-daily` / `client-live` だけ
  `noUnusedLocals: false`、`client-awards` は `forceConsistentCasingInFileNames` が無い）。
  正しく直すには shared を composite プロジェクトにして `references` で参照する必要があるが、
  それは `main`/`types` を `dist` に向ける変更＝238か所の import と CSS の `@import` に影響するため、
  v4.0.0 では手を付けない

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
