/**
 * マイタスクの1行。「優先度順」の一覧と「重要度 × 緊急度」ボードの選んだマスが共有する。
 *
 * ── カードから行に変えた ────────────────────────────────────
 *
 * 以前は1件が `Card` で、バッジ・打ち手・GLS番号・依頼の状態・公開範囲・AI の印を
 * 中身の幅なりに並べていたので、**縦に並べるとバッジの端が行ごとにずれ**、
 * 目で流し読みできませんでした（`docs/design/v4/_rules.md` 1「縦の整列」）。
 *
 * 列は 優先度 56px ／ やること（唯一伸びる）／ 打ち手 128px ／ 期限 128px ／
 * 操作 160px の5つ。スマホは `stackOnMobile` で「やること」が行を独占し、
 * 打ち手は落とします（`hideOnMobile`）。
 */
import { EyeOff, Pencil, Sparkles } from 'lucide-react';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CELL_ACTION, DELEGATION_LABELS, formatDue, LEVEL_LABELS, useUpdateTask, type MyTask,
} from '@/lib/tasksApi';
import { CellScoreBadge } from './CellScoreBadge';

/** 行の2段目に出す小さな印。**中身があるものだけ**（無い印の場所は空けない） */
function Marks({ t, canOpenProject }: { t: MyTask; canOpenProject: boolean }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {t.gls_number && (
        canOpenProject ? (
          <a
            href={`/sales/projects/${t.project_id}`}
            className="font-number text-badge shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:underline"
            title={t.project_name ?? undefined}
          >
            {t.gls_number}
          </a>
        ) : (
          <span
            className="font-number text-badge shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-muted-foreground"
            title={t.project_name ?? undefined}
          >
            {t.gls_number}
          </span>
        )
      )}
      {t.requester_name && <span className="truncate">{t.requester_name} さんから</span>}
      {t.requester_id && t.delegation_status && (
        <span className="text-badge shrink-0 rounded-badge border border-border px-1.5 py-0.5">
          {DELEGATION_LABELS[t.delegation_status]}
        </span>
      )}
      {t.visibility === 'private' && (
        <span className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge bg-muted px-1.5 py-0.5 text-muted-foreground">
          <EyeOff className="h-3 w-3" aria-hidden="true" />自分だけ
        </span>
      )}
      {t.source?.startsWith('intake') && (
        <span className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge bg-ai-surface px-1.5 py-0.5 text-ai">
          <Sparkles className="h-3 w-3" aria-hidden="true" />AI作成
        </span>
      )}
      {/* 期限が無いことは**印として出す**（要件 D9「期限が未設定 N 件」を行でも見せる） */}
      {!t.due_at && !t.is_completed && <span className="shrink-0 font-bold text-warning">期限未設定</span>}
    </span>
  );
}

export function TaskRow({ t, canEdit, canOpenProject, onEdit }: {
  t: MyTask; canEdit: boolean; canOpenProject: boolean; onEdit: () => void;
}) {
  const update = useUpdateTask();
  return (
    <Row divider align="start" stackOnMobile className={cn(t.is_completed && 'opacity-60')}>
      <RowSlot w={56}><CellScoreBadge score={t.priority_score} /></RowSlot>

      <RowMain>
        <RowTitle className={cn(t.is_completed && 'line-through')}>{t.title}</RowTitle>
        <RowSub><Marks t={t} canOpenProject={canOpenProject} /></RowSub>
      </RowMain>

      <RowSlot w={128} hideOnMobile>
        <span className="text-sub truncate text-muted-foreground" title={`重要 ${LEVEL_LABELS[t.importance]} × 緊急 ${LEVEL_LABELS[t.urgency]}`}>
          {CELL_ACTION[t.priority_cell]}
        </span>
      </RowSlot>

      <RowSlot w={128} align="right">
        <span className={cn('font-number text-sub', t.is_overdue ? 'font-bold text-destructive' : 'text-foreground')}>
          {t.due_at ? formatDue(t.due_at) : ''}
        </span>
      </RowSlot>

      <RowSlot w={160} align="right" placeholder="">
        {canEdit && (
          <span className="flex items-center gap-1">
            {/* 片づける操作は**文字のボタン**にする（四角のチェックでは何が起きるか読めない） */}
            <TaskDoneButton
              done={t.is_completed}
              onToggle={() => update.mutate({ id: t.id, patch: { is_completed: !t.is_completed } })}
              taskTitle={t.title}
              disabled={update.isPending}
              size="sm"
            />
            <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" onClick={onEdit} title="編集" aria-label={`「${t.title}」を編集`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </span>
        )}
      </RowSlot>
    </Row>
  );
}
