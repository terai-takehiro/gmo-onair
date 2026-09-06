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
 * ── 対応済は取り消せる ──────────────────────────────────────
 *
 * 「対応済にする」は押すたびに入切します（確認を出しません）。押し間違えても
 * もう一度押せば戻り、記録も消えないためです。**消す**ほうは確認を出します。
 * ⚠️ 以前は 18px の四角（チェック）でしたが、**四角には文字が無く**
 * 「押すと何が起きるか」が読み取れなかったので、文字のボタンにしてあります。
 */
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { dueLabel, dueTone, ymd, type GpmTask } from '../../types';

/** タスク1件ぶんの props。PC の行とスマホのカードで**同じ組**を使う（写しを作らない） */
export interface TaskItemProps {
  task: GpmTask;
  today: string;
  canEdit: boolean;
  indent?: boolean;
  onToggleDone: (task: GpmTask) => void;
  onEdit: (task: GpmTask) => void;
  onDelete: (task: GpmTask) => void;
}

/** タスク1行。**工程の行より一段下げて出す**（同じ高さで並べると区別が付かない） */
export function TaskRow({
  task, today, canEdit, indent = true, onToggleDone, onEdit, onDelete,
}: TaskItemProps) {
  const due = ymd(task.due_at);
  return (
    <Row
      density="table"
      divider
      stackOnMobile
      className={cn('bg-background', indent && 'sm:pl-[68px]', task.is_completed && 'opacity-60')}
    >
      {/* 状態は文字で出す（操作は行の右端の「対応済にする」ボタン） */}
      <RowSlot w={56} align="center">
        <span className={cn('text-badge', task.is_completed ? 'text-success' : 'text-muted-foreground')}>
          {task.is_completed ? '対応済' : '—'}
        </span>
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

      <RowSlot w={200} align="right" placeholder="">
        {canEdit ? (
          <span className="flex items-center justify-end gap-1">
            <TaskDoneButton
              done={task.is_completed}
              onToggle={() => onToggleDone(task)}
              taskTitle={task.title}
              size="sm"
            />
            <button
              type="button"
              onClick={() => onEdit(task)}
              aria-label={`${task.title} を編集`}
              title="タスクを編集"
              className="rounded-control-md min-h-tap flex w-9 items-center justify-center text-muted-foreground hover:bg-muted lg:min-h-[32px]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`${task.title} を削除`}
              title="タスクを削除"
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
 * スマホのタスクカード（2行固定）。
 *
 * PC の行（`TaskRow`）を `stackOnMobile` で折り返すと、状態の文字が題名と別の行に
 * 落ち、操作ボタン（44px×2）が 56px の枠を突き破っていた。
 * スマホは**1行目 = 状態＋題名 / 2行目 = 期限・担当＋操作**に固定する。
 */
export function TaskCard({
  task, today, canEdit, indent = true, onToggleDone, onEdit, onDelete,
}: TaskItemProps) {
  const due = ymd(task.due_at);
  const iconBtn = 'rounded-control-md flex h-11 w-11 items-center justify-center text-muted-foreground hover:bg-muted';
  return (
    <div
      className={cn(
        'border-b border-border-faint px-4 py-2.5 last:border-b-0',
        indent && 'bg-background',
        task.is_completed && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn('text-badge shrink-0', task.is_completed ? 'text-success' : 'text-muted-foreground')}>
          {task.is_completed ? '対応済' : '—'}
        </span>
        <div className="min-w-0 flex-1">
          <RowTitle className={cn('font-normal', task.is_completed && 'text-muted-foreground line-through')}>
            {task.title}
          </RowTitle>
          {task.description && <RowSub>{task.description}</RowSub>}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-[38px]">
        <p className="text-sub min-w-0 flex-1 truncate">
          <span className={cn('font-number', task.is_completed ? 'text-muted-foreground' : dueTone(due, today))}>
            {dueLabel(due, today) ?? '期限なし'}
          </span>
          {task.assigned_to_name && (
            <span className="text-muted-foreground"> ・ {task.assigned_to_name}</span>
          )}
        </p>
        {canEdit && (
          <span className="flex shrink-0 items-center gap-1">
            <TaskDoneButton
              done={task.is_completed}
              onToggle={() => onToggleDone(task)}
              taskTitle={task.title}
              size="sm"
            />
            <button
              type="button"
              onClick={() => onEdit(task)}
              aria-label={`${task.title} を編集`}
              className={iconBtn}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`${task.title} を削除`}
              className={iconBtn}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 工程の下の束（タスクが0件のときの案内 ＋ 「タスクを足す」）。
 *
 * **0件のときも足す口を出します** — ひな形を選ばずに作ったプロジェクトは
 * 工程だけがあってタスクが無い状態から始まるため。
 */
export function TaskGroup({
  tasks, today, canEdit, mobile = false, onAdd, onToggleDone, onEdit, onDelete,
}: {
  tasks: GpmTask[];
  today: string;
  canEdit: boolean;
  /** スマホはカード、PC は行。**呼ぶ側の `useIsMobile()` を渡す**（ここでは判定しない） */
  mobile?: boolean;
  onAdd: () => void;
  onToggleDone: (task: GpmTask) => void;
  onEdit: (task: GpmTask) => void;
  onDelete: (task: GpmTask) => void;
}) {
  const Item = mobile ? TaskCard : TaskRow;
  return (
    <>
      {tasks.map((t) => (
        <Item
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
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />タスクを追加
          </button>
        )}
      </div>
    </>
  );
}
