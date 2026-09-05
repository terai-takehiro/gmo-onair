import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import type { PricingCategory, SimulationItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnhancedCheckbox } from "@gmo-onair/shared/src/client/ui/enhanced-checkbox";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Save, ArrowRight } from "lucide-react";
import { LocationPicker } from "../pages/pricing/LocationPicker";
import { calcSubtotal, calcTypeUnit, type ItemState } from "./simulation/calc";

export interface SimulationAppliedItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface SimulationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  /** @deprecated Use projectId instead */
  opportunityId?: string;
  onApply: (total: number, items: SimulationAppliedItem[]) => void;
}

export default function SimulationDialog({ open, onOpenChange, projectId: propProjectId, opportunityId, onApply }: SimulationDialogProps) {
  const projectId = propProjectId || opportunityId;
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  // **料金表は場所ごとに別** (v4 大③)。案件の予約から既定を決め、選び直せる
  const [locationId, setLocationId] = useState("");

  const { data: categoriesData, isLoading: loadingCategories } = useQuery({
    queryKey: ["pricing-categories", locationId],
    queryFn: async () => (await api.get("/pricing/categories", { params: { location_id: locationId } })).data,
    enabled: open && !!locationId,
  });

  const { data: simulationData, isLoading: loadingSimulation } = useQuery({
    queryKey: ["simulation", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/simulation`)).data,
    enabled: open && !!projectId,
  });

  const { data: projectData } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: open && !!projectId,
  });

  const customerType: "internal" | "external" =
    projectData?.data?.customer_type === "internal" ? "internal" : "external";

  const categories: PricingCategory[] = categoriesData?.data ?? [];
  const savedItems: SimulationItem[] = simulationData?.data ?? [];

  const pickInitialPrice = useCallback(
    (item: { unit_price: number | null; group_price: number | null }): number => {
      if (customerType === "internal") {
        return item.group_price ?? item.unit_price ?? 0;
      }
      return item.unit_price ?? item.group_price ?? 0;
    },
    [customerType]
  );

  useEffect(() => {
    if (!open || categories.length === 0) return;
    const savedMap = new Map<string, SimulationItem>();
    savedItems.forEach((si) => savedMap.set(si.pricing_item_id, si));
    const states: Record<string, ItemState> = {};
    categories.forEach((cat) => {
      cat.items?.forEach((item) => {
        const saved = savedMap.get(item.id);
        states[item.id] = saved
          ? { checked: true, quantity: saved.quantity, days: saved.days, unitPrice: saved.unit_price }
          : { checked: false, quantity: 1, days: 1, unitPrice: pickInitialPrice(item) };
      });
    });
    setItemStates(states);
  }, [open, categories.length, savedItems.length, customerType, pickInitialPrice]);

  const updateItem = useCallback((itemId: string, patch: Partial<ItemState>) => {
    setItemStates((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }, []);

  const { total, categoryTotals } = useMemo(() => {
    const catTotals: Record<string, number> = {};
    let t = 0;
    categories.forEach((cat) => {
      let catSum = 0;
      (cat.items ?? []).forEach((item) => {
        const state = itemStates[item.id];
        if (state) catSum += calcSubtotal(item.calc_type, state);
      });
      catTotals[cat.id] = catSum;
      t += catSum;
    });
    return { total: t, categoryTotals: catTotals };
  }, [categories, itemStates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const items: Array<{ pricing_item_id: string; quantity: number; days: number; unit_price: number; subtotal: number }> = [];
      categories.forEach((cat) => {
        cat.items?.forEach((item) => {
          const state = itemStates[item.id];
          if (state?.checked) {
            items.push({
              pricing_item_id: item.id,
              quantity: state.quantity, days: state.days,
              unit_price: state.unitPrice,
              subtotal: calcSubtotal(item.calc_type, state),
            });
          }
        });
      });
      await api.put(`/projects/${projectId}/simulation`, { items });
    },
  });

  const handleApply = () => {
    if (projectId) saveMutation.mutate();
    const appliedItems: SimulationAppliedItem[] = [];
    categories.forEach((cat) => {
      cat.items?.forEach((item) => {
        const state = itemStates[item.id];
        if (state?.checked) {
          const subtotal = calcSubtotal(item.calc_type, state);
          appliedItems.push({
            description: item.sub_label ? `${item.name}（${item.sub_label}）` : item.name,
            quantity: state.quantity || 1,
            unit_price: state.unitPrice,
            amount: subtotal,
          });
        }
      });
    });
    onApply(total, appliedItems);
    onOpenChange(false);
  };

  const isLoading = loadingCategories || (!!projectId && loadingSimulation);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="料金シミュレーション"
      sub={`項目を選択して数量・日数を入力すると見積金額を自動算出します。単価は${customerType === "internal" ? "「グループ会社価格」" : "「定価」"}を初期値として反映しますが、明細ごとに上書き可能です。`}
      wide
      footer={
        <div className="w-full">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">
              {Object.values(itemStates).filter(s => s.checked).length}項目選択中
            </span>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">見積合計</div>
              <div className="text-2xl font-bold font-number text-primary">
                {formatCurrency(total)}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
            {projectId && (
              <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存
              </Button>
            )}
            <Button onClick={handleApply}>
              <ArrowRight className="mr-2 h-4 w-4" />
              想定金額に反映
            </Button>
          </div>
        </div>
      }
    >
      {projectId && (
        <div className="mb-3">
          <Badge variant={customerType === "internal" ? "default" : "secondary"}>
            {customerType === "internal" ? "グループ会社の案件" : "社外の案件"}
          </Badge>
        </div>
      )}

      <div className="sticky top-0 z-10 -mx-4 border-b border-border bg-card px-4 pb-3 lg:-mx-6 lg:px-6">
        <LocationPicker projectId={projectId} value={locationId} onChange={setLocationId} enabled={open} />
      </div>

      <div className="pt-4">
        {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : categories.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">料金マスターが登録されていません</p>
          ) : (
            <div className="space-y-6">
              {categories.map((cat) => (
                <div key={cat.id} className="rounded-lg border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/50 px-4 py-2.5">
                    <h3 className="font-semibold text-sm">{cat.name}</h3>
                    {categoryTotals[cat.id] > 0 && (
                      <Badge variant="secondary" className="font-number">
                        {formatCurrency(categoryTotals[cat.id])}
                      </Badge>
                    )}
                  </div>

                  {/* Mobile card layout */}
                  <div className="space-y-0 divide-y sm:hidden">
                    {(cat.items ?? []).map((item) => {
                      const state = itemStates[item.id];
                      if (!state) return null;
                      const subtotal = calcSubtotal(item.calc_type, state);
                      const units = calcTypeUnit[item.calc_type] || {};
                      const showQty = item.calc_type === 'days_qty' || item.calc_type === 'days_people' || item.calc_type === 'qty';
                      const showDays = item.calc_type === 'days' || item.calc_type === 'hours' || item.calc_type === 'days_qty' || item.calc_type === 'days_people';

                      return (
                        <div key={item.id} className={`p-3 ${state.checked ? 'bg-primary/5' : 'opacity-60'}`}>
                          <div className="flex items-center gap-2">
                            <EnhancedCheckbox
                              checked={state.checked}
                              onCheckedChange={(checked) => updateItem(item.id, { checked: !!checked })}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium">{item.name}</div>
                              {item.sub_label && <div className="text-xs text-muted-foreground">{item.sub_label}</div>}
                            </div>
                            <span className="font-number text-sm shrink-0">
                              {state.checked ? (
                                <span className="font-semibold text-primary">{formatCurrency(subtotal)}</span>
                              ) : '-'}
                            </span>
                          </div>
                          {state.checked && (showQty || showDays) && (
                            <div className="mt-2 flex items-center gap-3 pl-7">
                              {showQty && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number" min={0}
                                    value={state.quantity}
                                    onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 text-center text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">{units.qtyLabel}</span>
                                </div>
                              )}
                              {showDays && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number" min={0}
                                    value={state.days}
                                    onChange={(e) => updateItem(item.id, { days: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 text-center text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">{units.daysLabel}</span>
                                </div>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">@{formatCurrency(state.unitPrice)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden sm:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="w-8"></TableHead>
                        <TableHead>項目</TableHead>
                        <TableHead className="w-20 text-center">数量</TableHead>
                        <TableHead className="w-20 text-center">日数/時間</TableHead>
                        <TableHead className="w-28 text-right">単価</TableHead>
                        <TableHead className="w-32 text-right">小計</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cat.items ?? []).map((item) => {
                        const state = itemStates[item.id];
                        if (!state) return null;
                        const subtotal = calcSubtotal(item.calc_type, state);
                        const units = calcTypeUnit[item.calc_type] || {};
                        const showQty = item.calc_type === 'days_qty' || item.calc_type === 'days_people' || item.calc_type === 'qty';
                        const showDays = item.calc_type === 'days' || item.calc_type === 'hours' || item.calc_type === 'days_qty' || item.calc_type === 'days_people';

                        return (
                          <TableRow key={item.id} className={state.checked ? "bg-primary/5" : "opacity-60"}>
                            <TableCell className="pr-0">
                              <EnhancedCheckbox
                                checked={state.checked}
                                onCheckedChange={(checked) => updateItem(item.id, { checked: !!checked })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{item.name}</div>
                              {item.sub_label && (
                                <div className="text-xs text-muted-foreground">{item.sub_label}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {showQty ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Input
                                    type="number" min={0}
                                    value={state.quantity}
                                    onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 0 })}
                                    disabled={!state.checked}
                                    className="h-7 w-14 text-center text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">{units.qtyLabel}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {showDays ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Input
                                    type="number" min={0}
                                    value={state.days}
                                    onChange={(e) => updateItem(item.id, { days: Number(e.target.value) || 0 })}
                                    disabled={!state.checked}
                                    className="h-7 w-14 text-center text-sm"
                                  />
                                  <span className="text-xs text-muted-foreground">{units.daysLabel}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-number text-sm">
                              {formatCurrency(state.unitPrice)}
                            </TableCell>
                            <TableCell className="text-right">
                              {state.checked ? (
                                <span className="font-number font-semibold text-sm text-primary">
                                  {formatCurrency(subtotal)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </FormDialog>
  );
}
