/**
 * 案件管理・財務管理・カレンダー・システム管理の左メニュー
 * — **中身は今までと1項目も変えていない**。
 *
 * 旧 `Sidebar.tsx` の `APP_NAV` からの逐語コピーです。節の見出し・並び・ラベル・
 * 権限の条件 (`module` / `modules` / `adminOnly`) をそのまま持ってきています。
 * 情報設計 (v4 は案件管理8画面・財務8画面・カレンダー4画面・設定7画面に整理する) は
 * Phase 2 / Phase 3 で相談します。
 *
 * ── 1つのアプリに「入口が4つ」ある ──────────────────────────
 *
 * このアプリは1つの Vite バンドルに案件管理 (`/sales`)・財務管理 (`/budget`)・
 * カレンダー (`/studio`)・システム管理 (`/admin`) の4つの入口が入っています。
 * どの入口にいるかは URL から `appOfPath()` で判定し、その入口の節だけを出します。
 */
import {
  Award,
  BarChart3,
  Briefcase,
  Building2,
  Calendar,
  CalendarClock,
  ClipboardList,
  CopyCheck,
  Database,
  DollarSign,
  FileSearch,
  Film,
  FlaskConical,
  FolderKanban,
  GanttChart,
  GitBranch,
  HardDrive,
  Inbox,
  KanbanSquare,
  Layers,
  ListTodo,
  Presentation,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { Home, ListTodo as ListTodoTab, Menu } from "lucide-react";
import type { ShellMobileTab, ShellNavSection } from "@gmo-onair/shared/src/client/shell";

export const CLIENT_NAV: Record<string, ShellNavSection[]> = {
  // v2.9.220+: 営業ジャーニー縦軸でグルーピング (お客様の声→お客様→商談→案件→ふりかえり)
  sales: [
    {
      title: "要対応",
      items: [
        { label: "受信箱", to: "/sales/inbox", icon: Inbox },
      ],
    },
    {
      title: "お客様",
      items: [
        { label: "顧客", to: "/sales/customers", icon: Building2 },
      ],
    },
    {
      title: "商談",
      items: [
        { label: "ヨミ・パイプライン", to: "/sales/pipeline", icon: TrendingUp },
        { label: "営業活動記録", to: "/sales/activity-logs", icon: ClipboardList },
      ],
    },
    {
      title: "案件",
      items: [
        { label: "案件一覧", to: "/sales/projects", icon: FolderKanban },
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
        { label: "確定案件（ビジネス）", to: "/sales/projects/confirmed/business", icon: Briefcase },
        { label: "按分グループ", to: "/sales/project-groups", icon: GitBranch },
        { label: "旧GLS（決算取込）", to: "/sales/gls-import", icon: Database },
      ],
    },
    {
      title: "タスク",
      items: [
        { label: "カンバン", to: "/sales/tasks/kanban", icon: KanbanSquare },
        { label: "タスクリスト", to: "/sales/tasks/list", icon: ListTodo },
        { label: "ガントチャート", to: "/sales/tasks/gantt", icon: GanttChart },
      ],
    },
    {
      title: "ふりかえり",
      items: [
        { label: "営業レビュー", to: "/sales/review", icon: Award },
        { label: "報告資料", to: "/sales/keep-report", icon: Presentation },
        { label: "AI活動履歴", to: "/sales/ai-activity", icon: Sparkles },
        { label: "ダッシュボード", to: "/sales/dashboard", icon: BarChart3 },
      ],
    },
    {
      title: "マスター",
      items: [
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
      ],
    },
  ],
  budget: [
    {
      items: [
        { label: "財務ダッシュボード", to: "/budget/dashboard", icon: BarChart3 },
      ],
    },
    {
      title: "収支",
      items: [
        { label: "売上管理", to: "/budget/revenues", icon: Receipt },
        { label: "仕入管理", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
        { label: "精算PDF取込", to: "/budget/xpoint-import", icon: FileSearch },
        { label: "決算インポート", to: "/budget/kessan-import", icon: FlaskConical, adminOnly: true },
        { label: "二重計上スクリーニング", to: "/budget/dedup-screening", icon: CopyCheck, adminOnly: true },
        { label: "案件月別詳細", to: "/budget/detail", icon: FolderKanban },
      ],
    },
    {
      title: "マスター",
      items: [
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
        { label: "仕入先", to: "/budget/vendors", icon: Truck },
        { label: "パートナー", to: "/budget/partners", icon: Users },
      ],
    },
    {
      title: "レポート",
      items: [
        { label: "仕入先集計", to: "/budget/reports/vendors", icon: BarChart3 },
      ],
    },
  ],
  studio: [
    {
      items: [
        { label: "統合カレンダー", to: "/studio/all", icon: Layers, modules: ["studio", "partner_schedule"] },
        { label: "スタジオカレンダー", to: "/studio/calendar", icon: Calendar },
        { label: "パートナースケジュール", to: "/studio/partners", icon: Users, module: "partner_schedule" },
        { label: "マイカレンダー", to: "/studio/my-calendar", icon: CalendarClock, module: "partner_schedule" },
      ],
    },
  ],
  admin: [
    {
      items: [
        { label: "ユーザー管理", to: "/admin/users", icon: UserCog },
        { label: "データビューア", to: "/admin/data-viewer", icon: Database },
        { label: "DBバックアップ", to: "/admin/db-backups", icon: HardDrive },
        { label: "システム設定", to: "/admin/settings", icon: Settings },
      ],
    },
  ],
};

/**
 * スマホ下端のタブ。
 *
 * v4 の決めごとは **ホーム / やること / 検索** の3つです。検索は上辺バーにありますが
 * スマホでは畳んでいる (入力欄を出すと 375px でアプリ名が入らない) ので、
 * いまは**メニューを開くタブ**にしてあります。Phase 6 (スマホ) で
 * 検索のシートを作るときに差し替えます。
 */
export const CLIENT_MOBILE_TABS: ShellMobileTab[] = [
  { label: "ホーム", to: "/", icon: Home, end: true },
  { label: "やること", to: "/sales/tasks/kanban", icon: ListTodoTab },
  { label: "メニュー", icon: Menu, action: "menu" },
];
