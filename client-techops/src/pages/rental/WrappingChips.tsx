// カテゴリ絞り込み専用の折り返しチップ行（RentalSearchPage.tsx から分離）。
//
// 共通の `FilterChips`（`shared/src/client/ui/filterChips.tsx`）は
// 「折り返すと一覧の開始位置が行ごとに動く」ため意図して横スクロールにしているが、
// レンタル機材検索のカテゴリは数が多く、横スクロールだと後ろの選択肢が見えなくなる
// （検索欄・件数はこのチップより上に置いてあるので、ここが折り返して行数が
// 変わっても一覧の開始位置は動かない）。この画面専用に個別チップ＋折り返しにする。
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
