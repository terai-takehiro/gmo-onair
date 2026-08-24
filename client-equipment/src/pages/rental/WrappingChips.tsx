// カテゴリ絞り込み専用の折り返しチップ行。`client-techops/src/pages/rental/WrappingChips.tsx`
// と同じ実装（共通の `FilterChips` は意図して横スクロールにしているが、レンタル機材の
// カテゴリは数が多く、横スクロールだと後ろの選択肢が見えなくなるため）。
import type { FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import { cn } from '@/lib/utils';

export function WrappingChips<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: FilterChipItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.key)}
            className={cn(
              'min-h-tap inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-control border px-3 py-1.5 text-sub lg:min-h-[36px]',
              active
                ? 'border-primary bg-primary-surface font-bold text-primary'
                : 'border-border bg-card text-muted-foreground hover:bg-muted',
            )}
          >
            {item.label}
            {item.count !== null && (
              <span className={cn('font-number text-sub-sm', !active && 'text-muted-foreground')}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
