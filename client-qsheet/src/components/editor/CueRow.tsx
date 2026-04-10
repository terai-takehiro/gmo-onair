import { useState, useRef, useId } from "react";
import { ChevronUp, ChevronDown, Copy, Trash2, ImageIcon } from "lucide-react";
import StageDiagramCell from "./StageDiagramCell";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

interface CueRowData {
  duration: string;
  cells: Record<string, any>;
  [key: string]: any;
}

interface CueRowProps {
  row: CueRowData;
  blocks: Block[];
  masters: any;
  stageTemplates?: any[];
  collapsedBlocks?: Set<string>;
  speakerColorMap: Record<string, string>;
  onChange: (updater: (r: CueRowData) => CueRowData) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
}

// ─── EditablePill ───────────────────────────────────────
// 固定幅w-14、フォントサイズ11px、3文字超はscaleXで圧縮
function EditablePill({
  value,
  color,
  placeholder,
  datalistId,
  datalistOptions,
  onChange,
}: {
  value: string;
  color: string;
  placeholder: string;
  datalistId: string;
  datalistOptions?: string[];
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const len = (value || "").length;
  const scale = len <= 3 ? 1 : Math.max(0.5, 3 / len);

  const startEditing = () => {
    setEditValue("");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleBlur = () => {
    if (editValue !== "") {
      onChange(editValue);
    }
    setEditing(false);
  };

  if (editing || !value) {
    return (
      <>
        <input
          ref={inputRef}
          list={datalistId}
          value={editing ? editValue : value || ""}
          onChange={editing ? (e) => setEditValue(e.target.value) : (e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
          autoFocus={editing}
          className="w-14 h-5 flex-none text-[11px] font-bold text-center rounded-full outline-none bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-400 transition-all"
          placeholder={value || placeholder}
        />
        <datalist id={datalistId}>
          {(datalistOptions || []).map((p, i) => (
            <option key={i} value={p} />
          ))}
        </datalist>
      </>
    );
  }

  return (
    <span
      onClick={startEditing}
      className={`w-14 h-5 rounded-full ${color} flex-none cursor-pointer hover:opacity-80 transition-opacity overflow-hidden`}
      title="クリックで編集"
    >
      <span
        className="flex items-center justify-center w-full h-full text-white text-[11px] font-bold whitespace-nowrap"
        style={scale < 1 ? { transform: `scaleX(${scale})` } : undefined}
      >
        {value}
      </span>
    </span>
  );
}

// ─── Speaker Colors ─────────────────────────────────────
const SPEAKER_COLORS = [
  "bg-slate-700", "bg-teal-700", "bg-purple-700", "bg-pink-700", "bg-amber-700",
  "bg-green-700", "bg-blue-700", "bg-red-800", "bg-indigo-700", "bg-orange-700",
];
const PILL_COLORS: Record<string, string> = { video: "bg-blue-700", audio: "bg-rose-700", telop: "bg-purple-700" };

// ─── CueRow ─────────────────────────────────────────────
export default function CueRow({
  row,
  blocks,
  masters,
  stageTemplates,
  collapsedBlocks,
  speakerColorMap,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: CueRowProps) {
  const [hovered, setHovered] = useState(false);
  const rowUid = useId();

  const updateCell = (blockId: string, newCell: any) => {
    onChange((r) => ({ ...r, cells: { ...r.cells, [blockId]: newCell } }));
  };

  // シナリオのエントリ数を基準にサブ行を生成
  const scenarioBlock = blocks.find((b) => b.type === "scenario");
  const scenarioEntries: any[] = scenarioBlock ? (row.cells?.[scenarioBlock.id]?.entries || []) : [];
  const entryCount = Math.max(scenarioEntries.length, 1);

  const getEntry = (blk: Block, ei: number) => {
    const cell = row.cells?.[blk.id] || {};
    if (blk.type === "scenario") return (cell.entries || [])[ei] || null;
    if (["video", "audio", "telop"].includes(blk.type)) return (cell.entries || [])[ei] || null;
    return null;
  };

  const updateEntry = (blk: Block, ei: number, field: string, value: any) => {
    const cell = { ...(row.cells?.[blk.id] || {}) };
    if (!cell.entries) cell.entries = [];
    while (cell.entries.length <= ei) {
      cell.entries.push(blk.type === "scenario" ? { name: "", html: "", isQWord: false } : { label: "", memo: "" });
    }
    cell.entries[ei] = { ...cell.entries[ei], [field]: value };
    updateCell(blk.id, cell);
  };

  // 全列に同時にエントリを追加
  const addEntryToAllBlocks = () => {
    onChange((r) => {
      const newCells = { ...r.cells };
      blocks.forEach((blk) => {
        const cell = newCells[blk.id] || {};
        if (blk.type === "scenario") {
          newCells[blk.id] = { ...cell, entries: [...(cell.entries || []), { name: "", html: "", isQWord: false }] };
        } else if (["video", "audio", "telop"].includes(blk.type)) {
          newCells[blk.id] = { ...cell, entries: [...(cell.entries || []), { label: "", memo: "" }] };
        }
      });
      return { ...r, cells: newCells };
    });
  };

  return (
    <>
      {Array.from({ length: entryCount }).map((_, ei) => (
        <tr
          key={ei}
          className={`group transition-colors duration-150 hover:bg-blue-50/40 dark:hover:bg-blue-950/10 ${
            ei === entryCount - 1 ? "border-b border-zinc-100/80 dark:border-zinc-800/60" : ""
          }`}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {blocks.map((blk) => {
            if (collapsedBlocks?.has(blk.id)) {
              return <td key={blk.id} className="border-r border-zinc-100/60 dark:border-zinc-800/40" />;
            }
            const en = getEntry(blk, ei);

            // ── Scenario cell ──
            if (blk.type === "scenario") {
              const color = en?.name ? (speakerColorMap[en.name] || SPEAKER_COLORS[0]) : "bg-zinc-400";
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden break-words align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <button
                      onClick={() => updateEntry(blk, ei, "isQWord", !en?.isQWord)}
                      className={`flex-shrink-0 w-5 h-5 rounded text-[9px] font-bold leading-none flex items-center justify-center transition-all mt-[1px] ${
                        en?.isQWord
                          ? "bg-red-500 text-white shadow-sm"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      }`}
                      title="Qワード切替"
                    >
                      Q
                    </button>
                    <EditablePill
                      value={en?.name || ""}
                      color={color}
                      placeholder="名前"
                      datalistId={`p-${rowUid}-${blk.id}-${ei}`}
                      datalistOptions={masters?.persons}
                      onChange={(v) => updateEntry(blk, ei, "name", v)}
                    />
                    {en?.isQWord && <span className="flex-shrink-0 text-red-500 font-bold text-[13px] leading-[20px]">Q→</span>}
                    <textarea
                      value={en?.html?.replace(/<[^>]*>/g, "") || ""}
                      onChange={(e) => updateEntry(blk, ei, "html", e.target.value)}
                      rows={1}
                      className="text-[13px] bg-transparent border-none outline-none resize-none overflow-hidden min-w-0 w-0"
                      style={{ flex: "1 1 0", overflowWrap: "break-word", lineHeight: "20px" }}
                      placeholder={en?.isQWord ? "Qワード..." : "テキスト..."}
                      onInput={(e) => {
                        const t = e.target as HTMLTextAreaElement;
                        t.style.height = "auto";
                        t.style.height = t.scrollHeight + "px";
                      }}
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = el.scrollHeight + "px";
                        }
                      }}
                    />
                  </div>
                </td>
              );
            }

            // ── Video / Audio / Telop cells (paired: pill + memo) ──
            if (["video", "audio", "telop"].includes(blk.type)) {
              const pillColor = PILL_COLORS[blk.type] || "bg-zinc-600";
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <EditablePill
                      value={en?.label || ""}
                      color={en?.label ? pillColor : "bg-zinc-400"}
                      placeholder="ID"
                      datalistId={`${blk.type}-${rowUid}-${blk.id}-${ei}`}
                      datalistOptions={masters?.[blk.type]}
                      onChange={(v) => updateEntry(blk, ei, "label", v)}
                    />
                    <input
                      value={en?.memo || ""}
                      onChange={(e) => updateEntry(blk, ei, "memo", e.target.value)}
                      className="text-[12px] bg-transparent border-none outline-none min-w-0"
                      style={{ flex: "1 1 0", lineHeight: "20px" }}
                      placeholder="メモ..."
                    />
                  </div>
                </td>
              );
            }

            // ── Stage diagram cell ──
            if (blk.type === "stage_diagram") {
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                  {ei === 0 && (
                    <StageDiagramCell
                      cell={row.cells?.[blk.id]}
                      stageTemplates={stageTemplates}
                      onChange={(val) => updateCell(blk.id, val)}
                    />
                  )}
                </td>
              );
            }

            // ── Slide cell (image drop zone) ──
            if (blk.type === "slide") {
              return (
                <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 overflow-hidden align-top">
                  {ei === 0 && (
                    <div className="flex items-center justify-center h-16 border border-dashed border-zinc-200 dark:border-zinc-700 rounded text-zinc-300 dark:text-zinc-600 text-[10px]">
                      <ImageIcon size={14} className="mr-1" />
                      スライド
                    </div>
                  )}
                </td>
              );
            }

            // ── Remarks / other cells ──
            return (
              <td key={blk.id} className="px-1.5 py-0.5 border-r border-zinc-100/60 dark:border-zinc-800/40 align-top">
                {ei === 0 && (
                  <textarea
                    value={(row.cells?.[blk.id] || {}).value || ""}
                    onChange={(e) => updateCell(blk.id, { ...(row.cells?.[blk.id] || {}), value: e.target.value })}
                    className="w-full min-h-[20px] text-[12px] bg-transparent border-none outline-none resize-none"
                    style={{ lineHeight: "20px" }}
                    placeholder="メモ..."
                  />
                )}
              </td>
            );
          })}

          {/* 操作ボタン — 最初のサブ行のみ */}
          {ei === 0 && (
            <td rowSpan={entryCount} className="px-1 align-top w-7 border-b border-zinc-100/80 dark:border-zinc-800/60">
              <div
                className={`flex flex-col items-center gap-0.5 pt-1 transition-all duration-200 ${
                  hovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-1"
                }`}
              >
                <button onClick={onMoveUp} className="p-0.5 text-zinc-300 hover:text-zinc-600 transition-colors">
                  <ChevronUp size={12} />
                </button>
                <button onClick={onMoveDown} className="p-0.5 text-zinc-300 hover:text-zinc-600 transition-colors">
                  <ChevronDown size={12} />
                </button>
                <button onClick={onDuplicate} className="p-0.5 text-zinc-300 hover:text-zinc-600 transition-colors">
                  <Copy size={10} />
                </button>
                <button onClick={onDelete} className="p-0.5 text-zinc-300 hover:text-red-400 transition-colors">
                  <Trash2 size={10} />
                </button>
              </div>
            </td>
          )}
        </tr>
      ))}
      {/* ＋ エントリ追加行 */}
      <tr className="border-b border-zinc-50 dark:border-zinc-900 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors">
        <td colSpan={blocks.length + 1}>
          <button
            onClick={addEntryToAllBlocks}
            className="w-full text-[11px] text-zinc-300 dark:text-zinc-700 hover:text-blue-500 py-1 transition-colors duration-150"
          >
            ＋ エントリを追加
          </button>
        </td>
      </tr>
    </>
  );
}
