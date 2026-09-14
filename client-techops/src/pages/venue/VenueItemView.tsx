// 会場図面 — 品目1個の描画・選択枠・つまみ（つかんで動かす・8方向リサイズ・回転・
// クレーンのアーム角度）。設計: docs/design/v4/venue-layout.md §6②の操作表。
//
// 「動かしていなければ commit しない」状態機械・つまみの当たり判定・回転の考え方は
// `client-techops/src/pages/opsmanual/ManualBlockView.tsx` の**設計を写した**もの
// （盤自体は運営マニュアルと別に書く方針・§12-6）。実際の幾何計算は
// `manualCanvasGeometry.ts` の純粋関数（`beginResize`/`applyResize`/`angleFromCenter`/
// `normalizeAngle`/`clamp`）をそのまま import して使う（§6②の操作表どおり）。
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { collectVenueSnapTargets, fromTopLeftRect, toTopLeftRect } from "@gmo-onair/shared/src/venue/geometry";
import {
  RESIZE_HANDLES,
  ROTATE_STEP_DEG,
  angleFromCenter,
  applyResize,
  beginResize,
  normalizeAngle,
  snapPosition,
  type ResizeHandle,
  type ResizeStartInfo,
} from "@/pages/opsmanual/manualCanvasGeometry";
import { renderVenueSymbolBody } from "./venueSymbols";

const HANDLE_TARGET_PX = 9;
const ROTATE_TARGET_PX = 11;
const ROTATE_GAP_PX = 22;
const DRAG_START_PX = 3;

interface Rect { x: number; y: number; w: number; h: number; rotation: number }
type DragMode = "move" | "resize" | "rotate" | "arm";
interface DragState {
  mode: DragMode;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  orig: Rect;
  live: Rect;
  origArm?: number;
  handle?: ResizeHandle;
  resizeStart?: ResizeStartInfo;
  rotateCenter?: { x: number; y: number };
  started?: boolean;
  /** グループの1つを（ダブルクリックでなく）そのままつかんだ移動——グループ全体を
   *  同じ量だけ動かす（§4-6「グループは全体でつかんで動かせる」）。個別移動＝グループから
   *  外れる（既存の§7）とは別の経路 */
  groupMove?: boolean;
}

export interface VenueItemViewProps {
  item: VenueItem;
  catalog?: VenueCatalogItem;
  selected: boolean;
  overflowing: boolean;
  editable: boolean;
  pxPerMm: number;
  /** mm（絶対フロア座標）→ 画面の client 座標（回転つまみ・アームつまみの中心計算に使う） */
  mmToClient: (mm: { x: number; y: number }) => { x: number; y: number };
  allItems: VenueItem[];
  areaBboxMm: { x: number; y: number; w: number; h: number };
  axisLinesMm: { x: number[]; y: number[] };
  snapEnabled: boolean;
  onSelect: (shiftKey: boolean, dblClick: boolean) => void;
  onPatchCommit: (patch: Partial<VenueItem>) => void;
  onSnapGuides: (guides: { x: number[]; y: number[] } | null) => void;
  /** グループ移動の途中経過（このグループの他のメンバーの見た目をこの分だけずらす）。
   *  自分自身の描画は `liveRect` を優先するのでここには影響しない */
  groupDragOffset: { dx: number; dy: number } | null;
  onGroupDragPreview: (offset: { dx: number; dy: number } | null) => void;
  /** グループ全メンバーへ同じ dx/dy を適用して確定する（グループには残す） */
  onGroupMoveCommit: (dx: number, dy: number) => void;
  /** グループ丸ごとが選択中（このメンバーだけの回転・伸ばすつまみは出さない——
   *  50脚のグループを選ぶと50個のつまみが重なって出ていた。個別に触るには
   *  ダブルクリックで1つだけを選び直す・§4-6） */
  hideOwnHandles: boolean;
}

