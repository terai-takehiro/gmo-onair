/**
 * 営業活動記録の絞り込み (v4)
 *
 * PC は1段の帯（`projectList/FilterBar.tsx` と同じ骨格）、スマホは
 * `MobileFilterBar`（M8）に畳む。**検索は畳まない**（探すのは絞り込みではなく
 * 目的そのもの）。
 */
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MobileFilterBar, MobileFilterField, MobileFilterSegments } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { ACTIVITY_TYPES } from './kinds';

export type OriginFilter = '' | 'ai' | 'human';
export type SortKey = 'date' | 'next_action';

export interface ActivityFiltersProps {
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string;
  onTypeFilter: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  originFilter: OriginFilter;
  onOriginFilter: (v: OriginFilter) => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date', label: '活動日が新しい順' },
  { value: 'next_action', label: '次のアクション期限順' },
];

const ORIGIN_SEGMENTS: Array<[OriginFilter, string]> = [
  ['', 'すべて'], ['ai', 'AI作成'], ['human', '手入力'],
];

const TYPE_W = 'h-9 w-[128px]'; // ui-tokens-ok: 「デモ/見学」まで1行で収まる幅
const SORT_W = 'h-9 w-[188px]'; // ui-tokens-ok: 「次のアクション期限順」が1行で収まる幅

export function DesktopFilterBar(p: ActivityFiltersProps) {
  return (
    <div className="hidden flex-wrap items-center gap-2 sm:flex">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="件名・案件名・顧客名で検索"
          className="h-9 pl-9"
          value={p.search}
          onChange={(e) => p.onSearch(e.target.value)}
          aria-label="活動記録を検索"
        />
      </div>
      <Select value={p.typeFilter || 'all'} onValueChange={(v) => p.onTypeFilter(v === 'all' ? '' : v)}>
        <SelectTrigger className={TYPE_W} aria-label="種別で絞り込む"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全種別</SelectItem>
          {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={p.sort} onValueChange={(v) => p.onSort(v as SortKey)}>
        <SelectTrigger className={SORT_W} aria-label="並び順"><SelectValue /></SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <MobileFilterSegments items={ORIGIN_SEGMENTS} value={p.originFilter} onChange={p.onOriginFilter} label="入力元で絞り込む" />
    </div>
  );
}

export function ActivityMobileFilters(p: ActivityFiltersProps) {
  const activeCount = (p.typeFilter ? 1 : 0) + (p.originFilter ? 1 : 0) + (p.sort !== 'date' ? 1 : 0);
  return (
    <div className="sm:hidden">
      <MobileFilterBar
        search={{ value: p.search, onChange: p.onSearch, placeholder: '件名・案件名・顧客名で検索' }}
        activeCount={activeCount}
        onClearAll={() => { p.onTypeFilter(''); p.onOriginFilter(''); p.onSort('date'); }}
        title="活動記録の絞り込み"
      >
        <MobileFilterField label="種別">
          <Select value={p.typeFilter || 'all'} onValueChange={(v) => p.onTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="種別で絞り込む"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全種別</SelectItem>
              {ACTIVITY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </MobileFilterField>
        <MobileFilterField label="入力元">
          <MobileFilterSegments items={ORIGIN_SEGMENTS} value={p.originFilter} onChange={p.onOriginFilter} label="入力元で絞り込む" />
        </MobileFilterField>
        <MobileFilterField label="並び順">
          <Select value={p.sort} onValueChange={(v) => p.onSort(v as SortKey)}>
            <SelectTrigger aria-label="並び順"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </MobileFilterField>
      </MobileFilterBar>
    </div>
  );
}
