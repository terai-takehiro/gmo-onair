import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { PricingCategory, PricingItem, SimulationItem, CalcType } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface SimulationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityId: string;
  onApply: (total: number) => void;
}

interface ItemState {
  checked: boolean;
  quantity: number;
  days: number;
  unitPrice: number;
}

function calcSubtotal(
  calcType: CalcType,
  state: ItemState
): number {
  if (!state.checked) return 0;
  switch (calcType) {
    case "days":
      return state.days * state.unitPrice;
    case "hours":
      return state.days * state.unitPrice;
    case "fixed":
      return state.unitPrice;
    case "days_qty":
      return state.quantity * state.days * state.unitPrice;
    case "days_people":
      return state.quantity * state.days * state.unitPrice;
    case "toggle":
      return state.unitPrice;
    default:
      return 0;
  }
}

export default function SimulationDialog({
  open,
  onOpenChange,
  opportunityId,
  onApply,
}: SimulationDialogProps) {
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ["pricing-categories"],
    queryFn: async () => (await api.get("/pricing/categories")).data,
    enabled: open,
  });

  const { data: simulationData, isLoading: loadingSimulation } = useQuery({
    queryKey: ["simulation", opportunityId],
    queryFn: async () =>
      (await api.get(`/opportunities/${opportunityId}/simulation`)).data,
    enabled: open && !!opportunityId,
  });

  const categories: PricingCategory[] = categoriesData?.data ?? [];
  const savedItems: SimulationItem[] = simulationData?.data ?? [];

  // Initialize item states from categories and saved simulation
  useEffect(() => {
    if (!open || categories.length === 0) return;

    const savedMap = new Map<string, SimulationItem>();
    savedItems.forEach((si) => savedMap.set(si.pricing_item_id, si));

    const states: Record<string, ItemState> = {};
    categories.forEach((cat) => {
      cat.items?.forEach((item) => {
        const saved = savedMap.get(item.id);
        if (saved) {
          states[item.id] = {
            checked: true,
            quantity: saved.quantity,
            days: saved.days,
            unitPrice: saved.unit_price,
          };
        } else {
          states[item.id] = {
            checked: false,
            quantity: 1,
            days: 1,
            unitPrice: item.unit_price,
          };
        }
      });
    });
    setItemStates(states);
  }, [open, categories, savedItems]);

  const updateItem = useCallback(
    (itemId: string, patch: Partial<ItemState>) => {
      setItemStates((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], ...patch },
      }));
    },
    []
  );

  const total = categories.reduce((sum, cat) => {
    return (
      sum +
      (cat.items ?? []).reduce((catSum, item) => {
        const state = itemStates[item.id];
        if (!state) return catSum;
        return catSum + calcSubtotal(item.calc_type, state);
      }, 0)
    );
  }, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const items: Array<{
        pricing_item_id: string;
        quantity: number;
        days: number;
        unit_price: number;
        subtotal: number;
      }> = [];

      categories.forEach((cat) => {
        cat.items?.forEach((item) => {
          const state = itemStates[item.id];
          if (state?.checked) {
            items.push({
              pricing_item_id: item.id,
              quantity: state.quantity,
              days: state.days,
              unit_price: state.unitPrice,
              subtotal: calcSubtotal(item.calc_type, state),
            });
          }
        });
      });

      await api.put(`/opportunities/${opportunityId}/simulation`, { items });
    },
  });

  const handleApply = () => {
    onApply(total);
    onOpenChange(false);
  };

  const isLoading = loadingCategories || loadingSimulation;

  const renderInputs = (item: PricingItem, state: ItemState) => {
    const disabled = !state.checked;
    const inputClass = "h-8 w-16 text-right";

    switch (item.calc_type) {
      case "days":
        return (
          <>
            <Input
              type="number"
              min={0}
              value={state.days}
              onChange={(e) =>
                updateItem(item.id, { days: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">日</span>
            <span className="text-sm text-muted-foreground">x</span>
            <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
          </>
        );
      case "hours":
        return (
          <>
            <Input
              type="number"
              min={0}
              value={state.days}
              onChange={(e) =>
                updateItem(item.id, { days: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">h</span>
            <span className="text-sm text-muted-foreground">x</span>
            <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
          </>
        );
      case "fixed":
        return (
          <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
        );
      case "days_qty":
        return (
          <>
            <Input
              type="number"
              min={0}
              value={state.quantity}
              onChange={(e) =>
                updateItem(item.id, { quantity: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">台</span>
            <span className="text-sm text-muted-foreground">x</span>
            <Input
              type="number"
              min={0}
              value={state.days}
              onChange={(e) =>
                updateItem(item.id, { days: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">日</span>
            <span className="text-sm text-muted-foreground">x</span>
            <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
          </>
        );
      case "days_people":
        return (
          <>
            <Input
              type="number"
              min={0}
              value={state.quantity}
              onChange={(e) =>
                updateItem(item.id, { quantity: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">人</span>
            <span className="text-sm text-muted-foreground">x</span>
            <Input
              type="number"
              min={0}
              value={state.days}
              onChange={(e) =>
                updateItem(item.id, { days: Number(e.target.value) || 0 })
              }
              disabled={disabled}
              className={inputClass}
            />
            <span className="text-sm text-muted-foreground">日</span>
            <span className="text-sm text-muted-foreground">x</span>
            <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
          </>
        );
      case "toggle":
        return (
          <span className="text-sm">{formatCurrency(state.unitPrice)}</span>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>料金シミュレーション</DialogTitle>
          <DialogDescription>
            料金表マスターから項目を選択して見積金額を算出します
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto space-y-4 pr-2">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : categories.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              料金マスターが登録されていません
            </p>
          ) : (
            categories.map((cat, ci) => (
              <div key={cat.id}>
                {ci > 0 && <Separator className="my-3" />}
                <h3 className="font-semibold text-sm mb-2">{cat.name}</h3>
                <div className="space-y-2">
                  {(cat.items ?? []).map((item) => {
                    const state = itemStates[item.id];
                    if (!state) return null;
                    const subtotal = calcSubtotal(item.calc_type, state);

                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 flex-wrap"
                      >
                        <Checkbox
                          checked={state.checked}
                          onCheckedChange={(checked) =>
                            updateItem(item.id, { checked: !!checked })
                          }
                        />
                        <span className="text-sm min-w-[120px]">
                          {item.name}
                          {item.sub_label && (
                            <span className="text-muted-foreground ml-1">
                              ({item.sub_label})
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1 flex-1">
                          {renderInputs(item, state)}
                        </div>
                        <span className="text-sm font-medium min-w-[100px] text-right">
                          {state.checked ? `=${formatCurrency(subtotal)}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <Separator className="my-2" />

        <div className="flex items-center justify-end gap-2">
          <span className="text-lg font-bold">
            合計: {formatCurrency(total)}
          </span>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            保存
          </Button>
          <Button onClick={handleApply}>想定金額に反映</Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
