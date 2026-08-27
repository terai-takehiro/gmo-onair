/**
 * ③ プロジェクト詳細「概要」— 工程とその下のタスク
 *
 * ── なぜタブごとにファイルを分けたか ────────────────────────
 *
 * 工程の下にタスクを出したことで、この1タブだけで
 * 「工程を足す・直す・消す・並べ替える」「タスクを足す・直す・消す・完了にする」の
 * 8つの操作を持つことになりました。詳細画面に置いたままだと**1か所直すのに
 * 450行を読む**形になるので、タブごとに分けています（`npm run lint` の 400行の検査）。
 *
 * ── 開いている工程はこの部品が持つ ──────────────────────────
 *
 * 行の中に持たせると、並べ替えや保存で行が作り直された瞬間に閉じます。
 * タブを切り替えると閉じますが、**それは正しい**（別のタブから戻ったときに
 * 7工程ぶん開いたままだと、どこを見ていたのか分からなくなる）。
 *
 * ── 工程に付いていないタスクも出す ──────────────────────────
 *
 * `gpm_phase_id` が NULL のタスクも同じプロジェクトのものです。
 * 出さないと、工程を消したときに外れたタスクがどこからも見えなくなります
 * （サーバーは工程を消してもタスクを消しません）。**0件のときも枠を出します** —
 * 工程が決まる前のタスクを置く場所があることが分からないと使われません。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarRange, GanttChartSquare, KanbanSquare, List, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useGpmProjectTasks, useInvalidateGpm } from '../../queries';
import { lateDays, ymd, type GpmPhase, type GpmProjectDetail, type GpmTask, type PhaseState } from '../../types';
import { PhaseCard, PhaseRow, PhaseRowsHeader } from './PhaseRows';
import { PhaseDialog } from './PhaseDialog';
import { TaskCard, TaskGroup, TaskRow } from './TaskRows';
import { TaskDialog } from './TaskDialog';
import { GpmGanttView } from './GpmGanttView';
import { GpmKanbanView } from './GpmKanbanView';
import { GpmTimelineView } from './GpmTimelineView';

/**
 * 見え方。**リストが既定**（今までどおり）。
 *   PC:    リスト／ガント／かんばん — ガント・かんばんは横に伸びる表なので PC だけ
 *   スマホ: リスト／工程表 — ガントは移植せず、縦に読む工程表を出す
 *          （Monday・TeamGantt・ANDPAD と同じ「モバイルにガントを縮小しない」判断）
 */
type OverviewView = 'list' | 'gantt' | 'board' | 'timeline';
const PC_VIEWS: { key: OverviewView; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'リスト', icon: List },
  { key: 'gantt', label: 'ガント', icon: GanttChartSquare },
  { key: 'board', label: 'かんばん', icon: KanbanSquare },
];
const MOBILE_VIEWS: { key: OverviewView; label: string; icon: typeof List }[] = [
  { key: 'list', label: 'リスト', icon: List },
  { key: 'timeline', label: '工程表', icon: CalendarRange },
];

