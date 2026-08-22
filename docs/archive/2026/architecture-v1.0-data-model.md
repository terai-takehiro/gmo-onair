# GMO ONAiR v1.0 データモデル設計

> 全コンテキストのテーブル設計。v0.1の17テーブルから約35テーブルへ拡張。

## 1. テーブル一覧

### 共通基盤 (Platform) — 6テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `users` | ユーザーマスタ | 改修 |
| `roles` | ロール定義 | NEW |
| `user_roles` | ユーザー×ロール | NEW |
| `notifications` | 通知 | NEW |
| `files` | ファイルメタデータ | NEW |
| `audit_logs` | 監査ログ | NEW |

### 営業 (Sales) — 9テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `customers` | 顧客マスタ | 継続 |
| `customer_contacts` | 顧客担当者 | NEW |
| `opportunities` | ヨミ | 改修 |
| `opportunity_dates` | ヨミ候補日程 | 継続 |
| `opportunity_simulations` | 見積シミュレーション | 継続 |
| `opportunity_simulation_items` | 見積明細 | 継続 |
| `activity_logs` | 営業活動記録 | NEW |
| `lost_reasons` | 失注理由マスタ | NEW |
| `sales_targets` | 営業目標 | NEW |

### 制作 (Production) — 12テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `project_groups` | 案件グループ | 継続 |
| `projects` | 案件 | 改修 |
| `episodes` | 話数/回 | 改修 |
| `episode_orders` | 発注追加 | 継続 |
| `episode_status_logs` | ステータス変更履歴 | NEW |
| `run_sheets` | 香盤表 | NEW |
| `run_sheet_items` | 香盤表タイムライン項目 | NEW |
| `manual_templates` | 運用マニュアル雛形 | NEW |
| `manual_template_sections` | 雛形セクション | NEW |
| `project_manuals` | 案件別マニュアル | NEW |
| `project_manual_sections` | 案件別セクション | NEW |
| `external_links` | 外部システム連携情報 | NEW |

### 財務 (Finance) — 10テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `budgets` | 予算（ヨミから引継） | NEW |
| `budget_items` | 予算明細 | NEW |
| `revenues` | 売上 | 継続 |
| `purchases` | 仕入 | 継続 |
| `purchase_allocations` | 仕入按分 | 継続 |
| `purchase_episode_allocations` | 話数按分 | 継続 |
| `invoices` | 請求書 | 改修 |
| `invoice_items` | 請求明細 | NEW |
| `payments` | 入金記録 | NEW |
| `sga_expenses` | 販管費 | 継続 |

### 資産管理 (Asset) — 6テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `studios` | スタジオマスタ | NEW |
| `studio_reservations` | スタジオ予約 | NEW |
| `equipment_categories` | 機材カテゴリ | NEW |
| `equipment` | 機材台帳 | NEW |
| `equipment_reservations` | 機材案件割当 | NEW |
| `maintenance_logs` | メンテナンス記録 | NEW |

### マスタ (共通参照) — 4テーブル

| テーブル | 用途 | v0.1 |
|---------|------|------|
| `vendors` | 仕入先マスタ | 継続 |
| `partners` | パートナーマスタ | 継続 |
| `pricing_categories` | 料金カテゴリ | 継続 |
| `pricing_items` | 料金項目 | 継続 |
| `sequences` | 採番管理 | 継続 |

**合計: 約48テーブル**

---

## 2. 主要テーブルの詳細設計

### 2.1 episodes（改修）

```sql
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  episode_number INTEGER NOT NULL,
  episode_code TEXT NOT NULL UNIQUE,
  title TEXT,

  -- Kanbanステータス（NEW）
  production_status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (production_status IN (
      'preparing',        -- 準備中
      'ready_to_record',  -- 収録準備完了
      'recorded',         -- 収録済
      'editing',          -- 編集中
      'reviewing',        -- 確認待ち
      'delivered',        -- 納品済
      'on_hold'           -- 保留
    )),

  -- 日程
  recording_date TEXT,
  broadcast_date TEXT,
  delivery_date TEXT,

  -- 監査
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);
```

### 2.2 run_sheets（香盤表）— NEW

