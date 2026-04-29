import { useState, useRef, useCallback, useEffect } from "react";
import { UserPlus, Square, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent } from "@gmo-onair/shared/src/client/ui";

const STAGE_W = 800;
const STAGE_H = 600;

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}

interface StageElement {
  type: "person" | "rect";
  label: string;
  x: number;
  y: number;
  r?: number;
  w?: number;
  h?: number;
}

interface ResizeHandle {
  id: string;
  cx: number;
  cy: number;
  cursor: string;
}

function getHandles(el: StageElement): ResizeHandle[] {
  if (el.type === "person") {
    const r = el.r || 40;
    return [
      { id: "n", cx: el.x, cy: el.y - r, cursor: "n-resize" },
      { id: "s", cx: el.x, cy: el.y + r, cursor: "s-resize" },
      { id: "e", cx: el.x + r, cy: el.y, cursor: "e-resize" },
      { id: "w", cx: el.x - r, cy: el.y, cursor: "w-resize" },
    ];
  }
  if (el.type === "rect") {
    const w = el.w || 160, h = el.h || 50;
    const x1 = el.x - w / 2, y1 = el.y - h / 2, x2 = el.x + w / 2, y2 = el.y + h / 2;
    return [
      { id: "nw", cx: x1, cy: y1, cursor: "nw-resize" },
      { id: "ne", cx: x2, cy: y1, cursor: "ne-resize" },
      { id: "sw", cx: x1, cy: y2, cursor: "sw-resize" },
      { id: "se", cx: x2, cy: y2, cursor: "se-resize" },
      { id: "n", cx: el.x, cy: y1, cursor: "n-resize" },
      { id: "s", cx: el.x, cy: y2, cursor: "s-resize" },
      { id: "e", cx: x2, cy: el.y, cursor: "e-resize" },
      { id: "w", cx: x1, cy: el.y, cursor: "w-resize" },
    ];
  }
  return [];
}

interface StageEditorProps {
  template?: { name: string; elements: StageElement[] } | null;
  onSave: (data: { name: string; elements: StageElement[] }) => void;
  onClose: () => void;
}

