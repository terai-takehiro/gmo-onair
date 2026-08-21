import { useState } from "react";
import {
  Plus,
  X,
  GripVertical,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
  Monitor,
  Lightbulb,
  Copy,
} from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@gmo-onair/shared/src/client/ui";
import BufferedInput from "./BufferedInput";
import { genId } from "@/lib/stableIds";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
}

interface MicChannel {
  ch: number;
  label?: string;
}

interface Masters {
  persons: string[];
  video: string[];
  audio: string[];
  telop: string[];
  micTypes?: string[];
  micChannels?: MicChannel[];
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
  /** id=null は「新規追加」、id 指定は既存テンプレの編集 */
  onEditStageTemplate?: (id: string | null) => void;
  onDuplicateStageTemplate?: (id: string) => void;
}

// ─── Block type config ──────────────────────────────────
const BLOCK_TYPES = [
  { type: "scenario", label: "シナリオ", Icon: User, color: "bg-blue-600" },
  { type: "video", label: "映像", Icon: Video, color: "bg-indigo-600" },
  { type: "slide", label: "スライド", Icon: Image, color: "bg-cyan-600" },
  { type: "telop", label: "テロップ", Icon: Type, color: "bg-purple-600" },
  { type: "audio", label: "オーディオ (BGM/SE)", Icon: Mic, color: "bg-rose-600" },
  { type: "audio_mic", label: "マイク香盤", Icon: Mic, color: "bg-pink-700" },
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
  { key: "micTypes" as const, label: "マイク種類", color: "bg-pink-700 text-white" },
];

const MASTER_ICONS: Record<string, any> = {
  persons: User,
  video: Video,
  audio: Mic,
  telop: Type,
  micTypes: Mic,
};

