// 会場図面 — mm 空間の盤（設計: docs/design/v4/venue-layout.md §6②）。
// 重なりは 下敷き → 方眼・通り芯 → エリアの内法 → 固定物（`VenueUnderlay`）→
// 品目（`VenueItemView`）→ 選択枠と札 の順。上と左にものさし、右下に1mバー。
//
// ⚠️ `ManualCanvas` は使わない（A4横の定数 `PAGE_WIDTH_MM`/`PAGE_HEIGHT_MM` を
// 前提にしていて 44.8m 四方の階には使えない・§12-6）。ここは設計だけを写した
// 別の盤——render-prop の代わりに `VenueItemView` を直接描画し、
// 「動かしていなければ commit しない」状態機械は `VenueItemView` 側が持つ。
import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { VenueArea, VenueCatalogItem, VenueFloor, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { isItemOverflowing } from "@gmo-onair/shared/src/venue/geometry";
import { isEditableTarget } from "@/pages/opsmanual/manualCanvasGeometry";
import { useVenuePan } from "./hooks/useVenuePan";
import { useVenueMarqueeSelect } from "./hooks/useVenueMarqueeSelect";
import { BASE_PX_PER_MM, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, computeRulerTicks, computeViewBox, mmToBoardPx } from "./venueBoardMath";
import { arrowStepMm, deleteItems, duplicateItems, groupItems, groupMembers, isWholeGroupSelected, moveItemsBy, releaseFromGroup } from "./venueItemOps";
import VenueUnderlay from "./VenueUnderlay";
import VenueItemView from "./VenueItemView";

export interface VenueBoardProps {
  floor: VenueFloor;
  area: VenueArea;
  catalogByKey: Map<string, VenueCatalogItem>;
  items: VenueItem[];
  editable: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onCommit: (next: VenueItem[]) => void;
  onUndo: () => void;
  onRedo: () => void;
  showGrid: boolean;
  showRuler: boolean;
  snapEnabled: boolean;
  showWholeFloor: boolean;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export default function VenueBoard({
  floor, area, catalogByKey, items, editable, selectedIds, onSelectionChange, onCommit, onUndo, onRedo,
  showGrid, showRuler, snapEnabled, showWholeFloor, zoom, onZoomChange,
}: VenueBoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] } | null>(null);
  // グループをそのままつかんだ移動の途中経過（このグループの他のメンバーの見た目を
  // 一緒にずらす。確定は `moveItemsBy` でメンバー全員へ・§4-6）
  const [groupDrag, setGroupDrag] = useState<{ groupId: string; dx: number; dy: number } | null>(null);
  const pan = useVenuePan(viewportRef);

  const viewBox = useMemo(() => computeViewBox(area.bboxMm, floor, showWholeFloor), [area.bboxMm, floor, showWholeFloor]);
  const pxPerMm = BASE_PX_PER_MM * zoom;
  const widthPx = viewBox.w * pxPerMm;
  const heightPx = viewBox.h * pxPerMm;
  const axisLinesMm = useMemo(() => axisLinesOf(floor), [floor]);
  const strokeMm = 1.2 / pxPerMm;

  function selectOnly(id: string | null) {
    onSelectionChange(id ? [id] : []);
  }
  function selectItem(item: VenueItem, shiftKey: boolean, dblClick: boolean) {
    if (shiftKey) {
      onSelectionChange(selectedIds.includes(item.id) ? selectedIds.filter((x) => x !== item.id) : [...selectedIds, item.id]);
      return;
    }
    if (item.groupId && !dblClick) {
      onSelectionChange(groupMembers(items, item.groupId).map((it) => it.id));
      return;
    }
    onSelectionChange([item.id]);
  }

  function toPageMm(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: viewBox.x + (clientX - rect.left) / pxPerMm, y: viewBox.y + (clientY - rect.top) / pxPerMm };
  }
  function mmToClient(mm: { x: number; y: number }): { x: number; y: number } {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return mm;
    return { x: rect.left + (mm.x - viewBox.x) * pxPerMm, y: rect.top + (mm.y - viewBox.y) * pxPerMm };
  }
  const marquee = useVenueMarqueeSelect(svgRef, toPageMm, items, selectedIds, onSelectionChange, selectOnly);

  function handleKeyDown(e: ReactKeyboardEvent<SVGSVGElement>) {
    if (isEditableTarget(e.target)) return;
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) onRedo(); else onUndo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); onRedo(); return; }
    if (!editable) return;
    if (selectedIds.length === 0) return;
    if (meta && e.key.toLowerCase() === "d") {
      e.preventDefault();
      const res = duplicateItems(items, selectedIds);
      onCommit(res.items);
      onSelectionChange(res.newIds);
      return;
    }
    // Ctrl+G — 並べた結果と同じく、任意の複数選択もグループにできる（§4-6・§6②操作表）。
    // これまでキー割り当てが無く、`groupItems`（純関数）が使われないまま残っていた。
    // 選択がすでにどこかのグループとちょうど一致しているとき（普通に選んだグループへ
    // うっかり Ctrl+G を押した等）は何もしない——`groupItems` を通すと新しい groupId が
    // 発行され `arrange` が消え、何も変えていないのに「並べ直す」が消えてしまう
    // （Codex 指摘・P2）
    if (meta && e.key.toLowerCase() === "g") {
      e.preventDefault();
      if (selectedIds.length >= 2 && !isWholeGroupSelected(items, selectedIds)) onCommit(groupItems(items, selectedIds));
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onCommit(deleteItems(items, selectedIds));
      onSelectionChange([]);
      return;
    }
    if (e.key === "Escape") { onSelectionChange([]); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const step = arrowStepMm(e.shiftKey, meta);
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      onCommit(moveItemsBy(items, selectedIds, dx, dy));
    }
  }

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + delta) * 100) / 100)));
  }

  const sorted = [...items].sort((a, b) => a.z - b.z);
  const rulerX = showRuler ? computeRulerTicks(viewBox, pxPerMm, "x") : [];
  const rulerY = showRuler ? computeRulerTicks(viewBox, pxPerMm, "y") : [];
  const barPx = mmToBoardPx({ x: viewBox.x + 1000, y: viewBox.y }, viewBox, pxPerMm).x - mmToBoardPx({ x: viewBox.x, y: viewBox.y }, viewBox, pxPerMm).x;

  return (
    <div className="relative flex-1 overflow-hidden rounded-card border border-border bg-[#eef0f3]">
      {showRuler && (
        <>
          <div className="absolute left-0 top-0 z-10 h-[22px] w-[22px] border-b border-r border-border bg-white" />
          <div className="pointer-events-none absolute left-[22px] right-0 top-0 z-10 h-[22px] overflow-hidden border-b border-border bg-white">
            {rulerX.map((t) => (
              <div key={t.posPx} className="num absolute bottom-0 top-0 border-l text-[9px] leading-[20px] text-muted-foreground" style={{ left: t.posPx, borderColor: t.major ? "#9aa1ab" : "#cbd2da", paddingLeft: 3 }}>{t.label}</div>
            ))}
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 top-[22px] z-10 w-[22px] overflow-hidden border-r border-border bg-white">
            {rulerY.map((t) => (
              <div key={t.posPx} className="num absolute left-0 right-0 border-t text-[8.5px] leading-[11px] text-muted-foreground" style={{ top: t.posPx, borderColor: t.major ? "#9aa1ab" : "#cbd2da", paddingLeft: 2 }}>{t.label}</div>
            ))}
          </div>
        </>
      )}

      <div
        ref={viewportRef}
        className="absolute overflow-auto"
        style={{ left: showRuler ? 22 : 0, top: showRuler ? 22 : 0, right: 0, bottom: 0, cursor: pan.isSpaceHeld ? (pan.isPanning ? "grabbing" : "grab") : undefined }}
        onWheel={handleWheel}
        onPointerDownCapture={pan.onPointerDownCapture}
        onPointerMove={pan.onPointerMove}
        onPointerUp={pan.onPointerUp}
        onPointerCancel={pan.onPointerUp}
      >
        <svg
          ref={svgRef}
          width={widthPx}
          height={heightPx}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onPointerMove={marquee.onPointerMove}
          onPointerUp={marquee.onPointerUp}
          onPointerCancel={marquee.onPointerUp}
          className="block bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* レビュー指摘（P2）: `onPointerDown` を `<svg>` に付けていたため、実際に
              指が触れるのは常にこの背景 `<rect>`（`e.target`）で `<svg>`（`e.currentTarget`）
              とは一致せず、フックの `e.target !== e.currentTarget` ガードで毎回弾かれて
              マーキー選択が一度も始まらなかった。品目はこの `<rect>` の兄弟要素で
              バブリングしないため、ハンドラをこの `<rect>` 自身に付ければ「背景を掴んだ
              ときだけ」が素直に成立する（Move/Up は `setPointerCapture` 先の `<svg>` のまま） */}
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="#ffffff" onPointerDown={marquee.onPointerDown} onClick={() => selectOnly(null)} />
          <VenueUnderlay floor={floor} area={area} viewBox={viewBox} showWholeFloor={showWholeFloor} showGrid={showGrid} strokeMm={strokeMm} />

          {sorted.map((item) => (
            <VenueItemView
              key={item.id}
              item={item}
              catalog={item.key ? catalogByKey.get(item.key) : undefined}
              selected={selectedIds.includes(item.id)}
              overflowing={isItemOverflowing(item, area, floor.fixtures)}
              editable={editable}
              pxPerMm={pxPerMm}
              mmToClient={mmToClient}
              allItems={items}
              areaBboxMm={area.bboxMm}
              axisLinesMm={axisLinesMm}
              snapEnabled={snapEnabled}
              onSelect={(shiftKey, dblClick) => selectItem(item, shiftKey, dblClick)}
              onPatchCommit={(patch) => onCommit(items.map((it) => (it.id === item.id ? { ...it, ...patch } : it)))}
              onDetachMoveCommit={(patch) => onCommit(releaseFromGroup(items, item.id, patch))}
              onSnapGuides={setSnapGuides}
              groupDragOffset={item.groupId && !item.locked && groupDrag?.groupId === item.groupId ? { dx: groupDrag.dx, dy: groupDrag.dy } : null}
              onGroupDragPreview={(offset) => setGroupDrag(offset && item.groupId ? { groupId: item.groupId, ...offset } : null)}
              onGroupMoveCommit={(dx, dy) => {
                if (!item.groupId) return;
                // グループの中の「固定」した品目は、他のメンバーをつかんで動かしても
                // 一緒には動かさない（個別につかむときの `item.locked` ガードと同じ約束を
                // グループ移動でも守る・Codex 指摘 P2）
                const ids = groupMembers(items, item.groupId).filter((m) => !m.locked).map((m) => m.id);
                onCommit(moveItemsBy(items, ids, dx, dy));
              }}
              hideOwnHandles={!!item.groupId && selectedIds.length > 1}
              soloSelected={selectedIds.length === 1 && selectedIds[0] === item.id}
            />
          ))}

          {snapGuides?.x.map((x) => <line key={`sg-x-${x}`} x1={x} y1={viewBox.y} x2={x} y2={viewBox.y + viewBox.h} stroke="#c7243a" strokeOpacity={0.6} strokeWidth={strokeMm} pointerEvents="none" />)}
          {snapGuides?.y.map((y) => <line key={`sg-y-${y}`} x1={viewBox.x} y1={y} x2={viewBox.x + viewBox.w} y2={y} stroke="#c7243a" strokeOpacity={0.6} strokeWidth={strokeMm} pointerEvents="none" />)}

          {marquee.marqueeRect && (
            <rect x={marquee.marqueeRect.x} y={marquee.marqueeRect.y} width={marquee.marqueeRect.w} height={marquee.marqueeRect.h} fill="#005bac" fillOpacity={0.1} stroke="#005bac" strokeWidth={strokeMm} />
          )}
        </svg>
      </div>

      {/* 1m バー（ズームに追従。書き出しにも必ず載る・§8-6） */}
      <div className="num pointer-events-none absolute bottom-3 right-3.5 flex h-[26px] items-center gap-2 rounded-md border border-border bg-white/95 px-2.5">
        <span className="block h-[7px] border-b-[1.5px] border-l-[1.5px] border-r-[1.5px] border-foreground" style={{ width: barPx }} />
        <span className="text-[10.5px] font-bold">1 m</span>
        <span className="text-[10.5px] text-muted-foreground">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="num pointer-events-none absolute bottom-3 left-3 flex h-[22px] items-center gap-1.5 rounded-md border border-border bg-white/95 px-2 text-[10.5px] text-muted-foreground">
        {floor.verifiedAt ? `縮尺確認済み ${fmtDate(floor.verifiedAt)}` : "縮尺が未確認"}
      </div>
    </div>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getMonth() + 1}/${d.getDate()}`;
}

function axisLinesOf(floor: VenueFloor): { x: number[]; y: number[] } {
  const pitch = floor.grid?.pitchMm || 0;
  if (!pitch) return { x: [], y: [] };
  return {
    x: (floor.grid.x ?? []).map((_, i) => i * pitch),
    y: (floor.grid.y ?? []).map((_, i) => i * pitch),
  };
}

