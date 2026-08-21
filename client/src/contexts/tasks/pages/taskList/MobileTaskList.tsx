/**
 * ⑧ やること（スマホ・モックの端末枠 8枚目）
 *
 * ── PC の一覧を縮めたものではありません ────────────────────
 *
 * モックの但し書きは元々こうでした:
 *
 *   > **押して消し込むだけ。並べ替えや割り当ての変更はPCで行います。**
 *
 * だから並べ替え（期限／案件／状態）も「全体／自分」も出しません。
 * 出すのは **今日 / 期限切れ / 依頼** の3つと、押して消せる行だけです。
 *
 * ⚠️ **v4ネイティブUI監査 2026-08-20 の指摘で、以下の2点だけモックから広げました**
 * （`docs/v4-native-ui-audit-2026-08-20.md`「④ タスク一覧」）:
 * - **新規追加**（`AddTaskDialog` を `PageHeader.primaryAction` 経由で流用。
 *   スマホでは共通シェルの下端固定スロットに出る）
 * - **延期**（明日 / 3日後 / 日時を選ぶ。`client-v4/mobile.ts` の `duePresets()` を
 *   流用。自作の日付ホイールは作らない決めごとどおり、3つ目は端末の日付ピッカーに任せる）
 *
 * **担当変更は見送った**（引き続き「PC で」の案内）。担当は `users-by-module-sales` の
 * 一覧から選ぶ必要があり、この画面のシート（期限・状態を見せるだけの小さい枠）に
 * 検索付きの担当選択まで詰めると、消し込み画面の軽さが失われるため。
 *
 * ── 行を押しても画面を移らない ──────────────────────────────
 *
 * 決めごと「終わらせるのはシートで」。やってはいけない例は
 * **「行タップ→別画面→戻ると先頭に戻る」**。20件片づけるのに
 * 20回スクロールし直すことになります。**下から出るシート**で1件ずつ確定します。
 *
 * ── 「今日」の数え方 ────────────────────────────────────────
 *
 * モックは `今日 3 / 期限切れ 2 / 依頼 1`。
 * **依頼は出しません** — 「誰かから頼まれた」を表す列が `project_tasks` に無く、
 * 担当が自分かどうかしか分からないためです（数えられないものを置かない）。
 * 代わりに **自分 / 全体** を出します（下の `SCOPES`）。
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, ErrorPanel, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { dueLabel, duePresets } from '@gmo-onair/shared/src/client-v4/mobile';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
import { useTaskDashboard } from '@/contexts/tasks/hooks/useProjectTasks';
import { taskState, TASK_STATE_LABEL } from './state';
import { AddTaskDialog } from './AddTaskDialog';
import type { DashboardTask } from '@/types';

type Chip = 'today' | 'over' | 'all';

/** 期限の色。**過ぎたものだけ赤**（全部に色を付けると超過が埋もれる） */
const TONE: Record<string, string> = {
  over: 'text-destructive',
  today: 'text-warning',
  soon: 'text-secondary-foreground',
  far: 'text-muted-foreground',
  none: 'text-muted-foreground',
};

