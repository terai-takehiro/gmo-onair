// 会場図面 — 道具の帯（設計: docs/design/v4/venue-layout.md §6②）。
// 図形5・整列6・重なり・元に戻す・すいつき／方眼／ものさし・ズーム・階とエリアの
// 切替・階全体の表示、をここに集める。実際の配列変換は `venueItemOps.ts` の
// 純粋関数に任せ、ここは入力の組み立てだけを持つ（1ファイル400行のラチェット対策）。
import { useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import type { VenueArea, VenueFloor, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "./venueBoardMath";
import { alignItems, distributeItems, reorderZItems, SHAPE_DEFAULTS, type AlignMode, type DistributeAxis, type ShapeKey } from "./venueItemOps";

const SHAPE_LABEL: Record<ShapeKey, string> = { rect: "四角", circle: "丸", line: "線", text: "文字", dimension: "寸法線" };
const ALIGN_DEFS: { mode: AlignMode; label: string }[] = [
  { mode: "left", label: "左" }, { mode: "h-center", label: "中央" }, { mode: "right", label: "右" },
  { mode: "top", label: "上" }, { mode: "v-middle", label: "中央" }, { mode: "bottom", label: "下" },
];

export interface VenueToolbarProps {
  items: VenueItem[];
  selectedIds: string[];
  editable: boolean;
  onCommit: (next: VenueItem[]) => void;
  onPlaceShape: (key: ShapeKey) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  showGrid: boolean;
  onToggleGrid: () => void;
  showRuler: boolean;
  onToggleRuler: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  floors: (VenueFloor & { areas: VenueArea[] })[];
  floor: VenueFloor;
  area: VenueArea;
  onAreaChange: (areaId: string) => void;
  showWholeFloor: boolean;
  onToggleWholeFloor: () => void;
}

export default function VenueToolbar({
  items, selectedIds, editable, onCommit, onPlaceShape, onUndo, onRedo, canUndo, canRedo,
  showGrid, onToggleGrid, showRuler, onToggleRuler, snapEnabled, onToggleSnap, zoom, onZoomChange,
  floors, floor, area, onAreaChange, showWholeFloor, onToggleWholeFloor,
}: VenueToolbarProps) {
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
  const hasSelection = selectedIds.length >= 2;
  const currentFloorRow = floors.find((f) => f.id === floor.id);

  return (
    <div className="flex h-11 flex-shrink-0 items-center gap-1 overflow-x-auto rounded-card border border-border bg-card px-2.5">
      {(Object.keys(SHAPE_DEFAULTS) as ShapeKey[]).map((s) => (
        <button key={s} type="button" disabled={!editable} title={SHAPE_LABEL[s]} onClick={() => onPlaceShape(s)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-[11px] font-bold hover:bg-muted/40 disabled:opacity-40">
          {SHAPE_LABEL[s].slice(0, 1)}
        </button>
      ))}
      <Sep />
      <span className="shrink-0 text-[11px] text-muted-foreground">整列</span>
      {ALIGN_DEFS.map((a) => (
        <button key={a.mode} type="button" disabled={!hasSelection || !editable} title={`${a.label}そろえ`}
          onClick={() => onCommit(alignItems(items, selectedIds, a.mode))}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-[10px] font-bold hover:bg-muted/40 disabled:opacity-30">
          {a.label}
        </button>
      ))}
      <button type="button" disabled={selectedIds.length < 3 || !editable} title="等間隔（横）"
        onClick={() => onCommit(distributeItems(items, selectedIds, "horizontal" as DistributeAxis))}
        className="h-7 shrink-0 rounded-control px-1.5 text-[10.5px] font-bold hover:bg-muted/40 disabled:opacity-30">等間隔</button>
      <Sep />
      <span className="shrink-0 text-[11px] text-muted-foreground">重なり</span>
      <button type="button" disabled={selectedIds.length === 0 || !editable} title="前面へ"
        onClick={() => onCommit(reorderZItems(items, selectedIds, "front"))}
        className="h-7 shrink-0 rounded-control px-1.5 text-[10.5px] font-bold hover:bg-muted/40 disabled:opacity-30">前面</button>
      <button type="button" disabled={selectedIds.length === 0 || !editable} title="背面へ"
        onClick={() => onCommit(reorderZItems(items, selectedIds, "back"))}
        className="h-7 shrink-0 rounded-control px-1.5 text-[10.5px] font-bold hover:bg-muted/40 disabled:opacity-30">背面</button>
      <Sep />
      <button type="button" title="元に戻す（Ctrl+Z）" disabled={!canUndo} onClick={onUndo} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control hover:bg-muted/40 disabled:opacity-30">
        <Undo2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" title="やり直す（Ctrl+Shift+Z）" disabled={!canRedo} onClick={onRedo} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control hover:bg-muted/40 disabled:opacity-30">
        <Redo2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="flex-1" />
      <Toggle label="すいつき" on={snapEnabled} onClick={onToggleSnap} />
      <Toggle label="方眼" on={showGrid} onClick={onToggleGrid} />
      <Toggle label="ものさし" on={showRuler} onClick={onToggleRuler} />
      <Sep />
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" title="縮小" disabled={zoom <= ZOOM_MIN} onClick={() => onZoomChange(Math.max(ZOOM_MIN, Math.round((zoom - ZOOM_STEP) * 100) / 100))} className="h-7 w-7 rounded-control text-sm font-bold hover:bg-muted/40 disabled:opacity-30">−</button>
        <span className="num w-11 text-center text-[11.5px] font-bold">{Math.round(zoom * 100)}%</span>
        <button type="button" title="拡大" disabled={zoom >= ZOOM_MAX} onClick={() => onZoomChange(Math.min(ZOOM_MAX, Math.round((zoom + ZOOM_STEP) * 100) / 100))} className="h-7 w-7 rounded-control text-sm font-bold hover:bg-muted/40 disabled:opacity-30">＋</button>
      </div>
      <Sep />
      <div className="relative shrink-0">
        <button type="button" onClick={() => setFloorMenuOpen((v) => !v)} className="flex h-7 items-center gap-1.5 rounded-control border border-border px-2 text-[11.5px] font-bold">
          {floor.floorLabel} {area.label}
        </button>
        {floorMenuOpen && currentFloorRow && (
          <div className="absolute right-0 top-8 z-30 w-56 rounded-card border border-border bg-card p-1 shadow-lg">
            {currentFloorRow.areas.map((a) => (
              <button key={a.id} type="button" onClick={() => { onAreaChange(a.id); setFloorMenuOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[12px] ${a.id === area.id ? "bg-primary/10 font-bold text-primary" : ""}`}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Toggle label="階全体" on={showWholeFloor} onClick={onToggleWholeFloor} />
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-7 shrink-0 items-center gap-1.5 rounded-control px-2 text-[11px] font-bold ${on ? "text-primary" : "text-foreground"}`}>
      <span className={`h-2 w-2 rounded-sm ${on ? "bg-primary" : "bg-border"}`} />
      {label}
    </button>
  );
}
