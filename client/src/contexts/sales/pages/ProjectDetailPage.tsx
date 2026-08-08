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
 * ── まだ中身が無いタブ ──────────────────────────────────────
 *
 * 残り7つのタブは枠だけです。**空白にせず「これから作ります」と出します**
 * — タブがあるのに押しても何も起きないのがいちばん困るので。
 * ⑥-B で タスク / 書類 / 当日、⑥-C で やり取り / 回 / 見積・請求 を足しました。
 * 残るのは「ふりかえり」だけ (モック自身が「これから作ります」と書いている分)。
 * 「ふりかえり」は**モック自身が「これから作ります」**と書いている分です。
 */
import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Delayed, SkeletonRows, ErrorPanel, NotFoundPanel } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ProjectStageLabels, type ProjectStage } from '@/types';
import { DetailHeader } from './projectDetail/DetailHeader';
import { LostDialog, type LostPayload } from './projectDetail/LostDialog';
import { OverviewTab } from './projectDetail/OverviewTab';
import { TasksTab } from './projectDetail/TasksTab';
import { FilesTab } from './projectDetail/FilesTab';
import { DayTab } from './projectDetail/DayTab';
import { ReviewTab } from './projectDetail/ReviewTab';
import { ThreadTab } from './projectDetail/ThreadTab';
import { LegacyViewTab } from './projectDetail/LegacyViewTab';
import { EstimateTab } from './projectDetail/EstimateTab';
import { MobileTools } from './projectDetail/MobileTools';
import { PROJECT_TABS, MOBILE_TAB_KEYS, isProjectTab, type ProjectTabKey } from './projectDetail/tabs';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import type { ProjectDetail, StudioBooking, ActivityLog } from './projectDetail/types';

