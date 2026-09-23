/**
 * 営業活動記録の絞り込み (v4)
 *
 * PC は1段の帯（`projectList/FilterBar.tsx` と同じ骨格）、スマホは
 * `MobileFilterBar`（M8）に畳む。**検索は畳まない**（探すのは絞り込みではなく
 * 目的そのもの）。
 *
 * ── 人の絞り込みは2つある（PR #727 の宿題② → #734 の残り）─────────
 *
 *   担当者 … **案件の担当者**（`projects.assigned_to`）。URL は `?owner=`・サーバーは `owner_id`
 *   記録者 … **活動を記録した人**（`activity_logs.user_id`）。URL は `?user=`・サーバーは `user_id`
 *
 * 営業担当が「自分の案件」を見たいときに使うのは**担当者**です。記録者で絞ると、
 * 自分が担当でも**他の人が記録したやり取り（先方からのメールの取込など）が落ちます**。
 * 逆に「自分が書いた記録」を探すときは記録者。**意味が違うので1つの欄に混ぜません。**
 *
 * どちらも `GET /activity-logs` と `GET /activity-logs/by-project` の**両方**が受け取るので、
 * 案件別・時系列の両方に同じ欄を出します。
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
  /** 案件の担当者の id（空文字＝すべて）。URL の `?owner=` と同じ値 */
  ownerFilter: string;
  onOwnerFilter: (v: string) => void;
  /** 担当者の選択肢（記録者と同じ人の一覧から作る） */
  owners: AssigneeOption[];
}

/** 案件別の絞り込み（検索＋担当者＋記録者）。時系列の帯と同じ欄を、必要な分だけ持つ */
export type ProjectFiltersProps = Pick<
  ActivityFiltersProps,
  'search' | 'onSearch' | 'userFilter' | 'onUserFilter' | 'assignees' | 'ownerFilter' | 'onOwnerFilter' | 'owners'
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
 * 人の選択（記録者・担当者の両方が使う部品）。PC の帯とスマホのシートで**同じ部品**を使う
 * （片方だけ選択肢の並びが変わる、を起こさない）。
 *
 * ⚠️ **見出しと中身を食い違わせないこと。** 記録者の欄は `activity_logs.user_id`（活動を記録した人）、
 * 担当者の欄（`OwnerSelect`）は `projects.assigned_to`（案件の担当者）で絞ります。
 * #734 では記録者の欄にしか無かったのに見出しが「担当者」で、営業担当が**案件の担当**と読んで
 * 「自分の案件なのに出ない」になっていました。いまは両方あるので、欄ごとに正しい名前を付けます。
 * Radix の `Select` は空文字の値を持てないので、「すべて」は `ALL_ASSIGNEES` で受け渡す。
 */
function AssigneeSelect({ value, onChange, options, className, ariaLabel = '記録者で絞り込む' }: {
  value: string;
  onChange: (v: string) => void;
  options: AssigneeOption[];
  className?: string;
  /** 担当者と記録者で同じ部品を使うので、読み上げの名前だけ渡し分ける */
  ariaLabel?: string;
}) {
  return (
    <Select value={value || ALL_ASSIGNEES} onValueChange={(v) => onChange(v === ALL_ASSIGNEES ? '' : v)}>
      <SelectTrigger className={className} aria-label={ariaLabel}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/**
 * 担当者（**案件の担当者**）の選択。部品は記録者と同じで、値と読み上げの名前だけが違う。
 * 「すべて」の次に「自分」が来るので、営業担当は2回押すだけで「自分の案件」になる。
 */
function OwnerSelect(p: Pick<ActivityFiltersProps, 'ownerFilter' | 'onOwnerFilter' | 'owners'> & { className?: string }) {
  return (
    <AssigneeSelect
      value={p.ownerFilter}
      onChange={p.onOwnerFilter}
      options={p.owners}
      className={p.className}
      ariaLabel="担当者で絞り込む"
    />
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
      <OwnerSelect {...p} className={USER_W} />
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
    + (p.userFilter ? 1 : 0) + (p.ownerFilter ? 1 : 0);
  return (
    <div className="sm:hidden">
      <MobileFilterBar
        search={{ value: p.search, onChange: p.onSearch, placeholder: '件名・案件名・顧客名で検索' }}
        activeCount={activeCount}
        onClearAll={() => { p.onTypeFilter(''); p.onOriginFilter(''); p.onSort('date'); p.onUserFilter(''); p.onOwnerFilter(''); }}
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
        <MobileFilterField label="担当者" hint="案件の担当者で絞り込みます">
          <OwnerSelect {...p} />
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
 * 案件別の絞り込み。PC は検索＋担当者＋記録者の1段、スマホは `MobileFilterBar` に畳む
 * （検索は畳まない・担当者と記録者をシートへ）。
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
        <OwnerSelect {...p} className={USER_W} />
        <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} className={USER_W} />
      </div>
      <div className="sm:hidden">
        <MobileFilterBar
          search={{ value: p.search, onChange: p.onSearch, placeholder: '案件名・クライアント名・件名で検索', label: '案件を検索' }}
          activeCount={(p.userFilter ? 1 : 0) + (p.ownerFilter ? 1 : 0)}
          onClearAll={() => { p.onUserFilter(''); p.onOwnerFilter(''); }}
          title="案件別の絞り込み"
        >
          <MobileFilterField label="担当者" hint="案件の担当者で絞り込みます">
            <OwnerSelect {...p} />
          </MobileFilterField>
          <MobileFilterField label="記録者" hint="活動を記録した人で絞り込みます">
            <AssigneeSelect value={p.userFilter} onChange={p.onUserFilter} options={p.assignees} />
          </MobileFilterField>
        </MobileFilterBar>
      </div>
    </>
  );
}
