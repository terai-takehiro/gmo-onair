import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import KanbanCard from "./KanbanCard";
import TaskDialog from "../TaskDialog";
import ColumnDialog from "../ColumnDialog";
import { useDeleteColumn } from "../../hooks/useProjectTasks";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import type { TaskColumn, ProjectTask } from "@/types";

interface Props {
  column: TaskColumn;
  tasks: ProjectTask[];
  projectId: string;
  episodeId?: string | null;
}

export default function KanbanColumn({ column, tasks, projectId, episodeId }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteColumn = useDeleteColumn(projectId);

  // 列自体のソータブル（カラム並び替え）
  const {
    attributes: colAttrs,
    listeners: colListeners,
    setNodeRef: setColRef,
    transform: colTransform,
    transition: colTransition,
    isDragging: isColDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });

  const colStyle = {
    transform: CSS.Transform.toString(colTransform),
    transition: colTransition,
    opacity: isColDragging ? 0.4 : 1,
  };

  // カード用ドロップゾーン
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `droppable-${column.id}`,
    data: { columnId: column.id },
  });

  const completed = tasks.filter((t) => t.is_completed).length;

  return (
    <>
      <div
        ref={setColRef}
        style={colStyle}
        className="flex flex-col w-72 shrink-0 bg-muted/30 rounded-xl border border-border"
        aria-label={`カラム: ${column.name}`}
        role="region"
      >
        {/* カラムヘッダー */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          {/* 列ドラッグハンドル */}
          <button
            {...colAttrs}
            {...colListeners}
            type="button"
            className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${column.name} 列をドラッグして並べ替え`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>

          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: column.color ?? "#94a3b8" }}
            aria-hidden="true"
          />

          <span className="font-medium text-sm flex-1 truncate">{column.name}</span>

          <Badge variant="secondary" className="text-xs shrink-0">
            {completed > 0 ? `${completed}/` : ""}{tasks.length}
          </Badge>

          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setEditOpen(true)}
              aria-label={`${column.name} を編集`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              aria-label={`${column.name} を削除`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* カードリスト */}
        <div
          ref={setDropRef}
          className={`flex-1 p-2 space-y-2 min-h-[120px] transition-colors ${
            isOver ? "bg-primary/5 rounded-b-xl" : ""
          }`}
        >
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                projectId={projectId}
                episodeId={episodeId}
                columnId={column.id}
              />
            ))}
          </SortableContext>

          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              タスクなし
            </p>
          )}
        </div>

        {/* タスク追加ボタン */}
        <div className="p-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full h-8 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">タスクを追加</span>
          </Button>
        </div>
      </div>

      {/* ダイアログ */}
      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        episodeId={episodeId}
        defaultColumnId={column.id}
      />
      <ColumnDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        projectId={projectId}
        existing={column}
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>「{column.name}」を削除しますか？</DialogTitle>
            <DialogDescription>
              このカラムを削除します。タスクはカラム未割り当てになります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                deleteColumn.mutate(column.id);
                setDeleteOpen(false);
              }}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
