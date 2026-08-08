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
 * ── 「売上・請求」は今までの画面のまま ──────────────────────
 *
 * 右の切り替えで開くのは既存の `BusinessProjectView` です。**1行も変えていません**。
 * 見積を新しく作ったので、売上・請求の作り直しは別の回にします。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, Send, Trash2, Receipt, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { LegacyViewTab } from './LegacyViewTab';
import { EstimateItems, type EstimateItemRow as Item } from './EstimateItems';
import type { ProjectDetail } from './types';

type Status = 'draft' | 'sent' | 'accepted' | 'rejected' | 'superseded';

interface Estimate {
  id: string; group_id: string; version: number; title: string; status: Status;
  subtotal: number; discount: number; sent_at: string | null; items?: Item[];
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
        <LegacyViewTab project={project} estimateMode />
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
              <RowSlot w={160} align="right">操作</RowSlot>
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
                <RowSlot w={160} align="right" className="gap-1">
                  {e.status === 'draft' && (
                    <Button variant="outline" size="sm" title="お客様に出したことにする"
                      onClick={() => setStatus.mutate({ id: e.id, status: 'sent' })}>
                      <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" title="この版を写して次の版をつくる"
                    onClick={() => nextVersion.mutate(e.id)}>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
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
