# GMO ONAiR v1.0 実装ロードマップ

> Phase分割による段階的な構築計画

## 全体スケジュール概要

```
Phase 0: 基盤再構築         ── サービス層分離、マイグレーション改善、認証強化
Phase 1: 営業強化           ── 営業活動記録、失注分析、ファネル分析、営業評価
Phase 2: 制作進行           ── Kanbanステータス、香盤表、運用マニュアル
Phase 3: 財務強化           ── 予算管理、予実突合、入金管理、PL改善
Phase 4: 資産管理           ── 機材台帳、スタジオ予約、メンテナンス
Phase 5: 外部連携・高度化    ── Qシート連携、テロップ連携、通知、ファイル管理
```

---

## Phase 0: 基盤再構築

**目的:** v0.1のコードベースをv1.0のModular Monolith構造に移行

### 0-1. サーバー側ディレクトリ再編成

```
server/src/
├── app.ts
├── index.ts
├── contexts/                          ← NEW: コンテキスト別に分離
│   ├── sales/
│   │   ├── routes/
│   │   │   ├── opportunities.routes.ts
│   │   │   ├── customers.routes.ts
│   │   │   ├── simulations.routes.ts
│   │   │   └── activity-logs.routes.ts
│   │   ├── services/
│   │   │   ├── opportunity.service.ts
│   │   │   ├── customer.service.ts
│   │   │   ├── simulation.service.ts
│   │   │   └── sales-analytics.service.ts
│   │   └── index.ts                   ← ルート登録のエントリポイント
│   │
│   ├── production/
│   │   ├── routes/
│   │   │   ├── projects.routes.ts
│   │   │   ├── episodes.routes.ts
│   │   │   ├── run-sheets.routes.ts
│   │   │   ├── manuals.routes.ts
│   │   │   └── episode-orders.routes.ts
│   │   ├── services/
│   │   │   ├── project.service.ts
│   │   │   ├── episode.service.ts
│   │   │   ├── run-sheet.service.ts
│   │   │   └── manual.service.ts
│   │   └── index.ts
│   │
│   ├── finance/
│   │   ├── routes/
│   │   │   ├── revenues.routes.ts
│   │   │   ├── purchases.routes.ts
│   │   │   ├── invoices.routes.ts
│   │   │   ├── budgets.routes.ts
│   │   │   ├── sga.routes.ts
│   │   │   └── pl-reports.routes.ts
│   │   ├── services/
│   │   │   ├── revenue.service.ts
│   │   │   ├── purchase.service.ts
│   │   │   ├── budget.service.ts
│   │   │   ├── invoice.service.ts
│   │   │   └── pl.service.ts
│   │   └── index.ts
│   │
│   ├── asset/
│   │   ├── routes/
│   │   │   ├── equipment.routes.ts
│   │   │   ├── studios.routes.ts
│   │   │   └── maintenance.routes.ts
│   │   ├── services/
│   │   │   ├── equipment.service.ts
│   │   │   ├── studio.service.ts
│   │   │   └── maintenance.service.ts
│   │   └── index.ts
│   │
│   └── platform/
│       ├── routes/
│       │   ├── auth.routes.ts
│       │   ├── users.routes.ts
│       │   ├── notifications.routes.ts
│       │   └── dashboard.routes.ts
│       ├── services/
│       │   ├── auth.service.ts
│       │   ├── user.service.ts
│       │   ├── notification.service.ts
│       │   └── dashboard.service.ts
│       └── index.ts
│
├── shared/                            ← サーバー内共通
│   ├── db/
│   │   ├── connection.ts
│   │   └── migrations/
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── errorHandler.ts
│   └── services/
│       ├── pagination.service.ts
│       └── sequence.service.ts
│
└── types/
```

### 0-2. クライアント側ディレクトリ再編成

