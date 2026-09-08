// 計時・視聴者（liveops）— 表示レイアウトエディタの編集キャンバス（v4.1・PR3）。
//
// Main.dc.html（モックアップ）の再現: 16:9のダーク/ライト背景キャンバス上に要素カード
// （タイマー・YouTube・Jstream・Zoom・Teams・合計）をドラッグで移動・リサイズする。
// 座標は displayLayout.ts と同じ % 単位。ポインタキャプチャ（`setPointerCapture`）だけで
// 完結させ、window にリスナーを足さない（要素の外まで指が出ても捕捉され続ける）。
//
// 設計: docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md §6
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { DisplayElementKey, DisplayElementLayout, DisplayLayout } from '@gmo-onair/shared/src/client/live/displayLayout';
import { ELEMENT_LABELS, MIN_ELEMENT_SIZE, clampPct } from './displayLayoutDefaults';

function canvasRectOf(target: EventTarget | null): DOMRect | null {
  const el = target instanceof Element ? target.closest('[data-display-edit-canvas]') : null;
  return el ? el.getBoundingClientRect() : null;
}

interface EditableElementProps {
  el: DisplayElementLayout;
  light: boolean;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<DisplayElementLayout>) => void;
}

function EditableElement({ el, light, selected, canManage, onSelect, onChange }: EditableElementProps) {
  const dragOrigin = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const resizeOrigin = useRef<{ x: number; y: number; origW: number; origH: number } | null>(null);

  function onMoveDown(e: ReactPointerEvent<HTMLDivElement>) {
    // 選択とキャンバス背景クリック（＝選択解除）の取り合いになるので、常に伝播を止める。
    e.stopPropagation();
    onSelect();
    if (!canManage) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { x: e.clientX, y: e.clientY, origX: el.x, origY: el.y };
  }
  function onMoveMove(e: ReactPointerEvent<HTMLDivElement>) {
    const origin = dragOrigin.current;
    const rect = canvasRectOf(e.currentTarget);
    if (!origin || !rect) return;
    const dxPct = ((e.clientX - origin.x) / rect.width) * 100;
    const dyPct = ((e.clientY - origin.y) / rect.height) * 100;
    onChange({
      x: clampPct(origin.origX + dxPct, 0, 100 - el.w),
      y: clampPct(origin.origY + dyPct, 0, 100 - el.h),
    });
  }
  function onMoveUp() {
    dragOrigin.current = null;
  }

  function onResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    if (!canManage) return;
    onSelect();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeOrigin.current = { x: e.clientX, y: e.clientY, origW: el.w, origH: el.h };
  }
  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    const origin = resizeOrigin.current;
    const rect = canvasRectOf(e.currentTarget);
    if (!origin || !rect) return;
    const dxPct = ((e.clientX - origin.x) / rect.width) * 100;
    const dyPct = ((e.clientY - origin.y) / rect.height) * 100;
    onChange({
      w: clampPct(origin.origW + dxPct, MIN_ELEMENT_SIZE, 100 - el.x),
      h: clampPct(origin.origH + dyPct, MIN_ELEMENT_SIZE, 100 - el.y),
    });
  }
  function onResizeUp() {
    resizeOrigin.current = null;
  }

  const style: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
  };

  return (
    <div
      style={style}
      className={`flex items-center justify-center rounded-control-md border-2 text-center text-badge ${
        selected ? 'border-primary' : 'border-white/30'
      } ${el.visible ? '' : 'border-dashed opacity-35'} ${light ? 'bg-black/5 text-black' : 'bg-white/10 text-white'} ${
        canManage ? 'cursor-move touch-none' : 'cursor-default'
      }`}
      onPointerDown={onMoveDown}
      onPointerMove={onMoveMove}
      onPointerUp={onMoveUp}
      onPointerCancel={onMoveUp}
    >
      <span className="pointer-events-none truncate px-1">{ELEMENT_LABELS[el.key]}</span>
      {canManage && (
        <div
          role="presentation"
          aria-hidden="true"
          className="absolute -bottom-1.5 -right-1.5 h-4 w-4 touch-none cursor-se-resize rounded-full border-2 border-primary bg-background"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
        />
      )}
    </div>
  );
}

export interface DisplayLayoutEditCanvasProps {
  layout: DisplayLayout;
  canManage: boolean;
  selectedKey: DisplayElementKey | null;
  onSelect: (key: DisplayElementKey | null) => void;
  onChange: (key: DisplayElementKey, patch: Partial<DisplayElementLayout>) => void;
}

export function DisplayLayoutEditCanvas({ layout, canManage, selectedKey, onSelect, onChange }: DisplayLayoutEditCanvasProps) {
  const light = layout.background === 'light';
  return (
    <div
      data-display-edit-canvas
      className={`relative aspect-video w-full select-none overflow-hidden rounded-card border border-border ${light ? 'bg-[#fafafa]' : 'bg-black'}`}
      onPointerDown={() => onSelect(null)}
    >
      {layout.elements.map((el) => (
        <EditableElement
          key={el.key}
          el={el}
          light={light}
          selected={selectedKey === el.key}
          canManage={canManage}
          onSelect={() => onSelect(el.key)}
          onChange={(patch) => onChange(el.key, patch)}
        />
      ))}
    </div>
  );
}
