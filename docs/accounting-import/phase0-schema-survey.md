# Phase 0: 既存スキーマ調査レポート

**作成日**: 2026-05-11
**ブランチ**: `claude/accounting-schema-survey-0UOj3`
**対象リポジトリ**: `terai-takehiro/gmo-onair`
**作業者**: Claude Code
**目的**: 経理データ取込み機能（要件定義書 §4-§5）の実装着手前に、既存テーブル名・カラム名・型・制約・既存データ件数を棚卸しし、要件書の仮置き名と実コードのギャップを早期に解消する。

---

## 0. 結論サマリー（最初に読む）

| 要件書での仮置き | 実コードでの実名 | 備考 |
|---|---|---|
| `projects.gls_code` | **`projects.gls_number`** | TEXT UNIQUE、NULL=ヨミ段階 |
| `purchases.xpoint_no` | **`purchases.settlement_method` + `purchases.settlement_number`** | `settlement_method` が `xpoint` のとき `settlement_number` が XP 番号本体 |
| `sales`（売上） | **`revenues` + `revenue_items`** | 案件単位ヘッダー + 明細 1:N。`revenues.status` で `'confirmed' / 'estimate'` 区別 |
| ベンダーマスタ | **`vendors`** + **`companies`** | v2.x で `companies` に統合中（移行途中。両者並走） |
| 勘定科目マスタ | **無し** | Layer B として `accounting_chart_of_accounts` を新設する必要あり |
| タグマスタ | **無し（経理側タグ概念は未導入）** | `accounting_tags` を新設する |
| 監査ログ | **無し** | `accounting_audit_log` を新設する |
| 予算マスタ（月次/案件別） | **無し（独立した予算テーブルは存在しない）** | 現状の "予算" は revenues / purchases / sga_expenses に直接入力するスタッフ起票データそのもの。経理 CSV は同じテーブル群と直接突合する設計が自然 |
| `sga_expenses.source` | **既に存在**（`'staff'` / `'accounting'`） | Layer B 経由で `'accounting'` 値を発行する経路として再利用候補 |

**重要な前提認識の修正**:
- 要件書 §1.3 で「予算(従来から管理) vs 実績(今回追加)」とあるが、現状の DB に**独立した予算テーブルは存在しない**。`revenues` / `purchases` / `sga_expenses` のレコード自体が「スタッフ起票の予算/実績見込み数値」として運用されており、`status='estimate'` の revenues 行が概算見積（=広義の予算）に相当する。
- ただし `sga_expenses` には `source` 列が既にあり `'staff'` / `'accounting'` を区別できる。**売上・仕入にも同じ `source` 列を増設**することで、(a) スタッフが起票した予測値 vs (b) 経理 CSV 由来の実績値、を同一テーブル内で並走させる選択肢がある。Phase 1 で寺井さんに方針確認したい。
- もう一つの選択肢は、要件書の Layer A/B/C 設計（経理データを独立テーブル群に保持し VIEW でマージ表示）をそのまま採用する案。**Phase 1 着手前に確認したい論点。**

---

## 1. リポジトリ構造（経理データ取込みに関連する範囲）

```
server/src/
├── shared/db/
│   ├── connection.ts          ← pg.Pool + `?` を `$N` に変換する薄いラッパー
│   ├── migrate.ts             ← `_migrations` テーブルで履歴管理、001b〜085 まで適用済
│   ├── migrations/*.sql       ← 86 ファイル（001b〜085）
│   └── seed.ts                ← dev 用 seed（本番では SKIP_SEED=true）
├── shared/middleware/auth.ts  ← requireAuth + requirePermission(module, level)
├── shared/utils/excel-resource.ts ← 既存 Excel I/O 共通フレームワーク（参考になる）
├── shared/services/box.ts     ← Box SDK ラッパー（将来の CSV 保管に使える）
└── contexts/
    ├── platform/   ← auth/users/dashboard/data-viewer/db-backups
    ├── sales/      ← projects/customers/companies/pricing/project-groups
    ├── production/ ← episodes/invoice-groups/studio
    ├── finance/    ← revenues/purchases/sga/vendors/partners + excel ★主要連携先
    └── ...

client/src/
├── App.tsx                     ← React Router 定義
├── components/layout/
│   ├── Sidebar.tsx             ← 5 タブ（sales/budget/studio/equipment/admin）
│   └── Header.tsx              ← パンくず + アプリ切替
└── contexts/
    ├── finance/pages/
    │   ├── BudgetDashboardPage.tsx     ← 月次サマリー（202行）★追加予定
    │   ├── BudgetDetailPage.tsx        ← 月×案件詳細テーブル（346行）★追加予定
    │   ├── RevenueListPage.tsx
    │   ├── PurchaseListPage.tsx
    │   ├── SgaListPage.tsx
    │   ├── VendorListPage.tsx
    │   └── PartnerListPage.tsx
    └── ...
```

