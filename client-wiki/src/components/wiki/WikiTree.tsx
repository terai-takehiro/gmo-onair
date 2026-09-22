/**
 * スペースのツリー（共通の左メニューの中）
 *
 * 段A は**開く・閉じる・移る**だけでした。段B で3つ足しています:
 *   - 行の `+` … その下に子ページを追加する
 *   - ドラッグ … 上下の並べ替えと、親の付け替え（PC）
 *   - 行の「…」… 上へ／下へ／別のページの下へ（スマホ。ドラッグの代わり）
 *
 * ⚠️ **ここは 248px の列の中です。** 共通の左メニューに差し込んであるので
 * （`components/layout/WikiSpaceTreePanel.tsx` の冒頭）、操作のボタンは小さく、
 * 題は詰めずに truncate で切ります。**画面の中に2本目のナビの列は作りません。**
 *
 * ⚠️ **ドラッグはスマホでは効きません**（HTML5 のドラッグはタッチに反応しません）。
 * だから同じことが「…」からもできるようにしてあります — こちらが主で、
 * ドラッグは PC での近道、という順序です。
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Plus, Table2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WikiTreeNode } from '@gmo-onair/shared/src/wiki/types';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { ancestorIdsOf, buildWikiTree, flattenWikiTree, type WikiTreeItem } from '@/lib/wikiTree';
import WikiMoreMenu, { type WikiMenuItem } from '@/components/page/WikiMoreMenu';
import PageMoveSheet from '@/components/page/PageMoveSheet';
import { useWikiTreeMove } from '@/components/page/useWikiTreeMove';
import {
  dropZoneOf,
  planDrop,
  planReparent,
  planStep,
  stepAbilityOf,
  type WikiDropZone,
} from '@/components/page/treeMove';
import { cn } from '@/lib/utils';

export interface WikiTreeProps {
  nodes: WikiTreeNode[] | undefined;
  loading?: boolean;
  currentId?: string;
  /** 並べ替えたあとに読み直すスペース */
  spaceKey?: string;
  /** 「別のページの下へ」で「○○ の直下」と出すのに使う */
  spaceName?: string;
  /** 並べ替えと追加を出すか（editor 以上） */
  canEdit?: boolean;
  /** 行の `+`。押した行の id を親にしてページを追加する */
  onAddChild?: (parentId: string) => void;
}

interface DragState {
  id: string;
  overId: string | null;
  zone: WikiDropZone;
}

