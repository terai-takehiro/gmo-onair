/**
 * ConnectorPage — コネクタ管理 (機材一覧と同等の UI/UX)
 * equipment_connectors テーブルを CRUD する。
 * 種別タブ + 場所/メーカー/検索フィルター + 表/モバイルカード両ビュー。
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Plus, Search, Plug, Pencil, Trash2, MapPin,
  Upload, Download, Printer, SlidersHorizontal, ArrowUp, ArrowDown, RotateCcw, Edit3, Copy,
} from "lucide-react";
import { useRef } from "react";
import ConsumableExcelImportDialog from "@/components/ConsumableExcelImportDialog";

const COL_DEFS = [
  { key: "kind",              label: "種別",     default: true },
  { key: "location_name",     label: "設置場所", default: true },
  { key: "name",              label: "商品名",   default: true },
  { key: "manufacturer_name", label: "メーカー", default: true },
  { key: "model_number",      label: "型名",     default: true },
  { key: "quantity",          label: "個数",     default: true },
  { key: "storage_method",    label: "収納方法", default: true },
  { key: "notes",             label: "備考",     default: true },
] as const;
type ColKey = typeof COL_DEFS[number]["key"];
const STORAGE_VIS = "connector-visible-cols";
const STORAGE_ORDER = "connector-col-order";

const KINDS = [
  { code: "video",    label: "映像", color: "bg-violet-50 text-violet-700" },
  { code: "audio",    label: "音声", color: "bg-amber-50 text-amber-700" },
  { code: "network",  label: "NW",   color: "bg-cyan-50 text-cyan-700" },
  { code: "lighting", label: "照明", color: "bg-yellow-50 text-yellow-700" },
  { code: "power",    label: "電源", color: "bg-rose-50 text-rose-700" },
  { code: "other",    label: "その他", color: "bg-gray-100 text-gray-600" },
] as const;

type KindCode = typeof KINDS[number]["code"];

interface Connector {
  id: string;
  kind: KindCode;
  location_id: string | null;
  location_name?: string | null;
  name: string;
  manufacturer_id: string | null;
  manufacturer_name?: string | null;
  model_number: string | null;
  quantity: number;
  storage_method: string | null;
  notes: string | null;
  sort_order: number;
}

interface ConnectorForm {
  kind: KindCode;
  location_id: string;
  name: string;
  manufacturer_id: string;
  model_number: string;
  quantity: string;
  storage_method: string;
  notes: string;
}

const EMPTY_FORM: ConnectorForm = {
  kind: "video", location_id: "", name: "",
  manufacturer_id: "", model_number: "",
  quantity: "0", storage_method: "", notes: "",
};

function KindBadge({ code }: { code: KindCode }) {
  const k = KINDS.find((x) => x.code === code);
  if (!k) return null;
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${k.color}`}>
      {k.label}
    </span>
  );
}

export default function ConnectorPage() {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("equipment", "editor");
  const canDelete = hasPermission("equipment", "manager");

  const [filterKind, setFilterKind] = useState<"" | KindCode>("");
  const [filterLoc, setFilterLoc] = useState<string>("");
  const [filterMfr, setFilterMfr] = useState<string>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectorForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printLandscape, setPrintLandscape] = useState(false);
  const [printTitle, setPrintTitle] = useState("コネクタ一覧");

  // 表編集モード
  const [tableEditMode, setTableEditMode] = useState(false);
  const [tableEdits, setTableEdits] = useState<Record<string, Record<string, string>>>({});
  const inlinePatch = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      api.patch(`/equipment/connectors/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-connectors"] }),
  });
  const handleInlineChange = (id: string, field: string, value: string) => {
    setTableEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }));
  };
  const saveInlineRow = (id: string) => {
    const edits = tableEdits[id];
    if (!edits || Object.keys(edits).length === 0) return;
    inlinePatch.mutate({ id, data: edits });
    setTableEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  // 表示列ピッカー
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) {
        setColPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colPickerOpen]);

  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_VIS);
      if (saved) return new Set(JSON.parse(saved)) as Set<ColKey>;
    } catch { /* ignore */ }
    return new Set(COL_DEFS.filter((c) => c.default).map((c) => c.key)) as Set<ColKey>;
  });
  const toggleCol = (key: ColKey) => setVisibleCols((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    localStorage.setItem(STORAGE_VIS, JSON.stringify([...next]));
    return next;
  });

  const DEFAULT_COL_ORDER = COL_DEFS.map((c) => c.key) as ColKey[];
  const [colOrder, setColOrder] = useState<ColKey[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ORDER);
      if (saved) {
        const parsed: ColKey[] = JSON.parse(saved);
        const allKeys = COL_DEFS.map((c) => c.key) as ColKey[];
        return [...parsed.filter((k) => allKeys.includes(k)), ...allKeys.filter((k) => !parsed.includes(k))];
      }
    } catch { /* ignore */ }
    return DEFAULT_COL_ORDER;
  });
  const moveCol = (key: ColKey, dir: "up" | "down") => {
    setColOrder((prev) => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const next = [...prev];
      if (dir === "up" && idx > 0) [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      if (dir === "down" && idx < next.length - 1) [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      localStorage.setItem(STORAGE_ORDER, JSON.stringify(next));
      return next;
    });
  };
  const resetColSettings = () => {
    localStorage.removeItem(STORAGE_VIS);
    localStorage.removeItem(STORAGE_ORDER);
    setVisibleCols(new Set(COL_DEFS.filter((c) => c.default).map((c) => c.key)) as Set<ColKey>);
    setColOrder(DEFAULT_COL_ORDER);
  };

  const { data: connectorsRes, isLoading, error: listError } = useQuery({
    queryKey: ["equipment-connectors", filterKind, filterLoc, filterMfr, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterKind) params.kind = filterKind;
      if (filterLoc) params.location_id = filterLoc;
      if (filterMfr) params.manufacturer_id = filterMfr;
      if (debouncedSearch) params.search = debouncedSearch;
      return (await api.get("/equipment/connectors", { params })).data;
    },
  });
  const items: Connector[] = connectorsRes?.data ?? [];

  const { data: locationsData } = useQuery({
    queryKey: ["equipment-locations"],
    queryFn: async () => (await api.get("/equipment/locations")).data.data,
  });
  const { data: manufacturersData } = useQuery({
    queryKey: ["equipment-manufacturers"],
    queryFn: async () => (await api.get("/equipment/manufacturers")).data.data,
  });
  const locations: { id: string; name: string }[] = locationsData ?? [];
  const manufacturers: { id: string; name: string }[] = manufacturersData ?? [];

  const saveMutation = useMutation({
    mutationFn: (payload: ConnectorForm) => {
      const body = {
        kind: payload.kind,
        location_id: payload.location_id || null,
        name: payload.name.trim(),
        manufacturer_id: payload.manufacturer_id || null,
        model_number: payload.model_number || null,
        quantity: payload.quantity === "" ? 0 : Number(payload.quantity),
        storage_method: payload.storage_method || null,
        notes: payload.notes || null,
      };
      return editingId
        ? api.put(`/equipment/connectors/${editingId}`, body)
        : api.post("/equipment/connectors", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-connectors"] });
      setSaveError(null);
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || "保存に失敗しました");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/connectors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-connectors"] }),
  });

  const openNew = () => {
    setForm({ ...EMPTY_FORM, kind: filterKind || "video" });
    setEditingId(null);
    setIsCopyMode(false);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (it: Connector) => {
    setForm({
      kind: it.kind,
      location_id: it.location_id || "",
      name: it.name || "",
      manufacturer_id: it.manufacturer_id || "",
      model_number: it.model_number || "",
      quantity: String(it.quantity ?? 0),
      storage_method: it.storage_method || "",
      notes: it.notes || "",
    });
    setEditingId(it.id);
    setIsCopyMode(false);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openCopy = (it: Connector) => {
    setForm({
      kind: it.kind,
      location_id: it.location_id || "",
      name: it.name || "",
      manufacturer_id: it.manufacturer_id || "",
      model_number: it.model_number || "",
      quantity: "0",
      storage_method: it.storage_method || "",
      notes: it.notes || "",
    });
    setEditingId(null);
    setIsCopyMode(true);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleDelete = (it: Connector) => {
    if (!confirm(`「${it.name}」を削除しますか？`)) return;
    deleteMutation.mutate(it.id);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    saveMutation.mutate(form);
  };

  const totalQuantity = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0),
    [items],
  );

  const downloadExcel = async () => {
    const res = await api.get("/equipment/connectors/export-xlsx", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `コネクタ_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (printLandscape) document.body.classList.add("print-landscape");
    else document.body.classList.remove("print-landscape");
    setPrintDialogOpen(false);
    setTimeout(() => window.print(), 150);
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="heading-page text-xl lg:text-2xl">コネクタ管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} 種類 / 合計 {totalQuantity.toLocaleString()} 個
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />Excelインポート
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadExcel}>
            <Download className="h-4 w-4 mr-1" />Excel出力
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPrintDialogOpen(true)}>
            <Printer className="h-4 w-4 mr-1" />印刷
          </Button>
          {/* 表示列ピッカー */}
          <div className="relative" ref={colPickerRef}>
            <Button size="sm" variant={colPickerOpen ? "default" : "outline"} onClick={() => setColPickerOpen((v) => !v)}>
              <SlidersHorizontal className="h-4 w-4 mr-1" />表示列
            </Button>
            {colPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg p-2 w-56">
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">表示列</p>
                  <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5" onClick={resetColSettings}>
                    <RotateCcw className="h-2.5 w-2.5" />既定に戻す
                  </button>
                </div>
                {colOrder.map((key, idx) => {
                  const col = COL_DEFS.find((c) => c.key === key);
                  if (!col) return null;
                  return (
                    <div key={col.key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/60">
                      <input
                        type="checkbox"
                        id={`con-col-${col.key}`}
                        checked={visibleCols.has(col.key)}
                        onChange={() => toggleCol(col.key)}
                        className="h-4 w-4"
                      />
                      <label htmlFor={`con-col-${col.key}`} className="flex-1 cursor-pointer text-sm select-none">
                        {col.label}
                      </label>
                      <div className="flex gap-0.5">
                        <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === 0} onClick={() => moveCol(key, "up")}><ArrowUp className="h-3 w-3" /></button>
                        <button className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-20" disabled={idx === colOrder.length - 1} onClick={() => moveCol(key, "down")}><ArrowDown className="h-3 w-3" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {canEdit && (
            <Button
              size="sm"
              variant={tableEditMode ? "default" : "outline"}
              onClick={() => { setTableEditMode((v) => !v); setTableEdits({}); }}
            >
              <Edit3 className="h-4 w-4 mr-1" />{tableEditMode ? "編集完了" : "表編集"}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />コネクタ登録
            </Button>
          )}
        </div>
      </div>

      <ConsumableExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        endpoint="/equipment/connectors"
        resourceLabel="コネクタ"
        invalidateKey={["equipment-connectors"]}
        templateFileName="コネクタ_テンプレート.xlsx"
      />

      {/* 種別タブ */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {[{ code: "" as const, label: "全て" }, ...KINDS].map((t) => (
          <button
            key={t.code || "all"}
            onClick={() => setFilterKind(t.code as typeof filterKind)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filterKind === t.code
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 場所 / メーカー / 検索 */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 inline" /> 場所:</span>
          <Select value={filterLoc || "all"} onValueChange={(v) => setFilterLoc(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue placeholder="全て" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">メーカー:</span>
          <Select value={filterMfr || "all"} onValueChange={(v) => setFilterMfr(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-[160px] text-sm"><SelectValue placeholder="全て" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              {manufacturers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(filterLoc || filterMfr || filterKind) && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => { setFilterKind(""); setFilterLoc(""); setFilterMfr(""); }}
          >
            フィルターを解除
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative max-w-sm flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="商品名・型名・備考で検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : listError ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Plug className="h-12 w-12 opacity-20" />
          <p className="font-medium text-destructive">
            {(listError as { response?: { status?: number } })?.response?.status === 403
              ? "コネクタ管理へのアクセス権限がありません"
              : "データの取得に失敗しました"}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Plug className="h-12 w-12 opacity-20" />
          <p>コネクタが登録されていません</p>
        </div>
      ) : (
        <>
          {/* モバイル: カード */}
          <div className="md:hidden space-y-2 pb-4">
            {items.map((it) => (
              <div key={it.id} className="bg-card rounded-lg border border-border/60 shadow-sm overflow-hidden">
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <KindBadge code={it.kind} />
                    </div>
                    <span className="text-sm font-mono text-foreground">×{it.quantity}</span>
                  </div>
                  <p className="font-semibold text-sm leading-tight mb-0.5 truncate">{it.name}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate">{it.model_number || "–"}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground flex-wrap">
                    {it.manufacturer_name && <span>{it.manufacturer_name}</span>}
                    {it.manufacturer_name && it.location_name && <span className="opacity-30">|</span>}
                    {it.location_name && <span className="truncate">{it.location_name}</span>}
                  </div>
                  {(it.storage_method || it.notes) && (
                    <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                      {[it.storage_method, it.notes].filter(Boolean).join(" / ")}
                    </p>
                  )}
                  {(canEdit || canDelete) && (
                    <div className="flex justify-end gap-1 mt-1.5 -mb-1">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCopy(it)} aria-label="コピー">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(it)} aria-label="編集">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(it)} aria-label="削除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* PC: テーブル */}
          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-xl ring-1 ring-border/60 shadow-sm bg-card">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    {colOrder.filter((k) => visibleCols.has(k)).map((key) => {
                      const col = COL_DEFS.find((c) => c.key === key);
                      if (!col) return null;
                      const right = key === "quantity";
                      return <Th key={key} className={right ? "text-right" : ""}>{col.label}</Th>;
                    })}
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {items.map((it) => (
                    <tr key={it.id} className="group transition-colors hover:bg-accent/30">
                      {colOrder.filter((k) => visibleCols.has(k)).map((key) => {
                        const editVal = (f: string, cur: unknown) => tableEdits[it.id]?.[f] ?? (cur ?? "").toString();
                        const inlineInput = (f: string, cur: unknown, opts?: { type?: string; right?: boolean; mono?: boolean }) => (
                          <input
                            type={opts?.type || "text"}
                            value={editVal(f, cur)}
                            onChange={(e) => handleInlineChange(it.id, f, e.target.value)}
                            onBlur={() => saveInlineRow(it.id)}
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs ${opts?.right ? "text-right" : ""} ${opts?.mono ? "font-mono" : ""}`}
                          />
                        );
                        const inlineSelect = (f: string, cur: unknown, options: { value: string; label: string }[]) => (
                          <select
                            value={editVal(f, cur)}
                            onChange={(e) => { handleInlineChange(it.id, f, e.target.value); saveInlineRow(it.id); }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-transparent border-b border-primary/40 focus:border-primary focus:outline-none text-xs"
                          >
                            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        );
                        switch (key) {
                          case "kind":
                            return <Td key={key}>{tableEditMode
                              ? inlineSelect("kind", it.kind, KINDS.map((k) => ({ value: k.code, label: k.label })))
                              : <KindBadge code={it.kind} />}</Td>;
                          case "location_name":
                            return <Td key={key} className="text-muted-foreground">{tableEditMode
                              ? inlineSelect("location_id", it.location_id ?? "", [{ value: "", label: "—" }, ...locations.map((l) => ({ value: l.id, label: l.name }))])
                              : (it.location_name || "–")}</Td>;
                          case "name":
                            return <Td key={key} className="font-medium">{tableEditMode ? inlineInput("name", it.name) : it.name}</Td>;
                          case "manufacturer_name":
                            return <Td key={key} className="text-muted-foreground">{tableEditMode
                              ? inlineSelect("manufacturer_id", it.manufacturer_id ?? "", [{ value: "", label: "—" }, ...manufacturers.map((m) => ({ value: m.id, label: m.name }))])
                              : (it.manufacturer_name || "–")}</Td>;
                          case "model_number":
                            return <Td key={key} className="font-mono text-xs">{tableEditMode ? inlineInput("model_number", it.model_number, { mono: true }) : (it.model_number || "–")}</Td>;
                          case "quantity":
                            return <Td key={key} className="text-right font-mono">{tableEditMode ? inlineInput("quantity", it.quantity, { type: "number", right: true, mono: true }) : it.quantity}</Td>;
                          case "storage_method":
                            return <Td key={key} className="text-muted-foreground">{tableEditMode ? inlineInput("storage_method", it.storage_method) : (it.storage_method || "–")}</Td>;
                          case "notes":
                            return <Td key={key} className="text-muted-foreground max-w-[200px] truncate">{tableEditMode ? inlineInput("notes", it.notes) : (it.notes || "–")}</Td>;
                          default: return null;
                        }
                      })}
                      <Td className="text-right whitespace-nowrap">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCopy(it)} aria-label="コピー">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(it)} aria-label="編集">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(it)} aria-label="削除">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 登録/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "コネクタ編集" : isCopyMode ? "コネクタ登録 (コピー)" : "コネクタ登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>種別 *</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as KindCode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k.code} value={k.code}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>設置場所</Label>
                <Select value={form.location_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, location_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>商品名 *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="BNCコネクタ オス" autoFocus />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>メーカー</Label>
                <Select value={form.manufacturer_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, manufacturer_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {manufacturers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>型名</Label>
                <Input value={form.model_number} onChange={(e) => setForm((f) => ({ ...f, model_number: e.target.value }))} placeholder="BCP-B25HD" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>所有個数</Label>
                <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>収納方法</Label>
                <Input value={form.storage_method} onChange={(e) => setForm((f) => ({ ...f, storage_method: e.target.value }))} placeholder="パーツケース B-3" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>備考</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            {saveError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">{saveError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handleSubmit} disabled={!form.name.trim() || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "更新" : "追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 印刷プレビュー */}
      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>印刷プレビュー</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>タイトル</Label>
              <Input value={printTitle} onChange={(e) => setPrintTitle(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="connector-print-landscape"
                type="checkbox"
                checked={printLandscape}
                onChange={(e) => setPrintLandscape(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="connector-print-landscape" className="cursor-pointer">横向き (A4 ランドスケープ)</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              現在表示中の {items.length} 件を印刷します。フィルターとソートが適用されます。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>キャンセル</Button>
              <Button onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />印刷
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 印刷時のみ表示 */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold mb-2">{printTitle}</h1>
        <p className="text-xs mb-2">
          {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
          {" / "}{items.length} 件
        </p>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="border px-2 py-1 text-left">種別</th>
              <th className="border px-2 py-1 text-left">設置場所</th>
              <th className="border px-2 py-1 text-left">商品名</th>
              <th className="border px-2 py-1 text-left">メーカー</th>
              <th className="border px-2 py-1 text-left">型名</th>
              <th className="border px-2 py-1 text-right">個数</th>
              <th className="border px-2 py-1 text-left">収納方法</th>
              <th className="border px-2 py-1 text-left">備考</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const k = KINDS.find((x) => x.code === it.kind);
              return (
                <tr key={it.id} className="border-b">
                  <td className="border px-2 py-1">{k?.label || it.kind}</td>
                  <td className="border px-2 py-1">{it.location_name || ""}</td>
                  <td className="border px-2 py-1">{it.name}</td>
                  <td className="border px-2 py-1">{it.manufacturer_name || ""}</td>
                  <td className="border px-2 py-1">{it.model_number || ""}</td>
                  <td className="border px-2 py-1 text-right">{it.quantity}</td>
                  <td className="border px-2 py-1">{it.storage_method || ""}</td>
                  <td className="border px-2 py-1">{it.notes || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
