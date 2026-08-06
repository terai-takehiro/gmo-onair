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

## v4 で作り直した画面（済み）

| 画面 | 置き場所 | 決めたこと |
| --- | --- | --- |
| ③ 案件一覧 | `contexts/sales/pages/ProjectListPage.tsx` ＋ `pages/projectList/` | 下記 |
| ④ タスク一覧 | `contexts/tasks/pages/TaskDashboardPage.tsx` ＋ `pages/taskList/` | 下記 |

**案件一覧（③）で決めたこと**
- **ボードは別画面をやめて「見え方」にした。** 旧 `/sales/pipeline`（`PipelinePage`）は削除し、
  `/sales/projects?view=board` へ転送する。別画面だと絞り込みが引き継げず、
  **別のエンドポイント**（`/dashboard/sales-board`）を叩いていたので
  一覧は確定売上・ボードは想定金額を合計していて数字が合わなかった
- **ステージのチップの件数は「ステージ以外の絞り込みだけ」を掛けて数える**
  （`GET /projects` の `stage_counts`）。全件の内訳を出すと、検索中に押した先が 0 件になる
- **`stage` はカンマ区切りで複数受ける**（「終了」= `s_completed,e_lost`）。
  知らないステージ名は**素通ししない**（絞り込みを指定したのに全件返ると気づけない）
- **バッジの文字は和文だけ**（`STAGE_BADGE_LABEL`）。「A 受注済」のまま入れると
  均等割り付けが効かず、色の塊の幅が行ごとに変わる
- **モックとの意図した違いが2つ**（理由は `pages/projectList/stages.ts` に書いてある）:
  ネタを「E 問合せ」に改名しない／「D 仮押さえ」を灰ではなく淡い青にする
- **「ネタ」の見え方は未実装。** モックのネタ表は入口（メール/電話）と確信（高/中/低）を
  列に持つが、**その2つは DB に無い**。引き合いを受け取るのは ② 受付なので一緒に作る

**タスク一覧（④）で決めたこと**
- **タスクの状態は4つ**（未着手／進行中／相手待ち／完了）。ただし**DB は2列に分けている**：
  `is_completed`（完了したか・**ここが正**）と `work_state`（完了していないときの止まり方）。
  1列に4値を持たせると「完了したか」が2か所になり、かんばん・ガント・MCP・依頼フロー・
  週報の集計のどれか1つが片方しか更新しない瞬間に食い違う。
  **画面は必ず `taskState()`（`pages/taskList/state.ts`）を通す**こと
- **「相手待ち」を足したのがこの版の中身。** これが無いと未完了タスクが全部同じ重さに見え、
  自分が止めているものが埋もれる。導出できない（`progress` からは出せない）ので列を足した
- **カンバンを畳んだ。** 旧「カンバン」は案件ごとの小さな板を縦に積み**各列5件まで**で、
  案件をまたいで見えていなかった。同じことは案件詳細の板のほうがよくできる
- **ガントは残した**（全案件の山を1枚で見る場所がここしかない）。
  ただし**中身は旧実装のまま**（`DashboardGantt/DashboardGanttView.tsx` 522行）。
  時間軸の描画は別の仕事なので、一覧の作り直しと混ぜていない
- **`invalidateTasks` は `task-dashboard` も落とす。** 案件の中のタスクと全案件の一覧は
  同じタスクを別の鍵で持っており、案件側だけ落としていたので**一覧から直しても一覧が古いまま**
  だった（反証試験で再現を確認済み）
- **チェックボックスは列にしていない。** 7段のいちばん狭い枠が 56px で 18px の四角には広すぎ、
  段を増やすと「その画面だけの幅」ができる。`RowMain` の中に入れてある

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
