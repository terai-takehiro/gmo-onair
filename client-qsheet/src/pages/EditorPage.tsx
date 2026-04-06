import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Radio,
  Clock,
} from "lucide-react";

interface CueRow {
  id: string;
  label: string;
  duration: number;
  scenario: string;
  video: string;
  audio: string;
  remarks: string;
}

interface Section {
  id: string;
  label: string;
  rows: CueRow[];
}

interface DocumentData {
  meta: {
    title: string;
    draft: string;
    startTime?: string;
    broadcastDate?: string;
  };
  blocks: Array<{ id: string; type: string; label: string; width: number }>;
  sections: Section[];
  masters: {
    persons: string[];
    video: string[];
    audio: string[];
    telop: string[];
  };
}

interface QsheetDocument {
  id: string;
  title: string;
  data: DocumentData;
  status: string;
  broadcast_date: string | null;
  episode_code: string | null;
  updated_at: string;
}

const emptyRow = (): CueRow => ({
  id: crypto.randomUUID(),
  label: "",
  duration: 30,
  scenario: "",
  video: "",
  audio: "",
  remarks: "",
});

const emptySection = (): Section => ({
  id: crypto.randomUUID(),
  label: "新規セクション",
  rows: [emptyRow()],
});

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<QsheetDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();

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
      // Ensure data has required structure
      if (!d.data.sections) d.data.sections = [];
      if (!d.data.blocks) d.data.blocks = [];
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
      const newData = updater({ ...prev.data });
      return { ...prev, data: newData };
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

  const addSection = () => {
    updateData((data) => ({
      ...data,
      sections: [...data.sections, emptySection()],
    }));
  };

  const deleteSection = (sectionId: string) => {
    updateData((data) => ({
      ...data,
      sections: data.sections.filter((s) => s.id !== sectionId),
    }));
  };

  const addRow = (sectionId: string) => {
    updateData((data) => ({
      ...data,
      sections: data.sections.map((s) =>
        s.id === sectionId ? { ...s, rows: [...s.rows, emptyRow()] } : s
      ),
    }));
  };

  const deleteRow = (sectionId: string, rowId: string) => {
    updateData((data) => ({
      ...data,
      sections: data.sections.map((s) =>
        s.id === sectionId
          ? { ...s, rows: s.rows.filter((r) => r.id !== rowId) }
          : s
      ),
    }));
  };

  const updateRow = (sectionId: string, rowId: string, field: keyof CueRow, value: string | number) => {
    updateData((data) => ({
      ...data,
      sections: data.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              rows: s.rows.map((r) =>
                r.id === rowId ? { ...r, [field]: value } : r
              ),
            }
          : s
      ),
    }));
  };

  const updateSectionLabel = (sectionId: string, label: string) => {
    updateData((data) => ({
      ...data,
      sections: data.sections.map((s) =>
        s.id === sectionId ? { ...s, label } : s
      ),
    }));
  };

  // Time calculation
  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const totalDuration = doc?.data.sections.reduce(
    (acc, section) => acc + section.rows.reduce((a, r) => a + (r.duration || 0), 0),
    0
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
      <div className="flex items-center justify-between gap-4 border-b bg-white px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/qsheet")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            className="h-8 max-w-xs text-sm font-semibold border-none shadow-none focus-visible:ring-0 px-1"
            value={doc.data.meta.title || ""}
            onChange={(e) =>
              updateData((data) => ({
                ...data,
                meta: { ...data.meta, title: e.target.value },
              }))
            }
            placeholder="タイトル"
          />
          <Badge variant="secondary" className="shrink-0 text-xs">
            {doc.data.meta.draft || "準備稿"}
          </Badge>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="font-number">{formatTime(totalDuration)}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => navigate(`/qsheet/onair/${doc.id}`)}
          >
            <Radio className="h-4 w-4" />
            <span className="hidden sm:inline">ON AIR</span>
          </Button>
          <Button
            size="sm"
            className="gap-1"
            onClick={() => saveMutation.mutate(doc)}
            disabled={saveMutation.isPending || !dirty}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">保存</span>
          </Button>
        </div>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="space-y-6 max-w-6xl mx-auto">
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
                cumulativeTime += doc.data.sections[i].rows.reduce(
                  (a, r) => a + (r.duration || 0), 0
                );
              }

              return (
                <div key={section.id} className="border rounded-lg overflow-hidden">
                  {/* Section header */}
                  <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 border-b">
                    <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                    <Input
                      className="h-7 max-w-[200px] text-sm font-semibold border-none shadow-none bg-transparent focus-visible:ring-0 px-1"
                      value={section.label}
                      onChange={(e) => updateSectionLabel(section.id, e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground font-number ml-auto">
                      {section.rows.length} キュー
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSection(section.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Cue table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-slate-50/50">
                          <th className="w-10 px-2 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                          <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">時刻</th>
                          <th className="w-16 px-2 py-2 text-left text-xs font-medium text-muted-foreground">尺(秒)</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[200px]">台本</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[120px]">映像</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[120px]">音声</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[120px]">備考</th>
                          <th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, rIdx) => {
                          const time = formatTime(cumulativeTime);
                          cumulativeTime += row.duration || 0;

                          return (
                            <tr key={row.id} className="border-b last:border-b-0 hover:bg-slate-50/50">
                              <td className="px-2 py-1.5 text-xs text-muted-foreground font-number">
                                {rIdx + 1}
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="text-xs font-number text-muted-foreground">{time}</span>
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  className="h-7 w-14 text-xs text-center font-number p-1"
                                  type="number"
                                  min={0}
                                  value={row.duration}
                                  onChange={(e) => updateRow(section.id, row.id, "duration", parseInt(e.target.value) || 0)}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <textarea
                                  className="w-full min-h-[2rem] rounded border border-input bg-background px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  value={row.scenario}
                                  onChange={(e) => updateRow(section.id, row.id, "scenario", e.target.value)}
                                  placeholder="台本内容..."
                                  rows={1}
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  value={row.video}
                                  onChange={(e) => updateRow(section.id, row.id, "video", e.target.value)}
                                  placeholder="映像素材"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  value={row.audio}
                                  onChange={(e) => updateRow(section.id, row.id, "audio", e.target.value)}
                                  placeholder="音声素材"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  value={row.remarks}
                                  onChange={(e) => updateRow(section.id, row.id, "remarks", e.target.value)}
                                  placeholder="備考"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
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

                  {/* Add row */}
                  <div className="px-4 py-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={() => addRow(section.id)}
                    >
                      <Plus className="h-3 w-3" />
                      キュー追加
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          {/* Add section */}
          {doc.data.sections.length > 0 && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={addSection} className="gap-2">
                <Plus className="h-4 w-4" />
                セクション追加
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
