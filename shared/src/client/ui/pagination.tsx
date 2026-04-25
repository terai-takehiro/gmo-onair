/**
 * shared/src/client/ui/pagination.tsx — 一覧ページ用ページネーション (Phase 2A)
 *
 * page-based の単純な「前へ / 次へ」+ 現在ページ表示。
 * 全アプリで同じ見た目に統一する。
 *
 * 件数が 1 ページに収まる (totalPages <= 1) 場合は何も描画しない。
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils';

export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (next: number) => void;
  /** ボタンを無効化する (loading 中など) */
  disabled?: boolean;
  className?: string;
}

export function Pagination({ page, totalPages, total, onChange, disabled, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const canPrev = page > 1 && !disabled;
  const canNext = page < totalPages && !disabled;

  return (
    <nav
      role="navigation"
      aria-label="ページ送り"
      className={cn('flex flex-wrap items-center justify-between gap-2 py-2', className)}
    >
      <p className="text-sm text-muted-foreground">
        全 <span className="font-number tabular-nums">{total.toLocaleString('ja-JP')}</span> 件
        <span className="mx-2 text-muted-foreground/60">·</span>
        ページ <span className="font-number tabular-nums">{page}</span> / <span className="font-number tabular-nums">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onChange(page - 1)}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="前のページ"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          前へ
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onChange(page + 1)}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="次のページ"
        >
          次へ
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
