/**
 * 絞り込み（PC・モック `Search.dc.html` の 220px の列）
 *
 * ⚠️ **これはナビゲーションの列ではありません。** Wiki のナビは共通の左メニュー
 * 1本だけで、ツリーもその中に出ます（`client-wiki/CLAUDE.md`）。ここは本文の中に
 * 置く絞り込みなので、画面の端には付けず、結果と同じ枠の中に並べます。
 *
 * スマホではこの列を出さず、`SearchFilterSheet`（1行に畳む形）に替えます。
 * 出し分けは CSS（`hidden lg:flex`）で、早い段階の `return` はしません。
 */
import type { WikiSpace } from '@gmo-onair/shared/src/wiki/types';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import { cn } from '@/lib/utils';
import type { WikiUserBrief } from '@/components/page/pageOpsApi';
import { WITHIN_CHOICES, type WikiSearchFilters } from './searchFilters';

const CONTROL =
  'h-9 w-full rounded-control border border-border bg-card px-2 text-sub text-foreground';

export interface FilterPanelProps {
  filters: WikiSearchFilters;
  onChange: (next: WikiSearchFilters) => void;
  spaces: WikiSpace[] | undefined;
  users: WikiUserBrief[] | undefined;
  /** スペースごとの件数（スペースで絞る前の結果から数えたもの） */
  counts: Map<string, number>;
  /** 絞り込む前の全件 */
  total: number;
}

export default function SearchFilterPanel({
  filters, onChange, spaces, users, counts, total,
}: FilterPanelProps) {
  const rows: Array<{ id: string; name: string; color: string | null; n: number }> = [
    { id: '', name: 'すべて', color: null, n: total },
    ...(spaces ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      n: counts.get(s.id) ?? 0,
    })),
  ];

  return (
    <aside className="hidden w-[200px] shrink-0 flex-col gap-3.5 lg:flex">
      <section className="rounded-card border border-border bg-card px-1.5 py-2.5">
        <p className="v4-eyebrow px-2 pb-1.5">スペース</p>
        {rows.map((r) => {
          const on = filters.spaceId === r.id;
          // 1件も無いスペースは押せないようにする（押しても空の一覧が出るだけ）
          const dead = r.n === 0 && !on;
          return (
            <button
              key={r.id || 'all'}
              type="button"
              disabled={dead}
              onClick={() => onChange({ ...filters, spaceId: r.id })}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-control px-2 text-left',
                on ? 'bg-primary-surface-weak text-primary' : 'text-foreground hover:bg-secondary',
                dead && 'text-muted-foreground hover:bg-transparent',
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-badge-xs"
                style={{ background: r.color ?? 'rgb(var(--border))' }}
                aria-hidden
              />
              <span className={cn('min-w-0 flex-1 truncate text-sub', on && 'font-bold')}>{r.name}</span>
              <span className="font-number text-sub-sm text-muted-foreground">{r.n}</span>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2 rounded-card border border-border bg-card px-3 py-2.5">
        <label className="v4-eyebrow" htmlFor="wiki-search-tag">タグ</label>
        <Input
          id="wiki-search-tag"
          value={filters.tag}
          onChange={(e) => onChange({ ...filters, tag: e.target.value })}
          placeholder="タグ名"
          className="h-9"
        />
        <p className="text-note text-muted-foreground">タグ名がそのまま一致するページだけ</p>

        <p className="v4-eyebrow pt-1.5">更新日</p>
        <div className="flex gap-1.5">
          {WITHIN_CHOICES.map(([days, label]) => (
            <button
              key={days}
              type="button"
              onClick={() => onChange({ ...filters, withinDays: days })}
              className={cn(
                'h-7 flex-1 rounded-control px-2 text-sub-sm',
                filters.withinDays === days
                  ? 'bg-primary-surface-weak font-bold text-primary'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="v4-eyebrow pt-1.5" htmlFor="wiki-search-owner">担当</label>
        <select
          id="wiki-search-owner"
          className={CONTROL}
          value={filters.ownerId}
          onChange={(e) => onChange({ ...filters, ownerId: e.target.value })}
        >
          <option value="">指定なし</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </section>

      <p className="px-1 text-note leading-relaxed text-muted-foreground">
        タイトル・見出し・本文の順に重く見て並べます。
      </p>
    </aside>
  );
}
