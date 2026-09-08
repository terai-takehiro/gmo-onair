/**
 * 案件詳細 / 見積・請求タブ (v4 ⑥)
 *
 * ── 見積は「版が残る」形にしました ──────────────────────────
 *
 * v1 を送ったあとに v2 を作っても、**v1 の中身はそのまま残ります**
 * (`estimates` テーブル。前の版は `superseded` にして中身は触らない)。
 * 送った見積を後から書き換えられると「何を出したか」が追えなくなるためです。
 * **まだ送っていない下書きから次の版を作ったときは、前の版は `draft` の
 * まま残ります**（＝そのまま直せる）— 並行して複数の版を作る・
 * 意図的に案件を複数の見積に分ける（本編とケータリングなど）ときに、
 * お客様にまだ出していない下書きまで直せなくなるのは事実に反するため。
 *
 * ── なぜ `revenues` と別の表なのか ──────────────────────────
 *
 * `revenues` を読む **41 か所が `status` を見ていません** (トップの当月売上を含む)。
 * 見積を相乗りさせると**そのまま売上に足されます**。詳細は migration 138。
 *
 * ── 「売上・請求」はモックの3カード設計に置き換えた ──────────────
 *
 * 右の切り替えで開くのは `RevenueBillingPane`（売上／請求／仕入（原価）の
 * 3枚のカード）。旧 `BusinessProjectView`（フル機能コンソール）からの
 * 置き換えの理由は `RevenueBillingPane.tsx` の頭のコメントを参照。
 *
 * ── 版の一覧はスマホでカードにした（v4ネイティブUI監査） ───────────
 *
 * **タブ全体は今までどおり PC専用**（`ProjectDetailPage.tsx` の `OffPhoneTab`）。
 * 明細（`EstimateItems`）が数量・単価・仕入・日付・金額の6列の入力欄の並びで、
 * 375px に収める作り直しより PC で入力するほうが理にかなっているためです。
 * ただし「それでもこのまま開く」を選んだ人のために、**版の一覧だけ**は
 * `Row`（PC表を縮めただけ）からカード積みに作り直してあります。
 *
 * ── 400行の上限に当たるたびに描画を切り出してきた ────────────────
 *
 * `EstimateVersionList`（版の一覧・PC表とスマホカード）／`EstimateMetaCard`
 * （タイトルと備考）／`useEstimateEpisodeFilter`（回の絞り込みの state・URL 同期・
 * 回一覧の取得）。**ここに残るのはデータ取得とミューテーションの定義、
 * それらを組み立てる JSX だけ。** `Estimate` 型・`STATUS_LABEL`/`STATUS_TONE` は
 * このファイルが正で `export` している——2か所に持つと版の状態の色分けがずれる。
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Wallet, Archive, Files, Layers } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Button } from '@/components/ui/button';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import EpisodeScopeToggle from '@/contexts/tasks/components/EpisodeScopeToggle';
import { RevenueBillingPane } from './RevenueBillingPane';
import { InvoiceGroupsSection } from './InvoiceGroupsSection';
import { IntercompanySection } from './IntercompanySection';
import { EstimateItems, type EstimateItemRow as Item } from './EstimateItems';
import { type EstimateStatus as Status } from './EstimateActions';
import { EstimateVersionList } from './EstimateVersionList';
import { EstimateMetaCard } from './EstimateMetaCard';
import { DuplicateEstimateDialog } from './DuplicateEstimateDialog';
import { MultiEpisodeEstimateDialog } from './MultiEpisodeEstimateDialog';
import { useEstimateEpisodeFilter } from './useEstimateEpisodeFilter';
import { useEstimateMutations } from './useEstimateMutations';
import type { ProjectDetail } from './types';
import { ApprovalNotice, needsApproval } from '@/contexts/shared/components/ApprovalRow';

export interface Estimate {
  id: string; group_id: string; version: number; title: string; status: Status;
  subtotal: number; discount: number; sent_at: string | null;
  /**
   * この見積が紐づく回（episodes.id）の一覧。空配列は「案件全体の見積」（従来どおり・
   * 単発案件は常に空）。レギュラー案件で回ごとに見積を分けたいときは1件、
   * **1日で複数本撮った日を「ひとまとまり」で見積るときは複数件**入る
   * （仕様変更 #18・#20）
   */
  episode_ids: string[];
  /** 見積全体の備考。行の備考（`item_notes`）とは別（migration 138 の既存列） */
  notes?: string | null;
  /** 値引きの承認。`pending` の間は送れない（お金のルール ⑤） */
  approval_state?: 'none' | 'pending' | 'approved' | null;
  /** いま見ている人が承認できるか。**サーバーが決める**（押して 403 にしない） */
  can_approve?: boolean;
  /** 承認者に決められているか（編集権限は見ない）。できない理由を名指しするために使う */
  is_approver?: boolean;
  /** 受注して売上に変換したときの行。追跡用（migration 138）。無ければ未変換 */
  revenue_id: string | null;
  /** アーカイブした日時。`null` なら一覧に出る（migration 236） */
  archived_at?: string | null;
  items?: Item[];
}

