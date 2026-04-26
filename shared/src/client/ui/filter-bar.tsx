/**
 * shared/src/client/ui/filter-bar.tsx — 一覧ページ用フィルタバー (Phase 2A)
 *
 * 「タブ + 検索 + 任意のアクション」を全アプリで同じ見た目に統一するためのレイアウト。
 *
 * 使い方:
 *   <FilterBar
 *     search={search}
 *     onSearchChange={setSearch}
 *     searchPlaceholder="案件名・GLS番号で検索..."
 *     tabs={[
 *       { value: '',     label: '全て' },
 *       { value: 'active', label: '進行中' },
 *       { value: 'completed', label: '完了' },
 *     ]}
 *     activeTab={tab}
 *     onTabChange={setTab}
 *     actions={<Button onClick={openAdd}>新規追加</Button>}
 *   />
 *
 * すべての props は optional。tabs を省略すれば「検索のみ」、
 * search を省略すれば「タブのみ」のバーとして使える。
 */
import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../utils';

export interface FilterTab {
  value: string;
  label: React.ReactNode;
  /** 件数バッジ等の補助表示 */
  count?: number;
}

export interface FilterBarProps {
  /** 検索文字列 */
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;

  /** タブフィルタ */
  tabs?: FilterTab[];
  activeTab?: string;
  onTabChange?: (v: string) => void;

  /** 右端のアクション (新規追加ボタンなど) */
  actions?: React.ReactNode;

  /** 検索が右側、タブが左側のレイアウトを反転 (default: タブ上 + 検索下) */
  layout?: 'stacked' | 'inline';

  className?: string;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = '検索...',
  tabs,
  activeTab,
  onTabChange,
  actions,
  layout = 'stacked',
  className,
}: FilterBarProps) {
  const showSearch = onSearchChange !== undefined;
  const showTabs = tabs && tabs.length > 0;

  const SearchInput = showSearch ? (
    <div className="relative flex-1 min-w-[180px] max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        value={search ?? ''}
        onChange={(e) => onSearchChange!(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
      {search && (
        <button
          type="button"
          onClick={() => onSearchChange!('')}
          aria-label="検索をクリア"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  ) : null;

  const TabsList = showTabs ? (
    <div role="tablist" aria-label="フィルタ" className="inline-flex items-center gap-1 overflow-x-auto rounded-md border border-border bg-muted/30 p-1">
      {tabs!.map((t) => {
        const isActive = activeTab === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(t.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn('font-number tabular-nums text-[10px]', isActive ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  ) : null;

  if (layout === 'inline') {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {TabsList}
        {SearchInput}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
    );
  }

  // stacked (default): タブ上 + 検索/アクション下
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {(TabsList || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {TabsList ?? <div />}
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {SearchInput}
    </div>
  );
}
