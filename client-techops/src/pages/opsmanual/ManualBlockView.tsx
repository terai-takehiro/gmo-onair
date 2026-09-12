// 紙面（ManualCanvas）— ブロック1個の表示・選択枠・8方向のリサイズハンドル・回転つまみ・
// つかんで動かす操作。中身（文字・図形・画像・表・QR の描画）は一切知らず、
// `renderContent` で呼び出し側が描いたものをそのまま矩形の中に置くだけ（段Bのスコープ）。
//
// ライブドラッグ中は見た目だけを更新し（`dragRef` に持つ値＋`liveRect` state）、
// pointerup/pointercancel で初めて `onPatchCommit`（＝親の undo 履歴の1手）を呼ぶ。
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type ManualBlock } from "@gmo-onair/shared/src/opsmanual/types";
import {
  RESIZE_HANDLES,
  ROTATE_STEP_DEG,
  angleFromCenter,
  applyResize,
  beginResize,
  clamp,
  collectSnapTargets,
  normalizeAngle,
  snapPosition,
  type ResizeHandle,
  type ResizeStartInfo,
} from "./manualCanvasGeometry";

export type BlockGeometryPatch = Partial<{ x: number; y: number; w: number; h: number; rotation: number }>;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

type DragMode = "move" | "resize" | "rotate";

interface DragState {
  mode: DragMode;
  pointerId: number;
  pxPerMm: number;
  startClientX: number;
  startClientY: number;
  orig: Rect;
  live: Rect;
  handle?: ResizeHandle;
  resizeStart?: ResizeStartInfo;
  rotateCenter?: { x: number; y: number };
}

const HANDLE_STYLE: Record<ResizeHandle, CSSProperties> = {
  nw: { left: 0, top: 0, cursor: "nwse-resize" },
  n: { left: "50%", top: 0, cursor: "ns-resize" },
  ne: { left: "100%", top: 0, cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: 0, top: "100%", cursor: "nesw-resize" },
  w: { left: 0, top: "50%", cursor: "ew-resize" },
};

export interface ManualBlockViewProps {
  block: ManualBlock;
  selected: boolean;
  /** すいつき（他ブロックの端）の対象。自分自身が含まれていてよい（id で除外する） */
  allBlocks: ManualBlock[];
  pageRef: React.RefObject<HTMLDivElement>;
  /** 選ぶ・複数選択に足す/外す。Shift+クリックなら true（親が単一選択か足し引きかを判断） */
  onSelect: (shiftKey: boolean) => void;
  /** ドラッグ・リサイズ・回転が確定した瞬間に1回だけ呼ぶ（親が undo 履歴に積む） */
  onPatchCommit: (patch: BlockGeometryPatch) => void;
  onContentCommit: (content: ManualBlock["free"]["content"]) => void;
  onSnapGuides: (guides: { x: number[]; y: number[] } | null) => void;
  renderContent: (ctx: { selected: boolean; onContentCommit: (content: ManualBlock["free"]["content"]) => void }) => ReactNode;
}

