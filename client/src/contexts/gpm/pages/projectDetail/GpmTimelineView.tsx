/**
 * ③ プロジェクト詳細「概要」のスマホ工程表 — 縦タイムライン
 *
 * ── なぜガントをスマホに移植しないのか ──────────────────────
 *
 * 横に伸びる時間軸は 375px では読めず、業界も同じ結論を出している
 * （Monday はモバイルでガント非対応・ガント専業の TeamGantt すらモバイルは
 * リストのみ・ANDPAD のスマホ工程も一覧形）。スマホは**縦に読む工程表**にする:
 * 工程を上から並べ、今日の位置に赤い線を挟む。1画面で「どこまで進んで、
 * どこで止まっていて、何が遅れているか」が読めることを最優先にする。
 *
 * ── 出すもの・出さないもの ──────────────────────────────────
 *
 *   出す: 工程の状態・期間・タスク消化 (n/m)・進捗の細バー・「N日遅れ」・
 *         止まっている理由（その工程に付いた未解決の未確認事項）・
 *         期限超過タスクのチップ（押すと直せる）・◆マイルストーン
 *   出さない: ドラッグでの日程変更（PC のガントの仕事）・全タスクの羅列
 *             （リスト表示がある）
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import {
  lateDays, PHASE_STATE_LABEL, ymd,
  type GpmPhase, type GpmProjectDetail, type GpmTask, type PhaseState,
} from '../../types';

/** 状態 → 節の色（ガントのバーと同じ系統。別の色を作ると対応が読めない） */
const NODE_TONE: Record<PhaseState, string> = {
  done: 'bg-success',
  doing: 'bg-primary ring-4 ring-primary-surface',
  blocked: 'bg-destructive',
  todo: 'border-2 border-border-disabled bg-card',
};

const STATE_BADGE: Record<PhaseState, string> = {
  done: 'bg-success-surface text-success',
  doing: 'bg-primary-surface text-primary',
  blocked: 'bg-destructive-surface text-destructive',
  todo: 'bg-muted text-muted-foreground',
};

export function GpmTimelineView({
  project, tasks, today, canEdit, onEditTask,
}: {
  project: GpmProjectDetail;
  tasks: GpmTask[];
  today: string;
  canEdit: boolean;
  onEditTask: (task: GpmTask) => void;
}) {
  const phases = project.phases;
  // 今日の線を「終わりが今日より前の工程」と「それ以降」の間に挟む。
  // 工程は並び順（sort_order）で出すので、日付が前後している場合は近似になる
  const todayAfter = (() => {
    let idx = phases.length;
    for (let i = 0; i < phases.length; i += 1) {
      const end = ymd(phases[i].ends_on);
      if (!end || end >= today) { idx = i; break; }
    }
    return idx;
  })();

  const tasksOf = (phaseId: string | null) =>
    tasks.filter((t) => (t.phase_id ?? null) === phaseId);

  return (
    <div className="rounded-card border border-border bg-card px-3.5 py-4">
      {phases.length === 0 && (
        <p className="text-sub text-muted-foreground">工程がまだありません。リスト表示から追加できます。</p>
      )}
      {phases.map((ph, i) => (
        <div key={ph.id}>
          {i === todayAfter && <TodayRule today={today} />}
          <PhaseNode
            phase={ph}
            last={i === phases.length - 1 && todayAfter !== phases.length}
            today={today}
            openItems={project.open_items}
            tasks={tasksOf(ph.id)}
            canEdit={canEdit}
            onEditTask={onEditTask}
          />
        </div>
      ))}
      {todayAfter === phases.length && phases.length > 0 && <TodayRule today={today} last />}
    </div>
  );
}

function TodayRule({ today, last = false }: { today: string; last?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', last ? 'pt-1' : 'pb-3')}>
      {/* 今日線はガントの今日線と同じ実色（#f87171）。クラスにせず style で当てる */}
      <span className="text-badge shrink-0 rounded-chip px-2.5 py-0.5 font-bold text-white" style={{ backgroundColor: '#f87171' }}>
        今日 {today.slice(5).replace('-', '/')}
      </span>
      <span className="min-w-0 flex-1 border-t-2 border-dashed" style={{ borderColor: '#f87171' }} aria-hidden="true" />
    </div>
  );
}