### 1.1 マイグレーション履歴
- ファイル数: 86（`001b` から `085` まで）
- 命名規則: `NNN_description.sql`（3 桁ゼロ詰め）
- 実行管理: `_migrations` テーブル（PK=ファイル名, executed_at）
- トランザクション: 1 ファイル = 1 トランザクション（migrate.ts の BEGIN/COMMIT）
- 冪等性: 既存マイグレーションは `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` を多用
- **本機能の新規マイグレーションは `086_accounting_import_layer_a.sql` から開始**することを推奨

### 1.2 API ルート構成
- 全エンドポイントは `/api/v1/internal/...` プレフィックス（app.ts:66）
- 認証: `createAuthMiddleware()` → Cookie / Bearer の二重対応
- 権限: `requirePermission('module', 'level')` ミドルウェアでモジュール × アクセスレベルの組
- 既存モジュール: `sales` / `budget` / `studio` / `equipment` / `admin` / `qsheet` / `techsheet` / `interactive` / `awards` / `liveops`
- **本機能の権限**: `budget` モジュールの `editor` 以上（既存 finance 系と同レベル）を再利用するのが最も自然。管理者向け操作（バッチ廃棄 = `supersede` 等）は `budget` の `manager` レベルを要求する形が現行の慣行に合う。新規モジュール `accounting` を切る必要は薄い（要件書 §7.2 は再検討余地あり）

### 1.3 既存の Excel I/O フレームワーク（参考）
`server/src/shared/utils/excel-resource.ts` に汎用 Excel 入出力ハンドラがある。`ResourceConfig` を渡すと `/template` / `/import` / `/export-xlsx` の 3 エンドポイントを生成。

- multer の `memoryStorage` + `fileSize: 5MB` 制限
- `xlsx` パッケージ（v0.18.5）でパース
- バリデーション → INSERT/UPDATE をトランザクション内で実行
- **本機能でも CSV パーサ部以外（multer 設定、認証、トランザクション境界）は流用可能**

### 1.4 CSV パース / CP932 デコード
- 現状の依存に `csv-parse` / `iconv-lite` / `papaparse` は**含まれていない**
- 既存 Excel I/O は `xlsx` パッケージのみ
- **本機能で新規追加が必要なパッケージ**:
  - `csv-parse` （RFC 4180 準拠、セル内改行対応）
  - `iconv-lite` （CP932/Shift_JIS → UTF-8 デコード）

---

## 2. 既存スキーマ詳細（経理 CSV と連携するテーブル）

### 2.1 `projects` — 案件マスタ（最重要）

**マイグレーション**: `001b_postgresql_schema.sql` + 002 + 074
**ファイル**: `server/src/shared/db/migrations/001b_postgresql_schema.sql:104-131`

| カラム | 型 | 制約 | 経理連携での役割 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID 文字列。FK で参照される |
| `code` | TEXT | NOT NULL UNIQUE | 内部コード（GLS 発番前のヨミ段階にも採番される） |
| `gls_number` | TEXT | **UNIQUE（NULL 可）** | **★ 経理 CSV 摘要欄から抽出した `GLS\d+` と突合する主キー** |
| `name` | TEXT | NOT NULL | 案件名（CSV にはない、表示用） |
| `customer_id` | TEXT | NOT NULL FK→customers | |
| `stage` | TEXT | CHECK | `neta`/`d_hold`/`c_proposal`/`b_verbal`/`a_won`/`s_completed`/`e_lost` |
| `project_type` | TEXT | DEFAULT 'other' | |
| `expected_amount` | INTEGER | DEFAULT 0 | 想定金額（≠ 実績） |
| `event_start` / `event_end` | TEXT (YYYY-MM-DD) | | 案件期間（取引日との突合に使用） |
| `assigned_to` | TEXT | NOT NULL FK→users | |
| `tags` | TEXT | DEFAULT '' | カンマ区切り文字列 |
| `lessons_learned` | TEXT | (migration 002) | 失注教訓 |
| `lost_at` | TEXT | (migration 002) | 失注日 |
| `created_at` / `updated_at` | TIMESTAMP | DEFAULT NOW() | |
| `deleted_at` | TIMESTAMP | | ソフトデリート |

**インデックス**: `idx_projects_gls`（部分: `gls_number IS NOT NULL`）、`idx_projects_stage`、`idx_projects_assigned`、`idx_projects_customer`

**ポイント**:
- **カラム名は `gls_code` ではなく `gls_number`**（要件書の最重要訂正点）
- `gls_number` は **TEXT UNIQUE NULL 可**。ヨミ段階は `NULL`、発番後は `GLS127`, `GLS148` 等の文字列
- 経理 CSV 摘要欄から `GLS\d{3,}` で抽出した文字列を `projects.gls_number = ?` で**完全一致 JOIN**可能
- ハイフン許容（`GLS-127` 等）の正規化はアプリ側で行う必要あり

**追加で必要な列（経理連携用）**: 無し。`gls_number` UNIQUE 制約があるので案件単位の集計はそのままできる。

