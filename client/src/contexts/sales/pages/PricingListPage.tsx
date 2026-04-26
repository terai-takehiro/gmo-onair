import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import type { PricingCategory, PricingItem, CalcType } from "@/types";
import { CalcTypeLabels } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

// ---------- Category Dialog ----------

interface CategoryFormValues {
  name: string;
  sort_order: number;
}

function CategoryDialog({
  open,
  onOpenChange,
  editingCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: PricingCategory | null;
}) {
  const qc = useQueryClient();
  const form = useForm<CategoryFormValues>({
    values: editingCategory
      ? { name: editingCategory.name, sort_order: editingCategory.sort_order }
      : { name: "", sort_order: 0 },
  });

  const mutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      if (editingCategory) {
        return (await api.put(`/pricing/categories/${editingCategory.id}`, values)).data;
      }
      return (await api.post("/pricing/categories", values)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-categories"] });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingCategory ? "カテゴリ編集" : "カテゴリ追加"}
          </DialogTitle>
          <DialogDescription>
            {editingCategory
              ? "カテゴリ情報を編集します"
              : "新しいカテゴリを追加します"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div>
            <Label>カテゴリ名 *</Label>
            <Input {...form.register("name", { required: true })} />
          </div>
          <div>
            <Label>並び順</Label>
            <Input
              type="number"
              {...form.register("sort_order", { valueAsNumber: true })}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Item Dialog ----------

interface ItemFormValues {
  name: string;
  sub_label: string;
  unit_price: number;
  unit_price_unset: boolean;
  group_price: number;
  group_price_unset: boolean;
  calc_type: CalcType;
  sort_order: number;
}

function ItemDialog({
  open,
  onOpenChange,
  categoryId,
  editingItem,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  editingItem: PricingItem | null;
}) {
  const qc = useQueryClient();
  const form = useForm<ItemFormValues>({
    values: editingItem
      ? {
          name: editingItem.name,
          sub_label: editingItem.sub_label || "",
          unit_price: editingItem.unit_price ?? 0,
          unit_price_unset: editingItem.unit_price == null,
          group_price: editingItem.group_price ?? 0,
          group_price_unset: editingItem.group_price == null,
          calc_type: editingItem.calc_type,
          sort_order: editingItem.sort_order,
        }
      : {
          name: "",
          sub_label: "",
          unit_price: 0,
          unit_price_unset: false,
          group_price: 0,
          group_price_unset: false,
          calc_type: "fixed" as CalcType,
          sort_order: 0,
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: ItemFormValues) => {
      const payload = {
        category_id: categoryId,
        name: values.name,
        sub_label: values.sub_label,
        unit_price: values.unit_price_unset ? null : values.unit_price,
        group_price: values.group_price_unset ? null : values.group_price,
        calc_type: values.calc_type,
        sort_order: values.sort_order,
      };
      if (editingItem) {
        return (await api.put(`/pricing/items/${editingItem.id}`, payload)).data;
      }
      return (await api.post("/pricing/items", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-categories"] });
      onOpenChange(false);
    },
  });

  const unitUnset = form.watch("unit_price_unset");
  const groupUnset = form.watch("group_price_unset");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "項目編集" : "項目追加"}
          </DialogTitle>
          <DialogDescription>
            {editingItem ? "項目情報を編集します" : "新しい項目を追加します"}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div>
            <Label>項目名 *</Label>
            <Input {...form.register("name", { required: true })} />
          </div>
          <div>
            <Label>内容 / サブラベル</Label>
            <Input {...form.register("sub_label")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>定価（外販）</Label>
              <CurrencyInput
                value={form.watch("unit_price")}
                onChange={(v) => form.setValue("unit_price", v, { shouldValidate: true })}
                disabled={unitUnset}
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>設定なし（外販では提供しない）</span>
                <Switch
                  checked={unitUnset}
                  onCheckedChange={(v) => form.setValue("unit_price_unset", !!v)}
                />
              </div>
            </div>
            <div>
              <Label>グループ内単価</Label>
              <CurrencyInput
                value={form.watch("group_price")}
                onChange={(v) => form.setValue("group_price", v, { shouldValidate: true })}
                disabled={groupUnset}
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>設定なし（グループ内では提供しない）</span>
                <Switch
                  checked={groupUnset}
                  onCheckedChange={(v) => form.setValue("group_price_unset", !!v)}
                />
              </div>
            </div>
          </div>
          <div>
            <Label>計算タイプ *</Label>
            <Select
              value={form.watch("calc_type")}
              onValueChange={(v) => form.setValue("calc_type", v as CalcType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.entries(CalcTypeLabels) as [CalcType, string][]
                ).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>並び順</Label>
            <Input
              type="number"
              {...form.register("sort_order", { valueAsNumber: true })}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main Page ----------

export default function PricingListPage() {
  const qc = useQueryClient();

  // Category dialog state
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<PricingCategory | null>(null);

  // Item dialog state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [editingItem, setEditingItem] = useState<PricingItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["pricing-categories"],
    queryFn: async () => (await api.get("/pricing/categories")).data,
  });

  const categories: PricingCategory[] = data?.data ?? [];

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pricing/categories/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-categories"] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pricing/items/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-categories"] });
    },
  });

  const openAddCategory = () => {
    setEditingCategory(null);
    setCatDialogOpen(true);
  };

  const openEditCategory = (cat: PricingCategory) => {
    setEditingCategory(cat);
    setCatDialogOpen(true);
  };

  const openAddItem = (categoryId: string) => {
    setItemCategoryId(categoryId);
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  const openEditItem = (categoryId: string, item: PricingItem) => {
    setItemCategoryId(categoryId);
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl lg:text-2xl font-bold">料金表マスター</h1>
        <Button onClick={openAddCategory}>
          <Plus className="mr-2 h-4 w-4" />
          カテゴリ追加
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : categories.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          カテゴリが登録されていません
        </p>
      ) : (
        categories.map((cat) => (
          <Card key={cat.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">{cat.name}</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEditCategory(cat)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  onClick={() => deleteCategoryMutation.mutate(cat.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(cat.items ?? []).length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">項目がありません</p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-2 lg:hidden">
                    {(cat.items ?? []).map((item) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-sm font-medium">{item.name}</span>
                            {item.sub_label && <span className="ml-1 text-xs text-muted-foreground">({item.sub_label})</span>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditItem(cat.id, item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItemMutation.mutate(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="font-number">
                            <span className="text-xs text-muted-foreground">定価</span>{" "}
                            <span className="font-medium">{item.unit_price == null ? "—" : formatCurrency(item.unit_price)}</span>
                          </span>
                          <span className="font-number">
                            <span className="text-xs text-muted-foreground">グループ内</span>{" "}
                            <span className="font-medium">{item.group_price == null ? "—" : formatCurrency(item.group_price)}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{CalcTypeLabels[item.calc_type]}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>項目名</TableHead>
                        <TableHead>内容 / サブラベル</TableHead>
                        <TableHead className="text-right">定価</TableHead>
                        <TableHead className="text-right">グループ内</TableHead>
                        <TableHead>計算タイプ</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cat.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.sub_label || "-"}</TableCell>
                          <TableCell className="text-right font-number">
                            {item.unit_price == null ? <span className="text-muted-foreground">—</span> : formatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-number">
                            {item.group_price == null ? <span className="text-muted-foreground">—</span> : formatCurrency(item.group_price)}
                          </TableCell>
                          <TableCell>{CalcTypeLabels[item.calc_type]}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(cat.id, item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteItemMutation.mutate(item.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </>
              )}
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openAddItem(cat.id)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  項目追加
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <CategoryDialog
        open={catDialogOpen}
        onOpenChange={setCatDialogOpen}
        editingCategory={editingCategory}
      />

      <ItemDialog
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        categoryId={itemCategoryId}
        editingItem={editingItem}
      />
    </div>
    </PageTransition>
  );
}
