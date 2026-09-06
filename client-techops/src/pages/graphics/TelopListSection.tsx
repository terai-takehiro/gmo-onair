// テロップCG — ①一覧の状態チップ＋テロップ表（`GraphicsHubPage.tsx` から分離。
// 400行基準・役割で分割〈一覧と詳細〉）。
//
// 状態チップ（全部／確認済み／未確認）・列見出し・行（ドラッグで並べ替え・実描画
// サムネイル・確認済みトグル）をまとめて持つ。**並べ替えても呼出番号（callNo）は
// 変えない**（graphics-redesign.md §12-3・§10 の決定・動かすのは sortOrder だけ）。
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { isPageContentEmpty } from './pageFields';
import TelopThumb from './TelopThumb';
import type { resolveTelopTheme } from './telopTheme';

export type StatusFilter = 'all' | 'ok' | 'un';

export default function TelopListSection({
  pages, visiblePages, filter, onFilterChange, confirmedCount, unconfirmedCount,
  reorderable, theme, selectedPageId, togglingId, onOpen, onToggleConfirmed, onDragEnd,
}: {
  /** 絞り込み前の全件（チップの件数・0件の理由分けに使う） */
  pages: GraphicsPageRow[];
  visiblePages: GraphicsPageRow[];
  filter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  confirmedCount: number;
  unconfirmedCount: number;
  reorderable: boolean;
  theme: ReturnType<typeof resolveTelopTheme>;
  selectedPageId: string | null;
  togglingId: string | null;
  onOpen: (page: GraphicsPageRow) => void;
  onToggleConfirmed: (page: GraphicsPageRow) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const isConfirmed = (p: GraphicsPageRow) => p.proofState === 'proofed';

  return (
    <>
      {/* 状態帯: 押すと絞り込み（台本連携が無い段Aでは「台本と違う」チップは出さない） */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusChip label="全部" count={pages.length} active={filter === 'all'} onClick={() => onFilterChange('all')} />
        <StatusChip label="確認済み" count={confirmedCount} tone="success" active={filter === 'ok'} onClick={() => onFilterChange('ok')} />
        <StatusChip label="未確認" count={unconfirmedCount} tone="warning" active={filter === 'un'} onClick={() => onFilterChange('un')} />
        <span className="flex-1" />
        <span className="text-note text-muted-foreground">
          {reorderable ? '行をつかんで並べ替え ・ 番号は固定' : '並べ替えは「全部」表示のときだけ'}
        </span>
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border-faint bg-surface-subtle px-4 py-2 text-th text-muted-foreground">
          <span className="w-6" aria-hidden="true" />
          <span className="font-number w-11 shrink-0 text-right">番号</span>
          <span className="w-20 shrink-0">絵</span>
          <span className="min-w-0 flex-1">出す順（文言）</span>
          <span className="w-11 shrink-0 text-center">確認</span>
        </div>
        {visiblePages.length === 0 ? (
          <EmptyState
            title={pages.length === 0 ? 'テロップがまだありません' : '条件に合うテロップはありません'}
            description={pages.length === 0 ? '「＋ テロップ」から最初の1枚（ネーム・題字など）を作るとここに並びます。' : '絞り込みを変えてお試しください。'}
          />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
            <SortableContext items={visiblePages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {visiblePages.map((p) => (
                <TelopRow
                  key={p.id}
                  page={p}
                  theme={theme}
                  selected={selectedPageId === p.id}
                  confirmed={isConfirmed(p)}
                  contentEmpty={isPageContentEmpty(p.partKey, p.fields)}
                  toggling={togglingId === p.id}
                  draggable={reorderable}
                  onOpen={() => onOpen(p)}
                  onToggleConfirmed={() => onToggleConfirmed(p)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </section>
    </>
  );
}

function StatusChip({ label, count, active, onClick, tone }: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'success' | 'warning';
}) {
  const dot = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-tap items-center gap-1.5 rounded-control-lg border px-3 text-sub font-bold ${
        active ? 'border-primary-border bg-primary-surface text-primary' : 'border-border bg-card text-foreground hover:bg-surface-subtle'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
      <span className="font-number">{count}</span>
    </button>
  );
}

function TelopRow({
  page, theme, selected, confirmed, contentEmpty, toggling, draggable, onOpen, onToggleConfirmed,
}: {
  page: GraphicsPageRow;
  theme: ReturnType<typeof resolveTelopTheme>;
  selected: boolean;
  confirmed: boolean;
  contentEmpty: boolean;
  toggling: boolean;
  draggable: boolean;
  onOpen: () => void;
  onToggleConfirmed: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id, disabled: !draggable });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 border-b border-border-faint px-4 py-2 last:border-b-0 ${
        selected ? 'bg-primary-surface' : 'hover:bg-surface-subtle'
      } ${isDragging ? 'z-10 opacity-70 shadow-md' : ''}`}
    >
      <button
        type="button"
        className={`flex h-8 w-6 shrink-0 items-center justify-center rounded-control text-muted-foreground ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30'}`}
        aria-label={`「${page.name}」の並び順を変える`}
        disabled={!draggable}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="font-number w-11 shrink-0 text-right text-list font-bold">{page.callNo}</span>
        <TelopThumb page={page} theme={theme} />
        <span className="min-w-0 flex-1 truncate text-list">{page.name}</span>
        {contentEmpty && (
          <span className="shrink-0 rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-badge font-bold text-destructive">未完成</span>
        )}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={confirmed ? `「${page.name}」の確認済みを外す` : `「${page.name}」を確認済みにする`}
        disabled={contentEmpty || toggling}
        onClick={onToggleConfirmed}
      >
        {toggling ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : confirmed ? (
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
