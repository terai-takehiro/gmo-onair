/**
 * つまんで置く（`@dnd-kit`）の1つの器 — ページの並べ替えと、部品をキャンバス／一覧へ落とすのを1か所で受ける
 *
 * - つまむもの: 左の一覧の行（`type: 'page'`）、右の部品（`type: 'chip'`）
 * - 落とし先: 一覧の行（並べ替え）、キャンバスの点線の枠（`canvas` = いまのページの下）、
 *   一覧の行と行のあいだ（`gap` = そこに新しいページ）
 * - 当たり判定は種類で分ける: 部品はポインタの下にある落とし口だけ、ページは一覧の行だけ
 *   （混ぜると、部品を運んでいるときに一覧の行が「並べ替え先」として光る）
 */
import { useCallback, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection,
  useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { useDeckStore } from './deckState';
import { pageListTitle } from './deckLabels';
import type { PartChip } from './partChips';

type Active = { type: 'chip'; chip: PartChip } | { type: 'page'; id: string } | null;

const DROP_TYPES = new Set(['gap', 'canvas']);

export function DeckDnd({ children }: { children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [active, setActive] = useState<Active>(null);
  const setDragging = useDeckStore((s) => s.setDragging);
  const reorder = useDeckStore((s) => s.reorder);
  const addPart = useDeckStore((s) => s.addPart);
  const addPage = useDeckStore((s) => s.addPage);
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const type = args.active.data.current?.type;
    if (type === 'chip') {
      const onlyDrops = (list: ReturnType<CollisionDetection>) =>
        list.filter((c) => DROP_TYPES.has(String(c.data?.droppableContainer?.data?.current?.type)));
      const within = onlyDrops(pointerWithin(args));
      return within.length ? within : onlyDrops(rectIntersection(args));
    }
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === 'page'),
    });
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { type?: string; chip?: PartChip } | undefined;
    if (data?.type === 'chip' && data.chip) {
      setActive({ type: 'chip', chip: data.chip });
      setDragging('chip');
    } else if (data?.type === 'page') {
      setActive({ type: 'page', id: String(e.active.id) });
      setDragging('page');
    }
  };

  const finish = () => { setActive(null); setDragging(null); };

  const onDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as { type?: string; chip?: PartChip } | undefined;
    const over = e.over?.data.current as { type?: string; index?: number } | undefined;
    try {
      if (data?.type === 'page') {
        if (e.over && e.over.id !== e.active.id) reorder(String(e.active.id), String(e.over.id));
        return;
      }
      if (data?.type !== 'chip' || !data.chip || !over) return;
      const chip = data.chip;
      const selectedPageId = useDeckStore.getState().selectedPageId;
      if (over.type === 'canvas') {
        if (chip.kind === 'page' && chip.page) addPage(chip.page, selectedPageId);
        else if (chip.part && selectedPageId) addPart(selectedPageId, chip.part);
        else if (chip.part) addPage({ template: 'free', title: `${chip.label}【報告｜2×2｜1分】`, parts: [chip.part] });
        return;
      }
      if (over.type === 'gap' && typeof over.index === 'number') {
        if (chip.kind === 'page' && chip.page) addPage(chip.page, null, over.index);
        else if (chip.part) addPage({ template: 'free', title: `${chip.label}【報告｜2×2｜1分】`, parts: [chip.part] }, null, over.index);
      }
    } finally {
      finish();
    }
  };

  const draggedPage = active?.type === 'page' ? deck?.pages.find((p) => p.id === active.id) ?? null : null;

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={finish}>
      {children}
      <DragOverlay dropAnimation={null}>
        {active?.type === 'chip' ? (
          <div className="text-sub-sm flex h-9 items-center gap-2 rounded-control-md border border-primary bg-card px-2 text-foreground shadow-lg" style={{ transform: 'rotate(-3deg)' }}>
            <GripVertical className="h-3 w-3 text-fg-disabled" aria-hidden="true" />
            {active.chip.label}
          </div>
        ) : draggedPage ? (
          <div className="text-sub-sm flex h-9 items-center gap-2 rounded-control-md border border-primary bg-card px-2 text-foreground shadow-lg">
            <GripVertical className="h-3 w-3 text-fg-disabled" aria-hidden="true" />
            {pageListTitle(draggedPage, pack)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
