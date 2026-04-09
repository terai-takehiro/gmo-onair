import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  FolderKanban,
  X,
  Link2,
} from "lucide-react";

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

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "bg-slate-100 text-slate-700 border-slate-200" },
  rehearsal: { label: "リハーサル", color: "bg-amber-100 text-amber-700 border-amber-200" },
  on_air: { label: "ON AIR", color: "bg-red-100 text-red-700 border-red-200" },
  archived: { label: "アーカイブ", color: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBroadcastDate, setNewBroadcastDate] = useState("");
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");

  const projectFilter = searchParams.get("project");

  // Auto-enable project linking when URL param is set
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

  // GLS project list for selector
  const { data: glsProjects } = useQuery({
    queryKey: ["gls-options"],
    queryFn: async () => {
      const res = await api.get("/lookup/gls-options");
      return res.data.data as GlsProject[];
    },
    enabled: linkToProject,
  });

  // Episodes for selected project
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
          meta: { title: newTitle || "無題のQシート", draft: "準備稿" },
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
    setNewBroadcastDate("");
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
    // Auto-fill broadcast date from episode if not manually set
    if (!newBroadcastDate && value) {
      const ep = episodes?.find((e) => e.id === value);
      if (ep?.broadcast_date) setNewBroadcastDate(ep.broadcast_date);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const formatRelative = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "たった今";
    if (mins < 60) return `${mins}分前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}日前`;
    return formatDate(dateStr);
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="heading-page text-xl lg:text-2xl">Qシート一覧</h1>
          <p className="text-sm text-muted-foreground">
            キューシートの作成・編集・放送進行管理
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          新規作成
        </Button>
      </div>

      {/* Project filter banner */}
      {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
        <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-4 py-2.5">
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
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="タイトルで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="flex justify-center py-24">
          <p className="text-sm text-muted-foreground">データを取得できませんでした。サーバー接続を確認してください。</p>
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const status = statusConfig[doc.status] || statusConfig.draft;
            return (
              <Card
                key={doc.id}
                className="group hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/qsheet/editor/${doc.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate">
                        {doc.title || "無題のQシート"}
                      </h3>
                      {(doc.gls_number || doc.episode_code) && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {doc.gls_number && <span className="font-medium">{doc.gls_number}</span>}
                          {doc.gls_number && doc.project_name && <span> {doc.project_name}</span>}
                          {doc.episode_code && <span>{doc.gls_number ? ' / ' : ''}{doc.episode_code}</span>}
                        </p>
                      )}
                    </div>
                    <Badge className={`shrink-0 ml-2 ${status.color}`}>
                      {status.label}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {doc.broadcast_date && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        放送: {formatDate(doc.broadcast_date)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      更新: {formatRelative(doc.updated_at)}
                    </div>
                    {doc.creator_name && (
                      <div className="text-xs">
                        作成: {doc.creator_name}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/qsheet/editor/${doc.id}`);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      編集
                    </Button>
                    {doc.status !== "archived" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/qsheet/onair/${doc.id}`);
                        }}
                      >
                        <Radio className="h-3 w-3" />
                        ON AIR
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("このQシートを削除しますか？")) {
                          deleteMutation.mutate(doc.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 text-primary/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Qシートを作成しましょう</h3>
            <p className="text-sm text-muted-foreground mb-4">
              「新規作成」からQシートを作成して、放送進行の準備を始めましょう。
            </p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              最初のQシートを作成
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規Qシート作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>タイトル</Label>
              <Input
                className="mt-1.5"
                placeholder="番組名 #001"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
              />
            </div>
            <div>
              <Label>放送日</Label>
              <Input
                className="mt-1.5"
                type="date"
                value={newBroadcastDate}
                onChange={(e) => setNewBroadcastDate(e.target.value)}
              />
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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                キャンセル
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                作成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
