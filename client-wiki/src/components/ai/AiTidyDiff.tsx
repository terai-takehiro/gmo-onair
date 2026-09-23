/**
 * 「AI で整える」— **どこが変わったか**（行単位）
 *
 * 並べて見るだけでは、長いメモのときに**1行だけ消えた**ことに気づけません。
 * 段を light にしてある代わりに「崩れは読めば分かる」ことを前提にしているので
 * （設計 §7-1）、読む助けをここで足します。
 *
 * 計算は履歴の差分と**同じ `lib/lineDiff.ts`**（差分の作り手をこの製品で2つ持たない）。
 * 色だけに頼らないよう、行頭に `+` `−` も出します。
 */
import { useMemo } from 'react';
import { collapseSame, diffLines } from '@/lib/lineDiff';
import { cn } from '@/lib/utils';

export default function AiTidyDiff({ before, after }: { before: string; after: string }) {
  const result = useMemo(() => diffLines(before, after), [before, after]);
  const chunks = useMemo(() => collapseSame(result.lines), [result]);

  if (result.summary.added === 0 && result.summary.removed === 0) {
    return (
      <p className="px-1 py-6 text-center text-sub text-muted-foreground">
        変わったところはありません。元の文がそのまま返っています。
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 pb-2">
        <span className="text-sub text-success">+{result.summary.added}行</span>
        <span className="text-sub text-destructive">−{result.summary.removed}行</span>
        {result.summary.coarse && (
          <span className="text-sub-sm text-muted-foreground">
            文が長いため、変わった部分をまとめて出しています
          </span>
        )}
      </div>

      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-sub">
        {chunks.map((c, i) => {
          if (c.kind === 'skip') {
            return (
              <div key={`skip-${i}`} className="my-1 px-2 py-1 text-sub-sm text-muted-foreground">
                … 変わっていない {c.count}行
              </div>
            );
          }
          const line = c.line;
          if (!line) return null;
          return (
            <div
              key={`${line.op}-${line.oldNo ?? 'x'}-${line.newNo ?? 'x'}-${i}`}
              className={cn(
                'flex gap-2 rounded-badge-xs px-2 py-px',
                line.op === 'add' && 'bg-success-surface',
                line.op === 'del' && 'bg-destructive-surface',
              )}
            >
              <span
                className={cn(
                  'w-3 shrink-0 select-none text-center',
                  line.op === 'add' && 'text-success',
                  line.op === 'del' && 'text-destructive',
                )}
                aria-hidden
              >
                {line.op === 'add' ? '+' : line.op === 'del' ? '−' : ' '}
              </span>
              <span className="min-w-0 flex-1 text-foreground">{line.text || ' '}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}
