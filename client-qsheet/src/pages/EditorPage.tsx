import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { parseDur as parseDurShared } from "@/lib/time";
import { Button } from "@/components/ui/button";
import EditorSidebar from "@/components/editor/EditorSidebar";
import CueTable from "@/components/editor/CueTable";
import PreviewModal from "@/components/editor/PreviewModal";
import TrashDrawer from "@/components/editor/TrashDrawer";
import { getTrash } from "@/lib/trash";
import StageEditor from "@/components/editor/StageEditor";
import {
  Loader2,
  Save,
  Radio,
  List,
  Clock,
  Download,
  PanelRightOpen,
  PanelRightClose,
  ChevronLeft,
  MonitorPlay,
  Eye,
  Trash2,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface CueRow {
  duration: string;
  cells: Record<string, unknown>;
  [key: string]: unknown;
}

interface Section {
  label: string;
  rows: CueRow[];
  duration?: string;
  _break?: boolean;
  _pageBreak?: boolean;
  [key: string]: unknown;
}

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

interface DocumentMeta {
  title: string;
  draft: string;
  draftNumber?: number;
  draftType?: string;
  startTime?: string;
  broadcastStartTime?: string;
  broadcastDate?: string;
  recordingDate?: string;
  rehearsalDate?: string;
  location?: string;
  author?: string;
  updatedAt?: string;
}

interface DocumentData {
  meta: DocumentMeta;
  blocks: Block[];
  sections: Section[];
  masters: Masters;
}

interface QsheetDocument {
  id: string;
  title: string;
  data: DocumentData;
  status: string;
  broadcast_date: string | null;
  episode_id: string | null;
  episode_code: string | null;
  updated_at: string;
}

// ============================================================
// Helpers
// ============================================================
const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

// ============================================================
// Excel export (CSV-based for simplicity without xlsx dep)
// ============================================================
function exportCsv(doc: QsheetDocument) {
  const { sections, blocks, meta } = doc.data;
  const headers = ["#", "セクション", "尺", ...blocks.map((b) => b.label)];
  const csvRows: string[][] = [headers];
  let num = 1;

  sections.forEach((sec) => {
    if (sec._break || sec._pageBreak) return;
    sec.rows.forEach((row) => {
      const rowCells: Record<string, unknown> = (row.cells as Record<string, unknown>) || {};
      csvRows.push([
        String(num++),
        String(sec.label || ""),
        String(row.duration || ""),
        ...blocks.map((b) => {
          const cell = rowCells[b.id];
          if (typeof cell === "string") return cell;
          if (cell && typeof cell === "object" && "value" in (cell as Record<string, unknown>)) return String((cell as Record<string, unknown>).value || "");
          return "";
        }),
      ]);
    });
  });

  const bom = "\uFEFF";
  const csv = csvRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.title || "cuesheet"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// EditorPage
// ============================================================
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<QsheetDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "unsaved">("saved");
  const [saveFlash, setSaveFlash] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [editingStageIdx, setEditingStageIdx] = useState<number | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  const toggleBlockCollapse = useCallback((id: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleSectionCollapse = useCallback((si: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(si) ? next.delete(si) : next.add(si);
      return next;
    });
  }, []);

  const { data: queryData, isLoading } = useQuery({
    queryKey: ["qsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/qsheet/documents/${id}`);
      return res.data.data as QsheetDocument;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (queryData && !doc) {
      const d = { ...queryData, data: { ...queryData.data } };
      if (!d.data.sections) d.data.sections = [];
      if (!d.data.blocks) d.data.blocks = [
        { id: "scenario", type: "scenario", label: "台本", width: 300 },
        { id: "video", type: "video", label: "映像", width: 150 },
        { id: "audio", type: "audio", label: "音声", width: 150 },
      ];
      if (!d.data.meta) d.data.meta = { title: d.title, draft: "準備稿" };
      if (!d.data.masters) d.data.masters = { persons: [], video: [], audio: [], telop: [] };
      setDoc(d);
    }
  }, [queryData, doc]);

  const saveMutation = useMutation({
    mutationFn: async (document: QsheetDocument) => {
      setSaveStatus("saving");
      await api.put(`/qsheet/documents/${document.id}`, {
        title: document.data.meta.title || document.title,
        data: document.data,
        status: document.status,
        broadcast_date: document.broadcast_date,
        episode_code: document.episode_code,
        episode_id: document.episode_id,
      });
    },
    onSuccess: () => {
      setDirty(false);
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
    },
    onError: () => {
      setSaveStatus("error");
    },
  });

  const updateData = useCallback((updater: (data: DocumentData) => DocumentData) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, data: updater({ ...prev.data }) };
    });
    setDirty(true);
    setSaveStatus("unsaved");
  }, []);

  // Auto-save (2s debounce)
  useEffect(() => {
    if (!dirty || !doc) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMutation.mutate(doc);
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, doc]);

  // Note: Section/row CRUD is handled by CueTable component



  // Manual save — increments draftNumber if numbered mode
  const handleManualSave = useCallback(() => {
    if (!doc) return;
    clearTimeout(autoSaveTimer.current);
    const nextDoc = { ...doc, data: { ...doc.data, meta: { ...doc.data.meta } } };
    if (nextDoc.data.meta.draftType === "numbered" || !nextDoc.data.meta.draftType) {
      nextDoc.data.meta.draftNumber = (nextDoc.data.meta.draftNumber || 1) + 1;
    }
    nextDoc.data.meta.updatedAt = new Date().toISOString();
    setDoc(nextDoc);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
    saveMutation.mutate(nextDoc);
  }, [doc, saveMutation]);

  const getDraftLabel = (meta?: DocumentMeta): string => {
    if (!meta) return "第1稿";
    if (meta.draftType === "準備稿") return "準備稿";
    if (meta.draftType === "決定稿") return "決定稿";
    return `第${meta.draftNumber || 1}稿`;
  };

  const parseDur = parseDurShared;
  const totalDuration = doc?.data.sections.reduce(
    (acc, section) => acc + (parseDur(section.duration) || section.rows.reduce((a, r) => a + parseDur(r.duration), 0)), 0
  ) || 0;

  if (isLoading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="flex-none bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 z-50">
        {/* Row 1: Title + save + actions */}
        <div className="flex items-center justify-between px-4 h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button onClick={() => navigate("/qsheet")} className="p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors flex-shrink-0">
              <ChevronLeft size={18} />
            </button>
            <input
              value={doc.data.meta.title || ""}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
              className="flex-1 min-w-0 bg-transparent text-[15px] font-bold border-none outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700 truncate"
              placeholder="無題のドキュメント"
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Save status badge */}
            <span className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full transition-all ${
              saveStatus === "saved" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" :
              saveStatus === "saving" ? "text-blue-600 bg-blue-50 dark:bg-blue-950/30" :
              saveStatus === "error" ? "text-red-600 bg-red-50 dark:bg-red-950/30" :
              "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
            }`}>
              {saveStatus === "saved" ? "保存済み" : saveStatus === "saving" ? "保存中..." : saveStatus === "error" ? "エラー" : "未保存"}
            </span>
            {/* Manual save button */}
            <button
              onClick={handleManualSave}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                saveFlash ? "bg-emerald-500 text-white scale-105" : "bg-blue-600 text-white hover:bg-blue-700"
              } shadow-sm`}
            >
              <Save size={14} />
              <span className="hidden sm:inline">{saveFlash ? "保存しました" : "保存"}</span>
            </button>
            {/* ゴミ箱 — ロール/行/エントリの復元用 */}
            {(() => {
              const trashCount = getTrash(doc.data).length;
              return (
                <button
                  onClick={() => setShowTrash(true)}
                  className="relative hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  title="ゴミ箱（削除したロール/行/エントリを復元）"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">ゴミ箱</span>
                  {trashCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold min-w-[18px] text-center">
                      {trashCount}
                    </span>
                  )}
                </button>
              );
            })()}
            {/* CSV export — desktop only */}
            <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1 text-xs" onClick={() => exportCsv(doc)}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">CSV</span>
            </Button>
            {/* PDF export */}
            <button onClick={() => setShowPreview(true)} className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              <Eye size={13} />
              <span className="hidden md:inline">印刷 / PDF</span>
            </button>
            {/* Navigation buttons — tablet+ */}
            <Button variant="ghost" size="sm" className="hidden md:flex h-8 gap-1" onClick={() => navigate(`/qsheet/rundown/${doc.id}`)}>
              <List className="h-4 w-4" />
              <span className="hidden lg:inline text-xs">ランダウン</span>
            </Button>
            <Button variant="ghost" size="sm" className="hidden lg:flex h-8 gap-1" onClick={() => navigate(`/qsheet/prompter/${doc.id}`)}>
              <MonitorPlay className="h-4 w-4" />
              <span className="hidden xl:inline text-xs">プロンプター</span>
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => navigate(`/qsheet/onair/${doc.id}`)}>
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">ON AIR</span>
            </Button>
            <button
              className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors hidden lg:block"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </div>

        {/* Row 2: Info bar — draft selector + dates + location (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-3 px-4 pb-2 text-[11px] text-zinc-500 dark:text-zinc-400 flex-wrap">
          {/* Draft selector */}
          <div className="flex items-center gap-1">
            <span className="font-bold text-blue-600 dark:text-blue-400 text-xs bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded" style={{ fontFamily: "'Oswald',sans-serif" }}>
              {getDraftLabel(doc.data.meta)}
            </span>
            <select
              value={doc.data.meta.draftType || "numbered"}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, draftType: e.target.value } }))}
              className="bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer"
            >
              <option value="numbered">稿番号を自動設定</option>
              <option value="準備稿">準備稿</option>
              <option value="決定稿">決定稿</option>
            </select>
          </div>
          <span className="text-zinc-200 dark:text-zinc-700">|</span>
          <label className="flex items-center gap-1">
            <span className="text-zinc-400">放送日</span>
            <input type="date" value={doc.data.meta.broadcastDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastDate: e.target.value } }))} className="bg-transparent border-none outline-none text-zinc-600 dark:text-zinc-300" style={{ fontFamily: "'Oswald',sans-serif" }} />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-zinc-400">収録日</span>
            <input type="date" value={doc.data.meta.recordingDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, recordingDate: e.target.value } }))} className="bg-transparent border-none outline-none text-zinc-600 dark:text-zinc-300" style={{ fontFamily: "'Oswald',sans-serif" }} />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-zinc-400">開始</span>
            <input type="time" value={doc.data.meta.broadcastStartTime || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastStartTime: e.target.value } }))} className="bg-transparent border-none outline-none text-zinc-600 dark:text-zinc-300" style={{ fontFamily: "'Oswald',sans-serif" }} step="1" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-zinc-400">場所</span>
            <input value={doc.data.meta.location || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, location: e.target.value } }))} className="bg-transparent border-none outline-none text-zinc-600 dark:text-zinc-300 w-32" placeholder="撮影場所" />
          </label>
          <div className="ml-auto flex items-center gap-1 text-zinc-400">
            <Clock size={11} />
            <span style={{ fontFamily: "'Oswald',sans-serif" }}>{formatTime(totalDuration)}</span>
          </div>
        </div>
      </header>

      {/* Editor body + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <CueTable
          blocks={doc.data.blocks}
          sections={doc.data.sections}
          masters={doc.data.masters}
          stageTemplates={(doc.data as any).stageTemplates}
          meta={doc.data.meta}
          collapsedBlocks={collapsedBlocks}
          collapsedSections={collapsedSections}
          onToggleCollapse={toggleBlockCollapse}
          onToggleSectionCollapse={toggleSectionCollapse}
          updateState={(updater) => updateData(updater)}
        />

        {/* Sidebar */}
        {sidebarOpen && (
          <EditorSidebar
            blocks={doc.data.blocks}
            masters={doc.data.masters}
            meta={doc.data.meta}
            stageTemplates={(doc.data as any).stageTemplates}
            episodeId={doc.episode_id}
            onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
            onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
            onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
            onEditStageTemplate={(idx) => setEditingStageIdx(idx)}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
          />
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <PreviewModal
          state={doc.data}
          onClose={() => setShowPreview(false)}
          docUpdatedAt={(doc as any).updated_at}
          docCreatedAt={(doc as any).created_at}
          docTitle={doc.title}
        />
      )}

      {/* ゴミ箱 Drawer */}
      {showTrash && (
        <TrashDrawer
          data={doc.data}
          onChange={(updater) => updateData(updater)}
          onClose={() => setShowTrash(false)}
        />
      )}

      {/* Stage Editor Modal */}
      {editingStageIdx !== null && (
        <StageEditor
          template={editingStageIdx >= 0 ? ((doc.data as any).stageTemplates || [])[editingStageIdx] : null}
          onSave={(data) => {
            updateData((d) => {
              const templates = [...((d as any).stageTemplates || [])];
              if (editingStageIdx >= 0 && editingStageIdx < templates.length) {
                templates[editingStageIdx] = data;
              } else {
                templates.push(data);
              }
              return { ...d, stageTemplates: templates } as any;
            });
            setEditingStageIdx(null);
          }}
          onClose={() => setEditingStageIdx(null)}
        />
      )}
    </div>
  );
}
