/**
 * ④ メンテナンス (v4)
 *
 * 故障・点検・修理の記録です。状態は 報告済 → 対応中 → 完了 で進みます。
 *
 * 変えたのは枠だけで、**送る値と状態の遷移は旧実装のまま**です
 * (状態を「完了」にしたときに `completed_at` を入れるところも同じ)。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { MAINTENANCE_STATUS, MAINTENANCE_TYPE, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { MaintenanceDialog, type MaintenanceForm } from './maintenance/MaintenanceDialog';

interface MaintenanceRecord {
  id: string;
  eq_code: string;
  equipment_name: string;
  record_type: string;
  title: string;
  description: string | null;
  vendor_name: string | null;
  repair_cost: number | null;
  status: string;
  reported_at: string | null;
  result: string | null;
  started_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
}

const STATUS_TONE: Record<string, string> = {
  reported: 'bg-warning-surface text-warning border-transparent',
  in_progress: 'bg-info-surface text-info border-transparent',
  completed: 'bg-success-surface text-success border-transparent',
  cancelled: 'bg-muted text-muted-foreground border-transparent',
};

const CHIPS = [
  { key: '', label: 'すべて' },
  { key: 'reported', label: '報告済' },
  { key: 'in_progress', label: '対応中' },
  { key: 'completed', label: '完了' },
];

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // 件数をチップに出すので**絞り込み無しで1回引き**、絞り込みは画面で掛ける
  const list = useQuery({
    queryKey: ['maintenance-records'],
    queryFn: async () => (await api.get('/equipment/maintenance')).data.data as MaintenanceRecord[],
  });
  const all = useMemo(() => list.data ?? [], [list.data]);
  const records = useMemo(() => (status ? all.filter((r) => r.status === status) : all), [all, status]);

  const { data: allItems } = useQuery({
    queryKey: ['equipment-items-all'],
    queryFn: async () => (await api.get('/equipment/items')).data.data as { id: string; eq_code: string; name: string }[],
    enabled: dialogOpen,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['maintenance-records'] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
  };

  const create = useMutation({
    mutationFn: (form: MaintenanceForm) => api.post('/equipment/maintenance', {
      ...form,
      repair_cost: form.repair_cost ? Number(form.repair_cost) : null,
    }),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setSaveError(null);
      notifySuccess('メンテナンスの記録を足しました');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setSaveError(e?.response?.data?.error?.message || e?.message || '保存できませんでした');
    },
  });

  const update = useMutation({
    mutationFn: (r: MaintenanceRecord) => api.put(`/equipment/maintenance/${r.id}`, {
      title: r.title, description: r.description, assigned_to: r.assigned_to,
      vendor_name: r.vendor_name, repair_cost: r.repair_cost, status: r.status, result: r.result,
      started_at: r.started_at,
      completed_at: r.status === 'completed' ? new Date().toISOString() : r.completed_at,
    }),
    onSuccess: () => { invalidate(); notifySuccess('状態を変えました'); },
    onError: (e) => notifyApiError('状態を変えられませんでした', e),
  });

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="メンテナンス"
        sub="故障・点検・修理の記録です。報告済 → 対応中 → 完了 で進みます"
        primaryAction={
          <Button onClick={() => { setSaveError(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />記録を足す
          </Button>
        }
      />

      <FilterChips
        label="状態で絞り込む"
        items={CHIPS.map((c) => ({
          key: c.key,
          label: c.label,
          count: c.key ? all.filter((r) => r.status === c.key).length : all.length,
        }))}
        value={status}
        onChange={setStatus}
      />

      {list.isError ? (
        <ErrorPanel title="メンテナンスの記録を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : records.length === 0 ? (
        <EmptyState
          title={status ? 'この状態の記録はありません' : 'メンテナンスの記録がまだ1件もありません'}
          description="故障・点検・修理が出たら「記録を足す」から入れます。稼働停止中の台数はダッシュボードに出ます。"
        />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={72}>種類</RowSlot>
            <RowMain>内容 ／ 機材</RowMain>
            <RowSlot w={96}>業者</RowSlot>
            <RowSlot w={128} align="right">費用</RowSlot>
            <RowSlot w={72}>報告日</RowSlot>
            <RowSlot w={160}>状態</RowSlot>
          </RowHeader>
          {records.map((r) => (
            <Row key={r.id} divider stackOnMobile align="start">
              <RowSlot w={72}>
                <span className="text-sub-sm text-secondary-foreground">
                  {statusOf(MAINTENANCE_TYPE, r.record_type).label}
                </span>
              </RowSlot>
              <RowMain>
                <RowTitle>{r.title}</RowTitle>
                <RowSub>
                  <span className="font-number text-primary">{r.eq_code}</span> ・ {r.equipment_name}
                  {r.description ? ` ／ ${r.description}` : ''}
                </RowSub>
              </RowMain>
              <RowSlot w={96} hideOnMobile>
                {r.vendor_name && <span className="truncate text-sub-sm text-secondary-foreground">{r.vendor_name}</span>}
              </RowSlot>
              <MoneyCell value={r.repair_cost} width={128} />
              <RowSlot w={72} hideOnMobile>
                <span className="font-number text-sub-sm text-muted-foreground">
                  {r.reported_at?.slice(5, 10).replace('-', '/') ?? ''}
                </span>
              </RowSlot>
              <RowSlot w={160} placeholder="">
                {r.status === 'completed' || r.status === 'cancelled' ? (
                  <TableBadge
                    label={statusOf(MAINTENANCE_STATUS, r.status).label}
                    w={null}
                    className={STATUS_TONE[r.status]}
                  />
                ) : (
                  <Select value={r.status} onValueChange={(v) => update.mutate({ ...r, status: v })}>
                    <SelectTrigger className="w-full" aria-label={`${r.title} の状態を変える`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reported">報告済</SelectItem>
                      <SelectItem value="in_progress">対応中</SelectItem>
                      <SelectItem value="completed">完了</SelectItem>
                      <SelectItem value="cancelled">取りやめ</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <MaintenanceDialog
        open={dialogOpen}
        items={allItems ?? []}
        saving={create.isPending}
        error={saveError}
        onClose={() => setDialogOpen(false)}
        onSubmit={(form) => create.mutate(form)}
      />
    </div>
  );
}
