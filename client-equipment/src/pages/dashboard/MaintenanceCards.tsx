/**
 * 「稼働停止中の機材」— スマホのカード積み
 *
 * `LendingCards.tsx` と同じ理由（監査 equipment-dashboard）。
 * 対応中／未対応を色で先に見分けられるようにする。押すとメンテナンスへ行く
 * （PC 版の行と同じく、この一覧に1件ずつの詳細ページは無い）。
 */
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import type { Stats } from './types';

type MaintenanceRow = Stats['recent_maintenance'][number];

export function MaintenanceCards({ rows }: { rows: MaintenanceRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((m) => {
        const inProgress = m.status === 'in_progress';
        return (
          <Link
            key={m.id}
            to="/equipment/maintenance"
            className="rounded-card min-h-tap flex items-start gap-3 border border-border bg-card p-3 active:bg-muted"
          >
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              inProgress ? 'bg-info-surface text-info' : 'bg-warning-surface text-warning',
            )}>
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-list block truncate font-bold">{m.title}</span>
              <span className="text-sub mt-0.5 block truncate text-muted-foreground">
                {m.equipment_name} ・ {statusOf(MAINTENANCE_TYPE, m.record_type).label}
              </span>
            </span>
            <span className={cn(
              'rounded-badge-xs mt-0.5 shrink-0 px-1.5 py-0.5 text-badge',
              inProgress ? 'bg-info-surface text-info' : 'bg-warning-surface text-warning',
            )}>
              {statusOf(MAINTENANCE_STATUS, m.status).label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
