/**
 * ④ タスク一覧 (v4) — 全案件のタスクを1か所で
 *
 * ── いまの実装から変えたこと ────────────────────────────────
 *
 * ① **カンバンを畳みました。** 旧実装の「カンバン」は案件ごとの小さな板を
 *    縦に積み、**各列5件までしか出さない**ものでした。案件をまたいで見えて
 *    いるわけではなく、同じことは案件詳細の板のほうがよくできます。
 * ② **ガントは残しました。** 全案件の山を1枚で見る場所はここしかありません
 *    (中身はまだ v4 に作り直していません — 後述)。
 * ③ **状態が4つになりました** (未着手 / 進行中 / 相手待ち / 完了)。
 *    「相手待ち」は**自分は動けない**を表すためのもので、これが無いと
 *    未完了のタスクが全部同じ重さに見えます (`taskList/state.ts`)。
 * ④ **全体 / 自分**を切り替えられるようにしました (モックの scopes)。
 * ⑤ **一覧からタスクを足せる**ようにしました。案件を選んでやること・担当・
 *    期限だけ決めれば入ります。
 *
 * ── まだ v4 になっていないところ ────────────────────────────
 *
 * **ガントの中身は旧実装のまま**です (`DashboardGanttView` 522行)。
 * ここを作り直すのは「時間軸の描画」という別の仕事なので、
 * 一覧の作り直しと混ぜませんでした。
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, ListTodo, GanttChart, Info } from 'lucide-react';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, NoSearchResults, ErrorPanel, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import api from '@/lib/api';
import { useTaskDashboard } from '@/contexts/tasks/hooks/useProjectTasks';
import DashboardGanttView from '@/contexts/tasks/components/DashboardGantt/DashboardGanttView';
import TaskDialog from '@/contexts/tasks/components/TaskDialog';
import { TaskRow, TaskRowsHeader } from './taskList/TaskRows';
import { AddTaskDialog } from './taskList/AddTaskDialog';
import { stateRank } from './taskList/state';
import { MobileTaskList } from './taskList/MobileTaskList';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import type { DashboardTask } from '@/types';

type Scope = 'all' | 'mine';
type Filter = 'all' | 'open' | 'over';
type Sort = 'due' | 'project' | 'state';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'due', label: '期限' },
  { key: 'project', label: '案件' },
  { key: 'state', label: '状態' },
];

function DesktopTaskDashboard() {
  const { view } = useParams<{ view: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const isGantt = view === 'gantt';

  const { data, isLoading, isError, refetch } = useTaskDashboard();

  /**
   * ⚠️ **絞り込みは URL で持つ**（レビューでの指摘 #50）。
   *
   * 見え方の切り替えは `navigate('/sales/tasks/gantt')` = **道を変える操作**なので、
   * `useState` で持っていると**画面ごと作り直されて既定に戻ります**。
   * 実測すると、リストで「すべて」を選んでからガントに切り替えた瞬間に
   * **チップが「未完了」に戻って**いました（押した覚えのない絞り込みが掛かる）。
   * しかもチップは**光ったまま**なので、見る人には選んだとおりに見えます。
   *
   * URL に置けば、道が変わっても引き継がれ、**共有した URL でも同じものが見えます**。
   */
  const [params, setParams] = useSearchParams();
  const scope = (params.get('scope') === 'mine' ? 'mine' : 'all') as Scope;
  const filter = ((['all', 'open', 'over'] as const).find((f) => f === params.get('state')) ?? 'open') as Filter;
  const sort = ((['due', 'project', 'state'] as const).find((x) => x === params.get('sort')) ?? 'due') as Sort;
  /** 既定は URL から落とす（`?state=open` を毎回付けて回らない） */
  const setParam = (key: string, value: string, dflt: string) => setParams((n) => {
    if (value === dflt) n.delete(key); else n.set(key, value);
    return n;
  }, { replace: true });
  const setScope = (v: Scope) => setParam('scope', v, 'all');
  const setFilter = (v: Filter) => setParam('state', v, 'open');
  const setSort = (v: Sort) => setParam('sort', v, 'due');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<DashboardTask | null>(null);

  const today = localDateStr(new Date());

  /** 「全体 / 自分」を掛けたところまで。**件数はここから数える** */
  const scoped = useMemo(() => {
    const all = data?.tasks ?? [];
    return scope === 'mine' ? all.filter((t) => t.assigned_to === currentUser?.id) : all;
  }, [data, scope, currentUser?.id]);

  const isOver = (t: DashboardTask) => !t.is_completed && !!t.due_date && t.due_date < today;

  const rows = useMemo(() => {
    const list = scoped.filter((t) => {
      if (filter === 'open') return !t.is_completed;
      if (filter === 'over') return isOver(t);
      return true;
    });
    const byDue = (a: DashboardTask, b: DashboardTask) =>
      // 期限なしは最後。付いているほうが先に効く
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    return [...list].sort((a, b) => {
      if (sort === 'project') return a.project_name.localeCompare(b.project_name, 'ja') || byDue(a, b);
      if (sort === 'state') return stateRank(a) - stateRank(b) || byDue(a, b);
      // 期限順でも**完了は最後**に落とす (済んだものが上に居座ると今日の分が見えない)
      return (Number(a.is_completed) - Number(b.is_completed)) || byDue(a, b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, filter, sort, today]);

  /** チェックボックス。**その場で完了を切り替える** */
  const toggle = async (t: DashboardTask) => {
    try {
      await api.patch(`/projects/${t.project_id}/tasks/${t.id}/complete`, {});
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project-tasks', t.project_id] });
    } catch (err) {
      notifyApiError(t.is_completed ? '完了を取り消せませんでした' : '完了にできませんでした', err);
    }
  };

  const chips = [
    { key: 'all' as const, label: 'すべて', count: data ? scoped.length : null },
    { key: 'open' as const, label: '未完了', count: data ? scoped.filter((t) => !t.is_completed).length : null },
    { key: 'over' as const, label: '期限切れ', count: data ? scoped.filter(isOver).length : null },
  ];

  const openCount = scoped.filter((t) => !t.is_completed).length;
  const activeFilters = [
    scope === 'mine' ? '自分のタスクだけ' : null,
    filter === 'open' ? '未完了だけ' : filter === 'over' ? '期限切れだけ' : null,
  ].filter((f): f is string => f !== null);

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="タスク一覧"
        sub={data ? `全案件のタスク ${scoped.length}件（うち未完了 ${openCount}件）` : '全案件のタスク'}
        primaryAction={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを足す
          </Button>
        }
      >
        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="見え方を切り替える">
          {([['list', 'リスト', ListTodo], ['gantt', 'ガント', GanttChart]] as const).map(([v, label, Icon], i) => (
            <button
              key={v}
              type="button"
              // **絞り込みを引き継ぐ**（道が変わっても選んだものを保つ）
              onClick={() => navigate({ pathname: `/sales/tasks/${v}`, search: params.toString() })}
              aria-pressed={isGantt === (v === 'gantt')}
              className={`min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[40px] ${i > 0 ? 'border-l border-border' : ''} ${
                isGantt === (v === 'gantt') ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* 全体 / 自分。**塗りつぶしで切り替える** (罫線だけだとどちらか分からない) */}
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card px-3 py-2.5">
        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="範囲を切り替える">
          {([['all', '全体'], ['mine', '自分']] as const).map(([k, label], i) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              aria-pressed={scope === k}
              className={`min-h-tap text-sub inline-flex min-w-[96px] items-center justify-center gap-1.5 px-3.5 lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
                scope === k ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
              <span className="font-number text-sub-sm">
                {data ? (k === 'all' ? (data.tasks ?? []).length : (data.tasks ?? []).filter((t) => t.assigned_to === currentUser?.id).length) : ''}
              </span>
            </button>
          ))}
        </div>

        <FilterChips label="状態で絞り込む" items={chips} value={filter} onChange={setFilter} />

        <div className="ml-auto inline-flex shrink-0 items-center gap-2">
          <span className="text-sub text-muted-foreground">並べ替え</span>
          <div className="inline-flex overflow-hidden rounded-control border border-border" role="group" aria-label="並べ替え">
            {SORTS.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={`min-h-tap text-sub px-3.5 lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
                  sort === s.key ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : isError ? (
        <ErrorPanel title="タスクを読み込めませんでした" onRetry={() => refetch()} />
      ) : isGantt ? (
        /*
         * ⚠️ **ガントにも絞り込みを効かせる**（レビューでの指摘 #50）。
         *
         * 前の版は `scoped`（「自分の／すべて」だけを掛けたもの）を渡していたので、
         * **「未完了だけ」「期限超過だけ」を選んでからガントに切り替えると、
         * 全部が出ていました**。チップは選ばれたまま光っているので、
         * 見る人には**絞り込んだ結果**に見えます（数が合わないことにも気づけない —
         * ガントは件数を出さないため）。
         *
         * 並べ替えも一緒に渡しますが、ガントは日付で置くので影響しません。
         */
        <DashboardGanttView
          projects={data?.projects ?? []}
          columns={data?.columns ?? []}
          tasks={rows}
        />
      ) : rows.length === 0 ? (
        activeFilters.length > 0 ? (
          <NoSearchResults
            activeFilters={activeFilters}
            onClearFilters={() => { setScope('all'); setFilter('all'); }}
          />
        ) : (
          <EmptyState
            title="タスクがまだありません"
            description="案件を進めるためにやることを足します。案件の中からでも、ここからでも足せます。"
            action={<Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />タスクを足す</Button>}
          />
        )
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <TaskRowsHeader />
          {rows.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              today={today}
              onToggle={() => toggle(t)}
              onOpen={() => setEditing(t)}
            />
          ))}
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="text-note text-secondary-foreground">
          案件の中のタスクを全案件ぶん集めた画面です。直すのは案件の中でもここでもできます。
          <strong className="font-bold">終わった案件（完了・失注）のタスクは出しません。</strong>
        </p>
      </div>

      {adding && <AddTaskDialog onClose={() => setAdding(false)} />}
      {editing && (
        <TaskDialog
          open
          projectId={editing.project_id}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * スマホと PC で**別の画面**を出す（Phase 6・M1）。
 *
 * ── 同じファイルの中で `sm:hidden` を足して分岐させない ──────
 *
 * v4 の決めごとは「**PCの情報をそのまま縮小して載せない**」です。
 * 1つのファイルが2つの情報設計を持つと、どちらを直しているのか分からなくなります
 * （`docs/design/v4/mobile.md`「実装のときに守ること」）。
 * **部品ごと入れ替え**ます — PC 版は1行も変えていません。
 *
 * **早期 return にしないこと。** 同じ部品の中で `if (mobile) return …` と書くと、
 * 幅が変わったときに**フックの数が変わって React が落ちます**。
 * だからここは「どちらを描くか決めるだけ」の薄い部品にしてあります。
 *
 * ── ガントはスマホに出さない ────────────────────────────────
 *
 * モックの「スマホに置かないもの」に **ガント（PCで見る・リストへ誘導）** が
 * 挙がっています。横に長い時間軸は 375px では読めません。
 * **黙ってリストにすり替えず**、PC で触る旨を書いて「やること」へ送ります。
 * 案内そのものは `@/pcOnlyScreens`（`/sales/tasks/gantt`）が出します
 * — 文面と見た目を10か所に散らさないためです。
 */
export default function TaskDashboardPage() {
  const mobile = useIsMobile();

  if (!mobile) return <DesktopTaskDashboard />;
  // **ガントの案内はここに書かない。** `@/pcOnlyScreens` の表が
  // `/sales/tasks/gantt` を受け持つので、ここに来る時点でスマホ向きの見え方だけ
  return <MobileTaskList />;
}
