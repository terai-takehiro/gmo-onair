import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Camera,
  Music,
  Monitor,
  Radio,
} from "lucide-react";
import { notifyError } from '@/lib/notify';
import { Delayed, SkeletonCard } from '@gmo-onair/shared/src/client/states';

// ============================================================
// Types
// ============================================================
interface CameraRow {
  id: string;
  number: string;     // 1C, 2C etc.
  model: string;      // カメラ機種
  lens: string;       // レンズ
  operator: string;   // 担当者
  position: string;   // 設置場所
  cable: string;      // ケーブル/備考
}

interface AudioRow {
  id: string;
  item: string;       // 項目名
  detail: string;     // 詳細
  notes: string;      // 備考
}

interface AudioSection {
  id: string;
  label: string;
  rows: AudioRow[];
}

interface VideoRow {
  id: string;
  item: string;
  detail: string;
  notes: string;
}

interface VideoSection {
  id: string;
  label: string;
  rows: VideoRow[];
}

interface StaffData {
  td: string; sw: string; d: string[]; p: string; ve: string;
  cam: string[]; mix: string; aa: string[]; ca: string[];
  vtrOp: string; aux: string; ld: string; cg: string;
}

interface HeaderData {
  programName: string;
  broadcastType: string;
  productionFormat: string;
  studio: string;
  circuits: string;
  vtr: string;
  performers: string;
}

interface SheetData {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  rows?: CameraRow[] | VideoRow[];
  sections?: AudioSection[] | VideoSection[];
}

interface DocumentData {
  header: HeaderData;
  staff: StaffData;
  sheets: SheetData[];
  notes: string;
}

interface TechsheetDoc {
  id: string;
  title: string;
  production_date: string | null;
  venue: string | null;
  version: string;
  status: string;
  updated_at?: string;
  data: DocumentData;
}

// ============================================================
// Helpers
// ============================================================
const genId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try { return crypto.randomUUID(); } catch { /* fallback */ }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const newCameraRow = (): CameraRow => ({
  id: genId(), number: "", model: "", lens: "", operator: "", position: "", cable: "",
});

const newAudioRow = (): AudioRow => ({
  id: genId(), item: "", detail: "", notes: "",
});

const newVideoRow = (): VideoRow => ({
  id: genId(), item: "", detail: "", notes: "",
});

const TAB_ICONS: Record<string, typeof Camera> = {
  camera: Camera,
  audio: Music,
  video: Monitor,
  comms: Radio,
};

