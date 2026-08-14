/**
 * 工程の下に並ぶタスク — ③ プロジェクト詳細「概要」
 *
 * ── なぜ工程の中に入れるか ──────────────────────────────────
 *
 * これまで工程は「3 / 7」の件数しか出していませんでした。件数だけだと
 * **何が終わっていないのかがこの画面から分からず**、⑤ 全プロジェクトの
 * タスクへ行って絞り込み直すことになります。工程を見に来た人が知りたいのは
 * 「あと何が残っているか」なので、開いたらそこに出します。
 *
 * ── 既定は閉じている ────────────────────────────────────────
 *
 * 7工程 × 4〜5タスクで 30行を超えるので、**全部開いた状態を既定にしません**。
 * 開いているかどうかは呼ぶ側（詳細画面）が持ちます — 行の中に持たせると
 * 並べ替えで行が作り直された瞬間に閉じます。
 *
 * ── 完了は取り消せる ────────────────────────────────────────
 *
 * チェックは押すたびに入切します（確認を出しません）。押し間違えても
 * もう一度押せば戻り、記録も消えないためです。**消す**ほうは確認を出します。
 */
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { dueLabel, dueTone, ymd, type GpmTask } from '../../types';

/** タスク1行。**工程の行より一段下げて出す**（同じ高さで並べると区別が付かない） */
export function TaskRow({
  task, today, canEdit, indent = true, onToggleDone, onEdit, onDelete,
}: {
  task: GpmTask;
  today: string;
  canEdit: boolean;
  indent?: boolean;
  onToggleDone: (task: GpmTask) => void;
  onEdit: (task: GpmTask) => void;
  onDelete: (task: GpmTask) => void;
}) {
  const due = ymd(task.due_at);
  return (
    <Row
      density="table"
      divider
      stackOnMobile
      className={cn('bg-background', indent && 'sm:pl-[68px]', task.is_completed && 'opacity-60')}
    >
      <RowSlot w={56} align="center">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onToggleDone(task)}
            aria-label={task.is_completed ? `${task.title} を未完了に戻す` : `${task.title} を完了にする`}
            /* 見た目は 18px のまま、当たり判定だけ 44px にする（M10・`v4-tap`） */
            className={cn(
              'v4-tap rounded-badge-xs flex h-[18px] w-[18px] items-center justify-center border-[1.5px]',
              task.is_completed ? 'border-success bg-success' : 'border-border-disabled hover:border-primary',
            )}
          >
            {task.is_completed && <Check className="h-3 w-3 text-success-foreground" aria-hidden="true" />}
          </button>
        ) : (
          <span className={cn('text-badge', task.is_completed ? 'text-success' : 'text-muted-foreground')}>
            {task.is_completed ? '完了' : '—'}
          </span>
        )}
      </RowSlot>

      <RowMain>
        <RowTitle className={cn('font-normal', task.is_completed && 'text-muted-foreground line-through')}>
          {task.title}
        </RowTitle>
        {task.description && <RowSub>{task.description}</RowSub>}
      </RowMain>

      <RowSlot w={96} hideOnMobile placeholder="担当なし">
        {task.assigned_to_name
          ? <span className="text-sub-sm truncate text-muted-foreground">{task.assigned_to_name}</span>
          : null}
      </RowSlot>

      <RowSlot
        w={96}
        className={cn('text-sub font-number', task.is_completed ? 'text-muted-foreground' : dueTone(due, today))}
        placeholder="期限なし"
      >
        {dueLabel(due, today)}
      </RowSlot>

      <RowSlot w={56} align="right" placeholder="">
        {canEdit ? (
          <span className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => onEdit(task)}
              aria-label={`${task.title} を直す`}
              title="タスクを直す"
              className="rounded-control-md min-h-tap flex w-9 items-center justify-center text-muted-foreground hover:bg-muted lg:min-h-[32px]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`${task.title} を消す`}
              title="タスクを消す"
              className="rounded-control-md min-h-tap flex w-9 items-center justify-center text-muted-foreground hover:bg-muted lg:min-h-[32px]"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </RowSlot>
    </Row>
  );
}

/**
 * 工程の下の束（タスクが0件のときの案内 ＋ 「タスクを足す」）。
 *
 * **0件のときも足す口を出します** — ひな形を選ばずに作ったプロジェクトは
 * 工程だけがあってタスクが無い状態から始まるため。
 */
export function TaskGroup({
  tasks, today, canEdit, onAdd, onToggleDone, onEdit, onDelete,
}: {
  tasks: GpmTask[];
  today: string;
  canEdit: boolean;
  onAdd: () => void;
  onToggleDone: (task: GpmTask) => void;
  onEdit: (task: GpmTask) => void;
  onDelete: (task: GpmTask) => void;
}) {
  return (
    <>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          today={today}
          canEdit={canEdit}
          onToggleDone={onToggleDone}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      <div className="bg-background flex flex-wrap items-center gap-2 border-b border-border-faint px-4 py-2 last:border-b-0 sm:pl-[68px]">
        {tasks.length === 0 && (
          <p className="text-sub-sm min-w-0 flex-1 text-muted-foreground">この工程にタスクはありません。</p>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="text-sub min-h-tap inline-flex items-center gap-1 text-primary hover:underline lg:min-h-[32px]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />タスクを足す
          </button>
        )}
      </div>
    </>
  );
}
