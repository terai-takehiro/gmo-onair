import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  GripVertical,
  Columns,
  Users,
  Video,
  Music,
  Type,
  Search,
  FileText,
  Link2,
  X,
} from "lucide-react";

interface Block {
  id: string;
  type: string;
  label: string;
  width: number;
}

interface Masters {
  persons: string[];
  video: string[];
  audio: string[];
  telop: string[];
}

interface Episode {
  id: string;
  episode_code: string;
  title: string;
  broadcast_date: string | null;
  project_name: string | null;
}

interface Props {
  blocks: Block[];
  masters: Masters;
  meta: {
    title: string;
    draft: string;
    startTime?: string;
    broadcastDate?: string;
    location?: string;
    author?: string;
  };
  episodeId: string | null;
  onBlocksChange: (blocks: Block[]) => void;
  onMastersChange: (masters: Masters) => void;
  onMetaChange: (meta: Props["meta"]) => void;
  onEpisodeChange: (episodeId: string | null, episodeCode: string | null) => void;
}

const BLOCK_TYPES = [
  { type: "scenario", label: "台本", icon: FileText, color: "text-slate-700" },
  { type: "video", label: "映像", icon: Video, color: "text-blue-600" },
  { type: "audio", label: "音声", icon: Music, color: "text-green-600" },
  { type: "telop", label: "テロップ", icon: Type, color: "text-purple-600" },
  { type: "remarks", label: "備考", icon: FileText, color: "text-gray-500" },
];