export default function WikiTree({
  nodes,
  loading,
  currentId,
  spaceKey,
  spaceName,
  canEdit = false,
  onAddChild,
}: WikiTreeProps) {
  const navigate = useNavigate();
  const list = useMemo(() => nodes ?? [], [nodes]);
  const roots = useMemo(() => buildWikiTree(list), [list]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [moveTarget, setMoveTarget] = useState<WikiTreeNode | null>(null);
  const { run, moving } = useWikiTreeMove(spaceKey);

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
  // 「上へ／下へ」を出せるかは**1回で**数える（`stepAbilityOf` の注記）
  const stepAbility = useMemo(() => stepAbilityOf(list), [list]);

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
        description="このスペースにページを追加すると、ここに出ます。"
      />
    );
  }

  const dropHere = (target: WikiTreeItem, zone: WikiDropZone) => {
    if (!drag) return;
    const ops = planDrop(list, drag.id, target.id, zone);
    setDrag(null);
    // 子にしたら、そのまま中が見えるように開いておく
    if (zone === 'inside') setExpanded((prev) => new Set(prev).add(target.id));
    void run(ops, 'ページ');
  };

  return (
    <>
      <nav className="flex flex-col gap-0.5" aria-label="ページのツリー" aria-busy={moving || undefined}>
        {rows.map((t) => {
          const open = expanded.has(t.id);
          const over = drag?.overId === t.id ? drag.zone : null;
          return (
            <div
              key={t.id}
              className={cn(
                // 落とす場所の線は**いつも場所を取っておく**（透明な2px）。
                // 当たったときだけ色を付ける — 付くたびに行の高さが変わると、
                // 下の行がドラッグ中に上下してどこに落ちるのか読めなくなる
                'group flex items-center rounded-control border-y-2 border-transparent',
                over === 'before' && 'border-t-primary',
                over === 'after' && 'border-b-primary',
                over === 'inside' && 'bg-primary-surface-weak ring-1 ring-primary-border',
                drag?.id === t.id && 'opacity-50',
              )}
              style={{ paddingLeft: t.depth * 14 }}
              draggable={canEdit}
              onDragStart={(e) => {
                if (!canEdit) return;
                e.dataTransfer.effectAllowed = 'move';
                // Firefox は中身を入れないとドラッグが始まらない
                e.dataTransfer.setData('text/plain', t.id);
                setDrag({ id: t.id, overId: null, zone: 'inside' });
              }}
              onDragOver={(e) => {
                if (!drag || drag.id === t.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const zone = dropZoneOf(e.currentTarget.getBoundingClientRect(), e.clientY);
                setDrag((prev) => (prev && (prev.overId !== t.id || prev.zone !== zone)
                  ? { ...prev, overId: t.id, zone }
                  : prev));
              }}
              onDrop={(e) => {
                if (!drag) return;
                e.preventDefault();
                dropHere(t, drag.zone);
              }}
              onDragEnd={() => setDrag(null)}
            >
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
                aria-current={t.id === currentId ? 'page' : undefined}
                className={cn(
                  'flex min-h-tap flex-1 items-center gap-1.5 rounded-control px-2 text-left lg:min-h-0 lg:h-[34px]',
                  t.id === currentId
                    ? 'bg-primary-surface-weak text-primary'
                    : 'text-secondary-foreground hover:bg-background',
                )}
              >
                {t.kind === 'database' && <Table2 className="h-3.5 w-3.5 shrink-0 text-fg-disabled" aria-hidden />}
                <span className={cn('min-w-0 flex-1 truncate text-sub', t.id === currentId && 'text-list')}>
                  {t.title}
                </span>
                {t.status === 'draft' && (
                  <span className="shrink-0 text-sub-sm text-warning" title="下書き">下書き</span>
                )}
              </button>

              {canEdit && (
                <RowActions
                  node={t}
                  ability={stepAbility.get(t.id)}
                  moving={moving}
                  onAddChild={onAddChild}
                  onStep={(dir) => void run(planStep(list, t.id, dir), t.title)}
                  onOpenMove={() => setMoveTarget(t)}
                />
              )}
            </div>
          );
        })}
      </nav>

      <PageMoveSheet
        open={moveTarget !== null}
        onOpenChange={(v) => !v && setMoveTarget(null)}
        node={moveTarget}
        nodes={list}
        spaceName={spaceName ?? 'スペース'}
        onPick={(parentId) => {
          if (!moveTarget) return;
          const ops = planReparent(list, moveTarget.id, parentId);
          if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
          void run(ops, moveTarget.title);
        }}
      />
    </>
  );
}

/** 行の右端の2つ（`+` と「…」）。狭い列なので PC では小さくする */
function RowActions({
  node,
  ability,
  moving,
  onAddChild,
  onStep,
  onOpenMove,
}: {
  node: WikiTreeItem;
  /** 端まで来ている行では「上へ」「下へ」を出さない（押しても何も起きないため） */
  ability: { up: boolean; down: boolean } | undefined;
  moving: boolean;
  onAddChild?: (parentId: string) => void;
  onStep: (dir: 'up' | 'down') => void;
  onOpenMove: () => void;
}) {
  const items: WikiMenuItem[] = [];
  if (ability?.up) items.push({ key: 'up', label: '上へ', onSelect: () => onStep('up') });
  if (ability?.down) items.push({ key: 'down', label: '下へ', onSelect: () => onStep('down') });
  items.push({ key: 'move', label: '別のページの下へ', onSelect: onOpenMove });

  return (
    <span className="flex shrink-0 items-center">
      {onAddChild && (
        <button
          type="button"
          aria-label={`${node.title} の下にページを追加`}
          title="子ページを追加"
          disabled={moving}
          onClick={() => onAddChild(node.id)}
          className="flex min-h-tap min-w-tap items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground lg:h-7 lg:min-h-0 lg:w-7 lg:min-w-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <WikiMoreMenu label={node.title} items={items} compact />
    </span>
  );
}
