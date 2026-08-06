/**
 * ⑦ 貸出・返却 (v4)
 *
 * いま出ている機材と、返ってきた記録です。
 * 貸出の登録 (`lending/LendingDialog.tsx`) と返却 (`lending/ReturnDialog.tsx`) は別ファイル。
 *
 * ── 変えたこと ────────────────────────────────────────────
 *
 *  ・状態の絞り込みを**件数つきのチップ**にした (押す前に 0 件だと分かる)。
 *    旧実装は選択肢の1つが「返却遅延」で、サーバーはその値を知らないため
 *    **選ぶと全件が出ていました** — 遅延は返却予定日から画面で導きます。
 *  ・保存できなかった理由をダイアログの上辺に出すようにした
 *    (旧実装は貸出だけ本文の末尾、返却は何も出ませんでした)。
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { LendingDialog, type LendingPayload } from './lending/LendingDialog';
import { ReturnDialog } from './lending/ReturnDialog';

interface Lending {
  id: string;
  equipment_name: string;
  unit_number: number | null;
  borrower_name: string;
  purpose: string | null;
  status: string;
  lent_at: string | null;
  due_date: string | null;
  returned_at: string | null;
  project_name: string | null;
  gls_number: string | null;
}

const today = () => new Date().toISOString().split('T')[0];

/** 遅延は**画面で導く**。サーバーの `status` は貸出中／返却済の2つしか無い */
const isLate = (l: Lending) => l.status === 'lent' && !!l.due_date && l.due_date < today();

const md = (d: string | null) => (d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—');

export default function LendingListPage() {
  const qc = useQueryClient();
  const [chip, setChip] = useState('lent');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [lendError, setLendError] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<Lending | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);

  // すべて引いてから画面で分ける。**チップの件数を出すため**
  const list = useQuery({
    queryKey: ['equipment-lendings'],
    queryFn: async () => (await api.get('/equipment/lendings')).data.data as Lending[],
  });
  const all = useMemo(() => list.data ?? [], [list.data]);

  const groups = useMemo(() => ({
    lent: all.filter((l) => l.status === 'lent'),
    late: all.filter(isLate),
    returned: all.filter((l) => l.status !== 'lent'),
  }), [all]);

  const rows = chip === 'late' ? groups.late : chip === 'returned' ? groups.returned : groups.lent;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['equipment-lendings'] });
    qc.invalidateQueries({ queryKey: ['equipment-stats'] });
    qc.invalidateQueries({ queryKey: ['equipment-lendable'] });
  };

  const lend = useMutation({
    mutationFn: (payload: LendingPayload) => api.post('/equipment/lendings/batch', payload),
    onSuccess: (_r, p) => {
      invalidate();
      setDialogOpen(false);
      setLendError(null);
      notifySuccess(`${p.equipment_ids.length} 台の貸出を記録しました`);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setLendError(e?.response?.data?.error?.message || e?.message || '貸出を記録できませんでした');
    },
  });

  const doReturn = useMutation({
    mutationFn: (p: { id: string; condition_in: string; notes: string }) =>
      api.put(`/equipment/lendings/${p.id}/return`, { condition_in: p.condition_in, notes: p.notes }),
    onSuccess: () => {
      invalidate();
      setReturnTarget(null);
      setReturnError(null);
      notifySuccess('返却を記録しました');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      setReturnError(e?.response?.data?.error?.message || e?.message || '返却を記録できませんでした');
    },
  });

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="貸出・返却"
        sub="いま出ている機材と、返ってきた記録です。貸出可にした機材だけが対象です"
        primaryAction={
          <Button onClick={() => { setLendError(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />貸出を記録
          </Button>
        }
      />

      <FilterChips
        label="状態で絞り込む"
        items={[
          { key: 'lent', label: '貸出中', count: groups.lent.length },
          { key: 'late', label: '返却遅延', count: groups.late.length },
          { key: 'returned', label: '返却済', count: groups.returned.length },
        ]}
        value={chip}
        onChange={setChip}
      />

      {list.isError ? (
        <ErrorPanel title="貸出の記録を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            chip === 'late' ? '返却が遅れているものはありません'
              : chip === 'returned' ? '返却済の記録はまだありません'
                : 'いま出ている機材はありません'
          }
          description="「貸出を記録」から持ち出しを登録します。貸出可にした機材だけが選べます。"
        />
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowMain>機材 ／ 借りている人・案件</RowMain>
            <RowSlot w={96}>状態</RowSlot>
            <RowSlot w={72} align="right">持出</RowSlot>
            <RowSlot w={72} align="right">返却予定</RowSlot>
            <RowSlot w={96} align="right">{''}</RowSlot>
          </RowHeader>
          {rows.map((l) => {
            const late = isLate(l);
            return (
              <Row key={l.id} divider stackOnMobile>
                <RowMain>
                  <RowTitle>
                    {l.equipment_name}
                    {l.unit_number != null && <span className="ml-1 text-primary">No.{l.unit_number}</span>}
                  </RowTitle>
                  <RowSub>
                    {[l.borrower_name, l.gls_number, l.project_name, l.purpose].filter(Boolean).join(' ／ ')}
                  </RowSub>
                </RowMain>
                <RowSlot w={96}>
                  <TableBadge
                    label={l.status === 'lent' ? (late ? '返却遅延' : '貸出中') : '返却済'}
                    w={null}
                    className={late
                      ? 'bg-destructive-surface text-destructive border-transparent'
                      : l.status === 'lent'
                        ? 'bg-primary-surface-weak text-primary border-transparent'
                        : 'bg-muted text-muted-foreground border-transparent'}
                  />
                </RowSlot>
                <RowSlot w={72} align="right" hideOnMobile>
                  <span className="font-number text-sub-sm text-muted-foreground">{md(l.lent_at)}</span>
                </RowSlot>
                <RowSlot w={72} align="right">
                  <span className={`font-number text-sub ${late ? 'text-destructive' : 'text-secondary-foreground'}`}>
                    {l.status === 'lent' ? md(l.due_date) : md(l.returned_at)}
                  </span>
                </RowSlot>
                <RowSlot w={96} align="right" placeholder="">
                  {l.status === 'lent' && (
                    <Button variant="outline" onClick={() => { setReturnError(null); setReturnTarget(l); }}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />返却
                    </Button>
                  )}
                </RowSlot>
              </Row>
            );
          })}
        </div>
      )}

      <LendingDialog
        open={dialogOpen}
        saving={lend.isPending}
        error={lendError}
        onClose={() => setDialogOpen(false)}
        onSubmit={(payload) => lend.mutate(payload)}
      />

      <ReturnDialog
        open={!!returnTarget}
        name={returnTarget
          ? `${returnTarget.equipment_name}${returnTarget.unit_number != null ? ` No.${returnTarget.unit_number}` : ''}`
          : ''}
        saving={doReturn.isPending}
        error={returnError}
        onClose={() => setReturnTarget(null)}
        onSubmit={(p) => returnTarget && doReturn.mutate({ id: returnTarget.id, ...p })}
      />
    </div>
  );
}
