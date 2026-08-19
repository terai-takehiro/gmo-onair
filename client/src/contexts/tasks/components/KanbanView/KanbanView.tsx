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
import { LayoutTemplate, List } from "lucide-react";
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
  /** 「リストで見る」導線用（未割り当てタスクの案内から呼ぶ）。渡さなければボタンごと出さない */
  onSwitchToList?: () => void;
}

export default function KanbanView({ projectId, episodeId, onSwitchToList }: Props) {
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
  /*
   * ⚠️ **カラムが0件でもタスクが有るとは限らない訳ではない**（UXレポート 2026-08-18 指摘）。
   * 以前は `noColumns` のときタスクの有無を見ずに「まだカラムがありません」だけを
   * 出しており、進捗帯（`HealthStrip`）は「0%（0/3）」のようにタスクの実数を出すのに
   * カンバンだけ0件に見える、という食い違いが起きていた。ここでタスク件数を出し、
   * リスト表示への導線を添える（実データが有ることを隠さない）
   */
  const unassignedTasks = tasks.filter((t) => !t.column_id);

  return (
    <>
      {noColumns ? (
        <div className="flex flex-col items-center justify-center flex-1 py-16 text-center">
          <p className="text-muted-foreground text-sm mb-1">
            まだカラムがありません
          </p>
          {tasks.length > 0 && (
            <p className="text-muted-foreground text-xs mb-4">
              未割り当てのタスクが <span className="font-medium text-foreground">{tasks.length}</span> 件あります。
              {onSwitchToList && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onSwitchToList}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    リスト表示で見る
                  </button>
                </>
              )}
            </p>
          )}
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
          {/*
            未割り当てタスクの案内。**カラムには出さない** — `getTasksByColumn` は
            `column_id` の完全一致でしか振り分けないため（下記）、`column_id === null`
            のタスクはどのカラムにも表示されない。ドラッグ＆ドロップ対応の専用カラムに
            するとカラムの削除・編集ダイアログまで持たせることになり手間が大きいので、
            まずはリスト表示（`TaskListView` は「未割り当て」グループとして明示している）
            への案内だけを出し、実データが隠れないようにする
          */}
          {unassignedTasks.length > 0 && (
            <div className="rounded-note mb-3 flex items-center gap-2 border border-warning-border bg-warning-surface px-3.5 py-2 text-note text-secondary-foreground">
              <span>
                カラム未割り当てのタスクが <span className="font-medium text-warning">{unassignedTasks.length}</span> 件あります（この板には出ません）。
              </span>
              {onSwitchToList && (
                <button
                  type="button"
                  onClick={onSwitchToList}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                >
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                  リスト表示で見る
                </button>
              )}
            </div>
          )}

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
