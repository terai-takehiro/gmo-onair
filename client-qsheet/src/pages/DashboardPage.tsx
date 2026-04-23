import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Search,
  Loader2,
  Radio,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Play,
  ChevronRight,
  MapPin,
  FolderKanban,
  X,
  Link2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface QsheetDocument {
  id: string;
  title: string;
  status: string;
  broadcast_date: string | null;
  episode_code: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
  data?: {
    meta?: {
      title?: string;
      location?: string;
      broadcastDate?: string;
      broadcastStartTime?: string;
      recordingDate?: string;
      rehearsalDate?: string;
      draftType?: string;
      draftNumber?: number;
    };
  };
}

interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string | null;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
  broadcast_date: string | null;
  recording_date: string | null;
}

// ============================================================
// Helpers
// ============================================================
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
    return dt.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric", weekday: "short" });
  } catch {
    return d;
  }
}

type DocMeta = NonNullable<NonNullable<QsheetDocument["data"]>["meta"]>;

function getDraftLabel(meta?: DocMeta): string {
  if (!meta) return "第1稿";
  if (meta.draftType === "準備稿") return "準備稿";
  if (meta.draftType === "決定稿") return "決定稿";
  return `第${meta.draftNumber || 1}稿`;
}

function getDraftColor(meta?: DocMeta): string {
  if (!meta) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (meta.draftType === "決定稿")
    return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800";
  if (meta.draftType === "準備稿")
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800";
  return "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800";
}

