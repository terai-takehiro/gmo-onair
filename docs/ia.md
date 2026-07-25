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

**この時点で残っている二重の入口**: 旧パス (`/sales/*` 等) と新パス (`/projects` 等) が両方生きている。
§3.3 のリダイレクトで旧→新に寄せるのは Phase 3。

### Phase 3 で消すもの

- `client` の二次ナビ (約40メニュー) → ⌘K に集約
- 旧パスを新パスへリダイレクト (仕様書 §3.3 の表)
- 移行期のグローバル検索 (`client/src/components/layout/GlobalSearchBox.tsx`) → コマンドパレットに統合

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
| API | `GET /search` (拡張) | コマンド・メニューを候補に含める | Phase 3 |
| API | `GET /dailyops/weekly-stats` (拡張) | 期限を守れた率・AIの無修正採用率 | Phase 12 |
| API | `GET /commands` または静的定義 | ⌘Kのコマンド一覧 (権限フィルタ) | Phase 3 |

タスク・投入・AI差分は既存 (migration 134 / 135) を使う。**新規テーブルは2つだけ**。