// ============================================================
// EditorPage
// ============================================================
export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<TechsheetDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState("header");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  // 楽観ロック用: 読み込み/保存時点の updated_at を保持し、保存時に expected_updated_at として送る
  const lastUpdatedAtRef = useRef<string | null>(null);

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ["techsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/techsheet/documents/${id}`);
      const d = res.data.data;
      if (typeof d.data === "string") d.data = JSON.parse(d.data);
      // Ensure data has the expected structure (migrate old format)
      if (!d.data || !d.data.sheets) {
        const old = d.data || {};
        d.data = {
          header: old.header || { programName: d.title || "", broadcastType: "", productionFormat: "", studio: d.venue || "", circuits: "", vtr: "", performers: "" },
          staff: old.staff || { td: "", sw: "", d: [], p: "", ve: "", cam: [], mix: "", aa: [], ca: [], vtrOp: "", aux: "", ld: "", cg: "" },
          sheets: old.sheets || [
            { id: genId(), type: "camera", label: "カメラ", enabled: true, rows: (old.cameras || []).map((c: any) => ({ id: genId(), number: c.position || "", model: c.model || "", lens: c.lens || "", operator: c.operator || "", position: "", cable: c.notes || "" })) },
            { id: genId(), type: "video", label: "映像", enabled: true, sections: [{ id: genId(), label: "映像系統", rows: Object.entries(old.video || {}).map(([k, v]) => ({ id: genId(), item: k, detail: String(v || ""), notes: "" })) }] },
            { id: genId(), type: "audio", label: "音声", enabled: true, sections: [{ id: genId(), label: "音声系統", rows: Array.isArray(old.audio?.mics) ? old.audio.mics.map((m: string) => ({ id: genId(), item: m, detail: "", notes: "" })) : Object.entries(old.audio || {}).map(([k, v]) => ({ id: genId(), item: k, detail: String(v || ""), notes: "" })) }] },
            { id: genId(), type: "comms", label: "通信", enabled: true, sections: [{ id: genId(), label: "通信系統", rows: Object.entries(old.comms || {}).map(([k, v]) => ({ id: genId(), item: k, detail: Array.isArray(v) ? v.join(", ") : String(v || ""), notes: "" })) }] },
          ],
          notes: old.notes || "",
        };
      }
      return d as TechsheetDoc;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (queryData && !doc) {
      setDoc(queryData);
      lastUpdatedAtRef.current = queryData.updated_at ?? null;
    }
  }, [queryData, doc]);

  const saveMutation = useMutation({
    mutationFn: async (document: TechsheetDoc) => {
      const res = await api.put(`/techsheet/documents/${document.id}`, {
        title: document.data.header.programName || document.title,
        data: document.data,
        status: document.status,
        production_date: document.production_date,
        venue: document.venue,
        version: document.version,
        expected_updated_at: lastUpdatedAtRef.current,
      });
      return res.data.data as TechsheetDoc;
    },
    onSuccess: (row) => {
      setDirty(false);
      setConflict(false);
      if (row?.updated_at) lastUpdatedAtRef.current = row.updated_at;
      setLastSavedAt(new Date());
      queryClient.invalidateQueries({ queryKey: ["techsheet-documents"] });
    },
    onError: (err: any) => {
      // 409 = 他のタブ/端末が先に保存。自動保存を止めて競合バナーを表示する。
      if (err?.response?.status === 409) {
        setConflict(true);
        return;
      }
      const msg = err?.response?.data?.error?.message || err?.message || "保存に失敗しました";
      console.error("[techsheet] save error:", msg);
      notifyError(`保存エラー: ${msg}`);
    },
  });

  // 競合時に最新を読み込み直す (自動保存を再開できる状態に戻す)
  const handleReload = useCallback(async () => {
    const { data } = await refetch();
    if (data) {
      setDoc(data);
      lastUpdatedAtRef.current = data.updated_at ?? null;
      setConflict(false);
      setDirty(false);
    }
  }, [refetch]);

  const updateData = useCallback((updater: (data: DocumentData) => DocumentData) => {
    setDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, data: updater({ ...prev.data }) };
    });
    setDirty(true);
  }, []);

  // Auto-save 3s debounce
  useEffect(() => {
    if (!dirty || !doc || conflict) return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveMutation.mutate(doc);
    }, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [dirty, doc, conflict]);

  // Helper to update a specific sheet
  const updateSheet = useCallback((sheetId: string, updater: (sheet: SheetData) => SheetData) => {
    updateData((d) => ({
      ...d,
      sheets: d.sheets.map((s) => s.id === sheetId ? updater(s) : s),
    }));
  }, [updateData]);

  if (isLoading || !doc) {
    return (
      <Delayed><SkeletonCard lines={6} /></Delayed>
    );
  }

  const data = doc.data;
  const enabledSheets = data.sheets.filter((s) => s.enabled);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b bg-white px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => navigate("/techsheet")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Input
            className="h-8 max-w-[240px] text-sm font-semibold border-none shadow-none focus-visible:ring-0 px-1"
            value={data.header.programName || ""}
            onChange={(e) => updateData((d) => ({ ...d, header: { ...d.header, programName: e.target.value } }))}
            placeholder="番組名"
          />
          <Badge variant="secondary" className="shrink-0 text-xs">
            {doc.version || "Ver.1.0"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {conflict ? (
            <span className="hidden sm:inline text-xs text-destructive font-medium">保存が競合しました</span>
          ) : saveMutation.isPending ? (
            <span className="hidden sm:inline text-xs text-muted-foreground">保存中…</span>
          ) : dirty ? (
            <span className="hidden sm:inline text-xs text-warning-strong">未保存</span>
          ) : lastSavedAt ? (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              保存済み {lastSavedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => navigate(`/techsheet/print/${doc.id}`)}>
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">印刷</span>
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
        </div>
      </div>

      {/* 競合バナー */}
      {conflict && (
        <div className="flex items-center justify-between gap-2 bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-xs text-destructive">
          <span>この技術資料は別のタブ/端末で更新されました。上書きを防ぐため自動保存を停止しています。CSV 等で退避してから最新を読み込んでください。</span>
          <Button size="sm" variant="outline" className="h-ctl-1 text-xs shrink-0" onClick={handleReload}>
            最新を読み込む
          </Button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b bg-white px-4 overflow-x-auto">
        <button
          className={cn(
            "px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
            activeTab === "header"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("header")}
        >
          基本情報・スタッフ
        </button>
        {enabledSheets.map((sheet) => {
          const Icon = TAB_ICONS[sheet.type] || Monitor;
          return (
            <button
              key={sheet.id}
              className={cn(
                "h-ctl-3 flex items-center gap-1.5 px-4 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === sheet.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab(sheet.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {sheet.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="max-w-screen-xl mx-auto">
          {activeTab === "header" && (
            <HeaderStaffTab data={data} updateData={updateData} doc={doc} setDoc={setDoc} setDirty={setDirty} />
          )}
          {enabledSheets.map((sheet) => (
            activeTab === sheet.id && (
              <div key={sheet.id}>
                {sheet.type === "camera" && (
                  <CameraTab sheet={sheet} updateSheet={updateSheet} />
                )}
                {sheet.type === "audio" && (
                  <SectionedTab sheet={sheet} updateSheet={updateSheet} newRow={newAudioRow} />
                )}
                {sheet.type === "video" && (
                  <SectionedTab sheet={sheet} updateSheet={updateSheet} newRow={newVideoRow} />
                )}
                {sheet.type === "comms" && (
                  <SectionedTab sheet={sheet} updateSheet={updateSheet} newRow={newAudioRow} />
                )}
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Header & Staff Tab
// ============================================================
function HeaderStaffTab({ data, updateData, doc, setDoc, setDirty }: {
  data: DocumentData;
  updateData: (updater: (d: DocumentData) => DocumentData) => void;
  doc: TechsheetDoc;
  setDoc: (fn: (prev: TechsheetDoc | null) => TechsheetDoc | null) => void;
  setDirty: (v: boolean) => void;
}) {
  const h = data.header;
  const s = data.staff;

  const setHeader = (field: keyof HeaderData, value: string) =>
    updateData((d) => ({ ...d, header: { ...d.header, [field]: value } }));

  const setStaff = (field: keyof StaffData, value: string) =>
    updateData((d) => ({ ...d, staff: { ...d.staff, [field]: value } }));

  const setStaffArray = (field: keyof StaffData, index: number, value: string) =>
    updateData((d) => {
      const arr = [...(d.staff[field] as string[])];
      arr[index] = value;
      return { ...d, staff: { ...d.staff, [field]: arr } };
    });

  const addStaffEntry = (field: keyof StaffData) =>
    updateData((d) => ({
      ...d, staff: { ...d.staff, [field]: [...(d.staff[field] as string[]), ""] },
    }));

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <section>
        <h2 className="heading-section text-base mb-3">番組基本情報</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">番組名</label>
            <Input className="mt-1" value={h.programName} onChange={(e) => setHeader("programName", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">放送/配信先</label>
            <Input className="mt-1" value={h.broadcastType} onChange={(e) => setHeader("broadcastType", e.target.value)} placeholder="例: YouTube LIVE / テレビ東京" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">制作方式</label>
            <Input className="mt-1" value={h.productionFormat} onChange={(e) => setHeader("productionFormat", e.target.value)} placeholder="例: HD/ステレオ" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">使用スタジオ</label>
            <Input className="mt-1" value={h.studio} onChange={(e) => setHeader("studio", e.target.value)} placeholder="例: Aスタジオ" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">制作日</label>
            <Input className="mt-1" type="date" value={doc.production_date || ""} onChange={(e) => { setDoc((prev) => prev ? { ...prev, production_date: e.target.value } : prev); setDirty(true); }} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">バージョン</label>
            <Input className="mt-1" value={doc.version} onChange={(e) => { setDoc((prev) => prev ? { ...prev, version: e.target.value } : prev); setDirty(true); }} placeholder="Ver.1.0" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          <div>
            <label className="text-xs text-muted-foreground">回線概要</label>
            <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[3rem]" value={h.circuits} onChange={(e) => setHeader("circuits", e.target.value)} placeholder="回線構成の概要..." />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">VTR概要</label>
            <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[3rem]" value={h.vtr} onChange={(e) => setHeader("vtr", e.target.value)} placeholder="VTR運用の概要..." />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">出演者</label>
            <textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[3rem]" value={h.performers} onChange={(e) => setHeader("performers", e.target.value)} placeholder="MC、ゲスト等..." />
          </div>
        </div>
      </section>

      {/* Staff */}
      <section>
        <h2 className="heading-section text-base mb-3">スタッフ配置</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ["td", "TD"], ["sw", "SW"], ["p", "P"], ["ve", "VE"],
            ["mix", "MIX"], ["vtrOp", "VTR"], ["ld", "LD"], ["cg", "CG"],
            ["aux", "AUX"],
          ] as [keyof StaffData, string][]).map(([field, label]) => (
            <div key={field}>
              <label className="text-xs text-muted-foreground">{label}</label>
              <Input className="mt-1 text-sm" value={s[field] as string} onChange={(e) => setStaff(field, e.target.value)} />
            </div>
          ))}
        </div>

        {/* Array fields: D, CAM, AA, CA */}
        <div className="mt-4 space-y-3">
          {([
            ["d", "D (ディレクター)"],
            ["cam", "CAM (カメラ)"],
            ["aa", "AA (音声助手)"],
            ["ca", "CA (カメラ助手)"],
          ] as [keyof StaffData, string][]).map(([field, label]) => (
            <div key={field}>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Button variant="ghost" size="sm" className="h-ctl-1 px-1 text-xs" onClick={() => addStaffEntry(field)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {((s[field] as string[]) || []).map((_v, i) => (
                  <Input
                    key={i}
                    className="h-8 w-32 text-sm"
                    value={(s[field] as string[])[i]}
                    onChange={(e) => setStaffArray(field, i, e.target.value)}
                    placeholder={`${label.split("(")[0].trim()} ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Notes */}
      <section>
        <h2 className="heading-section text-base mb-3">備考</h2>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y min-h-[6rem]"
          value={data.notes}
          onChange={(e) => updateData((d) => ({ ...d, notes: e.target.value }))}
          placeholder="技術的な備考・申し送り事項..."
        />
      </section>
    </div>
  );
}

// ============================================================
// Camera Tab
// ============================================================
function CameraTab({ sheet, updateSheet }: { sheet: SheetData; updateSheet: (id: string, fn: (s: SheetData) => SheetData) => void }) {
  const rows = (sheet.rows || []) as CameraRow[];

  const addRow = () => updateSheet(sheet.id, (s) => ({
    ...s, rows: [...(s.rows || []) as CameraRow[], newCameraRow()],
  }));

  const deleteRow = (rid: string) => updateSheet(sheet.id, (s) => ({
    ...s, rows: ((s.rows || []) as CameraRow[]).filter((r) => r.id !== rid),
  }));

  const updateRow = (rid: string, field: keyof CameraRow, value: string) =>
    updateSheet(sheet.id, (s) => ({
      ...s, rows: ((s.rows || []) as CameraRow[]).map((r) => r.id === rid ? { ...r, [field]: value } : r),
    }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="heading-section text-base">カメラプラン</h2>
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={addRow}>
          <Plus className="h-3 w-3" /> カメラ追加
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="w-16 px-2 py-2 text-left text-xs font-medium text-muted-foreground">No.</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[128px]">カメラ機種</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[128px]">レンズ</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[96px]">担当者</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[160px]">設置場所</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[200px]">ケーブル/備考</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30 group">
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs w-14" value={row.number} onChange={(e) => updateRow(row.id, "number", e.target.value)} placeholder="1C" />
                </td>
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs" value={row.model} onChange={(e) => updateRow(row.id, "model", e.target.value)} placeholder="HDC-4300" />
                </td>
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs" value={row.lens} onChange={(e) => updateRow(row.id, "lens", e.target.value)} placeholder="UA107" />
                </td>
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs" value={row.operator} onChange={(e) => updateRow(row.id, "operator", e.target.value)} />
                </td>
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs" value={row.position} onChange={(e) => updateRow(row.id, "position", e.target.value)} />
                </td>
                <td className="px-2 py-1">
                  <Input className="h-7 text-xs" value={row.cable} onChange={(e) => updateRow(row.id, "cable", e.target.value)} />
                </td>
                <td className="px-1 py-1">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground group-hover:text-destructive" onClick={() => deleteRow(row.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                  「カメラ追加」でカメラを登録してください
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================
// Sectioned Tab (Audio / Video / Comms)
// ============================================================
function SectionedTab({ sheet, updateSheet, newRow }: {
  sheet: SheetData;
  updateSheet: (id: string, fn: (s: SheetData) => SheetData) => void;
  newRow: () => AudioRow;
}) {
  const sections = (sheet.sections || []) as AudioSection[];

  const addRowToSection = (secId: string) =>
    updateSheet(sheet.id, (s) => ({
      ...s,
      sections: ((s.sections || []) as AudioSection[]).map((sec) =>
        sec.id === secId ? { ...sec, rows: [...sec.rows, newRow()] } : sec
      ),
    }));

  const deleteRowFromSection = (secId: string, rowId: string) =>
    updateSheet(sheet.id, (s) => ({
      ...s,
      sections: ((s.sections || []) as AudioSection[]).map((sec) =>
        sec.id === secId ? { ...sec, rows: sec.rows.filter((r) => r.id !== rowId) } : sec
      ),
    }));

  const updateRowInSection = (secId: string, rowId: string, field: string, value: string) =>
    updateSheet(sheet.id, (s) => ({
      ...s,
      sections: ((s.sections || []) as AudioSection[]).map((sec) =>
        sec.id === secId
          ? { ...sec, rows: sec.rows.map((r) => r.id === rowId ? { ...r, [field]: value } : r) }
          : sec
      ),
    }));

  return (
    <div className="space-y-6">
      {sections.map((sec) => (
        <div key={sec.id}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{sec.label}</h3>
            <Button size="sm" variant="ghost" className="h-ctl-1 gap-1 text-xs" onClick={() => addRowToSection(sec.id)}>
              <Plus className="h-3 w-3" /> 追加
            </Button>
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[160px]">項目</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[300px]">詳細</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground min-w-[200px]">備考</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0 hover:bg-muted/30 group">
                    <td className="px-2 py-1">
                      <Input className="h-7 text-xs" value={row.item} onChange={(e) => updateRowInSection(sec.id, row.id, "item", e.target.value)} />
                    </td>
                    <td className="px-2 py-1">
                      <textarea
                        className="w-full min-h-[2rem] rounded border border-input bg-background px-2 py-1 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={row.detail}
                        onChange={(e) => updateRowInSection(sec.id, row.id, "detail", e.target.value)}
                        rows={1}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <Input className="h-7 text-xs" value={row.notes} onChange={(e) => updateRowInSection(sec.id, row.id, "notes", e.target.value)} />
                    </td>
                    <td className="px-1 py-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground group-hover:text-destructive" onClick={() => deleteRowFromSection(sec.id, row.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sec.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-muted-foreground text-xs">
                      「追加」で項目を登録
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
