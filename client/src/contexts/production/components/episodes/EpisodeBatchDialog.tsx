import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  count: number;
  order_date: string;
  revenue_total: number;
  notes: string;
}

export default function EpisodeBatchDialog({ projectId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: { count: 1, order_date: today, revenue_total: 0, notes: "" },
  });

  const count = useWatch({ control, name: "count" }) || 1;
  const revenueTotal = useWatch({ control, name: "revenue_total" }) || 0;

  const revenuePerEp = count > 0 ? Math.floor(revenueTotal / count) : 0;

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post(`/projects/${projectId}/episodes/batch`, {
        count: Number(values.count),
        order_date: values.order_date,
        revenue_budget_per_episode: Math.floor(Number(values.revenue_total) / Number(values.count)),
        notes: values.notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
      qc.invalidateQueries({ queryKey: ["episode-orders", projectId] });
      reset({ count: 1, order_date: today, revenue_total: 0, notes: "" });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>発注追加</DialogTitle>
          <DialogDescription>話数を一括追加し、予算を均等按分します。各話の予算は後から個別調整可能です。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>発注話数 *</Label>
              <Input
                type="number" min={1}
                {...register("count", { required: "必須", min: { value: 1, message: "1以上" }, valueAsNumber: true })}
              />
              {errors.count && <p className="text-xs text-destructive">{errors.count.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>発注日 *</Label>
              <Input type="date" {...register("order_date", { required: "必須" })} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>売上高(合計)</Label>
            <CurrencyInput
              value={revenueTotal}
              onChange={(v) => setValue("revenue_total", v)}
            />
            <p className="text-xs text-muted-foreground">仕入は各話ごとに個別登録します</p>
          </div>

          {revenueTotal > 0 && count > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">1話あたり売上高（{count}話で按分）</p>
              <p className="font-mono font-semibold text-primary">{formatCurrency(revenuePerEp)}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>メモ</Label>
            <Textarea rows={2} {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              発注追加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