---

### 2.2 `revenues` — 売上ヘッダー

**マイグレーション**: 001b + 003（subtitle）+ 004（status）+ 058（is_advance_payment）+ 066（invoice_issued）+ 073/075
**ファイル**: `server/src/shared/db/migrations/001b_postgresql_schema.sql:193-212` ほか

| カラム | 型 | 制約 | 経理連携での役割 |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | UUID |
| `billing_key` | TEXT | | 課金キー（`{GLSxxx}-{episode}-{1\|2}` 形式、scaffold は service で生成） |
| `project_id` | TEXT | NOT NULL FK→projects | |
| `episode_id` | TEXT | FK→episodes（NULL 可） | |
| `customer_id` | TEXT | NOT NULL FK→customers | |
| `assigned_to` | TEXT | | |
| `tax_category` | TEXT | CHECK('tax10','tax8','exempt') | デフォルト `tax10`。経理 CSV の `課売 10%` 等と相互変換が必要 |
| `amount` | INTEGER | NOT NULL DEFAULT 0 | revenue_items の合計と同期（075 で UPDATE） |
| `recognition_date` | TEXT (YYYY-MM-DD) | | **★ 計上日。経理 CSV の取引日との突合に使用** |
| `billing_date` | TEXT | | |
| `payment_due_date` | TEXT | | |
| `subtitle` | TEXT | (migration 003) | 明細サブタイトル |
| `status` | TEXT | NOT NULL DEFAULT 'confirmed' | **★ `'confirmed'` / `'estimate'` を区別**。経理由来は `'confirmed'` 固定でよい |
| `is_advance_payment` | BOOLEAN | DEFAULT FALSE | |
| `invoice_issued` | BOOLEAN | DEFAULT FALSE | |
| `group_id` | TEXT | FK→project_groups | (migration 006) 按分グループ |
| `notes` | TEXT | | |
| `created_at` / `updated_at` / `deleted_at` | | | |

**インデックス**: `idx_revenues_project`（deleted_at IS NULL）、`idx_revenues_episode`、`idx_revenues_group`

**ポイント**:
- 要件書の "売上(`sales`)テーブル" は**実名 `revenues`**
- `revenues.status = 'confirmed'` がデフォルトの集計対象（`BudgetDashboardPage` / `monthly-summary` API は `status='confirmed'` でフィルタ）
- `revenue_items` 明細テーブル（後述）と 1:N。`amount` は明細合計と一致するよう migration 075 で同期済み
- 按分は `revenue_allocations` テーブルで管理（migration 006）

---

### 2.3 `revenue_items` — 売上明細

**マイグレーション**: 001b + 073
**ファイル**: `001b_postgresql_schema.sql:302-313`

| カラム | 型 | 制約 |
|---|---|---|
| `id` | TEXT PK | |
| `revenue_id` | TEXT NOT NULL FK→revenues | |
| `description` | TEXT NOT NULL | |
| `quantity` / `unit_price` / `amount` | INTEGER DEFAULT 0 | |
| `pricing_item_id` | TEXT FK→pricing_items | |
| `sort_order` | INTEGER DEFAULT 0 | |
| `period_start` / `period_end` / `item_notes` | TEXT (073) | 御見積書 PDF 用 |

**経理連携での扱い**: 直接の突合対象ではない（経理 CSV は明細単位の情報を持たない）。集計時は `revenues.amount` を使えば十分。

---

### 2.4 `purchases` — 仕入

**マイグレーション**: 001b + 005（group_id）+ 058（is_provisional）+ 060（service_completed_date）
**ファイル**: `001b_postgresql_schema.sql:214-238`

| カラム | 型 | 制約 | 経理連携での役割 |
|---|---|---|---|
| `id` | TEXT PK | | |
| `billing_key` | TEXT | | |
| `project_id` | TEXT | NOT NULL FK→projects | |
| `episode_id` | TEXT | FK→episodes | |
| `vendor_id` | TEXT | NOT NULL FK→vendors | |
| `assigned_to` | TEXT | | |
| `settlement_method` | TEXT | CHECK('rakuraku','xpoint','other') | **★ XP 番号は `xpoint` のとき** |
| `settlement_number` | TEXT | | **★ XP 番号本体（`128221` 等の数字列）。経理 CSV 摘要欄 `XP\d{6,}` と突合** |
| `external_ref_id` | TEXT | | 現状未使用（コード grep の結果 001b にのみ存在）。将来用に確保されている |
| `tax_category` | TEXT | CHECK | |
| `invoice_qualified` | INTEGER | DEFAULT 1 | 適格請求書フラグ |
| `amount` | INTEGER | NOT NULL DEFAULT 0 | |
| `description` | TEXT | | |
| `recognition_date` | TEXT (YYYY-MM-DD) | | **★ 計上日** |
| `inspection_date` | TEXT | | 検収日 |
| `payment_due_date` | TEXT | | |
| `service_completed_date` | DATE | (migration 060) | 役務提供完了日 |
| `is_provisional` | BOOLEAN | DEFAULT FALSE (058) | |
| `group_id` | TEXT | FK→project_groups (005) | 按分グループ |
| `notes` | TEXT | | |

