/**
 * ⑤ 棚卸し ／ 1回ぶんのチェックリスト (v4)
 *
 * 保管場所ごとにまとめて ✓ (あった) / × (無かった) を押します。
 * 押した瞬間に保存されます (「一時保存」は一覧に戻るだけ)。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, HelpCircle, Loader2, MapPin, RefreshCw, Trash2, Undo2, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { INVENTORY_STATUS, statusOf } from '@gmo-onair/shared/src/constants/statuses';

export interface CheckItem {
  id: string;
  equipment_id: string;
  eq_code: string;
  equipment_name: string;
  unit_number: number | null;
  expected_location: string | null;
  actual_location: string | null;
  location_name: string | null;
  location_detail: string | null;
  found: number;
  condition: string | null;
  note: string | null;
}

interface CheckDetailData {
  id: string;
  title: string;
  check_date: string;
  status: string;
  items: CheckItem[];
}

const locKey = (i: CheckItem) => i.location_name || i.location_detail || '(場所なし)';

export function CheckDetail({ checkId, onBack, onDeleted }: {
  checkId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [locationFilter, setLocationFilter] = useState('');

  const detailQuery = useQuery({
    queryKey: ['inventory-check', checkId],
    queryFn: async () => (await api.get(`/equipment/inventory-checks/${checkId}`)).data.data as CheckDetailData,
  });
  const detail = detailQuery.data;
  const items = useMemo(() => detail?.items ?? [], [detail]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory-check', checkId] });
    qc.invalidateQueries({ queryKey: ['inventory-checks'] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const markItem = useMutation({
    mutationFn: (p: { itemId: string; found: number; item: CheckItem }) =>
      api.put(`/equipment/inventory-checks/${checkId}/items/${p.itemId}`, {
        found: p.found,
        actual_location: p.item.actual_location,
        condition: p.item.condition,
        note: p.item.note,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-check', checkId] }),
    onError: (e) => notifyApiError('印を付けられませんでした', e),
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.put(`/equipment/inventory-checks/${checkId}/status`, { status }),
    onSuccess: () => { invalidate(); notifySuccess('棚卸しの状態を変えました'); },
    onError: (e) => notifyApiError('状態を変えられませんでした', e),
  });

  const sync = useMutation({
    mutationFn: () => api.post(`/equipment/inventory-checks/${checkId}/sync`, {}),
    onSuccess: (res: { data?: { data?: { added?: number } } }) => {
      qc.invalidateQueries({ queryKey: ['inventory-check', checkId] });
      const added = res?.data?.data?.added ?? 0;
      notifySuccess(added > 0 ? `${added} 件の機材をチェックリストに足しました` : '足す機材はありませんでした');
    },
    onError: (e) => notifyApiError('機材を取り込めませんでした', e),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/equipment/inventory-checks/${checkId}`),
    onSuccess: () => { invalidate(); onDeleted(); notifySuccess('棚卸しを消しました'); },
    onError: (e) => notifyApiError('消せませんでした', e),
  });

  if (detailQuery.isError) {
    return (
      <div className="flex flex-col gap-4 p-3 lg:p-6">
        <ErrorPanel title="棚卸しを読み込めませんでした" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      </div>
    );
  }
  if (!detail) {
    return <div className="p-3 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;
  }

  const completed = detail.status === 'completed';
  const checked = items.filter((i) => i.found > 0).length;
  const locations = Array.from(new Set(items.map(locKey)));
  const shown = locationFilter ? items.filter((i) => locKey(i) === locationFilter) : items;

  const groups = new Map<string, CheckItem[]>();
  for (const i of shown) {
    const k = locKey(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  }

  const onDelete = async () => {
    const ok = await confirmAction({
      title: `棚卸し「${detail.title}」を消しますか`,
      description: `付けた ${checked} 件ぶんの印もいっしょに消えます。取り消せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) remove.mutate();
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <div>
        <Button variant="ghost" onClick={onBack} className="mb-1">
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />棚卸しの一覧へ
        </Button>
        <PageHeader
          title={detail.title}
          sub={`${detail.check_date} ・ ${statusOf(INVENTORY_STATUS, detail.status).label} ・ ${checked}/${items.length} 件を確認`}
        >
          {!completed && (
            <Button
              variant="outline"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              title="棚卸しを作ったあとに登録された機材をチェックリストに足します"
            >
              {sync.isPending
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                : <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />}
              あとから足された機材を取り込む
            </Button>
          )}
          {detail.status === 'draft' && (
            <Button onClick={() => setStatus.mutate('in_progress')}>棚卸しを始める</Button>
          )}
          {detail.status === 'in_progress' && (
            <Button onClick={() => setStatus.mutate('completed')}>終わりにする</Button>
          )}
          {completed && (
            <Button variant="outline" onClick={() => setStatus.mutate('in_progress')}>
              <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />もう一度開く
            </Button>
          )}
          <Button variant="outline" className="text-destructive" onClick={onDelete} disabled={remove.isPending}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />消す
          </Button>
        </PageHeader>
      </div>

      {locations.length > 1 && (
        <FilterChips
          label="保管場所で絞り込む"
          items={[
            { key: '', label: 'すべて', count: items.length },
            ...locations.map((loc) => ({
              key: loc, label: loc, count: items.filter((i) => locKey(i) === loc).length,
            })),
          ]}
          value={locationFilter}
          onChange={setLocationFilter}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          title="チェックリストが空です"
          description="「あとから足された機材を取り込む」を押すと、いまの機材台帳から作り直します。"
        />
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from(groups.entries()).map(([loc, group]) => (
            <section key={loc} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 border-b border-border pb-1">
                <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-cardtitle">{loc}</h2>
                <span className="font-number text-sub-sm text-muted-foreground">
                  {group.filter((i) => i.found > 0).length}/{group.length}
                </span>
              </div>
              <div className="flex flex-col rounded-card border border-border bg-card">
                {group.map((item) => (
                  <Row key={item.id} divider className={completed ? 'opacity-70' : ''}>
                    <RowSlot w={96}>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          disabled={completed}
                          aria-label={`${item.equipment_name} はあった`}
                          aria-pressed={item.found === 1}
                          className={`flex h-9 w-9 items-center justify-center rounded-control disabled:cursor-not-allowed ${
                            item.found === 1
                              ? 'bg-success text-success-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-success-surface'
                          }`}
                          onClick={() => !completed && markItem.mutate({ itemId: item.id, found: 1, item })}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={completed}
                          aria-label={`${item.equipment_name} は無かった`}
                          aria-pressed={item.found === 2}
                          className={`flex h-9 w-9 items-center justify-center rounded-control disabled:cursor-not-allowed ${
                            item.found === 2
                              ? 'bg-destructive text-destructive-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-destructive-surface'
                          }`}
                          onClick={() => !completed && markItem.mutate({ itemId: item.id, found: 2, item })}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </span>
                    </RowSlot>
                    <RowMain>
                      <RowTitle>
                        <span className="font-number mr-2 text-primary">{item.eq_code}</span>
                        {item.equipment_name}{item.unit_number ? ` No.${item.unit_number}` : ''}
                      </RowTitle>
                      <RowSub>あるはずの場所: {item.expected_location || '決まっていません'}</RowSub>
                    </RowMain>
                    <RowSlot w={56} align="center" placeholder="">
                      {item.found === 0 && (
                        <HelpCircle className="h-4 w-4 text-fg-disabled" aria-label="まだ見ていません" />
                      )}
                    </RowSlot>
                  </Row>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
