/**
 * 2つの版の違い（§6-⑥）
 *
 * 行単位。追加した行は緑・削除した行は赤。**色だけに頼らない**ので、
 * 行頭に `+` `−` も出す（色が見分けにくい人に何も伝わらなくなるため）。
 */
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Equal } from 'lucide-react';
import { useMemo } from 'react';
import type { WikiPageVersion } from '@gmo-onair/shared/src/wiki/types';
import { collapseSame, diffLines } from '@/lib/lineDiff';
import { revLabel, updatedLabel } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';

export default function VersionDiff({
  older,
  newer,
  loading,
  error,
  onRetry,
}: {
  older: WikiPageVersion | undefined;
  newer: WikiPageVersion | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const result = useMemo(
    () => (older && newer ? diffLines(older.body_md, newer.body_md) : null),
    [older, newer],
  );
  const chunks = useMemo(() => (result ? collapseSame(result.lines) : []), [result]);

  if (error) {
    return <ErrorPanel title="版を読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading || !result || !older || !newer) {
    return (
      <Delayed>
        <SkeletonRows rows={10} rowHeight={24} />
      </Delayed>
    );
  }
  if (result.summary.added === 0 && result.summary.removed === 0) {
    return (
      <EmptyState
        icon={<Equal />}
        title="本文は変わっていません"
        description={`${revLabel(older.rev)}と${revLabel(newer.rev)}の本文は同じです。題やタグだけが変わった保存です。`}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <span className="text-sub text-muted-foreground">
          {revLabel(older.rev)}（{updatedLabel(older.saved_at)}）→ {revLabel(newer.rev)}（{updatedLabel(newer.saved_at)}）
        </span>
        <span className="text-sub text-success">+{result.summary.added}行</span>
        <span className="text-sub text-destructive">−{result.summary.removed}行</span>
        {result.summary.coarse && (
          <span className="text-sub-sm text-muted-foreground">
            本文が長いため、変わった部分をまとめて出しています
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
        <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sub">
          {chunks.map((c, i) => {
            if (c.kind === 'skip') {
              return (
                <div key={`skip-${i}`} className="my-1 px-3 py-1 text-sub-sm text-muted-foreground">
                  … 変わっていない {c.count}行
                </div>
              );
            }
            const l = c.line!;
            return (
              <div
                key={`${l.op}-${l.oldNo ?? 'x'}-${l.newNo ?? 'x'}-${i}`}
                className={cn(
                  'flex gap-2 rounded-badge-xs px-2 py-px',
                  l.op === 'add' && 'bg-success-surface',
                  l.op === 'del' && 'bg-destructive-surface',
                )}
              >
                <span className="w-10 shrink-0 select-none text-right text-sub-sm text-fg-disabled">
                  {l.oldNo ?? ''}
                </span>
                <span className="w-10 shrink-0 select-none text-right text-sub-sm text-fg-disabled">
                  {l.newNo ?? ''}
                </span>
                <span
                  className={cn(
                    'w-3 shrink-0 select-none text-center',
                    l.op === 'add' && 'text-success',
                    l.op === 'del' && 'text-destructive',
                  )}
                  aria-hidden
                >
                  {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{l.text || ' '}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
