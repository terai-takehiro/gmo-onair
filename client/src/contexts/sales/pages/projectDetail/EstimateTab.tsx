/**
 * 案件詳細 / 見積・請求タブ (v4 ⑥)
 *
 * ── 見積は「版が残る」形にしました ──────────────────────────
 *
 * v1 を送ったあとに v2 を作っても、**v1 の中身はそのまま残ります**
 * (`estimates` テーブル。前の版は `superseded` にして中身は触らない)。
 * 送った見積を後から書き換えられると「何を出したか」が追えなくなるためです。
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
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Send, Trash2, Receipt, Wallet, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { RevenueBillingPane } from './RevenueBillingPane';
import { EstimateItems, type EstimateItemRow as Item } from './EstimateItems';
import type { ProjectDetail } from './types';

type Status = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

interface Estimate {
  id: string; group_id: string; version: number; title: string; status: Status;
  subtotal: number; discount: number; sent_at: string | null;
  /** 受注して売上に変換したときの行。追跡用（migration 138）。無ければ未変換 */
  revenue_id: string | null;
  items?: Item[];
}

const STATUS_LABEL: Record<Status, string> = {
  draft: '作成中', sent: '提出済', accepted: '受注', rejected: '失注', superseded: '旧版',
};
const STATUS_TONE: Record<Status, string> = {
  draft: 'border-transparent bg-muted text-muted-foreground',
  sent: 'border-transparent bg-primary-surface text-primary',
  accepted: 'border-transparent bg-success-surface text-success',
  rejected: 'border-transparent bg-destructive-surface text-destructive',
  superseded: 'border-transparent bg-muted text-muted-foreground',
};

export function EstimateTab({ project }: { project: ProjectDetail }) {
  const [pane, setPane] = useState<'estimate' | 'revenue'>('estimate');
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();
  const base = `/projects/${project.id}/estimates`;
  const invalidate = () => qc.invalidateQueries({ queryKey: ['estimates', project.id] });

  const list = useQuery<Estimate[]>({
    queryKey: ['estimates', project.id],
    queryFn: async () => (await api.get(base)).data.data,
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

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => { invalidate(); setOpenId(null); notifySuccess('見積を消しました'); },
    onError: (e) => notifyApiError('見積を消せませんでした', e),
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

      {pane === 'revenue' ? (
        <RevenueBillingPane projectId={project.id} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="見積はまだありません"
          description="明細を積んで金額を出します。お客様に出したあとに直したくなったら、版を上げれば前に出したものは残ります。"
          action={<Button onClick={() => create.mutate()}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />見積をつくる</Button>}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button onClick={() => create.mutate()}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />見積をつくる
            </Button>
            <p className="text-sub text-muted-foreground">
              版を上げると前の版はそのまま残ります（お客様に出したものを後から書き換えないため）。
            </p>
          </div>

          <div className="overflow-hidden rounded-card border border-border bg-card">
            <RowHeader className="hidden sm:flex">
              <RowSlot w={56}>版</RowSlot>
              <RowMain>見積</RowMain>
              <RowSlot w={128} align="right">金額（税抜）</RowSlot>
              <RowSlot w={96}>状態</RowSlot>
              <RowSlot w={240} align="right">操作</RowSlot>
            </RowHeader>
            {(list.data ?? []).map((e) => (
              <Row key={e.id} divider interactive stackOnMobile align="center">
                <RowSlot w={56}>
                  <span className="text-list font-number">v{e.version}</span>
                </RowSlot>
                <RowMain>
                  {/* 高さは決めた段に乗せる (中身任せだと 39px になり、指でも押しにくい) */}
                  <button type="button" onClick={() => setOpenId(openId === e.id ? null : e.id)} className="min-h-tap w-full text-left">
                    <span className="text-list block truncate">{e.title || '名前のない見積'}</span>
                    {e.sent_at && (
                      <span className="text-sub-sm block text-muted-foreground">
                        出した日 {e.sent_at.slice(0, 10).replace(/-/g, '/')}
                      </span>
                    )}
                  </button>
                </RowMain>
                <Money value={e.subtotal - e.discount} className="text-sub w-32 shrink-0" />
                <TableBadge w={96} label={STATUS_LABEL[e.status]} className={STATUS_TONE[e.status]} />
                <RowSlot w={240} align="right" className="flex-wrap gap-1">
                  {e.status === 'draft' && (
                    <Button variant="outline" size="sm" title="お客様に出したことにする"
                      onClick={() => setStatus.mutate({ id: e.id, status: 'sent' })}>
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  {e.status === 'sent' && (
                    <>
                      <Button variant="outline" size="sm" title="受注にする"
                        onClick={() => setStatus.mutate({ id: e.id, status: 'accepted' })}>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                      </Button>
                      <Button variant="outline" size="sm" title="失注にする" onClick={async () => {
                        const ok = await confirmAction({
                          title: '失注にしますか？',
                          description: 'この見積は失注として残ります。取り消したいときは次の版をつくってください。',
                          confirmLabel: '失注にする', tone: 'danger',
                        });
                        if (ok) setStatus.mutate({ id: e.id, status: 'rejected' });
                      }}>
                        <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                  {e.status === 'accepted' && (
                    e.revenue_id ? (
                      <span className="text-sub-sm whitespace-nowrap text-success">登録済み</span>
                    ) : (
                      <Button size="sm" title="この見積の金額で売上・請求に登録する" onClick={async () => {
                        const ok = await confirmAction({
                          title: '売上・請求に登録しますか？',
                          description: `見積の金額（税抜 ${formatCurrency(e.subtotal - e.discount)}）で「売上・請求」に1件登録します。あとから金額だけをここで直しても登録済みの売上には反映されません。`,
                          confirmLabel: '登録する',
                        });
                        if (ok) convertToRevenue.mutate(e.id);
                      }}>
                        <ArrowRight className="mr-1 h-3.5 w-3.5" aria-hidden="true" />売上・請求へ
                      </Button>
                    )
                  )}
                  <Button variant="outline" size="sm" title="この版を写して次の版をつくる"
                    onClick={() => nextVersion.mutate(e.id)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  {!e.revenue_id && (
                    <Button variant="outline" size="sm" title="消す" onClick={async () => {
                      const ok = await confirmAction({
                        title: `v${e.version} を消しますか？`,
                        description: '明細もいっしょに消えます。ほかの版は残ります。元に戻せません。',
                        confirmLabel: '消す', tone: 'danger',
                      });
                      if (ok) remove.mutate(e.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                    </Button>
                  )}
                </RowSlot>
              </Row>
            ))}
          </div>

          {openId && detail.data && (
            <EstimateItems
              estimate={detail.data}
              onSave={(items) => saveItems.mutate({ id: openId, items })}
              saving={saveItems.isPending}
            />
          )}
        </>
      )}
    </div>
  );
}
