import { useState } from "react";
import {
  Plus,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  User,
  Video,
  Type,
  Mic,
  Layout,
  FileText,
  Image,
  Upload,
  FileSpreadsheet,
  Pencil,
  Trash2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
}

interface Masters {
  persons: string[];
  video: string[];
  audio: string[];
  telop: string[];
}

interface Props {
  blocks: Block[];
  masters: Masters;
  meta: {
    title: string;
    draft: string;
    startTime?: string;
    broadcastDate?: string;
    rehearsalDate?: string;
    location?: string;
    author?: string;
  };
  stageTemplates?: any[];
  episodeId: string | null;
  onBlocksChange: (blocks: Block[]) => void;
  onMastersChange: (masters: Masters) => void;
  onMetaChange: (meta: Props["meta"]) => void;
  onEpisodeChange: (episodeId: string | null, episodeCode: string | null) => void;
  onShowImport?: () => void;
  onExportExcel?: () => void;
  onEditStageTemplate?: (idx: number) => void;
}

// ─── Block type config ──────────────────────────────────
const BLOCK_TYPES = [
  { type: "scenario", label: "シナリオ", Icon: User, color: "bg-blue-600" },
  { type: "video", label: "映像", Icon: Video, color: "bg-indigo-600" },
  { type: "slide", label: "スライド", Icon: Image, color: "bg-cyan-600" },
  { type: "telop", label: "テロップ", Icon: Type, color: "bg-purple-600" },
  { type: "audio", label: "オーディオ", Icon: Mic, color: "bg-rose-600" },
  { type: "stage_diagram", label: "立ち位置図", Icon: Layout, color: "bg-amber-600" },
  { type: "remarks", label: "備考", Icon: FileText, color: "bg-zinc-500" },
  { type: "item", label: "小道具", Icon: FileText, color: "bg-green-600" },
];

const MASTER_SECTIONS = [
  { key: "persons" as const, label: "人物", color: "bg-slate-700 text-white" },
  { key: "video" as const, label: "映像", color: "bg-blue-700 text-white" },
  { key: "audio" as const, label: "音声", color: "bg-rose-700 text-white" },
  { key: "telop" as const, label: "テロップ", color: "bg-purple-700 text-white" },
];

// ─── CollapsibleSection ─────────────────────────────────
function CollapsibleSection({
  title,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-100 dark:border-zinc-800/60">
      <div className="flex items-center px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
        <div
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 flex-1 cursor-pointer text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider select-none"
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{title}</span>
        </div>
        {action}
      </div>
      {open && <div className="px-4 pb-3 animate-in">{children}</div>}
    </div>
  );
}

// ─── MasterSection ──────────────────────────────────────
function MasterSection({
  label,
  color,
  items,
  onAdd,
  onRemove,
}: {
  label: string;
  color: string;
  items: string[];
  onAdd: (val: string) => void;
  onRemove: (idx: number) => void;
}) {
  const [input, setInput] = useState("");
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && input.trim()) {
      onAdd(input.trim());
      setInput("");
    }
  };
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((item, i) => (
          <span key={i} className={`group inline-flex items-center gap-1 px-2.5 py-1 ${color} rounded-md text-[11px] font-bold tracking-wide transition-all hover:opacity-80`}>
            <span className="font-mono">{item}</span>
            <button onClick={() => onRemove(i)} className="opacity-0 group-hover:opacity-100 -mr-0.5 hover:text-red-300 transition-all">
              <X size={10} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[11px] text-zinc-300 dark:text-zinc-600 italic">未登録</span>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`${label}を追加 (Enter)`}
        className="w-full px-2.5 py-1.5 text-[12px] bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-zinc-800 dark:focus:border-blue-600 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 transition-all"
      />
    </div>
  );
}