```
client/src/
├── App.tsx
├── contexts/                          ← NEW: コンテキスト別に分離
│   ├── sales/
│   │   ├── pages/
│   │   │   ├── OpportunityListPage.tsx
│   │   │   ├── OpportunityFormPage.tsx
│   │   │   ├── CustomerListPage.tsx
│   │   │   ├── ActivityLogPage.tsx
│   │   │   └── SalesReviewPage.tsx
│   │   ├── components/
│   │   │   ├── SimulationDialog.tsx
│   │   │   ├── PipelineChart.tsx
│   │   │   └── FunnelAnalysis.tsx
│   │   └── hooks/
│   │       ├── useOpportunities.ts
│   │       └── useSalesAnalytics.ts
│   │
│   ├── production/
│   │   ├── pages/
│   │   │   ├── ProjectListPage.tsx
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   ├── EpisodeListPage.tsx
│   │   │   ├── EpisodeKanbanPage.tsx
│   │   │   ├── RunSheetPage.tsx
│   │   │   └── ManualEditorPage.tsx
│   │   ├── components/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── RunSheetTimeline.tsx
│   │   │   └── ManualSectionEditor.tsx
│   │   └── hooks/
│   │
│   ├── finance/
│   │   ├── pages/
│   │   │   ├── RevenueListPage.tsx
│   │   │   ├── PurchaseListPage.tsx
│   │   │   ├── BudgetPage.tsx
│   │   │   ├── InvoiceListPage.tsx
│   │   │   ├── SgaListPage.tsx
│   │   │   └── PLReportPage.tsx
│   │   ├── components/
│   │   │   ├── BudgetVsActualChart.tsx
│   │   │   └── PLBreakdown.tsx
│   │   └── hooks/
│   │
│   ├── asset/
│   │   ├── pages/
│   │   │   ├── EquipmentListPage.tsx
│   │   │   ├── EquipmentDetailPage.tsx
│   │   │   ├── StudioCalendarPage.tsx
│   │   │   └── MaintenancePage.tsx
│   │   ├── components/
│   │   └── hooks/
│   │
│   └── platform/
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── LoginPage.tsx
│       │   └── UserListPage.tsx
│       └── components/
│
├── components/                        ← 共通UIコンポーネント
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   └── ui/                            ← shadcn/ui
│
├── lib/
│   ├── api.ts
│   ├── format.ts
│   └── utils.ts
│
├── stores/
│   └── uiStore.ts
│
└── types/
    └── index.ts
```

### 0-3. マイグレーション増分管理への移行

```typescript
// server/src/shared/db/migrator.ts
// 番号順にマイグレーションを実行、実行済みを migrations テーブルで管理
interface Migration {
  id: number;
  name: string;
  executed_at: string;
}
```

### 0-4. サービス層パターンの確立

```typescript
// 各サービスの基本パターン
// server/src/contexts/sales/services/opportunity.service.ts

export class OpportunityService {
  // コンテキスト内のDBアクセスはここに集約
  async list(filters: OpportunityFilter): Promise<PaginatedResult<Opportunity>> { }
  async getById(id: string): Promise<Opportunity> { }
  async create(data: CreateOpportunityInput): Promise<Opportunity> { }
  async updateStage(id: string, stage: OpportunityStage): Promise<Opportunity> { }

  // 受注確定時: コンテキスト間連携はイベント的に処理
  async confirmOrder(id: string): Promise<{ opportunity: Opportunity; projectId: string }> {
    // 1. ヨミをa_wonに更新
    // 2. Production Service に案件作成を依頼（直接呼び出し）
    // 3. Finance Service に予算作成を依頼
    // → 将来的にイベントバスに置き換え可能
  }
}
```

---

## Phase 1: 営業強化

**目的:** 営業活動のPDCAサイクルを回す仕組み

### 1-1. 営業活動記録
- `activity_logs` テーブル追加
- 顧客/ヨミに紐づく活動の時系列表示
- 次回アクションのリマインダー

### 1-2. 失注分析
- `lost_reasons` マスタ追加
- ヨミ失注時に理由選択を必須化
- 失注理由の集計ダッシュボード

### 1-3. ファネル分析
- 各ステージのコンバージョン率
- ステージ別平均滞留日数
- 期間別の受注率推移

### 1-4. 営業評価
- `sales_targets` テーブル追加
- 目標vs実績の対比
- 担当者別の営業成績ダッシュボード

---

## Phase 2: 制作進行

**目的:** 受注後の制作プロセスを可視化

### 2-1. エピソードKanban
- `production_status` カラム追加
- ドラッグ&ドロップ対応のKanbanボード
- ステータス変更履歴の記録

