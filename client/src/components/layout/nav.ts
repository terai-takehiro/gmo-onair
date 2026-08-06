/**
 * 案件管理・財務管理・カレンダー・設定の左メニュー
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
 * カレンダー (`/studio`)・設定 (`/settings`) の4つの入口が入っています。
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
  Layers,
  LayoutDashboard,
  ListTodo,
  Presentation,
  Receipt,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Home, ListTodo as ListTodoTab, Menu } from "lucide-react";
import type { ShellMobileTab, ShellNavSection } from "@gmo-onair/shared/src/client/shell";

export const CLIENT_NAV: Record<string, ShellNavSection[]> = {
  // v2.9.220+: 営業ジャーニー縦軸でグルーピング (お客様の声→お客様→商談→案件→ふりかえり)
  // ── 案件管理 (v4 の情報設計) ────────────────────────────────
  //
  // モックの `navMenus`（`docs/design/v4/mockups/onair-data.js`）に合わせた
  // **3つの塊 + 「そのほか」** です。旧メニューは7つの塊に 20 項目あり、
  // **ダッシュボードが「ふりかえり」の中**にあって、押すと同じ画面に行く
  // 「カンバン」と「タスクリスト」が別項目として並んでいました。
  //
  // **v4 で作り直していない画面はメニューから消さず「そのほか」に畳みます**（ご判断）。
  // 消すと動いている画面に辿り着けなくなり、全部並べると v4 の並びが読めません。
  // 作り直したものから上の塊へ移していきます。
  sales: [
    {
      title: "業務",
      items: [
        { label: "ダッシュボード", to: "/sales/dashboard", icon: LayoutDashboard },
        // モックの PC サイドバーには無いが、スマホメニューには「案件受付」がある。
        // 毎日開く画面なので、ダッシュボードのカード経由だけだと遠回りになる（ご判断）
        { label: "受付", to: "/sales/inbox", icon: Inbox },
        { label: "案件一覧", to: "/sales/projects", icon: FolderKanban },
      ],
    },
    {
      title: "全案件",
      items: [
        // **`/sales/tasks/list` を指す。** `/sales/tasks` は `kanban` へ転送されるが、
        // `kanban` と `list` は同じ画面（v4 でカンバンを畳んだ）
        { label: "タスク一覧", to: "/sales/tasks/list", icon: ListTodo },
        { label: "見積・請求", to: "/sales/billing", icon: Receipt },
      ],
    },
    {
      title: "設定",
      items: [
        // 「標準工程テンプレート」はまだ画面が無いので出さない
        // （押しても何も起きない項目は「壊れている」と受け取られる）
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
      ],
    },
    {
      title: "そのほか（作り直し前）",
      note: "v4 の並びをこれから決める画面です。いまのまま使えます。",
      collapsible: true,
      items: [
        { label: "顧客", to: "/sales/customers", icon: Building2 },
        { label: "営業活動記録", to: "/sales/activity-logs", icon: ClipboardList },
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
        { label: "確定案件（ビジネス）", to: "/sales/projects/confirmed/business", icon: Briefcase },
        { label: "按分グループ", to: "/sales/project-groups", icon: GitBranch },
        { label: "旧GLS（決算取込）", to: "/sales/gls-import", icon: Database },
        { label: "ガントチャート", to: "/sales/tasks/gantt", icon: GanttChart },
        { label: "営業レビュー", to: "/sales/review", icon: Award },
        { label: "報告資料", to: "/sales/keep-report", icon: Presentation },
        { label: "AI活動履歴", to: "/sales/ai-activity", icon: Sparkles },
        { label: "取引先マスター", to: "/sales/companies", icon: Store },
      ],
    },
  ],
  // 財務管理。**まだ v4 の情報設計に差し替えていない**（8画面のうち4画面が済み）。
  // 残り4画面（ダッシュボード・受け取った書類・取り込み・取引先）を作り終えたときに、
  // 案件管理と同じように 見る／明細／取り込み／設定 の4つへ組み直す。
  // いまは v4 で作った「請求・入金」を足しただけ。
  budget: [
    {
      title: "見る",
      items: [
        { label: "財務ダッシュボード", to: "/budget/dashboard", icon: BarChart3 },
        { label: "請求・入金", to: "/budget/billing", icon: Wallet },
      ],
    },
    {
      title: "収支",
      items: [
        { label: "売上管理", to: "/budget/revenues", icon: Receipt },
        { label: "仕入管理", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
        // v4 ⑥: 日常業務から移した（経理が開けなかった）。権限は budget か dailyops
        { label: "受け取った書類", to: "/budget/documents", icon: Inbox, modules: ["budget", "dailyops"] },
        { label: "精算PDF取込", to: "/budget/xpoint-import", icon: FileSearch },
        { label: "決算インポート", to: "/budget/kessan-import", icon: FlaskConical, adminOnly: true },
        { label: "二重計上スクリーニング", to: "/budget/dedup-screening", icon: CopyCheck, adminOnly: true },
        { label: "案件月別詳細", to: "/budget/detail", icon: FolderKanban },
      ],
    },
    {
      title: "マスター",
      items: [
        // v4 ⑧: 仕入先とパートナーは1画面のタブになった
        { label: "取引先（仕入先・パートナー）", to: "/budget/vendors", icon: Truck },
        { label: "取引先マスター（請求先）", to: "/sales/companies", icon: Store },
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
        { label: "ユーザー管理", to: "/settings/users", icon: UserCog },
        { label: "データビューア", to: "/settings/data-viewer", icon: Database },
        { label: "DBバックアップ", to: "/settings/db-backups", icon: HardDrive },
        { label: "全体の設定", to: "/settings", icon: Settings, end: true },
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
  { label: "やること", to: "/sales/tasks/list", icon: ListTodoTab },
  { label: "メニュー", icon: Menu, action: "menu" },
];
