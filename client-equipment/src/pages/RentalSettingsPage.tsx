import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, Settings } from "lucide-react";
import { TYPE_CODES } from "@/lib/constants";
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

interface RentalItem {
  id: string;
  name: string;
  model_number: string | null;
  unit_number: number | null;
  eq_code: string;
  equipment_type_code: string;
  equipment_section: string | null;
  status: string;
  is_rental_listed: boolean;
  manufacturer_name: string | null;
  location_name: string | null;
}

export default function RentalSettingsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["rental-settings", debouncedSearch, typeFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.q = debouncedSearch;
      if (typeFilter) params.type = typeFilter;
      return (await api.get("/equipment/rental-settings", { params })).data;
    },
    staleTime: 10_000,
  });

  const items: RentalItem[] = data?.data ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_rental_listed }: { id: string; is_rental_listed: boolean }) =>
      api.put(`/equipment/rental-settings/${id}`, { is_rental_listed }),
    onMutate: async ({ id, is_rental_listed }) => {
      await qc.cancelQueries({ queryKey: ["rental-settings"] });
      const prev = qc.getQueryData<{ data: RentalItem[] }>(["rental-settings", debouncedSearch, typeFilter]);
      qc.setQueryData(["rental-settings", debouncedSearch, typeFilter], (old: any) => ({
        ...old,
        data: old?.data?.map((item: RentalItem) =>
          item.id === id ? { ...item, is_rental_listed } : item
        ),
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["rental-settings", debouncedSearch, typeFilter], ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["rental-settings"] });
      qc.invalidateQueries({ queryKey: ["model-groups"] });
    },
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout((handleSearchChange as any)._timer);
    (handleSearchChange as any)._timer = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const typeLabel = (code: string) => TYPE_CODES.find(t => t.code === code)?.label ?? code;

  const listedCount = useMemo(() => items.filter(i => i.is_rental_listed).length, [items]);

  return (
    <div className="space-y-4 p-3 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <PageTitle>貸出機材設定</PageTitle>
        </div>
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {items.length} 台中 <span className="text-primary font-medium">{listedCount} 台</span> を貸出一覧に表示
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground border rounded-lg px-4 py-3 bg-muted/30">
        チェックを入れた機材が「貸出機材一覧」と「貸出管理」に表示されます。
      </p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="商品名・型番・メーカーで検索..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
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
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Settings className="h-12 w-12 opacity-30" />
          <p>条件に一致する機材がありません</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground w-12">表示</th>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">機材名</th>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground w-32">型番</th>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">No./ID</th>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground w-20">種別</th>
                  <th className="px-4 py-2.5 text-left font-medium text-xs text-muted-foreground">設置場所</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-center">
                      <Switch
                        checked={item.is_rental_listed}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: item.id, is_rental_listed: !!v })}
                        disabled={toggleMutation.isPending}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{item.name}</div>
                      {item.manufacturer_name && (
                        <div className="text-xs text-muted-foreground">{item.manufacturer_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.model_number || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.unit_number != null ? `No.${item.unit_number}` : item.eq_code}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-xs">{typeLabel(item.equipment_type_code)}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {item.location_name || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="sm:hidden space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className="rounded-lg border bg-card p-3 flex items-start gap-3"
              >
                <Switch
                  checked={item.is_rental_listed}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: item.id, is_rental_listed: !!v })}
                  disabled={toggleMutation.isPending}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.name}</span>
                    {item.unit_number != null && (
                      <span className="text-xs text-muted-foreground">No.{item.unit_number}</span>
                    )}
                    <Badge variant="outline" className="text-xs">{typeLabel(item.equipment_type_code)}</Badge>
                  </div>
                  {item.model_number && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.model_number}</p>
                  )}
                  {item.location_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.location_name}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
