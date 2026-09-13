// キャンバス（ManualCanvas）の操作で使う純粋関数。React に依存しない
// （ManualCanvas.tsx・ManualBlockView.tsx から使う。段Bのスコープ = 汎用のキャンバスメカニクスのみ）。
import { PAGE_HEIGHT_MM, PAGE_MARGIN_MM, PAGE_WIDTH_MM } from "@gmo-onair/shared/src/opsmanual/types";

export const MIN_BLOCK_MM = 5;
export const SNAP_THRESHOLD_MM = 2;
export const ROTATE_STEP_DEG = 15;
export const ARROW_STEP_MM = 1;
export const ARROW_STEP_FINE_MM = 0.2;

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

let blockIdSeq = 0;
/** 複製で使う新しい id。サーバーの id 発番とは無関係（保存前のクライアント側の仮 id） */
export function genBlockId(): string {
  blockIdSeq += 1;
  return `blk_${Date.now().toString(36)}_${blockIdSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 入力欄など、キャンバスのショートカット（矢印キー・Delete・Ctrl+Z 等）を奪ってはいけない相手か */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * 選択中の表・体制図の中で、クリックが入力欄・ボタンに乗っているか（`.closest()` なので
 * アイコン等の子要素をクリックしても拾う）。**乗っていないとき**（行間・チームどうしの隙間
 * など中身の「地」）はブロックの pointerdown を止めない — 止めると、選択済みの表・体制図を
 * つかんで動かす手段が無くなる（レビュー指摘: 枠は `pointer-events-none` なので掴めない）。
 */
export function isInteractiveClickTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest("input, textarea, button, select, [contenteditable='true']");
}

/** 矩形どうしが重なっているか（マーキー選択の当たり判定。回転は無視して外接矩形で見る） */
export function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── 複数選択: 整列・等間隔・重ね順（production-manual.md §6-2「複数選択」） ──────

export type AlignMode = "left" | "h-center" | "right" | "top" | "v-middle" | "bottom";

/** 選んだブロックを、選択全体の外接矩形を基準にそろえる。2個未満は何もしない */
export function alignBlocks<T extends { id: string; x: number; y: number; w: number; h: number }>(
  blocks: T[],
  ids: string[],
  mode: AlignMode
): T[] {
  const targets = blocks.filter((b) => ids.includes(b.id));
  if (targets.length < 2) return blocks;
  const minX = Math.min(...targets.map((b) => b.x));
  const maxX = Math.max(...targets.map((b) => b.x + b.w));
  const minY = Math.min(...targets.map((b) => b.y));
  const maxY = Math.max(...targets.map((b) => b.y + b.h));
  return blocks.map((b) => {
    if (!ids.includes(b.id)) return b;
    switch (mode) {
      case "left":
        return { ...b, x: minX };
      case "h-center":
        return { ...b, x: minX + (maxX - minX) / 2 - b.w / 2 };
      case "right":
        return { ...b, x: maxX - b.w };
      case "top":
        return { ...b, y: minY };
      case "v-middle":
        return { ...b, y: minY + (maxY - minY) / 2 - b.h / 2 };
      case "bottom":
        return { ...b, y: maxY - b.h };
    }
  });
}

export type DistributeAxis = "horizontal" | "vertical";

/** 選んだブロックの間隔（辺と辺のすき間）をそろえる。両端は動かさない。3個未満は何もしない */
export function distributeBlocks<T extends { id: string; x: number; y: number; w: number; h: number }>(
  blocks: T[],
  ids: string[],
  axis: DistributeAxis
): T[] {
  const targets = blocks.filter((b) => ids.includes(b.id));
  if (targets.length < 3) return blocks;
  const sorted = [...targets].sort((a, b) => (axis === "horizontal" ? a.x - b.x : a.y - b.y));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSize = sorted.reduce((sum, b) => sum + (axis === "horizontal" ? b.w : b.h), 0);
  const span = axis === "horizontal" ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - totalSize) / (sorted.length - 1);
  const nextPos = new Map<string, number>();
  let cursor = axis === "horizontal" ? first.x : first.y;
  for (const b of sorted) {
    nextPos.set(b.id, cursor);
    cursor += (axis === "horizontal" ? b.w : b.h) + gap;
  }
  return blocks.map((b) => {
    const pos = nextPos.get(b.id);
    if (pos == null) return b;
    return axis === "horizontal" ? { ...b, x: pos } : { ...b, y: pos };
  });
}

export type ZOrderMode = "front" | "back";

/** 選んだブロックをまとめて最前面／最背面へ（相対順は保ったまま） */
export function reorderZ<T extends { id: string; z: number }>(blocks: T[], ids: string[], mode: ZOrderMode): T[] {
  if (ids.length === 0) return blocks;
  const sorted = [...blocks].sort((a, b) => a.z - b.z);
  const selected = sorted.filter((b) => ids.includes(b.id));
  const others = sorted.filter((b) => !ids.includes(b.id));
  const ordered = mode === "front" ? [...others, ...selected] : [...selected, ...others];
  const zById = new Map(ordered.map((b, i) => [b.id, i]));
  return blocks.map((b) => ({ ...b, z: zById.get(b.id) ?? b.z }));
}

// ── スナップ（スナップ）: 他のブロックの端・キャンバスの中心・版面の余白の3種類だけ ──
export interface SnapTargets {
  vertical: number[];
  horizontal: number[];
}

export function collectSnapTargets(blocks: { id: string; x: number; y: number; w: number; h: number }[], excludeId: string): SnapTargets {
  const vertical = [PAGE_WIDTH_MM / 2, PAGE_MARGIN_MM.left, PAGE_WIDTH_MM - PAGE_MARGIN_MM.right];
  const horizontal = [PAGE_HEIGHT_MM / 2, PAGE_MARGIN_MM.top, PAGE_HEIGHT_MM - PAGE_MARGIN_MM.bottom];
  for (const b of blocks) {
    if (b.id === excludeId) continue;
    vertical.push(b.x, b.x + b.w / 2, b.x + b.w);
    horizontal.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { vertical, horizontal };
}

function bestSnap(candidates: number[], targets: number[], threshold: number): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null;
  for (const c of candidates) {
    for (const t of targets) {
      const delta = t - c;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, guide: t };
      }
    }
  }
  return best;
}

export interface SnapResult {
  x: number;
  y: number;
  guideX: number | null;
  guideY: number | null;
}

/** ブロックの左上 (x,y) を、大きさ (w,h) を保ったままスナップ先へ吸着させる（移動用） */
export function snapPosition(x: number, y: number, w: number, h: number, targets: SnapTargets, threshold = SNAP_THRESHOLD_MM): SnapResult {
  const vBest = bestSnap([x, x + w / 2, x + w], targets.vertical, threshold);
  const hBest = bestSnap([y, y + h / 2, y + h], targets.horizontal, threshold);
  return {
    x: vBest ? x + vBest.delta : x,
    y: hBest ? y + hBest.delta : y,
    guideX: vBest ? vBest.guide : null,
    guideY: hBest ? hBest.guide : null,
  };
}

// ── 回転 ──────────────────────────────────────────────
/** 中心からポインタへの角度を「上向き = 0°」の度数に変換する */
export function angleFromCenter(center: { x: number; y: number }, clientX: number, clientY: number): number {
  const rad = Math.atan2(clientY - center.y, clientX - center.x);
  return (rad * 180) / Math.PI + 90;
}

export function normalizeAngle(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

// ── リサイズ（8方向・回転を考慮） ──────────────────────────
//
// 回転していても「つまんでいない側の辺・角」が画面上で動かないようにするため、
// つまんだハンドルの対角（アンカー）のキャンバス座標を掴んだ瞬間に1回だけ求め、
// ドラッグ中はそのグローバル座標を固定点として新しい x/y/w/h を逆算する。
// rotation = 0 のときはこの式がそのまま普通の軸並行リサイズに一致する。
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface HandleMeta {
  /** アンカー（固定点）がブロックの左上から見て何%の位置か（動かす側の対角） */
  anchorFrac: [number, number];
  freeX: boolean;
  freeY: boolean;
}

const HANDLE_META: Record<ResizeHandle, HandleMeta> = {
  n: { anchorFrac: [0.5, 1], freeX: false, freeY: true },
  s: { anchorFrac: [0.5, 0], freeX: false, freeY: true },
  e: { anchorFrac: [0, 0.5], freeX: true, freeY: false },
  w: { anchorFrac: [1, 0.5], freeX: true, freeY: false },
  ne: { anchorFrac: [0, 1], freeX: true, freeY: true },
  nw: { anchorFrac: [1, 1], freeX: true, freeY: true },
  se: { anchorFrac: [0, 0], freeX: true, freeY: true },
  sw: { anchorFrac: [1, 0], freeX: true, freeY: true },
};

export const RESIZE_HANDLES: ResizeHandle[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

export interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface ResizeStartInfo {
  handle: ResizeHandle;
  origW: number;
  origH: number;
  rotationDeg: number;
  /** つまんだ瞬間の、対角（動かない側）のキャンバス座標（mm） */
  anchorGlobal: { x: number; y: number };
}

function rotateVec(x: number, y: number, rad: number): { x: number; y: number } {
  return { x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) };
}

export function beginResize(handle: ResizeHandle, block: BlockRect): ResizeStartInfo {
  const rotationDeg = block.rotation ?? 0;
  const rad = (rotationDeg * Math.PI) / 180;
  const meta = HANDLE_META[handle];
  const anchorLocal = { x: meta.anchorFrac[0] * block.w, y: meta.anchorFrac[1] * block.h };
  const centerLocal = { x: block.w / 2, y: block.h / 2 };
  const anchorRelCenter = { x: anchorLocal.x - centerLocal.x, y: anchorLocal.y - centerLocal.y };
  const centerGlobal = { x: block.x + centerLocal.x, y: block.y + centerLocal.y };
  const rotated = rotateVec(anchorRelCenter.x, anchorRelCenter.y, rad);
  const anchorGlobal = { x: centerGlobal.x + rotated.x, y: centerGlobal.y + rotated.y };
  return { handle, origW: block.w, origH: block.h, rotationDeg, anchorGlobal };
}

function clampSigned(value: number, min: number, fallbackSign: number): number {
  const sign = value === 0 ? fallbackSign : Math.sign(value);
  return sign * Math.max(Math.abs(value), min);
}

/**
 * `dxGlobalMm`/`dyGlobalMm` は掴んだ瞬間からのキャンバス座標系（回転していないキャンバス全体の座標系）
 * でのポインタの移動量。返り値は新しい x/y/w/h（すべてキャンバス座標系・mm）。
 *
 * `aspectLock`（Shift）が true のときは `start.origW / start.origH` の縦横比を保つ。
 * 角のつまみ（両軸自由）は動かした量が大きい側の軸に合わせて拡縮する。辺のつまみ
 * （片軸だけ自由）は、その軸の拡縮率をもう一方の軸にもそのまま適用し、固定側の軸は
 * アンカー（`anchorFrac`。辺のつまみでは元々ブロックの中心）を中心に伸縮する。
 */
export function applyResize(
  start: ResizeStartInfo,
  dxGlobalMm: number,
  dyGlobalMm: number,
  minSize = MIN_BLOCK_MM,
  aspectLock = false
): { x: number; y: number; w: number; h: number } {
  const meta = HANDLE_META[start.handle];
  const rad = (start.rotationDeg * Math.PI) / 180;
  // グローバルな移動量を、ブロック自身の回転していない軸（ローカル座標）へ逆回転させる
  const localDx = dxGlobalMm * Math.cos(rad) + dyGlobalMm * Math.sin(rad);
  const localDy = -dxGlobalMm * Math.sin(rad) + dyGlobalMm * Math.cos(rad);

  const startRelAnchorX = (1 - 2 * meta.anchorFrac[0]) * start.origW;
  const startRelAnchorY = (1 - 2 * meta.anchorFrac[1]) * start.origH;

  const rawX = meta.freeX ? startRelAnchorX + localDx : startRelAnchorX;
  const rawY = meta.freeY ? startRelAnchorY + localDy : startRelAnchorY;

  const relAnchorX = meta.freeX ? clampSigned(rawX, minSize, Math.sign(startRelAnchorX) || 1) : startRelAnchorX;
  const relAnchorY = meta.freeY ? clampSigned(rawY, minSize, Math.sign(startRelAnchorY) || 1) : startRelAnchorY;

  let newW = meta.freeX ? Math.abs(relAnchorX) : start.origW;
  let newH = meta.freeY ? Math.abs(relAnchorY) : start.origH;

  if (aspectLock && start.origW > 0 && start.origH > 0) {
    const scaleW = meta.freeX ? newW / start.origW : null;
    const scaleH = meta.freeY ? newH / start.origH : null;
    const scale = scaleW != null && scaleH != null ? Math.max(scaleW, scaleH) : scaleW ?? scaleH ?? 1;
    newW = Math.max(minSize, start.origW * scale);
    newH = Math.max(minSize, start.origH * scale);
  }

  // 新しい左上を「アンカーから見た相対位置」で求め、アンカーの回転を戻してキャンバス座標に変換する
  const topLeftRelAnchor = { x: -meta.anchorFrac[0] * newW, y: -meta.anchorFrac[1] * newH };
  const offset = rotateVec(topLeftRelAnchor.x, topLeftRelAnchor.y, rad);

  return { x: start.anchorGlobal.x + offset.x, y: start.anchorGlobal.y + offset.y, w: newW, h: newH };
}
