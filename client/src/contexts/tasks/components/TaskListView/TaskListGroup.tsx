import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TaskListItem from "./TaskListItem";
import TaskDialog from "../TaskDialog";
import ColumnDialog from "../ColumnDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useDeleteColumn } from "../../hooks/useProjectTasks";
import type { TaskColumn, ProjectTask } from "@/types";

interface Props {
  column: TaskColumn | null;
  tasks: ProjectTask[];
  projectId: string;
  episodeId?: string | null;
}

export default function TaskListGroup({ column, tasks, projectId, episodeId }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteColumn = useDeleteColumn(projectId);

  const completed = tasks.filter((t) => t.is_completed).length;
  const label = column?.name ?? "未割り当て";
  const color = column?.color ?? "#94a3b8";

  return (
    <div>
      {/* グループヘッダー */}
      <div
        className="flex items-center gap-2 py-2 px-1 group sticky top-0 bg-background z-10"
        role="row"
      >
        <button
          type="button"
          onClick={() => setCollapsed((p) => !p)}
          className="flex items-center gap-2 flex-1 min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-expanded={!collapsed}
          aria-label={`${label} グループ`}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className="inline-block w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="font-medium text-sm truncate">{label}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {completed > 0 ? `${completed}/` : ""}{tasks.length}
          </Badge>
        </button>

        {/* カラム操作 (カラムありのみ) */}
        {column && (
          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => setEditOpen(true)}
              aria-label={`${label} を編集`}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              aria-label={`${label} を削除`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={() => setAddOpen(true)}
          aria-label={`${label} にタスクを追加`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* タスク一覧 */}
      {!collapsed && (
        <div className="divide-y divide-border/50">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground px-8 py-2">
              タスクなし
            </p>
          ) : (
            tasks.map((t) => (
              <TaskListItem
                key={t.id}
                task={t}
                projectId={projectId}
                episodeId={episodeId}
              />
            ))
          )}
        </div>
      )}

      {/* ダイアログ群 */}
      <TaskDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        projectId={projectId}
        episodeId={episodeId}
        defaultColumnId={column?.id ?? null}
      />

      {column && (
        <ColumnDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          projectId={projectId}
          existing={column}
        />
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>「{label}」を削除しますか？</DialogTitle>
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
                if (column) deleteColumn.mutate(column.id);
                setDeleteOpen(false);
              }}
            >
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
