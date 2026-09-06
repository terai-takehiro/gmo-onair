/**
 * ③ プロジェクト詳細「概要」のかんばん表示 — 列は工程・カードはタスク
 *
 * ── 案件タスクの `KanbanView` を呼ばずに別に作った理由 ────────
 *
 * あちらの列は案件ごとの自由カラム（`task_columns`）です。プロジェクト管理には
 * すでに**工程**という構造があるので、別の列をもう1系統作らせると
 * 「工程では設計中なのにカラムでは施工中」という食い違いが必ず起きます。
 * ここでは列 = 工程（＋「工程なし」）にし、カードのドラッグは
 * **工程の付け替え**（`PUT /gpm/tasks/:id` の `gpm_phase_id`）だけを意味します。
 * ドラッグの道具（dnd-kit・PointerSensor の distance でタップと区別）は同じです。
 *
 * ── 列の中の並び ────────────────────────────────────────────
 *
 * 一覧と同じ並び（未完了が先・期限が近い順）。手で並べ替える機能は
 * まだ持たせない — 期限と食い違う手動の並びは「どちらが正か」を生む。
 * ドラッグで列に落とすと、その工程の**末尾**に付く（`sort_order` は既存のまま）。
 */
import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useInvalidateGpm } from '../../queries';
import {
  PHASE_STATE_LABEL, PHASE_STATE_TONE, dueLabel, dueTone, ymd,
  type GpmPhase, type GpmProjectDetail, type GpmTask,
} from '../../types';

/** 「工程なし」列の droppable id（工程 id と衝突しない固定値） */
const NONE_COL = 'gpm-kanban-none';

export function GpmKanbanView({
  project, tasks, today, canEdit, onEditTask, onAddTask, onToggleDone,
}: {
  project: GpmProjectDetail;
  tasks: GpmTask[];
  today: string;
  canEdit: boolean;
  onEditTask: (task: GpmTask) => void;
  onAddTask: (phaseId: string | null) => void;
  onToggleDone: (task: GpmTask) => void;
}) {
  const invalidate = useInvalidateGpm();
  const [active, setActive] = useState<GpmTask | null>(null);
  // タップ（クリック）とドラッグを距離で区別する（案件の KanbanView と同じ値）
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const move = useMutation({
    mutationFn: ({ task, phaseId }: { task: GpmTask; phaseId: string | null }) =>
      api.put(`/gpm/tasks/${task.id}`, { gpm_phase_id: phaseId }),
    onSuccess: () => invalidate(project.id),
    onError: (err) => notifyApiError('タスクを動かせませんでした', err),
  });

  const byPhase = (phaseId: string | null) =>
    tasks.filter((t) => (t.phase_id ?? null) === phaseId);

  const onDragStart = (e: DragStartEvent) => {
    setActive(tasks.find((t) => t.id === e.active.id) ?? null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const { active: a, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t.id === a.id);
    if (!task) return;
    // 落とした先: 列そのものか、列の中のカード（そのカードの列に落とす）
    let target: string | null | undefined;
    const overId = String(over.id);
    if (overId === NONE_COL) target = null;
    else if (project.phases.some((p) => p.id === overId)) target = overId;
    else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) target = overTask.phase_id ?? null;
    }
    if (target === undefined || target === (task.phase_id ?? null)) return;
    move.mutate({ task, phaseId: target });
  };

  return (
    // **落とす先は指の位置で決める**（`pointerWithin`）。既定の rect 交差だと、
    // 幅いっぱいのカードが隣の列に少し重なっただけで隣へ落ちる
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {canEdit && (
        <p className="text-note text-muted-foreground">
          カードをドラッグすると工程を付け替えられます。カードを押すと編集できます。
        </p>
      )}
      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {project.phases.map((ph) => (
          <Column
            key={ph.id}
            id={ph.id}
            title={ph.label}
            phase={ph}
            tasks={byPhase(ph.id)}
            today={today}
            canEdit={canEdit}
            onEditTask={onEditTask}
            onAddTask={() => onAddTask(ph.id)}
            onToggleDone={onToggleDone}
          />
        ))}
        <Column
          id={NONE_COL}
          title="工程なし"
          phase={null}
          tasks={byPhase(null)}
          today={today}
          canEdit={canEdit}
          onEditTask={onEditTask}
          onAddTask={() => onAddTask(null)}
          onToggleDone={onToggleDone}
        />
      </div>
      <DragOverlay>
        {active && <CardBody task={active} today={today} dragging />}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  id, title, phase, tasks, today, canEdit, onEditTask, onAddTask, onToggleDone,
}: {
  id: string;
  title: string;
  phase: GpmPhase | null;
  tasks: GpmTask[];
  today: string;
  canEdit: boolean;
  onEditTask: (task: GpmTask) => void;
  onAddTask: () => void;
  onToggleDone: (task: GpmTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const done = tasks.filter((t) => t.is_completed).length;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-64 shrink-0 flex-col gap-2 rounded-card border bg-surface-subtle p-2.5',
        isOver ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border-subtle',
      )}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        <span className="text-list min-w-0 flex-1 truncate font-bold" title={title}>{title}</span>
        {phase && (
          <TableBadge w={null} label={PHASE_STATE_LABEL[phase.state]} className={PHASE_STATE_TONE[phase.state]} />
        )}
        <span className="text-sub-sm font-number shrink-0 text-muted-foreground">{done}/{tasks.length}</span>
      </div>

      {tasks.length === 0 && (
        <p className="text-sub-sm rounded-card border border-dashed border-border px-2 py-3 text-center text-muted-foreground">
          タスクなし
        </p>
      )}
      {tasks.map((t) => (
        <Card key={t.id} task={t} today={today} canEdit={canEdit} onEdit={onEditTask} onToggleDone={onToggleDone} />
      ))}

      {canEdit && (
        <button
          type="button"
          onClick={onAddTask}
          className="text-sub min-h-tap inline-flex items-center justify-center gap-1 rounded-card border border-dashed border-border py-1.5 text-muted-foreground hover:border-primary-border-strong hover:text-primary lg:min-h-[32px]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />タスクを追加
        </button>
      )}
    </div>
  );
}