function PhaseNode({
  phase, last, today, openItems, tasks, canEdit, onEditTask,
}: {
  phase: GpmPhase;
  last: boolean;
  today: string;
  openItems: GpmProjectDetail['open_items'];
  tasks: GpmTask[];
  canEdit: boolean;
  onEditTask: (task: GpmTask) => void;
}) {
  const late = lateDays(ymd(phase.ends_on), today, phase.state === 'done');
  const done = phase.state === 'done';
  const pct = done ? 100 : phase.task_count > 0 ? Math.round((phase.task_done / phase.task_count) * 100) : 0;
  // この工程で止まっている理由（未解決の未確認事項）。ダッシュボードの
  // 「止まっているプロジェクト」と同じデータを工程の場所に出す
  const blocking = openItems.filter((a) => a.phase_id === phase.id && a.status !== 'resolved');
  const overdue = tasks.filter((t) => !t.is_completed && !t.is_milestone && (ymd(t.due_at) ?? '9999') < today);
  const milestones = tasks.filter((t) => t.is_milestone);

  return (
    <div className="flex gap-2.5">
      {/* 縦のレールと節 */}
      <div className="flex w-4 shrink-0 flex-col items-center">
        <span className={cn('mt-1 h-3 w-3 shrink-0 rounded-chip', NODE_TONE[phase.state])} aria-hidden="true" />
        {!last && <span className="w-0.5 min-w-0 flex-1 bg-border" aria-hidden="true" />}
      </div>

      <div className={cn('min-w-0 flex-1', !last && 'pb-4')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={cn('text-list min-w-0 truncate', done && 'text-muted-foreground line-through')}>
            {phase.label}
          </h3>
          <span className={cn('text-badge shrink-0 rounded-badge px-1.5 py-0.5', STATE_BADGE[phase.state])}>
            {PHASE_STATE_LABEL[phase.state]}
          </span>
          {late > 0 && (
            <span className="text-badge shrink-0 rounded-badge bg-destructive px-1.5 py-0.5 font-bold text-white">
              {late}日遅れ
            </span>
          )}
        </div>

        <p className="text-sub mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground">
          <DateRange short start={ymd(phase.started_on)} end={ymd(phase.ends_on)} placeholder="日付なし" />
          {phase.task_count > 0 && (
            <span className="font-number">タスク {phase.task_done}/{phase.task_count}</span>
          )}
          {phase.role && <span className="min-w-0 truncate">{phase.role}</span>}
        </p>

        {phase.state === 'doing' && phase.task_count > 0 && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-chip bg-muted" role="progressbar"
            aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${phase.label} の進み具合`}>
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        )}

        {blocking.map((a) => (
          <p key={a.id} className="text-note mt-1 text-destructive">
            「{a.question}」が止まっています
          </p>
        ))}

        {overdue.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {overdue.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onEditTask(t)}
                disabled={!canEdit}
                className="text-badge min-h-tap max-w-full truncate rounded-badge border border-destructive-border bg-destructive-surface px-2 py-1 text-destructive lg:min-h-0"
              >
                {(ymd(t.due_at) ?? '').slice(5).replace('-', '/')} 超過 ・ {t.title}
              </button>
            ))}
          </div>
        )}

        {milestones.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onEditTask(t)}
            disabled={!canEdit}
            className="text-sub min-h-tap mt-1 flex max-w-full items-center gap-1.5 text-left text-muted-foreground lg:min-h-0"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
              <polygon points="6,0 12,6 6,12 0,6" fill="#f59e0b" stroke="#b45309" strokeWidth="1" />
            </svg>
            <span className="min-w-0 truncate">
              {ymd(t.due_at) ? `${ymd(t.due_at)!.slice(5).replace('-', '/')} ` : ''}{t.title}
              {t.is_completed ? '（済み）' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