export default function EditorSidebar({
  blocks,
  masters,
  meta,
  episodeId,
  onBlocksChange,
  onMastersChange,
  onMetaChange,
  onEpisodeChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<"blocks" | "masters" | "meta" | "link">("blocks");
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [episodeResults, setEpisodeResults] = useState<Episode[]>([]);
  const [newMasterValue, setNewMasterValue] = useState("");

  const addBlock = (type: string) => {
    const bt = BLOCK_TYPES.find((b) => b.type === type);
    onBlocksChange([
      ...blocks,
      { id: `${type}_${Date.now()}`, type, label: bt?.label || type, width: 150 },
    ]);
  };

  const removeBlock = (id: string) => {
    onBlocksChange(blocks.filter((b) => b.id !== id));
  };

  const moveBlock = (idx: number, direction: -1 | 1) => {
    const newBlocks = [...blocks];
    const target = idx + direction;
    if (target < 0 || target >= newBlocks.length) return;
    [newBlocks[idx], newBlocks[target]] = [newBlocks[target], newBlocks[idx]];
    onBlocksChange(newBlocks);
  };

  const addMaster = (category: keyof Masters) => {
    if (!newMasterValue.trim()) return;
    if (masters[category].includes(newMasterValue.trim())) return;
    onMastersChange({
      ...masters,
      [category]: [...masters[category], newMasterValue.trim()],
    });
    setNewMasterValue("");
  };

  const removeMaster = (category: keyof Masters, value: string) => {
    onMastersChange({
      ...masters,
      [category]: masters[category].filter((v) => v !== value),
    });
  };

  const searchEpisodes = async () => {
    if (!episodeSearch.trim()) return;
    try {
      const res = await fetch(`/api/v1/internal/qsheet/episodes?search=${encodeURIComponent(episodeSearch)}`);
      const json = await res.json();
      setEpisodeResults(json.data || []);
    } catch {
      setEpisodeResults([]);
    }
  };

  const tabs = [
    { key: "blocks" as const, label: "ブロック", icon: Columns },
    { key: "masters" as const, label: "マスター", icon: Users },
    { key: "meta" as const, label: "情報", icon: FileText },
    { key: "link" as const, label: "連携", icon: Link2 },
  ];

  return (
    <div className="w-72 border-l bg-white flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Blocks tab */}
        {activeTab === "blocks" && (
          <>
            <div className="space-y-1">
              {blocks.map((block, idx) => (
                <div key={block.id} className="flex items-center gap-1 bg-slate-50 rounded px-2 py-1.5">
                  <GripVertical className="h-3 w-3 text-muted-foreground/50 cursor-grab shrink-0" />
                  <span className="text-xs flex-1 truncate">{block.label}</span>
                  <button
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    onClick={() => moveBlock(idx, -1)}
                    disabled={idx === 0}
                  >
                    <span className="text-[10px]">▲</span>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground p-0.5"
                    onClick={() => moveBlock(idx, 1)}
                    disabled={idx === blocks.length - 1}
                  >
                    <span className="text-[10px]">▼</span>
                  </button>
                  <button
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    onClick={() => removeBlock(block.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">ブロック追加:</p>
              <div className="flex flex-wrap gap-1">
                {BLOCK_TYPES.map((bt) => (
                  <Button
                    key={bt.type}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => addBlock(bt.type)}
                  >
                    <Plus className="h-3 w-3" />
                    {bt.label}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Masters tab */}
        {activeTab === "masters" && (
          <>
            {(["persons", "video", "audio", "telop"] as const).map((cat) => {
              const labels = { persons: "出演者", video: "映像素材", audio: "音声素材", telop: "テロップ" };
              const icons = { persons: Users, video: Video, audio: Music, telop: Type };
              const Icon = icons[cat];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{labels[cat]}</span>
                    <Badge variant="secondary" className="text-[10px] ml-auto">
                      {masters[cat].length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {masters[cat].map((val) => (
                      <span
                        key={val}
                        className="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-0.5 text-xs"
                      >
                        {val}
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeMaster(cat, val)}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      className="h-7 text-xs flex-1"
                      placeholder="追加..."
                      value={newMasterValue}
                      onChange={(e) => setNewMasterValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addMaster(cat)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => addMaster(cat)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* Meta tab */}
        {activeTab === "meta" && (
          <>
            <div>
              <Label className="text-xs">稿の種類</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={meta.draft}
                onChange={(e) => onMetaChange({ ...meta, draft: e.target.value })}
                placeholder="準備稿 / 決定稿"
              />
            </div>
            <div>
              <Label className="text-xs">放送開始時刻</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={meta.startTime || ""}
                onChange={(e) => onMetaChange({ ...meta, startTime: e.target.value })}
                placeholder="19:00:00"
              />
            </div>
            <div>
              <Label className="text-xs">放送日</Label>
              <Input
                className="h-8 text-xs mt-1"
                type="date"
                value={meta.broadcastDate || ""}
                onChange={(e) => onMetaChange({ ...meta, broadcastDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">収録場所</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={meta.location || ""}
                onChange={(e) => onMetaChange({ ...meta, location: e.target.value })}
                placeholder="スタジオA"
              />
            </div>
            <div>
              <Label className="text-xs">作成者</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={meta.author || ""}
                onChange={(e) => onMetaChange({ ...meta, author: e.target.value })}
              />
            </div>
          </>
        )}

        {/* Link tab (episode linking) */}
        {activeTab === "link" && (
          <>
            <div>
              <Label className="text-xs">ONAiR エピソード連携</Label>
              {episodeId ? (
                <div className="mt-2 p-2 bg-primary/5 rounded border border-primary/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">連携中</span>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onEpisodeChange(null, null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">ID: {episodeId}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">未連携</p>
              )}
            </div>
            <div>
              <div className="flex gap-1">
                <Input
                  className="h-8 text-xs flex-1"
                  placeholder="エピソード検索..."
                  value={episodeSearch}
                  onChange={(e) => setEpisodeSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchEpisodes()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={searchEpisodes}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </div>
              {episodeResults.length > 0 && (
                <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                  {episodeResults.map((ep) => (
                    <button
                      key={ep.id}
                      className="w-full text-left p-2 bg-slate-50 rounded hover:bg-slate-100 transition-colors"
                      onClick={() => {
                        onEpisodeChange(ep.id, ep.episode_code);
                        setEpisodeResults([]);
                        setEpisodeSearch("");
                      }}
                    >
                      <div className="text-xs font-medium">{ep.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {ep.episode_code} {ep.project_name && `| ${ep.project_name}`}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
