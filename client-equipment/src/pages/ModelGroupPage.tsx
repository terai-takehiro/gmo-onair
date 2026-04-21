import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ChevronDown, ChevronRight, Package } from "lucide-react";
import { TYPE_CODES, CONDITION_LABELS } from "@/lib/constants";

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

const SECTION_OPTIONS = [
  { value: "rental", label: "貸出機材" },
  { value: "equipment", label: "設備機材" },
  { value: "", label: "全て" },
];

interface Unit {
  id: string;
  eq_code: string;
  unit_number: number | null;
  serial_number: string | null;
  status: string;
  condition: string;
  location_name: string | null;
  location_detail: string | null;
}

interface ModelGroup {
  name: string;
  model_number: string;
  manufacturer_name: string | null;
  equipment_type_code: string;
  total_count: number;
  units: Unit[];
}

export default function ModelGroupPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [section, setSection] = useState("rental");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["model-groups", search, typeFilter, section],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (search) params.q = search;
      if (typeFilter) params.type = typeFilter;
      if (section) params.section = section;
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

  // フィルタ変更時に展開状態リセット
  useEffect(() => { setExpandedKeys(new Set()); }, [search, typeFilter, section]);

  const isAllExpanded = groups.length > 0 && groups.every(g => expandedKeys.has(groupKey(g)));

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedKeys(new Set());
    } else {
      setExpandedKeys(new Set(groups.map(groupKey)));
    }
  };

  const typeLabel = (code: string) => TYPE_CODES.find(t => t.code === code)?.label ?? code;

  // Count stats
  const totalUnits = useMemo(() => groups.reduce((s, g) => s + g.total_count, 0), [groups]);
  const inRepairCount = useMemo(() =>
    groups.reduce((s, g) => s + g.units.filter(u => u.status === "in_repair").length, 0), [groups]);

  return (
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">型番別一覧</h1>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {groups.length} 型番 / {totalUnits} 台
            {inRepairCount > 0 && (
              <span className="ml-2 text-yellow-700">（修理中 {inRepairCount} 台）</span>
            )}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Section tabs */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          {SECTION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`px-3 py-1.5 transition-colors ${section === opt.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setSection(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名・型番・メーカーで検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Type filter */}
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

        {/* Expand all toggle */}
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
        <div className="space-y-2">
          {groups.map(g => {
            const key = groupKey(g);
            const expanded = isExpanded(g);
            const activeCount = g.units.filter(u => u.status === "active").length;
            const repairCount = g.units.filter(u => u.status === "in_repair").length;

            return (
              <div key={key} className="rounded-lg border bg-card overflow-hidden">
                {/* Group header */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => toggleGroup(g)}
                >
                  {expanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{g.name}</span>
                      {g.model_number && (
                        <span className="text-sm font-mono text-muted-foreground">{g.model_number}</span>
                      )}
                    </div>
                    {g.manufacturer_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">{g.manufacturer_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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

                {/* Unit rows */}
                {expanded && (
                  <div className="border-t">
                    {/* Desktop table */}
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
                            <tr
                              key={u.id}
                              className="border-t cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => navigate(`/equipment/items/${u.id}`)}
                            >
                              <td className="px-4 py-2.5 font-mono text-sm">
                                {u.unit_number != null ? `No.${u.unit_number}` : `#${i + 1}`}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{u.eq_code}</td>
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
                              <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                                {u.serial_number || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile card list */}
                    <div className="sm:hidden divide-y">
                      {g.units.map((u, i) => (
                        <div
                          key={u.id}
                          className="px-4 py-3 cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                          onClick={() => navigate(`/equipment/items/${u.id}`)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-medium">
                              {u.unit_number != null ? `No.${u.unit_number}` : `#${i + 1}`}
                            </span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[u.status] ?? "bg-gray-100 text-gray-700"}`}>
                              {STATUS_LABELS[u.status] ?? u.status}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground font-mono">{u.eq_code}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[u.location_name, u.location_detail].filter(Boolean).join(" / ") || "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
