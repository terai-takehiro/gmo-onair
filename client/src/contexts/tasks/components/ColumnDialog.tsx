import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const createCol = useCreateColumn(projectId);
  const updateCol = useUpdateColumn(projectId);

  useEffect(() => {
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
    if (existing) {
      await updateCol.mutateAsync({ id: existing.id, name: name.trim(), color });
    } else {
      await createCol.mutateAsync({ name: name.trim(), color });
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "カラムを編集" : "カラムを追加"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="col-name">カラム名</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
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

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim() || isPending}>
            {existing ? "更新" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
