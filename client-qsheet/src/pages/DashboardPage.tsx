import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus,
  FileText,
  Trash2,
  Clock,
  Sun,
  Moon,
  X,
  Radio,
  Pencil,
  MapPin,
  Calendar,
  Play,
  ChevronRight,
  Check,
  Loader2,
  Link2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
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
  data?: DocumentData;
}

interface DocumentData {
  meta?: DocumentMeta;
  blocks?: any[];
  sections?: any[];
  masters?: any;
}

interface DocumentMeta {
  title?: string;
  draftNumber?: number;
  draftType?: string;
  broadcastDate?: string;
  broadcastStartTime?: string;
  recordingDate?: string;
  rehearsalDate?: string;
  location?: string;
  author?: string;
  updatedAt?: string;
}

interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
  broadcast_date: string | null;
}

// ─── Helpers ────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric", weekday: "short" });
}

function getDraftLabel(meta?: DocumentMeta) {
  if (!meta) return "第1稿";
  if (meta.draftType === "準備稿") return "準備稿";
  if (meta.draftType === "決定稿") return "決定稿";
  return `第${meta.draftNumber || 1}稿`;
}

function getDraftColor(meta?: DocumentMeta) {
  if (!meta) return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (meta.draftType === "決定稿") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-800";
  if (meta.draftType === "準備稿") return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 ring-1 ring-amber-200 dark:ring-amber-800";
  return "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800";
}