**インデックス**: `idx_purchases_project`、`idx_purchases_episode`、`idx_purchases_group`

**ポイント**:
- 要件書の "`purchases.xpoint_no`" は**実体として `settlement_number`**（`settlement_method='xpoint'` の行に限る）
- 既存の `external_ref_id` は完全に空席なので、経理側ベンダーコード / 取引 No など別キーの保存に転用可能（要 Phase 1 設計判断）
- XP 番号での突合 SQL 例:
  ```sql
  SELECT p.id, p.amount, p.project_id, pj.gls_number
  FROM purchases p
  JOIN projects pj ON pj.id = p.project_id
  WHERE p.settlement_method = 'xpoint'
    AND p.settlement_number = $1  -- 摘要から抽出した XP 番号（"128221" 等）
    AND p.deleted_at IS NULL;
  ```

---

### 2.5 `sga_expenses` — 販管費

**マイグレーション**: 001b + 063（vendor_id は 001b 時点で既存）
**ファイル**: `001b_postgresql_schema.sql:240-267`

| カラム | 型 | 制約 | 経理連携での役割 |
|---|---|---|---|
| `id` | TEXT PK | | |
| `billing_key` | TEXT NOT NULL | | `{YYYYMMDD}-{1\|2}` 形式 |
| `assigned_to` | TEXT | | |
| `settlement_method` | TEXT | CHECK('xpoint','rakuraku','other') | |
| `settlement_number` | TEXT | | |
| `vendor_name` | TEXT NOT NULL | | 文字列直入力（vendor_id が NULL の場合の表示用） |
| `vendor_id` | TEXT | FK→vendors（NULL 可） | |
| `description` | TEXT | | |
| `expense_type` | TEXT | CHECK('fixed','spot') DEFAULT 'spot' | 固定費 / スポット |
| `source` | TEXT | **NOT NULL DEFAULT 'staff' CHECK('staff','accounting')** | ★★ **既に経理由来を区別できる列が存在** |
| `recognition_date` | TEXT (YYYY-MM-DD) | | |
| `payment_due_date` | TEXT | | |
| `amortize_start` / `amortize_end` | TEXT | | 償却期間 |
| `tax_category` | TEXT | CHECK | |
| `invoice_qualified` | INTEGER | DEFAULT 1 | |
| `amount` | INTEGER | NOT NULL DEFAULT 0 | |
| `notes` | TEXT | | |

**インデックス**: `idx_sga_recognition`

**重要発見**: `source` 列がすでに `'staff'` / `'accounting'` を区別している。**経理 CSV 由来の販管費は `source='accounting'` で書き込めば、既存 UI のフィルタ（`SgaListPage` で `source` クエリ対応済）で自然に分離表示できる**。これを売上 (`revenues`) / 仕入 (`purchases`) にも展開する設計が最も整合的（後述 §6 で論点として提示）。

---

### 2.6 `vendors` — 仕入先

**マイグレーション**: 001b + 035（contact 拡張）+ 061（company_id 追加）
**ファイル**: `001b_postgresql_schema.sql:38-53`

| カラム | 型 | 制約 |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | |
| `contact_name` / `email` / `phone` / `address` | TEXT | |
| `vendor_type` | TEXT | |
| `invoice_registration_number` | TEXT | **★ T で始まる適格事業者番号。経理 CSV の "インボイス" 列との連携余地** |
| `company_id` | TEXT FK→companies | (061) |
| `notes` | TEXT | |
| `created_at` / `updated_at` / `deleted_at` | | |

**経理連携での扱い**:
- 経理 CSV の「相手取引先」列は `"201414 GMOあおぞらネット銀行株式会社"` のような `{コード} {社名}` 表記
- 先頭の数字コード（4-6 桁）は経理側ベンダーコード。**現状 ONAiR 側に保存場所がない**
- 設計選択肢: (A) `vendors` に `accounting_vendor_code TEXT` を追加、(B) 別表 `accounting_vendors` を新設して `vendor_id` で関連付け
- ファジーマッチ用に PostgreSQL `pg_trgm` 拡張の導入が必要（既存 migration には無し）

---

### 2.7 `companies` — 統合取引先（顧客 + 仕入先 + 販管費支払先）

**マイグレーション**: 061 + 063
**ファイル**: `server/src/shared/db/migrations/061_companies.sql`

| カラム | 型 | 制約 |
|---|---|---|
| `id` | TEXT PK | |
| `name` | TEXT NOT NULL | |
| `short_name` / `contact_name` / `email` / `phone` / `address` | TEXT | |
| `is_customer` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `is_vendor` | BOOLEAN NOT NULL DEFAULT FALSE | |
| `is_sga_payee` | BOOLEAN NOT NULL DEFAULT FALSE | (063) 販管費支払先 |
| `vendor_type` / `invoice_registration_number` / `notes` | TEXT | |

