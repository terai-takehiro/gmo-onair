/**
 * ⑤ 全プロジェクトのタスク (v4 GPM) — タスク ／ 未確認事項
 *
 * ── GPM 専用の口で引きます ──────────────────────────────────
 *
 * モック（`GP_TK`）どおり全プロジェクトのタスクを1枚に並べます。
 * 引くのは **`GET /gpm/tasks`**（GPM 専用）です。
 *
 * **既存の `/tasks` では引けません。** GPM のタスクは既存 `project_tasks` に
 * `gpm_phase_id` で紐づいていますが **`project_id` は NULL** で、既存の
 * タスク一覧・かんばん・ガント・MCP はどれも `JOIN projects` するため
 * 1件も返りません。`project_id` を埋めて相乗りさせると、**案件のタスク一覧・
 * 週報・MCP に工事のタスクが混ざります**（`docs/design/gpm-model.md`）。
 *
 * ── 未確認事項はここが本体 ──────────────────────────────────
 *
 * プロジェクトをまたいで「いま何件止まっているか」を引けるのが
 * `gpm_open_items` を作った理由そのものなので（`docs/design/gpm-model.md` 決め④）、
 * こちらは全部の操作ができます。
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CircleHelp, ListTodo } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useGpmOpenItems, useGpmTasks, useInvalidateGpm } from '../queries';
import {
  PHASE_STATE_LABEL, PHASE_STATE_TONE, dueLabel, dueTone, ymd,
  type GpmOpenItem, type GpmTask, type OpenItemStatus,
} from '../types';
import { OpenItemRow, OpenItemRowsHeader } from './projectDetail/OpenItemRows';
import { OpenItemDialog } from './projectDetail/OpenItemDialog';
import { MobileTaskTabs } from './taskList/MobileTaskTabs';
import { TaskCards } from './taskList/TaskCards';
import { OpenItemCards } from './taskList/OpenItemCards';

const CHIPS: { key: string; label: string; statuses: OpenItemStatus[] }[] = [
  { key: 'open', label: '停滞中', statuses: ['waiting', 'checking'] },
  { key: 'waiting', label: '返事待ち', statuses: ['waiting'] },
  { key: 'checking', label: '確認中', statuses: ['checking'] },
  { key: 'resolved', label: '解決', statuses: ['resolved'] },
  { key: 'all', label: 'すべて', statuses: ['waiting', 'checking', 'resolved'] },
];

export default function GpmTaskListPage() {
  const navigate = useNavigate();
  // **薄い親で1回だけ**（`shared/CLAUDE.md`「`useIsMobile()` で早期 return しない」）。
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: 'tasks' | 'asks' = raw === 'asks' ? 'asks' : 'tasks';
  const setTab = (v: 'tasks' | 'asks') => {
    const next = new URLSearchParams(params);
    if (v === 'asks') next.set('tab', 'asks'); else next.delete('tab');
    setParams(next, { replace: true });
  };

  /**
   * タスクの絞り込み。**知らない値はサーバーが空で返す**
   *
   * ダッシュボード KPI「今週が期限の作業」（`dashboard/KpiStrip.tsx`）が
   * `?tab=next` で送ってくるので、来たときだけ初期チップを `week` にする
   * （初回マウント時の判定だけ。以降のチップ操作は他のチップと同じく
   * URL に書き戻さない）。
   */
  const [taskChip, setTaskChip] = useState(() => (raw === 'next' ? 'week' : 'open'));

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const invalidate = useInvalidateGpm();
  const today = useMemo(() => localDateStr(new Date()), []);
  // KPI と**同じ「今週」の定義**（`GpmDashboardPage.tsx` の `weekEnd`）。
  // ローリング7日（今日を含め6日後まで）で、暦週（月〜日）ではない
  const weekEnd = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + 6);
    return localDateStr(end);
  }, []);

  const [chip, setChip] = useState('open');
  const [editing, setEditing] = useState<GpmOpenItem | null>(null);

  // **解決済みも含めて1回で取る。** 開いているタブだけ取ると、
  // 閉じているチップの件数が 0 のままになって数字が嘘になる
  const asks = useGpmOpenItems('all');
  // **すべて取ってから画面で分ける。** 開いているチップだけ取ると、
  // 閉じているチップの件数が古いまま残って数字が嘘になる
  const tasks = useGpmTasks('all');

  const allAsks = useMemo(() => asks.data ?? [], [asks.data]);
  const askRows = useMemo(() => {
    const statuses = CHIPS.find((c) => c.key === chip)?.statuses ?? [];
    return allAsks.filter((a) => statuses.includes(a.status));
  }, [allAsks, chip]);

  const allTasks = useMemo(() => tasks.data ?? [], [tasks.data]);
  // **「今週」判定は1つの関数に集約。** チップの絞り込みと件数バッジで
  // 別々に書くと片方だけ直したときに件数と一覧が食い違う
  const isWeekDue = useCallback((t: GpmTask) => {
    if (t.is_completed || !t.due_at) return false;
    const d = ymd(t.due_at);
    return d !== null && d >= today && d <= weekEnd;
  }, [today, weekEnd]);
  const taskCounts = useMemo(() => ({
    open: allTasks.filter((t) => !t.is_completed).length,
    week: allTasks.filter(isWeekDue).length,
    overdue: allTasks.filter((t) => !t.is_completed && !!t.due_at && ymd(t.due_at)! < today).length,
    done: allTasks.filter((t) => t.is_completed).length,
    all: allTasks.length,
  }), [allTasks, today, isWeekDue]);
  const taskRows = useMemo(() => {
    if (taskChip === 'all') return allTasks;
    if (taskChip === 'done') return allTasks.filter((t) => t.is_completed);
    if (taskChip === 'week') return allTasks.filter(isWeekDue);
    if (taskChip === 'overdue') {
      return allTasks.filter((t) => !t.is_completed && !!t.due_at && ymd(t.due_at)! < today);
    }
    return allTasks.filter((t) => !t.is_completed);
  }, [allTasks, taskChip, today, isWeekDue]);

  const setDone = useMutation({
    mutationFn: (t: GpmTask) => api.put(`/gpm/tasks/${t.id}/done`, { done: !t.is_completed }),
    onSuccess: (_r, t) => {
      invalidate(t.project_id);
      notifySuccess(t.is_completed ? '未完了に戻しました' : '完了にしました');
    },
    onError: (e) => notifyApiError('タスクを変更できませんでした', e),
  });

  const toggle = useMutation({
    mutationFn: (item: GpmOpenItem) =>
      api.put(`/gpm/open-items/${item.id}`, {
        question: item.question,
        to_kind: item.to_kind,
        to_name: item.to_name,
        blocks: item.blocks,
        due_date: ymd(item.due_date),
        status: item.status === 'resolved' ? 'waiting' : 'resolved',
      }),
    onSuccess: (_r, item) => {
      invalidate(item.project_id);
      notifySuccess(item.status === 'resolved' ? '未解決に戻しました' : '解決にしました');
    },
    onError: (err) => notifyApiError('未解決事項を変更できませんでした', err),
  });

  const remove = useMutation({
    mutationFn: (item: GpmOpenItem) => api.delete(`/gpm/open-items/${item.id}`),
    onSuccess: (_r, item) => { invalidate(item.project_id); notifySuccess('未解決事項を削除しました'); },
    onError: (err) => notifyApiError('未解決事項を削除できませんでした', err),
  });

  const onDelete = async (item: GpmOpenItem) => {
    const ok = await confirmAction({
      title: 'この未解決事項を削除しますか？',
      description: `「${item.question}」\n解決したのなら消さずに「解決」にしてください。消すと訊いた記録が残りません。`,
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) remove.mutate(item);
  };

  const openCount = allAsks.filter((a) => a.status !== 'resolved').length;

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="全プロジェクトのタスク"
        sub={tasks.data
          ? `未完了 ${taskCounts.open}件 ・ 止まっている未解決事項 ${openCount}件`
          : 'プロジェクトをまたいで見ます'}
      >
        {/* **スマホでは出さない。** ここは見出しの下に折り返るだけで専用のナビゲーションに
            ならない（監査 2026-08-20 ⑤ 指摘）。スマホは下の `MobileTaskTabs` に譲る */}
        {!isMobile && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="表示形式を切り替える">
            {([['tasks', 'タスク', ListTodo], ['asks', '未解決事項', CircleHelp]] as const).map(([v, label, Icon], i) => (
              <button
                key={v}
                type="button"
                aria-pressed={tab === v}
                onClick={() => setTab(v)}
                className={cn(
                  'min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[40px]',
                  i > 0 && 'border-l border-border',
                  tab === v ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {/* **画面の主ナビゲーション**（タスク／未確認事項）を幅いっぱいに立てる。
          件数は見出しの `sub` と同じ数え方（`taskCounts.open` / `openCount`） */}
      {isMobile && (
        <MobileTaskTabs
          tab={tab}
          onChange={setTab}
          taskCount={tasks.data ? taskCounts.open : null}
          askCount={asks.data ? openCount : null}
        />
      )}

      {tab === 'tasks' ? (
        <>
          <FilterChips
            label="タスクの状態で絞り込む"
            items={[
              { key: 'open', label: '未完了', count: tasks.data ? taskCounts.open : null },
              { key: 'week', label: '今週期限', count: tasks.data ? taskCounts.week : null },
              { key: 'overdue', label: '期限超過', count: tasks.data ? taskCounts.overdue : null },
              { key: 'done', label: '完了', count: tasks.data ? taskCounts.done : null },
              { key: 'all', label: 'すべて', count: tasks.data ? taskCounts.all : null },
            ]}
            value={taskChip}
            onChange={setTaskChip}
          />

          {tasks.isError ? (
            <ErrorPanel title="タスクを読み込めませんでした" onRetry={() => tasks.refetch()} />
          ) : tasks.isLoading ? (
            <Delayed><SkeletonRows rows={6} /></Delayed>
          ) : taskRows.length === 0 ? (
            <EmptyState
              icon={<ListTodo className="h-6 w-6" aria-hidden="true" />}
              title={taskChip === 'open' ? '未完了のタスクはありません' : '条件に合うタスクはありません'}
              description="工程テンプレートからプロジェクトを作成すると、工程の下にタスクが日付付きで入ります。"
            />
          ) : isMobile ? (
            <TaskCards
              rows={taskRows}
              today={today}
              canEdit={canEdit}
              onToggleDone={(t) => setDone.mutate(t)}
              onOpenProject={(projectId) => navigate(`/gpm/projects/${projectId}`)}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <RowHeader className="hidden sm:flex">
                {canEdit && <RowSlot w={56} align="center">完了</RowSlot>}
                <RowMain>タスク ／ プロジェクト</RowMain>
                <RowSlot w={128}>工程</RowSlot>
                <RowSlot w={96}>担当</RowSlot>
                <RowSlot w={96}>期限</RowSlot>
              </RowHeader>
              {taskRows.map((t) => {
                const due = ymd(t.due_at);
                return (
                  <Row key={t.id} divider stackOnMobile className={cn(t.is_completed && 'opacity-60')}>
                    {canEdit && (
                      <RowSlot w={56} align="center">
                        <button
                          type="button"
                          onClick={() => setDone.mutate(t)}
                          disabled={setDone.isPending}
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
                          onClick={() => navigate(`/gpm/projects/${t.project_id}`)}
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
              })}
            </div>
          )}

          <p className="text-note text-muted-foreground">
            工程の状態は色で出しています（{PHASE_STATE_LABEL.doing}／{PHASE_STATE_LABEL.blocked}／{PHASE_STATE_LABEL.done}）。
            タスクの追加・編集は<strong className="font-bold">プロジェクト詳細の工程</strong>からです。
          </p>
        </>
      ) : tab === 'asks' ? (
        <>
          <FilterChips
            label="状態で絞り込む"
            items={CHIPS.map((c) => ({
              key: c.key,
              label: c.label,
              count: asks.data ? allAsks.filter((a) => c.statuses.includes(a.status)).length : null,
            }))}
            value={chip}
            onChange={setChip}
          />

          {asks.isError ? (
            <ErrorPanel title="未解決事項を読み込めませんでした" onRetry={() => asks.refetch()} />
          ) : asks.isLoading ? (
            <Delayed><SkeletonRows rows={5} /></Delayed>
          ) : askRows.length === 0 ? (
            <EmptyState
              icon={<CircleHelp className="h-6 w-6" aria-hidden="true" />}
              title={chip === 'open' ? '停滞中の未解決事項はありません' : '条件に合う未解決事項はありません'}
              description="先方や社内の判断待ちで工程が進められないものは、プロジェクト詳細の「未解決事項」から足します。"
            />
          ) : isMobile ? (
            <OpenItemCards
              rows={askRows}
              today={today}
              canEdit={canEdit}
              onOpen={(item) => navigate(`/gpm/projects/${item.project_id}/asks`)}
              onToggleResolved={(item) => toggle.mutate(item)}
              onEdit={setEditing}
              onDelete={onDelete}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <OpenItemRowsHeader withProject />
              {askRows.map((a) => (
                <OpenItemRow
                  key={a.id}
                  item={a}
                  today={today}
                  withProject
                  canEdit={canEdit}
                  onToggleResolved={(item) => toggle.mutate(item)}
                  onEdit={setEditing}
                  onDelete={onDelete}
                  onOpen={(item) => navigate(`/gpm/projects/${item.project_id}/asks`)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {editing && (
        <OpenItemDialog
          projectId={editing.project_id}
          item={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
