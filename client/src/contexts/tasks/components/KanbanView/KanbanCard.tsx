import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, User, Pencil, Trash2, GripVertical, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import TaskDialog from "../TaskDialog";
import { useToggleComplete, useDeleteTask } from "../../hooks/useProjectTasks";
import type { ProjectTask } from "@/types";
import { TaskTypeLabels, ProductionStepLabels } from "@/types";

interface Props {
  task: ProjectTask;
  projectId: string;
  episodeId?: string | null;
  columnId: string;
}

export default function KanbanCard({ task, projectId, episodeId, columnId }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const toggleComplete = useToggleComplete(projectId);
  const deleteTask = useDeleteTask(projectId);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "card", columnId } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isOverdue =
    task.due_date && !task.is_completed && new Date(task.due_date) < new Date();

  const taskTypeLabel =
    task.task_type === "production_step" && task.production_step
      ? ProductionStepLabels[task.production_step]
      : task.task_type !== "free"
      ? TaskTypeLabels[task.task_type]
      : null;

  const childrenCount = task.children?.length ?? 0;
  const completedChildren = task.children?.filter((c) => c.is_completed).length ?? 0;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={`group bg-card rounded-lg border border-border shadow-sm p-3 ${
          task.is_completed ? "opacity-60" : ""
        } ${isDragging ? "shadow-lg" : "hover:shadow-md"} transition-shadow`}
        aria-label={`タスク: ${task.title}`}
      >
        <div className="flex items-start gap-2">
          {/* ドラッグハンドル */}
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="ドラッグして並べ替え"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          {/* チェックボックス */}
          <Checkbox
            checked={task.is_completed}
            onCheckedChange={() => toggleComplete.mutate(task.id)}
            aria-label={`${task.title} 完了チェック`}
            className="mt-0.5 shrink-0"
          />

          {/* コンテンツ */}
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium leading-snug ${
                task.is_completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {task.title}
            </p>

            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {/* AI 作成バッジ (MCP create_task 由来) */}
              {task.is_ai_created && (
                <span
                  className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 text-[10px] font-medium text-violet-700 h-4"
                  title={task.ai_requested_by ? `AI作成 (指示: ${task.ai_requested_by})` : "AI作成"}
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  AI作成
                </span>
              )}

              {/* 種別バッジ */}
              {taskTypeLabel && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                  {taskTypeLabel}
                </Badge>
              )}

              {/* 期日 */}
              {task.due_date && (
                <span
                  className={`flex items-center gap-0.5 text-[10px] ${
                    isOverdue ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  {format(new Date(task.due_date), "M/d", { locale: ja })}
                </span>
              )}

              {/* 担当者 */}
              {task.assigned_to_name && (
                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  {task.assigned_to_name}
                </span>
              )}

              {/* チェックリスト進捗 */}
              {task.task_type === "checklist" && childrenCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ✓ {completedChildren}/{childrenCount}
                </span>
              )}
            </div>
          </div>

          {/* アクション (タッチ端末では常時表示・sm以上はhover) */}
          <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 shrink-0">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 sm:h-6 sm:w-6"
              onClick={() => setEditOpen(true)}
              aria-label={`${task.title} を編集`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 sm:h-6 sm:w-6 text-muted-foreground hover:text-destructive"
              onClick={() => { if (window.confirm(`「${task.title}」を削除しますか？`)) deleteTask.mutate(task.id); }}
              aria-label={`${task.title} を削除`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <TaskDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projectId={projectId}
        episodeId={episodeId}
        existing={task}
      />
    </>
  );
}
