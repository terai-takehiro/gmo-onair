/**
 * グループ売上の登録・編集ダイアログ (v4)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { TaxCategory, TaxCategoryLabels, type Customer } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FormDialog, FormDialogFooter, formGrid2 } from '@gmo-onair/shared/src/client-v4/formDialog';
import { AllocationEditor } from './AllocationEditor';
import { RevenueItemsEditor } from './RevenueItemsEditor';
import { useAllocation } from './useAllocation';
import { EMPTY_REVENUE_ITEM, type GroupDetail, type GroupRevenue, type RevenueItem } from './types';

export function RevenueDialog({
  groupId, members, editing, onClose,
}: {
  groupId: string;
  members: GroupDetail['members'];
  /** 編集する売上。`null` なら新規 */
  editing: GroupRevenue | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState(editing?.customer_id ?? '');
  const [tax, setTax] = useState(editing?.tax_category ?? 'tax10');
  const [subtitle, setSubtitle] = useState(editing?.subtitle ?? '');
  const [recDate, setRecDate] = useState(editing?.recognition_date?.slice(0, 10) ?? '');
  const [billingDate, setBillingDate] = useState(editing?.billing_date?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [status, setStatus] = useState<'estimate' | 'confirmed'>((editing?.status as 'estimate' | 'confirmed') ?? 'confirmed');
  const [items, setItems] = useState<RevenueItem[]>(
    editing?.items && editing.items.length > 0 ? editing.items : [{ ...EMPTY_REVENUE_ITEM }],
  );
  const total = items.reduce((s, it) => s + it.amount, 0);
  const alloc = useAllocation(members, total, editing?.allocations);

  const { data } = useQuery({
    queryKey: ['customers-list'],
    queryFn: async () => (await api.get('/customers?limit=200')).data,
  });
  const customers: Customer[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        customer_id: customerId, tax_category: tax, subtitle: subtitle || null,
        recognition_date: recDate || null, billing_date: billingDate || null,
        notes: notes || null, status,
        items: items.filter((it) => it.description || it.amount),
        allocations: alloc.toPayload(),
      };
      return editing
        ? (await api.put(`/project-groups/${groupId}/revenues/${editing.id}`, payload)).data
        : (await api.post(`/project-groups/${groupId}/revenues`, payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-group-detail', groupId] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      qc.invalidateQueries({ queryKey: ['project-groups'] });
      notifySuccess(editing ? '売上を更新しました' : '売上を登録しました');
      onClose();
    },
    onError: (err) => notifyApiError('売上を保存できませんでした', err, '入力内容を確かめて、もう一度お試しください。'),
  });

  const invalidAlloc = alloc.mode === 'custom' && alloc.previewTotal !== total;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={editing ? 'グループ売上編集' : 'グループ売上登録'}
      size="lg"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!customerId || total <= 0 || saveMutation.isPending || invalidAlloc}>
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? '更新' : '登録'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>顧客 *</Label>
          <SearchableSelect
            options={customers.map((c) => ({ value: c.id, label: c.name, subLabel: c.short_name || '' }))}
            value={customerId} onChange={setCustomerId} placeholder="顧客を検索…"
          />
        </div>
        <div>
          <Label>件名</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="見積件名" />
        </div>

        {/*
          **金額の実体（明細）と按分を、伝票の属性より上に置く**
          （`docs/design/v4/_form-order.md`「自動計算は材料になる欄より下」）。
          登録できるかどうかは明細の合計（`total > 0`）で決まるのに、
          明細が備考のさらに下にあり、上から埋めると
          ステータス・税区分・日付・備考という**後で決まる／任意のもの**を
          先に触ってから金額に着く形でした。按分は明細の合計に依存するので
          明細のすぐ下です（グループ仕入のダイアログとも同じ並びになります）。
        */}
        <RevenueItemsEditor items={items} setItems={setItems} total={total} />
        <AllocationEditor label="売上金額" alloc={alloc} total={total} />

        <div className={formGrid2}>
          <div>
            <Label>ステータス</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as 'estimate' | 'confirmed')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="estimate">見積</SelectItem>
                <SelectItem value="confirmed">確定</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>税区分</Label>
            <Select value={tax} onValueChange={setTax}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((k) => <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className={formGrid2}>
          <div>
            <Label>計上日</Label>
            <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
          </div>
          <div>
            <Label>請求日</Label>
            <Input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)} />
          </div>
        </div>
        {/* 備考は任意なので最後（`_form-order.md` の段6「補足」） */}
        <div>
          <Label>備考</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="備考" />
        </div>
      </div>
    </FormDialog>
  );
}
