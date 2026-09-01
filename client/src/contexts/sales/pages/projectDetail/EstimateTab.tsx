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
 * ── 版の一覧はスマホでカードにした（v4ネイティブUI監査・この回） ─────
 *
 * この見積タブ自体は明細（`EstimateItems`）が数量・単価・仕入・日付・金額の
 * 6列を持つ入力欄の並びなので、CLAUDE.md の方針どおり**タブ全体は今までどおり
 * PC専用**（`ProjectDetailPage.tsx` の `OffPhoneTab`）のままにしています。
 * ただし「それでもこのまま開く」を選んだ人・将来この判断を見直す人のために、
 * **版の一覧（版・タイトル・金額・状態・操作）だけ**は `Row`（PC表を縮めた
 * だけ）からカード積みに作り直しました。明細の入力欄（`EstimateItems`）は
 * 手を入れていません — そこは6列の数値入力欄の並びで、375pxに収める作り直し
 * よりPCで入力するほうが理にかなっています。
 *
 * ── 版の一覧の描画は `EstimateVersionList.tsx` に分離した ────────────
 *
 * アーカイブ機能（`archived_at`・migration 236）を足したところで
 * このファイルが400行を超えたため、PC表／スマホカードの描画部分
 * （データ取得・ミューテーションの定義はここに残したまま）だけを
 * 切り出した。`Estimate` 型・`STATUS_LABEL`/`STATUS_TONE` はこのファイルが
 * 正で `export` している——2か所に持つと版の状態の色分けがずれる。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Wallet, Archive } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { Button } from '@/components/ui/button';
import { Input as TextInput } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { RevenueBillingPane } from './RevenueBillingPane';
import { InvoiceGroupsSection } from './InvoiceGroupsSection';
import { EstimateItems, type EstimateItemRow as Item } from './EstimateItems';
import { type EstimateStatus as Status } from './EstimateActions';
import { EstimateVersionList } from './EstimateVersionList';
import type { ProjectDetail } from './types';
import { ApprovalNotice, needsApproval } from '@/contexts/shared/components/ApprovalRow';

export interface Estimate {
  id: string; group_id: string; version: number; title: string; status: Status;
  subtotal: number; discount: number; sent_at: string | null;
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

/**
 * タイトル・見積全体の備考。**下書きのときだけ直せる**（サーバーが強制。ここは出し分けだけ）。
 * 明細と同じ画面に置くと保存のタイミングを迷うので、**別に保存できる**（`onBlur`）。
 */
function EstimateMetaCard({
  estimate, onSave,
}: { estimate: Estimate; onSave: (patch: Partial<Pick<Estimate, 'title' | 'notes'>>) => void }) {
  const [title, setTitle] = useState(estimate.title ?? '');
  const [notes, setNotes] = useState(estimate.notes ?? '');
  // **サーバーは下書き以外の中身を全部拒否する**（`update` の `CONTENT` 判定）。
  // ここが `sent`/`accepted`/`superseded` だけを見ていると、`rejected`（失注）の見積は
  // 直せるように見えて blur で 400 が返る（Codex の指摘 P2）
  const locked = estimate.status !== 'draft';

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <label className="text-sub mb-1 block text-muted-foreground">タイトル</label>
      <TextInput
        value={title}
        disabled={locked}
        placeholder="お客様に出す見積のタイトル"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title !== (estimate.title ?? '')) onSave({ title }); }}
      />
      <label className="text-sub mb-1 mt-3 block text-muted-foreground">見積全体の備考</label>
      <Textarea
        value={notes}
        disabled={locked}
        rows={2}
        placeholder="お客様への注記など（行ごとの備考は明細の各行に入れてください）"
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => { if (notes !== (estimate.notes ?? '')) onSave({ notes }); }}
      />
    </div>
  );
}