// ─── EditorSidebar ──────────────────────────────────────
export default function EditorSidebar({
  blocks,
  masters,
  meta,
  stageTemplates,
  onBlocksChange,
  onMastersChange,
  onMetaChange,
  onShowImport,
  onExportExcel,
  onEditStageTemplate,
}: Props) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [draggedBlkId, setDraggedBlkId] = useState<string | null>(null);
  const [dropTargetBlkId, setDropTargetBlkId] = useState<string | null>(null);

  const addBlock = (type: string) => {
    const info = BLOCK_TYPES.find((b) => b.type === type);
    onBlocksChange([
      ...blocks,
      { id: `blk_${Date.now()}`, type, label: info?.label || type, width: type === "scenario" ? "L" : "M" },
    ]);
    setShowBlockPicker(false);
  };

  const removeBlock = (idx: number) => {
    if (!confirm("この列を削除しますか？")) return;
    const newBlocks = [...blocks];
    newBlocks.splice(idx, 1);
    onBlocksChange(newBlocks);
  };

  const addMasterItem = (key: keyof Masters, val: string) => {
    if (masters[key]?.includes(val)) return;
    onMastersChange({
      ...masters,
      [key]: [...(masters[key] || []), val],
    });
  };

  const removeMasterItem = (key: keyof Masters, idx: number) => {
    onMastersChange({
      ...masters,
      [key]: masters[key].filter((_, i) => i !== idx),
    });
  };

  return (
    <aside className="hidden lg:block w-60 flex-none border-r border-zinc-200/60 dark:border-zinc-800/60 bg-white/50 dark:bg-zinc-900/50 overflow-y-auto backdrop-blur-sm">
      {/* Columns */}
      <CollapsibleSection
        title="列"
        action={
          <button
            onClick={() => setShowBlockPicker(!showBlockPicker)}
            className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition-colors"
          >
            <Plus size={12} />
          </button>
        }
      >
        {showBlockPicker && (
          <div className="mb-2 p-1.5 bg-zinc-50 dark:bg-zinc-800/80 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm animate-scale-in">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.type}
                onClick={() => addBlock(bt.type)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md hover:bg-white dark:hover:bg-zinc-700 transition-colors text-left"
              >
                <span className={`w-5 h-5 rounded flex items-center justify-center text-white ${bt.color}`}>
                  <bt.Icon size={12} />
                </span>
                <span className="font-medium">{bt.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-0.5">
          {blocks.map((blk, idx) => {
            const bt = BLOCK_TYPES.find((b) => b.type === blk.type);
            const isDragTarget = dropTargetBlkId === blk.id && draggedBlkId && draggedBlkId !== blk.id;
            return (
              <div
                key={blk.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/x-block-id", blk.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedBlkId(blk.id);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("text/x-block-id")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTargetBlkId(blk.id);
                }}
                onDragLeave={() => setDropTargetBlkId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const fromId = e.dataTransfer.getData("text/x-block-id");
                  if (!fromId || fromId === blk.id) return;
                  const newBlocks = [...blocks];
                  const fromIdx = newBlocks.findIndex((b) => b.id === fromId);
                  const toIdx = newBlocks.findIndex((b) => b.id === blk.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  const [moved] = newBlocks.splice(fromIdx, 1);
                  newBlocks.splice(toIdx, 0, moved);
                  onBlocksChange(newBlocks);
                  setDraggedBlkId(null);
                  setDropTargetBlkId(null);
                }}
                onDragEnd={() => { setDraggedBlkId(null); setDropTargetBlkId(null); }}
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors cursor-grab select-none ${
                  draggedBlkId === blk.id ? "opacity-40" : ""
                } ${isDragTarget ? "border-t-2 border-blue-500" : ""}`}
              >
                <GripVertical size={11} className="text-zinc-300 dark:text-zinc-700 flex-none" />
                <span className={`w-4 h-4 rounded flex items-center justify-center text-white flex-none ${bt?.color || "bg-zinc-400"}`}>
                  {bt?.Icon ? <bt.Icon size={10} /> : null}
                </span>
                <span className="flex-1 text-[13px] truncate font-medium">{blk.label}</span>
                <button
                  onClick={() => removeBlock(idx)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all flex-none"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* Master Data */}
      <CollapsibleSection title="マスタデータ" defaultOpen={false}>
        {MASTER_SECTIONS.map((ms) => (
          <MasterSection
            key={ms.key}
            label={ms.label}
            color={ms.color}
            items={masters?.[ms.key] || []}
            onAdd={(val) => addMasterItem(ms.key, val)}
            onRemove={(idx) => removeMasterItem(ms.key, idx)}
          />
        ))}
      </CollapsibleSection>

      {/* Stage Templates */}
      <CollapsibleSection
        title="立ち位置図"
        defaultOpen={false}
        action={
          <button
            onClick={() => onEditStageTemplate?.(-1)}
            className="w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400 transition-colors"
          >
            <Plus size={12} />
          </button>
        }
      >
        {(stageTemplates || []).length === 0 ? (
          <p className="text-[12px] text-zinc-400 italic">テンプレートなし</p>
        ) : (
          <div className="space-y-0.5">
            {(stageTemplates || []).map((t: any, i: number) => (
              <div key={i} className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors">
                <span className="text-sm flex-none">🎭</span>
                <span className="flex-1 truncate font-medium cursor-pointer" onClick={() => onEditStageTemplate?.(i)}>{t.name}</span>
                <button onClick={() => onEditStageTemplate?.(i)} className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-blue-500 transition-all flex-none">
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => {
                    if (!confirm("この立ち位置図を削除しますか？")) return;
                    // Handled by parent
                  }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all flex-none"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* Meta / Details */}
      <CollapsibleSection title="詳細" defaultOpen={false}>
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">リハーサル日</span>
            <input
              type="date"
              value={meta?.rehearsalDate || ""}
              onChange={(e) => onMetaChange({ ...meta, rehearsalDate: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">撮影場所</span>
            <input
              type="text"
              value={meta?.location || ""}
              onChange={(e) => onMetaChange({ ...meta, location: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">作成者</span>
            <input
              type="text"
              value={meta?.author || ""}
              onChange={(e) => onMetaChange({ ...meta, author: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
          </label>
        </div>
      </CollapsibleSection>

      {/* Excel I/O */}
      <CollapsibleSection title="Excel入出力" defaultOpen={false}>
        <div className="space-y-1.5">
          <button
            onClick={onExportExcel}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors text-left"
          >
            <FileSpreadsheet size={14} className="text-blue-600 flex-none" />
            <span className="font-medium">現在の台本をExcel出力</span>
          </button>
          <button
            onClick={onShowImport}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 transition-colors text-left"
          >
            <Upload size={14} className="text-amber-600 flex-none" />
            <span className="font-medium">Excelから読み込み</span>
          </button>
        </div>
      </CollapsibleSection>
    </aside>
  );
}
