// 運営マニュアルの新規作成（空の冊子を作る・段A）。`CreateScheduleDialog.tsx` と同じ作法。
// ひな形からは作らない（テンプレート機能は段E）— 常に空ページ1枚入りの冊子を作るだけ。
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import type { ManualListItem } from "@gmo-onair/shared/src/opsmanual/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import BufferedInput from "@/components/editor/BufferedInput";
import ManualOwnerFields, { type ManualOwnerValue } from "@/components/opsmanual/ManualOwnerFields";
import { notifyError } from "@/lib/notify";
import * as manualApi from "@/lib/manualApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件/番組の選び直しはさせない */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  onCreated: (manual: ManualListItem) => void;
}

function initialOwner(lockedOwner?: Props["lockedOwner"]): ManualOwnerValue {
  if (lockedOwner?.programId) return { ownerType: "program", projectId: null, programId: lockedOwner.programId };
  return { ownerType: "project", projectId: lockedOwner?.projectId ?? null, programId: null };
}

export default function CreateManualDialog({ open, onOpenChange, lockedOwner, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<ManualOwnerValue>(() => initialOwner(lockedOwner));

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setOwner(initialOwner(lockedOwner));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ownerReady = owner.ownerType === "project" ? !!owner.projectId : !!owner.programId;

  const createMutation = useMutation({
    mutationFn: () => manualApi.createManual({
      title: title.trim() || "無題の運営マニュアル",
      project_id: owner.ownerType === "project" ? owner.projectId : null,
      program_id: owner.ownerType === "program" ? owner.programId : null,
    }),
    onSuccess: (row) => { onOpenChange(false); onCreated(row); },
    onError: () => {
      notifyError("運営マニュアルを作れませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="運営マニュアルを新しく作る"
      size="md"
      onSubmit={(e) => { e.preventDefault(); if (ownerReady) createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>閉じる</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending || !ownerReady}>作る</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor="new-manual-title">題</Label>
          <BufferedInput
            id="new-manual-title"
            value={title}
            onCommit={setTitle}
            className="mt-1 flex h-10 w-full rounded-control-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="例: 本番当日の運営マニュアル"
          />
        </div>

        <ManualOwnerFields
          value={owner}
          onChange={setOwner}
          locked={!!lockedOwner}
          lockedLabel={lockedOwner?.label}
        />
      </div>
    </FormDialog>
  );
}
