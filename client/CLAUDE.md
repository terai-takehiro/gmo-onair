# client — 案件管理・財務管理・カレンダー・設定（v4 対象）

ONAiR で一番大きいアプリ。**1つの Vite バンドルに4つ（v4 では5つ）の「入口」が入っている**。
ベースパス `/`・ポート 5173。44画面・約36,000行。

## 入口とルート接頭辞

| 入口（利用者から見た名前） | ルート | 権限モジュール | contexts |
| --- | --- | --- | --- |
| 案件管理 | `/sales/*` | `sales` | `contexts/sales`, `contexts/tasks` |
| 財務管理 | `/budget/*` | `budget` | `contexts/finance` |
| カレンダー | `/studio/*` | `studio` / `partner_schedule` | `contexts/production` |
| 設定 | `/admin/*` → **v4 で `/settings/*` に改名** | `admin` | `contexts/platform` |
| **プロジェクト管理（v4 で新規）** | `/gpm/*` | 未定 | `contexts/gpm`（新設） |

- ルート定義は `src/App.tsx` の1ファイル。**旧URLからの転送表もここ**（`<Navigate>` 約12本）
- 左メニューの定義は `src/components/layout/Sidebar.tsx` の `APP_NAV`（入口ごとのセクション）
  → **v4 では `shared/src/client/shell/nav/` へ移す**
- ページは `contexts/<領域>/pages/` に置く。`contexts/shared/components/` は領域をまたぐ部品

## 案件のライフサイクル（旧「統合プロジェクトライフサイクル」）

- 旧 `opportunities` テーブルは廃止し、**単一 `projects` テーブル**に統合済み
- `stage`: `neta` → `d_hold` → `c_proposal` → `b_verbal` → `a_won` → `s_completed` / `e_lost`
- **`gls_number IS NULL` = ヨミ段階、`IS NOT NULL` = GLS発番済み**
- GLS発番は別エンドポイント: `POST /projects/:id/issue-gls`
- 案件分類は `gls_category`（`A`=スタジオ / `B`=ビジネス）。発番後の A↔B 切替は
  `PATCH /projects/:id/gls-category`（採番し直し＋エピソードコード＋BOX フォルダを追随）
- 費用按分は `project_groups` テーブル

## v4 で作り直す画面

案件管理8画面（ダッシュボード／受付／案件一覧／タスク一覧／見積・請求／案件詳細／標準工程／料金表）、
財務8画面、カレンダー4画面、設定7画面、プロジェクト管理7画面（新規）。
仕様は `docs/design/v4/` に画面ごとに切り出す（モック HTML を直接 grep しない）。

**v4 の設計判断（モックが明示しているもの）**
- **案件担当者という概念を持たない。** 誰が何をするかは**タスク単位**で表す
- 見積は明細をスタジオ／技術・人員／制作・その他の3グループで表示。行ごとに仕入（見込み）を持ち、
  **粗利率が30%を切ると赤くなるが保存は止めない**。値引きは単価を下げず別建て
- 値引き上限の超過は**保存を止めず「承認待ち」**にする（送付だけ止まる）
- **金額の同時編集は 409 で止める**（他の項目は同時編集可）

## 触るときの注意

- **シェルは共通** (`shared/src/client/shell/`)。残っているのは
  `components/layout/AppShell.tsx`・`nav.ts`（4つの入口ぶんのメニュー）・
  `GlobalSearch.tsx`（上辺バーに差し込む検索）だけ。**旧 `Header.tsx` / `Sidebar.tsx` は削除済み**。
  どの入口にいるかは `appOfPath()` が URL から判定する（`BLOCK_APPS` の前方一致は廃止）

- **1ファイル400行を上限にする。** いま超過しているもの:
  `contexts/sales/pages/ProjectFormPage.tsx` 2,178行 /
  `contexts/production/components/episodes/BusinessProjectView.tsx` 2,042行 /
  `contexts/finance/pages/RevenueListPage.tsx` 1,435行 /
  `contexts/platform/pages/HomePage.tsx` 1,313行
  → v4 で作り直すときに分割する（案件詳細は7タブなので7ファイルが自然）
- `src/components/ui/` は **`motion` / `animated-number` の2本以外すべて1行の再エクスポート**。
  実体は `shared/src/client/ui/`（F3 で `table` / `searchable-select` / `currency-input` /
  `scroll-area` を移した。`dropdown-menu` は参照0件だったので削除）。
  **新しい共通部品は `shared` に置くこと** — ここに実装を足すと他アプリから使えない
- **`motion` / `animated-number` だけ残してある**。`framer-motion` が案件管理にしか入っておらず、
  v4 は hover を色・罫線だけに絞り画面遷移も CSS で行う（`docs/design/v4/_tokens.md`）ため。
  **v4 の画面を作るときは使わない**（Phase 2 で整理する）
- `src/index.css` にアプリ固有 CSS が約200行（FullCalendar の上書き・サイネージ）。
  サイネージの色はトークン外の直書き