**ポイント**:
- 061 で `customers` と `vendors` から `companies` を 1 対 1 で複製生成済み
- 旧 `customers.company_id` / `vendors.company_id` は nullable FK として追加されている
- **どちらが正本か**は移行途上のため、Phase 1 着手前に寺井さんに確認が必要（経理 CSV 由来のベンダーは `companies` 側に書くべきか `vendors` 側に書くべきか）

---

### 2.8 `project_groups` / `project_group_members` / `revenue_allocations` / `purchase_allocations` — 案件按分

**マイグレーション**: 005 + 006
**ファイル**: `server/src/shared/db/migrations/005_project_groups.sql`, `006_revenue_allocations.sql`

| テーブル | 用途 |
|---|---|
| `project_groups` | 按分用の案件グループ（id, name, description） |
| `project_group_members` | (group_id, project_id) M:N |
| `revenue_allocations` | revenue を複数案件に按分（id, revenue_id, project_id, allocated_amount） |
| `purchase_allocations` | purchase を複数案件に按分（同上） |

**ポイント**:
- 既に**スタッフ起票データに対する按分機構が存在**。要件書 §4.5.3 で提案している `accounting_allocation_rules`（共通費の自動按分ルール）と一部役割が重なる
- ただし `revenue_allocations` / `purchase_allocations` は**金額単位で行を増やす**運用なので、経理 CSV の生データを変更せずに動的計算で按分するという要件書の方針と直接は整合しない
- 設計上の合流ポイント: 経理由来の `purchase` 行（つまり `purchases.source='accounting'` の行 — `source` 列追加が必要）に対して、既存の `purchase_allocations` を流用する形でも按分はできる。逆に Layer C として別表で持つこともできる。**Phase 1 で寺井さんと方針確認したい**

---

### 2.9 `users` / `user_permissions` — 認証・権限

**マイグレーション**: 001b + 028（認証拡張）+ 010（権限）+ 047/048/049/050（正規化）
**ファイル**: `001b_postgresql_schema.sql:10-20`, `028_auth_system.sql`, `010_user_permissions.sql`

```sql
-- users
id, name, email UNIQUE, role CHECK IN ('system_admin','staff'),
password_hash, phone, status, invitation_*, last_login_at,
created_at, updated_at, deleted_at

-- user_permissions
id, user_id FK→users, module TEXT, access_level CHECK('reader','editor','manager'),
UNIQUE(user_id, module)
```

**現行モジュール一覧** (`migrations/050` より):
`sales` / `budget` / `studio` / `equipment` / `qsheet` / `techsheet` / `interactive`
（`admin` は role='system_admin' で判定、`awards` / `liveops` は別途付与）

**経理機能の権限設計案**:
- 新規モジュールを切らず、**既存 `budget` モジュール**で運用するのが最も自然（要件書 §7.2 と異なる方針）
- 編集系（バッチ確定・フィールド編集・GLS 紐付け補正）→ `budget` の `editor` 要求
- 管理系（バッチ廃棄=supersede・按分ルール作成）→ `budget` の `manager` 要求

---

### 2.10 `_migrations` — マイグレーション履歴管理

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  executed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**現在の最終マイグレーション番号**: 085（`085_drop_uq_fixed_asset_code.sql`）
**本機能の新規マイグレーション**: **086 以降に採番** (`086_accounting_import_layer_a.sql` を提案)

---

### 2.11 監査ログテーブル — **存在しない**

`grep -rln "audit\|audit_log"` で migration ヒット 0 件。**Layer C の編集監査ログ（要件書 §4.5）は新規に `accounting_audit_log` を作成する必要あり**。

---

## 3. 既存 API エンドポイント（経理機能と関連）

### 3.1 月次サマリー
- **GET `/api/v1/internal/monthly-summary?month=YYYY-MM&project_id=...`** （`server/src/contexts/finance/index.ts:15-84`）
- 戻り値: `{ month, revenue_total, purchase_total, gross_profit, sga_total, operating_profit }`
- `revenues.status = 'confirmed'` で実績のみ集計
- 按分: `group_id IS NULL` の直接行 + `revenue_allocations` / `purchase_allocations` 由来を合算
- 販管費は案件絞り込み時は 0 を返す

→ 経理 CSV 取込み後の "予算 vs 実績" 比較画面では、このエンドポイントを (a) スタッフ起票のみ、(b) 経理由来のみ、(c) マージ、で切り替えられるよう拡張する必要がある。

### 3.2 一覧系
- **GET `/revenues`**, **GET `/purchases`**, **GET `/sga`** — `recognition_month=YYYY-MM` で月絞り込み可能。`status` クエリ（revenues）、`source` クエリ（sga）対応済
- これらは既存 `BudgetDetailPage`（`/budget/detail`）で利用されている