/** 図形（伸ばせる品目）だけ8方向のつまみを出す（§8-7「品目は伸ばせない」） */
function isResizable(item: VenueItem): boolean {
  return item.kind === "shape";
}

export default function VenueItemView({
  item, catalog, selected, overflowing, editable, pxPerMm, mmToClient, allItems, areaBboxMm, axisLinesMm, snapEnabled,
  onSelect, onPatchCommit, onSnapGuides, groupDragOffset, onGroupDragPreview, onGroupMoveCommit, hideOwnHandles,
}: VenueItemViewProps) {
  const dragRef = useRef<DragState | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [liveRect, setLiveRect] = useState<Rect | null>(null);
  const [liveArm, setLiveArm] = useState<number | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const baseRect = toTopLeftRect(item);
  // グループ移動中は、実際につかんでいる品目（`liveRect` を持つ）以外のメンバーも
  // 同じ dx/dy だけずらして見せる（グループ全体が一緒に動いて見えるように）
  const previewRect: Rect = groupDragOffset
    ? { x: baseRect.x + groupDragOffset.dx, y: baseRect.y + groupDragOffset.dy, w: baseRect.w, h: baseRect.h, rotation: item.rotation }
    : { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation };
  const rect: Rect = liveRect ?? previewRect;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const armAngle = liveArm ?? item.armAngle ?? 0;
  const isCrane = item.kind === "camera" && typeof catalog?.extra?.sweepRadiusMm === "number";

  function mmPerClientPx(): number {
    return pxPerMm > 0 ? 1 / pxPerMm : 1;
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    const changed =
      drag.live.x !== drag.orig.x || drag.live.y !== drag.orig.y || drag.live.w !== drag.orig.w ||
      drag.live.h !== drag.orig.h || drag.live.rotation !== drag.orig.rotation || (drag.mode === "arm" && liveArm !== drag.origArm);
    if (changed && editable) {
      if (drag.mode === "move" && drag.groupMove) {
        // グループをそのままつかんだ移動——グループ全体へ同じ dx/dy を適用し、
        // グループには残す（§4-6「グループは全体でつかんで動かせる」）
        onGroupMoveCommit(drag.live.x - drag.orig.x, drag.live.y - drag.orig.y);
      } else if (drag.mode === "move") {
        const next = fromTopLeftRect(item, { x: drag.live.x, y: drag.live.y, w: drag.live.w, h: drag.live.h });
        // レビュー指摘（P2）: line/dimension/ベルトパーテーション（`points` を持つ品目）は
        // 描画も当たり判定も `points` の絶対座標を見る（`x`/`y` は使わない）。`points` を
        // 送らないと、ドラッグ中は見た目が動いても保存されず、指を離すと元の位置へ
        // 戻って見えていた。並べたグループの1つを個別に動かすと、そのグループから外れる
        // （§7「動かした1つはグループから外れる」）
        onPatchCommit({ x: next.x, y: next.y, points: next.points, groupId: undefined });
      } else if (drag.mode === "resize") {
        const next = fromTopLeftRect(item, { x: drag.live.x, y: drag.live.y, w: drag.live.w, h: drag.live.h });
        onPatchCommit({ x: next.x, y: next.y, w: next.w, d: next.d, diameter: next.diameter, points: next.points });
      } else if (drag.mode === "rotate") {
        onPatchCommit({ rotation: drag.live.rotation });
      } else if (drag.mode === "arm") {
        onPatchCommit({ armAngle: normalizeAngle(liveArm ?? item.armAngle ?? 0) });
      }
    }
    dragRef.current = null;
    setLiveRect(null);
    setLiveArm(null);
    onSnapGuides(null);
    onGroupDragPreview(null);
  }

  function subscribeWindowDrag(onMove: (e: PointerEvent) => void) {
    cleanupRef.current?.();
    const onEnd = () => { cleanupRef.current?.(); endDrag(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    cleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      cleanupRef.current = null;
    };
  }

  // ── つかんで動かす ──────────────────────────────────
  function handleBodyPointerDown(e: ReactPointerEvent<SVGGElement>) {
    e.stopPropagation();
    const dblClick = e.detail >= 2;
    onSelect(e.shiftKey, dblClick);
    if (!editable || item.locked) return;
    const orig: Rect = { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation };
    // ダブルクリックでなく、グループの1つをそのままつかんだときはグループ全体を動かす
    // （§4-6）。ダブルクリックはこの1つだけを選び、動かせばグループから外れる（既存の§7）
    const groupMove = !!item.groupId && !dblClick;
    dragRef.current = { mode: "move", pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig, started: false, groupMove };
    subscribeWindowDrag(handleBodyPointerMove);
  }
  function handleBodyPointerMove(e: PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "move" || e.pointerId !== drag.pointerId) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) < DRAG_START_PX) return;
      drag.started = true;
    }
    const mmPerPx = mmPerClientPx();
    const dxMm = (e.clientX - drag.startClientX) * mmPerPx;
    const dyMm = (e.clientY - drag.startClientY) * mmPerPx;
    let nx = drag.orig.x + dxMm;
    let ny = drag.orig.y + dyMm;
    let guideX: number | null = null;
    let guideY: number | null = null;
    if (snapEnabled) {
      const targets = collectVenueSnapTargets(allItems, [item.id], areaBboxMm, axisLinesMm, true);
      const snapped = snapPosition(nx, ny, drag.orig.w, drag.orig.h, targets);
      nx = snapped.x;
      ny = snapped.y;
      guideX = snapped.guideX;
      guideY = snapped.guideY;
    }
    const next: Rect = { x: nx, y: ny, w: drag.orig.w, h: drag.orig.h, rotation: drag.orig.rotation };
    drag.live = next;
    setLiveRect(next);
    if (drag.groupMove) onGroupDragPreview({ dx: nx - drag.orig.x, dy: ny - drag.orig.y });
    onSnapGuides(guideX != null || guideY != null ? { x: guideX != null ? [guideX] : [], y: guideY != null ? [guideY] : [] } : null);
  }

  // ── 8方向リサイズ（図形だけ） ──────────────────────────
  function handleResizeStart(e: ReactPointerEvent<SVGCircleElement>, handle: ResizeHandle) {
    e.stopPropagation();
    onSelect(false, false);
    if (!editable) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const orig: Rect = { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation };
    const resizeStart = beginResize(handle, orig);
    dragRef.current = { mode: "resize", pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig, handle, resizeStart };
  }
  function handleResizeMove(e: ReactPointerEvent<SVGCircleElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "resize" || !drag.resizeStart) return;
    const mmPerPx = mmPerClientPx();
    const dxMm = (e.clientX - drag.startClientX) * mmPerPx;
    const dyMm = (e.clientY - drag.startClientY) * mmPerPx;
    const r = applyResize(drag.resizeStart, dxMm, dyMm, undefined, e.shiftKey);
    const next: Rect = { x: r.x, y: r.y, w: r.w, h: r.h, rotation: drag.orig.rotation };
    drag.live = next;
    setLiveRect(next);
  }

  // ── 回転つまみ ────────────────────────────────────
  function handleRotateStart(e: ReactPointerEvent<SVGCircleElement>) {
    e.stopPropagation();
    onSelect(false, false);
    if (!editable) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const orig: Rect = { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation };
    const center = mmToClient({ x: cx, y: cy });
    dragRef.current = { mode: "rotate", pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, orig, live: orig, rotateCenter: center };
  }
  function handleRotateMove(e: ReactPointerEvent<SVGCircleElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "rotate" || !drag.rotateCenter) return;
    const angle = angleFromCenter(drag.rotateCenter, e.clientX, e.clientY);
    const stepped = e.shiftKey ? angle : Math.round(angle / ROTATE_STEP_DEG) * ROTATE_STEP_DEG;
    const next: Rect = { ...drag.orig, rotation: normalizeAngle(stepped) };
    drag.live = next;
    setLiveRect(next);
  }

  // ── クレーンのアーム角度（台車の回転と独立・§4-3） ────────────
  function handleArmStart(e: ReactPointerEvent<SVGCircleElement>) {
    e.stopPropagation();
    onSelect(false, false);
    if (!editable) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
    const center = mmToClient({ x: cx, y: cy });
    dragRef.current = { mode: "arm", pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, orig: { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation }, live: { x: baseRect.x, y: baseRect.y, w: baseRect.w, h: baseRect.h, rotation: item.rotation }, origArm: armAngle, rotateCenter: center };
  }
  function handleArmMove(e: ReactPointerEvent<SVGCircleElement>) {
    const drag = dragRef.current;
    if (!drag || drag.mode !== "arm" || !drag.rotateCenter) return;
    const angle = angleFromCenter(drag.rotateCenter, e.clientX, e.clientY) - item.rotation;
    const stepped = e.shiftKey ? angle : Math.round(angle / ROTATE_STEP_DEG) * ROTATE_STEP_DEG;
    setLiveArm(normalizeAngle(stepped));
  }

  const handleMm = HANDLE_TARGET_PX / Math.max(pxPerMm, 0.0001);
  const rotateMm = ROTATE_TARGET_PX / Math.max(pxPerMm, 0.0001);
  const rotateGapMm = ROTATE_GAP_PX / Math.max(pxPerMm, 0.0001);
  const strokeMm = 1.5 / Math.max(pxPerMm, 0.0001);
  const color = overflowing ? "#c7243a" : selected ? "#005bac" : "#1a1d24";

  // 2点で置く品目（線・寸法線・ベルトパーテーション）は絶対座標をそのまま使う——
  // 中心基準の translate/rotate には乗せない
  if (item.points && item.points.length >= 2) {
    const [p1, p2] = item.points;
    return (
      <g style={{ color, cursor: editable && !item.locked ? "move" : "default" }} onPointerDown={handleBodyPointerDown}>
        <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke="currentColor" strokeWidth={16} strokeLinecap="round"
          strokeDasharray={item.style?.["line-style"] === "dashed" ? "80 60" : undefined} />
        {item.kind === "dimension" && (
          <>
            <circle cx={p1[0]} cy={p1[1]} r={30} fill="currentColor" />
            <circle cx={p2[0]} cy={p2[1]} r={30} fill="currentColor" />
          </>
        )}
        {item.key === "belt-partition" && (
          <>
            <circle cx={p1[0]} cy={p1[1]} r={Number(catalog?.extra?.baseRadiusMm) || 175} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={16} />
            <circle cx={p2[0]} cy={p2[1]} r={Number(catalog?.extra?.baseRadiusMm) || 175} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={16} />
          </>
        )}
      </g>
    );
  }

  return (
    <g style={{ color }}>
      <g
        transform={`translate(${cx} ${cy}) rotate(${rect.rotation})`}
        style={{ cursor: editable && !item.locked ? "move" : "default" }}
        onPointerDown={handleBodyPointerDown}
      >
        {/* 当たり判定を広くする透明な矩形（極小の品目でも選びやすくする） */}
        <rect x={-rect.w / 2} y={-rect.h / 2} width={rect.w} height={rect.h} fill="#fff" fillOpacity={0} />
        {renderVenueSymbolBody(catalog?.symbol ?? (item.diameter != null ? "generic-circle" : "generic-rect"), rect.w, rect.h)}
        {isCrane && (
          <CraneOverlay armAngle={armAngle} catalog={catalog} onArmStart={handleArmStart} onArmMove={handleArmMove} onArmEnd={endDrag} strokeMm={strokeMm} rotateMm={rotateMm} />
        )}
        {selected && (
          <rect x={-rect.w / 2 - handleMm} y={-rect.h / 2 - handleMm} width={rect.w + handleMm * 2} height={rect.h + handleMm * 2}
            fill="none" stroke={color} strokeWidth={strokeMm} strokeDasharray={`${strokeMm * 6} ${strokeMm * 4}`} />
        )}
      </g>

      {selected && editable && !item.locked && !hideOwnHandles && (
        <g transform={`translate(${cx} ${cy}) rotate(${rect.rotation})`}>
          <line x1={0} y1={-rect.h / 2 - handleMm} x2={0} y2={-rect.h / 2 - handleMm - rotateGapMm} stroke={color} strokeWidth={strokeMm} />
          <circle
            cx={0} cy={-rect.h / 2 - handleMm - rotateGapMm} r={rotateMm} fill="#ffffff" stroke={color} strokeWidth={strokeMm * 1.4}
            style={{ cursor: "grab" }}
            onPointerDown={handleRotateStart}
            onPointerMove={handleRotateMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          {isResizable(item) && RESIZE_HANDLES.map((h) => {
            const frac = HANDLE_FRAC[h];
            const hx = (frac.x - 0.5) * rect.w;
            const hy = (frac.y - 0.5) * rect.h;
            return (
              <circle
                key={h} cx={hx} cy={hy} r={handleMm * 0.6} fill="#ffffff" stroke={color} strokeWidth={strokeMm * 1.4}
                style={{ cursor: `${h}-resize` }}
                onPointerDown={(e) => handleResizeStart(e, h)}
                onPointerMove={handleResizeMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}

const HANDLE_FRAC: Record<ResizeHandle, { x: number; y: number }> = {
  nw: { x: 0, y: 0 }, n: { x: 0.5, y: 0 }, ne: { x: 1, y: 0 },
  w: { x: 0, y: 0.5 }, e: { x: 1, y: 0.5 },
  sw: { x: 0, y: 1 }, s: { x: 0.5, y: 1 }, se: { x: 1, y: 1 },
};

/** クレーン（TK-53L 等）のアーム・届く範囲・テールの重ね描き（§11-2） */
function CraneOverlay({
  armAngle, catalog, onArmStart, onArmMove, onArmEnd, strokeMm, rotateMm,
}: {
  armAngle: number;
  catalog?: VenueCatalogItem;
  onArmStart: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onArmMove: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onArmEnd: () => void;
  strokeMm: number;
  rotateMm: number;
}) {
  const extra = catalog?.extra ?? {};
  const arm = Number(extra.armMm ?? extra.arm) || 3200;
  const tail = Number(extra.tailMm ?? extra.tail) || 1300;
  const sweep = Number(extra.sweepRadiusMm ?? catalog?.sizeMm?.sweepRadiusMm) || arm + 600;
  const camD = Number(extra.cameraDepthMm) || 800;
  return (
    <g transform={`rotate(${armAngle})`}>
      <circle cx={0} cy={0} r={sweep} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="140 90" strokeWidth={strokeMm} />
      <circle cx={0} cy={0} r={tail} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="140 90" strokeWidth={strokeMm} />
      <line x1={0} y1={tail * 0.4} x2={0} y2={-arm} stroke="currentColor" strokeWidth={strokeMm * 26} strokeLinecap="round" />
      <rect x={-camD * 0.22} y={-arm - camD} width={camD * 0.44} height={camD} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={strokeMm * 10} rx={20} />
      <circle
        cx={0} cy={-arm} r={rotateMm * 0.8} fill="#ffffff" stroke="currentColor" strokeWidth={strokeMm * 1.4} style={{ cursor: "grab" }}
        onPointerDown={onArmStart} onPointerMove={onArmMove} onPointerUp={onArmEnd} onPointerCancel={onArmEnd}
      />
    </g>
  );
}

