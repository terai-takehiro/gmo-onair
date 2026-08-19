/**
 * KPI の帯 (v4) — `platform/pages/salesDashboard/KpiStrip.tsx` と同じ形。
 * 数字は大きく・単位は別要素で小さく（指示書5）。カードを並べず1本の帯にする。
 */
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface StripItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  unit?: string;
  sub?: string;
  danger?: boolean;
}

export function Strip({ items }: { items: StripItem[] }) {
  return (
    <div className={cn(
      'rounded-card grid gap-y-3 border border-border bg-card px-1 py-3',
      items.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3',
    )}
    >
      {items.map((k, i) => (
        <div key={k.key} className={cn('min-w-0 px-3.5 lg:px-5', i > 0 && 'sm:border-l sm:border-border')}>
          <p className="text-note flex items-center gap-1.5 truncate text-muted-foreground">
            <k.icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {k.label}
          </p>
          <p className="mt-0.5 flex items-baseline gap-1">
            <StatValue size="sm" className={cn(k.danger && 'text-destructive')}>{k.value}</StatValue>
            {k.unit && <span className="text-note text-muted-foreground">{k.unit}</span>}
          </p>
          {k.sub && <p className="text-note truncate text-muted-foreground">{k.sub}</p>}
        </div>
      ))}
    </div>
  );
}