function Card({
  task, today, canEdit, onEdit, onToggleDone,
}: {
  task: GpmTask;
  today: string;
  canEdit: boolean;
  onEdit: (task: GpmTask) => void;
  onToggleDone: (task: GpmTask) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: task.id,
    disabled: !canEdit,
  });
  // **元のカードは動かさない**（薄くするだけ）。動く見た目は DragOverlay のゴーストが担う —
  // 両方を動かすと dnd-kit が測る矩形がずれ、狙いの1つ隣の列に落ちる（実測で踏んだ）
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-40', canEdit && 'cursor-grab')}
    >
      <CardBody
        task={task}
        today={today}
        onClick={canEdit ? () => onEdit(task) : undefined}
        onToggleDone={canEdit ? () => onToggleDone(task) : undefined}
      />
    </div>
  );
}

/** カードの見た目（DragOverlay のゴーストと共用するため分けてある） */
function CardBody({
  task, today, dragging, onClick, onToggleDone,
}: {
  task: GpmTask;
  today: string;
  dragging?: boolean;
  onClick?: () => void;
  onToggleDone?: () => void;
}) {
  const due = ymd(task.due_at);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
      className={cn(
        'rounded-card border border-border bg-card px-2.5 py-2 text-left',
        dragging && 'shadow-lg',
        onClick && 'hover:border-primary-border-strong',
        task.is_completed && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className={cn('text-sub min-w-0 flex-1', task.is_completed && 'text-muted-foreground line-through')}>
          {task.title}
        </p>
      </div>
      {(due || task.assigned_to_name) && (
        <div className="mt-1 flex items-center gap-2">
          {due && (
            <span className={cn('text-sub-sm font-number', task.is_completed ? 'text-muted-foreground' : dueTone(due, today))}>
              {dueLabel(due, today)}
            </span>
          )}
          {task.assigned_to_name && (
            <span className="text-sub-sm min-w-0 truncate text-muted-foreground">{task.assigned_to_name}</span>
          )}
        </div>
      )}

      {/* カードは幅が狭いので**下に1行**で置く（掴んで運ぶ操作に渡さないのは部品側の役目） */}
      {onToggleDone && (
        <TaskDoneButton
          done={task.is_completed}
          onToggle={onToggleDone}
          taskTitle={task.title}
          size="sm"
          className="mt-1.5 w-full"
        />
      )}
    </div>
  );
}
