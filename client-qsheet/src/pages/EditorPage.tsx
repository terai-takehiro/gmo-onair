import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import EditorSidebar from "@/components/editor/EditorSidebar";
import ImageDropZone from "@/components/editor/ImageDropZone";
import {
  Loader2,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Radio,
  List,
  Clock,
  Download,
  Upload,
  FileDown,
  PanelRightOpen,
  PanelRightClose,
  ChevronUp,
  ChevronDown,
  MonitorPlay,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
interface CueRow {
  id: string;
  label: string;
  duration: number;
  [key: string]: string | number | null | undefined;
}

interface Section {
  id: string;
  label: string;
  rows: CueRow[];
  collapsed?: boolean;
}

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

interface DocumentMeta {
  title: string;
  draft: string;
  startTime?: string;
  broadcastDate?: string;
  location?: string;
  author?: string;
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
const genId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    try { return crypto.randomUUID(); } catch { /* insecure context fallback */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const emptyRow = (blocks: Block[]): CueRow => {
  const row: CueRow = {
    id: genId(),
    label: "",
    duration: 30,
  };
  blocks.forEach((b) => { row[b.id] = ""; });
  return row;
};

const emptySection = (blocks: Block[]): Section => ({
  id: genId(),
  label: "新規セクション",
  rows: [emptyRow(blocks)],
});

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
  const headers = ["#", "セクション", "時刻", "尺(秒)", ...blocks.map((b) => b.label)];
  const rows: string[][] = [headers];
  let cum = 0;
  let num = 1;

  sections.forEach((sec) => {
    sec.rows.forEach((row) => {
      const time = formatTime(cum);
      const cells = [
        String(num++),
        sec.label,
        time,
        String(row.duration || 0),
        ...blocks.map((b) => String(row[b.id] || "")),
      ];
      rows.push(cells);
      cum += row.duration || 0;
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

function importCsv(file: File, blocks: Block[]): Promise<Section[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) { resolve([]); return; }

      // Skip header
      const dataLines = lines.slice(1);
      const sectionMap = new Map<string, CueRow[]>();

      dataLines.forEach((line) => {
        const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
        const sectionLabel = cells[1] || "インポート";
        const duration = parseInt(cells[3]) || 30;

        const row: CueRow = { id: crypto.randomUUID(), label: "", duration };
        blocks.forEach((b, i) => {
          row[b.id] = cells[4 + i] || "";
        });

        if (!sectionMap.has(sectionLabel)) sectionMap.set(sectionLabel, []);
        sectionMap.get(sectionLabel)!.push(row);
      });

      const sections: Section[] = [];
      sectionMap.forEach((rows, label) => {
        sections.push({ id: crypto.randomUUID(), label, rows });
      });
      resolve(sections);
    };
    reader.readAsText(file);
  });
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

  // Auto-save (2s debounce)
  useEffect(() => {
    if (!dirty || !doc) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMutation.mutate(doc);
    }, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, doc]);

  // Section/row CRUD
  const addSection = () => updateData((d) => ({
    ...d, sections: [...d.sections, emptySection(d.blocks)],
  }));

  const deleteSection = (sid: string) => updateData((d) => ({
    ...d, sections: d.sections.filter((s) => s.id !== sid),
  }));

  const toggleSection = (sid: string) => updateData((d) => ({
    ...d, sections: d.sections.map((s) => s.id === sid ? { ...s, collapsed: !s.collapsed } : s),
  }));

  const moveSection = (idx: number, dir: -1 | 1) => updateData((d) => {
    const arr = [...d.sections];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return d;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    return { ...d, sections: arr };
  });

  const addRow = (sid: string) => updateData((d) => ({
    ...d,
    sections: d.sections.map((s) =>
      s.id === sid ? { ...s, rows: [...s.rows, emptyRow(d.blocks)] } : s
    ),
  }));

  const deleteRow = (sid: string, rid: string) => updateData((d) => ({
    ...d,
    sections: d.sections.map((s) =>
      s.id === sid ? { ...s, rows: s.rows.filter((r) => r.id !== rid) } : s
    ),
  }));

  const moveRow = (sid: string, idx: number, dir: -1 | 1) => updateData((d) => ({
    ...d,
    sections: d.sections.map((s) => {
      if (s.id !== sid) return s;
      const arr = [...s.rows];
      const t = idx + dir;
      if (t < 0 || t >= arr.length) return s;
      [arr[idx], arr[t]] = [arr[t], arr[idx]];
      return { ...s, rows: arr };
    }),
  }));

  const updateRow = (sid: string, rid: string, field: string, value: string | number) => updateData((d) => ({
    ...d,
    sections: d.sections.map((s) =>
      s.id === sid
        ? { ...s, rows: s.rows.map((r) => r.id === rid ? { ...r, [field]: value } : r) }
        : s
    ),
  }));

  const updateSectionLabel = (sid: string, label: string) => updateData((d) => ({
    ...d, sections: d.sections.map((s) => s.id === sid ? { ...s, label } : s),
  }));

  // PDF export
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

  // CSV import
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !doc) return;
    const sections = await importCsv(file, doc.data.blocks);
    if (sections.length > 0) {
      updateData((d) => ({ ...d, sections: [...d.sections, ...sections] }));
    }
    e.target.value = "";
  };

  const totalDuration = doc?.data.sections.reduce(
    (acc, section) => acc + section.rows.reduce((a, r) => a + (r.duration || 0), 0), 0
  ) || 0;

  if (isLoading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate("/qsheet")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            className="h-8 max-w-[200px] text-sm font-semibold border-none shadow-none focus-visible:ring-0 px-1"
            value={doc.data.meta.title || ""}
            onChange={(e) => updateData((d) => ({ ...d, meta: { ...d.meta, title: e.target.value } }))}
            placeholder="タイトル"
          />
          <Badge variant="secondary" className="shrink-0 text-xs">
            {doc.data.meta.draft || "準備稿"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Clock className="h-3 w-3" />
            <span className="font-number">{formatTime(totalDuration)}</span>
          </div>
          {/* CSV export */}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => exportCsv(doc)}>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">CSV</span>
          </Button>
          {/* CSV import */}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">読込</span>
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCsvImport} />
          {/* PDF export */}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={exportPdf}>
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">PDF</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => navigate(`/qsheet/rundown/${doc.id}`)}>
            <List className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">ランダウン</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => navigate(`/qsheet/prompter/${doc.id}`)}>
            <MonitorPlay className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">プロンプター</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => navigate(`/qsheet/onair/${doc.id}`)}>
            <Radio className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">ON AIR</span>
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1"
            onClick={() => saveMutation.mutate(doc)}
            disabled={saveMutation.isPending || !dirty}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline text-xs">保存</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hidden lg:flex"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Editor body + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="space-y-4 max-w-6xl mx-auto">
            {doc.data.sections.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">セクションがありません</p>
                <Button onClick={addSection} className="gap-2">
                  <Plus className="h-4 w-4" />
                  最初のセクションを追加
                </Button>
              </div>
            ) : (
              doc.data.sections.map((section, sIdx) => {
                let cumulativeTime = 0;
                for (let i = 0; i < sIdx; i++) {
                  cumulativeTime += doc.data.sections[i].rows.reduce((a, r) => a + (r.duration || 0), 0);
                }

                return (
                  <div key={section.id} className="border rounded-lg overflow-hidden">
                    {/* Section header */}
                    <div className="flex items-center gap-1 bg-slate-50 px-3 py-1.5 border-b">
                      <div className="flex flex-col">
                        <button className="text-muted-foreground/50 hover:text-muted-foreground leading-none" onClick={() => moveSection(sIdx, -1)}>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button className="text-muted-foreground/50 hover:text-muted-foreground leading-none" onClick={() => moveSection(sIdx, 1)}>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <button onClick={() => toggleSection(section.id)} className="p-0.5">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      </button>
                      <Input
                        className="h-7 max-w-[180px] text-sm font-semibold border-none shadow-none bg-transparent focus-visible:ring-0 px-1"
                        value={section.label}
                        onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground font-number ml-auto">
                        {section.rows.length} キュー
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteSection(section.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Cue table (collapsible) */}
                    {!section.collapsed && (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-slate-50/50">
                                <th className="w-8 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground"></th>
                                <th className="w-8 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground">#</th>
                                <th className="w-16 px-1 py-1.5 text-left text-xs font-medium text-muted-foreground">時刻</th>
                                <th className="w-14 px-1 py-1.5 text-center text-xs font-medium text-muted-foreground">尺</th>
                                {doc.data.blocks.map((block) => (
                                  <th key={block.id} className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground min-w-[120px]">
                                    {block.label}
                                  </th>
                                ))}
                                <th className="w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.rows.map((row, rIdx) => {
                                const time = formatTime(cumulativeTime);
                                cumulativeTime += row.duration || 0;

                                return (
                                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50/30 group">
                                    <td className="px-1 py-1">
                                      <div className="flex flex-col items-center">
                                        <button className="text-muted-foreground/30 group-hover:text-muted-foreground leading-none" onClick={() => moveRow(section.id, rIdx, -1)}>
                                          <ChevronUp className="h-2.5 w-2.5" />
                                        </button>
                                        <button className="text-muted-foreground/30 group-hover:text-muted-foreground leading-none" onClick={() => moveRow(section.id, rIdx, 1)}>
                                          <ChevronDown className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="px-1 py-1 text-xs text-muted-foreground font-number text-center">
                                      {rIdx + 1}
                                    </td>
                                    <td className="px-1 py-1">
                                      <span className="text-[11px] font-number text-muted-foreground">{time}</span>
                                    </td>
                                    <td className="px-1 py-1">
                                      <Input
                                        className="h-7 w-12 text-xs text-center font-number p-0.5"
                                        type="number"
                                        min={0}
                                        value={row.duration}
                                        onChange={(e) => updateRow(section.id, row.id, "duration", parseInt(e.target.value) || 0)}
                                      />
                                    </td>
                                    {doc.data.blocks.map((block) => (
                                      <td key={block.id} className="px-2 py-1">
                                        {block.type === "scenario" ? (
                                          <textarea
                                            className="w-full min-h-[2rem] rounded border border-input bg-background px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={(row[block.id] as string) || ""}
                                            onChange={(e) => updateRow(section.id, row.id, block.id, e.target.value)}
                                            placeholder="【話者名】台本内容..."
                                            rows={2}
                                          />
                                        ) : block.type === "remarks" ? (
                                          <textarea
                                            className="w-full min-h-[2rem] rounded border border-input bg-amber-50/50 px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-amber-800"
                                            value={(row[block.id] as string) || ""}
                                            onChange={(e) => updateRow(section.id, row.id, block.id, e.target.value)}
                                            placeholder="備考・注意事項..."
                                            rows={2}
                                          />
                                        ) : block.type === "telop" ? (
                                          <textarea
                                            className="w-full min-h-[2rem] rounded border border-input bg-blue-50/50 px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
                                            value={(row[block.id] as string) || ""}
                                            onChange={(e) => updateRow(section.id, row.id, block.id, e.target.value)}
                                            placeholder="テロップ内容..."
                                            rows={2}
                                          />
                                        ) : block.type === "item" ? (
                                          <textarea
                                            className="w-full min-h-[2rem] rounded border border-input bg-green-50/50 px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                            value={(row[block.id] as string) || ""}
                                            onChange={(e) => updateRow(section.id, row.id, block.id, e.target.value)}
                                            placeholder="アイテム・小道具..."
                                            rows={2}
                                          />
                                        ) : block.type === "slide" || block.type === "image" ? (
                                          <ImageDropZone
                                            imageUrl={(row[block.id] as string) || null}
                                            onImageChange={(url) => updateRow(section.id, row.id, block.id, url || "")}
                                          />
                                        ) : (
                                          <Input
                                            className="h-7 text-xs"
                                            value={(row[block.id] as string) || ""}
                                            onChange={(e) => updateRow(section.id, row.id, block.id, e.target.value)}
                                            placeholder={block.label}
                                          />
                                        )}
                                      </td>
                                    ))}
                                    <td className="px-1 py-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground/30 group-hover:text-muted-foreground hover:!text-destructive"
                                        onClick={() => deleteRow(section.id, row.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="px-3 py-1.5 border-t">
                          <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground" onClick={() => addRow(section.id)}>
                            <Plus className="h-3 w-3" />
                            キュー追加
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}

            {doc.data.sections.length > 0 && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={addSection} className="gap-2">
                  <Plus className="h-4 w-4" />
                  セクション追加
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <EditorSidebar
            blocks={doc.data.blocks}
            masters={doc.data.masters}
            meta={doc.data.meta}
            episodeId={doc.episode_id}
            onBlocksChange={(blocks) => updateData((d) => ({ ...d, blocks }))}
            onMastersChange={(masters) => updateData((d) => ({ ...d, masters }))}
            onMetaChange={(meta) => updateData((d) => ({ ...d, meta }))}
            onEpisodeChange={(episodeId, episodeCode) => {
              setDoc((prev) => prev ? { ...prev, episode_id: episodeId, episode_code: episodeCode } : prev);
              setDirty(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
