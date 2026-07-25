# 情報設計 (IA) — 刷新前の事実と、刷新後の入口

UI/UX 刷新 (v2.9.251〜) の合意事項。**「入口は1つ」を判定するための基準表**。
新しいメニューを足したくなったら、まずこの表のどのレールに入るかを決める。入らないなら足さない。

---

## 1. 刷新前に起きていたこと (実装から数えた事実)

| 指標 | 数 |
| --- | --- |
| ブロックアプリ | 13 |
| サイドバーのメニュー | 60以上 (案件20 / 財務11 / 機材14 / 日常業務6 / カレンダー4 / 管理4 ほか) |
| アプリを切り替える入口 | **3つ** (`AppSwitcher` / 各Sidebar下部の `getAccessibleApps` / HomePage の `BLOCK_APPS`) |
| 1案件の情報が散っていた場所 | **7か所** (案件・売上・仕入・カレンダー・タスク・Qシート・技術資料) |

同じ画面が複数のメニュー行を占めていた例:

- `/sales/tasks/kanban|list|gantt` → 実体は `TaskDashboardPage` の view 切替 (メニュー3行)
- 取引先マスターが sales と budget の両方に出ていた (同一画面・2行)
- カレンダーが4本 (統合 / スタジオ / パートナー / マイ)
- 1画面しかないアプリがアプリとして独立していた (Qシート・技術資料・リアルタイムCG の navItems は1件)

`ProjectQuickLinks` が5本のリンクで散らばりを補っていたが、それは構造の問題を UI で埋めていただけ。

---

## 2. 刷新後の入口 = 共通レール6項目 + 設定

定義は `shared/src/client/shell/railItems.ts`。権限フィルタは `resolveRailItems()`。

| レール | 新ルート | 吸収した現行メニュー |
| --- | --- | --- |
| 今日 | `/today` | HomePage、`/sales/inbox`、AI起票の確認、`/daily/inquiries`、`/daily/finance` |
| 案件 | `/projects` | `/sales/projects`、`/sales/pipeline`、確定案件2種、`/sales/project-groups`、`/sales/gls-import` |
| タスク | `/tasks` | `/sales/tasks/{kanban,list,gantt}`、`/sales/projects/:id/tasks`、`/daily/tasks` |
| お客様 | `/customers` | `/sales/customers`、`/sales/customers/:id`、`/sales/companies`、内覧会の来場者 |
| 予定 | `/schedule` | `/studio/all`、`/studio/calendar`、`/studio/partners`、`/studio/my-calendar` |
| お金 | `/finance` | `/budget/*` 全て (ダッシュボード・売上・仕入・販管費・取込・レポート) |
| 設定 (レール下部) | `/settings` | `/admin/*`、各アプリのマスター画面 |

### レールに出さないもの

現場ツール (Qシート・技術資料・機材・計時LIVE・リアルタイムCG・翻訳・インタラクティブ) は
**レールに出さない**。到達経路は次の3つ:

1. **案件から開く (既定)** — 案件のタブ。開いた時点で案件・イベント・言語が入っている
2. **単発で開く** — ⌘K から。案件欄は空のまま進められる
3. **後から紐づける** — 単発の成果物は「まだ案件に紐づいていないもの」に残り、後で案件に付ける

---

## 3. 移行の状態 (フェーズごとに更新する)

### Phase 1 (v2.9.251) — 済

- 共通シェル (`shared/src/client/shell/`) を全7アプリに適用
- `AppSwitcher` (3×13グリッド) を**削除**
- 各アプリ Sidebar 下部の「他のアプリ」を**削除** (`appNav.ts` ごと削除)
- 各アプリの既存メニューは**二次ナビ (`secondaryNav`) に移設**
  → ⌘K が入る Phase 3 までメニューを到達可能に保つための一時措置
- レールの行き先 (`/today` 〜 `/settings`) を追加。中身は既存ページのまま
- `/settings` に設定の入口 (8グループ) を新設

### Phase 2 (v2.9.253 / v2.9.254) — 済

- `/today` が「今日」の画面に (あいさつ → AIに投げる → 待たせている行列 → 動いている案件 → 右列)
- 受信箱ページを行列に統合 (`/sales/inbox` → `/today`)
- 行列の全種別が開いた場所で終端に到達する
- v2.9.254 でデザインファイル (3a / 4a / 5a) と突き合わせて文言・書体・上辺を合わせた

### Phase 3 (v2.9.255) — 済

- **⌘K** (`shared/src/client/commandPalette/`) を全7アプリに配線。
  コマンド表は静的1ファイル (`commands.ts`) + 権限フィルタ。約70件。
- **上辺の中央がさがす場所**になった (⌘K の入口を兼ねる)。
  移行期のグローバル検索 (`GlobalSearchBox.tsx`) は**削除**。
- **§3.3 のリダイレクトを全部入れた** (36本)。新URLが正:
  `/projects` `/tasks` `/customers` `/schedule` `/finance` `/finance/import` `/settings/*`。
  表示の切り替えは**クエリ** (`?view=` `?filter=` `?scope=` `?layers=` `?tab=` `?tool=`)。
- 新URLを受けて既存の画面を出すのは `client/src/components/layout/routeAdapters.tsx`。
  画面そのものの作り直し (Phase 4〜8) はここの中身を差し替えるだけで済み、**URL は変わらない**。