```sql
CREATE TABLE run_sheets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  episode_id TEXT REFERENCES episodes(id),
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  venue TEXT,                    -- 会場
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE run_sheet_items (
  id TEXT PRIMARY KEY,
  run_sheet_id TEXT NOT NULL REFERENCES run_sheets(id),
  sort_order INTEGER NOT NULL,
  start_time TEXT NOT NULL,       -- HH:MM形式
  end_time TEXT,                  -- HH:MM形式
  duration_minutes INTEGER,
  title TEXT NOT NULL,            -- 項目名
  description TEXT,               -- 詳細
  person_in_charge TEXT,          -- 担当者
  location TEXT,                  -- 場所/ステージ
  category TEXT CHECK (category IN (
    'setup',        -- 準備・設営
    'rehearsal',    -- リハーサル
    'live',         -- 本番
    'break',        -- 休憩
    'teardown',     -- 撤収
    'other'         -- その他
  )),
  notes TEXT,                     -- 備考

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.3 manual_templates / project_manuals（運用マニュアル）— NEW

```sql
-- 雛形マスタ
CREATE TABLE manual_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 雛形名
  description TEXT,
  project_type TEXT,               -- 対象案件種別(NULL=汎用)
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  deleted_at TEXT
);

CREATE TABLE manual_template_sections (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES manual_templates(id),
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,             -- セクション名
  content TEXT NOT NULL,           -- Markdown形式の本文
  is_required INTEGER NOT NULL DEFAULT 1,  -- 必須セクションか

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 案件別マニュアル（雛形から生成してカスタマイズ）
CREATE TABLE project_manuals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  template_id TEXT REFERENCES manual_templates(id),  -- 元の雛形
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'approved', 'published')),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE project_manual_sections (
  id TEXT PRIMARY KEY,
  manual_id TEXT NOT NULL REFERENCES project_manuals(id),
  template_section_id TEXT REFERENCES manual_template_sections(id),
  sort_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,           -- Markdown（案件独自に編集可能）
  is_customized INTEGER NOT NULL DEFAULT 0,  -- 雛形から変更したか

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.4 budgets（予算）— NEW

```sql
-- ヨミ受注時にシミュレーションから予算を自動生成
CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  opportunity_id TEXT REFERENCES opportunities(id),  -- 元のヨミ
  total_revenue_budget INTEGER NOT NULL DEFAULT 0,   -- 売上予算（税抜）
  total_cost_budget INTEGER NOT NULL DEFAULT 0,      -- コスト予算（税抜）
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'locked')),
  approved_at TEXT,
  approved_by TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  updated_by TEXT,
  deleted_at TEXT
);

CREATE TABLE budget_items (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('revenue', 'cost')),
  category TEXT NOT NULL,          -- 費目名
  description TEXT,
  amount INTEGER NOT NULL,         -- 税抜金額
  tax_category TEXT DEFAULT 'tax_10',
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.5 equipment（機材台帳）— NEW

```sql
CREATE TABLE equipment_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- カメラ、照明、音響、配信機材 等
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES equipment_categories(id),
  name TEXT NOT NULL,              -- 機材名
  model_number TEXT,               -- 型番
  serial_number TEXT,              -- シリアル番号
  manufacturer TEXT,               -- メーカー
  purchase_date TEXT,              -- 購入日
  purchase_price INTEGER,          -- 購入金額
  useful_life_years INTEGER,       -- 耐用年数
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN (
      'available',      -- 利用可能
      'in_use',         -- 使用中
      'maintenance',    -- メンテナンス中
      'retired'         -- 廃棄/除却
    )),
  location TEXT,                   -- 保管場所
  notes TEXT,
  image_file_id TEXT REFERENCES files(id),

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  deleted_at TEXT
);

CREATE TABLE equipment_reservations (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  episode_id TEXT REFERENCES episodes(id),
  reserved_from TEXT NOT NULL,     -- 予約開始日時
  reserved_to TEXT NOT NULL,       -- 予約終了日時
  reserved_by TEXT NOT NULL,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE maintenance_logs (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id),
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN (
    'scheduled',    -- 定期点検
    'repair',       -- 修理
    'calibration',  -- 校正
    'cleaning'      -- クリーニング
  )),
  performed_date TEXT NOT NULL,
  next_due_date TEXT,              -- 次回予定日
  performed_by TEXT,
  vendor_id TEXT REFERENCES vendors(id),  -- 外部業者
  cost INTEGER,
  description TEXT,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.6 studios（スタジオ）— NEW