export default function ManualBlockView({
  block,
  selected,
  allBlocks,
  pageRef,
  onSelect,
  onPatchCommit,
  onContentCommit,
  onSnapGuides,
  renderContent,
}: ManualBlockViewProps) {
  const blockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [liveRect, setLiveRect] = useState<Rect | null>(null);

  const rect: Rect = liveRect ?? { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation ?? 0 };

  function pxPerMm(): number | null {
    const r = pageRef.current?.getBoundingClientRect();
    return r ? r.width / PAGE_WIDTH_MM : null;
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    // クリックだけ（動かしていない）ときは無変更 — 選択しただけで undo 履歴・自動保存を汚さない
    const changed =
      drag.live.x !== drag.orig.x ||
      drag.live.y !== drag.orig.y ||
      drag.live.w !== drag.orig.w ||
      drag.live.h !== drag.orig.h ||
      drag.live.rotation !== drag.orig.rotation;
    if (changed) {
      if (drag.mode === "move") {
        onPatchCommit({ x: drag.live.x, y: drag.live.y });
      } else if (drag.mode === "resize") {
        onPatchCommit({ x: drag.live.x, y: drag.live.y, w: drag.live.w, h: drag.live.h });
      } else if (drag.mode === "rotate") {
        onPatchCommit({ rotation: drag.live.rotation });
      }
    }
    dragRef.current = null;
    setLiveRect(null);
    onSnapGuides(null);
  }

  // ── つかんで動かす ────────────────────────────────
  function handleBodyPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    onSelect(e.shiftKey);
    const ppm = pxPerMm();
    if (!ppm) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const orig: Rect = { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation ?? 0 };
    dragRef.current = { mode: "move", pointerId: e.pointerId, pxPerMm: ppm, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig };
  }
  function handleBodyPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "move") return;
    const dxMm = (e.clientX - drag.startClientX) / drag.pxPerMm;
    const dyMm = (e.clientY - drag.startClientY) / drag.pxPerMm;
    const targets = collectSnapTargets(allBlocks, block.id);
    const snapped = snapPosition(drag.orig.x + dxMm, drag.orig.y + dyMm, drag.orig.w, drag.orig.h, targets);
    const nx = clamp(snapped.x, 0, Math.max(0, PAGE_WIDTH_MM - drag.orig.w));
    const ny = clamp(snapped.y, 0, Math.max(0, PAGE_HEIGHT_MM - drag.orig.h));
    const next: Rect = { x: nx, y: ny, w: drag.orig.w, h: drag.orig.h, rotation: drag.orig.rotation };
    drag.live = next;
    setLiveRect(next);
    onSnapGuides(snapped.guideX != null || snapped.guideY != null ? { x: snapped.guideX != null ? [snapped.guideX] : [], y: snapped.guideY != null ? [snapped.guideY] : [] } : null);
  }

  // ── 8方向リサイズ ────────────────────────────────
  function handleResizeStart(e: ReactPointerEvent<HTMLDivElement>, handle: ResizeHandle) {
    e.stopPropagation();
    onSelect(false); // 伸縮は常にこのブロック単独の選択にする（Shift はここでは縦横比保持に使う）
    const ppm = pxPerMm();
    if (!ppm) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const orig: Rect = { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation ?? 0 };
    const resizeStart = beginResize(handle, orig);
    dragRef.current = { mode: "resize", pointerId: e.pointerId, pxPerMm: ppm, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig, handle, resizeStart };
  }
  function handleResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "resize" || !drag.resizeStart) return;
    const dxMm = (e.clientX - drag.startClientX) / drag.pxPerMm;
    const dyMm = (e.clientY - drag.startClientY) / drag.pxPerMm;
    // Shift で縦横比を保つ（production-manual.md §6-2「角・辺のつまみ」）
    const r = applyResize(drag.resizeStart, dxMm, dyMm, undefined, e.shiftKey);
    const next: Rect = { x: r.x, y: r.y, w: r.w, h: r.h, rotation: drag.orig.rotation };
    drag.live = next;
    setLiveRect(next);
  }

  // ── 回転つまみ ──────────────────────────────────
  function handleRotateStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    onSelect(false);
    const box = blockRef.current?.getBoundingClientRect();
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const orig: Rect = { x: block.x, y: block.y, w: block.w, h: block.h, rotation: block.rotation ?? 0 };
    dragRef.current = { mode: "rotate", pointerId: e.pointerId, pxPerMm: 1, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig, rotateCenter: center };
  }
  function handleRotateMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "rotate" || !drag.rotateCenter) return;
    const angle = angleFromCenter(drag.rotateCenter, e.clientX, e.clientY);
    const stepped = e.shiftKey ? angle : Math.round(angle / ROTATE_STEP_DEG) * ROTATE_STEP_DEG;
    const next: Rect = { ...drag.orig, rotation: normalizeAngle(stepped) };
    drag.live = next;
    setLiveRect(next);
  }

  const style: CSSProperties = {
    ...(block.style as CSSProperties),
    position: "absolute",
    left: `${rect.x}mm`,
    top: `${rect.y}mm`,
    width: `${rect.w}mm`,
    height: `${rect.h}mm`,
    zIndex: block.z,
    transform: rect.rotation ? `rotate(${rect.rotation}deg)` : (block.style?.transform as string | undefined),
    transformOrigin: "center center",
  };

  return (
    <div
      ref={blockRef}
      data-manual-block
      data-block-id={block.id}
      style={style}
      className="cursor-move touch-none select-none"
      onPointerDown={handleBodyPointerDown}
      onPointerMove={handleBodyPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="absolute inset-0 overflow-hidden">{renderContent({ selected, onContentCommit })}</div>

      {selected && (
        <>
          <div className="pointer-events-none absolute inset-0 border-2 border-primary" />

          <div
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 -translate-y-full bg-primary"
          />
          <div
            role="presentation"
            aria-hidden="true"
            className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-[calc(100%+16px)] touch-none rounded-full border-2 border-primary bg-background"
            style={{ cursor: "grab" }}
            onPointerDown={handleRotateStart}
            onPointerMove={handleRotateMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />

          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle}
              role="presentation"
              aria-hidden="true"
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-primary bg-background"
              style={{ ...HANDLE_STYLE[handle] }}
              onPointerDown={(e) => handleResizeStart(e, handle)}
              onPointerMove={handleResizeMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          ))}
        </>
      )}
    </div>
  );
}
