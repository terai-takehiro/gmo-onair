/**
 * 絞り込み（スマホ・1行に畳む形）
 *
 * 共通の `MobileFilterBar` をそのまま使います。**検索欄は畳みません** —
 * 探すことは絞り込みではなく目的そのもので、畳むと打つだけで2タップかかります。
 *
 * 効いている数の数え方は `searchFilters.ts` の `activeFilterCount` に1つだけ置いて
 * あります（PC の列と別々に数えると、片方だけ数え漏らします）。
 */
import { MobileFilterBar, MobileFilterField, MobileFilterSegments } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { Input } from '@gmo-onair/shared/src/client/ui/input';
import type { WikiSpace } from '@gmo-onair/shared/src/wiki/types';
import type { WikiUserBrief } from '@/components/page/pageOpsApi';
import { WITHIN_CHOICES, activeFilterCount, type WikiSearchFilters } from './searchFilters';

const CONTROL =
  'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground';

export default function SearchFilterSheet({
  text, onText, filters, onChange, onClear, spaces, users, counts, total,
}: {
  text: string;
  onText: (v: string) => void;
  filters: WikiSearchFilters;
  onChange: (next: WikiSearchFilters) => void;
  onClear: () => void;
  spaces: WikiSpace[] | undefined;
  users: WikiUserBrief[] | undefined;
  counts: Map<string, number>;
  total: number;
}) {
  return (
    <div className="lg:hidden">
      <MobileFilterBar
        search={{ value: text, onChange: onText, placeholder: 'Wiki を検索', label: 'Wiki を検索' }}
        activeCount={activeFilterCount(filters)}
        onClearAll={onClear}
        sub="スペース・タグ・担当・更新日で絞れます"
        note="公開されているページだけが出ます（下書きは出ません）。"
      >
        <MobileFilterField label="スペース">
          <select
            className={CONTROL}
            value={filters.spaceId}
            onChange={(e) => onChange({ ...filters, spaceId: e.target.value })}
          >
            <option value="">すべて（{total}件）</option>
            {(spaces ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{counts.get(s.id) ?? 0}件）
              </option>
            ))}
          </select>
        </MobileFilterField>

        <MobileFilterField label="タグ" hint="タグ名がそのまま一致するページだけ">
          <Input
            value={filters.tag}
            onChange={(e) => onChange({ ...filters, tag: e.target.value })}
            placeholder="タグ名"
          />
        </MobileFilterField>

        <MobileFilterField label="更新日">
          <MobileFilterSegments
            label="更新日"
            items={WITHIN_CHOICES.map(([days, label]) => [String(days), label] as [string, string])}
            value={String(filters.withinDays)}
            onChange={(v) => onChange({ ...filters, withinDays: Number(v) })}
          />
        </MobileFilterField>

        <MobileFilterField label="担当">
          <select
            className={CONTROL}
            value={filters.ownerId}
            onChange={(e) => onChange({ ...filters, ownerId: e.target.value })}
          >
            <option value="">指定なし</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </MobileFilterField>
      </MobileFilterBar>
    </div>
  );
}
