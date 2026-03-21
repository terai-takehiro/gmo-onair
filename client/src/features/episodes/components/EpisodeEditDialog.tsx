import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormValues {
  recording_date: string;
  broadcast_date: string;
  delivery_date: string;
  revenue_budget: number;
  cost_budget: number;
  notes: string;
}

export default function EpisodeEditDialog({ projectId, episode, broadcastType, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const isLive = broadcastType === "live";

  const { register, handleSubmit, reset, watch, setValue } = useForm<FormValues>();

  useEffect(() => {
    if (episode) {
      reset({
        recording_date: episode.recording_date?.slice(0, 10) ?? "",
        broadcast_date: episode.broadcast_date?.slice(0, 10) ?? "",
        delivery_date: episode.delivery_date?.slice(0, 10) ?? "",
        revenue_budget: episode.revenue_budget ?? 0,
        cost_budget: episode.cost_budget ?? 0,
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
        cost_budget: Number(values.cost_budget),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
      onOpenChange(false);
    },
  });

  const onSubmit = (values: FormValues) => mutation.mutate(values);

  if (!episode) return null;

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
              <Label htmlFor="recording_date">収録日</Label>
              <Input id="recording_date" type="date" {...register("recording_date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broadcast_date">放送日</Label>
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
            <Label htmlFor="delivery_date">納品日</Label>
            <Input id="delivery_date" type="date" {...register("delivery_date")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="revenue_budget">売上</Label>
              <Input id="revenue_budget" type="number" min={0} {...register("revenue_budget")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost_budget">仕入</Label>
              <Input id="cost_budget" type="number" min={0} {...register("cost_budget")} />
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
