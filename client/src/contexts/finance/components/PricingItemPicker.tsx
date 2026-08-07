import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, Link2, Check } from "lucide-react";
import { LocationPicker } from "@/contexts/sales/pages/pricing/LocationPicker";

export interface PickedPricingItem {
  pricing_item_id: string;
  name: string;
  sub_label: string | null;
  unit_price: number;
  calc_type: string;
}

interface PricingItemPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerType: "internal" | "external";
  onSelect: (item: PickedPricingItem) => void;
  /** 案件が分かれば、その予約から料金表の場所を決める (v4 大③) */
  projectId?: string | null;
}

interface PricingItem {
  id: string;
  name: string;
  sub_label: string | null;
  unit_price: number | null;
  group_price: number | null;
  calc_type: string;
  sort_order: number;
}

interface PricingCategory {
  id: string;
  name: string;
  sort_order: number;
  items?: PricingItem[];
}

export default function PricingItemPicker({
  open,
  onOpenChange,
  customerType,
  onSelect,
  projectId,
}: PricingItemPickerProps) {
  const [search, setSearch] = useState("");
  // **料金表は場所ごとに別** (v4 大③)。混ざったまま選ぶと別の拠点の値段が入る
  const [locationId, setLocationId] = useState("");
  // このセッションで追加した項目一覧（項目名）とカウンタ
  const [addedNames, setAddedNames] = useState<string[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pricing-categories", locationId],
    queryFn: async () => (await api.get("/pricing/categories", { params: { location_id: locationId } })).data,
    enabled: open && !!locationId,
  });
  const categories: PricingCategory[] = data?.data ?? [];

  // ダイアログを開き直すたびに「追加済」表示をリセット
  useEffect(() => {
    if (open) {
      setAddedNames([]);
      setFlashId(null);
      setSearch("");
    }
  }, [open]);

  const pickPrice = (it: PricingItem): number => {
    if (customerType === "internal") {
      return it.group_price ?? it.unit_price ?? 0;
    }
    return it.unit_price ?? it.group_price ?? 0;
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const q = search.toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        items: (c.items ?? []).filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.sub_label ?? "").toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q)
        ),
      }))
      .filter((c) => (c.items ?? []).length > 0);
  }, [categories, search]);

  const handleSelect = (it: PricingItem) => {
    const label = it.sub_label ? `${it.name} (${it.sub_label})` : it.name;
    onSelect({
      pricing_item_id: it.id,
      name: it.name,
      sub_label: it.sub_label,
      unit_price: pickPrice(it),
      calc_type: it.calc_type,
    });
    setAddedNames((prev) => [...prev, label]);
    setFlashId(it.id);
    setTimeout(() => setFlashId((cur) => (cur === it.id ? null : cur)), 900);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            料金表から明細を追加
          </DialogTitle>
          <DialogDescription>
            項目をクリックすると明細行として追加されます。続けて複数選択できます
            {customerType === "internal" ? "（グループ内価格）" : "（定価）"}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-border pb-3">
          <LocationPicker projectId={projectId} value={locationId} onChange={setLocationId} enabled={open} />
        </div>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="項目名・カテゴリ名で検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {addedNames.length > 0 && (
          <div className="shrink-0 rounded-lg border bg-primary/5 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-primary">
              <Check className="h-3.5 w-3.5" />
              追加済み: {addedNames.length} 件
            </div>
            <div className="text-muted-foreground max-h-16 overflow-y-auto">
              {addedNames.map((n, i) => (
                <span key={i} className="inline-block mr-2">・{n}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8 text-sm">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {search ? "該当する項目がありません" : "料金表が登録されていません"}
            </p>
          ) : (
            <div className="space-y-4 pb-2">
              {filtered.map((cat) => (
                <div key={cat.id} className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/50 px-3 py-1.5 text-sm font-semibold sticky top-0 z-10">
                    {cat.name}
                  </div>
                  <div className="divide-y">
                    {(cat.items ?? []).map((it) => {
                      const price = pickPrice(it);
                      const hasPrice =
                        (customerType === "internal" ? it.group_price : it.unit_price) != null;
                      const isFlashing = flashId === it.id;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => handleSelect(it)}
                          className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
                            isFlashing
                              ? "bg-emerald-100 ring-2 ring-emerald-400"
                              : "hover:bg-accent"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{it.name}</div>
                            {it.sub_label && (
                              <div className="text-xs text-muted-foreground truncate">{it.sub_label}</div>
                            )}
                          </div>
                          <div className="font-number text-sm shrink-0 flex items-center gap-2">
                            {isFlashing && <Check className="h-4 w-4 text-emerald-600" />}
                            {hasPrice ? (
                              <span className="font-semibold">{formatCurrency(price)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">設定なし</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {addedNames.length > 0 ? `${addedNames.length} 件の項目を追加済み` : "項目をクリックして追加"}
          </span>
          <Button type="button" variant={addedNames.length > 0 ? "default" : "outline"} onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
