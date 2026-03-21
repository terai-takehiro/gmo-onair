import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  notes: string;
}

export default function EpisodeBatchDialog({ projectId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { count: 1, order_date: today, notes: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post(`/projects/${projectId}/episodes/batch`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
      qc.invalidateQueries({ queryKey: ["episode-orders", projectId] });
      reset({ count: 1, order_date: today, notes: "" });
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate({ ...values, count: Number(values.count) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>発注追加</DialogTitle>
          <DialogDescription>新しい話数を一括で追加します。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="count">発注話数</Label>
            <Input
              id="count"
              type="number"
              min={1}
              {...register("count", { required: "必須項目です", min: { value: 1, message: "1以上を入力してください" } })}
            />
            {errors.count && <p className="text-sm text-destructive">{errors.count.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="order_date">発注日</Label>
            <Input
              id="order_date"
              type="date"
              {...register("order_date", { required: "必須項目です" })}
            />
            {errors.order_date && <p className="text-sm text-destructive">{errors.order_date.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea id="notes" rows={3} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
