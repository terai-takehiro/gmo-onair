/**
 * マイタスク — 案件のタスクと個人のタスクを混ぜて、優先度の順に並べる
 *
 * 設計の正は [docs/design/v4/mockups/tasks-redesign/](../../../../docs/design/v4/mockups/tasks-redesign/)。
 * 要件は D2（重要度 × 緊急度）／ D8（今日やること3件・9マス）／ D9（期限）。
 *
 * ── 作り直しで変えたこと ────────────────────────────────────
 *
 * ① **絞り込みを件数つきのチップにした**（すべて／期限超過／本日／期限未設定／完了）。
 *    以前は「対応済も表示」のトグル1つだけで、期限超過だけを見ることができなかった。
 *    件数を必ず出すのは「押す前に 0 件だと分かる」ため（`filterChips.tsx` の設計理由）。
 * ② **警告の帯を2本から1本にした。** 「重要 高 × 緊急 低が 0 件」と
 *    「やらない候補が 5 件以上」は、どちらも同じ**棚卸しの促し**。帯が2本並ぶと
 *    一覧の始まる位置が下がるだけになる。
 * ③ **一覧を `Row` に載せた**（`TaskRow` の冒頭に理由）。
 *
 * 「今日やること 3 件」（要件 D8）と 9 マスボード（要件 D2）は残してある。
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { CELL_ACTION, formatDue, useMyTasks, type MyTask } from '@/lib/tasksApi';
import { NineCellBoard } from './NineCellBoard';
import { TaskRow } from './TaskRow';
import { TaskEditDialog } from './TaskDialogs';

/** 絞り込みの段。**完了だけは別の取得**（未完了の一覧には入っていない） */
type Filter = 'all' | 'over' | 'today' | 'nodue' | 'done';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'over', label: '期限超過' },
  { key: 'today', label: '本日' },
  { key: 'nodue', label: '期限未設定' },
  { key: 'done', label: '完了' },
];

/** 「やらない候補（スコア1）」が何件たまったら棚卸しを促すか（要件 D2） */
const JUNK_THRESHOLD = 5;

/** その期限は今日の分か。**分まで持っている**ので日付だけを比べる（要件 D9） */
function isToday(due: string | null): boolean {
  if (!due) return false;
  const d = new Date(due.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function matches(t: MyTask, f: Filter): boolean {
  if (f === 'done') return t.is_completed;
  if (t.is_completed) return false;
  if (f === 'over') return t.is_overdue;
  if (f === 'today') return isToday(t.due_at);
  if (f === 'nodue') return !t.due_at;
  return true;
}

export function MyTasksTab() {
  const { canEdit } = usePermissions();
  const isMobile = useIsMobile();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<MyTask | null>(null);
  // **完了ぶんまで常に取る。** チップの件数は取っていないものを数えると嘘になる
  const { data, isLoading } = useMyTasks({ include_completed: true });
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const canOpenProject = data?.canOpenProject ?? false;

  // `editing` に入れた行は開いた時点の写し。裏で一覧が refetch されても古いままなので、
  // ダイアログには一覧から引き直した最新の行を渡す（消えた行だけ写しで残す）
  const editingTask = editing ? (tasks.find((t) => t.id === editing.id) ?? editing) : null;

  const open = useMemo(() => tasks.filter((t) => !t.is_completed), [tasks]);
  const rows = useMemo(() => tasks.filter((t) => matches(t, filter)), [tasks, filter]);
  const top3 = open.slice(0, 3);

  // 健康診断: 「重要 高 × 緊急 低」が 0 件なら目の前の火消しだけをしている (要件 D2)
  const planCount = open.filter((t) => t.priority_cell === '3x1').length;
  const junkCount = open.filter((t) => t.priority_score === 1).length;
  const stocktake = [
    planCount === 0 ? '「重要 高 × 緊急 低（予定を取って守る）」が 0 件' : null,
    junkCount >= JUNK_THRESHOLD ? `「やらない候補」が ${junkCount} 件` : null,
  ].filter((s): s is string => s !== null);

  const chips = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: isLoading ? null : tasks.filter((t) => matches(t, f.key)).length,
  }));

  if (isLoading) return <Delayed><SkeletonRows rows={6} /></Delayed>;

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="まだタスクがありません"
        description="右上の「タスクを追加」から登録できます。案件管理アプリのトップの入力欄から書き留めることもできます。"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 今日やること 3 件 — 常に最上部に置く（要件 D8） */}
      {top3.length > 0 && (
        <div className="rounded-card border border-primary-border bg-primary-surface-weak p-3 sm:p-4">
          <p className="text-th text-primary">まずこの {top3.length} 件</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {top3.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => canEdit && setEditing(t)}
                disabled={!canEdit}
                className="flex min-h-tap items-center gap-2.5 rounded-control px-1 text-left hover:bg-card disabled:cursor-default lg:min-h-0 lg:py-1"
              >
                <span className="font-number text-badge flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-list min-w-0 flex-1 truncate">{t.title}</span>
                <span className={cn('font-number text-sub w-[128px] shrink-0 text-right', t.is_overdue ? 'font-bold text-destructive' : 'text-muted-foreground')}>
                  {formatDue(t.due_at)}{t.is_overdue && ' 超過'}
                </span>
                <span className="text-sub hidden w-[128px] shrink-0 text-right text-muted-foreground sm:block">
                  {CELL_ACTION[t.priority_cell] ?? ''}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips label="タスクの状態で絞り込む" items={chips} value={filter} onChange={setFilter} />

        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="表示形式を切り替える">
          {([['list', '一覧', List], ['board', '重要度 × 緊急度', LayoutGrid]] as const).map(([v, label, Icon], i) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn(
                'min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[36px]',
                i > 0 && 'border-l border-border',
                view === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>

        <span className="text-sub ml-auto shrink-0 text-muted-foreground">
          未対応 <span className="font-number font-bold text-foreground">{open.length}</span> 件
        </span>
      </div>

      {/* 棚卸しの促し。**2本を1本にする**（同じことを言っている・要件 D2） */}
      {stocktake.length > 0 && (
        <p className="text-sub flex items-start gap-2 rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{stocktake.join('、')}です。棚卸ししてください。</span>
        </p>
      )}

      {rows.length === 0 ? (
        <NoSearchResults
          activeFilters={[`状態: ${FILTERS.find((f) => f.key === filter)?.label ?? ''}`]}
          onClearFilters={() => setFilter('all')}
        />
      ) : view === 'list' ? (
        <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
          {!isMobile && (
            <RowHeader>
              <RowSlot w={56}>優先</RowSlot>
              <RowMain>やること</RowMain>
              <RowSlot w={128}>打ち手</RowSlot>
              <RowSlot w={128} align="right">期限</RowSlot>
              <RowSlot w={160} placeholder="" />
            </RowHeader>
          )}
          {rows.map((t) => (
            <TaskRow key={t.id} t={t} canEdit={canEdit} canOpenProject={canOpenProject} onEdit={() => setEditing(t)} />
          ))}
        </div>
      ) : (
        <NineCellBoard
          tasks={rows.filter((t) => !t.is_completed)}
          canEdit={canEdit}
          canOpenProject={canOpenProject}
          onEdit={setEditing}
          isMobile={isMobile}
        />
      )}

      {editingTask && <TaskEditDialog key={editingTask.id} task={editingTask} onClose={() => setEditing(null)} />}
    </div>
  );
}