export default function StageEditor({ template, onSave, onClose }: StageEditorProps) {
  const [name, setName] = useState(template?.name || "新しい立ち位置図");
  const [elements, setElements] = useState<StageElement[]>(() =>
    JSON.parse(JSON.stringify(template?.elements || []))
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ idx: number; handle: string; startX: number; startY: number; orig: any } | null>(null);
  const [editingLabel, setEditingLabel] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const updateElement = (idx: number, patch: Partial<StageElement>) => {
    setElements((prev) => prev.map((el, i) => (i === idx ? { ...el, ...patch } : el)));
  };

  const addPerson = () => {
    setElements((prev) => [...prev, { type: "person", x: STAGE_W / 2, y: STAGE_H / 2, r: 40, label: "人物" }]);
    setSelectedIdx(elements.length);
  };

  const addRect = () => {
    setElements((prev) => [...prev, { type: "rect", x: STAGE_W / 2, y: STAGE_H / 2, w: 160, h: 50, label: "オブジェクト" }]);
    setSelectedIdx(elements.length);
  };

  const removeElement = (idx: number) => {
    setElements((prev) => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setSelectedIdx(idx);
    const svg = svgRef.current;
    if (!svg) return;
    const p = svgPoint(svg, e.clientX, e.clientY);
    setDragging({ idx, startX: p.x, startY: p.y, origX: elements[idx].x, origY: elements[idx].y });
  }, [elements]);

  const handleResizeStart = useCallback((e: React.MouseEvent, idx: number, handleId: string) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const p = svgPoint(svg, e.clientX, e.clientY);
    const el = elements[idx];
    setResizing({
      idx, handle: handleId, startX: p.x, startY: p.y,
      orig: { r: el.r || 40, w: el.w || 160, h: el.h || 50, x: el.x, y: el.y },
    });
  }, [elements]);

  // Drag movement
  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const p = svgPoint(svg, e.clientX, e.clientY);
      const newX = Math.max(0, Math.min(STAGE_W, dragging.origX + p.x - dragging.startX));
      const newY = Math.max(0, Math.min(STAGE_H, dragging.origY + p.y - dragging.startY));
      updateElement(dragging.idx, { x: Math.round(newX), y: Math.round(newY) });
    };
    const handleUp = () => setDragging(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => { document.removeEventListener("mousemove", handleMove); document.removeEventListener("mouseup", handleUp); };
  }, [dragging]);

  // Resize
  useEffect(() => {
    if (!resizing) return;
    const handleMove = (e: MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      const p = svgPoint(svg, e.clientX, e.clientY);
      const dx = p.x - resizing.startX;
      const dy = p.y - resizing.startY;
      const el = elements[resizing.idx];
      const { handle, orig } = resizing;

      if (el.type === "person") {
        const dist = Math.max(15, orig.r + (["s", "e"].includes(handle) ? 1 : -1) * (handle === "n" || handle === "s" ? dy : dx));
        updateElement(resizing.idx, { r: Math.round(dist) });
      } else if (el.type === "rect") {
        let { w, h, x, y } = orig;
        if (handle.includes("e")) w = Math.max(30, w + dx);
        if (handle.includes("w")) { w = Math.max(30, w - dx); x = orig.x + dx / 2; }
        if (handle.includes("s")) h = Math.max(20, h + dy);
        if (handle.includes("n")) { h = Math.max(20, h - dy); y = orig.y + dy / 2; }
        updateElement(resizing.idx, { w: Math.round(w), h: Math.round(h), x: Math.round(x), y: Math.round(y) });
      }
    };
    const handleUp = () => setResizing(null);
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => { document.removeEventListener("mousemove", handleMove); document.removeEventListener("mouseup", handleUp); };
  }, [resizing, elements]);

  // Delete key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedIdx !== null && editingLabel === null) {
        removeElement(selectedIdx);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedIdx, editingLabel]);

  const sel = selectedIdx !== null ? elements[selectedIdx] : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-[960px] w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] h-[90vh] p-0 gap-0 overflow-hidden flex flex-col"
        aria-describedby={undefined}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 text-[15px] font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground"
            placeholder="テンプレート名"
            aria-label="立ち位置図テンプレート名"
          />
          <button
            onClick={() => onSave({ name, elements })}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="保存"
          >
            <Save size={13} aria-hidden />保存
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
          {/* Stage Area */}
          <div className="flex-1 p-4 bg-background flex items-center justify-center relative min-h-0">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
              className="w-full max-w-[640px] bg-card rounded-xl border border-border shadow-sm"
              style={{ aspectRatio: `${STAGE_W}/${STAGE_H}` }}
            >
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e4e4e7" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width={STAGE_W} height={STAGE_H} fill="url(#grid)" onClick={() => { setSelectedIdx(null); setEditingLabel(null); }} />
              <text x={STAGE_W / 2} y={30} textAnchor="middle" fontSize={14} fill="#a1a1aa" fontWeight="bold">ステージ（下手 ← → 上手）</text>

              {elements.map((el, i) => {
                const isSelected = selectedIdx === i;
                if (el.type === "person") {
                  const r = el.r || 40;
                  return (
                    <g key={i} onClick={(e) => e.stopPropagation()}>
                      <circle cx={el.x} cy={el.y} r={r} fill={isSelected ? "#dbeafe" : "#eff6ff"} stroke={isSelected ? "#2563eb" : "#3b82f6"} strokeWidth={isSelected ? 3 : 2} onMouseDown={(e) => handleMouseDown(e, i)} style={{ cursor: "grab" }} />
                      {editingLabel !== i && (
                        <text x={el.x} y={el.y + r * 0.25} textAnchor="middle" fontSize={r * 0.5} fill="#1e3a5f" fontWeight="bold" onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(i); }} onMouseDown={(e) => handleMouseDown(e, i)} style={{ pointerEvents: "all", userSelect: "none", cursor: "grab" }}>
                          {el.label}
                        </text>
                      )}
                      {isSelected && getHandles(el).map((h) => (
                        <rect key={h.id} x={h.cx - 5} y={h.cy - 5} width={10} height={10} rx={2} fill="#2563eb" stroke="#fff" strokeWidth={1.5} style={{ cursor: h.cursor }} onMouseDown={(e) => handleResizeStart(e, i, h.id)} />
                      ))}
                    </g>
                  );
                }
                if (el.type === "rect") {
                  const w = el.w || 160, h = el.h || 50;
                  const rx = el.x - w / 2, ry = el.y - h / 2;
                  return (
                    <g key={i} onClick={(e) => e.stopPropagation()}>
                      <rect x={rx} y={ry} width={w} height={h} fill={isSelected ? "#fef3c7" : "#fefce8"} stroke={isSelected ? "#d97706" : "#a3a3a3"} strokeWidth={isSelected ? 3 : 1.5} rx={4} onMouseDown={(e) => handleMouseDown(e, i)} style={{ cursor: "grab" }} />
                      {editingLabel !== i && (
                        <text x={el.x} y={el.y + 5} textAnchor="middle" fontSize={14} fill="#52525b" fontWeight="500" onDoubleClick={(e) => { e.stopPropagation(); setEditingLabel(i); }} onMouseDown={(e) => handleMouseDown(e, i)} style={{ pointerEvents: "all", userSelect: "none", cursor: "grab" }}>
                          {el.label}
                        </text>
                      )}
                      {isSelected && getHandles(el).map((ha) => (
                        <rect key={ha.id} x={ha.cx - 5} y={ha.cy - 5} width={10} height={10} rx={2} fill="#d97706" stroke="#fff" strokeWidth={1.5} style={{ cursor: ha.cursor }} onMouseDown={(e) => handleResizeStart(e, i, ha.id)} />
                      ))}
                    </g>
                  );
                }
                return null;
              })}
            </svg>

            {/* Label edit overlay */}
            {editingLabel !== null && elements[editingLabel] && (() => {
              const el = elements[editingLabel];
              const svg = svgRef.current;
              if (!svg) return null;
              const svgRect = svg.getBoundingClientRect();
              const scaleX = svgRect.width / STAGE_W;
              const left = svgRect.left + el.x * scaleX - 40;
              const top = svgRect.top + el.y * (svgRect.height / STAGE_H) - 12;
              return (
                <input
                  autoFocus
                  value={el.label}
                  onChange={(e) => updateElement(editingLabel, { label: e.target.value })}
                  onBlur={() => setEditingLabel(null)}
                  onKeyDown={(e) => e.key === "Enter" && setEditingLabel(null)}
                  className="fixed z-[110] w-20 text-center text-[13px] font-bold bg-card border-2 border-primary rounded px-1 py-0.5 outline-none shadow-lg"
                  style={{ left, top }}
                />
              );
            })()}
          </div>

          {/* Side Panel */}
          <div className="w-56 border-l border-border p-4 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <button onClick={addPerson} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/15 transition-colors">
                <UserPlus size={14} />人物を追加
              </button>
              <button onClick={addRect} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors">
                <Square size={14} />オブジェクトを追加
              </button>
            </div>

            {/* Element list */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">要素一覧</div>
              {elements.length === 0 && <p className="text-[12px] text-muted-foreground italic">要素なし</p>}
              <div className="space-y-1">
                {elements.map((el, i) => (
                  <div key={i} onClick={() => setSelectedIdx(i)} className={`group flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors ${selectedIdx === i ? "bg-primary/10 text-primary" : "hover:bg-accent/50"}`}>
                    <span className="flex-none">{el.type === "person" ? "👤" : "📦"}</span>
                    <span className="flex-1 truncate font-medium">{el.label}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeElement(i); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Properties */}
            {sel && (
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">プロパティ</div>
                <label className="block">
                  <span className="text-[11px] text-muted-foreground">ラベル</span>
                  <input value={sel.label} onChange={(e) => updateElement(selectedIdx!, { label: e.target.value })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none focus:border-primary" />
                </label>
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="text-[11px] text-muted-foreground">X</span>
                    <input type="number" value={sel.x} onChange={(e) => updateElement(selectedIdx!, { x: +e.target.value })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none" />
                  </label>
                  <label className="flex-1">
                    <span className="text-[11px] text-muted-foreground">Y</span>
                    <input type="number" value={sel.y} onChange={(e) => updateElement(selectedIdx!, { y: +e.target.value })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none" />
                  </label>
                </div>
                {sel.type === "person" && (
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">半径</span>
                    <input type="number" value={sel.r || 40} onChange={(e) => updateElement(selectedIdx!, { r: Math.max(15, +e.target.value) })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none" />
                  </label>
                )}
                {sel.type === "rect" && (
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <span className="text-[11px] text-muted-foreground">幅</span>
                      <input type="number" value={sel.w || 160} onChange={(e) => updateElement(selectedIdx!, { w: Math.max(30, +e.target.value) })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none" />
                    </label>
                    <label className="flex-1">
                      <span className="text-[11px] text-muted-foreground">高さ</span>
                      <input type="number" value={sel.h || 50} onChange={(e) => updateElement(selectedIdx!, { h: Math.max(20, +e.target.value) })} className="mt-0.5 w-full px-2 py-1 text-[12px] bg-muted border border-border rounded outline-none" />
                    </label>
                  </div>
                )}
                <button onClick={() => removeElement(selectedIdx!)} className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[12px] text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                  <Trash2 size={12} />この要素を削除
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