- 行列がゼロのときは祝わず、「空いた時間でやるなら」を出す (6b)。

### Phase 3 の仕上げ (v2.9.256) — 済

- **`client` の二次ナビ (約40メニュー) を削除**。案件管理は **6レール + ⌘K** に一本化。
  削除前に「二次ナビの37の行き先が すべて ⌘K + レールで到達できる」ことを機械的に照合した
  (`to:` と `path:` の差分が0件)。
- 上辺をモバイル (375px) で成立させた: パンくずは下タブと重複するので `sm` 未満で出さない /
  `⋯` はユーザーメニューに畳む / ロゴを縮める。**二次ナビが残る6アプリ (ハンバーガーあり) でも
  ヘッダーが 375px に収まる**ことを実測。

現場アプリ (機材・Qシート・技術資料・計時LIVE・リアルタイムCG・日常業務) の二次ナビは残す。
あちらはレールの下の階層が本来の居場所で、作り直しは Phase 10〜12 の担当。

`/daily/tasks` → `/tasks?scope=me` の吸収は Phase 5 (いまは新URLが日常業務アプリへ送る一方向)。

### Phase 4 (v2.9.257 / v2.9.258) — 済

案件の一覧・ボード・確定案件の3画面を `/projects` に統合 (`?view=list|board` / `?filter=confirmed_*`)。
案件ワークスペースは「左=進める / 右=事実」の2カラムに組み直し、次の一手だけを主ボタンにした。

### Phase 5 (v2.9.259) — 済

タスクを `/tasks` 1画面に統合した。**スコープ (自分 / 案件 / 全体) × 表示形式 (リスト / ボード / ガント)** を
`?scope=` `?view=` `?project=` で切り替える。

| 旧 | 新 | 中身 |
| --- | --- | --- |
| `/sales/tasks/kanban` | `/tasks?scope=all&view=board` | 案件横断のかんばん |
| `/sales/tasks/list` | `/tasks?scope=all&view=list` | 案件横断のリスト |
| `/sales/tasks/gantt` | `/tasks?scope=all&view=gantt` | 案件横断のガント |
| `/sales/projects/:id/tasks` | `/tasks?scope=project&project=:id` | 1案件のタスク |
| `/daily/tasks` | `/tasks?scope=me` | 自分のタスク・依頼・投入ログ・9マス |

**なぜ統合が必要だったか**: 上の a) と b) は**同じ `project_tasks` の行**を案件軸と人軸で見ていたのに、
実装が2つのアプリに分かれていたため「期限超過」「今日が期限」が別々の画面に別々の実装で出ていた
(どちらが正か分からない)。`client-daily/src/pages/TasksPage.tsx` を
`client/src/contexts/tasks/pages/MyTasksPanels.tsx` に**移動** (コピーを残さない) して1本にした。

**表示形式の切り替えは1組だけ**: 移設した3画面はそれぞれ自前の切替を持っていたため、統合すると
同じ軸のボタンが2組並ぶ。`MyTasksTab` / `ProjectTasksPage` / `TaskDashboardPage` に `view` +
`onViewChange` (`embedded`) を追加し、渡されたときは内側のボタンを描かない。
自分スコープはボードの実体が9マスなのでラベルを「スコア順 / 9 マス」に差し替える。

**サーバー変更なし**。使うのは既存の `/dailyops/tasks/*` (自分・依頼・投入・チーム) と
`/task-dashboard` (案件横断) と `/projects/:id/tasks` (1案件) のみ。

---

## 4. 壊してはいけないもの

刷新の途中で URL や契約を変えると現場が止まる。次は**フェーズをまたいで維持する**:

- 既存URL (仕様書 §3.3 のリダイレクト表。削除せず残す)
- ICSフィードのURLとトークン (`studio_calendar_settings`)
- 音声サポートの公開URL (`/qsheet/audio/:docId` — 認証なしで開く)
- サイネージURL (`/signage/:roomId`)
- MCPのエンドポイントとツール名 (`/api/v1/mcp`・82種)
- 金額は税抜保持 / `billing_key` の採番規則 / GLS採番の `ON CONFLICT` 原子性
- 権限判定 (`hasPermission` と `LEVEL_ORDER`) と、案件メンバーによる可視判定 (権限とは別軸)

---

## 5. 新規に必要なもの (最小)

| 種類 | 名前 | 用途 | 状態 |
| --- | --- | --- | --- |
| テーブル | `external_tool_outputs` | 翻訳・インタラクティブ・CGの成果物 (`project_id` nullable) | Phase 12 |
| テーブル | `user_notification_prefs` | 通知の受け取り方 | Phase 9 |
| API | `GET /search` (拡張) | 案件に顧客名を同梱 (コマンド・メニューはクライアント側の静的表) | 済 (v2.9.255) |
| API | `GET /dailyops/weekly-stats` (拡張) | 期限を守れた率・AIの無修正採用率 | Phase 12 |
| API | `GET /commands` または静的定義 | ⌘Kのコマンド一覧 → **静的定義を採用** (`shared/src/client/commandPalette/commands.ts`) | 済 (v2.9.255) |

タスク・投入・AI差分は既存 (migration 134 / 135) を使う。**新規テーブルは2つだけ**。
