/**
 * ⑤ 全プロジェクトのやること (v4 GPM) — 未確認事項 ／ 次にやること
 *
 * ── モックの「タスク一覧」をそのまま作れなかった理由 ────────
 *
 * モック（`GP_TK`）は全プロジェクトのタスクを1枚に並べますが、
 * **GPM のタスクを読む API がありません**。タスクは既存 `project_tasks` に
 * `gpm_phase_id` で紐づいていて、**`project_id` は NULL** です。既存の
 * タスク一覧・かんばん・ガント・MCP はどれも `JOIN projects` するので、
 * GPM のタスクは**1件も返りません**（サーバーの SQL を読んで確認しました）。
 *
 * 出せるのは `GET /gpm/projects` が返す**プロジェクトごとの「次の1件」**
 * （`next_task` / `next_due`）だけです。なので:
 *
 *   ・タブの名前を「タスク」ではなく **「次にやること」** にする
 *     — 全部のタスクが並んでいると思わせない
 *   ・**プロジェクトごとに1件だけ**であることを画面に書く
 *
 * 全件を並べるには「`gpm_phase_id` からタスクを引く口」をサーバーに足す
 * 必要があります。それは画面の作り直しとは別の作業です。
 *
 * ── 未確認事項はここが本体 ──────────────────────────────────
 *
 * プロジェクトをまたいで「いま何件止まっているか」を引けるのが
 * `gpm_open_items` を作った理由そのものなので（`docs/design/gpm-model.md` 決め④）、
 * こちらは全部の操作ができます。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CircleHelp, ListTodo } from 'lucide-react';
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
import { useGpmOpenItems, useGpmProjects, useInvalidateGpm } from '../queries';
import { dueLabel, dueTone, ymd, type GpmOpenItem, type OpenItemStatus } from '../types';
import { OpenItemRow, OpenItemRowsHeader } from './projectDetail/OpenItemRows';
import { OpenItemDialog } from './projectDetail/OpenItemDialog';

const CHIPS: { key: string; label: string; statuses: OpenItemStatus[] }[] = [
  { key: 'open', label: '止まっているもの', statuses: ['waiting', 'checking'] },
  { key: 'waiting', label: '返事待ち', statuses: ['waiting'] },
  { key: 'checking', label: '確認中', statuses: ['checking'] },
  { key: 'resolved', label: '解決', statuses: ['resolved'] },
  { key: 'all', label: 'すべて', statuses: ['waiting', 'checking', 'resolved'] },
];

export default function GpmTaskListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'next' ? 'next' : 'asks';
  const setTab = (v: 'asks' | 'next') => {
    const next = new URLSearchParams(params);
    if (v === 'next') next.set('tab', 'next'); else next.delete('tab');
    setParams(next, { replace: true });
  };

  const { hasPermission } = useAuth();
  const canEdit = hasPermission('gpm', 'editor');
  const invalidate = useInvalidateGpm();
  const today = useMemo(() => localDateStr(new Date()), []);

  const [chip, setChip] = useState('open');
  const [editing, setEditing] = useState<GpmOpenItem | null>(null);

  // **解決済みも含めて1回で取る。** 開いているタブだけ取ると、
  // 閉じているチップの件数が 0 のままになって数字が嘘になる
  const asks = useGpmOpenItems('all');
  const projects = useGpmProjects('');

  const allAsks = useMemo(() => asks.data ?? [], [asks.data]);
  const askRows = useMemo(() => {
    const statuses = CHIPS.find((c) => c.key === chip)?.statuses ?? [];
    return allAsks.filter((a) => statuses.includes(a.status));
  }, [allAsks, chip]);

  const nextRows = useMemo(
    () => (projects.data ?? [])
      .filter((p) => p.next_task && p.status !== 'done')
      .sort((a, b) => (ymd(a.next_due) ?? '9999').localeCompare(ymd(b.next_due) ?? '9999')),
    [projects.data],
  );

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
      invalidate(item.gpm_project_id);
      notifySuccess(item.status === 'resolved' ? '返事待ちに戻しました' : '解決にしました');
    },
    onError: (err) => notifyApiError('未確認事項を変えられませんでした', err),
  });

  const remove = useMutation({
    mutationFn: (item: GpmOpenItem) => api.delete(`/gpm/open-items/${item.id}`),
    onSuccess: (_r, item) => { invalidate(item.gpm_project_id); notifySuccess('未確認事項を消しました'); },
    onError: (err) => notifyApiError('未確認事項を消せませんでした', err),
  });

  const onDelete = async (item: GpmOpenItem) => {
    const ok = await confirmAction({
      title: 'この未確認事項を消しますか？',
      description: `「${item.question}」\n解決したのなら消さずに「解決」にしてください。消すと訊いた記録が残りません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate(item);
  };

  const openCount = allAsks.filter((a) => a.status !== 'resolved').length;

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="全プロジェクトのやること"
        sub={asks.data ? `止まっているもの ${openCount}件` : 'プロジェクトをまたいで見ます'}
      >
        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="見るものを切り替える">
          {([['asks', '未確認事項', CircleHelp], ['next', '次にやること', ListTodo]] as const).map(([v, label, Icon], i) => (
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
      </PageHeader>

      {tab === 'asks' ? (
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
            <ErrorPanel title="未確認事項を読み込めませんでした" onRetry={() => asks.refetch()} />
          ) : asks.isLoading ? (
            <Delayed><SkeletonRows rows={5} /></Delayed>
          ) : askRows.length === 0 ? (
            <EmptyState
              icon={<CircleHelp className="h-6 w-6" aria-hidden="true" />}
              title={chip === 'open' ? '止まっているものはありません' : '当てはまる未確認事項はありません'}
              description="先方や社内の判断待ちで工程が進められないものは、プロジェクト詳細の「未確認事項」から足します。"
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
                  onOpen={(item) => navigate(`/gpm/projects/${item.gpm_project_id}/asks`)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {projects.isError ? (
            <ErrorPanel title="プロジェクトを読み込めませんでした" onRetry={() => projects.refetch()} />
          ) : projects.isLoading ? (
            <Delayed><SkeletonRows rows={5} /></Delayed>
          ) : nextRows.length === 0 ? (
            <EmptyState
              icon={<ListTodo className="h-6 w-6" aria-hidden="true" />}
              title="次にやることはありません"
              description="標準工程からプロジェクトを作ると、工程の下にタスクが日付付きで入り、期限がいちばん近いものがここに出ます。"
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <RowHeader className="hidden sm:flex">
                <RowMain>次にやること ／ プロジェクト</RowMain>
                <RowSlot w={128}>いまの工程</RowSlot>
                <RowSlot w={96}>期限</RowSlot>
              </RowHeader>
              {nextRows.map((p) => {
                const due = ymd(p.next_due);
                return (
                  <Row
                    key={p.id}
                    divider
                    interactive
                    stackOnMobile
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/gpm/projects/${p.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/gpm/projects/${p.id}`); }
                    }}
                    className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RowMain>
                      <RowTitle>{p.next_task}</RowTitle>
                      <RowSub>{p.name}</RowSub>
                    </RowMain>
                    <RowSlot w={128} className="text-sub min-w-0" hideOnMobile>
                      {p.current_phase ? <span className="truncate">{p.current_phase}</span> : null}
                    </RowSlot>
                    <RowSlot w={96} className={cn('text-sub font-number', dueTone(due, today))}>
                      {dueLabel(due, today)}
                    </RowSlot>
                  </Row>
                );
              })}
            </div>
          )}

          <p className="text-note text-muted-foreground">
            ここに出るのは<strong>プロジェクトごとに期限がいちばん近い1件だけ</strong>です。
            工程の下のタスクを全部並べるには、サーバーに「工程からタスクを引く口」を足す必要があります
            （いまのタスク一覧は案件に紐づくものしか返しません）。
          </p>
        </>
      )}

      {editing && (
        <OpenItemDialog
          projectId={editing.gpm_project_id}
          item={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
