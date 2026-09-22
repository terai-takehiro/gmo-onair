/**
 * 営業活動記録の絞り込み (v4)
 *
 * PC は1段の帯（`projectList/FilterBar.tsx` と同じ骨格）、スマホは
 * `MobileFilterBar`（M8）に畳む。**検索は畳まない**（探すのは絞り込みではなく
 * 目的そのもの）。
 *
 * ── 担当者の絞り込み（PR #727 の宿題②）──────────────────────
 *
 * 「担当者」＝**活動を記録した人**（`activity_logs.user_id`）。サーバーの
 * `GET /activity-logs` と `GET /activity-logs/by-project` の**両方**が `user_id` を
 * 受け取るので、案件別・時系列の両方に同じ欄を出します（URL の `?user=` も1つ）。
 * 片方にしか出さないと、並びを切り替えた瞬間に**URL では絞っているのに
 * 画面に欄が無い**状態になります。
 *
 * 案件別は検索と担当者だけ（期限のチップは `DueChips.tsx` が外に出す）なので、
 * 時系列の帯とは別の小さな帯（`ProjectFilterBar`）にしています。
 */
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MobileFilterBar, MobileFilterField, MobileFilterSegments } from '@gmo-onair/shared/src/client-v4/mobileFilterBar';
import { ACTIVITY_TYPES } from './kinds';
import { ALL_ASSIGNEES, type AssigneeOption } from './logParams';

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
  /** 記録者の id（空文字＝すべて）。URL の `?user=` と同じ値 */
  userFilter: string;
  onUserFilter: (v: string) => void;
  /** `assigneeOptions()` の返り（先頭が「すべて」「自分」） */
  assignees: AssigneeOption[];
}

/** 案件別の絞り込み（検索＋記録者）。時系列の帯と同じ欄を、必要な分だけ持つ */
export type ProjectFiltersProps = Pick<
  ActivityFiltersProps, 'search' | 'onSearch' | 'userFilter' | 'onUserFilter' | 'assignees'
>;

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date', label: '活動日が新しい順' },
  { value: 'next_action', label: '次のアクション期限順' },
];

const ORIGIN_SEGMENTS: Array<[OriginFilter, string]> = [
  ['', 'すべて'], ['ai', 'AI作成'], ['human', '手入力'],
];

const TYPE_W = 'h-9 w-[128px]'; // ui-tokens-ok: 「デモ/見学」まで1行で収まる幅
const SORT_W = 'h-9 w-[188px]'; // ui-tokens-ok: 「次のアクション期限順」が1行で収まる幅
const USER_W = 'h-9 w-[200px]'; // ui-tokens-ok: 「自分（山田 太郎）」に余裕を持たせた幅（7段の 200px）

/**
 * 記録者の選択。PC の帯とスマホのシートで**同じ部品**を使う
 *
 * ⚠️ **見出しを「担当者」にしないこと。** 絞っているのは `activity_logs.user_id`（活動を記録した人）で、
 * 案件の担当者（`projects.assigned_to`）ではありません（時系列・MCP の `list_activity_logs` と同じ意味に
 * 揃えたため・`activity-by-project.service.ts` の頭注）。営業担当が「担当者」と読むと**案件の担当**を思うので、
 * 見出しと中身が食い違って「自分の案件なのに出ない」になります。案件の担当者で絞る口は別の引数で足す方針です。
 * （片方だけ選択肢の並びが変わる、を起こさない）。
 * Radix の `Select` は空文字の値を持てないので、「すべて」は `ALL_ASSIGNEES` で受け渡す。
 */
function AssigneeSelect({ value, onChange, options, className }: {
  value: string;
  onChange: (v: string) => void;
  options: AssigneeOption[];
  className?: string;
}) {
  return (
    <Select value={value || ALL_ASSIGNEES} onValueChange={(v) => onChange(v === ALL_ASSIGNEES ? '' : v)}>
      <SelectTrigger className={className} aria-label="記録者で絞り込む"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

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
      <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} className={USER_W} />
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
  const activeCount = (p.typeFilter ? 1 : 0) + (p.originFilter ? 1 : 0) + (p.sort !== 'date' ? 1 : 0)
    + (p.userFilter ? 1 : 0);
  return (
    <div className="sm:hidden">
      <MobileFilterBar
        search={{ value: p.search, onChange: p.onSearch, placeholder: '件名・案件名・顧客名で検索' }}
        activeCount={activeCount}
        onClearAll={() => { p.onTypeFilter(''); p.onOriginFilter(''); p.onSort('date'); p.onUserFilter(''); }}
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
        <MobileFilterField label="記録者" hint="活動を記録した人で絞り込みます">
          <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} />
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

/**
 * 案件別の絞り込み。PC は検索＋担当者の1段、スマホは `MobileFilterBar` に畳む
 * （検索は畳まない・担当者だけシートへ）。
 */
export function ProjectFilterBar(p: ProjectFiltersProps) {
  return (
    <>
      {/* 2つしか並ばず折り返さないので、検索は残りの幅を全部使う（最小幅を手で書かない） */}
      <div className="hidden items-center gap-2 sm:flex">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="案件名・クライアント名・件名で検索"
            className="h-9 pl-9"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            aria-label="案件を検索"
          />
        </div>
        <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} className={USER_W} />
      </div>
      <div className="sm:hidden">
        <MobileFilterBar
          search={{ value: p.search, onChange: p.onSearch, placeholder: '案件名・クライアント名・件名で検索', label: '案件を検索' }}
          activeCount={p.userFilter ? 1 : 0}
          onClearAll={() => p.onUserFilter('')}
          title="案件別の絞り込み"
        >
          <MobileFilterField label="記録者" hint="活動を記録した人で絞り込みます">
            <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} />
          </MobileFilterField>
        </MobileFilterBar>
      </div>
    </>
  );
}
