import { useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  User,
  Video,
  Type,
  Mic,
  Layout,
  Image,
  FileText,
} from "lucide-react";
import SectionMenu from "./SectionMenu";
import CueRow from "./CueRow";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

interface CueRow {
  duration: string;
  cells: Record<string, any>;
  mergedContent?: string;
  _merged?: boolean;
  [key: string]: any;
}

interface Section {
  label: string;
  rows: CueRow[];
  duration?: string;
  _break?: boolean;
  _pageBreak?: boolean;
}

interface Props {
  blocks: Block[];
  sections: Section[];
  masters: any;
  stageTemplates?: any[];
  sectionTemplates?: any[];
  meta?: any;
  collapsedBlocks?: Set<string>;
  collapsedSections?: Set<number>;
  onToggleCollapse?: (blockId: string) => void;
  onToggleSectionCollapse?: (si: number) => void;
  updateState: (updater: (s: any) => any) => void;
}

// ─── Constants ──────────────────────────────────────────
const BLOCK_ICONS: Record<string, any> = {
  scenario: User,
  video: Video,
  telop: Type,
  audio: Mic,
  stage_diagram: Layout,
  slide: Image,
  remarks: FileText,
  item: FileText,
};

const FIXED_COLS = { ops: 32 };
const WIDTH_PRESETS: Record<string, number> = { S: 120, M: 200, L: 320, XL: 480 };

function defaultBlockWidth(blk: Block): number {
  if (typeof blk.width === "string" && WIDTH_PRESETS[blk.width]) return WIDTH_PRESETS[blk.width];
  return blk.type === "scenario" ? 400 : 140;
}

// ─── Time helpers ───────────────────────────────────────
function parseDur(s: string): number {
  if (!s || !s.trim()) return 0;
  s = s.trim();
  let m = s.match(/^(\d+)[:°](\d+)[:'""](\d+)["'""]?$/);
  if (m) return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
  m = s.match(/^(\d+)[:'."](\d+)["'""]?$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1]);
  return 0;
}

