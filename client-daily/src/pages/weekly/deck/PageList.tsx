/**
 * 左の「ページ」— つまんで並べ替え・押して選ぶ・右の部品を落とすと新しいページ
 *
 * - 並べ替えは `@dnd-kit/sortable`（縦1列）。つまむのは左端の印だけで、行そのものを押すと選ぶ
 * - 部品を引きずっている間だけ、行と行のあいだに「ここに新しいページ」の落とし口が出る
 * - 消したページは薄く出して「戻す」を置く（構成には残る。次回の既定に効かせるため）
 * - 先頭の会議フォーマットのページ（表紙〜ToDo）は畳んでおく（モック「1〜8 表紙・会議フォーマット」）。
 *   選んだページがその中にあるときは自動で開く
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Undo2 } from 'lucide-react';
import { SLIDE_TEMPLATES } from '@gmo-onair/shared/src/keepReport/templates';
import type { KeepDeck, KeepReportPack, SlidePage, SlideTemplateKey } from '@gmo-onair/shared/src/keepReport/types';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { KIND_CLASS, LEAD_TEMPLATES, pageKind, pageListTitle } from './deckLabels';
import { useDeckStore } from './deckState';
import { SlideThumb, pageNumbers } from './SlideFrame';

/** 「追加…」で選べるテンプレ。案件・実施報告・前回の写しは右の部品から置く（案件が要る） */
const ADDABLE = (Object.keys(SLIDE_TEMPLATES) as SlideTemplateKey[]).filter((k) => !['project_page', 'event_report', 'copied'].includes(k));

function GapDrop({ index, label }: { index: number; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap:${index}`, data: { type: 'gap', index } });
  return (
    <div ref={setNodeRef} className={cn('flex items-center gap-2 px-2 transition-[height] duration-150', isOver ? 'h-9' : 'h-4')}>
      <span className={cn('h-0.5 flex-1 rounded-chip', isOver ? 'bg-primary' : 'bg-primary-border')} />
      <span className={cn('text-badge whitespace-nowrap', isOver ? 'text-primary' : 'text-fg-disabled')}>{label}</span>
      <span className={cn('h-0.5 flex-1 rounded-chip', isOver ? 'bg-primary' : 'bg-primary-border')} />
    </div>
  );
}

const PageRow = memo(function PageRow({ page, no, selected, pack, deck, meeting, onSelect, onRestore }: {
  page: SlidePage;
  no: number | undefined;
  selected: boolean;
  pack: KeepReportPack | null;
  deck: KeepDeck | null;
  meeting: string | null;
  onSelect: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, data: { type: 'page' } });
  const kind = pageKind(page);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 rounded-control-md px-1.5 py-1.5',
        selected ? 'bg-primary-surface' : 'hover:bg-background',
        isDragging && 'opacity-40',
        page.removed && 'opacity-60',
      )}
      data-page-row={page.id}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="つまんで並べ替え"
        className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-fg-disabled hover:text-muted-foreground"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => onSelect(page.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-current={selected ? 'true' : undefined}>
        <span className="font-number text-badge w-5 shrink-0 text-right text-muted-foreground">{no ?? '—'}</span>
        <SlideThumb page={page} pageNo={no ?? 0} pack={pack} deck={page.template === 'agenda' ? deck : null} meeting={meeting} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn('text-sub-sm truncate', selected ? 'font-bold text-primary' : 'text-foreground', page.removed && 'line-through')}>
            {pageListTitle(page, pack)}
          </span>
          <span className={cn('text-badge inline-flex h-4 w-fit items-center rounded-badge-xs px-1.5', KIND_CLASS[kind])}>{page.removed ? '削除' : kind}</span>
        </span>
      </button>
      {page.removed && (
        <button type="button" onClick={() => onRestore(page.id)} className="text-badge inline-flex h-8 shrink-0 items-center gap-1 rounded-control-md border border-border bg-card px-2 text-secondary-foreground hover:bg-muted">
          <Undo2 className="h-3 w-3" aria-hidden="true" />戻す
        </button>
      )}
    </div>
  );
});

export function PageList() {
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);
  const meeting = useDeckStore((s) => s.meeting);
  const selectedPageId = useDeckStore((s) => s.selectedPageId);
  const dragging = useDeckStore((s) => s.dragging);
  const select = useDeckStore((s) => s.select);
  const restorePage = useDeckStore((s) => s.restorePage);
  const addPage = useDeckStore((s) => s.addPage);

  const pages = deck?.pages ?? [];
  const numbers = useMemo(() => pageNumbers(pages), [pages]);
  const ids = useMemo(() => pages.map((p) => p.id), [pages]);

  let leadCount = 0;
  while (leadCount < pages.length && LEAD_TEMPLATES.has(pages[leadCount].template)) leadCount += 1;
  const foldable = leadCount >= 3 && pages.length > leadCount;
  const [folded, setFolded] = useState(true);
  const selectedIndex = pages.findIndex((p) => p.id === selectedPageId);
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < leadCount) setFolded(false);
  }, [selectedIndex, leadCount]);
  const hide = foldable && folded;

  return (
    <div className="flex w-60 shrink-0 flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border-faint px-3 pb-2 pt-3">
        <span className="text-cardtitle">ページ</span>
        <span className="font-number text-sub-sm text-muted-foreground">{numbers.size}</span>
        <span className="flex-1" />
        <select
          aria-label="テンプレートからページを追加"
          value=""
          onChange={(e) => { const t = e.target.value as SlideTemplateKey | ''; if (t) addPage({ template: t }); }}
          className="text-sub-sm h-8 max-w-[96px] rounded-control-md border border-border bg-card px-1.5 text-secondary-foreground"
        >
          <option value="">追加…</option>
          {ADDABLE.map((k) => <option key={k} value={k}>{SLIDE_TEMPLATES[k].label}</option>)}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {foldable && (
            <button type="button" onClick={() => setFolded((f) => !f)} className="text-sub-sm flex h-8 w-full items-center gap-2 rounded-control-md px-2 text-muted-foreground hover:bg-background">
              {folded ? <ChevronRight className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
              1〜{leadCount} 表紙・会議フォーマット（{folded ? '畳んでいます' : '開いています'}）
            </button>
          )}
          {pages.map((p, i) => (
            <div key={p.id} className={cn(hide && i < leadCount && 'hidden')}>
              {dragging === 'chip' && <GapDrop index={i} label="ここに新しいページ" />}
              <PageRow
                page={p}
                no={numbers.get(p.id)}
                selected={p.id === selectedPageId}
                pack={pack}
                deck={deck}
                meeting={meeting}
                onSelect={select}
                onRestore={restorePage}
              />
            </div>
          ))}
          {dragging === 'chip' && <GapDrop index={pages.length} label="いちばん後ろに新しいページ" />}
        </SortableContext>
      </div>

      <div className="text-sub-sm border-t border-border-faint px-3 py-2 text-muted-foreground">
        つまんで並べ替え ・ 右の部品を落とすと新しいページ
      </div>
    </div>
  );
}
