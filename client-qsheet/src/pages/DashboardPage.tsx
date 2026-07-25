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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { useAuth } from "@/hooks/useAuth";
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
  Share2,
  Users,
  Check,
  Lock,
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
  created_by: string | null;
  share_count?: number;
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
  if (!meta) return "bg-muted text-muted-foreground";
  if (meta.draftType === "決定稿")
    return "bg-success/10 text-success ring-1 ring-success/30";
  if (meta.draftType === "準備稿")
    return "bg-warning/10 text-warning ring-1 ring-warning/30";
  return "bg-primary/10 text-primary ring-1 ring-primary/30";
}

// ============================================================
// DocCard — original style single-column card
// ============================================================
function DocCard({
  doc,
  canManage,
  onNavigate,
  onOnAir,
  onDelete,
  onShare,
}: {
  doc: QsheetDocument;
  canManage: boolean;
  onNavigate: (id: string) => void;
  onOnAir: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (doc: QsheetDocument) => void;
}) {
  const meta = doc.data?.meta;
  const shareCount = doc.share_count || 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(doc.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate(doc.id);
        }
      }}
      className="group p-3 sm:p-5 bg-card text-card-foreground rounded-2xl border border-border transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin size={11} aria-hidden />
              <span>{meta.location}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1 sm:ml-3 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onNavigate(doc.id); }}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="編集"
          >
            <Pencil size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOnAir(doc.id); }}
            className="inline-flex items-center gap-0.5 px-1.5 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-bold rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label="ONAIRを開始"
          >
            <Radio size={10} aria-hidden />
            <span className="hidden sm:inline">ONAIR</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShare(doc); }}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-primary transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="共有"
            >
              <Share2 size={14} aria-hidden />
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
              className="p-1.5 sm:p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="削除"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 text-[11px]">
        {(meta?.broadcastDate || doc.broadcast_date) && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">放送日</span>
            <span className="font-medium text-foreground">{fmtDate(meta?.broadcastDate || doc.broadcast_date)}</span>
          </div>
        )}
        {meta?.broadcastStartTime && (
          <div className="flex items-center gap-1.5">
            <Play size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">放送</span>
            <span className="font-medium text-foreground">{meta.broadcastStartTime}</span>
          </div>
        )}
        {meta?.recordingDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">収録日</span>
            <span className="font-medium text-foreground">{fmtDate(meta.recordingDate)}</span>
          </div>
        )}
        {meta?.rehearsalDate && (
          <div className="flex items-center gap-1.5">
            <Calendar size={10} className="text-muted-foreground flex-shrink-0" aria-hidden />
            <span className="text-muted-foreground">リハ</span>
            <span className="font-medium text-foreground">{fmtDate(meta.rehearsalDate)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{doc.creator_name || "不明"}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock size={9} aria-hidden />
            {new Date(doc.updated_at).toLocaleDateString("ja-JP")}{" "}
            {new Date(doc.updated_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {shareCount > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-primary" title={`${shareCount} 名に共有中`}>
              <Users size={10} aria-hidden />
              共有中 {shareCount}
            </span>
          ) : (
            /* 案件に紐づいていない台本は作成者だけが見える。ここを一律「案件メンバー」と書くと嘘になる */
            <span
              className="inline-flex items-center gap-0.5"
              title={doc.project_id
                ? "この案件のメンバーに見えます。案件の外の人には「共有」から追加してください"
                : "案件に紐づいていないので、あなただけが見られます。案件に紐づけるか「共有」から追加してください"}
            >
              <Lock size={9} aria-hidden />
              {doc.project_id ? "案件メンバー" : "自分のみ"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-primary font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          台本を開く <ChevronRight size={14} aria-hidden />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ShareDialog — 共有先ユーザーの選択
// ============================================================
interface ShareUser {
  id: string;
  name: string;
  email: string;
}
interface ShareEntry {
  user_id: string;
  name: string | null;
  email: string | null;
}

function ShareDialog({
  doc,
  onClose,
  onSaved,
}: {
  doc: QsheetDocument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const open = !!doc;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");

  const { data: users } = useQuery({
    queryKey: ["qsheet-share-users"],
    queryFn: async () => (await api.get("/qsheet/share-users")).data.data as ShareUser[],
    enabled: open,
  });

  const { data: currentShares } = useQuery({
    queryKey: ["qsheet-shares", doc?.id],
    queryFn: async () => (await api.get(`/qsheet/documents/${doc!.id}/shares`)).data.data as ShareEntry[],
    enabled: open,
  });

  useEffect(() => {
    if (currentShares) setSelected(new Set(currentShares.map((s) => s.user_id)));
  }, [currentShares]);

  useEffect(() => {
    if (open) setUserSearch("");
  }, [open, doc?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/qsheet/documents/${doc!.id}/shares`, { user_ids: Array.from(selected) });
    },
    onSuccess: () => {
      notifySuccess("共有設定を保存しました");
      onSaved();
      onClose();
    },
    onError: () => notifyError("共有設定の保存に失敗しました"),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const filtered = (users || []).filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>共有設定</DialogTitle>
          <DialogDescription>
            「{doc?.data?.meta?.title || doc?.title || "無題"}」を閲覧できるユーザーを選びます。選んだユーザーは一覧に表示され、台本を開けるようになります（管理者は常に全件閲覧できます）。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="名前・メールで検索..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-10"
              aria-label="共有ユーザー検索"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border divide-y divide-border">
            {filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">ユーザーが見つかりません</p>
            ) : (
              filtered.map((u) => {
                const on = selected.has(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggle(u.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    role="checkbox"
                    aria-checked={on}
                  >
                    <span className={`size-5 rounded-md flex items-center justify-center border flex-shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {on && <Check size={13} aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{u.name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="text-xs text-muted-foreground">{selected.size} 名を選択中</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DashboardPage
// ============================================================
export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const [shareDoc, setShareDoc] = useState<QsheetDocument | null>(null);
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
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

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
      notifySuccess(
        doc.project_id
          ? "作成しました。この案件のメンバーにも見えます（案件の外の人に見せるにはカードの「共有」から追加してください）。"
          : "作成しました。案件に紐づいていないので、いまはあなただけが見られます（他の人に見せるにはカードの「共有」から追加してください）。"
      );
      navigate(`/qsheet/editor/${doc.id}`);
    },
    onError: () => {
      notifyError("ドキュメントの作成に失敗しました");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/qsheet/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
      notifySuccess("ドキュメントを削除しました");
    },
    onError: () => {
      notifyError("ドキュメントの削除に失敗しました");
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
    setDeleteTargetId(id);
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      deleteMutation.mutate(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5">
        <DashboardHeader
          title="Qシート"
          description={`${documents?.length || 0} 件のドキュメント。タイトルで検索、新規作成、OnAir/ランダウン起動。`}
          lastUpdated={`最終更新 ${new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
          controls={
            <Button onClick={() => setShowCreate(true)} data-create-btn>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              新規作成
            </Button>
          }
        />

        {/* Project filter banner */}
        {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-primary/5 px-4 py-2.5" role="status">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">
              <span className="font-medium">{documents[0].gls_number}</span>
              <span className="text-muted-foreground ml-1">{documents[0].project_name}</span>
              のQシート
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

        {/* Search */}
        <div className="relative max-w-sm sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="タイトルで検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Qシート検索"
          />
        </div>

        {/* Document list — single column */}
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
          <div className="grid gap-3">
            {documents.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                canManage={isAdmin || (!!currentUser && doc.created_by === currentUser.id)}
                onNavigate={(id) => navigate(`/qsheet/editor/${id}`)}
                onOnAir={(id) => navigate(`/qsheet/onair/${id}`)}
                onDelete={handleDelete}
                onShare={setShareDoc}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText />}
            title="まだドキュメントがありません"
            description="「新規作成」から最初のQシートを作成しましょう。"
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                最初のQシートを作成
              </Button>
            }
          />
        )}
      </main>

      {/* ===== Create dialog ===== */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新規台本作成</DialogTitle>
            <DialogDescription>
              作成したQシートは最初あなた（と管理者）だけが閲覧できます。他の人に見せるには、作成後にカードの「共有」ボタンから共有してください。
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 pt-2"
            onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          >
            <div>
              <Label className="text-xs text-muted-foreground">番組名 <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1"
                placeholder="例：サンプル情報バラエティ"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">撮影場所 <span className="text-destructive">*</span></Label>
              <Input
                className="mt-1"
                placeholder="例：GMOサムライスタジオ用賀"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">放送日 <span className="text-destructive">*</span></Label>
                <Input className="mt-1" type="date" value={newBroadcastDate} onChange={(e) => setNewBroadcastDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">放送開始時刻</Label>
                <Input className="mt-1" type="time" value={newBroadcastStartTime} onChange={(e) => setNewBroadcastStartTime(e.target.value)} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground">収録日を設定（生放送の場合はOFF）</span>
                <Switch checked={hasRecording} onCheckedChange={(v) => setHasRecording(!!v)} />
              </div>
              {hasRecording && (
                <Input type="date" value={newRecordingDate} onChange={(e) => setNewRecordingDate(e.target.value)} required />
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-muted-foreground">リハーサル日を設定</span>
                <Switch checked={hasRehearsal} onCheckedChange={(v) => setHasRehearsal(!!v)} />
              </div>
              {hasRehearsal && (
                <Input type="date" value={newRehearsalDate} onChange={(e) => setNewRehearsalDate(e.target.value)} />
              )}
            </div>

            {/* GLS Project Linking */}
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

            <Button
              type="submit"
              disabled={!newTitle.trim() || !newLocation.trim() || !newBroadcastDate || (hasRecording && !newRecordingDate) || createMutation.isPending}
              className="w-full py-2.5 text-sm font-semibold"
            >
              {createMutation.isPending ? "作成中..." : "台本を作成"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* 共有設定ダイアログ */}
      <ShareDialog
        doc={shareDoc}
        onClose={() => setShareDoc(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
          if (shareDoc) queryClient.invalidateQueries({ queryKey: ["qsheet-shares", shareDoc.id] });
        }}
      />

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>このドキュメントを削除しますか？</DialogTitle>
            <DialogDescription>
              この操作は取り消せません。台本データが完全に削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "削除中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
