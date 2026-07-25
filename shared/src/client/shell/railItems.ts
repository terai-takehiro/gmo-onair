// shared/src/client/shell/railItems.ts — 共通レールの6項目 + 設定
//
// 刷新の原則「入口は1つ」。同じデータに2つ以上のメニューを作らない。
// ここに無いもの (Qシート・技術資料・機材・計時LIVE・リアルタイムCG・翻訳・
// インタラクティブ) はレールに出さない — 案件の中のタブ、または ⌘K から開く。
//
// 旧サイドバーのどのメニューをどのレールが吸収したかは docs/ia.md の対応表。

import {
  Sun,
  FolderKanban,
  ListTodo,
  Building2,
  CalendarDays,
  PiggyBank,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface RailItem {
  /** 安定キー (バッジの割り当てとアクティブ判定に使う) */
  key: string;
  label: string;
  /** 遷移先 (刷新後の正となるパス) */
  href: string;
  Icon: LucideIcon;
  /** このモジュール権限を持つ人にだけ出す */
  module?: string;
  /** いずれかのモジュール権限を持つ人に出す (module より優先) */
  modules?: string[];
  /**
   * アクティブ判定に使うパスの前方一致候補。
   * 移行期は旧パス (/sales/projects 等) も現在地として扱う。
   */
  matchPrefixes?: string[];
  /** レールの下端に寄せる (設定) */
  position?: 'top' | 'bottom';
}

export const RAIL_ITEMS: RailItem[] = [
  {
    key: 'today',
    label: '今日',
    href: '/today',
    Icon: Sun,
    // 権限を問わない (待たせているものは職種を問わず見る)
    matchPrefixes: ['/today', '/sales/inbox', '/daily/inquiries', '/daily/finance'],
  },
  {
    key: 'projects',
    label: '案件',
    href: '/projects',
    Icon: FolderKanban,
    module: 'sales',
    matchPrefixes: [
      '/projects',
      '/sales/projects',
      '/sales/pipeline',
      '/sales/project-groups',
      '/sales/gls-import',
      '/sales/activity-logs',
      '/sales/estimates',
    ],
  },
  {
    key: 'tasks',
    label: 'タスク',
    href: '/tasks',
    Icon: ListTodo,
    modules: ['sales', 'dailyops'],
    matchPrefixes: ['/tasks', '/sales/tasks', '/daily/tasks'],
  },
  {
    key: 'customers',
    label: 'お客様',
    href: '/customers',
    Icon: Building2,
    module: 'sales',
    matchPrefixes: ['/customers', '/sales/customers', '/sales/companies'],
  },
  {
    key: 'schedule',
    label: '予定',
    href: '/schedule',
    Icon: CalendarDays,
    modules: ['studio', 'partner_schedule'],
    matchPrefixes: ['/schedule', '/studio'],
  },
  {
    key: 'finance',
    label: 'お金',
    href: '/finance',
    Icon: PiggyBank,
    module: 'budget',
    matchPrefixes: ['/finance', '/budget'],
  },
  {
    key: 'settings',
    label: '設定',
    href: '/settings',
    Icon: Settings,
    position: 'bottom',
    matchPrefixes: ['/settings', '/admin'],
  },
];

export interface ResolveRailOptions {
  role?: string;
  permissions?: Record<string, string>;
}

/**
 * 権限に応じて出すレール項目を決める。
 * 権限が無いものはメニューに最初から出さない (押して 403 にしない — §2.4)。
 */
export function resolveRailItems({ role, permissions }: ResolveRailOptions): RailItem[] {
  // `_all` は全モジュールの許可を表す内部キー (AuthContext.hasPermission と同じ扱い)
  const isAdmin = role === 'system_admin' || !!permissions?._all;
  return RAIL_ITEMS.filter((item) => {
    if (isAdmin) return true;
    if (item.modules && item.modules.length > 0) {
      return item.modules.some((m) => !!permissions?.[m]);
    }
    if (item.module) return !!permissions?.[item.module];
    return true;
  });
}

/**
 * 現在地のレール項目キーを返す。
 * 最長一致で決めるので、/settings と /sales/... のような取り違えが起きない。
 */
export function activeRailKey(pathname: string, items: RailItem[] = RAIL_ITEMS): string | null {
  // ルートは「今日」(移行期は / が HomePage のまま)
  if (pathname === '/' || pathname === '') return items.some((i) => i.key === 'today') ? 'today' : null;

  let bestKey: string | null = null;
  let bestLen = -1;
  for (const item of items) {
    const prefixes = item.matchPrefixes ?? [item.href];
    for (const p of prefixes) {
      if (pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`)) {
        if (p.length > bestLen) {
          bestLen = p.length;
          bestKey = item.key;
        }
      }
    }
  }
  return bestKey;
}
