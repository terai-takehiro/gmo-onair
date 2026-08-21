/**
 * ① ダッシュボード上辺の4枚の中身。
 *
 * **PC のグリッド（`DashboardPage.tsx` の `Tile`）とスマホのウィジェット
 * レール（`KpiRail.tsx`）が両方これを読む。** 書き写すと、片方だけ直した
 * ときに同じ画面で数字の意味が食い違う
 * （`gpm/pages/dashboard/KpiStrip.tsx` の `kpiCells()` と同じ考え方）。
 */
import type { LucideIcon } from 'lucide-react';
import { ArrowRightLeft, ClipboardCheck, Package, Wrench } from 'lucide-react';
import type { Stats } from './types';

export interface KpiCell {
  key: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  tone: 'plain' | 'warning' | 'danger';
  icon: LucideIcon;
  to: string;
}

export function buildKpiCells(s: Stats): KpiCell[] {
  return [
    {
      key: 'items',
      label: '機材',
      value: s.total_items,
      unit: '点',
      sub: `稼働中 ${s.active_items.toLocaleString('ja-JP')} 点（付属品含む全体 ${s.total_items_with_children.toLocaleString('ja-JP')} 点）`,
      tone: 'plain',
      icon: Package,
      to: '/equipment/items?view=items',
    },
    {
      key: 'lent',
      label: '貸出中',
      value: s.lent_out,
      unit: '点',
      sub: s.overdue > 0 ? `返却遅延 ${s.overdue} 点` : '返却遅延はありません',
      tone: s.overdue > 0 ? 'danger' : 'plain',
      icon: ArrowRightLeft,
      to: '/equipment/lendings',
    },
    {
      key: 'repair',
      label: '稼働停止中',
      value: s.in_repair,
      unit: '点',
      sub: `未対応の記録 ${s.open_maintenance} 件`,
      tone: s.open_maintenance > 0 ? 'warning' : 'plain',
      icon: Wrench,
      to: '/equipment/maintenance',
    },
    {
      key: 'inventory',
      label: '棚卸し',
      value: s.pending_inventory,
      unit: '件',
      sub: '下書き・実施中のもの',
      tone: 'plain',
      icon: ClipboardCheck,
      to: '/equipment/inventory',
    },
  ];
}