### 2-2. 香盤表（RunSheet）
- `run_sheets` / `run_sheet_items` テーブル追加
- タイムライン型のUIで時間軸に沿ったスケジュール表示
- PDF出力機能

### 2-3. 運用マニュアル
- `manual_templates` / `project_manuals` テーブル追加
- 雛形からの案件別マニュアル自動生成
- Markdownエディタでのセクション編集
- PDF出力機能
- 承認ワークフロー（draft → review → approved → published）

---

## Phase 3: 財務強化

**目的:** 予算と実績を突合し、利益率を予測可能にする

### 3-1. 予算管理
- `budgets` / `budget_items` テーブル追加
- ヨミ受注時にシミュレーションから予算を自動生成
- 予算の承認ワークフロー

### 3-2. 予実突合
- 案件別の予算vs実績ダッシュボード
- 差異率アラート（例: コストが予算の80%超過時に警告）
- 完了時予測コスト（EAC）の自動計算

### 3-3. 入金管理
- `payments` テーブル追加
- 請求→入金の追跡
- 入金遅延アラート
- キャッシュフロー可視化

### 3-4. PL強化
- 案件別PL（予算/実績/差異）
- 月次PLの自動生成
- 年次推移レポート

---

## Phase 4: 資産管理

**目的:** スタジオと機材を一元管理

### 4-1. 機材台帳
- `equipment` / `equipment_categories` テーブル追加
- 機材一覧（検索、フィルタ、ステータス管理）
- 機材詳細（写真、購入情報、メンテナンス履歴）

### 4-2. スタジオ予約
- `studios` / `studio_reservations` テーブル追加
- カレンダーUIでの空き管理
- 案件との紐付け
- ダブルブッキング防止

### 4-3. 機材予約
- `equipment_reservations` テーブル追加
- 案件/エピソードへの機材割当
- 利用中/予約済みの可視化
- 機材不足アラート

### 4-4. メンテナンス管理
- `maintenance_logs` テーブル追加
- 定期点検スケジュール
- 次回メンテナンス期日アラート
- メンテナンスコストの財務連携

---

## Phase 5: 外部連携・高度化

**目的:** 既存の外部ツールとの統合、運用の高度化

### 5-1. 外部システム連携
- `external_links` テーブル追加
- Qシートアプリとの連携API（案件情報の同期）
- テロップシステムとの連携API（出演者情報等の同期）
- Webhook対応（リアルタイム連携）

### 5-2. 通知機能
- `notifications` テーブル追加
- アプリ内通知
- メール通知（オプション）
- 通知テンプレート管理

### 5-3. ファイル管理
- `files` テーブル追加
- 案件に紐づくファイル（ロゴ、台本、契約書等）
- バージョン管理
- ファイルストレージ（S3等）

### 5-4. 権限管理の強化
- `roles` / `user_roles` テーブルでRBACに移行
- 画面/操作単位の細かな権限制御
- コンテキスト別のアクセス制御

---

## Phase間の依存関係

```
Phase 0 ──→ Phase 1 ──→ Phase 3
  │            │
  │            └──→ Phase 2 ──→ Phase 5
  │
  └──→ Phase 4 ──→ Phase 5
```

- Phase 0（基盤）は全Phaseの前提
- Phase 1（営業）と Phase 4（資産）は並行可能
- Phase 2（制作）は Phase 1 の受注フロー改善後が望ましい
- Phase 3（財務）は Phase 1 のファネルデータがあると効果的
- Phase 5（外部連携）は Phase 2, 4 の完了後

---

## 技術スタック方針

| 項目 | v0.1 | v1.0 方針 |
|------|------|----------|
| DB | sql.js (インメモリSQLite) | 開発: sql.js維持、本番: PostgreSQL検討 |
| ORM | なし（直接SQL） | 維持（クエリの透明性が高い） |
| API | Express REST | 維持 |
| 認証 | モック（x-user-id） | JWT or セッション認証 |
| フロント | React + Vite + TailwindCSS | 維持 |
| 状態管理 | Zustand + React Query | 維持 |
| PDF出力 | なし | pdfkit or puppeteer |
| ファイルストレージ | なし | ローカル → S3（本番） |
| デプロイ | Render.com | 維持 |
