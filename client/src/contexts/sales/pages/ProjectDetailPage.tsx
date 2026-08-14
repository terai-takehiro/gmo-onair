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
 * (`/sales/projects/:id/edit`)。直す画面は**案件作成と同じ項目・同じ部品**
 * (`projectNew/RequiredFields` / `MoreFields`) を使います。
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
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Hammer } from 'lucide-react';
import api from '@/lib/api';
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
import { EstimateTab } from './projectDetail/EstimateTab';
import { MobileTools } from './projectDetail/MobileTools';
import {
  PROJECT_TABS, MOBILE_TABS_BY_PHASE, projectPhase, isProjectTab, type ProjectTabKey,
} from './projectDetail/tabs';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { localDateStr } from '@/lib/format';
import { PcOnlyPanel } from '@gmo-onair/shared/src/client-v4/pcOnly';
import type { ProjectDetail, StudioBooking, ActivityLog } from './projectDetail/types';

export default function ProjectDetailPage() {
  const { id = '', tab: rawTab } = useParams<{ id: string; tab: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const tab: ProjectTabKey = isProjectTab(rawTab) ? rawTab : 'overview';
  // **スマホで開けないタブを黙って概要にすり替えない。** URL を共有された人が
  // 「見積を見せたのに概要が出た」ことになる。**PC で見る画面だと書いて止める**
  // **「それでもこのまま開く」で1タブだけ解除できる**（`PcOnlyPanel` と同じ考え方）。
  // タブを覚えておくのが要点で、真偽値にすると別のタブへ移っても解除が残る
  const [forcedTab, setForcedTab] = useState<ProjectTabKey | null>(null);
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
   * **GLS-B はプロジェクト管理の持ち物** (migration 179)。
   *
   * 分類を移した直後や、共有された古い URL でここに来ることがあります。
   * 「見つかりません」にすると**移ったのか消えたのか分からない**ので、
   * そのままプロジェクト管理の同じ id へ送ります（id は変わりません）。
   * `replace` にするのは、戻るを押したときにここへ戻って再び転送されるのを防ぐため。
   */
  if (p.gls_category === 'B') {
    return <Navigate to={`/gpm/projects/${p.id}`} replace />;
  }

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

  /*
   * スマホのタブは**段階で入れ替わります**（`tabs.ts`）。
   *
   * ⚠️ **段階が変わってタブが消えたときに、URL がその値のままだと中身が空になります。**
   * 「本番の日だけ出る当日タブ」を開いたまま日付が変わる、共有された URL を
   * 翌日に開く、のどちらでも起きます。**組に無いタブを指していたら概要に落とします。**
   *
   * PC は7タブのまま段階で変えません（幅があるので絞る理由がない）。
   */
  const phase = projectPhase(p, localDateStr(new Date()));
  const mobileKeys = MOBILE_TABS_BY_PHASE[phase];
  /*
   * **2種類の「開けない」を混ぜません。**
   *
   *   ① どの段階でもスマホに出さないタブ（見積・書類・回）
   *      → 今までどおり**すり替えず**「PC で見る画面です」と出す。
   *        URL を共有された人が「見積を見せたのに概要が出た」ことにならないように
   *   ② 別の段階なら出るタブ（当日・やり取り・ふりかえり・タスク）
   *      → **概要に落とす**（指示書 第4章）。こちらは幅の問題ではなく
   *        「今日は使わない」だけなので、「PC で見てください」は嘘になります
   */
  const everMobile = Object.values(MOBILE_TABS_BY_PHASE).some((keys) => keys.includes(tab));
  const wrongPhase = isMobile && !mobileKeys.includes(tab) && everMobile;
  const offPhone = isMobile && !mobileKeys.includes(tab) && !everMobile && forcedTab !== tab;

  // 段階の組に無いタブは概要へ。`replace` にするのは、戻るを押したときに
  // ここへ戻ってまた飛ばされるのを防ぐため
  if (wrongPhase) return <Navigate to={`/sales/projects/${id}`} replace />;

  return (
    <div className="flex min-h-full flex-col">
      <DetailHeader
        id={id}
        name={p.name}
        customerName={p.customer_name}
        glsNumber={p.gls_number}
        code={p.code}
        stage={p.stage}
        tab={tab}
        counts={counts}
        onChangeStage={onChangeStage}
        mobile={isMobile}
        phase={phase}
        updatedAt={p.updated_at}
      />

      {offPhone && (
        <OffPhoneTab
          tab={tab}
          onBack={() => navigate(`/sales/projects/${id}`)}
          onOpenAnyway={() => setForcedTab(tab)}
        />
      )}

      {!offPhone && tab === 'overview' && (
        <OverviewTab project={p} bookings={bookings.data ?? []} activities={activities.data?.data ?? []} />
      )}
      {!offPhone && tab === 'thread' && <ThreadTab projectId={id} />}
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
function OffPhoneTab({ tab, onBack, onOpenAnyway }: { tab: ProjectTabKey; onBack: () => void; onOpenAnyway: () => void }) {
  const def = PROJECT_TABS.find((t) => t.key === tab)!;
  // **見た目と言い回しは共通部品に寄せてある**（`client-v4/pcOnly`）。
  // 以前はこの画面だけ独自の枠で、ほかの9か所と文面も体裁も違っていた
  const why: Partial<Record<ProjectTabKey, string>> = {
    thread: 'やり取りは長い文章と議事録が並ぶので、読むのは PC が向いています。',
    estimate: '見積は明細・単価・仕入・粗利が横に伸びる表です。この幅では桁が読めません。',
    files: '書類は BOX のフォルダを1階層ずつ開く画面です。',
    review: 'ふりかえりは金額の内訳を縦にそろえて読む画面です。',
  };
  return (
    <PcOnlyPanel
      what={def.label}
      why={why[tab] ?? 'この幅では読み切れないので、スマホには出していません。'}
      instead={{ label: '概要にもどる', to: 'back' }}
      onGoInstead={onBack}
      onOpenAnyway={onOpenAnyway}
    />
  );
}