function fmtAbs(sec: number): string {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

// ─── SPEAKER_COLORS ─────────────────────────────────────
const SPEAKER_COLORS = [
  "bg-slate-700", "bg-teal-700", "bg-purple-700", "bg-pink-700", "bg-amber-700",
  "bg-green-700", "bg-blue-800", "bg-red-800", "bg-indigo-700", "bg-orange-700",
];

// ─── CueTable ───────────────────────────────────────────
export default function CueTable({
  blocks,
  sections,
  masters,
  stageTemplates,
  meta,
  collapsedBlocks,
  collapsedSections,
  onToggleCollapse,
  onToggleSectionCollapse,
  updateState,
}: Props) {
  const draggedSectionIdx: number | null = null;
  const dropTargetSectionIdx: number | null = null;
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTargetIdx, setDropTargetIdx] = useState<number | null>(null);

  const getBlockWidth = (blk: Block) => blk.widthPx || defaultBlockWidth(blk);

  const blockTableWidth = blocks.reduce((s, b) => s + (collapsedBlocks?.has(b.id) ? 36 : getBlockWidth(b)), 0) + FIXED_COLS.ops;

  // Column resize
  const startResize = useCallback((e: React.MouseEvent, blk: Block) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getBlockWidth(blk);
    const onMove = (ev: MouseEvent) => {
      const diff = ev.clientX - startX;
      const newW = Math.max(80, startW + diff);
      updateState((s: any) => ({
        ...s,
        blocks: s.blocks.map((b: Block) => b.id === blk.id ? { ...b, widthPx: Math.round(newW) } : b),
      }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [updateState]);

  // Section CRUD
  const addSection = () => {
    updateState((s: any) => ({
      ...s,
      sections: [...s.sections, { label: "【新しいロール】", rows: [] }],
    }));
  };

  const addBreak = (afterIndex?: number) => {
    const idx = afterIndex !== undefined ? afterIndex + 1 : sections.length;
    updateState((s: any) => {
      const secs = [...s.sections];
      secs.splice(idx, 0, { _break: true, label: "CM", duration: "1:00", rows: [] });
      return { ...s, sections: secs };
    });
  };

  const addPageBreak = (afterIndex?: number) => {
    const idx = afterIndex !== undefined ? afterIndex + 1 : sections.length;
    updateState((s: any) => {
      const secs = [...s.sections];
      secs.splice(idx, 0, { _pageBreak: true });
      return { ...s, sections: secs };
    });
  };

  const deleteSection = (si: number) => {
    if (!confirm("このロールを削除しますか？")) return;
    updateState((s: any) => ({ ...s, sections: s.sections.filter((_: any, i: number) => i !== si) }));
  };

  const updateSection = (si: number, field: string, value: string) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      secs[si] = { ...secs[si], [field]: value };
      return { ...s, sections: secs };
    });
  };

  const addRow = (si: number) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      secs[si] = { ...secs[si], rows: [...secs[si].rows, { duration: "", cells: {} }] };
      return { ...s, sections: secs };
    });
  };

  const updateRow = (si: number, ri: number, updater: (r: CueRow) => CueRow) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      const rows = [...secs[si].rows];
      rows[ri] = updater(rows[ri]);
      secs[si] = { ...secs[si], rows };
      return { ...s, sections: secs };
    });
  };

  const deleteRow = (si: number, ri: number) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      secs[si] = { ...secs[si], rows: secs[si].rows.filter((_: any, i: number) => i !== ri) };
      return { ...s, sections: secs };
    });
  };

  const moveRow = (si: number, ri: number, dir: number) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      const rows = [...secs[si].rows];
      const ni = ri + dir;
      if (ni < 0 || ni >= rows.length) return s;
      [rows[ri], rows[ni]] = [rows[ni], rows[ri]];
      secs[si] = { ...secs[si], rows };
      return { ...s, sections: secs };
    });
  };

  const duplicateRow = (si: number, ri: number) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      const rows = [...secs[si].rows];
      rows.splice(ri + 1, 0, JSON.parse(JSON.stringify(rows[ri])));
      secs[si] = { ...secs[si], rows };
      return { ...s, sections: secs };
    });
  };

  // Time calculation
  let absSec = 0;
  if (meta?.broadcastStartTime) {
    const m = meta.broadcastStartTime.match(/(\d+):(\d+):?(\d+)?/);
    if (m) absSec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (parseInt(m[3]) || 0);
  }

  // Speaker color map
  const speakerColorMap: Record<string, string> = {};
  let spkIdx = 0;
  sections.forEach((sec) => {
    (sec.rows || []).forEach((row) => {
      blocks.filter((b) => b.type === "scenario").forEach((blk) => {
        const cell = row.cells?.[blk.id];
        (cell?.entries || []).forEach((en: any) => {
          if (en?.name && !speakerColorMap[en.name]) {
            speakerColorMap[en.name] = SPEAKER_COLORS[spkIdx % SPEAKER_COLORS.length];
            spkIdx++;
          }
        });
      });
    });
  });

  let rowNum = 0;

  return (
    <main className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-950">
      <div className="p-4 space-y-4">
        {sections.map((section, si) => {
          const isSectionDragTarget = dropTargetSectionIdx === si && draggedSectionIdx !== null && draggedSectionIdx !== si;
          const isSectionDragged = draggedSectionIdx === si;

          // Page break
          if (section._pageBreak) {
            return (
              <div key={si} className={`flex items-center gap-2 my-1 px-4 animate-in cursor-grab select-none ${isSectionDragged ? "opacity-40" : ""}`}>
                <GripVertical size={12} className="text-zinc-300 dark:text-zinc-600 flex-none" />
                <div className="flex-1 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600" />
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium whitespace-nowrap">改ページ</span>
                <div className="flex-1 border-t-2 border-dashed border-zinc-300 dark:border-zinc-600" />
                <button onClick={() => deleteSection(si)} className="text-zinc-300 hover:text-red-400 transition-colors p-0.5">
                  <Trash2 size={12} />
                </button>
              </div>
            );
          }

          // Break (CM)
          if (section._break) {
            const breakDur = parseDur(section.duration || "");
            const breakAbsSec = absSec;
            absSec += breakDur;
            return (
              <div key={si} className={`animate-in ${isSectionDragged ? "opacity-40" : ""}`}>
                <div className="flex items-center gap-3 px-4 py-1.5 bg-zinc-800 dark:bg-zinc-700 rounded-lg cursor-grab select-none">
                  <GripVertical size={13} className="text-zinc-500 flex-none" />
                  <span className="text-[13px] text-zinc-400 tabular-nums whitespace-nowrap font-oswald" style={{ letterSpacing: "0.05em" }}>
                    {fmtAbs(breakAbsSec)}
                  </span>
                  <input
                    value={section.label || ""}
                    onChange={(e) => updateSection(si, "label", e.target.value)}
                    className="bg-transparent text-white text-[13px] font-bold border-none outline-none placeholder:text-zinc-500 tracking-wide flex-1"
                    placeholder="CM"
                  />
                  <span className="text-[15px] font-bold text-white whitespace-nowrap ml-auto font-oswald">
                    {(() => { const d = parseDur(section.duration || ""); const m = Math.floor(d / 60); const s = d % 60; return d > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : ""; })()}
                  </span>
                  <input
                    value={section.duration || ""}
                    onChange={(e) => updateSection(si, "duration", e.target.value)}
                    className="w-10 text-center text-[11px] bg-zinc-700 dark:bg-zinc-600 text-zinc-400 border-none outline-none rounded py-0.5 tabular-nums placeholder:text-zinc-500 focus:text-white transition-colors"
                    placeholder="尺"
                  />
                  <button onClick={() => deleteSection(si)} className="text-zinc-500 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          }

          // Normal section (ロール)
          const roleAbsSec = absSec;
          const roleDur = parseDur(section.duration || "");
          absSec += roleDur;
          rowNum++;
          const isSectionCollapsed = collapsedSections?.has(si);

          return (
            <div
              key={si}
              className={`bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden shadow-sm animate-in transition-opacity ${
                isSectionDragged ? "opacity-40" : ""
              } ${isSectionDragTarget ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
            >
              {/* Section header */}
              <div className={`flex items-center gap-2 px-3 sm:px-4 py-2 cursor-grab select-none flex-wrap ${
                isSectionCollapsed
                  ? "bg-gradient-to-r from-blue-800 to-blue-700 dark:from-blue-900 dark:to-blue-800"
                  : "bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-700 dark:to-blue-600"
              }`}>
                <GripVertical size={14} className="text-white/30 flex-none" />
                <span
                  className="font-bold text-white/25"
                  style={{ fontFamily: "'Oswald', sans-serif", lineHeight: 1, fontSize: "22px", width: "24px", marginRight: "4px", textAlign: "center", flexShrink: 0 }}
                >
                  {rowNum}
                </span>
                <span className="text-[14px] font-medium text-white tabular-nums whitespace-nowrap font-oswald" style={{ letterSpacing: "0.05em" }}>
                  {fmtAbs(roleAbsSec)}
                </span>
                <input
                  value={section.duration || ""}
                  onChange={(e) => updateSection(si, "duration", e.target.value)}
                  className="w-14 text-center text-[13px] font-medium bg-white/15 text-white border-none outline-none rounded-md py-1 tabular-nums placeholder:text-white/30 focus:bg-white/25 transition-colors font-oswald"
                  placeholder="尺"
                />
                <div className="w-px h-4 bg-white/20" />
                <input
                  value={section.label || ""}
                  onChange={(e) => updateSection(si, "label", e.target.value)}
                  className="flex-1 bg-transparent text-white text-[13px] font-bold border-none outline-none placeholder:text-blue-200/50 tracking-wide"
                  placeholder="ロール名"
                />
                <button
                  onClick={() => onToggleSectionCollapse?.(si)}
                  className="p-1 rounded hover:bg-white/15 text-white/50 hover:text-white transition-colors"
                >
                  {isSectionCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
                <SectionMenu
                  onDelete={() => deleteSection(si)}
                  onAddBreakAfter={() => addBreak(si)}
                  onAddPageBreakAfter={() => addPageBreak(si)}
                  onSaveTemplate={() => {
                    const name = prompt("テンプレート名:", section.label);
                    if (!name) return;
                    updateState((s: any) => ({
                      ...s,
                      sectionTemplates: [...(s.sectionTemplates || []), { name, section: JSON.parse(JSON.stringify({ label: section.label, rows: section.rows })) }],
                    }));
                  }}
                />
              </div>

              {/* Table body */}
              {!isSectionCollapsed && (
                <>
                  <div className="overflow-x-auto">
                    <table className="border-collapse text-[13px]" style={{ tableLayout: "fixed", width: blockTableWidth + "px", minWidth: "100%" }}>
                      <colgroup>
                        {blocks.map((blk) => (
                          <col key={blk.id} style={{ width: (collapsedBlocks?.has(blk.id) ? 36 : getBlockWidth(blk)) + "px" }} />
                        ))}
                        <col style={{ width: FIXED_COLS.ops + "px" }} />
                      </colgroup>
                      <thead>
                        <tr className="text-[11px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                          {blocks.map((blk, bi) => {
                            const Icon = BLOCK_ICONS[blk.type];
                            const isCollapsed = collapsedBlocks?.has(blk.id);
                            const isDragTarget = dropTargetIdx === bi && draggedBlockId && draggedBlockId !== blk.id;
                            return (
                              <th
                                key={blk.id}
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation();
                                  e.dataTransfer.setData("text/x-block-id", blk.id);
                                  e.dataTransfer.effectAllowed = "move";
                                  setDraggedBlockId(blk.id);
                                }}
                                onDragOver={(e) => {
                                  if (!e.dataTransfer.types.includes("text/x-block-id")) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  setDropTargetIdx(bi);
                                }}
                                onDragLeave={() => setDropTargetIdx(null)}
                                onDrop={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  const fromId = e.dataTransfer.getData("text/x-block-id");
                                  if (!fromId) return;
                                  updateState((s: any) => {
                                    const blks = [...s.blocks];
                                    const fromIdx = blks.findIndex((b: Block) => b.id === fromId);
                                    if (fromIdx < 0 || fromIdx === bi) return s;
                                    const [moved] = blks.splice(fromIdx, 1);
                                    blks.splice(bi, 0, moved);
                                    return { ...s, blocks: blks };
                                  });
                                  setDraggedBlockId(null);
                                  setDropTargetIdx(null);
                                }}
                                onDragEnd={() => { setDraggedBlockId(null); setDropTargetIdx(null); }}
                                className={`px-2 py-2 text-left font-medium border-b border-zinc-100 dark:border-zinc-800 relative group/th cursor-grab select-none transition-all ${
                                  draggedBlockId === blk.id ? "opacity-40" : ""
                                } ${isDragTarget ? "border-l-2 border-l-blue-500" : ""}`}
                              >
                                {isCollapsed ? (
                                  <div className="flex items-center justify-center h-full">
                                    <button onClick={() => onToggleCollapse?.(blk.id)} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors">
                                      <ChevronRight size={10} />
                                    </button>
                                    <span className="text-xs whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>{blk.label}</span>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <button onClick={() => onToggleCollapse?.(blk.id)} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors opacity-0 group-hover/th:opacity-100">
                                      <ChevronDown size={10} />
                                    </button>
                                    {Icon && <Icon size={12} className="opacity-50" />}
                                    {blk.label}
                                  </span>
                                )}
                                {/* Resize handle */}
                                {!isCollapsed && (
                                  <div
                                    draggable={false}
                                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:bg-blue-500 transition-opacity"
                                    onMouseDown={(e) => startResize(e, blk)}
                                  />
                                )}
                              </th>
                            );
                          })}
                          <th className="border-b border-zinc-100 dark:border-zinc-800" />
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, ri) => (
                          <CueRow
                            key={ri}
                            row={row}
                            blocks={blocks}
                            masters={masters}
                            stageTemplates={stageTemplates}
                            collapsedBlocks={collapsedBlocks}
                            speakerColorMap={speakerColorMap}
                            onChange={(updater) => updateRow(si, ri, updater)}
                            onDelete={() => deleteRow(si, ri)}
                            onMoveUp={() => moveRow(si, ri, -1)}
                            onMoveDown={() => moveRow(si, ri, 1)}
                            onDuplicate={() => duplicateRow(si, ri)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add row footer */}
                  <button
                    onClick={() => addRow(si)}
                    className="w-full py-2 text-[12px] text-zinc-400 hover:text-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-t border-zinc-100 dark:border-zinc-800 transition-colors"
                  >
                    ＋ 行を追加
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Add section buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={addSection}
            className="flex-1 py-3 text-sm text-zinc-400 hover:text-blue-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-700 rounded-xl transition-all"
          >
            ＋ ロールを追加
          </button>
          <button
            onClick={() => addBreak()}
            className="py-3 px-6 text-sm text-zinc-400 hover:text-amber-600 border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-amber-300 dark:hover:border-amber-700 rounded-xl transition-all"
          >
            ＋ CMなど
          </button>
        </div>
      </div>
    </main>
  );
}
