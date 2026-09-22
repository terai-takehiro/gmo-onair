/**
 * ホームのスペースのタイル（docs/design/v4/wiki.md §6-①）
 *
 * 1枚＝名前・説明・ページ数・最終更新。押すとそのスペースのツリーが開く。
 * 色は `wiki_spaces.color`（DB に入っている hex）をそのまま印の四角に使う —
 * スペースは人が増やすもので、共通トークンの系列（`cat-1`〜8）に収まらない。
 */
import { Link } from 'react-router-dom';
import { Delayed, EmptyState, ErrorPanel, SkeletonCard } from '@gmo-onair/shared/src/client/states';
import { FolderTree } from 'lucide-react';
import type { WikiSpace } from '@gmo-onair/shared/src/wiki/types';
import { updatedLabel } from '@/lib/wikiFormat';

export default function SpaceTiles({
  spaces,
  loading,
  error,
  onRetry,
}: {
  spaces: WikiSpace[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (error) {
    return <ErrorPanel title="スペースの一覧を読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return (
      <Delayed>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </Delayed>
    );
  }
  if (!spaces || spaces.length === 0) {
    return (
      <EmptyState
        icon={<FolderTree />}
        title="まだスペースがありません"
        description="スペースを作成すると、ここに出ます。"
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {spaces.map((s) => (
        <Link
          key={s.id}
          to={`/s/${s.key}`}
          className="flex items-center gap-3 rounded-card border border-border bg-card p-3 no-underline transition-colors hover:border-primary-border-strong"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control-lg bg-muted"
            aria-hidden
          >
            <span
              className="h-3.5 w-3.5 rounded-badge-xs bg-primary"
              style={s.color ? { backgroundColor: s.color } : undefined}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-cardtitle text-foreground">{s.name}</span>
            <span className="block truncate text-sub-sm text-muted-foreground">{s.description}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-list text-foreground">{s.page_count ?? 0}ページ</span>
            <span className="block text-sub-sm text-muted-foreground">
              {s.last_updated_at ? updatedLabel(s.last_updated_at) : '—'}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
