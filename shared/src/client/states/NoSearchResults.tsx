// shared/src/client/states/NoSearchResults.tsx — 検索・絞り込みで0件
//
// 決めごと (docs/design/v4/_rules.md):
//   **0件の理由を名指しする。** 「該当なし」だけだと、探し方が悪いのか
//   絞り込みが効いているのか分からず、利用者は同じ言葉で何度も探し直す。
//   いま効いている絞り込みを並べて「外すと出るかもしれない」と言う。

import { SearchX } from 'lucide-react';
import { cn } from '../utils';

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
      <p className="text-cardtitle text-foreground">
        {keyword ? `「${keyword}」に当てはまるものはありませんでした` : '当てはまるものはありませんでした'}
      </p>
      {activeFilters.length > 0 ? (
        <div className="max-w-lg text-sub text-secondary-foreground">
          <p>次の絞り込みが効いています。外すと出てくることがあります。</p>
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
            {activeFilters.map((f) => (
              <li
                key={f}
                className="rounded-full border border-border bg-secondary px-2.5 py-1 text-sub-sm text-secondary-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="max-w-lg text-sub text-secondary-foreground">
          言葉を短くするか、別の言い方で探してください。
        </p>
      )}
      {onClearFilters && activeFilters.length > 0 ? (
        <button
          type="button"
          onClick={onClearFilters}
          /*
            ⚠️ **PC の高さを段に載せる。** スマホは `min-h-tap`(44px) が効くが、
            PC では `lg:min-h-0` で床が外れ、**中身の高さのまま 38.25px** になっていた
            （13.5px × 1.5 ＝ 20.25 ＋ 上下の余白 16 ＋ 罫線 2）。
            段は 32/36/40/44/48 なので、`Button` の既定と同じ 40px に載せる。
          */
          className="min-h-tap mt-3 rounded-control border border-border bg-card px-4 py-2 text-list text-foreground transition-colors hover:bg-secondary lg:h-10 lg:min-h-0"
        >
          絞り込みをすべて外す
        </button>
      ) : null}
    </div>
  );
}
