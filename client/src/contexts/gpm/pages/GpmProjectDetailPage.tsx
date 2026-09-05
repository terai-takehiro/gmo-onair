/**
 * ③ プロジェクト詳細 (v4 GPM) — 概要（工程）／未確認事項／体制
 *
 * ── タブを増やしてきた順番 ──────────────────────────────────
 *
 * モックの詳細は 工程・体制・お金・書類・議事録・活動履歴 を1画面に積みます。
 * 着手時にサーバーが持っていたのは工程・未確認事項・体制の3つだけで、
 * **枠だけのタブを並べない**ために3タブから始めました。いまは見積
 * （migration 173）・請求（同 179）・書類（BOX）が入って6タブです。
 * 議事録も**案件と同じ表・同じサービス**（`project_minutes`）に載るので足しました
 * （持ち帰りの行き先だけが違う＝プロジェクトでは未確認事項になる）。7タブです。
 *
 * ── 工程配下のタスクは工程の中に出す ────────────────────────
 *
 * タスクは既存 `project_tasks` の行で、migration 179 から **`project_id` が
 * 入っている**（GLS-B の案件にぶら下がる）ので `GET /gpm/tasks?project_id=` で
 * 引けます。工程の名前を押すとその工程のタスクが下に出て、足す・直す・消す・
 * 完了にするができます。**件数だけだった頃は「何が残っているか」がこの画面から
 * 分からず**、⑤ 全プロジェクトのタスクで絞り込み直すことになっていました。
 *
 * **工程に付いていないタスクも出します**（いちばん下の束）。同じプロジェクトの
 * ものなので、工程の有無で見える・見えないが変わるほうが分かりにくい。
 */
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Delayed, SkeletonRows, ErrorPanel, NotFoundPanel, EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PcOnlyPanel } from '@gmo-onair/shared/src/client-v4/pcOnly';
import { useGpmProject, useInvalidateGpm } from '../queries';
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { type GpmOpenItem } from '../types';
import {
  DetailHeader, isDetailTab, gpmDetailPhase, MOBILE_TABS_BY_PHASE, effectiveMobileTabs, type DetailTabKey,
} from './projectDetail/DetailHeader';
import { EstimatesTab } from './projectDetail/EstimatesTab';
import { BillingTab } from './projectDetail/BillingTab';
import { OverviewTab } from './projectDetail/OverviewTab';
import { OpenItemRow, OpenItemRowsHeader } from './projectDetail/OpenItemRows';
import { OpenItemDialog } from './projectDetail/OpenItemDialog';
import { EditProjectDialog } from './projectDetail/EditProjectDialog';
import { MembersTab } from './projectDetail/MembersTab';
import { MinutesTab } from './projectDetail/MinutesTab';
import { FilesTab } from './projectDetail/FilesTab';