export const STATUS_LABEL: Record<Status, string> = {
  draft: '作成中', sent: '提出済', accepted: '受注', rejected: '失注', superseded: '旧版',
};
export const STATUS_TONE: Record<Status, string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  sent: 'border-transparent bg-primary-surface text-primary',
  accepted: 'border-transparent bg-success-surface text-success',
  rejected: 'border-transparent bg-destructive-surface text-destructive',
  superseded: 'border-transparent bg-muted text-muted-foreground',
};

export function EstimateTab({ project }: { project: ProjectDetail }) {
  const [pane, setPane] = useState<'estimate' | 'revenue'>('estimate');
  const [openId, setOpenId] = useState<string | null>(null);
  // **既定はアーカイブした版を隠す**（サーバーの既定と揃える）。「アーカイブした版を
  // 表示」を押すと `include_archived=1` を付けて引き直す（版が増えるほど古い版で埋もれるのを防ぐ）
  const [showArchived, setShowArchived] = useState(false);
  const isMobile = useIsMobile();
  const { hasPermission } = useAuth();
  // **サーバーは POST/PUT '/'・PUT '/:id/items' に editor を要求する**（`estimates.routes.ts`）。
  // 承認ボタンは `can_approve` で出し分けているが、作成・保存はここで見ないと reader に「押せるのに 403」が出る
  const canEdit = hasPermission('sales', 'editor');
  const base = `/projects/${project.id}/estimates`;

  // 回（episode）での絞り込み（仕様変更 #18・レギュラー案件だけ・詳細は
  // `useEstimateEpisodeFilter.ts` 参照）。判定はタスクタブと同じ `recurrence`
  const isSeries = project.recurrence === 'regular';
  const { episodeId, changeEpisodeFilter, episodeLabels } = useEstimateEpisodeFilter(project.id, isSeries);

  const list = useQuery<Estimate[]>({
    queryKey: ['estimates', project.id, showArchived],
    queryFn: async () => (await api.get(base, { params: showArchived ? { include_archived: '1' } : undefined })).data.data,
    enabled: pane === 'estimate',
    // **開くたびに必ず読み直す**（ProjectDetailPage.tsx の同注記）。見積は他画面からも
    // 変わるので、共通 staleTime: 60_000 のままだと通常遷移では古いままだった
    staleTime: 0,
    refetchOnMount: 'always',
  });
  // **回で絞り込むのは表示だけ**（サーバーには渡さない）。取得件数がページングを
  // 要するほど増えたら見直す — アーカイブの表示・非表示と同じ判断（一覧全体は
  // すでに1回で取得済みなので、絞り込みのたびに引き直す理由が無い）
  const visibleList = useMemo(
    () => (episodeId ? (list.data ?? []).filter((e) => e.episode_ids.includes(episodeId)) : (list.data ?? [])),
    [list.data, episodeId],
  );

  const detail = useQuery<Estimate>({
    queryKey: ['estimate', openId],
    queryFn: async () => (await api.get(`${base}/${openId}`)).data.data,
    enabled: !!openId,
  });

  /**
   * 「別の回の見積として複製する」。`null` = 閉じている。`{ source: null }` は
   * **複製元もダイアログの中で選ぶ**形（下の「別の回の見積をベースに作る」から開く）
   */
  const [duplicating, setDuplicating] = useState<{ source: Estimate | null } | null>(null);

  /** 「複数の回をまとめて見積をつくる」（仕様変更 #20）。レギュラー案件だけ出す入口 */
  const [multiEpisode, setMultiEpisode] = useState(false);

  // サーバーとやり取りする操作一式（作る・版を上げる・状態を変える・明細を保存する・
  // 消す・アーカイブする・売上へ変換する）は `useEstimateMutations.ts` に集約
  // （400行の上限の是正・`EstimateVersionList`/`useEstimateEpisodeFilter` と同じ切り出し）
  const {
    invalidate, create, nextVersion, setStatus, saveItems, saveMeta, remove, archive, unarchive,
    convertToRevenue, revertToEstimate,
  } = useEstimateMutations({ base, projectId: project.id, episodeId, openId, setOpenId });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 p-4 lg:p-6">
      <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="表示形式を切り替える">
        {([['estimate', '見積', Receipt], ['revenue', '売上・請求', Wallet]] as const).map(([k, label, Icon], i) => (
          <button
            key={k}
            type="button"
            onClick={() => setPane(k)}
            aria-pressed={pane === k}
            className={`min-h-tap text-sub inline-flex items-center gap-1.5 px-3.5 lg:min-h-[36px] ${i > 0 ? 'border-l border-border' : ''} ${
              pane === k ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {pane === 'estimate' && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-sub inline-flex w-fit shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            {showArchived ? '隠した版を表示しない' : '隠した版も表示する'}
          </button>
          {/*
            レギュラー案件だけ、回で絞り込む（仕様変更 #18）。「全体」は今までどおり
            すべての見積（案件全体の見積 ＋ どの回の見積も）を出す — 回を割り振らない
            案件全体の見積という使い方も引き続きできる
          */}
          {isSeries && (
            <div className="overflow-x-auto">
              <EpisodeScopeToggle projectId={project.id} selectedEpisodeId={episodeId} onChange={changeEpisodeFilter} />
            </div>
          )}
        </div>
      )}

      {pane === 'revenue' ? (
        <>
          <InvoiceGroupsSection project={project} mobile={isMobile} />
          <RevenueBillingPane projectId={project.id} projectName={project.name} mobile={isMobile} />
          {/* SCS の案件だけに出す社内取引（SCS⇄GSS）区画。詳細は `IntercompanySection.tsx` 冒頭コメント */}
          <IntercompanySection project={project} mobile={isMobile} />
        </>
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : visibleList.length === 0 ? (
        <EmptyState
          title={episodeId ? 'この回の見積はまだありません' : '見積はまだありません'}
          description={episodeId
            ? '「見積を作成」でこの回向けの見積を作成します（この絞り込みのまま作ると、この回に紐づきます）。'
            : '明細を積んで金額を出します。お客様に出したあとに直したくなったら、版を上げれば前に出したものは残ります。1案件で見積を分けたいとき（本編とケータリングなど）は「見積を作成」を必要な数だけ押してください。'}
          action={canEdit ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />見積を作成</Button>
              {/* 1日複数本の日をひとまとまりで見積る入口（仕様変更 #20）。回で絞り込んで空のときこそ「前の回の見積を写す」も要る */}
              {isSeries && (
                <Button variant="outline" onClick={() => setMultiEpisode(true)}>
                  <Layers className="mr-1 h-4 w-4" aria-hidden="true" />複数の回をまとめて見積を作成
                </Button>
              )}
              {isSeries && (list.data ?? []).length > 0 && (
                <Button variant="outline" onClick={() => setDuplicating({ source: null })}>
                  <Files className="mr-1 h-4 w-4" aria-hidden="true" />別の回の見積をベースに作る
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sub text-muted-foreground">見積の作成には案件管理の編集権限が必要です。</p>
          )}
        />
      ) : (
        <>
          {/*
            ⚠️ **375pxで見つけた表示崩れを直した**（v4ネイティブUI監査・この回）。
            `flex items-center gap-2` は既定で子を横並びに縮めるので、375pxでは
            長い説明文に押されてボタンの幅が中身より狭くなり「見積をつく」で
            切れていた（実ブラウザで実測）。ボタンは縮めない・説明文は下に回す
          */}
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            {canEdit && (
              <Button className="shrink-0" onClick={() => create.mutate()}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />見積を作成
              </Button>
            )}
            {/* 1日複数本の日をひとまとまりで見積る入口（仕様変更 #20・レギュラー案件だけ） */}
            {canEdit && isSeries && (
              <Button variant="outline" className="shrink-0" onClick={() => setMultiEpisode(true)}>
                <Layers className="mr-2 h-4 w-4" aria-hidden="true" />複数の回をまとめて見積を作成
              </Button>
            )}
            {/* **複製の入口はここにも置く**（仕様変更 #18）。版一覧の右端のアイコンだけ
                だと他のボタンに紛れて見つからず、「実装したのに使われない」状態だった */}
            {canEdit && isSeries && (
              <Button variant="outline" className="shrink-0" onClick={() => setDuplicating({ source: null })}>
                <Files className="mr-2 h-4 w-4" aria-hidden="true" />別の回の見積をベースに作る
              </Button>
            )}
            <p className="text-sub text-muted-foreground">
              {canEdit
                ? '「見積を作成」は押すたびに独立した見積が増えます（本編とケータリングなど、1案件を複数の見積に分けたいときに）。版を上げると前の版はそのまま残ります（出したあとに書き換えないため。まだ出していない下書きはそのまま編集できます）。'
                : '閲覧権限です。新しい版の作成・明細の保存には案件管理の編集権限が必要です。'}
            </p>
          </div>

          {/* **承認待ちは一覧の上に出す。** 行の中に畳むと、
              「送れない理由」が横に長い行の右端に埋もれて読まれない */}
          {visibleList.filter(needsApproval).map((e) => (
            <ApprovalNotice key={`approval-${e.id}`} estimate={e} base={base}
              onDone={() => list.refetch()} />
          ))}

          <EstimateVersionList
            estimates={visibleList}
            isMobile={isMobile}
            onToggleOpen={(id) => setOpenId(openId === id ? null : id)}
            base={base}
            statusLabel={STATUS_LABEL}
            statusTone={STATUS_TONE}
            episodeLabels={episodeLabels}
            onSetStatus={(id, status) => setStatus.mutate({ id, status })}
            onConvert={(id) => convertToRevenue.mutate(id)}
            onRevert={(id) => revertToEstimate.mutate(id)}
            onNextVersion={(id) => nextVersion.mutate(id)}
            onRemove={(id) => remove.mutate(id)}
            onArchive={(id) => archive.mutate(id)}
            onUnarchive={(id) => unarchive.mutate(id)}
            // **複製は案件がレギュラーのときだけ**（複製先の回そのものが無いと意味を成さない）
            canDuplicate={isSeries}
            onDuplicate={(id) => setDuplicating({ source: (list.data ?? []).find((e) => e.id === id) ?? null })}
          />

          {openId && detail.data && (
            <>
              <EstimateMetaCard
                key={detail.data.id}
                estimate={detail.data}
                onSave={(patch) => saveMeta.mutate({ id: openId, patch })}
              />
              {/* `key` 必須: 明細は `useState` の編集バッファなので、版を切り替えたら作り直す
                  （キャッシュ済みの版へ戻ると再マウントされず、前の版の明細のまま保存される）。
                  隣の `EstimateMetaCard` と同じ値だと兄弟の key が重複するので接頭辞を付ける */}
              <EstimateItems
                key={`items-${detail.data.id}`}
                estimate={{ ...detail.data, project_id: project.id, customer_type: project.customer_type }}
                onSave={(items) => saveItems.mutate({ id: openId, items })}
                saving={saveItems.isPending}
                canEdit={canEdit}
              />
            </>
          )}
        </>
      )}

      {duplicating && (
        <DuplicateEstimateDialog
          open
          onOpenChange={(o) => { if (!o) setDuplicating(null); }}
          projectId={project.id}
          base={base}
          estimate={duplicating.source}
          sources={list.data ?? []}
          onDuplicated={(created) => {
            invalidate();
            setDuplicating(null);
            // 複製した先が1回だけならその回で絞り込んで、そのまま新しい見積を開く
            // （どこに作られたか分からないまま一覧に戻すと探し直しになる）。
            // 複数回のひとまとまりに複製したときは絞り込みを変えない（「全体」表示のまま
            // にして、複製した見積が一覧に見えるようにする）
            if (created.episode_ids.length === 1) changeEpisodeFilter(created.episode_ids[0]);
            setOpenId(created.id);
          }}
        />
      )}

      {multiEpisode && (
        <MultiEpisodeEstimateDialog
          open
          onOpenChange={(o) => { if (!o) setMultiEpisode(false); }}
          projectId={project.id}
          base={base}
          onCreated={(created) => {
            invalidate();
            setMultiEpisode(false);
            setOpenId(created.id);
          }}
        />
      )}
    </div>
  );
}
