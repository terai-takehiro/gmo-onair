import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  User,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useToggleComplete, useDeleteTask } from "../../hooks/useProjectTasks";
import TaskDialog from "../TaskDialog";
import ChecklistItems from "../ChecklistItems";
import type { ProjectTask } from "@/types";
import { TaskTypeLabels, ProductionStepLabels } from "@/types";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface Props {
  task: ProjectTask;
  projectId: string;
  episodeId?: string | null;
}

function formatDate(d: string) {
  try {
    return format(new Date(d), "M/d", { locale: ja });
  } catch {
    return d;
  }
}

export default function TaskListItem({ task, projectId, episodeId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const toggleComplete = useToggleComplete(projectId);
  const deleteTask = useDeleteTask(projectId);

  const completedChildren = task.children?.filter((c) => c.is_completed).length ?? 0;
  const totalChildren = task.children?.length ?? 0;

  const isOverdue =
    task.due_date && !task.is_completed && new Date(task.due_date) < new Date();

  return (
    <>
      <div
      className={`group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50 min-h-tap ${
          task.is_completed ? "opacity-60" : ""
        }`}
      >
        {/* チェックボックス */}
        <Checkbox
          checked={task.is_completed}
          onCheckedChange={() => toggleComplete.mutate(task.id)}
          aria-label={`${task.title} 完了チェック`}
          className="mt-0.5 shrink-0"
        />

        {/* メインコンテンツ */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${
                task.is_completed ? "line-through text-muted-foreground" : ""
              }`}
            >
              {task.title}
            </span>

            {/* AI 作成バッジ (MCP create_task 由来) */}
            {task.is_ai_created && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 text-[10px] font-medium text-violet-700 h-5 shrink-0"
                title={task.ai_requested_by ? `AI が作りました (指示: ${task.ai_requested_by})` : "AI が作りました"}
              >
                <Sparkles className="h-3 w-3" />
                AI作成
              </span>
            )}

            {/* 種別バッジ */}
            {task.task_type !== "free" && (
              <Badge variant="outline" className="text-xs h-5 shrink-0">
                {task.task_type === "production_step" && task.production_step
                  ? ProductionStepLabels[task.production_step]
                  : TaskTypeLabels[task.task_type]}
              </Badge>
            )}

            {/* カラム色ドット */}
            {task.column_color && (
              <span
                className="inline-block w-2 h-2 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: task.column_color }}
                aria-hidden="true"
              />
            )}
          </div>

          {/* メタ情報 */}
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {/* 期日 */}
            {task.due_date && (
              <span
                className={`flex items-center gap-1 text-xs ${
                  isOverdue ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <Calendar className="h-3 w-3" />
                {task.start_date && task.start_date !== task.due_date
                  ? `${formatDate(task.start_date)} 〜 ${formatDate(task.due_date)}`
                  : formatDate(task.due_date)}
              </span>
            )}

            {/* 担当者 */}
            {task.assigned_to_name && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                {task.assigned_to_name}
              </span>
            )}

            {/* チェックリスト進捗 */}
            {task.task_type === "checklist" && totalChildren > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                onClick={() => setExpanded((p) => !p)}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {completedChildren}/{totalChildren}
              </button>
            )}
          </div>
        </div>

        {/* アクションボタン (タッチ端末では常時表示・sm以上はhover) */}
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEditOpen(true)}
            aria-label={`${task.title} を編集`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={async () => { if ((await confirmAction({ title: `「${task.title}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) deleteTask.mutate(task.id); }}
            aria-label={`${task.title} を削除`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* チェックリスト展開 */}
      {task.task_type === "checklist" && expanded && (
        <div className="ml-9 pr-3 pb-2">
          <ChecklistItems projectId={projectId} parentTask={task} />
        </div>
      )}

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
