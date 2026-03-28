import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Episode,
  InvoiceGroup,
  InvoiceGroupStatus,
  InvoiceGroupStatusLabels,
} from "@/types";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

interface Props {
  projectId: string;
  episodes: Episode[];
  invoiceGroup: InvoiceGroup | null; // null = create mode
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  title: string;
  invoice_date: string;
  status: InvoiceGroupStatus;
  notes: string;
}

export default function InvoiceGroupDialog({
  projectId,
  episodes,
  invoiceGroup,
  open,
  onOpenChange,
}: Props) {
  const qc = useQueryClient();
  const isEdit = !!invoiceGroup;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>();
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);

  useEffect(() => {
    if (invoiceGroup) {
      reset({
        title: invoiceGroup.title,
        invoice_date: invoiceGroup.invoice_date?.slice(0, 10) ?? "",
        status: invoiceGroup.status,
        notes: invoiceGroup.notes ?? "",
      });
      setSelectedEpisodeIds(invoiceGroup.episodes?.map((e) => e.id) ?? []);
    } else {
      reset({ title: "", invoice_date: "", status: "draft", notes: "" });
      setSelectedEpisodeIds([]);
    }
  }, [invoiceGroup, reset]);

  const statusValue = watch("status");

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.post(`/projects/${projectId}/invoice-groups`, {
        title: values.title,
        invoice_date: values.invoice_date || null,
        episode_ids: selectedEpisodeIds,
        notes: values.notes || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-groups", projectId] });
      onOpenChange(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await api.put(`/projects/${projectId}/invoice-groups/${invoiceGroup!.id}`, {
        title: values.title,
        invoice_date: values.invoice_date || null,
        status: values.status,
        notes: values.notes || null,
      });
      await api.put(`/projects/${projectId}/invoice-groups/${invoiceGroup!.id}/episodes`, {
        episode_ids: selectedEpisodeIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-groups", projectId] });
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const toggleEpisode = (id: string) => {
    setSelectedEpisodeIds((prev) =>
      prev.includes(id) ? prev.filter((eid) => eid !== id) : [...prev, id]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "請求グループ編集" : "請求グループ追加"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "請求グループの情報を編集します。" : "新しい請求グループを作成します。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">グループ名</Label>
            <Input
              id="title"
              {...register("title", { required: "必須項目です" })}
            />
            {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoice_date">請求日</Label>
            <Input id="invoice_date" type="date" {...register("invoice_date")} />
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select
                value={statusValue}
                onValueChange={(v) => setValue("status", v as InvoiceGroupStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(InvoiceGroupStatusLabels) as InvoiceGroupStatus[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {InvoiceGroupStatusLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>話数選択</Label>
            <ScrollArea className="h-48 rounded-md border p-3">
              {episodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">話数がありません</p>
              ) : (
                <div className="space-y-2">
                  {episodes.map((ep) => (
                    <label
                      key={ep.id}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedEpisodeIds.includes(ep.id)}
                        onCheckedChange={() => toggleEpisode(ep.id)}
                      />
                      <span className="font-mono">{ep.episode_code}</span>
                      <span className="text-muted-foreground font-number">
                        {formatCurrency(ep.actual_revenue ?? 0)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ig-notes">メモ</Label>
            <Textarea id="ig-notes" rows={3} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "保存" : "作成"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
