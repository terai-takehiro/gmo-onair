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
  Monitor,
  Lightbulb,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@gmo-onair/shared/src/client/ui";

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

interface LedScene {
  id: string;
  name: string;
  wall: string;
  floor: string;
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
  ledScenes?: LedScene[];
  episodeId: string | null;
  onBlocksChange: (blocks: Block[]) => void;
  onMastersChange: (masters: Masters) => void;
  onMetaChange: (meta: Props["meta"]) => void;
  onLedScenesChange?: (scenes: LedScene[]) => void;
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
  { type: "led_xr", label: "LED/XR", Icon: Monitor, color: "bg-violet-600" },
  { type: "lighting", label: "照明", Icon: Lightbulb, color: "bg-yellow-600" },
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
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center px-4 py-2.5 hover:bg-accent/40 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-1.5 flex-1 cursor-pointer text-[11px] font-semibold text-muted-foreground uppercase tracking-wider select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
        >
          {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
          <span>{title}</span>
        </button>
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
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((item, i) => (
          <span key={i} className={`group inline-flex items-center gap-1 px-2.5 py-1 ${color} rounded-md text-[11px] font-bold tracking-wide transition-all hover:opacity-80`}>
            <span className="font-mono">{item}</span>
            <button onClick={() => onRemove(i)} className="opacity-0 group-hover:opacity-100 -mr-0.5 hover:text-destructive/80 transition-all">
              <X size={10} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[11px] text-muted-foreground/60 italic">未登録</span>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`${label}を追加 (Enter)`}
        className="w-full px-2.5 py-1.5 text-[12px] bg-muted/50 border border-border rounded-md outline-none focus:border-primary focus:bg-white placeholder:text-muted-foreground/60 placeholder:text-muted-foreground/40 transition-all"
      />
    </div>
  );
}

// ─── LedSceneSection ────────────────────────────────────
function LedSceneSection({
  scenes,
  onChange,
}: {
  scenes: LedScene[];
  onChange: (scenes: LedScene[]) => void;
}) {
  const addScene = () => {
    const next = scenes.length + 1;
    onChange([
      ...scenes,
      { id: `led_${Date.now()}`, name: `S${next}`, wall: "", floor: "" },
    ]);
  };
  const updateScene = (idx: number, patch: Partial<LedScene>) => {
    const next = [...scenes];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const removeScene = (idx: number) => {
    if (!confirm("このシーンを削除しますか？")) return;
    const next = [...scenes];
    next.splice(idx, 1);
    onChange(next);
  };
  return (
    <div>
      {scenes.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic mb-2">シーン未登録</p>
      ) : (
        <div className="space-y-2 mb-2">
          {scenes.map((s, i) => (
            <div
              key={s.id}
              className="group p-2 rounded-md border border-border bg-muted/40 space-y-1"
            >
              <div className="flex items-center gap-1.5">
                <input
                  value={s.name}
                  onChange={(e) => updateScene(i, { name: e.target.value })}
                  placeholder="名前 (例: S1)"
                  className="flex-1 px-1.5 py-1 text-[12px] font-bold bg-card border border-border rounded outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeScene(i)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all flex-none"
                  title="削除"
                >
                  <X size={11} />
                </button>
              </div>
              <label className="flex items-center gap-1.5">
                <span className="w-7 flex-none text-[10px] font-bold text-muted-foreground uppercase">壁</span>
                <input
                  value={s.wall}
                  onChange={(e) => updateScene(i, { wall: e.target.value })}
                  placeholder="壁演出 (例: KVループ＋PC1)"
                  className="flex-1 px-1.5 py-1 text-[11px] bg-card border border-border rounded outline-none focus:border-primary"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="w-7 flex-none text-[10px] font-bold text-muted-foreground uppercase">床</span>
                <input
                  value={s.floor}
                  onChange={(e) => updateScene(i, { floor: e.target.value })}
                  placeholder="床演出 (例: KV)"
                  className="flex-1 px-1.5 py-1 text-[11px] bg-card border border-border rounded outline-none focus:border-primary"
                />
              </label>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={addScene}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12px] rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus size={12} />
        シーンを追加
      </button>
    </div>
  );
}

// ─── EditorSidebar ──────────────────────────────────────
export default function EditorSidebar({
  blocks,
  masters,
  meta,
  stageTemplates,
  ledScenes,
  onBlocksChange,
  onMastersChange,
  onMetaChange,
  onLedScenesChange,
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
    <aside
      className="hidden lg:flex lg:flex-col w-60 flex-none border-r border-border bg-card/50 backdrop-blur-sm"
      aria-label="エディタサイドバー"
    >
      <Tabs defaultValue="blocks" className="flex flex-col h-full">
        <TabsList className="grid grid-cols-4 m-2 mb-0 sticky top-0 z-10 shrink-0">
          <TabsTrigger value="blocks" className="text-xs">列</TabsTrigger>
          <TabsTrigger value="masters" className="text-xs">マスター</TabsTrigger>
          <TabsTrigger value="meta" className="text-xs">メタ</TabsTrigger>
          <TabsTrigger value="led" className="text-xs">LED</TabsTrigger>
        </TabsList>

        <TabsContent value="blocks" className="flex-1 overflow-y-auto m-0 mt-2">
          {/* Columns */}
          <CollapsibleSection
        title="列"
        action={
          <button
            onClick={() => setShowBlockPicker(!showBlockPicker)}
            className="w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
          >
            <Plus size={12} />
          </button>
        }
      >
        {showBlockPicker && (
          <div className="mb-2 p-1.5 bg-muted rounded-lg border border-border shadow-sm animate-scale-in">
            {BLOCK_TYPES.map((bt) => (
              <button
                key={bt.type}
                onClick={() => addBlock(bt.type)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md hover:bg-accent transition-colors text-left"
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
                className={`group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/60 transition-colors cursor-grab select-none ${
                  draggedBlkId === blk.id ? "opacity-40" : ""
                } ${isDragTarget ? "border-t-2 border-primary" : ""}`}
              >
                <GripVertical size={11} className="text-muted-foreground/60 flex-none" />
                <span className={`w-4 h-4 rounded flex items-center justify-center text-white flex-none ${bt?.color || "bg-zinc-400"}`}>
                  {bt?.Icon ? <bt.Icon size={10} /> : null}
                </span>
                <span className="flex-1 text-[13px] truncate font-medium">{blk.label}</span>
                <button
                  onClick={() => removeBlock(idx)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all flex-none"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="masters" className="flex-1 overflow-y-auto m-0 mt-2">
          {/* Master Data */}
          <CollapsibleSection title="マスタデータ" defaultOpen={true}>
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
            className="w-5 h-5 rounded-md flex items-center justify-center text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors"
          >
            <Plus size={12} />
          </button>
        }
      >
        {(stageTemplates || []).length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">テンプレートなし</p>
        ) : (
          <div className="space-y-0.5">
            {(stageTemplates || []).map((t: any, i: number) => (
              <div key={i} className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-accent/60 transition-colors">
                <span className="text-sm flex-none">🎭</span>
                <span className="flex-1 truncate font-medium cursor-pointer" onClick={() => onEditStageTemplate?.(i)}>{t.name}</span>
                <button onClick={() => onEditStageTemplate?.(i)} className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-primary transition-all flex-none">
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => {
                    if (!confirm("この立ち位置図を削除しますか？")) return;
                    // Handled by parent
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-all flex-none"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="led" className="flex-1 overflow-y-auto m-0 mt-2">
          {/* LED/XR Scenes */}
          <CollapsibleSection title="LED/XR シーン" defaultOpen={true}>
            <LedSceneSection
              scenes={ledScenes || []}
              onChange={(s) => onLedScenesChange?.(s)}
            />
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="meta" className="flex-1 overflow-y-auto m-0 mt-2">
          {/* Meta / Details */}
          <CollapsibleSection title="詳細" defaultOpen={true}>
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">リハーサル日</span>
            <input
              type="date"
              value={meta?.rehearsalDate || ""}
              onChange={(e) => onMetaChange({ ...meta, rehearsalDate: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">撮影場所</span>
            <input
              type="text"
              value={meta?.location || ""}
              onChange={(e) => onMetaChange({ ...meta, location: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">作成者</span>
            <input
              type="text"
              value={meta?.author || ""}
              onChange={(e) => onMetaChange({ ...meta, author: e.target.value })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
            />
          </label>
        </div>
          </CollapsibleSection>

          {/* Excel I/O */}
          <CollapsibleSection title="Excel入出力" defaultOpen={false}>
        <div className="space-y-1.5">
          <button
            onClick={onExportExcel}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg hover:bg-accent/60 transition-colors text-left"
          >
            <FileSpreadsheet size={14} className="text-primary flex-none" />
            <span className="font-medium">現在の台本をExcel出力</span>
          </button>
          <button
            onClick={onShowImport}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg hover:bg-accent/60 transition-colors text-left"
          >
            <Upload size={14} className="text-warning flex-none" />
            <span className="font-medium">Excelから読み込み</span>
          </button>
        </div>
          </CollapsibleSection>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
