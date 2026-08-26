/**
 * ① 予定 / 「タスクの期限」レイヤーの共通定義（根源整理 §3-5）
 *
 * カレンダーとタスクが接続していなかった（期限はどのカレンダーにも出なかった）ので、
 * 既存3層（スタジオ・パートナー・自分）に4層目として足した。
 * データは `GET /dailyops/tasks/deadlines`（自分の未完了タスクだけ・
 * 期限は COALESCE(due_at, due_date+18:00) 適用済み）。
 *
 * **ここに置くのは、PC（`UnifiedCalendarPage`）とスマホ（`MobileToday`）と
 * ダッシュボードの週間予定（`WeekPanel`）の3画面が同じ鍵・同じ色・同じ遷移を
 * 使うため。** 画面ごとに書くと、片方だけ直したときに
 * 「カレンダーでは飛べるのにダッシュボードでは飛べない」が起きる。
 */
import type { NavigateFunction } from 'react-router-dom';

/** `GET /dailyops/tasks/deadlines` の1行 */
export interface TaskDeadline {
  id: string;
  title: string;
  /** COALESCE 適用済みの ISO（`YYYY-MM-DDTHH:MM:SS`）。時刻なしの期限は 18:00 で入る */
  due_at: string;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
}

/**
 * react-query の鍵の先頭。`bookingQueries.ts` と同じ考え方で**独立した鍵**にする
 * （予約の鍵に相乗りさせると、予約を触るたびに期限まで引き直す）。
 * タスクを書き換えた画面は `['task-deadlines']` の前方一致で落とす
 * （`contexts/tasks/hooks/useProjectTasks.ts` の `invalidateTasks` が呼ぶ）。
 * ⚠️ 日常業務（`/daily/` 別バンドル）での完了はこのバンドルのキャッシュに届かないので、
 * 読み側の staleTime を短くして拾う（`useCalendarEvents.ts` のコメント参照）。
 */
export const TASK_DEADLINE_KEY = 'task-deadlines';

/**
 * 期限の色。既存レイヤー（スタジオ #dc2626・パートナー #8b5cf6・自分 #2563eb）と
 * 見分けられる琥珀。「過ぎたら赤」はしない — スタジオの赤と混ざって読み違える
 */
export const TASK_DEADLINE_COLOR = '#d97706';

/**
 * 期限の予定を押したときの遷移。
 * 案件タスク（`project_id` あり）で案件管理を開ける人は案件のタスクタブへ、
 * それ以外は日常業務のマイタスクへ。**`/daily/` は別バンドルなので素の遷移**
 * （ルーターでは飛べない — client/CLAUDE.md の決めごと）。
 */
export function openDeadline(
  navigate: NavigateFunction,
  canOpenProject: boolean,
  t: TaskDeadline | undefined,
): void {
  if (!t) return;
  if (t.project_id && canOpenProject) {
    // 詳細タブの URL 鍵は単数の `task`（`tasks` は既存ルートと衝突する — client/CLAUDE.md）
    navigate(`/sales/projects/${t.project_id}/task`);
    return;
  }
  window.location.href = '/daily/tasks';
}
