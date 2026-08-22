/**
 * グループ仕入の登録・編集ダイアログ (v4)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { SettlementMethod, SettlementMethodLabels, TaxCategory, TaxCategoryLabels, type Vendor } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { AllocationEditor } from './AllocationEditor';
import { useAllocation } from './useAllocation';
import type { GroupDetail, GroupPurchase } from './types';

export function PurchaseDialog({
  groupId, members, editing, onClose,
}: {
  groupId: string;
  members: GroupDetail['members'];
  /** 直す仕入。`null` なら新規 */
  editing: GroupPurchase | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState(editing?.vendor_id ?? '');
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [desc, setDesc] = useState(editing?.description ?? '');
  const [tax, setTax] = useState(editing?.tax_category ?? 'tax10');
  const [settlement, setSettlement] = useState(editing?.settlement_method ?? 'rakuraku');
  const [settlementNo, setSettlementNo] = useState(editing?.settlement_number ?? '');
  const [recDate, setRecDate] = useState(editing?.recognition_date?.slice(0, 10) ?? '');
  const alloc = useAllocation(members, amount, editing?.allocations);

  const { data } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
  });
  const vendors: Vendor[] = data?.data ?? [];

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        vendor_id: vendorId, amount, description: desc || null, tax_category: tax,
        settlement_method: settlement, settlement_number: settlementNo || null,
        invoice_qualified: true, recognition_date: recDate || null,
        allocations: alloc.toPayload(),
      };
      return editing
        ? (await api.put(`/project-groups/${groupId}/purchases/${editing.id}`, payload)).data
        : (await api.post(`/project-groups/${groupId}/purchases`, payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-group-detail', groupId] });
      qc.invalidateQueries({ queryKey: ['purchases-all'] });
      notifySuccess(editing ? '仕入を更新しました' : '仕入を登録しました');
      onClose();
    },
    onError: (err) => notifyApiError('仕入の保存に失敗しました', err),
  });

  const invalidAlloc = alloc.mode === 'custom' && alloc.previewTotal !== amount;

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={editing ? 'グループ仕入編集' : 'グループ仕入登録'}
      size="lg"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!vendorId || !amount || saveMutation.isPending || invalidAlloc}>
            {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {editing ? '更新' : '登録'}
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>仕入先 *</Label>
          <SearchableSelect
            options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
            value={vendorId} onChange={setVendorId} placeholder="仕入先を検索..."
          />
        </div>
        <div>
          <Label>金額 *</Label>
          <CurrencyInput value={amount} onChange={setAmount} />
        </div>
        <div>
          <Label>説明</Label>
          <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="仕入の説明" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>税区分</Label>
            <Select value={tax} onValueChange={setTax}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((k) => <SelectItem key={k} value={k}>{TaxCategoryLabels[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>精算方法</Label>
            <Select value={settlement} onValueChange={setSettlement}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((k) => <SelectItem key={k} value={k}>{SettlementMethodLabels[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>精算番号</Label>
            <Input value={settlementNo} onChange={(e) => setSettlementNo(e.target.value)} placeholder="任意" />
          </div>
          <div>
            <Label>計上日</Label>
            <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} />
          </div>
        </div>
        <AllocationEditor label="仕入金額" alloc={alloc} total={amount} />
      </div>
    </FormDialog>
  );
}
