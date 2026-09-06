import { useState, useEffect } from "react";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateColumn, useUpdateColumn } from "../hooks/useProjectTasks";
import type { TaskColumn } from "@/types";

const PRESET_COLORS = [
  "#94a3b8", "#60a5fa", "#a78bfa", "#fb923c",
  "#facc15", "#4ade80", "#f87171", "#f0abfc",
];

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  existing?: TaskColumn | null;
}

export default function ColumnDialog({ open, onClose, projectId, existing }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createCol = useCreateColumn(projectId);
  const updateCol = useUpdateColumn(projectId);

  useEffect(() => {
    setSaveError(null);
    if (existing) {
      setName(existing.name);
      setColor(existing.color ?? PRESET_COLORS[0]);
    } else {
      setName("");
      setColor(PRESET_COLORS[0]);
    }
  }, [existing, open]);

  const isPending = createCol.isPending || updateCol.isPending;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaveError(null);
    try {
      if (existing) {
        await updateCol.mutateAsync({ id: existing.id, name: name.trim(), color });
      } else {
        await createCol.mutateAsync({ name: name.trim(), color });
      }
      onClose();
    } catch {
      setSaveError("保存できませんでした。もう一度お試しください。");
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "カラムを編集" : "カラムを追加"}
      // Enter で保存する。カラム名の欄で個別に拾っていた `onKeyDown` は
      // ここへ寄せた（同じ役目を2か所で持たない）。送信は `type="submit"` の1本だけ
      onSubmit={(e) => { e.preventDefault(); if (name.trim() && !isPending) handleSave(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button type="submit" size="sm" disabled={!name.trim() || isPending}>
            {existing ? "更新" : "追加"}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="col-name">カラム名</Label>
          <Input
            id="col-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 進行中"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label>カラーラベル</Label>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-7 h-7 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  color === c ? "border-foreground scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`カラー ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
      </div>

      {saveError && (
        <p className="text-sm text-destructive text-right">{saveError}</p>
      )}
    </FormDialog>
  );
}
