/**
 * 案件詳細・見積タブ「売上・請求」ペインの「社内取引」区画
 * （2026年10月の事業再編・SCS⇄GSS・P2 Round 2）
 *
 * ── なぜここに置いたか ──────────────────────────────────────
 *
 * 設計書（`docs/reorg-2026-10-plan.md` §4.12）は「入口は買い手の案件の
 * **仕入タブ**」と書いているが、実装には専用の「仕入タブ」が無い
 * （`projectDetail/tabs.ts` の7タブに仕入は無い）。売上・仕入（原価）を
 * 1画面で扱っている実際の場所は、見積タブの「売上・請求」ペイン
 * （`EstimateTab.tsx` の `pane === 'revenue'`。中身は `RevenueBillingPane`
 * の3カード＋`InvoiceGroupsSection`）なので、そこに並べる3つ目の区画として
 * 追加した。`InvoiceGroupsSection.tsx` と同じ「このペインに足す専用区画」という
 * 立て付け（レギュラー案件だけの請求まとめ ↔ SCS の案件だけの社内取引）。
 *
 * ── SCS の案件にだけ出す ────────────────────────────────────
 *
 * 買い手は常に SCS・売り手は常に GSS の1方向のみ（サーバー
 * `intercompany.service.ts` の `SELLER_ENTITY`/`BUYER_ENTITY` 固定値と同じ
 * スコープ）。GSS/GMO の案件では入口ごと出さない。
 *
 * ── 一覧の取得も編集権限を要求する ──────────────────────────────
 *
 * サーバー `intercompany.routes.ts` は `router.use(requirePermission('sales',
 * 'editor'))` を **GET を含む全ルートの手前**に掛けている（社内の原価付け替えは
 * 一般の閲覧者には見せない情報という判断）。そのため一覧の取得そのものが
 * `editor` 未満で 403 になる。**区画ごと出さない**のが正しい振る舞い
 * （空の一覧を出すと「社内取引は無い」と読めてしまい嘘になる）。
 *
 * ── 削除・編集の失敗理由はサーバーの文言をそのまま出す ───────────────
 *
 * 請求書発行・検収・入金済みの社内取引は `409 INTERCOMPANY_INVOICED` で
 * 止まる。`notifyApiError` がサーバーの日本語メッセージをそのまま帯に出す
 * ので、ここでは何もしない（`client/CLAUDE.md`「保存が黙って失敗しない仕組み」）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Building2, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { formatDate } from '@gmo-onair/shared/src/client/format';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { Episode } from '@gmo-onair/shared/src/types';
import { IntercompanyDialog } from './IntercompanyDialog';
import type { ProjectDetail } from './types';

export interface IntercompanyLink {
  id: string;
  revenue_id: string;
  purchase_id: string;
  project_id: string;
  created_at: string;
  created_by: string | null;
}

/** 社内取引の売上・仕入行のうち、この区画が使う分だけ（サーバーは全カラムを返す） */
export interface IntercompanyMoney {
  id: string;
  amount: number | string;
  episode_id: string;
  recognition_date: string | null;
  notes: string | null;
  invoice_issued?: boolean | number | null;
  inspection_date?: string | null;
  paid_date?: string | null;
}

export interface IntercompanyDetail {
  link: IntercompanyLink;
  revenue: IntercompanyMoney;
  purchase: IntercompanyMoney;
}

/** 売り手（GSS）側が請求書発行・検収・入金済みなら true。直せない・消せない（サーバーと同じ判定） */
function isLocked(revenue: IntercompanyMoney): boolean {
  return !!(revenue.invoice_issued || revenue.inspection_date || revenue.paid_date);
}

/** `GLS-xxx-01（第1話）` のような回のラベル。見つからなければ ID の先頭だけ出す（消えた回など） */
function episodeLabel(episodes: Episode[], episodeId: string): string {
  const ep = episodes.find((e) => e.id === episodeId);
  if (!ep) return `（不明な回: ${episodeId.slice(0, 8)}）`;
  return `${ep.episode_code}（第${ep.episode_number}話）${ep.title ? ` ${ep.title}` : ''}`;
}

type DialogState = { mode: 'create' } | { mode: 'edit'; detail: IntercompanyDetail };