export function MobileTaskList() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const { data, isLoading, isError, refetch } = useTaskDashboard();
  const [chip, setChip] = useState<Chip>('today');
  const [mineOnly, setMineOnly] = useState(true);
  const [open, setOpen] = useState<DashboardTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const today = localDateStr(new Date());

  const scoped = useMemo(() => {
    const all = (data?.tasks ?? []).filter((t) => !t.is_completed);
    return mineOnly ? all.filter((t) => t.assigned_to === currentUser?.id) : all;
  }, [data, mineOnly, currentUser?.id]);

  const counts = useMemo(() => ({
    today: scoped.filter((t) => (t.due_date ?? '').slice(0, 10) === today).length,
    over: scoped.filter((t) => !!t.due_date && t.due_date.slice(0, 10) < today).length,
    all: scoped.length,
  }), [scoped, today]);

  const rows = useMemo(() => {
    const f = scoped.filter((t) => {
      const d = (t.due_date ?? '').slice(0, 10);
      if (chip === 'today') return d === today;
      if (chip === 'over') return !!d && d < today;
      return true;
    });
    // **期限の近い順。** 期限なしは最後（押す理由が弱い）
    return [...f].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  }, [scoped, chip, today]);

  const complete = async (t: DashboardTask) => {
    setBusy(true);
    try {
      await api.patch(`/projects/${t.project_id}/tasks/${t.id}/complete`, {});
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project-tasks', t.project_id] });
      setOpen(null);
      notifySuccess('完了にしました');
    } catch (e) {
      notifyApiError('完了にできませんでした', e);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 延期。**PUT の汎用更新に `due_date` だけ渡す**（専用の postpone エンドポイントは
   * タスクには無い — `project_tasks.service.ts#update` が `'due_date' in data` で
   * 部分更新を受けるので、それで足りる）。`dateStr` は `YYYY-MM-DD`（`due_date` は
   * DATE 列で `::date` にキャストされるだけなので、時刻は持たせない）。
   */
  const postpone = async (t: DashboardTask, dateStr: string) => {
    setBusy(true);
    try {
      await api.put(`/projects/${t.project_id}/tasks/${t.id}`, { due_date: dateStr });
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
      qc.invalidateQueries({ queryKey: ['project-tasks', t.project_id] });
      setOpen(null);
      notifySuccess('期限を延ばしました');
    } catch (e) {
      notifyApiError('延期できませんでした', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5 p-3">
      {/* **説明はここ1か所だけ。** 以前は同じ文が画面末尾にもう一度出ていた（M7） */}
      <PageHeader
        title="やること"
        sub="押して消し込むだけ。並べ替え・担当の変更は PC で"
        primaryAction={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />タスクを足す
          </Button>
        }
      />

      <FilterChips
        label="絞り込む"
        items={[
          { key: 'today', label: '今日', count: counts.today },
          { key: 'over', label: '期限切れ', count: counts.over },
          { key: 'all', label: 'すべて', count: counts.all },
        ]}
        value={chip}
        onChange={(k) => setChip(k as Chip)}
      />

      {/* **自分 / 全体。** モックの「依頼」は数えられないので置き換えてある */}
      <div className="rounded-control-lg inline-flex self-start overflow-hidden border border-border">
        {([['mine', '自分'], ['all', '全体']] as const).map(([k, label], i) => (
          <button
            key={k}
            type="button"
            onClick={() => setMineOnly(k === 'mine')}
            aria-pressed={mineOnly === (k === 'mine')}
            className={cn(
              'min-h-tap text-sub px-4',
              i > 0 && 'border-l border-border',
              mineOnly === (k === 'mine') ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : isError ? (
        <ErrorPanel title="やることを読み込めませんでした" onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={chip === 'today' ? '今日が期限のものはありません' : chip === 'over' ? '期限を過ぎたものはありません' : 'やることはありません'}
          description={mineOnly ? '「全体」に切り替えると、ほかの人のぶんも見られます。' : '新しく足すのは上の「タスクを足す」か、案件の中からです。'}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((t) => {
            const d = dueLabel(t.due_date, today);
            return (
              <li key={t.id}>
                {/*
                  **カード1枚 = タスク1件。** 表にしない（決めごと「表・多列は使わない」）。
                  押すとシートが開く — 画面は移らない
                */}
                <button
                  type="button"
                  onClick={() => setOpen(t)}
                  className="rounded-card flex w-full items-start gap-3 border border-border bg-card p-3.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-list block [overflow-wrap:anywhere]">{t.title}</span>
                    <span className="text-note mt-1 block truncate text-muted-foreground">
                      {[t.project_gls_number, t.project_name].filter(Boolean).join(' ・ ')}
                    </span>
                    <span className={cn('text-note mt-1 block font-bold', TONE[d.tone])}>{d.text}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Sheet
          open
          onOpenChange={(v) => !v && setOpen(null)}
          title={open.title}
          sub={[open.project_gls_number, open.project_name].filter(Boolean).join(' ・ ')}
          footer={
            <Button className="w-full" disabled={busy} onClick={() => complete(open)}>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />完了にする
            </Button>
          }
        >
          <dl className="text-sub flex flex-col gap-2.5">
            <Fact label="期限" value={dueLabel(open.due_date, today).text} tone={TONE[dueLabel(open.due_date, today).tone]} />
            <Fact label="状態" value={TASK_STATE_LABEL[taskState(open)]} />
            {open.description && <Fact label="内容" value={open.description} />}
          </dl>

          {/*
            延期。**自作の日付ホイールを作らない**（決めごと「入力は端末に任せる」）。
            `duePresets()` の3つ目（`value === null`）は端末の日付ピッカーに任せる —
            見た目はほかの2つと同じチップだが、中に `<input type="date">` を
            透明に重ねて押した瞬間にネイティブのピッカーが開く形にしてある。
          */}
          <div className="mt-3.5 flex flex-col gap-1.5">
            <span className="text-sub text-muted-foreground">延期する</span>
            <div className="flex flex-wrap gap-2">
              {duePresets(new Date()).map((p) => (
                p.value ? (
                  <button
                    key={p.key}
                    type="button"
                    disabled={busy}
                    onClick={() => postpone(open, p.value!.slice(0, 10))}
                    className="min-h-tap text-sub rounded-control border border-border px-3.5 text-muted-foreground disabled:opacity-50"
                  >
                    {p.label}
                  </button>
                ) : (
                  <label
                    key={p.key}
                    className="min-h-tap text-sub relative inline-flex cursor-pointer items-center rounded-control border border-border px-3.5 text-muted-foreground"
                  >
                    {p.label}
                    {/* 透明な入力を重ねるだけ。見た目はチップ側が持つ */}
                    <input
                      type="date"
                      disabled={busy}
                      onChange={(e) => e.target.value && postpone(open, e.target.value)}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      aria-label="延期する日付を選ぶ"
                    />
                  </label>
                )
              ))}
            </div>
          </div>

          <p className="text-note mt-3.5 text-muted-foreground">
            担当を変えるのは PC の一覧からです（この画面は消し込みと延期専用）。
          </p>
        </Sheet>
      )}

      {adding && <AddTaskDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 flex-1 [overflow-wrap:anywhere]', tone)}>{value}</dd>
    </div>
  );
}
