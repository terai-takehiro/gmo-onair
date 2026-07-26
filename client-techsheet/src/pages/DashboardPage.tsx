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
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wrench,
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  FolderKanban,
  X,
  Link2,
  Printer,
} from "lucide-react";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { TECHSHEET_STATUS, statusOf } from "@gmo-onair/shared/src/constants/statuses";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface TechsheetDocument {
  id: string;
  title: string;
  status: string;
  production_date: string | null;
  venue: string | null;
  version: string | null;
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

// ステータス定義は shared/src/constants/statuses.ts (TECHSHEET_STATUS) を参照

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newProductionDate, setNewProductionDate] = useState("");
  const [newVenue, setNewVenue] = useState("");
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>("");

  const projectFilter = searchParams.get("project");

  useEffect(() => {
    if (projectFilter) {
      setLinkToProject(true);
      setSelectedProjectId(projectFilter);
    }
  }, [projectFilter]);

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ["techsheet-documents", search, projectFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (projectFilter) params.set("project_id", projectFilter);
      const res = await api.get(`/techsheet/documents?${params}`);
      return res.data.data as TechsheetDocument[];
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
      const res = await api.post("/techsheet/documents", {
        title: newTitle || "無題の技術資料",
        production_date: newProductionDate || null,
        venue: newVenue || null,
        project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
        episode_id: linkToProject && selectedEpisodeId ? selectedEpisodeId : null,
      });
      return res.data.data;
    },
    onSuccess: (doc) => {
      queryClient.invalidateQueries({ queryKey: ["techsheet-documents"] });
      setShowCreate(false);
      resetCreateForm();
      navigate(`/techsheet/editor/${doc.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/techsheet/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["techsheet-documents"] });
    },
  });

  const resetCreateForm = () => {
    setNewTitle("");
    setNewProductionDate("");
    setNewVenue("");
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
    if (!newProductionDate && value) {
      const ep = episodes?.find((e) => e.id === value);
      if (ep?.broadcast_date) setNewProductionDate(ep.broadcast_date);
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
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
      <DashboardHeader
        title="技術資料一覧"
        description="番組・イベントの映像・音声・通信の技術資料を作成・管理します。"
        lastUpdated={`最終更新 ${new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
        controls={
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            新規作成
          </Button>
        }
      />

      {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-primary/5 px-4 py-2.5" role="status">
          <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-sm">
            <span className="font-medium">{documents[0].gls_number}</span>
            <span className="text-muted-foreground ml-1">{documents[0].project_name}</span>
            の技術資料
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            onClick={() => setSearchParams({})}
            aria-label="フィルタ解除"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="タイトルで検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : isError ? (
        <EmptyState
          title="データを取得できませんでした"
          description="サーバー接続を確認してから再試行してください。"
        />
      ) : documents && documents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {documents.map((doc) => {
            const spec = statusOf(TECHSHEET_STATUS, doc.status);
            const label = spec.label;
            const variant = spec.variant;
            return (
              <Card
                key={doc.id}
                className="group transition-colors cursor-pointer hover:border-primary focus-within:border-primary"
                onClick={() => navigate(`/techsheet/editor/${doc.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm truncate text-foreground">
                        {doc.title || "無題の技術資料"}
                      </h3>
                      {(doc.gls_number || doc.venue) && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {doc.gls_number && <span className="font-medium">{doc.gls_number}</span>}
                          {doc.gls_number && doc.project_name && <span> {doc.project_name}</span>}
                          {doc.venue && <span>{doc.gls_number ? ' / ' : ''}{doc.venue}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {doc.version && (
                        <span className="text-xs text-muted-foreground">{doc.version}</span>
                      )}
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {doc.production_date && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        制作日: {formatDate(doc.production_date)}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      更新: {formatRelative(doc.updated_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/techsheet/editor/${doc.id}`);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      編集
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/techsheet/print/${doc.id}`);
                      }}
                    >
                      <Printer className="h-3 w-3" />
                      印刷
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if ((await confirmAction({ title: "この技術資料を削除しますか？", confirmLabel: '削除する', tone: 'danger' }))) {
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
        <EmptyState
          icon={<Wrench />}
          title="技術資料を作成しましょう"
          description="「新規作成」から番組・イベントの技術資料を作成できます。"
          action={
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden="true" />
              最初の技術資料を作成
            </Button>
          }
        />
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新規技術資料作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>番組名・タイトル</Label>
              <Input
                className="mt-1.5"
                placeholder="例: 〇〇特番 技術資料"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>制作日</Label>
                <Input
                  className="mt-1.5"
                  type="date"
                  value={newProductionDate}
                  onChange={(e) => setNewProductionDate(e.target.value)}
                />
              </div>
              <div>
                <Label>スタジオ・会場</Label>
                <Input
                  className="mt-1.5"
                  placeholder="例: Aスタジオ"
                  value={newVenue}
                  onChange={(e) => setNewVenue(e.target.value)}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">GLS案件に紐付ける</span>
                </div>
                <Switch
                  checked={linkToProject}
                  onCheckedChange={(v) => {
                    setLinkToProject(!!v);
                    if (!v) {
                      if (!projectFilter) setSelectedProjectId("");
                      setSelectedEpisodeId("");
                    }
                  }}
                />
              </div>

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
