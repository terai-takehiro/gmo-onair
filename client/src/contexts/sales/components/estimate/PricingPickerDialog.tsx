/**
 * 料金表から明細に足す (デザイン 30a「＋ 料金表から足す」)
 *
 * 単価は案件の区分で自動的に選ぶ (グループ内 → group_price / グループ外 → 定価)。
 * ここで選んだ行は明細に入ってから編集できるので、この画面では**選ぶだけ**にする
 * (数量や単価をここで入れさせると、同じ入力欄が2か所にできて迷う)。
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PricingCategory, PricingItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Money } from "@gmo-onair/shared/src/client/ui/money";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Loader2, Plus } from "lucide-react";

/** 明細に渡す 1 行。数量・単位は計算タイプから既定を決める */
export interface PickedPricingRow {
  description: string;
  unit_price: number;
  quantity: number;
  unit: string;
  pricing_item_id: string;
  category: string;
}

/** 料金表のグループ名 → 明細のグループ (3つ) に寄せる */
function toEstimateGroup(categoryName: string): string {
  const n = categoryName;
  if (n.includes("基本") || n.includes("スタジオ") || n.includes("控室") || n.includes("スペース")) return "スタジオ";
  if (n.includes("テクニカル") || n.includes("技術") || n.includes("オペレーション") || n.includes("機材")) return "技術・人員";
  return "制作・その他";
}

/** 計算タイプから既定の単位を決める (明細に入れてから直せる) */
const UNIT_BY_CALC: Record<string, string> = {
  days: "日", hours: "時間", fixed: "式", toggle: "式",
  days_qty: "台", days_people: "人", qty: "点",
};

export default function PricingPickerDialog({
  open, onOpenChange, customerType, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerType: "internal" | "external";
  onPick: (rows: PickedPricingRow[]) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pricing-categories"],
    queryFn: async () => (await api.get("/pricing/categories")).data,
    enabled: open,
    staleTime: 300000,
  });
  // useMemo の依存に入れるので参照を安定させる (毎レンダーで新しい [] を作らない)
  const categories: PricingCategory[] = useMemo(() => data?.data ?? [], [data]);

  const priceOf = (it: PricingItem): number =>
    customerType === "internal"
      ? (it.group_price ?? it.unit_price ?? 0)
      : (it.unit_price ?? it.group_price ?? 0);

  const filtered = useMemo(() => {
    const kw = q.trim();
    return categories
      .map((c) => ({
        ...c,
        items: (c.items ?? []).filter((it) =>
          !kw || it.name.includes(kw) || (it.sub_label ?? "").includes(kw) || c.name.includes(kw)),
      }))
      .filter((c) => (c.items ?? []).length > 0);
  }, [categories, q]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const add = () => {
    const rows: PickedPricingRow[] = [];
    for (const c of categories) {
      for (const it of c.items ?? []) {
        if (!selected.has(it.id)) continue;
        rows.push({
          description: it.sub_label ? `${it.name}（${it.sub_label}）` : it.name,
          unit_price: priceOf(it),
          quantity: 1,
          unit: UNIT_BY_CALC[it.calc_type] ?? "式",
          pricing_item_id: it.id,
          category: toEstimateGroup(c.name),
        });
      }
    }
    onPick(rows);
    setSelected(new Set());
    setQ("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>料金表から足す</DialogTitle>
          <DialogDescription>
            単価は{customerType === "internal" ? "グループ内価格" : "定価"}を入れます。数量と単価は明細で直せます。
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="品目名で探す"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            料金表を読み込めませんでした。もう一度お試しください。
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {q.trim()
              ? `「${q.trim()}」に当てはまる品目がありません。品目名を短くしてお試しください。`
              : "料金表が登録されていません（設定 ＞ 料金表）。"}
          </p>
        ) : (
          <div className="space-y-4">
            {filtered.map((c) => (
              <div key={c.id} className="overflow-hidden rounded-lg border">
                <div className="flex min-h-tap items-center gap-2 border-b bg-muted/40 px-4 text-[12.5px] font-bold text-muted-foreground">
                  <span>{c.name}</span>
                  <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium">
                    {toEstimateGroup(c.name)}
                  </span>
                </div>
                <div className="divide-y">
                  {(c.items ?? []).map((it) => {
                    const checked = selected.has(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle(it.id)}
                        aria-pressed={checked}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          checked ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${
                            checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          }`}
                        >
                          {checked && <Plus className="h-3 w-3 rotate-45" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-bold">{it.name}</span>
                          {it.sub_label && (
                            <span className="block truncate text-xs text-muted-foreground">{it.sub_label}</span>
                          )}
                        </span>
                        <Money value={priceOf(it)} className="w-[128px] shrink-0 text-[13.5px]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-[12.5px] text-muted-foreground">{selected.size} 件を選択中</span>
          <span className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
            <Button onClick={add} disabled={selected.size === 0}>明細に足す</Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