export function OverviewTab({
  project: p, today, canEdit, canManage, onDeleteProject,
}: {
  project: GpmProjectDetail;
  today: string;
  canEdit: boolean;
  canManage: boolean;
  onDeleteProject: () => void;
}) {
  const id = p.id;
  const invalidate = useInvalidateGpm();
  const tasksQuery = useGpmProjectTasks(id);
  const isMobile = useIsMobile();
  const [view, setView] = useState<OverviewView>('list');
  // 幅が変わって `view` にその幅では出せない見え方が残っても、描く前にリストへ倒す
  // （スマホにガント・かんばんは無い／PC に工程表は無い）
  const effectiveView: OverviewView = isMobile
    ? (view === 'timeline' ? 'timeline' : 'list')
    : (view === 'timeline' ? 'list' : view);
  const views = isMobile ? MOBILE_VIEWS : PC_VIEWS;

  // 遅れの要約（工程の期限超過＋タスクの期限超過）。切り替えの右に常に出す —
  // リスト・工程表・ガントのどれを見ていても「遅れているか」は最初に知りたい
  const lateSummary = useMemo(() => {
    const latePhases = p.phases.filter((ph) => lateDays(ymd(ph.ends_on), today, ph.state === 'done') > 0).length;
    const overdueTasks = (tasksQuery.data ?? []).filter(
      (t) => !t.is_completed && lateDays(ymd(t.due_at), today, false) > 0,
    ).length;
    return { latePhases, overdueTasks };
  }, [p.phases, tasksQuery.data, today]);

  const [phaseEdit, setPhaseEdit] = useState<GpmPhase | null>(null);
  const [phaseAdding, setPhaseAdding] = useState(false);
  /** タスクを足す／直すダイアログ。足すときは `task` が null で `phaseId` が入る */
  const [taskDialog, setTaskDialog] = useState<{ task: GpmTask | null; phaseId: string | null } | null>(null);
  const [openPhases, setOpenPhases] = useState<Set<string>>(new Set());

  /** 工程ごとのタスク。**工程に付いていないものは `''` の束**に集める */
  const tasksByPhase = useMemo(() => {
    const map = new Map<string, GpmTask[]>();
    for (const t of tasksQuery.data ?? []) {
      const key = t.phase_id ?? '';
      const list = map.get(key);
      if (list) list.push(t); else map.set(key, [t]);
    }
    return map;
  }, [tasksQuery.data]);
  const looseTasks = tasksByPhase.get('') ?? [];

  const changePhaseState = useMutation({
    mutationFn: ({ phase, state }: { phase: GpmPhase; state: PhaseState }) =>
      // **日付とロールも一緒に送る。** サーバーは素の代入なので、送らないと消える
      api.put(`/gpm/phases/${phase.id}`, {
        label: phase.label,
        state,
        role: phase.role,
        started_on: phase.started_on ? String(phase.started_on).slice(0, 10) : null,
        ends_on: phase.ends_on ? String(phase.ends_on).slice(0, 10) : null,
      }),
    onSuccess: () => invalidate(id),
    onError: (err) => notifyApiError('工程の状態を変えられませんでした', err),
  });

  const movePhase = useMutation({
    mutationFn: ({ phase, dir }: { phase: GpmPhase; dir: 'up' | 'down' }) =>
      api.put(`/gpm/phases/${phase.id}/move`, { dir }),
    onSuccess: () => invalidate(id),
    onError: (err) => notifyApiError('工程を動かせませんでした', err),
  });

  const toggleTask = useMutation({
    mutationFn: (task: GpmTask) => api.put(`/gpm/tasks/${task.id}/done`, { done: !task.is_completed }),
    onSuccess: (_r, task) => {
      invalidate(id);
      notifySuccess(task.is_completed ? '未完了に戻しました' : '完了にしました');
    },
    onError: (err) => notifyApiError('タスクを変えられませんでした', err),
  });

  const removeTask = useMutation({
    mutationFn: (task: GpmTask) => api.delete(`/gpm/tasks/${task.id}`),
    onSuccess: () => { invalidate(id); notifySuccess('タスクを消しました'); },
    onError: (err) => notifyApiError('タスクを消せませんでした', err),
  });

  const onDeleteTask = async (task: GpmTask) => {
    const ok = await confirmAction({
      title: 'このタスクを消しますか？',
      description: `「${task.title}」\n終わったのなら消さずにチェックを入れてください（消すとやった記録が残りません）。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) removeTask.mutate(task);
  };

  const toggleOpen = (phase: GpmPhase) => setOpenPhases((prev) => {
    const next = new Set(prev);
    if (next.has(phase.id)) next.delete(phase.id); else next.add(phase.id);
    return next;
  });

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* 見え方の切り替え。スマホは リスト／工程表・PC は リスト／ガント／かんばん */}
        <div role="group" aria-label="見え方" className="flex overflow-hidden rounded-control-md border border-border bg-card">
          {views.map(({ key, label, icon: Icon }, i) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={effectiveView === key}
              className={cn(
                'text-sub flex items-center gap-1.5 px-3',
                isMobile ? 'min-h-tap' : 'h-9',
                i > 0 && 'border-l border-border',
                effectiveView === key ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        {(lateSummary.latePhases > 0 || lateSummary.overdueTasks > 0) && (
          <p className="text-sub min-w-0 font-bold text-destructive">
            {[
              lateSummary.latePhases > 0 ? `遅れ ${lateSummary.latePhases}工程` : null,
              lateSummary.overdueTasks > 0 ? `期限超過 ${lateSummary.overdueTasks}件` : null,
            ].filter(Boolean).join(' ・ ')}
          </p>
        )}
        <div className="min-w-0 flex-1" />
        {canEdit && (
          <Button variant="outline" onClick={() => setPhaseAdding(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />工程を足す
          </Button>
        )}
      </div>

      {effectiveView === 'list' && (
        <p className="text-sub text-muted-foreground">工程の名前を押すと、その工程のタスクが出ます。</p>
      )}

      {effectiveView !== 'list' && (
        tasksQuery.isLoading ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : effectiveView === 'gantt' ? (
          <GpmGanttView
            project={p}
            tasks={tasksQuery.data ?? []}
            canEdit={canEdit}
            onEditPhase={setPhaseEdit}
            onEditTask={(t) => setTaskDialog({ task: t, phaseId: t.phase_id })}
          />
        ) : effectiveView === 'timeline' ? (
          <GpmTimelineView
            project={p}
            tasks={tasksQuery.data ?? []}
            today={today}
            canEdit={canEdit}
            onEditTask={(t) => setTaskDialog({ task: t, phaseId: t.phase_id })}
          />
        ) : (
          <GpmKanbanView
            project={p}
            tasks={tasksQuery.data ?? []}
            today={today}
            canEdit={canEdit}
            onEditTask={(t) => setTaskDialog({ task: t, phaseId: t.phase_id })}
            onAddTask={(phaseId) => setTaskDialog({ task: null, phaseId })}
            onToggleDone={(t) => toggleTask.mutate(t)}
          />
        )
      )}

      {effectiveView === 'list' && (p.phases.length === 0 ? (
        <EmptyState
          title="工程がまだありません"
          description="標準工程を選んで作ると、工程とタスクが日付付きで入ります。ここから1つずつ足すこともできます。"
          action={canEdit ? <Button onClick={() => setPhaseAdding(true)}>工程を足す</Button> : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          {!isMobile && <PhaseRowsHeader />}
          {p.phases.map((ph, i) => {
            // スマホはカード・PC は行。**同じ props の組**（`PhaseItemProps`）を渡す
            const PhaseItem = isMobile ? PhaseCard : PhaseRow;
            return (
            <div key={ph.id}>
              <PhaseItem
                phase={ph}
                index={i}
                today={today}
                canEdit={canEdit}
                open={openPhases.has(ph.id)}
                canMoveUp={i > 0}
                canMoveDown={i < p.phases.length - 1}
                onToggleOpen={toggleOpen}
                onChangeState={(phase, state) => changePhaseState.mutate({ phase, state })}
                onEdit={setPhaseEdit}
                onMove={(phase, dir) => movePhase.mutate({ phase, dir })}
              />
              {openPhases.has(ph.id) && (
                tasksQuery.isLoading ? (
                  <div className="bg-background border-b border-border-faint px-4 py-2 sm:pl-[68px]">
                    <Delayed><SkeletonRows rows={2} /></Delayed>
                  </div>
                ) : (
                  <TaskGroup
                    tasks={tasksByPhase.get(ph.id) ?? []}
                    today={today}
                    canEdit={canEdit}
                    mobile={isMobile}
                    onAdd={() => setTaskDialog({ task: null, phaseId: ph.id })}
                    onToggleDone={(t) => toggleTask.mutate(t)}
                    onEdit={(t) => setTaskDialog({ task: t, phaseId: t.phase_id })}
                    onDelete={onDeleteTask}
                  />
                )
              )}
            </div>
            );
          })}
        </div>
      ))}

      {/* 工程に付いていないタスクの束はリストだけ。ガント・かんばんは自分の中に「工程なし」を持つ */}
      {effectiveView === 'list' && (
      <section className="overflow-hidden rounded-card border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-subtle px-4 py-2">
          <h2 className="text-th min-w-0 flex-1 text-muted-foreground">
            工程に付いていないタスク（{looseTasks.length}件）
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setTaskDialog({ task: null, phaseId: null })}
              className="text-sub min-h-tap inline-flex items-center gap-1 text-primary hover:underline lg:min-h-[32px]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />タスクを足す
            </button>
          )}
        </div>
        {tasksQuery.isError ? (
          <div className="p-4">
            <ErrorPanel title="タスクを読み込めませんでした" onRetry={() => tasksQuery.refetch()} />
          </div>
        ) : looseTasks.length === 0 ? (
          <p className="text-sub px-4 py-3 text-muted-foreground">
            ありません。工程が決まる前のタスクはここに置けます。
          </p>
        ) : (
          looseTasks.map((t) => {
            const TaskItem = isMobile ? TaskCard : TaskRow;
            return (
              <TaskItem
                key={t.id}
                task={t}
                today={today}
                canEdit={canEdit}
                indent={false}
                onToggleDone={(x) => toggleTask.mutate(x)}
                onEdit={(x) => setTaskDialog({ task: x, phaseId: null })}
                onDelete={onDeleteTask}
              />
            );
          })
        )}
      </section>
      )}

      {/* メモ。**いちばん新しい1件**（列ではなくやり取りの `memo` に入っている・migration 184） */}
      {p.notes && (
        <section className="rounded-card border border-border bg-card p-4 lg:px-5">
          <h2 className="text-cardtitle mb-1.5">メモ</h2>
          <p className="text-sub whitespace-pre-wrap text-foreground">{p.notes}</p>
        </section>
      )}

      <p className="text-note text-muted-foreground">
        工程の日付を直しても、あとに続く工程は動きません（1つずつ直します）
        {p.template_name ? `。この工程は標準工程「${p.template_name}」から写したものです（写したあとに標準工程を直しても、このプロジェクトは変わりません）` : ''}。
        議事録はプロジェクト管理側のデータがまだ無いので出していません。
      </p>

      {canManage && (
        <div className="pt-2">
          <Button variant="outline" onClick={onDeleteProject}>
            <Trash2 className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />
            このプロジェクトを消す
          </Button>
        </div>
      )}

      {(phaseEdit || phaseAdding) && (
        <PhaseDialog
          projectId={id}
          phase={phaseEdit}
          onClose={() => { setPhaseEdit(null); setPhaseAdding(false); }}
        />
      )}
      {taskDialog && (
        <TaskDialog
          projectId={id}
          task={taskDialog.task}
          phases={p.phases}
          defaultPhaseId={taskDialog.phaseId}
          onClose={() => setTaskDialog(null)}
        />
      )}
    </div>
  );
}
