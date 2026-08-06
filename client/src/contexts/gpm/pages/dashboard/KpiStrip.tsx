/**
 * ① ダッシュボード上辺の数字（GPM）
 *
 * ── モックは5枚、ここは3枚 ──────────────────────────────────
 *
 * モックの5枚は 進行中プロジェクト / 今週の工程期限 / 未確認事項 /
 * **個別見積 未提出** / **検収待ち** ですが、後ろの2枚は出しません。
 * プロジェクト管理には**見積・請求のデータがまだ1件もありません**
 * （既存の `estimates` は案件（GLS）にぶら下がる作りで、モックが持つ
 *  「提出先（自社／依頼元／PM会社）」の列がありません）。
 * **数えられないものをそれらしく出さない** — 0 と出すのも「無い」と
 * 言い切ることになるので、枠ごと出さずに理由を画面に書きます。
 *
 * ── 「今週の期限」の数え方を書く ────────────────────────────
 *
 * サーバーが返すのは**プロジェクトごとに期限がいちばん近い1件**だけなので、
 * ここで数えるのも1プロジェクト1件です。工程の下のタスクを全部数えるには
 * サーバーに口が要ります。**数え方を補足に書いて**、数字を読み違えないようにします。
 */
import { AlertTriangle, CalendarDays, CircleHelp, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { ymd, type GpmOpenItem, type GpmProjectRow } from '../../types';

export interface GpmKpis {
  active: number;
  planning: number;
  onhold: number;
  weekDue: number;
  overdueTasks: number;
  openAsks: number;
  overdueAsks: number;
}

/**
 * 数字はここで**1回だけ**数えます。カードと下の枠が別々に数えると、
 * 片方だけ条件を直したときに食い違います。
 */
export function countKpis(
  projects: GpmProjectRow[],
  asks: GpmOpenItem[],
  today: string,
  weekEnd: string,
): GpmKpis {
  const live = projects.filter((p) => p.status !== 'done');
  const dues = live.map((p) => ymd(p.next_due)).filter((d): d is string => d !== null);
  const openAsks = asks.filter((a) => a.status !== 'resolved');
  return {
    active: projects.filter((p) => p.status === 'active').length,
    planning: projects.filter((p) => p.status === 'planning').length,
    onhold: projects.filter((p) => p.status === 'onhold').length,
    weekDue: dues.filter((d) => d >= today && d <= weekEnd).length,
    overdueTasks: dues.filter((d) => d < today).length,
    openAsks: openAsks.length,
    overdueAsks: openAsks.filter((a) => {
      const d = ymd(a.due_date);
      return d !== null && d < today;
    }).length,
  };
}

interface Cell {
  key: string;
  label: string;
  icon: typeof FolderOpen;
  value: number;
  unit: string;
  sub: string;
  danger?: boolean;
  to?: string;
}

export function KpiStrip({ kpis }: { kpis: GpmKpis }) {
  const cells: Cell[] = [
    {
      key: 'active', label: '進行中プロジェクト', icon: FolderOpen,
      value: kpis.active, unit: '件',
      sub: `準備中 ${kpis.planning} ・ 保留 ${kpis.onhold}`,
      to: '/gpm/projects',
    },
    {
      key: 'week', label: '今週が期限の作業', icon: CalendarDays,
      value: kpis.weekDue, unit: '件',
      sub: kpis.overdueTasks > 0
        ? `期限が過ぎているもの ${kpis.overdueTasks}件`
        : 'プロジェクトごとに直近の1件だけ',
      danger: false,
      to: '/gpm/tasks?tab=next',
    },
    {
      key: 'asks', label: '未確認事項', icon: CircleHelp,
      value: kpis.openAsks, unit: '件',
      sub: kpis.overdueAsks > 0 ? `返事の期限が過ぎているもの ${kpis.overdueAsks}件` : '先方・社内の判断待ち',
      danger: kpis.openAsks > 0,
      to: '/gpm/tasks',
    },
  ];

  return (
    <div className="rounded-card grid grid-cols-1 gap-y-3 border border-border bg-card px-1 py-3 sm:grid-cols-3 sm:gap-y-0">
      {cells.map((c, i) => {
        const Icon = c.icon;
        const body = (
          <>
            <p className="text-note flex items-center gap-1.5 truncate text-muted-foreground">
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {c.label}
            </p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <StatValue size="sm" className={cn(c.danger && 'text-destructive')}>{c.value}</StatValue>
              <span className="text-note text-muted-foreground">{c.unit}</span>
            </p>
            <p className="text-sub-sm truncate text-muted-foreground">{c.sub}</p>
          </>
        );
        return (
          <div key={c.key} className={cn('min-w-0 px-3.5 lg:px-5', i > 0 && 'sm:border-l sm:border-border')}>
            {c.to ? (
              <Link
                to={c.to}
                className="rounded-note block hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : body}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 出していない数字とその理由。
 * **書かないと「まだ作っていない」のか「0 件」なのか分かりません。**
 */
export function NotCounted() {
  return (
    <p className="text-note flex items-start gap-2 text-muted-foreground">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        モックにある「個別見積 未提出」「検収待ち」は出していません。プロジェクト管理には
        見積・請求のデータがまだ無く（見積は案件に紐づく作りで、提出先を持つ列がありません）、
        <strong>数えられないものをそれらしく出さない</strong>と決めているためです。
      </span>
    </p>
  );
}
