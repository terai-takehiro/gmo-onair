/**
 * ④ タスク一覧 のガント（スマホ）
 *
 * ── なぜこの画面が要ったか（見つかった不整合） ────────────────
 *
 * `DashboardGanttView` はすでに `MobileGanttView`（375px 向けのカード＋ミニ帯）を
 * `sm:hidden` で内蔵していたが、**スマホの入口（`TaskDashboardPage`）が `view`
 * を見ずに常に `MobileTaskList` を出していた**ため、実際には一度も画面に出ない
 * デッドコードだった。`/sales/tasks/gantt` の PC専用案内で「それでもこのまま開く」
 * を押しても、出てくるのは（ガントではなく）いつものリストのままだった。
 *
 * ここは PC の `DesktopTaskDashboard` 内の `isGantt` 分岐とは別に、
 * スマホだけの薄い入口として `TaskDashboardPage` から呼ぶ
 * （`MobileTaskList` と同格の「部品ごと入れ替え」＝パターンC）。
 *
 * ── 並べ替え・絞り込みは出さない ────────────────────────────
 *
 * `MobileTaskList` と同じ考え方（モックの「押して消し込むだけ。並べ替えは PC で」）。
 * 既定は PC のガントを開いたときの既定値（未完了だけ）に合わせてある —
 * 完了ぶんまで混ぜると、終わったタスクの帯で埋まって今の山が読めなくなる
 */
import { Link } from 'react-router-dom';
import { ListTodo } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { ErrorPanel, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useTaskDashboard } from '@/contexts/tasks/hooks/useProjectTasks';
import DashboardGanttView from '@/contexts/tasks/components/DashboardGantt/DashboardGanttView';

export function MobileTaskGantt() {
  const { data, isLoading, isError, refetch } = useTaskDashboard();
  // PC のガントを開いたときの既定（未完了だけ）に合わせる。データの取り方・
  // 完了かどうかの判定は変えていない（`is_completed` をそのまま見るだけ）
  const tasks = (data?.tasks ?? []).filter((t) => !t.is_completed);

  return (
    <div className="flex flex-col gap-3.5 p-3">
      <PageHeader
        title="ガント"
        sub="全案件のタスクを時間軸で（未完了だけ）。並べ替え・絞り込みは PC の一覧から"
      />

      <Link
        to="/sales/tasks/list"
        className="min-h-tap rounded-control inline-flex w-fit shrink-0 items-center gap-1.5 self-start border border-border px-3.5 text-sub text-secondary-foreground"
      >
        <ListTodo className="h-4 w-4" aria-hidden="true" />
        リストで見る
      </Link>

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : isError ? (
        <ErrorPanel title="タスクを読み込めませんでした" onRetry={() => refetch()} />
      ) : (
        <DashboardGanttView
          projects={data?.projects ?? []}
          columns={data?.columns ?? []}
          tasks={tasks}
        />
      )}
    </div>
  );
}
