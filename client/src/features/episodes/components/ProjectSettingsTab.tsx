import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Project,
  BroadcastType,
  BroadcastTypeLabels,
  MediaPlatform,
  MediaPlatformLabels,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface ProjectSettingsTabProps {
  projectId: string;
  project: Project;
}

export default function ProjectSettingsTab({ projectId, project }: ProjectSettingsTabProps) {
  const qc = useQueryClient();
  const { handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      broadcast_type: project.broadcast_type as string,
      media_platform: project.media_platform as string,
    },
  });

  const broadcastType = watch("broadcast_type");
  const mediaPlatform = watch("media_platform");

  const mutation = useMutation({
    mutationFn: (values: { broadcast_type: string; media_platform: string }) =>
      api.put(`/projects/${projectId}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const onSubmit = (values: { broadcast_type: string; media_platform: string }) => {
    mutation.mutate(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-6">
      <div className="space-y-3">
        <Label>番組種別</Label>
        <div className="flex gap-4">
          {(Object.keys(BroadcastTypeLabels) as BroadcastType[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={key}
                checked={broadcastType === key}
                onChange={(e) => setValue("broadcast_type", e.target.value)}
                className="accent-primary"
              />
              <span className="text-sm">{BroadcastTypeLabels[key]}</span>
            </label>
          ))}
        </div>
        {broadcastType === "live" && (
          <p className="text-xs text-muted-foreground">
            生放送の場合、各話数の収録日変更時に放送日も自動連動します
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>配信媒体</Label>
        <Select
          value={mediaPlatform}
          onValueChange={(v) => setValue("media_platform", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MediaPlatformLabels) as MediaPlatform[]).map((key) => (
              <SelectItem key={key} value={key}>
                {MediaPlatformLabels[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        保存
      </Button>
      {mutation.isSuccess && (
        <p className="text-sm text-green-600">保存しました</p>
      )}
    </form>
  );
}
