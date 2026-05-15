import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import KanbanColumn from "./KanbanColumn";
import KanbanCard from "./KanbanCard";
import AddColumnButton from "./AddColumnButton";
import TemplatePickerDialog from "../TemplatePickerDialog";
import {
  useTaskColumns,
  useProjectTasks,
  useMoveTask,
  useReorderColumns,
} from "../../hooks/useProjectTasks";
import type { TaskColumn, ProjectTask } from "@/types";

interface Props {
  projectId: string;
  episodeId?: string | null;
}

export default function KanbanView({ projectId, episodeId }: Props) {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<ProjectTask | null>(null);
  const [activeColumn, setActiveColumn] = useState<TaskColumn | null>(null);

  const { data: columns = [] } = useTaskColumns(projectId);
  const { data: tasks = [] } = useProjectTasks(projectId, episodeId);
  const moveTask = useMoveTask(projectId);
  const reorderColumns = useReorderColumns(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getTasksByColumn = useCallback(
    (colId: string) => tasks.filter((t) => t.column_id === colId),
    [tasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "card") {
      const task = tasks.find((t) => t.id === active.id);
      setActiveTask(task ?? null);
    } else if (active.data.current?.type === "column") {
      const col = columns.find((c) => c.id === active.id);
      setActiveColumn(col ?? null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setActiveColumn(null);

    if (!over) return;

    const activeType = active.data.current?.type;

    if (activeType === "column") {
      // カラム並び替え
      const oldIdx = columns.findIndex((c) => c.id === active.id);
      const newIdx = columns.findIndex((c) => c.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        const reordered = arrayMove(columns, oldIdx, newIdx);
        reorderColumns.mutate(
          reordered.map((col, i) => ({ id: col.id, sort_order: i }))
        );
      }
      return;
    }

    if (activeType === "card") {
      const activeColumnId = active.data.current?.columnId as string;

      // ドロップ先のカラムIDを解決
      let targetColumnId = over.data.current?.columnId as string | undefined;
      if (!targetColumnId && over.data.current?.type === "column") {
        targetColumnId = over.id as string;
      }
      if (!targetColumnId) {
        // droppable- プレフィックスのゾーンへのドロップ
        const overId = over.id as string;
        if (overId.startsWith("droppable-")) {
          targetColumnId = overId.replace("droppable-", "");
        } else {
          targetColumnId = activeColumnId;
        }
      }

      const targetTasks = getTasksByColumn(targetColumnId);
      const overTask = tasks.find((t) => t.id === over.id);
      const newSortOrder = overTask
        ? overTask.sort_order
        : targetTasks.length;

      moveTask.mutate({
        id: active.id as string,
        column_id: targetColumnId,
        sort_order: newSortOrder,
      });
    }
  };

  const noColumns = columns.length === 0;

  return (
    <>
      {noColumns ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
          <p className="text-muted-foreground text-sm mb-4">
            まだカラムがありません
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* 横スクロールコンテナ */}
          <div className="flex gap-4 overflow-x-auto pb-4 h-full items-start">
            <SortableContext
              items={columns.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tasks={getTasksByColumn(col.id)}
                  projectId={projectId}
                  episodeId={episodeId}
                />
              ))}
            </SortableContext>

            <AddColumnButton projectId={projectId} />
          </div>

          {/* ドラッグ中のゴースト表示 */}
          <DragOverlay>
            {activeTask && (
              <KanbanCard
                task={activeTask}
                projectId={projectId}
                episodeId={episodeId}
                columnId={activeTask.column_id ?? ""}
              />
            )}
            {activeColumn && (
              <div className="w-72 bg-muted/50 rounded-xl border border-border opacity-80 p-3">
                <span className="font-medium text-sm">{activeColumn.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <TemplatePickerDialog
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        projectId={projectId}
      />
    </>
  );
}