export function EstimateTab({ project }: { project: ProjectDetail }) {
  const [pane, setPane] = useState<'estimate' | 'revenue'>('estimate');
  const [openId, setOpenId] = useState<string | null>(null);
  // **既定はアーカイブした版を隠す**（サーバーの既定と揃える）。「アーカイブした版を
  // 表示」を押すと `include_archived=1` を付けて引き直す — 版が増えるほど古い版が
  // 一覧に積み上がって見たい版（最新の draft・sent）が埋もれるのを防ぐための機能
  const [showArchived, setShowArchived] = useState(false);
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  // **サーバーは POST/PUT '/'・PUT '/:id/items' に editor を要求する**
  // （`estimates.routes.ts` の `canEdit`）。承認ボタンは `can_approve` で
  // サーバー側から出し分けているが、作成・保存はここで見ないと
  // reader にもボタンが出て「押せるのに 403」になる
  const canEdit = hasPermission('sales', 'editor');
  const base = `/projects/${project.id}/estimates`;
  // **`showArchived` は鍵に含めない。** `invalidateQueries({ queryKey: ['estimates', project.id] })`
  // は前方一致で両方の鍵（表示あり／なし）を落とすので、鍵を分けても取りこぼしは無いが、
  // 呼び出し側を増やさないためにここは1本のまま揃える
  const invalidate = () => qc.invalidateQueries({ queryKey: ['estimates', project.id] });

  const list = useQuery<Estimate[]>({
    queryKey: ['estimates', project.id, showArchived],
    queryFn: async () => (await api.get(base, { params: showArchived ? { include_archived: '1' } : undefined })).data.data,
    enabled: pane === 'estimate',
  });

  const detail = useQuery<Estimate>({
    queryKey: ['estimate', openId],
    queryFn: async () => (await api.get(`${base}/${openId}`)).data.data,
    enabled: !!openId,
  });

  const create = useMutation({
    mutationFn: () => api.post(base, { title: '', tax_category: 'tax10', customer_id: null }),
    onSuccess: (r) => { invalidate(); setOpenId(r.data.data.id); notifySuccess('見積をつくりました'); },
    onError: (e) => notifyApiError('見積をつくれませんでした', e),
  });

  const nextVersion = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/next-version`),
    onSuccess: (r) => {
      invalidate(); setOpenId(r.data.data.id);
      notifySuccess(`v${r.data.data.version} をつくりました（前の版はそのまま残ります）`);
    },
    onError: (e) => notifyApiError('次の版をつくれませんでした', e),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.put(`${base}/${id}`, { status }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] }); },
    onError: (e) => notifyApiError('状態を変えられませんでした', e),
  });

  const saveItems = useMutation({
    mutationFn: ({ id, items }: { id: string; items: Item[] }) => api.put(`${base}/${id}/items`, { items }),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('明細を保存しました');
    },
    onError: (e) => notifyApiError('明細を保存できませんでした', e),
  });

  /** タイトル・見積全体の備考。**明細と同じ「下書きだけ直せる」規則**（サーバー側で強制） */
  const saveMeta = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Pick<Estimate, 'title' | 'notes'>> }) =>
      api.put(`${base}/${id}`, patch),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] }); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => { invalidate(); setOpenId(null); notifySuccess('見積を消しました'); },
    onError: (e) => notifyApiError('見積を消せませんでした', e),
  });

  /** 一覧から隠すだけ。`status` は変えない（消すのとは別。migration 236） */
  const archive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/archive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('アーカイブしました（一覧から隠しただけです。消えていません）');
    },
    onError: (e) => notifyApiError('アーカイブできませんでした', e),
  });

  const unarchive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/unarchive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('アーカイブを解除しました');
    },
    onError: (e) => notifyApiError('アーカイブを解除できませんでした', e),
  });

  /**
   * 受注した見積を売上・請求 (`revenues`) に登録する。
   * migration 138 が予告していたまま行き先が無かった変換（`estimate.service.ts` 参照）。
   */
  const convertToRevenue = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/convert-to-revenue`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      // 財務の台帳・締め処理・案件一覧の見積金額はすべて `revenues` を読み直す
      qc.invalidateQueries({ queryKey: ['revenues'] });
      notifySuccess('売上・請求に登録しました（「売上・請求」の切り替えから見られます）');
    },
    onError: (e) => notifyApiError('売上・請求に登録できませんでした', e),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 p-4 lg:p-6">
      <div className="inline-flex w-fit shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="見るものを切り替える">
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
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-sub inline-flex w-fit shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          {showArchived ? 'アーカイブした版を隠す' : 'アーカイブした版を表示する'}
        </button>
      )}

      {pane === 'revenue' ? (
        <>
          <InvoiceGroupsSection project={project} mobile={isMobile} />
          <RevenueBillingPane projectId={project.id} projectName={project.name} mobile={isMobile} />
        </>
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="見積はまだありません"
          description="明細を積んで金額を出します。お客様に出したあとに直したくなったら、版を上げれば前に出したものは残ります。1案件で見積を分けたいとき（本編とケータリングなど）は「見積をつくる」を必要な数だけ押してください。"
          action={canEdit ? (
            <Button onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />見積をつくる</Button>
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
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />見積をつくる
              </Button>
            )}
            <p className="text-sub text-muted-foreground">
              {canEdit
                ? '「見積をつくる」は押すたびに独立した見積が増えます（本編とケータリングなど、1案件を複数の見積に分けたいときに）。版を上げると前の版はそのまま残ります（出したあとに書き換えないため。まだ出していない下書きはそのまま直せます）。'
                : '閲覧のみの権限です。新しい版の作成・明細の保存には案件管理の編集権限が必要です。'}
            </p>
          </div>

          {/* **承認待ちは一覧の上に出す。** 行の中に畳むと、
              「送れない理由」が横に長い行の右端に埋もれて読まれない */}
          {(list.data ?? []).filter(needsApproval).map((e) => (
            <ApprovalNotice key={`approval-${e.id}`} estimate={e} base={base}
              onDone={() => list.refetch()} />
          ))}

          <EstimateVersionList
            estimates={list.data ?? []}
            isMobile={isMobile}
            onToggleOpen={(id) => setOpenId(openId === id ? null : id)}
            base={base}
            statusLabel={STATUS_LABEL}
            statusTone={STATUS_TONE}
            onSetStatus={(id, status) => setStatus.mutate({ id, status })}
            onConvert={(id) => convertToRevenue.mutate(id)}
            onNextVersion={(id) => nextVersion.mutate(id)}
            onRemove={(id) => remove.mutate(id)}
            onArchive={(id) => archive.mutate(id)}
            onUnarchive={(id) => unarchive.mutate(id)}
          />

          {openId && detail.data && (
            <>
              <EstimateMetaCard
                key={detail.data.id}
                estimate={detail.data}
                onSave={(patch) => saveMeta.mutate({ id: openId, patch })}
              />
              <EstimateItems
                estimate={{ ...detail.data, project_id: project.id, customer_type: project.customer_type }}
                onSave={(items) => saveItems.mutate({ id: openId, items })}
                saving={saveItems.isPending}
                canEdit={canEdit}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
