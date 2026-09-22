/**
 * 版の一覧（右パネルの「履歴」タブと、履歴の画面 ⑥ の左で同じものを使う）
 *
 * 選ぶ機能（`selected` / `onPick`）は履歴の画面だけが使う。右パネルでは渡さない
 * ので、ただの一覧として出る。
 */
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { History } from 'lucide-react';
import type { WikiPageVersionBrief } from '@gmo-onair/shared/src/wiki/types';
import { WikiAiBadge } from '@/components/wiki/WikiStatusBadge';
import { revLabel, updatedLabel } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';

export interface PageVersionListProps {
  /** 一覧は本文を持たない（`GET /versions` は `body_md` を返さない） */
  versions: WikiPageVersionBrief[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** 選んでいる2つの版（古い順）。履歴の画面だけが渡す */
  selected?: number[];
  onPick?: (rev: number) => void;
}

export default function PageVersionList({
  versions,
  loading,
  error,
  onRetry,
  selected,
  onPick,
}: PageVersionListProps) {
  if (error) {
    return <ErrorPanel title="履歴を読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <Delayed>
        <SkeletonRows rows={6} rowHeight={54} />
      </Delayed>
    );
  }
  if (!versions || versions.length === 0) {
    return (
      <EmptyState
        icon={<History />}
        title="まだ履歴がありません"
        description="ページを保存するたびに、そのときの本文がここに残ります。"
      />
    );
  }

  return (
    <div className="flex flex-col">
      {versions.map((v) => {
        const picked = selected?.includes(v.rev) ?? false;
        const Tag = onPick ? 'button' : 'div';
        return (
          <Tag
            key={v.id}
            {...(onPick ? { type: 'button' as const, onClick: () => onPick(v.rev) } : {})}
            className={cn(
              'flex w-full items-start gap-2.5 border-b border-border-faint px-2 py-2.5 text-left',
              onPick && 'hover:bg-background',
              picked && 'bg-primary-surface-weak',
            )}
          >
            <span className={cn('w-[52px] shrink-0 pt-0.5 text-th', picked ? 'text-primary' : 'text-muted-foreground')}>
              {revLabel(v.rev)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sub text-muted-foreground">{updatedLabel(v.saved_at)}</span>
                <span className="text-sub text-foreground">{v.saver_name ?? '—'}</span>
                {v.by_ai && <WikiAiBadge />}
              </span>
              {v.note && <span className="mt-0.5 block text-sub text-secondary-foreground">{v.note}</span>}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
