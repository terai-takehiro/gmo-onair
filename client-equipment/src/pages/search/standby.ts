/**
 * 打ち込む前に出す「いまの様子」の中身。
 *
 * **PC（`SearchResultRows.tsx`）とスマホ（`SearchCards.tsx`）が同じ関数を読む。**
 * 写すと、片方だけ直したときに「PC では貸出中の件数が出るのにスマホでは出ない」
 * が起きる。ここは**判定の中身**（何を・どの条件で出すか）だけを持ち、
 * 見た目（Row か カードか）は呼ぶ側が決める。
 */
import { AlertTriangle, ArrowRightLeft, Wrench, type LucideIcon } from 'lucide-react';

export interface StandbyRow {
  key: string;
  icon: LucideIcon;
  /** アイコンの地の色。スマホのカードだけが使う（PC の Row 版は使わなくてよい） */
  tone: string;
  title: string;
  sub: string;
  to: string;
}

export function buildStandbyRows(stats: Record<string, number> | undefined): StandbyRow[] {
  const rows: StandbyRow[] = [];
  if (stats?.lent_out) {
    rows.push({
      key: 'lent', icon: ArrowRightLeft, tone: 'bg-primary-surface text-primary',
      title: `貸出中 ${stats.lent_out} 点`,
      sub: stats.overdue ? `うち ${stats.overdue} 点が返却予定日を過ぎています` : '返却予定日を過ぎたものはありません',
      to: '/equipment/lendings',
    });
  }
  if (stats?.open_maintenance) {
    rows.push({
      key: 'maint', icon: Wrench, tone: 'bg-warning-surface text-warning',
      title: `直していないもの ${stats.open_maintenance} 件`,
      sub: '故障・点検の記録が開いたままです',
      to: '/equipment/maintenance',
    });
  }
  if (stats?.pending_inventory) {
    rows.push({
      key: 'inv', icon: AlertTriangle, tone: 'bg-destructive-surface text-destructive',
      title: `棚卸しの途中 ${stats.pending_inventory} 件`,
      sub: 'まだ確認できていない場所があります',
      to: '/equipment/inventory',
    });
  }
  return rows;
}
