/**
 * ① ダッシュボード上辺の数字（GPM）
 *
 * ── モックどおり5枚（v4 大⑤で2枚足した）────────────────────
 *
 * 進行中プロジェクト / 今週の工程期限 / 未確認事項 /
 * **個別見積 未提出** / **検収待ち**。
 *
 * 後ろの2枚は migration 173 まで出していませんでした（`estimates` が案件に
 * しかぶら下がれず、提出先の列も無かったため）。**数えられるようになったので
 * 0 は「無い」という正しい答え**です — 数えられなかった頃は枠ごと出しませんでした。
 *
 * ── 「今週の期限」の数え方を書く ────────────────────────────
 *
 * サーバーが返すのは**プロジェクトごとに期限がいちばん近い1件**だけなので、
 * ここで数えるのも1プロジェクト1件です。工程の下のタスクを全部数えるには
 * サーバーに口が要ります。**数え方を補足に書いて**、数字を読み違えないようにします。
 */
import { CalendarDays, CircleHelp, ClipboardCheck, FileText, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
// 金額は**万円で丸めない**（桁が読めないと判断に使えない）。組み立ては共通の1本に通す
import { formatCurrency } from '@/lib/format';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { ymd, type GpmOpenItem, type GpmProjectRow } from '../../types';
import type { GpmEstimateSummary } from '../../queries';

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

export function KpiStrip({ kpis, est }: { kpis: GpmKpis; est?: GpmEstimateSummary }) {
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
    {
      key: 'estimate', label: '個別見積 未提出', icon: FileText,
      value: est?.draft ?? 0, unit: '件',
      // **金額も出す。** 件数だけだと、1件が小さいのか大きいのかが読めない
      sub: est ? `作成中 ${formatCurrency(est.draft_amount)} ・ 返事待ち ${est.sent}件` : '読み込み中',
      to: '/gpm/projects',
    },
    {
      key: 'inspection', label: '検収待ち', icon: ClipboardCheck,
      value: est?.awaiting_inspection ?? 0, unit: '件',
      // **但し書きを出す。** プロジェクトの見積は売上に変換できない
      // （`revenues.project_id` が NOT NULL）ので、請求が立っていない受注も
      // ここに入る。書かないと「検収待ち」の意味を読み違える
      sub: est ? `${formatCurrency(est.awaiting_inspection_amount)} ・ 請求前のものも含む` : '読み込み中',
      danger: (est?.awaiting_inspection ?? 0) > 0,
      to: '/gpm/projects',
    },
  ];

  return (
    <div className="rounded-card grid grid-cols-1 gap-y-3 border border-border bg-card px-1 py-3 sm:grid-cols-3 sm:gap-y-0 xl:grid-cols-5">
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
            {/* **カードの但し書きは読ませる文**なので `text-note`（スマホで 13px に上がる）。
                `text-sub-sm` は件数の数字や札のための段で、上がらない */}
            <p className="text-note truncate text-muted-foreground">{c.sub}</p>
          </>
        );
        return (
          <div
            key={c.key}
            className={cn(
              'min-w-0 px-3.5 lg:px-5',
              // 3列のときは4枚目で行が変わるので、そこだけ区切り線を消す
              i > 0 && 'sm:border-l sm:border-border',
              i === 3 && 'sm:border-l-0 xl:border-l',
            )}
          >
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