// ─── ResourceCard ───────────────────────────────────────
// マスター/LED/立ち位置図 を統一カード UI で表示するためのラッパ
function ResourceCard({
  icon: Icon,
  title,
  count,
  accent = "default",
  action,
  children,
}: {
  icon?: any;
  title: string;
  count?: number;
  accent?: "default" | "violet" | "amber";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentTint =
    accent === "violet"
      ? "bg-primary/5 border-primary/20"
      : accent === "amber"
      ? "bg-warning/5 border-warning/20"
      : "bg-card border-border";
  return (
    <section className={`rounded-xl border ${accentTint} overflow-hidden`}>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-background/40">
        {Icon && <Icon size={13} className="text-muted-foreground flex-none" aria-hidden />}
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground/80 flex-1 truncate">
          {title}
        </h3>
        {typeof count === "number" && (
          <span className="text-[10px] tabular-nums text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
        {action}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

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
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
        {items.map((item, i) => (
          <span
            key={i}
            className={`group inline-flex items-center gap-1 pl-2.5 pr-1 py-1 ${color} rounded-md text-[11px] font-medium tracking-wide shadow-sm transition-all`}
          >
            <span>{item}</span>
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="size-3.5 rounded inline-flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-white/20 transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
              aria-label={`${item} を削除`}
            >
              <X size={10} aria-hidden />
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-[11px] text-muted-foreground/60 italic">未登録</span>
        )}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`${label}を追加 (Enter)`}
        className="w-full px-2.5 py-1.5 text-[12px] bg-muted/40 border border-border rounded-md outline-none focus:border-primary focus:bg-card placeholder:text-muted-foreground/60 transition-all"
        aria-label={`${label}を追加`}
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
      { id: genId("led"), name: `S${next}`, wall: "", floor: "" },
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
  const moveScene = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= scenes.length) return;
    const next = [...scenes];
    [next[idx], next[to]] = [next[to], next[idx]];
    onChange(next);
  };
  return (
    <div>
      {scenes.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic mb-2 px-1">シーン未登録</p>
      ) : (
        <div className="space-y-2 mb-2">
          {scenes.map((s, i) => (
            <div
              key={s.id}
              className="group rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* シーン名 + 削除 */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-primary/8 border-b border-border/60">
                <span className="size-5 rounded-md bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-none" aria-hidden>
                  {i + 1}
                </span>
                <BufferedInput
                  value={s.name}
                  onCommit={(v) => updateScene(i, { name: v })}
                  placeholder="シーン名 (例: S1)"
                  className="flex-1 px-1 py-0.5 text-[12px] font-bold bg-transparent border-none outline-none focus:bg-card rounded transition-colors"
                  aria-label={`シーン ${i + 1} の名前`}
                />
                <button
                  onClick={() => moveScene(i, -1)}
                  disabled={i === 0}
                  className="size-5 rounded inline-flex items-center justify-center text-muted-foreground/60 hover:bg-primary/10 hover:text-primary transition-all flex-none disabled:opacity-25 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`シーン ${i + 1} を上へ`}
                >
                  <ChevronUp size={13} aria-hidden />
                </button>
                <button
                  onClick={() => moveScene(i, 1)}
                  disabled={i === scenes.length - 1}
                  className="size-5 rounded inline-flex items-center justify-center text-muted-foreground/60 hover:bg-primary/10 hover:text-primary transition-all flex-none disabled:opacity-25 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`シーン ${i + 1} を下へ`}
                >
                  <ChevronDown size={13} aria-hidden />
                </button>
                <button
                  onClick={() => removeScene(i)}
                  className="size-6 rounded inline-flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:opacity-100"
                  aria-label={`シーン ${i + 1} を削除`}
                >
                  <X size={11} aria-hidden />
                </button>
              </div>
              {/* 壁 + 床 (2カラムグリッド) */}
              <div className="grid grid-cols-2 gap-1.5 p-1.5">
                <label className="block rounded-md border border-primary/20 bg-primary/5 p-1.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-primary/80 mb-0.5">壁</span>
                  <BufferedInput
                    value={s.wall}
                    onCommit={(v) => updateScene(i, { wall: v })}
                    placeholder="例: KVループ＋PC1"
                    className="w-full text-[11px] font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/50 truncate"
                    aria-label="壁演出"
                  />
                </label>
                <label className="block rounded-md border border-warning/30 bg-warning/5 p-1.5">
                  <span className="block text-[9px] font-bold uppercase tracking-wider text-warning/90 mb-0.5">床</span>
                  <BufferedInput
                    value={s.floor}
                    onCommit={(v) => updateScene(i, { floor: v })}
                    placeholder="例: KV"
                    className="w-full text-[11px] font-medium bg-transparent border-none outline-none placeholder:text-muted-foreground/50 truncate"
                    aria-label="床演出"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addScene}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 text-[12px] rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="シーンを追加"
      >
        <Plus size={12} aria-hidden />
        シーンを追加
      </button>
    </div>
  );
}

// ─── EditorSidebarBody ──────────────────────────────────
// デスクトップサイドバー / モバイル Sheet 両用の中身。
// aside ラッパは持たず、Tabs 構造のみを返す。
export function EditorSidebarBody({
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
  onDuplicateStageTemplate,
}: Props) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [draggedBlkId, setDraggedBlkId] = useState<string | null>(null);
  const [dropTargetBlkId, setDropTargetBlkId] = useState<string | null>(null);

  const addBlock = (type: string) => {
    const info = BLOCK_TYPES.find((b) => b.type === type);
    onBlocksChange([
      ...blocks,
      { id: genId("blk"), type, label: info?.label || type, width: type === "scenario" ? "L" : "M" },
    ]);
    setShowBlockPicker(false);
  };

  const removeBlock = (idx: number) => {
    if (!confirm("この列を削除しますか？")) return;
    const newBlocks = [...blocks];
    newBlocks.splice(idx, 1);
    onBlocksChange(newBlocks);
  };

  type MasterStringKey = "persons" | "video" | "audio" | "telop" | "micTypes";

  const addMasterItem = (key: MasterStringKey, val: string) => {
    const current = (masters[key] as string[] | undefined) || [];
    if (current.includes(val)) return;
    onMastersChange({
      ...masters,
      [key]: [...current, val],
    });
  };

  const removeMasterItem = (key: MasterStringKey, idx: number) => {
    const current = (masters[key] as string[] | undefined) || [];
    onMastersChange({
      ...masters,
      [key]: current.filter((_, i) => i !== idx),
    });
  };

  const addMicChannel = () => {
    const current = masters.micChannels || [];
    const nextCh = current.length === 0
      ? 1
      : Math.max(...current.map((c) => c.ch)) + 1;
    onMastersChange({
      ...masters,
      micChannels: [...current, { ch: nextCh }],
    });
  };

  const updateMicChannel = (idx: number, patch: Partial<MicChannel>) => {
    const current = masters.micChannels || [];
    const next = [...current];
    next[idx] = { ...next[idx], ...patch };
    next.sort((a, b) => a.ch - b.ch);
    onMastersChange({ ...masters, micChannels: next });
  };

  const removeMicChannel = (idx: number) => {
    const current = masters.micChannels || [];
    onMastersChange({
      ...masters,
      micChannels: current.filter((_, i) => i !== idx),
    });
  };

  return (
    <Tabs defaultValue="blocks" className="flex flex-col h-full">
        <TabsList className="grid grid-cols-3 m-2 mb-0 sticky top-0 z-10 shrink-0">
          <TabsTrigger value="blocks" className="text-xs">列</TabsTrigger>
          <TabsTrigger value="masters" className="text-xs">マスター</TabsTrigger>
          <TabsTrigger value="meta" className="text-xs">メタ</TabsTrigger>
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

        <TabsContent value="masters" className="flex-1 overflow-y-auto m-0 mt-2 px-3 pb-3 space-y-3">
          {/* マスタデータ (出演者 / 映像 / 音声 / テロップ / マイク種類) */}
          {MASTER_SECTIONS.map((ms) => (
            <ResourceCard
              key={ms.key}
              icon={MASTER_ICONS[ms.key]}
              title={ms.label}
              count={((masters?.[ms.key] as string[] | undefined) || []).length}
            >
              <MasterSection
                label={ms.label}
                color={ms.color}
                items={(masters?.[ms.key] as string[] | undefined) || []}
                onAdd={(val) => addMasterItem(ms.key, val)}
                onRemove={(idx) => removeMasterItem(ms.key, idx)}
              />
            </ResourceCard>
          ))}

          {/* マイクCh (マイク香盤ブロック用) */}
          <ResourceCard
            icon={Mic}
            title="マイクCh"
            count={(masters?.micChannels || []).length}
            action={
              <button
                onClick={addMicChannel}
                className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-pink-700/10 hover:text-pink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Chを追加"
              >
                <Plus size={14} aria-hidden />
              </button>
            }
          >
            {(masters?.micChannels || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic px-1 py-2">Ch未登録 — マイク香盤ブロックでデフォルトCh1〜4を表示します</p>
            ) : (
              <div className="space-y-1">
                {(masters?.micChannels || []).map((c, i) => (
                  <div key={i} className="group flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      value={c.ch}
                      onChange={(e) => updateMicChannel(i, { ch: parseInt(e.target.value, 10) || 1 })}
                      className="w-12 h-7 px-1.5 text-[12px] tabular-nums bg-muted/40 border border-border rounded outline-none focus:border-primary"
                      style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
                      aria-label={`Ch番号 ${i + 1}`}
                    />
                    <BufferedInput
                      value={c.label || ""}
                      onCommit={(v) => updateMicChannel(i, { label: v })}
                      placeholder="ラベル (例: MC席1)"
                      className="flex-1 h-7 px-1.5 text-[12px] bg-muted/40 border border-border rounded outline-none focus:border-primary"
                      aria-label={`Ch ${c.ch} ラベル`}
                    />
                    <button
                      onClick={() => removeMicChannel(i)}
                      className="size-6 rounded inline-flex items-center justify-center text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-none"
                      aria-label={`Ch ${c.ch} を削除`}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ResourceCard>

          {/* LED/XR シーン (旧 LED タブ) */}
          <ResourceCard
            icon={Monitor}
            title="LED/XR シーン"
            count={(ledScenes || []).length}
            accent="violet"
          >
            <LedSceneSection
              scenes={ledScenes || []}
              onChange={(s) => onLedScenesChange?.(s)}
            />
          </ResourceCard>

          {/* 立ち位置図 */}
          <ResourceCard
            icon={Layout}
            title="立ち位置図"
            count={(stageTemplates || []).length}
            accent="amber"
            action={
              <button
                onClick={() => onEditStageTemplate?.(null)}
                className="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-warning/10 hover:text-warning transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="立ち位置図を追加"
              >
                <Plus size={14} aria-hidden />
              </button>
            }
          >
            {(stageTemplates || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground italic px-1 py-2">テンプレートなし</p>
            ) : (
              <div className="space-y-1">
                {(stageTemplates || []).map((t: any, i: number) => (
                  <div
                    key={t.id ?? i}
                    className="group flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] hover:bg-accent/60 transition-colors cursor-pointer"
                    onClick={() => onEditStageTemplate?.(t.id)}
                  >
                    <span className="text-sm flex-none" aria-hidden>🎭</span>
                    <span className="flex-1 truncate font-medium">{t.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicateStageTemplate?.(t.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-warning transition-all flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label="複製"
                      title="複製して編集 (元データを転用)"
                    >
                      <Copy size={12} aria-hidden />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditStageTemplate?.(t.id); }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-primary transition-all flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label="編集"
                    >
                      <Pencil size={12} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ResourceCard>
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
            <BufferedInput
              type="text"
              value={meta?.location || ""}
              onCommit={(v) => onMetaChange({ ...meta, location: v })}
              className="mt-1 w-full px-2.5 py-1.5 text-[13px] bg-muted border border-border rounded-lg outline-none focus:ring-2 focus:ring-ring/30 focus:border-primary transition-all"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">作成者</span>
            <BufferedInput
              type="text"
              value={meta?.author || ""}
              onCommit={(v) => onMetaChange({ ...meta, author: v })}
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
  );
}

// ─── EditorSidebar (desktop wrapper) ────────────────────
export default function EditorSidebar(props: Props) {
  return (
    <aside
      className="hidden lg:flex lg:flex-col w-60 flex-none border-r border-border bg-card/50 backdrop-blur-sm"
      aria-label="エディタサイドバー"
    >
      <EditorSidebarBody {...props} />
    </aside>
  );
}
