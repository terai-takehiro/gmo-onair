import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import EditorSidebar from "@/components/editor/EditorSidebar";
import CueTable from "@/components/editor/CueTable";
import {
  Loader2,
  Save,
  ArrowLeft,
  Radio,
  List,
  Download,
  FileDown,
  Sun,
  Moon,
  Check,
  MonitorPlay,
  PanelLeftOpen,
  PanelLeftClose,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface Block {
  id: string;
  type: string;
  label: string;
  width: string | number;
  widthPx?: number;
}

interface Section {
  label: string;
  rows: any[];
  duration?: string;
  _break?: boolean;
  _pageBreak?: boolean;
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
  broadcastDate?: string;
  broadcastStartTime?: string;
  recordingDate?: string;
  rehearsalDate?: string;
  location?: string;
  author?: string;
  updatedAt?: string;
}

interface DocumentData {
  _version?: number;
  meta: DocumentMeta;
  blocks: Block[];
  sections: Section[];
  masters: Masters;
  stageTemplates?: any[];
  sectionTemplates?: any[];
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

// ─── Helpers ────────────────────────────────────────────
function getDraftLabel(meta?: DocumentMeta) {
  if (!meta) return "第1稿";
  if (meta.draftType === "準備稿") return "準備稿";
  if (meta.draftType === "決定稿") return "決定稿";
  return `第${meta.draftNumber || 1}稿`;
}

function getDraftColor(meta?: DocumentMeta) {
  if (!meta) return "bg-zinc-100 text-zinc-700";
  if (meta.draftType === "決定稿") return "bg-emerald-100 text-emerald-700";
  if (meta.draftType === "準備稿") return "bg-amber-100 text-amber-700";
  return "bg-blue-100 text-blue-700";
}

// ─── CSV Export ──────────────────────────────────────────
function exportCsv(doc: QsheetDocument) {
  const { sections, blocks, meta } = doc.data;
  const headers = ["#", "セクション", "尺", ...blocks.map((b) => b.label)];
  const rows: string[][] = [headers];
  let num = 1;
  sections.forEach((sec) => {
    if (sec._break || sec._pageBreak) return;
    sec.rows.forEach((row) => {
      const cells = [
        String(num++),
        sec.label,
        String(row.duration || ""),
        ...blocks.map((b) => {
          const c = row.cells?.[b.id];
          return typeof c === "string" ? c : (c?.value || "");
        }),
      ];
      rows.push(cells);
    });
  });
  const bom = "\uFEFF";
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${meta.title || "cuesheet"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── EditorPage ─────────────────────────────────────────
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<QsheetDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dark, setDark] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        { id: "blk_s1", type: "scenario", label: "シナリオ", width: "L" },
        { id: "blk_v1", type: "video", label: "映像", width: "M" },
        { id: "blk_a1", type: "audio", label: "オーディオ", width: "S" },
      ];
      if (!d.data.meta) d.data.meta = { title: d.title, draft: "準備稿" };
      if (!d.data.masters) d.data.masters = { persons: [], video: [], audio: [], telop: [] };
      if (!d.data.stageTemplates) d.data.stageTemplates = [];
      if (!d.data.sectionTemplates) d.data.sectionTemplates = [];
      setDoc(d);
    }
  }, [queryData, doc]);

  const saveMutation = useMutation({
    mutationFn: async (document: QsheetDocument) => {
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
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
    },
  });

  const updateData = useCallback((updater: (data: DocumentData) => DocumentData) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, data: updater({ ...prev.data }) };
    });
    setDirty(true);
  }, []);

  const updateState = useCallback((updater: (data: DocumentData) => DocumentData) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, data: updater({ ...prev.data }) };
    });
    setDirty(true);
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

  const manualSave = () => {
    if (!doc) return;
    saveMutation.mutate(doc);
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1500);
  };

  const exportPdf = async () => {
    if (!doc) return;
    try {
      const res = await api.post("/qsheet/export-pdf", { documentId: doc.id }, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.data.meta.title || "cuesheet"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF出力に失敗しました");
    }
  };

  const toggleDark = () => {
    setDark(!dark);
    document.documentElement.classList.toggle("dark");
  };

  if (isLoading || !doc) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header / Toolbar */}
      <header className="flex-none flex items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl px-4 py-2 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate("/qsheet")} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors shrink-0">
            <ArrowLeft size={16} />
          </button>
          <input
            className="h-8 max-w-[220px] text-sm font-bold border-none bg-transparent outline-none focus:ring-0 px-1 truncate"
            value={doc.data.meta.title || ""}
            onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
            placeholder="タイトル"
          />
          {saveFlash ? (
            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <Check size={10} />保存済み
            </span>
          ) : dirty ? (
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">未保存</span>
          ) : (
            <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${getDraftColor(doc.data.meta)}`}>
              {getDraftLabel(doc.data.meta)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-zinc-400 mr-2">
            {doc.data.meta.broadcastDate && <span>放送: {doc.data.meta.broadcastDate}</span>}
            {doc.data.meta.broadcastStartTime && <span>{doc.data.meta.broadcastStartTime}</span>}
            {doc.data.meta.location && <span>📍{doc.data.meta.location}</span>}
          </div>
          <button onClick={() => exportCsv(doc)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="CSV出力">
            <Download size={14} />
          </button>
          <button onClick={exportPdf} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="PDF出力">
            <FileDown size={14} />
          </button>
          <button onClick={() => navigate(`/qsheet/rundown/${doc.id}`)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="ランダウン">
            <List size={14} />
          </button>
          <button onClick={() => navigate(`/qsheet/prompter/${doc.id}`)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="プロンプター">
            <MonitorPlay size={14} />
          </button>
          <button onClick={() => navigate(`/qsheet/onair/${doc.id}`)} className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-600 text-white hover:bg-red-500 transition-all" title="ON AIR">
            <Radio size={12} />ON AIR
          </button>
          <button onClick={manualSave} disabled={saveMutation.isPending || !dirty} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors disabled:opacity-30" title="保存">
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="サイドバー">
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
          <button onClick={toggleDark} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 transition-colors" title="ダークモード">
            {dark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* Body: sidebar + CueTable */}
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <EditorSidebar
            blocks={doc.data.blocks}
            masters={doc.data.masters}
            meta={doc.data.meta}
            stageTemplates={doc.data.stageTemplates}
            episodeId={doc.episode_id}
            onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
            onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
            onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
            onShowImport={() => fileInputRef.current?.click()}
            onExportExcel={() => exportCsv(doc)}
          />
        )}
        <CueTable
          blocks={doc.data.blocks}
          sections={doc.data.sections}
          masters={doc.data.masters}
          stageTemplates={doc.data.stageTemplates}
          sectionTemplates={doc.data.sectionTemplates}
          meta={doc.data.meta}
          collapsedBlocks={collapsedBlocks}
          collapsedSections={collapsedSections}
          onToggleCollapse={(blockId) => {
            setCollapsedBlocks((prev) => {
              const next = new Set(prev);
              next.has(blockId) ? next.delete(blockId) : next.add(blockId);
              return next;
            });
          }}
          onToggleSectionCollapse={(si) => {
            setCollapsedSections((prev) => {
              const next = new Set(prev);
              next.has(si) ? next.delete(si) : next.add(si);
              return next;
            });
          }}
          updateState={updateState}
        />
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={() => {}} />
    </div>
  );
}