// ============================================================
// DocCard — original style single-column card
// ============================================================
function DocCard({
  doc,
  onNavigate,
  onOnAir,
  onDelete,
}: {
  doc: QsheetDocument;
  onNavigate: (id: string) => void;
  onOnAir: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = doc.data?.meta;

  return (
    <div
      className="group p-3 sm:p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:shadow-blue-600/5 cursor-pointer overflow-hidden"
      onClick={() => onNavigate(doc.id)}
    >
      {/* Top row: title + badge + actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2.5 mb-1 flex-wrap">
            <h3 className="text-sm sm:text-base font-bold truncate max-w-[60vw] sm:max-w-none">{meta?.title || doc.title || "無題"}</h3>
            <span className={`flex-shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${getDraftColor(meta)}`}>
              {getDraftLabel(meta)}
            </span>
          </div>
          {/* GLS/Episode info */}
          {(doc.gls_number || doc.episode_code) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {doc.gls_number && <span className="font-medium">{doc.gls_number}</span>}
              {doc.gls_number && doc.project_name && <span> {doc.project_name}</span>}
              {doc.episode_code && <span>{doc.gls_number ? " / " : ""}{doc.episode_code}</span>}
            </p>
          )}
          {meta?.location && (
            <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
              <MapPin size={11} />
              <span>{meta.location}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 sm:ml-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(doc.id); }}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-500 transition-all"
            title="編集"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOnAir(doc.id); }}
            className="inline-flex items-center gap-0.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all"
          >
            <Radio size={10} />
            <span className="hidden sm:inline">ONAIR</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all"
            title="削除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[11px]">
        {(meta?.broadcastDate || doc.broadcast_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-zinc-400 flex-shrink-0" />
            <span className="text-zinc-400">放送日</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(meta?.broadcastDate || doc.broadcast_date)}</span>
          </div>
        )}
        {meta?.broadcastStartTime && (
          <div className="flex items-center gap-1.5">
            <Play size={10} className="text-zinc-400 flex-shrink-0" />
            <span className="text-zinc-400">放送</span>
            <span className="font-medium font-mono text-zinc-700 dark:text-zinc-300">{meta.broadcastStartTime}</span>
          </div>
        )}
        {meta?.recordingDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-zinc-400 flex-shrink-0" />
            <span className="text-zinc-400">収録日</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(meta.recordingDate)}</span>
          </div>
        )}
        {meta?.rehearsalDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-zinc-400 flex-shrink-0" />
            <span className="text-zinc-400">リハ</span>
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtDate(meta.rehearsalDate)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span>{doc.creator_name || "不明"}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock size={9} />
            {new Date(doc.updated_at).toLocaleDateString("ja-JP")}{" "}
            {new Date(doc.updated_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-blue-500 font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          台本を開く <ChevronRight size={14} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DashboardPage
// ============================================================
export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newBroadcastDate, setNewBroadcastDate] = useState("");
  const [newBroadcastStartTime, setNewBroadcastStartTime] = useState("");
  const [hasRecording, setHasRecording] = useState(true);
  const [newRecordingDate, setNewRecordingDate] = useState("");
  const [hasRehearsal, setHasRehearsal] = useState(false);
  const [newRehearsalDate, setNewRehearsalDate] = useState("");
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");

  const projectFilter = searchParams.get("project");

  useEffect(() => {
    if (projectFilter) {
      setLinkToProject(true);
      setSelectedProjectId(projectFilter);
    }
  }, [projectFilter]);

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ["qsheet-documents", search, projectFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (projectFilter) params.set("project_id", projectFilter);
      const res = await api.get(`/qsheet/documents?${params}`);
      return res.data.data as QsheetDocument[];
    },
    retry: false,
  });

  const { data: glsProjects } = useQuery({
    queryKey: ["gls-options"],
    queryFn: async () => {
      const res = await api.get("/lookup/gls-options");
      return res.data.data as GlsProject[];
    },
    enabled: linkToProject,
  });

  const { data: episodes } = useQuery({
    queryKey: ["episode-options", selectedProjectId],
    queryFn: async () => {
      const res = await api.get(`/lookup/${selectedProjectId}/episodes-options`);
      return res.data.data as EpisodeOption[];
    },
    enabled: !!selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const selectedEpisode = episodes?.find((e) => e.id === selectedEpisodeId);
      const res = await api.post("/qsheet/documents", {
        title: newTitle || "無題のQシート",
        broadcast_date: newBroadcastDate || selectedEpisode?.broadcast_date || null,
        project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
        episode_id: linkToProject && selectedEpisodeId ? selectedEpisodeId : null,
        episode_code: linkToProject && selectedEpisode ? selectedEpisode.episode_code : null,
        data: {
          meta: {
            title: newTitle || "無題のQシート",
            draftNumber: 1,
            draftType: "numbered",
            location: newLocation,
            broadcastDate: newBroadcastDate,
            broadcastStartTime: newBroadcastStartTime,
            recordingDate: hasRecording ? newRecordingDate : "",
            rehearsalDate: hasRehearsal ? newRehearsalDate : "",
          },
          blocks: [
            { id: "scenario", type: "scenario", label: "台本", width: 300 },
            { id: "video", type: "video", label: "映像", width: 150 },
            { id: "audio", type: "audio", label: "音声", width: 150 },
          ],
          sections: [],
          masters: { persons: [], video: [], audio: [], telop: [] },
        },
      });
      return res.data.data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
      setShowCreate(false);
      resetCreateForm();
      navigate(`/qsheet/editor/${doc.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/qsheet/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
    },
  });

  const resetCreateForm = () => {
    setNewTitle("");
    setNewLocation("");
    setNewBroadcastDate("");
    setNewBroadcastStartTime("");
    setHasRecording(true);
    setNewRecordingDate("");
    setHasRehearsal(false);
    setNewRehearsalDate("");
    if (!projectFilter) {
      setLinkToProject(false);
      setSelectedProjectId("");
    }
    setSelectedEpisodeId("");
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedEpisodeId("");
  };

  const handleEpisodeChange = (value: string) => {
    setSelectedEpisodeId(value);
    if (!newBroadcastDate && value) {
      const ep = episodes?.find((e) => e.id === value);
      if (ep?.broadcast_date) setNewBroadcastDate(ep.broadcast_date);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("このドキュメントを削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">ドキュメント</h2>
            <p className="text-sm text-zinc-500 mt-1">{documents?.length || 0} 件の台本</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            data-create-btn
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]"
          >
            <Plus size={16} />
            新規作成
          </button>
        </div>

        {/* Project filter banner */}
        {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
          <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-4 py-2.5 mb-6">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">
              <span className="font-medium">{documents[0].gls_number}</span>
              <span className="text-muted-foreground ml-1">{documents[0].project_name}</span>
              のQシート
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-auto shrink-0"
              onClick={() => setSearchParams({})}
              title="フィルタ解除"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="relative max-w-md mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="タイトルで検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Document list — single column */}
        {isLoading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : isError ? (
          <div className="flex justify-center py-24">
            <p className="text-sm text-muted-foreground">データを取得できませんでした。サーバー接続を確認してください。</p>
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="grid gap-4">
            {documents.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                onNavigate={(id) => navigate(`/qsheet/editor/${id}`)}
                onOnAir={(id) => navigate(`/qsheet/onair/${id}`)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <FileText size={48} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
            <p className="text-zinc-400 text-sm mb-4">まだドキュメントがありません</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all"
            >
              <Plus size={16} />
              最初のQシートを作成
            </button>
          </div>
        )}
      </main>

      {/* ===== Create dialog ===== */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新規台本作成</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4 pt-2"
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          >
            <div>
              <Label className="text-xs text-zinc-500">番組名 <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                placeholder="例：サンプル情報バラエティ"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500">撮影場所 <span className="text-red-500">*</span></Label>
              <Input
                className="mt-1"
                placeholder="例：GMOグローバルスタジオ"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-500">放送日 <span className="text-red-500">*</span></Label>
                <Input className="mt-1" type="date" value={newBroadcastDate} onChange={(e) => setNewBroadcastDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-zinc-500">放送開始時刻</Label>
                <Input className="mt-1" type="time" value={newBroadcastStartTime} onChange={(e) => setNewBroadcastStartTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1 cursor-pointer">
                <input type="checkbox" checked={hasRecording} onChange={() => setHasRecording(!hasRecording)} className="accent-blue-600 w-3.5 h-3.5" />
                収録日を設定（生放送の場合はOFF）
              </label>
              {hasRecording && (
                <Input type="date" value={newRecordingDate} onChange={(e) => setNewRecordingDate(e.target.value)} required />
              )}
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1 cursor-pointer">
                <input type="checkbox" checked={hasRehearsal} onChange={() => setHasRehearsal(!hasRehearsal)} className="accent-blue-600 w-3.5 h-3.5" />
                リハーサル日を設定
              </label>
              {hasRehearsal && (
                <Input type="date" value={newRehearsalDate} onChange={(e) => setNewRehearsalDate(e.target.value)} />
              )}
            </div>

            {/* GLS Project Linking */}
            <div className="border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={linkToProject}
                  onChange={(e) => {
                    setLinkToProject(e.target.checked);
                    if (!e.target.checked) {
                      if (!projectFilter) setSelectedProjectId("");
                      setSelectedEpisodeId("");
                    }
                  }}
                  className="rounded border-input"
                />
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">GLS案件に紐付ける</span>
              </label>

              {linkToProject && (
                <div className="mt-3 space-y-3 pl-6">
                  <div>
                    <Label className="text-xs text-muted-foreground">GLS案件</Label>
                    <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="案件を選択..." />
                      </SelectTrigger>
                      <SelectContent>
                        {glsProjects?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.gls_number} — {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedProjectId && episodes && episodes.length > 0 && (
                    <div>
                      <Label className="text-xs text-muted-foreground">エピソード（任意）</Label>
                      <Select value={selectedEpisodeId} onValueChange={handleEpisodeChange}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="エピソードを選択..." />
                        </SelectTrigger>
                        <SelectContent>
                          {episodes.map((ep) => (
                            <SelectItem key={ep.id} value={ep.id}>
                              {ep.episode_code}
                              {ep.broadcast_date && ` — ${ep.broadcast_date}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!newTitle.trim() || !newLocation.trim() || !newBroadcastDate || (hasRecording && !newRecordingDate) || createMutation.isPending}
              className="w-full py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-blue-600/25 transition-all"
            >
              {createMutation.isPending ? "作成中..." : "台本を作成"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