// ─── DocCard ────────────────────────────────────────────
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
      className="group p-5 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 transition-all hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-lg hover:shadow-blue-600/5 cursor-pointer"
      onClick={() => onNavigate(doc.id)}
    >
      {/* Top: title + badge + actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 mb-1">
            <h3 className="text-base font-bold truncate">{meta?.title || doc.title || "無題"}</h3>
            <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${getDraftColor(meta)}`}>
              {getDraftLabel(meta)}
            </span>
          </div>
          {meta?.location && (
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <MapPin size={11} />
              <span>{meta.location}</span>
            </div>
          )}
          {(doc.gls_number || doc.episode_code) && (
            <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
              <Link2 size={11} />
              {doc.gls_number && <span className="font-medium">{doc.gls_number}</span>}
              {doc.project_name && <span>{doc.project_name}</span>}
              {doc.episode_code && <span>{doc.gls_number ? " / " : ""}{doc.episode_code}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onOnAir(doc.id); }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all"
          >
            <Radio size={10} />ONAIR
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(doc.id); }}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-zinc-400 hover:text-red-500 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 text-[11px]">
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
        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
          <span>{doc.creator_name || "不明"}</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock size={9} />
            {new Date(doc.updated_at).toLocaleDateString("ja-JP")}{" "}
            {new Date(doc.updated_at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-blue-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          台本を開く <ChevronRight size={12} />
        </div>
      </div>
    </div>
  );
}

// ─── NewDocModal ────────────────────────────────────────
function NewDocModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (doc: QsheetDocument) => void;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [broadcastDate, setBroadcastDate] = useState("");
  const [broadcastStartTime, setBroadcastStartTime] = useState("");
  const [hasRecording, setHasRecording] = useState(true);
  const [recordingDate, setRecordingDate] = useState("");
  const [hasRehearsal, setHasRehearsal] = useState(false);
  const [rehearsalDate, setRehearsalDate] = useState("");
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [creating, setCreating] = useState(false);

  const canSubmit = title.trim() && location.trim() && broadcastDate;

  const { data: glsProjects } = useQuery({
    queryKey: ["gls-options"],
    queryFn: async () => (await api.get("/lookup/gls-options")).data.data as GlsProject[],
    enabled: linkToProject,
  });

  const { data: episodes } = useQuery({
    queryKey: ["episode-options", selectedProjectId],
    queryFn: async () => (await api.get(`/lookup/${selectedProjectId}/episodes-options`)).data.data as EpisodeOption[],
    enabled: !!selectedProjectId,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || creating) return;
    setCreating(true);
    try {
      const selectedEpisode = episodes?.find((ep) => ep.id === selectedEpisodeId);
      const res = await api.post("/qsheet/documents", {
        title: title.trim(),
        broadcast_date: broadcastDate || null,
        project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
        episode_id: linkToProject && selectedEpisodeId ? selectedEpisodeId : null,
        episode_code: linkToProject && selectedEpisode ? selectedEpisode.episode_code : null,
        data: {
          _version: 4,
          meta: {
            title: title.trim(),
            draftNumber: 1,
            draftType: "numbered",
            updatedAt: new Date().toISOString(),
            broadcastStartTime,
            broadcastDate,
            rehearsalDate: hasRehearsal ? rehearsalDate : "",
            recordingDate: hasRecording ? recordingDate : "",
            location: location.trim(),
          },
          blocks: [
            { id: "blk_s1", type: "scenario", label: "シナリオ", width: "L" },
            { id: "blk_v1", type: "video", label: "映像", width: "M" },
            { id: "blk_sl1", type: "slide", label: "スライド", width: "M" },
            { id: "blk_t1", type: "telop", label: "テロップ", width: "S" },
            { id: "blk_a1", type: "audio", label: "オーディオ", width: "S" },
          ],
          sections: [{ label: "【ロール1】", rows: [] }],
          masters: { persons: [], video: [], audio: [], telop: [] },
          stageTemplates: [],
          sectionTemplates: [],
        },
      });
      onCreated(res.data.data);
    } catch {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">新規台本作成</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">番組名 <span className="text-red-500">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all" placeholder="例：サンプル情報バラエティ" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">撮影場所 <span className="text-red-500">*</span></label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all" placeholder="例：GMOグローバルスタジオ" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">放送日 <span className="text-red-500">*</span></label>
              <input type="date" value={broadcastDate} onChange={(e) => setBroadcastDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">放送開始時刻</label>
              <input type="time" value={broadcastStartTime} onChange={(e) => setBroadcastStartTime(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all" />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={hasRecording} onChange={() => setHasRecording(!hasRecording)} className="accent-blue-600 w-3.5 h-3.5" />
              収録日を設定（生放送の場合はOFF）
            </label>
            {hasRecording && <input type="date" value={recordingDate} onChange={(e) => setRecordingDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all" />}
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={hasRehearsal} onChange={() => setHasRehearsal(!hasRehearsal)} className="accent-blue-600 w-3.5 h-3.5" />
              リハーサル日を設定
            </label>
            {hasRehearsal && <input type="date" value={rehearsalDate} onChange={(e) => setRehearsalDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all" />}
          </div>

          {/* GLS linking */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-4">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-500 mb-1 cursor-pointer">
              <input type="checkbox" checked={linkToProject} onChange={(e) => setLinkToProject(e.target.checked)} className="accent-blue-600 w-3.5 h-3.5" />
              <Link2 size={12} />
              GLS案件に紐付ける
            </label>
            {linkToProject && (
              <div className="mt-2 space-y-2 pl-6">
                <select value={selectedProjectId} onChange={(e) => { setSelectedProjectId(e.target.value); setSelectedEpisodeId(""); }} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all">
                  <option value="">案件を選択...</option>
                  {glsProjects?.map((p) => <option key={p.id} value={p.id}>{p.gls_number} — {p.name}</option>)}
                </select>
                {selectedProjectId && episodes && episodes.length > 0 && (
                  <select value={selectedEpisodeId} onChange={(e) => setSelectedEpisodeId(e.target.value)} className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 transition-all">
                    <option value="">エピソード（任意）...</option>
                    {episodes.map((ep) => <option key={ep.id} value={ep.id}>{ep.episode_code}{ep.broadcast_date && ` — ${ep.broadcast_date}`}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          <button type="submit" disabled={!canSubmit || creating} className="w-full py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-blue-600/25 transition-all">
            {creating ? "作成中..." : "台本を作成"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [dark, setDark] = useState(false);

  const projectFilter = searchParams.get("project");

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/qsheet/documents/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] }); },
  });

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  const handleDelete = (id: string) => {
    if (confirm("このドキュメントを削除しますか？")) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h1 className="text-sm font-semibold tracking-tight">Cue Sheet</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{currentUser?.name}</span>
            <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={logout} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">ログアウト</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Title + New button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">ドキュメント</h2>
            <p className="text-sm text-zinc-500 mt-1">{documents?.length ?? 0} 件の台本</p>
          </div>
          <button onClick={() => setShowNewModal(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all hover:shadow-md hover:shadow-blue-600/30 active:scale-[0.98]">
            <Plus size={16} />新規作成
          </button>
        </div>

        {/* Project filter banner */}
        {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
          <div className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-2.5 mb-6">
            <Link2 className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm">
              <span className="font-medium">{documents[0].gls_number}</span>
              <span className="text-zinc-500 ml-1">{documents[0].project_name}</span>
              のQシート
            </span>
            <button className="ml-auto p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 text-zinc-400" onClick={() => setSearchParams({})}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search */}
        {documents && documents.length > 3 && (
          <div className="relative max-w-sm mb-6">
            <input
              placeholder="タイトルで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all pl-9"
            />
            <FileText size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          </div>
        )}

        {/* Document list */}
        {isError ? (
          <div className="text-center py-20">
            <p className="text-sm text-zinc-400">データを取得できませんでした</p>
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
            <p className="text-zinc-400 text-sm">まだドキュメントがありません</p>
          </div>
        )}
      </main>

      {/* Footer link */}
      <div className="max-w-5xl mx-auto px-6 pb-8">
        <a href="/" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">← GMO ONAiR 本体へ</a>
      </div>

      {showNewModal && (
        <NewDocModal
          onClose={() => setShowNewModal(false)}
          onCreated={(doc) => navigate(`/qsheet/editor/${doc.id}`)}
        />
      )}
    </div>
  );
}
