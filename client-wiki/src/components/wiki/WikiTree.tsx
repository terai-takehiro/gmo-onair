/**
 * スペースのツリー（ページ②の左）
 *
 * 段A は**開く・閉じる・移る**だけ。ドラッグでの並べ替えと `+` での追加は
 * 書ける段（段B）で足す — 押せるのに何も起きない操作を先に出さない。
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Table2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { FileText } from 'lucide-react';
import { ancestorIdsOf, buildWikiTree, flattenWikiTree } from '@/lib/wikiTree';
import { cn } from '@/lib/utils';

export interface WikiTreeProps {
  nodes: WikiTreeNode[] | undefined;
  loading?: boolean;
  currentId?: string;
}

export default function WikiTree({ nodes, loading, currentId }: WikiTreeProps) {
  const navigate = useNavigate();
  const list = useMemo(() => nodes ?? [], [nodes]);
  const roots = useMemo(() => buildWikiTree(list), [list]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // いま開いているページの親は必ず開く（閉じたままだとどこに居るか分からない）。
  // 人が閉じた分は消さない — 足すだけにする
  useEffect(() => {
    const need = ancestorIdsOf(list, currentId);
    if (need.length === 0) return;
    setExpanded((prev) => {
      if (need.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      for (const id of need) next.add(id);
      return next;
    });
  }, [list, currentId]);

  const rows = useMemo(() => flattenWikiTree(roots, expanded), [roots, expanded]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) {
    return (
      <Delayed>
        <SkeletonRows rows={8} rowHeight={34} />
      </Delayed>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="まだページがありません"
        description="このスペースにページを作成すると、ここに出ます。"
      />
    );
  }

  return (
    <nav className="flex flex-col gap-0.5" aria-label="ページのツリー">
      {rows.map((t) => {
        const open = expanded.has(t.id);
        const isCurrent = t.id === currentId;
        return (
          <div key={t.id} className="flex items-center" style={{ paddingLeft: t.depth * 14 }}>
            <button
              type="button"
              aria-label={open ? '閉じる' : '開く'}
              aria-expanded={t.children.length > 0 ? open : undefined}
              onClick={() => t.children.length > 0 && toggle(t.id)}
              className="flex h-8 w-5 shrink-0 items-center justify-center rounded-control text-fg-disabled"
              // 子が無い行にも同じ幅を取る。取らないと行頭が1段ずれて読みにくい
              disabled={t.children.length === 0}
            >
              {t.children.length === 0 ? (
                <span className="h-1.5 w-1.5 rounded-chip bg-border-disabled" />
              ) : open ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/p/${t.id}`)}
              aria-current={isCurrent ? 'page' : undefined}
              className={cn(
                'flex min-h-tap flex-1 items-center gap-1.5 rounded-control px-2 text-left lg:min-h-0 lg:h-[34px]',
                isCurrent ? 'bg-primary-surface-weak text-primary' : 'text-secondary-foreground hover:bg-background',
              )}
            >
              {t.kind === 'database' && <Table2 className="h-3.5 w-3.5 shrink-0 text-fg-disabled" aria-hidden />}
              <span className={cn('min-w-0 flex-1 truncate text-sub', isCurrent && 'text-list')}>{t.title}</span>
              {t.status === 'draft' && (
                <span className="shrink-0 text-sub-sm text-warning" title="下書き">下書き</span>
              )}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
