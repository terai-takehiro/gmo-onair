/**
 * ⑤ 棚卸し (v4)
 *
 * 一覧 (回ごと) と、1回ぶんのチェックリスト (`inventory/CheckDetail.tsx`) の2枚です。
 * 下書き → 実施中 → 完了 で進みます。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { localDateStr } from '@gmo-onair/shared/src/client/format';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { PullToRefresh } from '@gmo-onair/shared/src/client-v4/pullToRefresh';
import { INVENTORY_STATUS, statusOf } from '@gmo-onair/shared/src/constants/statuses';
import { CheckDetail } from './inventory/CheckDetail';
import { InventoryCards } from './inventory/InventoryCards';

interface InventoryCheck {
  id: string;
  title: string;
  check_date: string;
  status: string;
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-transparent',
  in_progress: 'bg-info-surface text-info border-transparent',
  completed: 'bg-success-surface text-success border-transparent',
};

// UTC の日付 (toISOString) だと JST の 0〜9 時に前日になる
const today = () => localDateStr(new Date());

export default function InventoryPage() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', check_date: today(), notes: '' });

  const list = useQuery({
    queryKey: ['inventory-checks'],
    queryFn: async () => (await api.get('/equipment/inventory-checks')).data.data as InventoryCheck[],
  });
  const checks = list.data ?? [];

  const create = useMutation({
    mutationFn: (payload: typeof form) => api.post('/equipment/inventory-checks', payload),
    onSuccess: (res: { data: { data: { id: string } } }) => {
      qc.invalidateQueries({ queryKey: ['inventory-checks'] });
      qc.invalidateQueries({ queryKey: ['equipment-stats'] });
      setDialogOpen(false);
      setSelected(res.data.data.id);
      notifySuccess('棚卸しを作りました');
    },
    onError: (e) => notifyApiError('棚卸しを作れませんでした', e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/inventory-checks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-checks'] });
      qc.invalidateQueries({ queryKey: ['equipment-stats'] });
      notifySuccess('棚卸しを削除しました');
    },
    onError: (e) => notifyApiError('削除できませんでした', e),
  });

  const onDelete = async (c: InventoryCheck) => {
    const ok = await confirmAction({
      title: `棚卸し「${c.title}」を削除しますか`,
      description: '付けた印もいっしょに消えます。取り消せません。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) remove.mutate(c.id);
  };

  if (selected) {
    return (
      <CheckDetail
        checkId={selected}
        onBack={() => setSelected(null)}
        onDeleted={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="棚卸し"
        sub="保管場所ごとに ✓ を付けて回ります。下書き → 実施中 → 完了 で進みます"
        primaryAction={
          <Button type="button" onClick={() => { setForm({ title: '', check_date: today(), notes: '' }); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />棚卸しを作成
          </Button>
        }
      />

      {list.isError ? (
        <ErrorPanel title="棚卸しを読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : checks.length === 0 ? (
        <EmptyState
          title="棚卸しがまだ1件もありません"
          description="「棚卸しを作成」を押すと、いまの機材台帳からチェックリストが作られます。"
        />
      ) : isMobile ? (
        /*
          **スマホは縦積みのカード**（`inventory/InventoryCards.tsx`）。PC の行を
          縮めたものではない — カード積みは `HoldCards` / `LendingCards` と同じ考え方
        */
        <PullToRefresh onRefresh={list.refetch}>
          <InventoryCards
            checks={checks}
            onOpen={(id) => setSelected(id)}
            onDelete={onDelete}
            deletePending={remove.isPending}
          />
        </PullToRefresh>
      ) : (
        <div className="flex flex-col rounded-card border border-border bg-card">
          {checks.map((c) => (
            <Row key={c.id} divider interactive stackOnMobile>
              <RowMain onClick={() => setSelected(c.id)} className="cursor-pointer">
                <RowTitle>{c.title}</RowTitle>
                <RowSub>{c.check_date}</RowSub>
              </RowMain>
              <RowSlot w={96}>
                <TableBadge
                  label={statusOf(INVENTORY_STATUS, c.status).label}
                  w={null}
                  className={STATUS_TONE[c.status] ?? STATUS_TONE.draft}
                />
              </RowSlot>
              <RowSlot w={96} align="right" placeholder="">
                <span className="flex gap-1">
                  <Button type="button" variant="outline" onClick={() => setSelected(c.id)}>開く</Button>
                  <Button type="button"
                    variant="ghost" size="icon-sm" className="text-destructive"
                    aria-label={`${c.title} を削除`} disabled={remove.isPending}
                    onClick={() => onDelete(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </span>
              </RowSlot>
            </Row>
          ))}
        </div>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="棚卸しを作成"
        // Enter で作れるようにする（繰り返し入力も確認も無い単純なフォーム）。
        // **「作成」は `type="submit"` で `onClick` を持たない** — 両方あると二重送信になる。
        // キャンセルは `<form>` の中では既定が submit 扱いなので `type="button"` を明示する
        onSubmit={(e) => { e.preventDefault(); if (form.title && !create.isPending) create.mutate(form); }}
        footer={
          <FormDialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button type="submit" disabled={!form.title || create.isPending}>
              {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              作る
            </Button>
          </FormDialogFooter>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>名前 *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="2026年8月度 棚卸し（用賀）"
            />
          </div>
          <div className="space-y-1">
            <Label>実施日</Label>
            <Input type="date" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>メモ</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <p className="text-note text-muted-foreground">
            作った時点の機材台帳からチェックリストを作ります。あとから登録された機材は、
            チェックリストの画面から取り込めます。
          </p>
        </div>
      </FormDialog>
    </div>
  );
}