export default function GpmProjectDetailPage() {
  const { id = '', tab: rawTab } = useParams<{ id: string; tab: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidateGpm();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const canManage = hasPermission('sales', 'manager');
  const tab: DetailTabKey = isDetailTab(rawTab) ? rawTab : 'overview';
  const isMobile = useIsMobile();
  // **スマホで開けないタブを黙って概要にすり替えない。** URL を共有された人が
  // 「請求を見せたのに概要が出た」ことになる。**PC で見る画面だと書いて止める**
  // （案件詳細⑥と同じ考え方）。**「それでもこのまま開く」で1タブだけ解除できる。**
  // タブを覚えておくのが要点で、真偽値にすると別のタブへ移っても解除が残る
  const [forcedTab, setForcedTab] = useState<DetailTabKey | null>(null);

  const today = useMemo(() => localDateStr(new Date()), []);
  const [editing, setEditing] = useState(false);
  const [askEdit, setAskEdit] = useState<GpmOpenItem | null>(null);
  const [askAdding, setAskAdding] = useState(false);
  const query = useGpmProject(id);

  const changeStage = useMutation({
    mutationFn: (stage: ProjectStage) => api.put(`/gpm/projects/${id}`, fullBody(query.data!, { stage })),
    onSuccess: (_r, stage) => {
      invalidate(id);
      notifySuccess(`ステージを「${STAGE_BADGE_LABEL[stage]}」にしました`);
    },
    onError: (err) => notifyApiError('ステージを変更できませんでした', err),
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
      notifySuccess(item.status === 'resolved' ? '未解決に戻しました' : '解決にしました');
    },
    onError: (err) => notifyApiError('持ち帰りを変更できませんでした', err),
  });

  const removeAsk = useMutation({
    mutationFn: (item: GpmOpenItem) => api.delete(`/gpm/open-items/${item.id}`),
    onSuccess: () => { invalidate(id); notifySuccess('持ち帰りを削除しました'); },
    onError: (err) => notifyApiError('持ち帰りを削除できませんでした', err),
  });

  const removeProject = useMutation({
    mutationFn: () => api.delete(`/gpm/projects/${id}`),
    onSuccess: () => { invalidate(id); notifySuccess('プロジェクトを削除しました'); navigate('/gpm/projects'); },
    onError: (err) => notifyApiError('プロジェクトを削除できませんでした', err),
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

  /*
   * スマホのタブは**段階で入れ替わります**（`projectDetail/DetailHeader.tsx` の
   * `MOBILE_TABS_BY_PHASE`）。
   *
   * ⚠️ **段階が変わってタブが消えたときに、URL がその値のままだと中身が空になります。**
   * ステージを変えたまま以前のタブを指すURLをブックマークしている、共有されたURLを
   * あとで開く、のどちらでも起きます。**組に無いタブを指していたら概要に落とします。**
   *
   * PC は7タブのまま段階で変えません（幅があるので絞る理由がない）。
   */
  const phase = gpmDetailPhase(p.stage);
  // **タブバー（`DetailHeader`）と同じ関数を通す。** 完了/失注（done）のまま
  // 未解決の未確認事項が残っているプロジェクトは、段階が変わっても
  // 「未確認事項」タブを外さない（`effectiveMobileTabs` のコメント参照）。
  // ダッシュボード・⑤ 全プロジェクトの未確認事項一覧は段階を見ずに
  // `/asks` へ直接リンクしてくるので、ここで外れたままだと概要へ
  // 強制的に飛ばされ、その項目を見る・解決する手段がスマホに無くなる。
  const mobileKeys = effectiveMobileTabs(phase, openAsks.length);
  /*
   * **2種類の「開けない」を混ぜません**（案件詳細⑥と同じ考え方）。
   *
   *   ① どの段階でもスマホに出さないタブ（請求）
   *      → 今までどおり**すり替えず**「PC で見る画面です」と出す
   *   ② 別の段階なら出るタブ（未確認事項・体制・議事録・見積・書類）
   *      → **概要に落とす**（幅の問題ではなく「今日は使わない」だけなので、
   *        「PC で見てください」は嘘になる）
   */
  const everMobile = Object.values(MOBILE_TABS_BY_PHASE).some((keys) => keys.includes(tab));
  const wrongPhase = isMobile && !mobileKeys.includes(tab) && everMobile;
  const offPhone = isMobile && !mobileKeys.includes(tab) && !everMobile && forcedTab !== tab;

  if (wrongPhase) return <Navigate to={`/gpm/projects/${id}`} replace />;

  const onChangeStage = async (next: ProjectStage) => {
    const ok = await confirmAction({
      title: `ステージを「${STAGE_BADGE_LABEL[next]}」にしますか？`,
      description: [
        `いま: ${STAGE_BADGE_LABEL[p.stage]} → ${STAGE_BADGE_LABEL[next]}`,
        'ダッシュボードの件数と一覧の絞り込みが同時に変わります。',
        // **案件と同じステージ**なので、財務・決算の見え方にも効くことを書く
        'これは案件と同じステージです（財務・決算からも同じ段として見えます）。',
      ].join('\n'),
      confirmLabel: 'ステージを変える',
    });
    if (ok) changeStage.mutate(next);
  };

  const onDeleteAsk = async (item: GpmOpenItem) => {
    const ok = await confirmAction({
      title: 'この持ち帰りを削除しますか？',
      description: `「${item.question}」\n解決したのなら消さずに「解決」にしてください。消すと訊いた記録が残りません。`,
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) removeAsk.mutate(item);
  };

  const onDeleteProject = async () => {
    const ok = await confirmAction({
      title: 'このプロジェクトを削除しますか？',
      description: `「${p.name}」\n工程 ${p.phases.length}件・持ち帰り ${p.open_items.length}件・体制 ${p.members.length}名も一緒に見えなくなります。`,
      confirmLabel: '削除',
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
        onChangeStage={onChangeStage}
        onEdit={() => setEditing(true)}
        mobile={isMobile}
        phase={phase}
      />

      {/* 月次請求（月締め）。**案件詳細から移したもの** (migration 179)。
          **どの段階でもスマホには出さない**（`BillingTab` 冒頭のコメント参照） */}
      {tab === 'billing' && (
        offPhone ? (
          <PcOnlyPanel
            what="請求（月次）"
            why="案件と同じ月締めの表（BusinessProjectView）を1行も変えずに呼んでいます。金額・入金月・請求済かどうかを横に並べて突き合わせる作りで、この幅ではまだ読み違えを防げません。"
            instead={{ label: '概要にもどる', to: 'back' }}
            onGoInstead={() => navigate(`/gpm/projects/${id}`)}
            onOpenAnyway={() => setForcedTab('billing')}
          />
        ) : <BillingTab projectId={p.id} />
      )}

      {tab === 'overview' && (
        <OverviewTab
          project={p}
          today={today}
          canEdit={canEdit}
          canManage={canManage}
          onDeleteProject={onDeleteProject}
        />
      )}

      {tab === 'asks' && (
        <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sub min-w-0 flex-1 text-muted-foreground">
              返事が来ていない・判断が出ていないもの。解決したものも残ります（訊いた記録なので消しません）。
            </p>
            {canEdit && (
              <Button onClick={() => setAskAdding(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />持ち帰りを追加
              </Button>
            )}
          </div>

          {p.open_items.length === 0 ? (
            <EmptyState
              title="持ち帰りはありません"
              description="先方や社内の判断待ちで工程が進められないものを、ここに書いておくとダッシュボードと全プロジェクトの一覧に出ます。"
              action={canEdit ? <Button onClick={() => setAskAdding(true)}>持ち帰りを追加</Button> : undefined}
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
      {tab === 'minutes' && <MinutesTab projectId={id} canEdit={canEdit} canManage={canManage} />}
      {tab === 'estimates' && <EstimatesTab projectId={id} canEdit={canEdit} />}
      {tab === 'files' && <FilesTab project={p} canEdit={canEdit} />}

      {editing && <EditProjectDialog key={p.id} project={p} onClose={() => setEditing(false)} />}
      {(askAdding || askEdit) && (
        <OpenItemDialog
          // 案件が変わったのに開きっぱなしで前の入力値が残らないよう、
          // 対象（新規/直す対象）が変わったら強制的に作り直す
          key={askEdit?.id ?? 'new'}
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
 * **一部だけ送ると残りが `null` で上書きされます**（PM会社・日付・メモ）。
 * ステージを変えるだけのときも、いま入っている値をそのまま添えます。
 */
function fullBody(
  p: { name: string; gpm_kind: string | null; stage: string; customer_id: string | null;
       pm_company: string | null; assigned_to: string | null; started_on: string | null;
       ends_on: string | null; notes: string | null },
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name: p.name,
    gpm_kind: p.gpm_kind,
    stage: p.stage,
    customer_id: p.customer_id,
    pm_company: p.pm_company,
    assigned_to: p.assigned_to,
    started_on: p.started_on ? String(p.started_on).slice(0, 10) : null,
    ends_on: p.ends_on ? String(p.ends_on).slice(0, 10) : null,
    notes: p.notes,
    ...patch,
  };
}