```sql
CREATE TABLE studios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- スタジオ名
  capacity INTEGER,                -- 定員
  floor_area REAL,                 -- 面積(平米)
  hourly_rate INTEGER,             -- 時間単価
  half_day_rate INTEGER,           -- 半日単価
  full_day_rate INTEGER,           -- 全日単価
  features TEXT,                   -- JSON: 設備一覧
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE studio_reservations (
  id TEXT PRIMARY KEY,
  studio_id TEXT NOT NULL REFERENCES studios(id),
  project_id TEXT REFERENCES projects(id),
  title TEXT NOT NULL,
  reservation_type TEXT NOT NULL CHECK (reservation_type IN (
    'rehearsal',     -- リハーサル
    'recording',     -- 収録
    'live',          -- 生配信
    'setup',         -- 設営
    'maintenance',   -- メンテナンス
    'external'       -- 外部貸出
  )),
  start_datetime TEXT NOT NULL,
  end_datetime TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'tentative'
    CHECK (status IN ('tentative', 'confirmed', 'cancelled')),
  reserved_by TEXT NOT NULL,
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.7 activity_logs（営業活動記録）— NEW

```sql
CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT REFERENCES opportunities(id),
  customer_id TEXT REFERENCES customers(id),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'call',          -- 電話
    'email',         -- メール
    'visit',         -- 訪問
    'meeting',       -- 打合せ
    'proposal',      -- 提案
    'demo',          -- デモ/見学
    'follow_up',     -- フォローアップ
    'other'          -- その他
  )),
  activity_date TEXT NOT NULL,
  duration_minutes INTEGER,
  subject TEXT NOT NULL,           -- 件名
  description TEXT,                -- 詳細
  next_action TEXT,                -- 次のアクション
  next_action_date TEXT,           -- 次回アクション期日
  performed_by TEXT NOT NULL,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### 2.8 opportunities（改修）

```sql
-- v0.1からの追加カラム
ALTER TABLE opportunities ADD COLUMN lost_reason_id TEXT REFERENCES lost_reasons(id);
ALTER TABLE opportunities ADD COLUMN lost_reason_note TEXT;
ALTER TABLE opportunities ADD COLUMN lead_source TEXT;  -- リード獲得元
ALTER TABLE opportunities ADD COLUMN first_contact_date TEXT;  -- 初回接触日

CREATE TABLE lost_reasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,              -- 価格、競合、時期、要件不一致 等
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE sales_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fiscal_year INTEGER NOT NULL,
  fiscal_month INTEGER NOT NULL,   -- 1-12
  target_amount INTEGER NOT NULL,  -- 目標金額
  target_count INTEGER,            -- 目標件数

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(user_id, fiscal_year, fiscal_month)
);
```

---

## 3. コンテキスト間のデータ参照ルール

```
【原則】
- 同一コンテキスト内: 直接JOIN可
- コンテキスト間: IDによる参照のみ（JOINは避ける）
- 集約をまたぐデータ取得: サービス層で結合

【例: 案件別PLの取得】
1. Production Service → project_id で案件情報を取得
2. Finance Service → project_id で売上・仕入を集計
3. Finance Service → budget_id で予算を取得
4. Dashboard Service → 上記を結合してPLビューを構築
```

## 4. マイグレーション戦略

```
server/src/db/migrations/
├── 001_platform_base.sql         -- users, roles, files, audit_logs
├── 002_sales_base.sql            -- customers, opportunities, simulations
├── 003_production_base.sql       -- projects, episodes, run_sheets
├── 004_finance_base.sql          -- budgets, revenues, purchases, invoices
├── 005_asset_base.sql            -- studios, equipment
├── 006_sales_activity.sql        -- activity_logs, lost_reasons, sales_targets
├── 007_production_manual.sql     -- manual_templates, project_manuals
├── 008_production_external.sql   -- external_links
├── 009_indexes.sql               -- パフォーマンス用インデックス
└── 010_seed_masters.sql          -- マスタ初期データ
```

各マイグレーションは冪等（IF NOT EXISTS）で、番号順に実行。
