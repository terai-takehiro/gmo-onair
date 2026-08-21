/**
 * 「返してもらう」— スマホのカード積み
 *
 * 監査（`docs/v4-native-ui-audit-2026-08-20.md` equipment-dashboard）:
 * 「リストが Row の stackOnMobile 任せで、PC の行を縦積みにしただけ
 * （専用のカードデザインではない）」を受けて、PC の行（`Row`）とは別に
 * スマホだけ独立したカードを積む形にした。**PC の行を縮めたものではない**
 * （このアプリの `scan/ScanHistoryCards.tsx` / `search/SearchCards.tsx` と
 * 同じ考え方）。
 *
 * **超過・当日・先のものを色とアイコンで先に見分けられるようにした。**
 * 押すと貸出・返却へ行く — この一覧に1件ずつの詳細ページは無く、
 * PC 版の「返却を記録」ボタンと同じ行き先（データも判定も変えていない）。
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Package } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { dueIn, md } from './dueIn';
import type { Stats } from './types';

type Lending = Stats['recent_lendings'][number];

export function LendingCards({ rows }: { rows: Lending[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((l) => {
        const days = dueIn(l.due_date);
        const late = days !== null && days < 0;
        const isToday = days === 0;
        const tone = late ? 'danger' : isToday ? 'warning' : 'plain';
        const Icon = late ? AlertTriangle : isToday ? Clock : Package;
        return (
          <Link
            key={l.id}
            to="/equipment/lendings"
            className="rounded-card min-h-tap flex items-start gap-3 border border-border bg-card p-3 active:bg-muted"
          >
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              tone === 'danger' ? 'bg-destructive-surface text-destructive'
                : tone === 'warning' ? 'bg-warning-surface text-warning'
                  : 'bg-muted text-muted-foreground',
            )}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-list block truncate font-bold">
                {l.equipment_name}{l.unit_number ? ` No.${l.unit_number}` : ''}
              </span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                {[l.borrower_name, l.project_name, l.gls_number].filter(Boolean).join(' ／ ')}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="font-number text-sub block text-muted-foreground">返却 {md(l.due_date)}</span>
              {days !== null && (
                <span className={cn(
                  'rounded-badge-xs mt-1 inline-block px-1.5 py-0.5 text-badge',
                  tone === 'danger' ? 'bg-destructive-surface text-destructive'
                    : tone === 'warning' ? 'bg-warning-surface text-warning'
                      : 'bg-muted text-muted-foreground',
                )}>
                  {late ? `${-days}日 超過` : isToday ? '本日返却' : `あと${days}日`}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
