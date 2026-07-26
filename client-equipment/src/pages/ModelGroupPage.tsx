import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2, Search, ChevronDown, ChevronRight, Package,
  Pencil, Settings2, Plus, Trash2, ArrowUp, ArrowDown, Check, X,
} from "lucide-react";
import { TYPE_CODES, CONDITION_LABELS } from "@/lib/constants";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

const STATUS_LABELS: Record<string, string> = {
  active: "稼働中", in_repair: "修理中", retired: "休止", disposed: "廃棄", lost: "紛失",
};
const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  in_repair: "bg-yellow-100 text-yellow-800",
  retired: "bg-gray-100 text-gray-700",
  disposed: "bg-red-100 text-red-700",
  lost: "bg-red-100 text-red-700",
};

interface ChildItem {
  id: string;
  eq_code: string;
  name: string;
  unit_number: number | null;
  status: string;
}

interface Unit {
  id: string;
  eq_code: string;
  unit_number: number | null;
  serial_number: string | null;
  status: string;
  condition: string;
  location_name: string | null;
  location_detail: string | null;
  rental_display_name: string | null;
  children: ChildItem[];
}

interface ModelGroup {
  name: string;
  model_number: string;
  manufacturer_name: string | null;
  equipment_type_code: string;
  rental_category_id: string | null;
  rental_category_name: string | null;
  rental_category_sort_order: number | null;
  rental_display_name: string | null;
  total_count: number;
  units: Unit[];
}

interface RentalCategory {
  id: string;
  name: string;
  sort_order: number;
}

interface CategorySection {
  id: string | null;
  name: string;
  sort_order: number;
  groups: ModelGroup[];
}

