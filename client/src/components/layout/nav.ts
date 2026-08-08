/**
 * 案件管理・財務管理・カレンダー・設定の左メニュー
 *
 * **入口ごとに、画面を作り終えたときだけ情報設計を差し替えます。**
 * 4つの入口すべてが v4 の並びになりました（案件管理・財務管理・カレンダー・設定）。
 *
 * 前回の刷新は「枠の作り替え」と「情報設計の変更」を同じ回でやり、情報設計が
 * 却下されたときに**枠まで一緒に捨てられました**。だから画面ができた入口から順に変えます。
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
  Building2,
  Calendar,
  CalendarClock,
  ClipboardList,
  Database,
  DollarSign,
  FileSearch,
  Film,
  FolderKanban,
  GanttChart,
  GitBranch,
  HardDrive,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  ListChecks,
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
import { Home, ListTodo as ListTodoTab, Search as SearchTab } from "lucide-react";
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
        // **受付はここに出さない**（モックの PC サイドバーに無い）。
        // 入口はダッシュボードの受付カード。スマホは下タブから開く
        { label: "ダッシュボード", to: "/sales/dashboard", icon: LayoutDashboard },
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
        { label: "料金表", to: "/sales/pricing", icon: DollarSign },
        { label: "標準工程テンプレート", to: "/sales/flow-templates", icon: ListChecks },
      ],
    },
    {
      title: "そのほか（作り直し前）",
      note: "v4 の並びをこれから決める画面です。いまのまま使えます。",
      collapsible: true,
      items: [
        { label: "顧客", to: "/sales/customers", icon: Building2 },
        { label: "営業活動記録", to: "/sales/activity-logs", icon: ClipboardList },
        // **ビジネス（GLS-B）はプロジェクト管理へ移した** (migration 179)。
        // 旧 URL は `App.tsx` が `/gpm/projects` へ転送する
        { label: "確定案件（スタジオ）", to: "/sales/projects/confirmed/studio", icon: Film },
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
  // ── プロジェクト管理 (v4 で新規) ──────────────────────────────
  //
  // モックの `GP_MENU` は「プロジェクト（ダッシュボード・一覧）／全体（タスク・
  // 見積請求）／設定（標準工程）」の3つです。**見積・請求は出しません** —
  // 画面がまだ無いので、押しても何も起きない項目になります
  // （`estimates` にモックが持つ「提出先」の列が無く、足すと案件管理の
  //  見積画面に影響する。理由は `docs/design/gpm-model.md`）。
  //
  // 「タスク一覧」ではなく**「やること」**にしてあります。工程の下のタスクを
  // 全部並べる口がサーバーに無く、出せるのはプロジェクトごとの次の1件と
  // 未確認事項だけなので、名前で期待させないためです。
  gpm: [
    {
      title: "プロジェクト",
      items: [
        { label: "ダッシュボード", to: "/gpm/dashboard", icon: LayoutDashboard },
        { label: "プロジェクト一覧", to: "/gpm/projects", icon: FolderKanban },
      ],
    },
    {
      title: "全体",
      items: [
        { label: "やること（未確認事項）", to: "/gpm/tasks", icon: ListTodo },
      ],
    },
    {
      title: "設定",
      items: [
        { label: "標準工程テンプレート", to: "/gpm/templates", icon: Layers },
      ],
    },
  ],
  // 財務管理 — **v4 の情報設計に差し替え済み**（8画面すべて作り直した）。
  //
  //   見る（全体の数字）／明細（1件ずつの台帳）／取り込み（外から入れる）／設定
  //
  // 旧メニューは「見る・収支・マスター・レポート」の4塊に9項目あり、
  // **収支の中に台帳3つと取込3つが混ざっていた**（毎日見るものと月1回しか
  // 使わないものが同じ塊）。取込3つは1画面のタブに畳んだので1項目になっている。
  budget: [
    {
      title: "見る",
      items: [
        { label: "財務ダッシュボード", to: "/budget/dashboard", icon: BarChart3 },
        { label: "請求・入金", to: "/budget/billing", icon: Wallet },
      ],
    },
    {
      title: "明細",
      items: [
        { label: "売上", to: "/budget/revenues", icon: Receipt },
        { label: "仕入", to: "/budget/purchases", icon: ShoppingCart },
        { label: "販管費", to: "/budget/sga", icon: Receipt },
        // v4 ⑥: 日常業務から移した（経理が開けなかった）。権限は budget か dailyops
        { label: "受け取った書類", to: "/budget/documents", icon: Inbox, modules: ["budget", "dailyops"] },
      ],
    },
    {
      title: "取り込み",
      items: [
        // v4 ⑦: 精算PDF・総勘定元帳・二重計上を1画面3タブに畳んだ。
        // **adminOnly は付けない** — 精算PDF は budget の editor が使う。
        // タブは画面の中で権限に応じて出し分ける
        { label: "取り込み", to: "/budget/import", icon: FileSearch },
      ],
    },
    {
      title: "設定",
      items: [
        // v4 ⑧: 仕入先とパートナーは1画面のタブになった
        { label: "取引先（仕入先・パートナー）", to: "/budget/vendors", icon: Truck },
      ],
    },
    {
      // v4 で作り直していない3画面。**消さずに畳む** — 消すと動いている画面へ
      // 辿り着けず、全部並べると v4 の並びが読めない（案件管理と同じやり方）
      title: "そのほか（作り直し前）",
      collapsible: true,
      items: [
        { label: "案件月別詳細", to: "/budget/detail", icon: FolderKanban },
        { label: "仕入先集計", to: "/budget/reports/vendors", icon: BarChart3 },
        // 請求先は案件管理の持ち物。**同じ相手を2か所から直せるようにしない**
        { label: "取引先マスター（請求先）", to: "/sales/companies", icon: Store },
      ],
    },
  ],
  /**
   * カレンダー — v4 の情報設計（モックの `MENU`）。
   *
   * **見る**（予定 / 部屋の空き / 仮押さえ）と**設定**の2つだけ。
   * 旧メニューは「統合」「スタジオ」「パートナー」「マイ」の4本のカレンダーが
   * 並んでおり、**どれを開けばよいか分かりませんでした**（中身はほぼ同じで、
   * 見えるレイヤーが違うだけ）。v4 は **カレンダーは1本・レイヤーで切り替え**です。
   *
   * パートナーとマイは**予定を作る導線がそこにしかない**ので、
   * 「そのほか（作り直し前）」に畳んで残します（消すと作れなくなる）。
   */
  studio: [
    {
      title: "見る",
      items: [
        { label: "予定", to: "/studio/calendar", icon: Calendar, modules: ["studio", "partner_schedule"] },
        { label: "部屋の空き", to: "/studio/rooms", icon: Layers, module: "studio" },
        { label: "仮押さえ", to: "/studio/holds", icon: CalendarClock, module: "studio" },
      ],
    },
    {
      title: "設定",
      items: [
        // **`partner_schedule` だけの人にも出す。** 外部カレンダーの購読は
        // その権限の持ち物で、ここにしか入口が無い（出さないと URL を
        // 直打ちしないと辿り着けない）。開けるタブは画面の中で出し分ける
        { label: "カレンダーの設定", to: "/studio/settings", icon: Settings, modules: ["studio", "partner_schedule"] },
      ],
    },
    {
      title: "そのほか（作り直し前）",
      collapsible: true,
      note: "予定を作る導線がここにしかないので残しています",
      items: [
        { label: "スタジオカレンダー", to: "/studio/studio-calendar", icon: Calendar, module: "studio" },
        { label: "パートナースケジュール", to: "/studio/partners", icon: Users, module: "partner_schedule" },
        { label: "マイカレンダー", to: "/studio/my-calendar", icon: CalendarClock, module: "partner_schedule" },
      ],
    },
  ],
  /**
   * 設定 — v4 の情報設計（モックの ① 設定トップ）。
   *
   * 旧メニューは4項目が横並びで、**「全体の設定」が最後**にありました。
   * ところがそこが設定の入口（案内板）なので、**入口が末尾にある**状態でした。
   *
   * v4 は **設定（案内板）を先頭**に置き、そこから行ける先を
   * 「よく直すもの」として並べ、DB を直接見る道具は
   * 「データベース」に分けます（毎日使うものではないため）。
   *
   * **拠点・部屋・料金表・取引先は `/settings` の案内板から行きます。**
   * ここに全部並べると、それぞれの入口（案件管理・財務・カレンダー）の
   * メニューにも同じ項目があるので、同じものが2か所に出ます。
   */
  admin: [
    {
      items: [
        // **案内板とシステムの情報だけ権限を掛けない。** 設定は
        // 料金表 (sales) や取引先 (budget) だけを直す人も来る場所で、
        // パスワード変更は全員が使う
        { label: "設定", to: "/settings", icon: Settings, end: true },
        { label: "拠点・部屋", to: "/settings/sites", icon: Building2, module: "studio" },
        { label: "権限とメンバー", to: "/settings/users", icon: UserCog, module: "admin" },
      ],
    },
    {
      title: "データベース",
      collapsible: true,
      note: "中身を直接見る道具です。毎日は使いません",
      items: [
        // **`module` を書かないと権限が無い人にも出る。** 旧メニューは
        // 3項目とも無指定で、`admin` が無い人が押すと 403 になっていた
        // （旧 `/settings` 自体が admin 必須だったので気づけなかった）
        { label: "データビューア", to: "/settings/data-viewer", icon: Database, module: "admin" },
        { label: "DBバックアップ", to: "/settings/db-backups", icon: HardDrive, module: "admin" },
        { label: "システムの情報", to: "/settings/system", icon: Info },
      ],
    },
  ],
};

/**
 * スマホ下端のタブ — **ホーム / やること / 検索**（v4 の決めごと）。
 *
 * 3つ目は S2 の時点では「メニューを開く」でした。**スマホに検索が1つも無かった**
 * ためです（上辺バーの `GlobalSearch` は `hidden sm:block` で 375px では出ない）。
 * Phase 6 で `/search` を作ったので、本来の「探す」に戻しました。
 *
 * **メニューは上辺バーの ☰ から開けます。** 下タブと ☰ の両方をメニューに
 * 使っていたので、1枠が二重の入口になっていました。
 */
export const CLIENT_MOBILE_TABS: ShellMobileTab[] = [
  { label: "ホーム", to: "/", icon: Home, end: true },
  { label: "やること", to: "/sales/tasks/list", icon: ListTodoTab },
  { label: "探す", to: "/search", icon: SearchTab },
];
