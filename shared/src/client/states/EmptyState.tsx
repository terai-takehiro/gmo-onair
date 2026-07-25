// shared/src/client/states/EmptyState.tsx — 空の状態
//
// 決めごと (§2.4):
//   ・「データがありません」で終わらせない。対象ごとの文 + 次の一手ボタン
//   ・検索0件は外すべき条件を名指しする (どれを外せば出るのか分かるように)

import type { ReactNode } from 'react';
import { Inbox, SearchX } from 'lucide-react';
import { cn } from '../utils';

export interface EmptyStateProps {
  /** 何が無いのか。「データがありません」のような一般名は使わない */
  title: ReactNode;
  /** 次にやることを先に書く1文 */
  description?: ReactNode;
  /** 次の一手 (ボタン) */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-5 py-12 text-center',
        className,
      )}
    >
      <div className="text-secondary-foreground [&>svg]:h-7 [&>svg]:w-7" aria-hidden="true">
        {icon ?? <Inbox />}
      </div>
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-lg text-[13px] leading-relaxed text-secondary-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export interface NoSearchResultsProps {
  /** 検索語 (入れたものをそのまま見せる) */
  keyword?: string;
  /**
   * いま効いている絞り込みの名前。「これを外すと出るかもしれない」を名指しする。
   * 例: ['開催期間: 今月〜半年先', 'ステージ: 提案中']
   */
  activeFilters?: string[];
  /** 絞り込みを外す */
  onClearFilters?: () => void;
  className?: string;
}

export function NoSearchResults({ keyword, activeFilters = [], onClearFilters, className }: NoSearchResultsProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-5 py-12 text-center',
        className,
      )}
    >
      <div className="text-secondary-foreground" aria-hidden="true">
        <SearchX className="h-7 w-7" />
      </div>
      <p className="text-[15px] font-bold text-foreground">
        {keyword ? `「${keyword}」に当てはまるものはありませんでした` : '当てはまるものはありませんでした'}
      </p>
      {activeFilters.length > 0 ? (
        <div className="max-w-lg text-[13px] leading-relaxed text-secondary-foreground">
          <p>次の絞り込みが効いています。外すと出てくることがあります。</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
            {activeFilters.map((f) => (
              <li
                key={f}
                className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[12px] font-medium text-secondary-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="max-w-lg text-[13px] text-secondary-foreground">
          言葉を短くするか、別の言い方で探してください。
        </p>
      )}
      {onClearFilters && activeFilters.length > 0 ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-3 rounded-control border border-border bg-card px-4 py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-secondary"
        >
          絞り込みをすべて外す
        </button>
      ) : null}
    </div>
  );
}
