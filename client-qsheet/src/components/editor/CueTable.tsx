import { useState, useCallback, Fragment } from "react";
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
  Plus,
} from "lucide-react";
import SectionMenu from "./SectionMenu";
import { parseDur as parseDurShared, fmtAbs as fmtAbsShared, normalizeDur } from "@/lib/time";
import { makeTrashItem, pushToTrash } from "@/lib/trash";
import CueRow from "./CueRow";
import CueCardList from "./CueCardList";
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
  _vtr?: boolean;
}

interface Props {
  blocks: Block[];
  sections: Section[];
  masters: any;
  stageTemplates?: any[];
  ledScenes?: any[];
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

// ─── Time helpers (共通 lib/time.ts に集約) ───────────
const parseDur = parseDurShared;
const fmtAbs = fmtAbsShared;

// ─── SPEAKER_COLORS ─────────────────────────────────────
const SPEAKER_COLORS = [
  "bg-slate-700", "bg-teal-700", "bg-purple-700", "bg-pink-700", "bg-amber-700",
  "bg-green-700", "bg-blue-800", "bg-red-800", "bg-indigo-700", "bg-orange-700",
];

// ─── CueTable ───────────────────────────────────────────
export default function CueTable(props: Props) {
  // lg 未満ではカード形式の代替ビューに切替。
  // hooks の数が両分岐で変わらないよう、ラッパで分岐し
  // 子コンポーネント側でそれぞれ独立した hook 順序を持つ
  // (リサイズで境界を跨いでもクラッシュしない)。
  const isLg = useMediaQuery("(min-width: 1024px)");
  if (!isLg) {
    return (
      <CueCardList
        blocks={props.blocks}
        sections={props.sections}
        masters={props.masters}
        ledScenes={props.ledScenes}
        updateState={props.updateState}
      />
    );
  }
  return <CueTableLg {...props} />;
}

function CueTableLg({
  blocks,
  sections,
  masters,
  stageTemplates,
  ledScenes,
  meta,
  collapsedBlocks,
  collapsedSections,
  onToggleCollapse,
  onToggleSectionCollapse,
  updateState,
}: Props) {
  const [draggedSectionIdx, setDraggedSectionIdx] = useState<number | null>(null);
  const [dropTargetSectionIdx, setDropTargetSectionIdx] = useState<number | null>(null);
  const [draggedRow, setDraggedRow] = useState<{ si: number; ri: number } | null>(null);
  const [dropTargetRowKey, setDropTargetRowKey] = useState<string | null>(null);
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

  const addVtr = (afterIndex?: number) => {
    const idx = afterIndex !== undefined ? afterIndex + 1 : sections.length;
    updateState((s: any) => {
      const secs = [...s.sections];
      secs.splice(idx, 0, { _vtr: true, label: "VTR", duration: "0:30", rows: [] });
      return { ...s, sections: secs };
    });
  };

  const deleteSection = (si: number) => {
    if (!confirm("このロールを削除しますか？（ゴミ箱から復元可能です）")) return;
    updateState((s: any) => {
      const section = s.sections[si];
      if (!section) return s;
      const trashItem = makeTrashItem('section', section, {
        sectionIdx: si,
        sectionLabel: section.label,
      });
      const nextState = pushToTrash(s, trashItem);
      return { ...nextState, sections: s.sections.filter((_: any, i: number) => i !== si) };
    });
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
      const section = s.sections[si];
      const row = section?.rows?.[ri];
      if (!row) return s;
      const trashItem = makeTrashItem('row', row, {
        sectionIdx: si,
        rowIdx: ri,
        sectionLabel: section.label,
        rowLabel: row.label,
      });
      const nextState = pushToTrash(s, trashItem);
      const secs = [...s.sections];
      secs[si] = { ...secs[si], rows: secs[si].rows.filter((_: any, i: number) => i !== ri) };
      return { ...nextState, sections: secs };
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

  // 任意位置にロール挿入 (idx は挿入位置 = 既存 sections の splice 第一引数)
  const insertSectionAt = (idx: number) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      secs.splice(idx, 0, { label: "【新しいロール】", rows: [] });
      return { ...s, sections: secs };
    });
  };

  // ロール (section) を from → to へ並び替え (HTML5 DnD 用)
  const moveSection = (from: number, to: number) => {
    if (from === to) return;
    updateState((s: any) => {
      const secs = [...s.sections];
      if (from < 0 || from >= secs.length || to < 0 || to >= secs.length) return s;
      const [moved] = secs.splice(from, 1);
      secs.splice(to, 0, moved);
      return { ...s, sections: secs };
    });
  };

  // ロール内の行 (row) を indexed swap ではなく任意位置へ並び替え (HTML5 DnD 用)
  const moveRowTo = (si: number, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    updateState((s: any) => {
      const secs = [...s.sections];
      const rows = [...secs[si].rows];
      if (fromIdx < 0 || fromIdx >= rows.length || toIdx < 0 || toIdx >= rows.length) return s;
      const [moved] = rows.splice(fromIdx, 1);
      rows.splice(toIdx, 0, moved);
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

  // セクション間に挿入する UI (固定高 + opacity 切替で layout shift なし)
  // - 通常: 細い破線 + 中央に小さな "+" のみ表示
  // - hover/focus 時: 3 種ボタン (ロール / CM / VTR) がフェードイン
  const InsertGap = ({ idx }: { idx: number }) => (
    <div className="group relative h-7 flex items-center justify-center">
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-border/40 group-hover:border-primary/40 transition-colors pointer-events-none" />
      {/* デフォルト表示: 小さな + アイコンのみ */}
      <span
        className="relative inline-flex items-center justify-center size-5 rounded-full bg-background text-muted-foreground/60 group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity pointer-events-none"
        aria-hidden
      >
        <Plus size={12} />
      </span>
      {/* hover/focus 時: 3 種挿入ボタン */}
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => insertSectionAt(idx)}
          className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-primary/30 text-primary hover:bg-primary/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} にロールを挿入`}
        >
          ＋ ロール
        </button>
        <button
          type="button"
          onClick={() => addBreak(idx - 1)}
          className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-warning/30 text-warning hover:bg-warning/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} に CM を挿入`}
        >
          ＋ CM
        </button>
        <button
          type="button"
          onClick={() => addVtr(idx - 1)}
          className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-info/30 text-info hover:bg-info/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} に VTR を挿入`}
        >
          ＋ VTR
        </button>
      </div>
    </div>
  );

  return (
    <main className="flex-1 overflow-auto bg-background">
      <div className="p-4 space-y-4">
        <InsertGap idx={0} />
        {sections.map((section, si) => {
          const isSectionDragTarget = dropTargetSectionIdx === si && draggedSectionIdx !== null && draggedSectionIdx !== si;
          const isSectionDragged = draggedSectionIdx === si;

          // Page break
          if (section._pageBreak) {
            return (
              <Fragment key={si}>
                <div className={`flex items-center gap-2 my-1 px-4 animate-in cursor-grab select-none ${isSectionDragged ? "opacity-40" : ""}`}>
                  <GripVertical size={12} className="text-muted-foreground/40 flex-none" />
                  <div className="flex-1 border-t-2 border-dashed border-border" />
                  <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">改ページ</span>
                  <div className="flex-1 border-t-2 border-dashed border-border" />
                  <button onClick={() => deleteSection(si)} className="text-muted-foreground/60 hover:text-destructive transition-colors p-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
                <InsertGap idx={si + 1} />
              </Fragment>
            );
          }

          // Break (CM)
          if (section._break) {
            const breakDur = parseDur(section.duration || "");
            const breakAbsSec = absSec;
            absSec += breakDur;
            return (
              <Fragment key={si}>
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/x-section-idx", String(si)); e.dataTransfer.effectAllowed = "move"; setDraggedSectionIdx(si); }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-section-idx")) { e.preventDefault(); setDropTargetSectionIdx(si); } }}
                  onDragLeave={() => setDropTargetSectionIdx(null)}
                  onDrop={(e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text/x-section-idx"); moveSection(from, si); setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                  onDragEnd={() => { setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                  className={`animate-in ${isSectionDragged ? "opacity-40" : ""} ${isSectionDragTarget ? "outline outline-2 outline-primary outline-offset-2 rounded-lg" : ""}`}
                >
                  <div className="flex items-center gap-3 px-4 py-1.5 bg-foreground/90 dark:bg-foreground/90 rounded-lg cursor-grab select-none">
                    <GripVertical size={13} className="text-background/50 flex-none" aria-hidden />
                    <span className="text-[13px] text-background/70 tabular-nums whitespace-nowrap font-oswald" style={{ letterSpacing: "0.05em" }}>
                      {fmtAbs(breakAbsSec)}
                    </span>
                    <input
                      value={section.label || ""}
                      onChange={(e) => updateSection(si, "label", e.target.value)}
                      className="bg-transparent text-white text-[13px] font-bold border-none outline-none placeholder:text-background/40 tracking-wide flex-1"
                      placeholder="CM"
                    />
                    <span className="text-[15px] font-bold text-white whitespace-nowrap ml-auto font-oswald">
                      {(() => { const d = parseDur(section.duration || ""); const m = Math.floor(d / 60); const s = d % 60; return d > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : ""; })()}
                    </span>
                    <input
                      value={section.duration || ""}
                      onChange={(e) => updateSection(si, "duration", e.target.value)}
                      onBlur={(e) => {
                        const n = normalizeDur(e.target.value);
                        if (n !== e.target.value) updateSection(si, "duration", n);
                      }}
                      className={`w-12 text-center text-[11px] border-none outline-none rounded py-0.5 tabular-nums placeholder:text-background/50 focus:text-background transition-colors ${
                        parseDur(section.duration || "") === 0
                          ? "bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/70"
                          : "bg-foreground/30 text-background/70"
                      }`}
                      placeholder="0:00"
                      title={parseDur(section.duration || "") === 0 ? "尺が未入力です" : undefined}
                    />
                    <button onClick={() => deleteSection(si)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <InsertGap idx={si + 1} />
              </Fragment>
            );
          }

          // VTR section
          if (section._vtr) {
            const vtrDur = parseDur(section.duration || "");
            const vtrAbsSec = absSec;
            absSec += vtrDur;
            return (
              <Fragment key={si}>
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData("text/x-section-idx", String(si)); e.dataTransfer.effectAllowed = "move"; setDraggedSectionIdx(si); }}
                  onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-section-idx")) { e.preventDefault(); setDropTargetSectionIdx(si); } }}
                  onDragLeave={() => setDropTargetSectionIdx(null)}
                  onDrop={(e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text/x-section-idx"); moveSection(from, si); setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                  onDragEnd={() => { setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                  className={`animate-in ${isSectionDragged ? "opacity-40" : ""} ${isSectionDragTarget ? "outline outline-2 outline-primary outline-offset-2 rounded-lg" : ""}`}
                >
                <div className="flex items-center gap-3 px-4 py-1.5 bg-gradient-to-r from-indigo-800 to-indigo-700 dark:from-indigo-900 dark:to-indigo-800 rounded-lg cursor-grab select-none">
                  <GripVertical size={13} className="text-indigo-300 flex-none" aria-hidden />
                  <span className="text-[11px] font-bold text-indigo-200 bg-indigo-950/50 rounded px-1.5 py-0.5 tracking-wider">VTR</span>
                  <span className="text-[13px] text-indigo-200 tabular-nums whitespace-nowrap font-oswald" style={{ letterSpacing: "0.05em" }}>
                    {fmtAbs(vtrAbsSec)}
                  </span>
                  <input
                    value={section.label || ""}
                    onChange={(e) => updateSection(si, "label", e.target.value)}
                    className="bg-transparent text-white text-[13px] font-bold border-none outline-none placeholder:text-indigo-300 tracking-wide flex-1"
                    placeholder="VTR タイトル"
                  />
                  <span className="text-[15px] font-bold text-white whitespace-nowrap ml-auto font-oswald">
                    {(() => { const d = vtrDur; const m = Math.floor(d / 60); const s = d % 60; return d > 0 ? `${m}分${String(s).padStart(2, "0")}秒` : ""; })()}
                  </span>
                  <input
                    value={section.duration || ""}
                    onChange={(e) => updateSection(si, "duration", e.target.value)}
                    onBlur={(e) => {
                      const n = normalizeDur(e.target.value);
                      if (n !== e.target.value) updateSection(si, "duration", n);
                    }}
                    className={`w-12 text-center text-[11px] border-none outline-none rounded py-0.5 tabular-nums placeholder:text-indigo-300 focus:text-white transition-colors ${
                      vtrDur === 0
                        ? "bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/70"
                        : "bg-indigo-950/50 text-indigo-100"
                    }`}
                    placeholder="0:00"
                    title={vtrDur === 0 ? "尺が未入力です" : undefined}
                  />
                  <button onClick={() => deleteSection(si)} className="text-info/80 hover:text-destructive/80 transition-colors p-1">
                    <Trash2 size={13} />
                  </button>
                </div>
                </div>
                <InsertGap idx={si + 1} />
              </Fragment>
            );
          }

          // Normal section (ロール)
          const roleAbsSec = absSec;
          const roleDur = parseDur(section.duration || "");
          absSec += roleDur;
          rowNum++;
          const isSectionCollapsed = collapsedSections?.has(si);

          return (
            <Fragment key={si}>
            <div
              className={`bg-card rounded-xl border border-border overflow-hidden shadow-sm animate-in transition-opacity ${
                isSectionDragged ? "opacity-40" : ""
              } ${isSectionDragTarget ? "ring-2 ring-primary ring-offset-2" : ""}`}
            >
              {/* Section header */}
              <div
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/x-section-idx", String(si)); e.dataTransfer.effectAllowed = "move"; setDraggedSectionIdx(si); }}
                onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-section-idx")) { e.preventDefault(); setDropTargetSectionIdx(si); } }}
                onDragLeave={() => setDropTargetSectionIdx(null)}
                onDrop={(e) => { e.preventDefault(); const from = +e.dataTransfer.getData("text/x-section-idx"); moveSection(from, si); setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                onDragEnd={() => { setDraggedSectionIdx(null); setDropTargetSectionIdx(null); }}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 cursor-grab select-none flex-wrap ${
                  isSectionCollapsed
                    ? "bg-gradient-to-r from-primary/90 to-primary/70"
                    : "bg-gradient-to-r from-primary to-primary/80"
                }`}
              >
                <GripVertical size={14} className="text-white/30 flex-none" aria-hidden />
                <span
                  className="font-bold text-white/25"
                  style={{ fontFamily: "'Roboto Condensed', sans-serif", lineHeight: 1, fontSize: "22px", width: "24px", marginRight: "4px", textAlign: "center", flexShrink: 0 }}
                >
                  {rowNum}
                </span>
                <span className="text-[14px] font-medium text-white tabular-nums whitespace-nowrap font-oswald" style={{ letterSpacing: "0.05em" }}>
                  {fmtAbs(roleAbsSec)}
                </span>
                <input
                  value={section.duration || ""}
                  onChange={(e) => updateSection(si, "duration", e.target.value)}
                  onBlur={(e) => {
                    const n = normalizeDur(e.target.value);
                    if (n !== e.target.value) updateSection(si, "duration", n);
                  }}
                  className={`w-14 text-center text-[13px] font-medium border-none outline-none rounded-md py-1 tabular-nums focus:bg-white/25 transition-colors font-oswald ${
                    parseDur(section.duration || "") === 0
                      ? "bg-amber-400/30 text-amber-50 ring-1 ring-amber-300/80 placeholder:text-amber-100/70"
                      : "bg-white/15 text-white placeholder:text-white/30"
                  }`}
                  placeholder="0:00"
                  title={parseDur(section.duration || "") === 0 ? "尺が未入力です" : undefined}
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
                  onAddVtrAfter={() => addVtr(si)}
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
                        <tr className="text-[11px] text-muted-foreground uppercase tracking-wider">
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
                                className={`px-2 py-2 text-left font-medium border-b border-border/60 relative group/th cursor-grab select-none transition-all ${
                                  draggedBlockId === blk.id ? "opacity-40" : ""
                                } ${isDragTarget ? "border-l-2 border-l-blue-500" : ""}`}
                              >
                                {isCollapsed ? (
                                  <div className="flex items-center justify-center h-full">
                                    <button onClick={() => onToggleCollapse?.(blk.id)} className="p-0.5 hover:bg-accent rounded transition-colors">
                                      <ChevronRight size={10} />
                                    </button>
                                    <span className="text-xs whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>{blk.label}</span>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                    <button onClick={() => onToggleCollapse?.(blk.id)} className="p-0.5 hover:bg-accent rounded transition-colors opacity-0 group-hover/th:opacity-100">
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
                                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover/th:opacity-100 hover:bg-primary transition-opacity"
                                    onMouseDown={(e) => startResize(e, blk)}
                                  />
                                )}
                              </th>
                            );
                          })}
                          <th className="border-b border-border/60" />
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
                            ledScenes={ledScenes}
                            collapsedBlocks={collapsedBlocks}
                            speakerColorMap={speakerColorMap}
                            onChange={(updater) => updateRow(si, ri, updater)}
                            onDelete={() => deleteRow(si, ri)}
                            onMoveUp={() => moveRow(si, ri, -1)}
                            onMoveDown={() => moveRow(si, ri, 1)}
                            onDuplicate={() => duplicateRow(si, ri)}
                            onDeleteEntry={(blockId, entryIdx, payload, meta) => {
                              // エントリ削除: ゴミ箱に退避する（state 変更自体は CueRow 側で完了している）
                              updateState((s: any) => pushToTrash(s, makeTrashItem('entry', payload, {
                                sectionIdx: si,
                                rowIdx: ri,
                                blockId,
                                entryIdx,
                                sectionLabel: meta.sectionLabel ?? section.label,
                                rowLabel: meta.rowLabel,
                              })));
                            }}
                            isRowDragged={draggedRow?.si === si && draggedRow?.ri === ri}
                            isRowDropTarget={dropTargetRowKey === `${si}-${ri}` && draggedRow !== null && (draggedRow.si !== si || draggedRow.ri !== ri)}
                            onRowDragStart={(e) => {
                              e.stopPropagation();
                              e.dataTransfer.setData("text/x-row-key", `${si}-${ri}`);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggedRow({ si, ri });
                            }}
                            onRowDragOver={(e) => {
                              if (!e.dataTransfer.types.includes("text/x-row-key")) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              setDropTargetRowKey(`${si}-${ri}`);
                            }}
                            onRowDragLeave={() => setDropTargetRowKey(null)}
                            onRowDrop={(e) => {
                              if (!e.dataTransfer.types.includes("text/x-row-key")) return;
                              e.preventDefault();
                              const key = e.dataTransfer.getData("text/x-row-key");
                              const [fromSiStr, fromRiStr] = key.split("-");
                              const fromSi = +fromSiStr;
                              const fromRi = +fromRiStr;
                              if (fromSi === si) {
                                moveRowTo(si, fromRi, ri);
                              }
                              // 別ロール間移動は本フェーズでは未対応 (将来対応)
                              setDraggedRow(null);
                              setDropTargetRowKey(null);
                            }}
                            onRowDragEnd={() => { setDraggedRow(null); setDropTargetRowKey(null); }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Add row footer */}
                  <button
                    onClick={() => addRow(si)}
                    className="w-full py-2 text-[12px] text-muted-foreground hover:text-primary hover:bg-primary/10 border-t border-border/60 transition-colors"
                  >
                    ＋ 行を追加
                  </button>
                </>
              )}
            </div>
            <InsertGap idx={si + 1} />
            </Fragment>
          );
        })}

        {/* Add section buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={addSection}
            className="flex-1 min-w-[160px] py-3 text-sm text-muted-foreground hover:text-primary border-2 border-dashed border-border hover:border-primary rounded-xl transition-all"
          >
            ＋ ロールを追加
          </button>
          <button
            onClick={() => addBreak()}
            className="py-3 px-5 text-sm text-muted-foreground hover:text-warning border-2 border-dashed border-border hover:border-warning rounded-xl transition-all"
          >
            ＋ CMなど
          </button>
          <button
            onClick={() => addVtr()}
            className="py-3 px-5 text-sm text-muted-foreground hover:text-info border-2 border-dashed border-border hover:border-info rounded-xl transition-all"
          >
            ＋ VTR
          </button>
        </div>
      </div>
    </main>
  );
}
