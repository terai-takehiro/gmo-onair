/**
 * ⑤ タスクと持ち帰り — タスクタブの表本体（PC）
 *
 * `GpmTaskListPage.tsx` から切り出した（1ファイル400行の上限・`client/CLAUDE.md`）。
 * PC の行の見た目・動きは1文字も変えていない — 元の場所からそのまま移しただけ。
 */
import { Check } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  PHASE_STATE_TONE, dueLabel, dueTone, ymd, type GpmTask,
} from '../../types';

export function TaskRowsHeader({ canEdit }: { canEdit: boolean }) {
  return (
    <RowHeader className="hidden sm:flex">
      {canEdit && <RowSlot w={56} align="center">完了</RowSlot>}
      <RowMain>タスク ／ プロジェクト</RowMain>
      <RowSlot w={128}>工程</RowSlot>
      <RowSlot w={96}>担当</RowSlot>
      <RowSlot w={96}>期限</RowSlot>
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
      {canEdit && (
        <RowSlot w={56} align="center">
          <button
            type="button"
            onClick={() => onToggleDone(t)}
            disabled={togglePending}
            aria-label={t.is_completed ? `${t.title} を未完了に戻す` : `${t.title} を完了にする`}
            /*
              **`v4-tap` で当たり判定だけ 44px にする**（M10）。
              18px の四角は大きくすると別の部品に見えるので、
              見た目は変えずに透明な擬似要素をかぶせる
              （`tokens-v4.css`。押し間違えると取り消しに行くので、
               指で確実に当たる大きさが要る）
            */
            className={cn(
              'v4-tap rounded-badge-xs flex h-[18px] w-[18px] items-center justify-center border-[1.5px]',
              t.is_completed ? 'border-success bg-success' : 'border-border-disabled hover:border-primary',
            )}
          >
            {t.is_completed && <Check className="h-3 w-3 text-success-foreground" aria-hidden="true" />}
          </button>
        </RowSlot>
      )}
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
    </Row>
  );
}
