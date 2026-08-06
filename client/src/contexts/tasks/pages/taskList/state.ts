/**
 * タスクの状態 4つ (v4 ④ タスク一覧)
 *
 *   未着手 / 進行中 / 相手待ち / 完了
 *
 * ── 4つ目 (完了) だけ持ち方が違う ──────────────────────────────
 *
 * DB は `is_completed`(完了したか) と `work_state`(未完了のときの止まり方) の
 * **2列に分けて**持っています。1列に4値を持たせると「完了したか」が
 * `is_completed` と重複し、既存の書き手 (かんばん / ガント / MCP / 依頼フロー /
 * 週報の集計) のどれか1つが片方しか更新しなかった瞬間に食い違うためです
 * (理由の全文は `server/src/shared/db/migrations/137_task_work_state.sql`)。
 *
 * **画面はこの関数だけを通す。** 2列から1つの状態を組み立てる場所をここ1か所に
 * 閉じ込めておかないと、画面ごとに `is_completed ? … : …` を書いて必ずどこかで
 * 「完了なのに進行中と出る」が起きます。
 *
 * ── なぜ「相手待ち」を足したか ────────────────────────────────
 *
 * お客様の返事待ち・他部署の回答待ちを「進行中」と同じ見た目にしていると、
 * **未完了のタスクが全部同じ重さに見えて、自分が止めているものが埋もれます**。
 * 「自分が動かせるもの」と「待つしかないもの」を分けるのがこの列の唯一の目的です。
 */
import type { ProjectTask, TaskWorkState } from '@/types';

export type TaskState = 'todo' | 'doing' | 'waiting' | 'done';

/** 表示する状態。**完了が最優先** (完了したタスクの止まり方は意味を持たない) */
export function taskState(t: Pick<ProjectTask, 'is_completed' | 'work_state'>): TaskState {
  if (t.is_completed) return 'done';
  return (t.work_state ?? 'todo') as TaskWorkState;
}

/** バッジに出す文字。**和文2〜4字**にそろえてある (`TableBadge` が 62px に割り付ける) */
export const TASK_STATE_LABEL: Record<TaskState, string> = {
  todo: '未着手',
  doing: '進行中',
  waiting: '相手待ち',
  done: '完了',
};

/**
 * バッジの色。`docs/design/v4/_rules.md`「状態は4つに寄せる」の対応どおり。
 * **生のパレットは書かない** — 状態の色トークンから選ぶ。
 */
export const TASK_STATE_TONE: Record<TaskState, string> = {
  todo: 'border-transparent bg-muted text-muted-foreground',
  doing: 'border-transparent bg-primary-surface text-primary',
  waiting: 'border-transparent bg-warning-surface text-warning',
  done: 'border-transparent bg-success-surface text-success',
};

/** 状態を切り替えるときの選択肢 (完了はチェックボックスで切り替えるのでここには出さない) */
export const WORK_STATE_OPTIONS: { value: TaskWorkState; label: string }[] = [
  { value: 'todo', label: '未着手' },
  { value: 'doing', label: '進行中' },
  { value: 'waiting', label: '相手待ち' },
];

/** 並べ替えたときの状態の順。**手が要るものから先に** (相手待ちは待つだけなので後ろ) */
const STATE_ORDER: Record<TaskState, number> = { doing: 0, todo: 1, waiting: 2, done: 3 };

export function stateRank(t: Pick<ProjectTask, 'is_completed' | 'work_state'>): number {
  return STATE_ORDER[taskState(t)];
}