### 3.3 Excel I/O
- `/revenues/excel/template` / `/revenues/excel/import` / `/revenues/excel/export-xlsx` ほか
- `server/src/contexts/finance/routes/excel.routes.ts` + `shared/utils/excel-resource.ts`
- **CSV インポートは現状ゼロ**。新規実装。

### 3.4 Box 連携
- `server/src/shared/services/box.ts` — Box SDK ラッパー（JWT 認証、`isBoxConfigured()` で構成チェック可）
- 既存利用: `awards-box.service.ts`（写真ミラー）、`box-folder.service.ts`（案件フォルダ自動生成）
- **将来の経理 CSV アーカイブ保存に流用可能**。`accounting_import_batches.source_box_file_id` カラムへの保存はそのまま実装できる

---

## 4. クライアント側既存画面（経理機能と関連）

### 4.1 既存「予算管理」セクション（`/budget/...`）

**`client/src/components/layout/Sidebar.tsx:87-116`** より:

```
予算管理 (budget タブ)
├── 予算ダッシュボード (/budget/dashboard) — 月次サマリー KPI
├── 収支
│   ├── 売上管理 (/budget/revenues)
│   ├── 仕入管理 (/budget/purchases)
│   ├── 販管費 (/budget/sga)
│   └── 案件月別詳細 (/budget/detail)
├── マスター
│   ├── 取引先マスター (/sales/companies)
│   ├── 仕入先 (/budget/vendors)
│   └── パートナー (/budget/partners)
└── レポート
    └── 仕入先集計 (/budget/reports/vendors)
```

**経理機能の追加候補位置**:
- サイドバー新セクション「経理データ」を追加（既存「収支」の下）:
  - `/budget/accounting/import` — 経理インポート
  - `/budget/accounting/batches` — 取込みバッチ一覧
  - `/budget/accounting/unresolved` — 未マッピング対応
  - `/budget/accounting/pl` — 月次 P/L
  - `/budget/accounting/compare` — 予算 vs 実績
- 既存「予算ダッシュボード」「案件月別詳細」には**実績列を追加**する形（既存 UI 構造を維持）

### 4.2 主要 React コンポーネント
- 既存 `KpiCard` / `SectionCard` / `EmptyState` / `DashboardHeader`（`shared/src/client/dashboard/`）を再利用
- `SearchableSelect` / `Table`, `TableHeader` 等の shadcn/ui ベースコンポーネント（`client/src/components/ui/`）が揃っている
- Excel I/O ダイアログは既存 `ExcelImportDialog`（client-equipment 等で参考実装）あり

---

## 5. 既存データ件数（参考）

**注意**: 本リポジトリは dev/prod 両方に展開されており、Phase 0 では実 DB に接続できない（VPS 側でしか確認できない）。代わりに `seed.ts` から dev 環境の投入規模を確認:

| テーブル | dev seed 件数（概算） | 本番件数 | 確認方法 |
|---|---|---|---|
| `projects` | ~30（A 系 8 + B 系 3 + OPP 系 8 + 失注 ~10） | 不明 | 本番 DB query 必要 |
| `revenues` | ~20 行 | 不明 | 同上 |
| `purchases` | ~40 行 | 不明 | 同上 |
| `sga_expenses` | ~30 行 | 不明 | 同上 |
| `customers` / `vendors` | 各 ~10 件 | 不明 | 同上 |
| `companies` | seed = customers + vendors の合算（migration 061 で生成済） | | |
| `pricing_items` | 65 件（migration 065） | 65 件 | masters |

**本番件数の取得方法**:
```bash
# VPS 上で実行
docker exec gmo-onair-app_prod-1 node -e "
  const { initDb, queryOne } = require('/app/server/dist/shared/db/connection.js');
  (async () => {
    await initDb();
    for (const t of ['projects','revenues','purchases','sga_expenses','vendors','companies']) {
      const r = await queryOne(\`SELECT COUNT(*) AS c FROM \${t} WHERE deleted_at IS NULL\`);
      console.log(t, r.c);
    }
  })();
"
```

**取得を寺井さんにお願いしたい** — Phase 1 の「データ移行手順策定」(要件書 §11) に必要。

---

## 6. 要件書からの逆提案（実装着手前に確認したい論点）

要件書 §11 「実装上より良い方法が見つかった場合は Phase 0 のレポートで逆提案してよい」に基づき、以下を提示します。

### 6.1 【論点 A】 経理由来データの保存先 — Layer A 独立 vs `source` 列拡張

**要件書の提案 (Layer A/B/C 3 層モデル)**: 経理 CSV を `accounting_pl_lines_raw` / `accounting_ledger_entries_raw` に保持し、`revenues` / `purchases` / `sga_expenses` には直接書かない。

**既存設計の発見**: `sga_expenses.source = 'accounting'` という値が既に運用されている。これは経理由来データを既存テーブル内に統合する設計の先例。