export function IntercompanySection({ project, mobile }: { project: ProjectDetail; mobile?: boolean }) {
  const isScs = project.entity_code === 'SCS';
  const { hasPermission } = useAuth();
  // サーバー側 `intercompany.routes.ts` は GET を含む全ルートに `sales:editor` を
  // 要求する（ファイル冒頭コメント参照）。**閲覧もこの権限が要る**ので、
  // 無ければ区画ごと出さない（空を「無い」と誤読させない）
  const canView = hasPermission('sales', 'editor');
  // サーバー側 `DELETE /intercompany/:id` の追加要件（`sales:manager`）に合わせる
  const canDelete = hasPermission('sales', 'manager');
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const queryKey = ['intercompany', project.id];
  const enabled = isScs && canView;
  const list = useQuery<IntercompanyDetail[]>({
    queryKey,
    queryFn: async () => (await api.get('/intercompany', { params: { project_id: project.id } })).data.data,
    enabled,
  });

  // 回のラベル用。**一覧（`EpisodeScopeToggle`・`useEstimateEpisodeFilter` 等）と
  // 同じ鍵**なので、他タブが引き済みならキャッシュがそのまま使える
  const episodes = useQuery<Episode[]>({
    queryKey: ['episodes', project.id],
    queryFn: async () => (await api.get(`/projects/${project.id}/episodes`, { params: { limit: 200 } })).data.data,
    enabled,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/intercompany/${id}`),
    onSuccess: () => {
      invalidate();
      notifySuccess('社内取引を削除しました');
    },
    // サーバーのメッセージ（409 のときは「請求書発行・検収・入金が済んだ社内取引は
    // 直せません」）をそのまま出す。fallback は通信そのものが失敗したときだけ使われる
    onError: (err) => notifyApiError('社内取引を削除できませんでした', err, '通信状況を確かめてもう一度お試しください。'),
    meta: { action: '社内取引の削除' },
  });

  // **フックはここまで必ず呼び終える**（`useIsMobile()` と同じ「早期returnしない」原則。
  // `enabled` で問い合わせを止めるだけにし、描画の分岐はこのあとでまとめて行う）
  if (!isScs || !canView) return null;

  const rows = list.data ?? [];
  const episodeList = episodes.data ?? [];

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div>
          <p className="text-cardtitle inline-flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />社内取引
          </p>
          <p className="text-sub text-muted-foreground">
            サムライスタジオ（GSS）のスタジオ・人員・機材で作るぶんの、社内売上（GSS）・社内仕入（SCS）を1組で記録します。
          </p>
        </div>
        <Button size="sm" onClick={() => setDialog({ mode: 'create' })} disabled={episodes.isLoading}>
          <ArrowRightLeft className="mr-1 h-4 w-4" aria-hidden="true" />サムライスタジオへ社内発注
        </Button>
      </div>

      {list.isLoading ? (
        <Delayed><SkeletonRows rows={2} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title="社内取引はまだありません"
          description="「サムライスタジオへ社内発注」から、回を選んで社内売上・仕入を1組登録できます。"
        />
      ) : mobile ? (
        <div className="flex flex-col">
          {rows.map(({ link, revenue }) => {
            const locked = isLocked(revenue);
            return (
              <div key={link.id} className="flex flex-col gap-2 border-b border-border-faint p-3.5 last:border-b-0">
                <span className="min-w-0">
                  <span className="text-list block truncate font-bold">{episodeLabel(episodeList, revenue.episode_id)}</span>
                  <span className="text-sub-sm block text-muted-foreground">作成日 {formatDate(link.created_at)}</span>
                  {locked && <span className="text-sub-sm block text-muted-foreground">請求書発行・検収・入金済み（直せません）</span>}
                </span>
                <div className="flex items-center justify-between gap-2">
                  <Money value={revenue.amount} className="text-list font-bold" />
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" title="編集する" disabled={locked}
                      onClick={() => setDialog({ mode: 'edit', detail: rows.find((r) => r.link.id === link.id)! })}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    {canDelete && (
                      <Button variant="outline" size="sm" title="削除する" disabled={locked}
                        onClick={() => confirmDelete(link.id, remove.mutate)}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <RowHeader className="hidden sm:flex">
            <RowMain>回</RowMain>
            <RowSlot w={128} align="right">金額</RowSlot>
            <RowSlot w={96}>作成日</RowSlot>
            <RowSlot w={96} align="right">操作</RowSlot>
          </RowHeader>
          {rows.map(({ link, revenue }) => {
            const locked = isLocked(revenue);
            return (
              <Row key={link.id} divider stackOnMobile align="start">
                <RowMain>
                  <span className="text-list block truncate">{episodeLabel(episodeList, revenue.episode_id)}</span>
                  {locked && <span className="text-sub-sm block text-muted-foreground">請求書発行・検収・入金済み（直せません）</span>}
                </RowMain>
                <Money value={revenue.amount} className="text-sub w-32 shrink-0" />
                <RowSlot w={96}><span className="text-sub font-number">{formatDate(link.created_at)}</span></RowSlot>
                <RowSlot w={96} align="right" className="gap-1">
                  <Button variant="outline" size="sm" title="編集する" disabled={locked}
                    onClick={() => setDialog({ mode: 'edit', detail: rows.find((r) => r.link.id === link.id)! })}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  {canDelete && (
                    <Button variant="outline" size="sm" title="削除する" disabled={locked}
                      onClick={() => confirmDelete(link.id, remove.mutate)}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </RowSlot>
              </Row>
            );
          })}
        </>
      )}

      {dialog && (
        <IntercompanyDialog
          projectId={project.id}
          episodes={episodeList}
          detail={dialog.mode === 'edit' ? dialog.detail : null}
          onClose={() => setDialog(null)}
          onSaved={() => { invalidate(); setDialog(null); }}
        />
      )}
    </div>
  );
}

/** 削除の確認。**何が消えるかを書く**（`client/CLAUDE.md` の確認ダイアログの決めごと） */
async function confirmDelete(linkId: string, mutate: (id: string) => void): Promise<void> {
  const ok = await confirmAction({
    title: '社内取引を削除しますか？',
    description: 'この社内取引に結び付いている社内売上（GSS）・社内仕入（SCS）を両方とも削除します。',
    confirmLabel: '削除する',
    tone: 'danger',
  });
  if (ok) mutate(linkId);
}
