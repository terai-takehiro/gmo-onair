// 制作技術支援トップ — 「直近の本番・収録」（横スクロールのカード列）。
// `search` は無視し、`segment` 絞り込みだけが効いた `active` のうち
// `next_date` がある項目を昇順で先頭3件。
import { relativeDayLabel, monthDay } from '@/lib/dateFmt';
import { topItemMeta, topItemHref } from './topHelpers';
import type { TopItem } from '@/lib/topApi';

function UpNextCard({ item, onNavigate }: { item: TopItem; onNavigate: (href: string) => void }) {
  const { month, day } = monthDay(item.next_date!);
  return (
    <button
      type="button"
      onClick={() => onNavigate(topItemHref(item))}
      className="min-h-tap flex w-[240px] shrink-0 snap-start flex-col gap-1 rounded-card border border-border bg-card px-4 py-3 text-left hover:bg-muted/50 active:bg-muted"
    >
      <span className="flex items-baseline gap-1.5">
        <span className="text-badge rounded-badge-xs bg-primary-surface-weak px-1.5 py-0.5 text-primary">
          {relativeDayLabel(item.next_date!)}
        </span>
        <span className="text-sub-sm text-muted-foreground">{month}{day}日</span>
      </span>
      <span className="text-list block truncate font-bold">{item.name}</span>
      <span className="text-sub-sm block truncate text-muted-foreground">{topItemMeta(item)}</span>
    </button>
  );
}

export function UpNextSection({
  items, onNavigate,
}: {
  items: TopItem[];
  onNavigate: (href: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sub-sm font-bold tracking-wide text-muted-foreground">直近の本番・収録</h2>
      <div className="flex snap-x gap-3 overflow-x-auto pb-1">
        {items.map((item) => (
          <UpNextCard key={`${item.kind}-${item.id}`} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}
