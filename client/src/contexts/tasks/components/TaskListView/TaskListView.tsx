import { useState } from "react";
import { Plus, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskListGroup from "./TaskListGroup";
import TaskDialog from "../TaskDialog";
import ColumnDialog from "../ColumnDialog";
import TemplatePickerDialog from "../TemplatePickerDialog";
import { useTaskColumns, useProjectTasks } from "../../hooks/useProjectTasks";
import type { ProjectTask } from "@/types";

interface Props {
  projectId: string;
  episodeId?: string | null;
}

export default function TaskListView({ projectId, episodeId }: Props) {
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [addColOpen, setAddColOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const { data: columns = [] } = useTaskColumns(projectId);
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);

  const noColumns = columns.length === 0;

  // タスクをカラム別にグループ化
  const colGroups = columns.map((col) => ({
    column: col,
    tasks: tasks.filter((t) => t.column_id === col.id),
  }));

  // カラム未割り当てタスク
  const unassigned: ProjectTask[] = tasks.filter((t) => t.column_id === null);

  return (
    <div className="flex flex-col h-full">
      {/* ツールバー */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setAddTaskOpen(true)}
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            タスク追加
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddColOpen(true)}
            className="h-8 gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            カラム追加
          </Button>
        </div>

        {noColumns && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setTemplateOpen(true)}
            className="h-8 gap-1.5"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            テンプレートから開始
          </Button>
        )}
      </div>

      {/* カラムなし空状態 */}
      {noColumns && tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            まだタスクがありません
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTemplateOpen(true)}
            className="gap-1.5"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            テンプレートからカラムを追加
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border overflow-y-auto flex-1">
          {colGroups.map(({ column, tasks: colTasks }) => (
            <div key={column.id} className="py-1">
              <TaskListGroup
                column={column}
                tasks={colTasks}
                projectId={projectId}
                episodeId={episodeId}
              />
            </div>
          ))}

          {/* 未割り当て */}
          {(unassigned.length > 0 || noColumns) && (
            <div className="py-1">
              <TaskListGroup
                column={null}
                tasks={unassigned}
                projectId={projectId}
                episodeId={episodeId}
              />
            </div>
          )}
        </div>
      )}

      {/* ダイアログ */}
      <TaskDialog
        open={addTaskOpen}
        onClose={() => setAddTaskOpen(false)}
        projectId={projectId}
        episodeId={episodeId}
      />
      <ColumnDialog
        open={addColOpen}
        onClose={() => setAddColOpen(false)}
        projectId={projectId}
      />
      <TemplatePickerDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