**逆提案 (A 案)**: 元帳生データは独立テーブル（`accounting_ledger_entries_raw`）にアーカイブ保存し、**マッピング解決後に `revenues` / `purchases` / `sga_expenses` へ "shadow row" として INSERT**。`source='accounting'` で区別し、`accounting_ledger_entry_id` を FK として持つ。これにより:
- 既存 BudgetDashboardPage / BudgetDetailPage / monthly-summary API が**ほぼ無改修**で経理由来データを集計可能（`source` フィルタを足すだけ）
- 「予算 vs 実績」画面は `source` で `staff` / `accounting` を分けて集計
- 編集（Layer C）は新規 `accounting_overrides` テーブルではなく、既存テーブルに対する通常の UPDATE（編集履歴は別途 `accounting_audit_log` に記録）
- 不変アーカイブとしての Layer A は引き続き保持（再取込み時の整合性チェック・差分検出用）

**B 案（要件書通り）**: Layer A/B/C を完全独立テーブルで持ち、表示は VIEW でマージ。既存予算管理 UI は VIEW に切り替える必要がある。

→ **どちらにするか Phase 1 着手前に方向性を確認したい**。A 案の方が既存実装との連続性は高いが、要件書 §4.1 の「Layer A は不変」「Layer C は追記オンリー」という原則の純度は B 案の方が高い。

### 6.2 【論点 B】 損益計算書 (P/L) スナップショットの扱い

P/L は集計済みデータ（勘定×補助×月）であり、総勘定元帳の明細を再集計すれば理論上は P/L を再現できる。

**選択肢**:
- (1) 要件書通り `accounting_pl_lines_raw` として P/L 行も生データ保持。CSV 配置構造をそのまま画面に再現する目的では必須
- (2) 元帳のみ生データ保持し、P/L は VIEW として動的集計
- (3) ハイブリッド: P/L は生データ保持しつつ、画面表示は「P/L 原本」と「元帳集計（再計算）」を切り替えられる UI

→ 要件書 §10「P/L 表示画面で CSV の階層構造が正しく再現されること」を厳密に解釈すると (1) が必要。**この方針で進めることを確認**。

### 6.3 【論点 C】 権限モジュール — 新規 `accounting` を切るか既存 `budget` を再利用するか

**逆提案**: 既存 `budget` モジュールを拡張して `editor` / `manager` でレベル制御する方が**運用上のシンプルさで勝る**。

理由:
- 既存ユーザーへの権限再付与作業が不要
- 「予算」と「経理」は機能上ほぼ重なる（経理データを見られる人 = 予算管理者）
- Sidebar の物理位置も既存「予算管理」セクション内に置く前提

→ Phase 1 で寺井さんに確認したい。

### 6.4 【論点 D】 既存テーブル `external_ref_id` の活用

`purchases.external_ref_id` が 001b 時点で定義済みだが現コードでは未使用（grep ヒット 0 件）。

**逆提案**: 経理 CSV 由来データの `voucher_no + line_seq` 連結文字列（例: `26022001-3`）をこの列に書き込み、`purchases` から元帳生データへの逆引きキーとして活用。新規列追加を最小化できる。

### 6.5 【論点 E】 ファジーマッチ用 `pg_trgm` 拡張の事前有効化

要件書 §9.6 でベンダー名のファジーマッチに `pg_trgm` が必要とあるが、既存 migration には拡張有効化命令がない。

**確認事項**: 本番 PostgreSQL クラスタで `CREATE EXTENSION pg_trgm` の権限があるか、または別案（Node.js 側で文字列類似度を計算）を採るか、寺井さんに確認。

### 6.6 【論点 F】 CSV パース・CP932 デコードの依存追加

新規追加が必要なパッケージ:
- `csv-parse` (^5.x) — RFC 4180 準拠
- `iconv-lite` (^0.6.x) — CP932/Shift_JIS → UTF-8

両者とも MIT/BSD ライセンスで、既存依存（multer / xlsx / pg）と競合なし。**Phase 1 開始時に server/package.json へ追加**して問題ないか確認。

### 6.7 【論点 G】 Layer B の物理テーブル化 vs VIEW 化

要件書 §4.4 で `accounting_pl_lines_resolved` / `accounting_ledger_resolved` を「VIEW or 物理テーブル」と曖昧記述。

**逆提案**: Phase 2 では**物理テーブル + 再生成 ETL** で実装する。理由:
- 解決ロジックが複雑（GLS 配列 → projects 複数行 JOIN、ベンダー fuzzy match）で VIEW として書くと SQL が肥大化
- ETL を冪等にすれば再生成は安全
- インデックスを張れるのでクエリ性能が出る

VIEW 化は Phase 4 の「アプリ表示用 VIEW」（`v_accounting_pl` / `v_accounting_ledger` / `v_accounting_project_actuals`）に絞る。

### 6.8 【論点 H】 取込みファイルの一時保管

CSV ファイル本体（バイナリ）の保管先:
- (a) DB 内に `accounting_import_batches.source_file_bytea BYTEA` で永続化（最大 5MB 想定なら DB 内で問題なし）
- (b) Box にミラー（既存の `box.ts` を流用）
- (c) サーバーローカル（コンテナ揮発、本番では消える）

