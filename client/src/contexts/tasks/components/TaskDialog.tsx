import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import ChecklistItems from "./ChecklistItems";
import {
  useCreateTask,
  useUpdateTask,
  useTaskColumns,
} from "../hooks/useProjectTasks";
import {
  TaskTypeLabels,
  ProductionStepLabels,
} from "@/types";
import type {
  ProjectTask,
  TaskType,
  ProductionStep,
} from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  episodeId?: string | null;
  existing?: ProjectTask | null;
  defaultColumnId?: string | null;
}

const TASK_TYPES: TaskType[] = ["free", "checklist", "production_step", "sales"];
const PRODUCTION_STEPS: ProductionStep[] = ["script", "materials", "recording"];

export default function TaskDialog({
  open,
  onClose,
  projectId,
  episodeId,
  existing,
  defaultColumnId,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("free");
  const [productionStep, setProductionStep] = useState<ProductionStep | "">("");
  const [columnId, setColumnId] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const { data: columns = [] } = useTaskColumns(projectId);
  const { data: users = [] } = useQuery({
    queryKey: ["users-by-module-sales"],
    queryFn: async () =>
      (await api.get<{ data: Array<{ id: string; name: string }> }>("/users/by-module/sales")).data.data,
    staleTime: 60_000,
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const createTask = useCreateTask(projectId);
  const updateTask = useUpdateTask(projectId);
  const isPending = createTask.isPending || updateTask.isPending;

  useEffect(() => {
    setSaveError(null);
    if (existing) {
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setTaskType(existing.task_type);
      setProductionStep(existing.production_step ?? "");
      setColumnId(existing.column_id ?? "");
      setAssignedTo(existing.assigned_to ?? "");
      setStartDate(existing.start_date ?? "");
      setDueDate(existing.due_date ?? "");
    } else {
      setTitle("");
      setDescription("");
      setTaskType("free");
      setProductionStep("");
      setColumnId(defaultColumnId ?? "");
      setAssignedTo("");
      setStartDate("");
      setDueDate("");
    }
  }, [existing, defaultColumnId, open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaveError(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      task_type: taskType,
      production_step: (taskType === "production_step" && productionStep) ? productionStep as ProductionStep : null,
      column_id: columnId || null,
      episode_id: episodeId ?? null,
      assigned_to: assignedTo || null,
      start_date: startDate || null,
      due_date: dueDate || null,
    };

    try {
      if (existing) {
        await updateTask.mutateAsync({ id: existing.id, ...payload });
      } else {
        await createTask.mutateAsync(payload);
      }
      onClose();
    } catch {
      setSaveError("保存に失敗しました。もう一度お試しください。");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "タスクを編集" : "タスクを追加"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* タイトル */}
          <div className="space-y-1">
            <Label htmlFor="task-title">タスク名 *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タスク名を入力..."
              autoFocus
            />
          </div>

          {/* 種別 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>種別</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TaskTypeLabels[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {taskType === "production_step" && (
              <div className="space-y-1">
                <Label>制作ステップ</Label>
                <Select
                  value={productionStep}
                  onValueChange={(v) => setProductionStep(v as ProductionStep)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCTION_STEPS.map((s) => (
                      <SelectItem key={s} value={s}>{ProductionStepLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* カラム */}
          <div className="space-y-1">
            <Label>カラム</Label>
            <Select
              value={columnId || "_none_"}
              onValueChange={(v) => setColumnId(v === "_none_" ? "" : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">未割り当て</SelectItem>
                {columns.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: col.color ?? "#94a3b8" }}
                      />
                      {col.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 担当者 */}
          <div className="space-y-1">
            <Label>担当者</Label>
            <Select
              value={assignedTo || "_none_"}
              onValueChange={(v) => setAssignedTo(v === "_none_" ? "" : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none_">なし</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 期間 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-start">開始日</Label>
              <Input
                id="task-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-due">期日</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* メモ */}
          <div className="space-y-1">
            <Label htmlFor="task-desc">メモ</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="詳細・備考..."
              rows={3}
            />
          </div>

          {/* チェックリスト子タスク (既存タスクのみ) */}
          {existing && taskType === "checklist" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>チェック項目</Label>
                {existing.children && existing.children.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {existing.children.filter((c) => c.is_completed).length}/{existing.children.length}
                  </Badge>
                )}
              </div>
              <ChecklistItems projectId={projectId} parentTask={existing} />
            </div>
          )}
        </div>

        {saveError && (
          <p className="text-sm text-destructive text-right">{saveError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            キャンセル
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim() || isPending}>
            {existing ? "更新" : "追加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
