/**
 * ⑤ タスクと持ち帰り — タスクタブの表本体（PC）
 *
 * `GpmTaskListPage.tsx` から切り出した（1ファイル400行の上限・`client/CLAUDE.md`）。
 *
 * 列は タスク・プロジェクト（伸びる）／ 工程(128px) ／ 担当(96px) ／ 期限(96px) ／
 * 対応(128px・`canEdit` のときだけ) の5列。片づける操作は共通部品 `TaskDoneButton`
 * （「対応済にする」文字のボタン。旧・四角のチェックは全アプリで置き換え済み — PR
 * 「ToDoの完了チェックを『対応済にする』ボタンに替えた」）を使う。スマホのカード
 * （`TaskCards.tsx`）と同じ部品・同じ判定（`dueTone`/`dueLabel`/`PHASE_STATE_TONE`）
 * を読むので、写して書くと PC とスマホで違う日に赤くなる。
 */
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  PHASE_STATE_TONE, dueLabel, dueTone, ymd, type GpmTask,
} from '../../types';

export function TaskRowsHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>タスク ／ プロジェクト</RowMain>
      <RowSlot w={128}>工程</RowSlot>
      <RowSlot w={96}>担当</RowSlot>
      <RowSlot w={96}>期限</RowSlot>
      {canEdit && <RowSlot w={128} align="center">対応</RowSlot>}
    </RowHeader>
  );
}

export function TaskRow({
  t, today, canEdit, onToggleDone, togglePending, onOpenProject,
}: {
  t: GpmTask;
  today: string;
  canEdit: boolean;
  onToggleDone: (t: GpmTask) => void;
  togglePending: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  const due = ymd(t.due_at);
  return (
    <Row divider stackOnMobile className={cn(t.is_completed && 'opacity-60')}>
      <RowMain>
        <RowTitle className={cn(t.is_completed && 'line-through')}>{t.title}</RowTitle>
        <RowSub>
          <button
            type="button"
            onClick={() => onOpenProject(t.project_id)}
            /* 文中のリンクは **行の高さを変えずに当たり判定だけ広げる**（M10）。
               素で高さを足すと行送りが崩れる */
            className="inline-block py-[13px] -my-[13px] text-primary hover:underline"
          >
            {t.project_name}
          </button>
        </RowSub>
      </RowMain>
      {/* **工程に付いていないタスクもある** (migration 179)。
          枠は残す — 値が無い行だけ列が詰まると桁がずれる */}
      <RowSlot w={128} hideOnMobile placeholder="工程なし">
        {t.phase_state && t.phase_label ? (
          <span className={cn('text-badge rounded-badge px-1.5 py-0.5 truncate', PHASE_STATE_TONE[t.phase_state])}>
            {t.phase_label}
          </span>
        ) : null}
      </RowSlot>
      <RowSlot w={96} hideOnMobile>
        <span className="truncate text-sub-sm text-muted-foreground">{t.assigned_to_name ?? '—'}</span>
      </RowSlot>
      <RowSlot w={96} className={cn('text-sub font-number', t.is_completed ? 'text-muted-foreground' : dueTone(due, today))}>
        {dueLabel(due, today)}
      </RowSlot>
      {/*
        片づける操作は**文字のボタン**にする（18px の四角は
        「押すと何が起きるか」が読み取れなかった）。列は 7段の 128px
      */}
      {canEdit && (
        <RowSlot w={128} align="center">
          <TaskDoneButton
            done={t.is_completed}
            onToggle={() => onToggleDone(t)}
            taskTitle={t.title}
            disabled={togglePending}
            size="sm"
          />
        </RowSlot>
      )}
    </Row>
  );
}
