/**
 * CablePage — ケーブル管理 (機材一覧と同等の UI/UX)
 * equipment_cables テーブルを CRUD する。
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
  Loader2, Plus, Search, Cable, Pencil, Trash2, MapPin,
} from "lucide-react";

const KINDS = [
  { code: "video",    label: "映像", color: "bg-violet-50 text-violet-700" },
  { code: "audio",    label: "音声", color: "bg-amber-50 text-amber-700" },
  { code: "network",  label: "NW",   color: "bg-cyan-50 text-cyan-700" },
  { code: "lighting", label: "照明", color: "bg-yellow-50 text-yellow-700" },
  { code: "power",    label: "電源", color: "bg-rose-50 text-rose-700" },
  { code: "other",    label: "その他", color: "bg-gray-100 text-gray-600" },
] as const;

type KindCode = typeof KINDS[number]["code"];

interface Cable {
  id: string;
  kind: KindCode;
  location_id: string | null;
  location_name?: string | null;
  name: string;
  manufacturer_id: string | null;
  manufacturer_name?: string | null;
  model_number: string | null;
  length_m: number | string | null;
  color: string | null;
  quantity: number;
  storage_method: string | null;
  notes: string | null;
  sort_order: number;
}

interface CableForm {
  kind: KindCode;
  location_id: string;
  name: string;
  manufacturer_id: string;
  model_number: string;
  length_m: string;
  color: string;
  quantity: string;
  storage_method: string;
  notes: string;
}

const EMPTY_FORM: CableForm = {
  kind: "video", location_id: "", name: "",
  manufacturer_id: "", model_number: "", length_m: "",
  color: "", quantity: "0", storage_method: "", notes: "",
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

export default function CablePage() {
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
  const [form, setForm] = useState<CableForm>(EMPTY_FORM);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: cablesRes, isLoading, error: listError } = useQuery({
    queryKey: ["equipment-cables", filterKind, filterLoc, filterMfr, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterKind) params.kind = filterKind;
      if (filterLoc) params.location_id = filterLoc;
      if (filterMfr) params.manufacturer_id = filterMfr;
      if (debouncedSearch) params.search = debouncedSearch;
      return (await api.get("/equipment/cables", { params })).data;
    },
  });
  const items: Cable[] = cablesRes?.data ?? [];

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
    mutationFn: (payload: CableForm) => {
      const body = {
        kind: payload.kind,
        location_id: payload.location_id || null,
        name: payload.name.trim(),
        manufacturer_id: payload.manufacturer_id || null,
        model_number: payload.model_number || null,
        length_m: payload.length_m === "" ? null : Number(payload.length_m),
        color: payload.color || null,
        quantity: payload.quantity === "" ? 0 : Number(payload.quantity),
        storage_method: payload.storage_method || null,
        notes: payload.notes || null,
      };
      return editingId
        ? api.put(`/equipment/cables/${editingId}`, body)
        : api.post("/equipment/cables", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-cables"] });
      setSaveError(null);
      setDialogOpen(false);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || "保存に失敗しました");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/cables/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment-cables"] }),
  });

  const openNew = () => {
    setForm({ ...EMPTY_FORM, kind: filterKind || "video" });
    setEditingId(null);
    setSaveError(null);
    setDialogOpen(true);
  };

  const openEdit = (it: Cable) => {
    setForm({
      kind: it.kind,
      location_id: it.location_id || "",
      name: it.name || "",
      manufacturer_id: it.manufacturer_id || "",
      model_number: it.model_number || "",
      length_m: it.length_m == null ? "" : String(it.length_m),
      color: it.color || "",
      quantity: String(it.quantity ?? 0),
      storage_method: it.storage_method || "",
      notes: it.notes || "",
    });
    setEditingId(it.id);
    setSaveError(null);
    setDialogOpen(true);
  };

  const handleDelete = (it: Cable) => {
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

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="heading-page text-xl lg:text-2xl">ケーブル管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} 種類 / 合計 {totalQuantity.toLocaleString()} 本
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />ケーブル登録
          </Button>
        )}
      </div>

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
          <Cable className="h-12 w-12 opacity-20" />
          <p className="font-medium text-destructive">
            {(listError as { response?: { status?: number } })?.response?.status === 403
              ? "ケーブル管理へのアクセス権限がありません"
              : "データの取得に失敗しました"}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Cable className="h-12 w-12 opacity-20" />
          <p>ケーブルが登録されていません</p>
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
                      {it.color && <span className="text-[11px] text-muted-foreground">●{it.color}</span>}
                    </div>
                    <span className="text-sm font-mono text-foreground">×{it.quantity}</span>
                  </div>
                  <p className="font-semibold text-sm leading-tight mb-0.5 truncate">{it.name}</p>
                  <p className="font-mono text-xs text-muted-foreground truncate">
                    {it.model_number || "–"}
                    {it.length_m != null && it.length_m !== "" ? ` / ${it.length_m}m` : ""}
                  </p>
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
                    <Th>種別</Th>
                    <Th>設置場所</Th>
                    <Th>商品名</Th>
                    <Th>メーカー</Th>
                    <Th>型名</Th>
                    <Th className="text-right">m</Th>
                    <Th>色</Th>
                    <Th className="text-right">本数</Th>
                    <Th>収納方法</Th>
                    <Th>備考</Th>
                    <Th className="text-right">操作</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {items.map((it) => (
                    <tr key={it.id} className="group transition-colors hover:bg-accent/30">
                      <Td><KindBadge code={it.kind} /></Td>
                      <Td className="text-muted-foreground">{it.location_name || "–"}</Td>
                      <Td className="font-medium">{it.name}</Td>
                      <Td className="text-muted-foreground">{it.manufacturer_name || "–"}</Td>
                      <Td className="font-mono text-xs">{it.model_number || "–"}</Td>
                      <Td className="text-right font-mono">{it.length_m != null && it.length_m !== "" ? `${it.length_m}` : "–"}</Td>
                      <Td>{it.color || "–"}</Td>
                      <Td className="text-right font-mono">{it.quantity}</Td>
                      <Td className="text-muted-foreground">{it.storage_method || "–"}</Td>
                      <Td className="text-muted-foreground max-w-[200px] truncate">{it.notes || "–"}</Td>
                      <Td className="text-right whitespace-nowrap">
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
            <DialogTitle>{editingId ? "ケーブル編集" : "ケーブル登録"}</DialogTitle>
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
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="HDMIケーブル 3m" autoFocus />
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
                <Input value={form.model_number} onChange={(e) => setForm((f) => ({ ...f, model_number: e.target.value }))} placeholder="HDM03" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>メートル数</Label>
                <Input type="number" step="0.1" min="0" value={form.length_m} onChange={(e) => setForm((f) => ({ ...f, length_m: e.target.value }))} placeholder="3" />
              </div>
              <div className="space-y-1">
                <Label>色</Label>
                <Input value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} placeholder="黒" />
              </div>
              <div className="space-y-1">
                <Label>所有本数</Label>
                <Input type="number" min="0" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>収納方法</Label>
              <Input value={form.storage_method} onChange={(e) => setForm((f) => ({ ...f, storage_method: e.target.value }))} placeholder="ケーブルバスケット A-1" />
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
