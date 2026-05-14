import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { useCreateTask, useToggleComplete, useDeleteTask } from "../hooks/useProjectTasks";
import type { ProjectTask } from "@/types";

interface Props {
  projectId: string;
  parentTask: ProjectTask;
}

export default function ChecklistItems({ projectId, parentTask }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const createTask = useCreateTask(projectId);
  const toggleComplete = useToggleComplete(projectId);
  const deleteTask = useDeleteTask(projectId);

  const children = parentTask.children ?? [];

  const handleAdd = async () => {
    const t = newTitle.trim();
    if (!t) return;
    await createTask.mutateAsync({
      title: t,
      task_type: "checklist",
      column_id: parentTask.column_id,
      episode_id: parentTask.episode_id,
      parent_task_id: parentTask.id,
    });
    setNewTitle("");
  };

  return (
    <div className="space-y-2">
      {children.map((child) => (
        <div key={child.id} className="flex items-center gap-2 group min-h-[44px]">
          <Checkbox
            checked={child.is_completed}
            onCheckedChange={() => toggleComplete.mutate(child.id)}
            aria-label={`${child.title} 完了チェック`}
            className="shrink-0"
          />
          <span
            className={`flex-1 text-sm ${child.is_completed ? "line-through text-muted-foreground" : ""}`}
          >
            {child.title}
          </span>
          <button
            type="button"
            onClick={() => deleteTask.mutate(child.id)}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${child.title} を削除`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <div className="flex gap-2 items-center">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="チェック項目を追加..."
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0"
          onClick={handleAdd}
          disabled={!newTitle.trim() || createTask.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
