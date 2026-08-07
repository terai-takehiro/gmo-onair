/**
 * ③ プロジェクト詳細 (v4 GPM) — 概要（工程）／未確認事項／体制
 *
 * ── 3タブにした理由 ────────────────────────────────────────
 *
 * モックの詳細は 工程・体制・お金・書類・議事録・活動履歴 を1画面に積みますが、
 * このうち**サーバーが持っているのは工程・未確認事項・体制の3つだけ**です。
 * お金（個別見積・請求）と議事録は GPM のデータがまだ無いので出しません
 * （`docs/design/gpm-model.md`）。**枠だけのタブを並べない**。
 * 書類（BOX）は 2026-08-07 に足しました — 構成をプロジェクト用に別に決めて、
 * **押したときだけ作る**形にしてあります（`FilesTab`）。
 *
 * ── 工程配下のタスクの一覧は出せない ────────────────────────
 *
 * タスクは既存 `project_tasks` に `gpm_phase_id` で紐づいていますが、
 * **`project_id` が NULL** なので、既存のタスク一覧（`JOIN projects`）からは
 * 1件も返りません。工程ごとの件数（`task_count` / `task_done`）だけは
 * サーバーが数えているので、それを出しています。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Delayed, SkeletonRows, ErrorPanel, NotFoundPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useGpmProject, useInvalidateGpm } from '../queries';
import { STATUS_LABEL, type GpmOpenItem, type GpmPhase, type GpmStatus, type PhaseState } from '../types';
import { DetailHeader, isDetailTab, type DetailTabKey } from './projectDetail/DetailHeader';
import { EstimatesTab } from './projectDetail/EstimatesTab';
import { PhaseRow, PhaseRowsHeader } from './projectDetail/PhaseRows';
import { PhaseDialog } from './projectDetail/PhaseDialog';
import { OpenItemRow, OpenItemRowsHeader } from './projectDetail/OpenItemRows';
import { OpenItemDialog } from './projectDetail/OpenItemDialog';
import { EditProjectDialog } from './projectDetail/EditProjectDialog';
import { MembersTab } from './projectDetail/MembersTab';
import { FilesTab } from './projectDetail/FilesTab';

export default function GpmProjectDetailPage() {
  const { id = '', tab: rawTab } = useParams<{ id: string; tab: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidateGpm();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('gpm', 'editor');
  const canManage = hasPermission('gpm', 'manager');
  const tab: DetailTabKey = isDetailTab(rawTab) ? rawTab : 'overview';

  const today = useMemo(() => localDateStr(new Date()), []);
  const [editing, setEditing] = useState(false);
  const [phaseEdit, setPhaseEdit] = useState<GpmPhase | null>(null);
  const [askEdit, setAskEdit] = useState<GpmOpenItem | null>(null);
  const [askAdding, setAskAdding] = useState(false);

  const query = useGpmProject(id);

  const changeStatus = useMutation({
    mutationFn: (status: GpmStatus) => api.put(`/gpm/projects/${id}`, fullBody(query.data!, { status })),
    onSuccess: (_r, status) => {
      invalidate(id);
      notifySuccess(`状態を「${STATUS_LABEL[status]}」にしました`);
    },
    onError: (err) => notifyApiError('状態を変えられませんでした', err),
  });

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

  const toggleAsk = useMutation({
    mutationFn: (item: GpmOpenItem) =>
      api.put(`/gpm/open-items/${item.id}`, {
        question: item.question,
        to_kind: item.to_kind,
        to_name: item.to_name,
        blocks: item.blocks,
        due_date: item.due_date ? String(item.due_date).slice(0, 10) : null,
        status: item.status === 'resolved' ? 'waiting' : 'resolved',
      }),
    onSuccess: (_r, item) => {
      invalidate(id);
      notifySuccess(item.status === 'resolved' ? '返事待ちに戻しました' : '解決にしました');
    },
    onError: (err) => notifyApiError('未確認事項を変えられませんでした', err),
  });

  const removeAsk = useMutation({
    mutationFn: (item: GpmOpenItem) => api.delete(`/gpm/open-items/${item.id}`),
    onSuccess: () => { invalidate(id); notifySuccess('未確認事項を消しました'); },
    onError: (err) => notifyApiError('未確認事項を消せませんでした', err),
  });

  const removeProject = useMutation({
    mutationFn: () => api.delete(`/gpm/projects/${id}`),
    onSuccess: () => { invalidate(id); notifySuccess('プロジェクトを消しました'); navigate('/gpm/projects'); },
    onError: (err) => notifyApiError('プロジェクトを消せませんでした', err),
  });

  if (query.isLoading) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;
  }
  if (query.isError) {
    const status = (query.error as { response?: { status?: number } })?.response?.status;
    return status === 404
      ? <NotFoundPanel />
      : <div className="p-4 lg:p-6"><ErrorPanel title="プロジェクトを読み込めませんでした" onRetry={() => query.refetch()} /></div>;
  }
  const p = query.data!;
  const openAsks = p.open_items.filter((a) => a.status !== 'resolved');

  const onChangeStatus = async (next: GpmStatus) => {
    const ok = await confirmAction({
      title: `状態を「${STATUS_LABEL[next]}」にしますか？`,
      description: [
        `いま: ${STATUS_LABEL[p.status]} → ${STATUS_LABEL[next]}`,
        'ダッシュボードの「進行中プロジェクト」と一覧の絞り込みが同時に変わります。',
      ].join('\n'),
      confirmLabel: '状態を変える',
    });
    if (ok) changeStatus.mutate(next);
  };

  const onDeleteAsk = async (item: GpmOpenItem) => {
    const ok = await confirmAction({
      title: 'この未確認事項を消しますか？',
      description: `「${item.question}」\n解決したのなら消さずに「解決」にしてください。消すと訊いた記録が残りません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) removeAsk.mutate(item);
  };

  const onDeleteProject = async () => {
    const ok = await confirmAction({
      title: 'このプロジェクトを消しますか？',
      description: `「${p.name}」\n工程 ${p.phases.length}件・未確認事項 ${p.open_items.length}件・体制 ${p.members.length}名も一緒に見えなくなります。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) removeProject.mutate();
  };

  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader
        project={p}
        tab={tab}
        counts={{ overview: p.phases.length, asks: openAsks.length, members: p.members.length }}
        canEdit={canEdit}
        onChangeStatus={onChangeStatus}
        onEdit={() => setEditing(true)}
      />

      {tab === 'overview' && (
        <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
          {p.phases.length === 0 ? (
            <EmptyState
              title="工程がまだありません"
              description="標準工程を選んで作ると、工程とタスクが日付付きで入ります。あとから工程だけを足す口はまだサーバーにありません。"
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <PhaseRowsHeader />
              {p.phases.map((ph, i) => (
                <PhaseRow
                  key={ph.id}
                  phase={ph}
                  index={i}
                  canEdit={canEdit}
                  onChangeState={(phase, state) => changePhaseState.mutate({ phase, state })}
                  onEdit={setPhaseEdit}
                />
              ))}
            </div>
          )}

          {p.notes && (
            <section className="rounded-card border border-border bg-card p-4 lg:px-5">
              <h2 className="text-cardtitle mb-1.5">メモ</h2>
              <p className="text-sub whitespace-pre-wrap text-foreground">{p.notes}</p>
            </section>
          )}

          <p className="text-note text-muted-foreground">
            「タスク」の欄は<strong>件数だけ</strong>です。工程の下のタスクを1件ずつ読む口がサーバーにまだありません
            {p.template_name ? `（この工程は標準工程「${p.template_name}」から写したものです）` : ''}。
            見積・請求・書類・議事録は、プロジェクト管理側のデータがまだ無いので出していません。
          </p>

          {canManage && (
            <div className="pt-2">
              <Button variant="outline" onClick={onDeleteProject}>
                <Trash2 className="mr-2 h-4 w-4 text-destructive" aria-hidden="true" />
                このプロジェクトを消す
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'asks' && (
        <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sub min-w-0 flex-1 text-muted-foreground">
              返事が来ていない・判断が出ていないもの。解決したものも残ります（訊いた記録なので消しません）。
            </p>
            {canEdit && (
              <Button onClick={() => setAskAdding(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />未確認事項を足す
              </Button>
            )}
          </div>

          {p.open_items.length === 0 ? (
            <EmptyState
              title="未確認事項はありません"
              description="先方や社内の判断待ちで工程が進められないものを、ここに書いておくとダッシュボードと全プロジェクトの一覧に出ます。"
              action={canEdit ? <Button onClick={() => setAskAdding(true)}>未確認事項を足す</Button> : undefined}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-border bg-card">
              <OpenItemRowsHeader withProject={false} />
              {p.open_items.map((a) => (
                <OpenItemRow
                  key={a.id}
                  item={a}
                  today={today}
                  withProject={false}
                  canEdit={canEdit}
                  onToggleResolved={(item) => toggleAsk.mutate(item)}
                  onEdit={setAskEdit}
                  onDelete={onDeleteAsk}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && <MembersTab projectId={id} members={p.members} canEdit={canEdit} />}
      {tab === 'estimates' && <EstimatesTab projectId={id} canEdit={canEdit} />}
      {tab === 'files' && <FilesTab project={p} canEdit={canEdit} />}

      {editing && <EditProjectDialog project={p} onClose={() => setEditing(false)} />}
      {phaseEdit && <PhaseDialog projectId={id} phase={phaseEdit} onClose={() => setPhaseEdit(null)} />}
      {(askAdding || askEdit) && (
        <OpenItemDialog
          projectId={id}
          item={askEdit}
          phases={p.phases}
          onClose={() => { setAskAdding(false); setAskEdit(null); }}
        />
      )}
    </div>
  );
}

/**
 * `PUT /gpm/projects/:id` に送る全項目。
 * **一部だけ送ると残りが `null` で上書きされます**（依頼元・PM・日付・メモ）。
 * 状態を変えるだけのときも、いま入っている値をそのまま添えます。
 */
function fullBody(
  p: { name: string; kind: string; status: string; client_name: string | null; customer_id: string | null;
       pm_company: string | null; pm_user_id: string | null; started_on: string | null;
       ends_on: string | null; project_id: string | null; notes: string | null },
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: p.name,
    kind: p.kind,
    status: p.status,
    client_name: p.client_name,
    customer_id: p.customer_id,
    pm_company: p.pm_company,
    pm_user_id: p.pm_user_id,
    started_on: p.started_on ? String(p.started_on).slice(0, 10) : null,
    ends_on: p.ends_on ? String(p.ends_on).slice(0, 10) : null,
    project_id: p.project_id,
    notes: p.notes,
    ...patch,
  };
}