export default function ProjectDetailPage() {
  const { id = '', tab: rawTab } = useParams<{ id: string; tab: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const tab: ProjectTabKey = isProjectTab(rawTab) ? rawTab : 'overview';
  // **スマホで開けないタブを黙って概要にすり替えない。** URL を共有された人が
  // 「見積を見せたのに概要が出た」ことになる。**PC で見る画面だと書いて止める**
  const offPhone = isMobile && !MOBILE_TAB_KEYS.includes(tab);
  /**
   * 失注だけは「はい / いいえ」で済ませません。**理由を残さないと失注分析が
   * 「不明」だらけ**になるので、理由を選ばないと押せないダイアログを開きます。
   */
  const [lostOpen, setLostOpen] = useState(false);

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
    mutationFn: (v: { stage: ProjectStage } & Partial<LostPayload>) =>
      api.patch(`/projects/${id}/stage`, v),
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setLostOpen(false);
      const data = (res?.data?.data ?? {}) as { gls_number?: string | null; gls_error?: string };
      // **採れなかったときは黙らない。** 番号なしで受注になると、
      // 請求のときに気づいて手戻りになる
      if (data.gls_error) {
        notifyApiError(
          `ステージは「${ProjectStageLabels[v.stage]}」にしましたが、GLS番号を採れませんでした`,
          { message: data.gls_error },
        );
        return;
      }
      notifySuccess(
        v.stage === 'a_won' && data.gls_number
          ? `受注済にして GLS番号 ${data.gls_number} を採りました`
          : `ステージを「${ProjectStageLabels[v.stage]}」にしました`,
      );
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
  const wasTerminal = p.stage === 's_completed' || p.stage === 'e_lost';
  const onChangeStage = async (next: ProjectStage) => {
    // 失注は理由が要るので、確認ではなく専用のダイアログを開く
    if (next === 'e_lost') { setLostOpen(true); return; }

    /**
     * **受注にすると GLS 番号を採る**（モックの決めごと）。
     *
     * 番号は BOX のフォルダ名・Qシート・請求書に載り、**取り消しても戻せません**。
     * 押し間違いで番号が焼けるので、**採る番号をここで見せてから**確認します
     * （`GET /projects/:id/next-gls` は採らずに見るだけ）。
     */
    let glsLines: string[] = [];
    if (next === 'a_won' && !p.gls_number) {
      try {
        const peek = (await api.get(`/projects/${id}/next-gls`)).data.data as
          { next: string | null; category: string | null };
        glsLines = peek.next
          ? [
              `GLS番号 ${peek.next} を採ります（取り消しても番号は戻せません）。`,
              '先に別の人が発番すると1つ後ろの番号になります。',
            ]
          : ['案件分類（スタジオ / ビジネス）が未設定なので、GLS番号は採れません。先に案件を直してください。'];
      } catch {
        // 見えなくても受注そのものは止めない（採番はサーバー側で行う）
        glsLines = ['GLS番号を自動で採ります（何番になるかはいま確かめられませんでした）。'];
      }
    }

    const ok = await confirmAction({
      title: `ステージを「${ProjectStageLabels[next]}」にしますか？`,
      description: [
        `いま: ${ProjectStageLabels[p.stage]} → ${ProjectStageLabels[next]}`,
        // 終わった案件を戻すのは間違いを直すときなので、そうと分かるように言う
        wasTerminal ? '終わった案件を進行中に戻します。' : '',
        ...glsLines,
        'ヨミの一覧と、ステージごとの想定金額の集計が同時に変わります。',
      ].filter(Boolean).join('\n'),
      confirmLabel: 'ステージを変える',
    });
    if (ok) changeStage.mutate({ stage: next });
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
        mobile={isMobile}
      />

      {offPhone && <OffPhoneTab tab={tab} onBack={() => navigate(`/sales/projects/${id}`)} />}

      {!offPhone && tab === 'overview' && (
        <OverviewTab project={p} bookings={bookings.data ?? []} activities={activities.data?.data ?? []} />
      )}
      {!offPhone && tab === 'thread' && <ThreadTab projectId={id} />}
      {!offPhone && tab === 'episode' && <LegacyViewTab project={p} />}
      {!offPhone && tab === 'task' && <TasksTab project={p} />}
      {!offPhone && tab === 'estimate' && <EstimateTab project={p} />}
      {!offPhone && tab === 'files' && <FilesTab project={p} />}
      {!offPhone && tab === 'day' && <DayTab projectId={id} />}
      {!offPhone && tab === 'review' && <ReviewTab project={p} />}
      {!offPhone && tab === 'overview' && isMobile && <MobileTools project={p} />}

      {!offPhone && PROJECT_TABS.find((t) => t.key === tab)?.todo && (
        <TabTodo tab={tab} onBack={() => navigate(`/sales/projects/${id}`)} />
      )}

      <LostDialog
        open={lostOpen}
        onOpenChange={setLostOpen}
        busy={changeStage.isPending}
        onConfirm={(payload) => changeStage.mutate({ stage: 'e_lost', ...payload })}
      />
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

/**
 * スマホで開けないタブ。
 *
 * **概要にすり替えない。** URL を共有された人が「見積を見せたつもりが
 * 概要が出た」ことになります（⑧ のガントと同じ扱い＝黙って別のものを出さない）。
 */
function OffPhoneTab({ tab, onBack }: { tab: ProjectTabKey; onBack: () => void }) {
  const def = PROJECT_TABS.find((t) => t.key === tab)!;
  const why: Partial<Record<ProjectTabKey, string>> = {
    thread: 'やり取りは長い文章と議事録が並ぶので、読むのは PC が向いています。',
    estimate: '見積は明細・単価・仕入・粗利が横に伸びる表です。375px では桁が読めません。',
    files: '書類は BOX のフォルダを1階層ずつ開く画面です。',
    episode: '回ごとの一覧は横に長い表です。',
    review: 'ふりかえりはこれから作ります。',
  };
  return (
    <div className="p-3">
      <div className="rounded-card border border-border bg-card p-4">
        <h2 className="text-cardtitle">「{def.label}」は PC で見る画面です</h2>
        <p className="text-sub mt-1.5 text-secondary-foreground">
          {why[tab] ?? 'この幅では読み切れないので、スマホには出していません。'}
          <strong className="font-bold">消したのではなく、PC にあります。</strong>
        </p>
        <Button variant="outline" className="mt-3" onClick={onBack}>概要にもどる</Button>
      </div>
    </div>
  );
}
