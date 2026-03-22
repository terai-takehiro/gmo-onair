import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { Episode, BroadcastType } from "@/types";
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
  episode: Episode | null;
  broadcastType: BroadcastType;
  projectType?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPurchases?: () => void;
}

function getDateLabels(projectType: string): { recording: string; broadcast: string; delivery: string } {
  switch (projectType) {
    case 'offline_event': return { recording: 'リハ日', broadcast: '本番日', delivery: '納品日' };
    case 'hybrid_event': return { recording: 'リハ日', broadcast: '本番・放送日', delivery: '納品日' };
    case 'live_broadcast': return { recording: '収録日(=放送日)', broadcast: '放送日', delivery: '納品日' };
    case 'recording': return { recording: '収録日', broadcast: '放送日', delivery: '納品日' };
    case 'gmo_project': case 'other': return { recording: '対応開始日', broadcast: '対応終了日', delivery: '完了日' };
    default: return { recording: '収録日', broadcast: '放送日', delivery: '納品日' };
  }
}

interface FormValues {
  recording_date: string;
  broadcast_date: string;
  delivery_date: string;
  revenue_budget: number;
  notes: string;
}

export default function EpisodeEditDialog({ projectId, episode, broadcastType, projectType, open, onOpenChange, onOpenPurchases }: Props) {
  const qc = useQueryClient();
  const isLive = broadcastType === "live";
  const dateLabels = getDateLabels(projectType ?? "");

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>();

  useEffect(() => {
    if (episode) {
      reset({
        recording_date: episode.recording_date?.slice(0, 10) ?? "",
        broadcast_date: episode.broadcast_date?.slice(0, 10) ?? "",
        delivery_date: episode.delivery_date?.slice(0, 10) ?? "",
        revenue_budget: episode.revenue_budget ?? 0,
        notes: episode.notes ?? "",
      });
    }
  }, [episode, reset]);

  const recordingDate = watch("recording_date");

  useEffect(() => {
    if (isLive && recordingDate) {
      setValue("broadcast_date", recordingDate);
    }
  }, [isLive, recordingDate, setValue]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      api.put(`/projects/${projectId}/episodes/${episode?.id}`, {
        ...values,
        revenue_budget: Number(values.revenue_budget),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  if (!episode) return null;

  const purchaseCount = episode.purchase_count ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>話数編集</DialogTitle>
          <DialogDescription>{episode.episode_code}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recording_date">{dateLabels.recording}</Label>
              <Input id="recording_date" type="date" {...register("recording_date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast_date">{dateLabels.broadcast}</Label>
              <Input
                id="broadcast_date"
                type="date"
                {...register("broadcast_date")}
                disabled={isLive}
              />
              {isLive && (
                <p className="text-xs text-muted-foreground">
                  生放送のため収録日と自動連動
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delivery_date">{dateLabels.delivery}</Label>
            <Input id="delivery_date" type="date" {...register("delivery_date")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="revenue_budget">売上</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                <Input id="revenue_budget" type="number" min={0} className="pl-7" {...register("revenue_budget")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>仕入(実績)</Label>
              <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50">
                <span className="font-mono text-sm">{formatCurrency(episode.actual_cost || 0)}</span>
                <span className="text-xs text-muted-foreground">({purchaseCount}件)</span>
              </div>
              {onOpenPurchases && (
                <Button type="button" variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" onClick={onOpenPurchases}>
                  仕入を管理 →
                </Button>
              )}
            </div>
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
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
