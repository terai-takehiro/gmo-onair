/**
 * ⑥ 案件詳細 (v4) — 枠と概要タブ
 *
 * ── なぜ「読む画面」と「直す画面」を分けたか ──────────────────
 *
 * いままでの `/sales/projects/:id` は **2,178 行の入力フォーム1枚**でした。
 * 開くと入力欄が縦にずらりと並ぶので、「この案件はいまどうなっているか」を
 * 読み取るのに全部スクロールする必要があります。
 *
 * v4 は**読む画面**にして、直すのは見出しの鉛筆から入ります
 * (`/sales/projects/:id/edit` = いままでのフォームそのまま)。
 * **フォームは1行も変えていません** — 枠を入れ替えるのと中身を作り直すのを
 * 同じ回でやると、どちらが原因で壊れたのか切り分けられなくなるためです
 * (前回の刷新が捨てられたのがまさにこれでした)。
 *
 * ── いま中身があるのは「概要」だけ ────────────────────────────
 *
 * 残り7つのタブは枠だけです。**空白にせず「これから作ります」と出します**
 * — タブがあるのに押しても何も起きないのがいちばん困るので。
 * やり取り / 回 / タスク / 見積・請求 / 書類 / 当日 は ⑥-B・⑥-C で作ります。
 * 「ふりかえり」は**モック自身が「これから作ります」**と書いている分です。
 */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import api from '@/lib/api';
import { Delayed, SkeletonRows, ErrorPanel, NotFoundPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { DetailHeader } from './projectDetail/DetailHeader';
import { OverviewTab } from './projectDetail/OverviewTab';
import { PROJECT_TABS, isProjectTab, type ProjectTabKey } from './projectDetail/tabs';
import type { ProjectDetail, StudioBooking, ActivityLog } from './projectDetail/types';

export default function ProjectDetailPage() {
  const { id = '', tab: rawTab } = useParams<{ id: string; tab: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tab: ProjectTabKey = isProjectTab(rawTab) ? rawTab : 'overview';

  const project = useQuery<ProjectDetail>({
    queryKey: ['project', id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: !!id,
  });

  const bookings = useQuery<StudioBooking[]>({
    queryKey: ['project-studio-bookings', id],
    queryFn: async () => (await api.get('/studios/bookings', { params: { project_id: id } })).data.data,
    enabled: !!id,
  });

  const activities = useQuery<{ data: ActivityLog[] }>({
    queryKey: ['project-activities', id],
    queryFn: async () => (await api.get('/activity-logs', { params: { project_id: id, limit: 20 } })).data,
    enabled: !!id,
  });

  const changeStage = useMutation({
    mutationFn: (stage: ProjectStage) => api.patch(`/projects/${id}/stage`, { stage }),
    onSuccess: (_r, stage) => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      notifySuccess(`ステージを「${ProjectStageLabels[stage]}」にしました`);
    },
    onError: (err) => notifyApiError('ステージを変えられませんでした', err),
  });

  if (project.isLoading) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;
  }
  if (project.isError) {
    // 404 は「消された・URL が違う」なので、読み込み失敗とは別の言い方にする
    const status = (project.error as { response?: { status?: number } })?.response?.status;
    return status === 404
      ? <NotFoundPanel />
      : <div className="p-4 lg:p-6"><ErrorPanel title="案件を読み込めませんでした" onRetry={() => project.refetch()} /></div>;
  }
  const p = project.data!;

  /**
   * ステージを押したときの確認。**何が動くかを出す**のが要点で、
   * 「変更しますか？」だけだと、見込み金額の集計とヨミの一覧が
   * 一緒に動くことが伝わりません。
   */
  const onChangeStage = async (next: ProjectStage) => {
    const ok = await confirmAction({
      title: `ステージを「${ProjectStageLabels[next]}」にしますか？`,
      description: [
        `いま: ${ProjectStageLabels[p.stage]} → ${ProjectStageLabels[next]}`,
        'ヨミの一覧と、ステージごとの想定金額の集計が同時に変わります。',
      ].join('\n'),
      confirmLabel: 'ステージを変える',
    });
    if (ok) changeStage.mutate(next);
  };

  const counts: Partial<Record<ProjectTabKey, number>> = {
    thread: activities.data?.data?.length,
  };

  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader
        id={id}
        name={p.name}
        customerName={p.customer_name}
        glsNumber={p.gls_number}
        code={p.code}
        stage={p.stage}
        isSeries={p.gls_category === 'A'}
        tab={tab}
        counts={counts}
        onChangeStage={onChangeStage}
      />

      {tab === 'overview' ? (
        <OverviewTab
          project={p}
          bookings={bookings.data ?? []}
          activities={activities.data?.data ?? []}
        />
      ) : (
        <TabTodo tab={tab} onBack={() => navigate(`/sales/projects/${id}`)} />
      )}
    </div>
  );
}

/**
 * まだ作っていないタブ。
 *
 * **空白にしない。** タブがあるのに押しても何も出ないと「壊れている」のか
 * 「読み込み中」なのか分かりません。何が入る予定かまで書きます。
 */
function TabTodo({ tab, onBack }: { tab: ProjectTabKey; onBack: () => void }) {
  const def = PROJECT_TABS.find((t) => t.key === tab)!;
  const what: Record<string, string> = {
    thread: 'メール・打合せ・電話のやり取りを時系列で1本にまとめます。打合せの録音から議事録を起こす機能もここに入ります。',
    episode: '連続ものの回ごとの日程と進み具合を並べます。いまは回の一覧の画面で見られます。',
    task: 'この案件のタスクをかんばん・リスト・ガントで見ます。いまは「タスク」画面で見られます。',
    estimate: '見積と請求をここにまとめます。いまは「見積」画面と財務管理で見られます。',
    files: 'BOX の書類を社内限り／社外共有に分けて置きます。',
    day: '本番当日に使う資料 (Qシート・技術資料) への入口を並べます。',
    review: '終わったあとのふりかえり。数字と気づきを残します。',
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <Hammer className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-h2">「{def.label}」はこれから作ります</h2>
      <p className="text-note max-w-lg text-muted-foreground">{what[tab]}</p>
      <p className="text-sub-sm text-muted-foreground">
        まわりの見出し（一覧に戻る・案件名・ステージ・タブ）は、どのタブでも同じ位置に出しつづけます。
      </p>
      <button type="button" onClick={onBack} className="min-h-tap text-sub text-primary hover:underline lg:min-h-[36px]">
        概要に戻る
      </button>
    </div>
  );
}
