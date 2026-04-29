import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { parseDur as parseDurShared } from "@/lib/time";
import { Button } from "@/components/ui/button";
import EditorSidebar from "@/components/editor/EditorSidebar";
import EditorSidebarSheet from "@/components/editor/EditorSidebarSheet";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
      notifyError("保存に失敗しました", { description: "ネットワーク接続を確認して、もう一度保存してください。" });
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



  // Global Ctrl+S / Cmd+S → manual save (input/textarea/[contenteditable] 内では無視)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.key === "s" || e.key === "S") || !(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;
        if (target.isContentEditable) return;
      }
      e.preventDefault();
      handleManualSave();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

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
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <header className="flex-none bg-card/80 backdrop-blur-xl border-b border-border z-50">
        {/* Row 1: Title + save + actions */}
        <div className="flex items-center justify-between px-4 h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={() => navigate("/qsheet")}
              className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="ダッシュボードに戻る"
            >
              <ChevronLeft size={18} aria-hidden />
            </button>
            <input
              value={doc.data.meta.title || ""}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
              className="flex-1 min-w-0 bg-transparent text-[15px] font-bold border-none outline-none placeholder:text-muted-foreground/40 truncate"
              placeholder="無題のドキュメント"
              aria-label="ドキュメントタイトル"
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            {/* Save status badge */}
            <span
              role="status"
              aria-live="polite"
              className={`hidden sm:inline text-xs font-medium px-2 py-0.5 rounded-full transition-all ${
                saveStatus === "saved" ? "text-success bg-success/10" :
                saveStatus === "saving" ? "text-primary bg-primary/10" :
                saveStatus === "error" ? "text-destructive bg-destructive/10" :
                "text-warning bg-warning/10"
              }`}
            >
              {saveStatus === "saved" ? "保存済み" : saveStatus === "saving" ? "保存中..." : saveStatus === "error" ? "エラー" : "未保存"}
            </span>
            {/* Manual save button */}
            <button
              onClick={handleManualSave}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                saveFlash ? "bg-success text-success-foreground scale-105" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
              aria-label="手動保存"
              aria-keyshortcuts="Control+S"
              title="保存 (Ctrl+S / Cmd+S)"
            >
              <Save size={14} aria-hidden />
              <span className="hidden sm:inline">{saveFlash ? "保存しました" : "保存"}</span>
            </button>
            {/* ゴミ箱 — ロール/行/エントリの復元用 */}
            {(() => {
              const trashCount = getTrash(doc.data).length;
              return (
                <button
                  onClick={() => setShowTrash(true)}
                  className="relative hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  title="ゴミ箱（削除したロール/行/エントリを復元）"
                  aria-label={`ゴミ箱 ${trashCount}件`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden md:inline">ゴミ箱</span>
                  {trashCount > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold min-w-[18px] text-center">
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
            <button
              onClick={() => setShowPreview(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="印刷 / PDF プレビュー"
            >
              <Eye size={13} aria-hidden />
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
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors hidden lg:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
            >
              {sidebarOpen ? <PanelRightClose size={16} aria-hidden /> : <PanelRightOpen size={16} aria-hidden />}
            </button>
          </div>
        </div>

        {/* Row 2: Info bar — draft selector + dates + location (hidden on mobile) */}
        <div className="hidden sm:flex items-center gap-3 px-4 pb-2 text-[11px] text-muted-foreground flex-wrap">
          {/* Draft selector */}
          <div className="flex items-center gap-1">
            <span className="font-bold text-primary text-xs bg-primary/10 px-2 py-0.5 rounded" style={{ fontFamily: "'Oswald',sans-serif" }}>
              {getDraftLabel(doc.data.meta)}
            </span>
            <select
              value={doc.data.meta.draftType || "numbered"}
              onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, draftType: e.target.value } }))}
              className="bg-transparent border border-border rounded px-1.5 py-0.5 text-[11px] outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="稿の種類"
            >
              <option value="numbered">稿番号を自動設定</option>
              <option value="準備稿">準備稿</option>
              <option value="決定稿">決定稿</option>
            </select>
          </div>
          <span className="text-border" aria-hidden>|</span>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">放送日</span>
            <input type="date" value={doc.data.meta.broadcastDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Oswald',sans-serif" }} aria-label="放送日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">収録日</span>
            <input type="date" value={doc.data.meta.recordingDate || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, recordingDate: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Oswald',sans-serif" }} aria-label="収録日" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">開始</span>
            <input type="time" value={doc.data.meta.broadcastStartTime || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, broadcastStartTime: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground" style={{ fontFamily: "'Oswald',sans-serif" }} step="1" aria-label="放送開始時刻" />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">場所</span>
            <input value={doc.data.meta.location || ""} onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, location: e.target.value } }))} className="bg-transparent border-none outline-none text-foreground w-32" placeholder="撮影場所" aria-label="撮影場所" />
          </label>
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Clock size={11} aria-hidden />
            <span style={{ fontFamily: "'Oswald',sans-serif" }} aria-label="総尺">{formatTime(totalDuration)}</span>
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
          ledScenes={(doc.data as any).ledScenes}
          meta={doc.data.meta}
          collapsedBlocks={collapsedBlocks}
          collapsedSections={collapsedSections}
          onToggleCollapse={toggleBlockCollapse}
          onToggleSectionCollapse={toggleSectionCollapse}
          updateState={(updater) => updateData(updater)}
        />

        {/* Sidebar (lg+) */}
        {sidebarOpen && (
          <EditorSidebar
            blocks={doc.data.blocks}
            masters={doc.data.masters}
            meta={doc.data.meta}
            stageTemplates={(doc.data as any).stageTemplates}
            ledScenes={(doc.data as any).ledScenes}
            episodeId={doc.episode_id}
            onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
            onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
            onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
            onLedScenesChange={(scenes) => updateData((d) => ({ ...d, ledScenes: scenes } as any))}
            onEditStageTemplate={(idx) => setEditingStageIdx(idx)}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
          />
        )}
      </div>

      {/* Mobile/Tablet Sidebar Sheet (lg未満で FAB から開く) */}
      <EditorSidebarSheet
        open={mobileSidebarOpen}
        onOpenChange={setMobileSidebarOpen}
        blocks={doc.data.blocks}
        masters={doc.data.masters}
        meta={doc.data.meta}
        stageTemplates={(doc.data as any).stageTemplates}
        ledScenes={(doc.data as any).ledScenes}
        episodeId={doc.episode_id}
        onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
        onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
        onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
        onLedScenesChange={(scenes) => updateData((d) => ({ ...d, ledScenes: scenes } as any))}
        onEditStageTemplate={(idx) => {
          setEditingStageIdx(idx);
          setMobileSidebarOpen(false);
        }}
        onEpisodeChange={(episodeId, episodeCode) => {
          setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
          setDirty(true);
        }}
      />

      {/* FAB — モバイル/タブレットでサイドバーを開く */}
      <button
        type="button"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="エディタサイドバーを開く"
        className={`lg:hidden fixed right-4 size-14 rounded-full shadow-lg flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          saveStatus === "error"
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
      >
        <PanelRightOpen size={22} aria-hidden />
        {saveStatus === "error" && (
          <span className="absolute -top-1 -right-1 size-3 rounded-full bg-destructive ring-2 ring-background" aria-hidden />
        )}
      </button>

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