**逆提案**: (a) + (b) のハイブリッド。DB 内に BYTEA で残し、Box には監査用にミラー。`accounting_import_batches.source_box_file_id` が成功時のみ埋まる。

---

## 7. Phase 1 着手前に寺井さんに確認したい質問（優先度順）

1. **【最重要】論点 A**: 経理由来データを既存テーブル (`revenues`/`purchases`/`sga_expenses`) に `source='accounting'` で書く案（A 案） vs 要件書通り独立テーブル + VIEW でマージ案（B 案）、どちらで進めるか？
2. **論点 C**: 権限は既存 `budget` モジュールを拡張する形でよいか？（新規 `accounting` モジュールは作らない）
3. **論点 E**: 本番 PostgreSQL で `CREATE EXTENSION pg_trgm` を実行する権限があるか？無ければファジーマッチは JS 側実装に切り替え。
4. **論点 H**: 取込み CSV 原本を DB BYTEA に保管してよいか？（最大 5MB / 月）
5. **企業マスタ**: 経理 CSV 由来のベンダーは `vendors` 側に書くべきか、`companies` 側に書くべきか？（移行途上のため）
6. **本番件数**: §5 のクエリで本番 DB の `projects` / `revenues` / `purchases` 件数を教えていただけるか（データ移行手順策定のため）。
7. **既存 `sga_expenses.source='accounting'`**: 現状この値で書かれている行があるか？あればどんな経路で投入されているか？（手動 SQL? 別ツール?）

---

## 8. Phase 1 着手時のチェックリスト（このレポートのレビュー承認後）

- [ ] 論点 A〜H の方針確定
- [ ] `086_accounting_import_layer_a.sql` migration ファイル名で着手
- [ ] `csv-parse` / `iconv-lite` を `server/package.json` に追加
- [ ] サンプル CSV 2 ファイル（2026/03 損益計算書 + 総勘定元帳）を `docs/accounting-import/samples/` 配下に置いてもらう（暗号化前提、または検証データに置換）
- [ ] 命名規則: テーブル接頭辞は `accounting_` で統一（既存 `awards_` / `equipment_` / `liveops_` 等の慣行に従う）
- [ ] ID 型: 既存テーブルとの整合性確保のため、UUID 文字列 (`gen_random_uuid()::text`) を採用（要件書 §4.3 の `BIGSERIAL` は変更）
- [ ] タイムスタンプ型: 既存テーブルが `TIMESTAMP` (TZ 無し) と `TIMESTAMPTZ` 混在。新規は **`TIMESTAMPTZ`** で統一（migration 028 以降の慣行）
- [ ] ソフトデリート: `accounting_import_batches.status='superseded'` で代替するので `deleted_at` は不要
- [ ] 既存テーブルへの列追加は **`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT ...`** 形式（既存 047/050/058 等の慣行）

---

## 9. 補足: 既存実装で特に参照すべきファイル

| 用途 | 参照ファイル | 理由 |
|---|---|---|
| Express コンテキスト分離 | `server/src/contexts/finance/index.ts` | 新規 `accounting/` ディレクトリの参考 |
| マイグレーション作法 | `server/src/shared/db/migrations/061_companies.sql` | DO $$ ブロック + 冪等 INSERT のパターン |
| Excel/CSV 共通フレームワーク | `server/src/shared/utils/excel-resource.ts` | multer 設定 + バリデーション + トランザクション境界 |
| 権限ミドルウェア | `server/src/shared/middleware/auth.ts` | `requirePermission('budget', 'editor')` |
| ダッシュボード共通 UI | `shared/src/client/dashboard/` | KpiCard / SectionCard / DashboardHeader |
| Box 連携 | `server/src/contexts/awards/services/awards-box.service.ts` | フォルダ階層化アップロードの参考 |
| 既存予算サマリー API | `server/src/contexts/finance/index.ts:15-84` | 経理拡張時に source フィルタを追加する箇所 |
| 既存予算サマリー UI | `client/src/contexts/finance/pages/BudgetDashboardPage.tsx` | 実績列を追加する候補 |

---

## 10. 検証用に取り込みたい実 CSV ファイル

要件書 §10 の Definition of Done で「提供された 2026/03 のCSV2ファイルが、エラーなくフル取込みできること」「案件 GLS127, GLS148, GLS140, GLS150, GLS151 が自動的に該当元帳エントリと紐付くこと」が条件。

**確認**:
- これらの GLS 番号に対応する `projects` 行が本番 DB に存在しているか？
- 存在しなければ事前に登録が必要（Phase 5 検証フェーズで詰まる原因になる）
- サンプル CSV ファイルの配置場所と、検証用に dev DB に投入するタイミング

---

**以上、Phase 0 レポートです。寺井さんのレビュー後、§7 の質問への回答をもとに Phase 1 (Layer A 実装) に着手します。**