// ─── カテゴリ管理ダイアログ ────────────────────────────────────────────
function CategoryManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<RentalCategory[]>({
    queryKey: ["rental-categories"],
    queryFn: async () => (await api.get("/equipment/rental-categories")).data.data,
    enabled: open,
  });
  const categories: RentalCategory[] = data ?? [];

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post("/equipment/rental-categories", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rental-categories"] }); setNewName(""); newInputRef.current?.focus(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/equipment/rental-categories/${id}`, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rental-categories"] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/rental-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-categories"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) =>
      api.put("/equipment/rental-categories/reorder", { order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-categories"] }),
  });

  const move = (idx: number, dir: "up" | "down") => {
    const list = [...categories];
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    reorderMutation.mutate(list.map((c, i) => ({ id: c.id, sort_order: i })));
  };

  const confirmEdit = () => {
    if (editingId && editingName.trim()) updateMutation.mutate({ id: editingId, name: editingName.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>貸出カテゴリ管理</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          貸出機材一覧でグループ分けするカテゴリを管理します。↑↓で並び順を変更できます。
        </p>

        {/* 追加フォーム */}
        <div className="flex gap-2">
          <Input
            ref={newInputRef}
            placeholder="新しいカテゴリ名"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim()); }}
            className="flex-1 h-8 text-sm"
          />
          <Button
            size="sm"
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newName.trim())}
            className="h-8"
          >
            {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            追加
          </Button>
        </div>

        {/* リスト */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : categories.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">カテゴリがありません</p>
          ) : (
            <div className="space-y-1">
              {categories.map((cat, idx) => (
                <div key={cat.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/40 border">
                  {/* 並び替え */}
                  <div className="flex flex-col shrink-0">
                    <button className="p-0.5 rounded hover:bg-muted disabled:opacity-30" disabled={idx === 0 || reorderMutation.isPending} onClick={() => move(idx, "up")}><ArrowUp className="h-2.5 w-2.5" /></button>
                    <button className="p-0.5 rounded hover:bg-muted disabled:opacity-30" disabled={idx === categories.length - 1 || reorderMutation.isPending} onClick={() => move(idx, "down")}><ArrowDown className="h-2.5 w-2.5" /></button>
                  </div>

                  {/* 名前/編集 */}
                  {editingId === cat.id ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setEditingId(null); }}
                        className="h-6 text-sm flex-1"
                        autoFocus
                      />
                      <button className="p-1 text-green-600 hover:bg-muted rounded" onClick={confirmEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      </button>
                      <button className="p-1 text-muted-foreground hover:bg-muted rounded" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium truncate">{cat.name}</span>
                      <button className="p-1 rounded hover:bg-muted text-muted-foreground" onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }} title="名前を変更"><Pencil className="h-3 w-3" /></button>
                      <button
                        className="p-1 rounded hover:bg-muted text-destructive"
                        onClick={() => { if (confirm(`「${cat.name}」を削除しますか？\n割り当て済みの機材のカテゴリは解除されます。`)) deleteMutation.mutate(cat.id); }}
                        title="削除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose}>閉じる</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── メインページ ─────────────────────────────────────────────────────
export default function ModelGroupPage({ embedded }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  // カテゴリ管理ダイアログ
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

  // 貸出設定ダイアログ（グループ単位）
  const [editGroup, setEditGroup] = useState<ModelGroup | null>(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");

  const { data: categoriesData } = useQuery<RentalCategory[]>({
    queryKey: ["rental-categories"],
    queryFn: async () => (await api.get("/equipment/rental-categories")).data.data,
    staleTime: 60_000,
  });
  const allCategories: RentalCategory[] = categoriesData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["model-groups", search, typeFilter, categoryFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.q = search;
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      return (await api.get("/equipment/model-groups", { params })).data;
    },
    staleTime: 30_000,
  });

  const groups: ModelGroup[] = data?.data ?? [];

  const groupKey = (g: ModelGroup) => `${g.name}::${g.model_number}::${g.equipment_type_code}`;

  const isExpanded = (g: ModelGroup) => expandedKeys.has(groupKey(g));

  const toggleGroup = (g: ModelGroup) => {
    const key = groupKey(g);
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => { setExpandedKeys(new Set()); }, [search, typeFilter, categoryFilter]);

  const allGroupKeys = useMemo(() => groups.map(groupKey), [groups]);
  const isAllExpanded = groups.length > 0 && groups.every(g => expandedKeys.has(groupKey(g)));
  const toggleAll = () => {
    if (isAllExpanded) setExpandedKeys(new Set());
    else setExpandedKeys(new Set(allGroupKeys));
  };

  const typeLabel = (code: string) => TYPE_CODES.find(t => t.code === code)?.label ?? code;

  const totalUnits = useMemo(() => groups.reduce((s, g) => s + g.total_count, 0), [groups]);
  const inRepairCount = useMemo(() =>
    groups.reduce((s, g) => s + g.units.filter(u => u.status === "in_repair").length, 0), [groups]);

  const sections = useMemo<CategorySection[]>(() => {
    if (categoryFilter) {
      const secName = categoryFilter === "_none"
        ? "カテゴリなし"
        : (allCategories.find(c => c.id === categoryFilter)?.name ?? "");
      return [{ id: categoryFilter === "_none" ? null : categoryFilter, name: secName, sort_order: 0, groups }];
    }
    const map = new Map<string, CategorySection>();
    for (const g of groups) {
      const key = g.rental_category_id ?? "_none";
      if (!map.has(key)) {
        map.set(key, {
          id: g.rental_category_id,
          name: g.rental_category_name ?? "カテゴリなし",
          sort_order: g.rental_category_sort_order ?? 9999,
          groups: [],
        });
      }
      map.get(key)!.groups.push(g);
    }
    return Array.from(map.values()).sort((a, b) => a.sort_order - b.sort_order);
  }, [groups, categoryFilter, allCategories]);

  const showSectionHeaders = !categoryFilter && sections.length > 1;

  // 貸出設定保存
  const saveMutation = useMutation({
    mutationFn: ({ ids, rental_category_id, rental_display_name }: {
      ids: string[]; rental_category_id: string | null; rental_display_name: string | null;
    }) => api.put("/equipment/items/batch-rental", { ids, rental_category_id, rental_display_name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["model-groups"] });
      setEditGroup(null);
    },
  });

  const openEdit = (g: ModelGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditGroup(g);
    setEditCategoryId(g.rental_category_id ?? "");
    setEditDisplayName(g.rental_display_name ?? "");
  };

  const handleSave = () => {
    if (!editGroup) return;
    saveMutation.mutate({
      ids: editGroup.units.map(u => u.id),
      rental_category_id: editCategoryId || null,
      rental_display_name: editDisplayName || null,
    });
  };

  return (
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <PageTitle className={embedded ? "hidden" : undefined}>貸出機材一覧</PageTitle>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <p className="text-sm text-muted-foreground">
              {groups.length} 型番 / {totalUnits} 台
              {inRepairCount > 0 && (
                <span className="ml-2 text-yellow-700">（修理中 {inRepairCount} 台）</span>
              )}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={() => setCategoryManagerOpen(true)}>
            <Settings2 className="h-3.5 w-3.5 mr-1" />
            カテゴリ管理
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名・型番・メーカーで検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {allCategories.length > 0 && (
          <Select value={categoryFilter || "_all"} onValueChange={v => setCategoryFilter(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全カテゴリ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">全カテゴリ</SelectItem>
              {allCategories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
              <SelectItem value="_none">カテゴリなし</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter || "_all"} onValueChange={v => setTypeFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="全種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">全種別</SelectItem>
            {TYPE_CODES.map(t => (
              <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {groups.length > 0 && (
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {isAllExpanded ? "全て折りたたむ" : "全て展開"}
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Package className="h-12 w-12 opacity-30" />
          <p>条件に一致する機材がありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map(section => (
            <div key={section.id ?? "_none"}>
              {showSectionHeaders && (
                <div className="flex items-center gap-3 py-1 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap px-1">
                    {section.name}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground shrink-0">
                    {section.groups.length} 型番 / {section.groups.reduce((s, g) => s + g.total_count, 0)} 台
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {section.groups.map(g => {
                  const key = groupKey(g);
                  const expanded = isExpanded(g);
                  const activeCount = g.units.filter(u => u.status === "active").length;
                  const repairCount = g.units.filter(u => u.status === "in_repair").length;
                  const displayName = g.rental_display_name || g.name;
                  const hasCustomName = !!g.rental_display_name && g.rental_display_name !== g.name;

                  return (
                    <div key={key} className="rounded-lg border bg-card overflow-hidden">
                      {/* Group header */}
                      <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors">
                        <button
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                          onClick={() => toggleGroup(g)}
                        >
                          {expanded
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          }
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">{displayName}</span>
                              {hasCustomName && (
                                <span className="text-xs text-muted-foreground">({g.name})</span>
                              )}
                              {g.model_number && (
                                <span className="text-sm text-muted-foreground">{g.model_number}</span>
                              )}
                            </div>
                            {g.manufacturer_name && (
                              <p className="text-xs text-muted-foreground mt-0.5">{g.manufacturer_name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!showSectionHeaders && g.rental_category_name && (
                              <Badge variant="secondary" className="text-xs">{g.rental_category_name}</Badge>
                            )}
                            <Badge variant="outline" className="text-xs">{typeLabel(g.equipment_type_code)}</Badge>
                            <span className="text-sm font-medium">{g.total_count} 台</span>
                            {repairCount > 0 && (
                              <Badge className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">修理中 {repairCount}</Badge>
                            )}
                            {activeCount === g.total_count && g.total_count > 0 && (
                              <Badge className="text-xs bg-green-100 text-green-800 border-green-300">全台稼働</Badge>
                            )}
                          </div>
                        </button>

                        {/* 設定ボタン */}
                        <button
                          className="shrink-0 p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => openEdit(g, e)}
                          title="カテゴリ・表示名を設定"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Unit rows */}
                      {expanded && (
                        <div className="border-t">
                          <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground w-14">No.</th>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground">ID</th>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground w-24">ステータス</th>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground w-24">状態</th>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground">設置場所</th>
                                  <th className="px-4 py-2 text-left font-medium text-xs text-muted-foreground w-32">シリアル番号</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.units.map((u, i) => (
                                  <>
                                  <tr
                                    key={u.id}
                                    className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => navigate(`/equipment/items/${u.id}`)}
                                  >
                                    <td className="px-4 py-2.5 text-sm">
                                      {u.unit_number != null ? `No.${u.unit_number}` : `#${i + 1}`}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{u.eq_code}</td>
                                    <td className="px-4 py-2.5">
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[u.status] ?? "bg-gray-100 text-gray-700"}`}>
                                        {STATUS_LABELS[u.status] ?? u.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {CONDITION_LABELS[u.condition] ?? u.condition ?? "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {[u.location_name, u.location_detail].filter(Boolean).join(" / ") || "—"}
                                    </td>
                                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                                      {u.serial_number || "—"}
                                    </td>
                                  </tr>
                                  {(u.children?.length ?? 0) > 0 && (
                                    <tr key={`${u.id}-children`} className="bg-muted/30">
                                      <td colSpan={6} className="px-6 py-1.5">
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                                          {u.children.map(c => c?.id && (
                                            <span key={c.id} className="text-xs text-muted-foreground cursor-pointer hover:text-foreground" onClick={(e) => { e.stopPropagation(); navigate(`/equipment/items/${c.id}`); }}>
                                              ↳ {c.name ?? "?"}{c.unit_number != null ? ` No.${c.unit_number}` : ""}
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  </>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="sm:hidden divide-y">
                            {g.units.map((u, i) => (
                              <div
                                key={u.id}
                                className="px-4 py-3 cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                                onClick={() => navigate(`/equipment/items/${u.id}`)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className=" text-sm font-medium">
                                    {u.unit_number != null ? `No.${u.unit_number}` : `#${i + 1}`}
                                  </span>
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[u.status] ?? "bg-gray-100 text-gray-700"}`}>
                                    {STATUS_LABELS[u.status] ?? u.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground ">{u.eq_code}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {[u.location_name, u.location_detail].filter(Boolean).join(" / ") || "—"}
                                </p>
                                {(u.children?.length ?? 0) > 0 && (
                                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                                    {u.children.map(c => c?.id && (
                                      <span key={c.id} className="text-xs text-muted-foreground/70">
                                        ↳ {c.name ?? "?"}{c.unit_number != null ? ` No.${c.unit_number}` : ""}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* カテゴリ管理ダイアログ */}
      <CategoryManagerDialog
        open={categoryManagerOpen}
        onClose={() => { setCategoryManagerOpen(false); qc.invalidateQueries({ queryKey: ["model-groups"] }); }}
      />

      {/* 貸出設定ダイアログ（グループ単位） */}
      <Dialog open={!!editGroup} onOpenChange={(open) => { if (!open) setEditGroup(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>貸出設定</DialogTitle>
          </DialogHeader>
          {editGroup && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <p className="font-medium truncate">{editGroup.name}</p>
                {editGroup.model_number && (
                  <p className="text-xs text-muted-foreground ">{editGroup.model_number}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{editGroup.total_count} 台に一括適用されます</p>
              </div>

              <div className="space-y-1">
                <Label>貸出カテゴリ</Label>
                <Select
                  value={editCategoryId || "_none"}
                  onValueChange={v => setEditCategoryId(v === "_none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="なし" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">なし</SelectItem>
                    {allCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>貸出表示名</Label>
                <Input
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  placeholder={editGroup.name + "（空欄なら商品名を使用）"}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setEditGroup(null)}>
                  キャンセル
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  保存
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
