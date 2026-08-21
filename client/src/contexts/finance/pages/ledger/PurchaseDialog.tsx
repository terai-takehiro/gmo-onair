/**
 * 仕入の登録・編集ダイアログ（④ 仕入）
 *
 * **旧 `PurchaseListPage` から切り出したものです。入力欄も送る値も変えていません。**
 * 一覧の作り直しと、金額を扱うフォームの作り直しを同じ回でやらないためです。
 *
 * 変えたのは2点だけ:
 * ・削除の確認を `window.confirm` から共通の確認ダイアログに変えた
 *   （`check-ui-tokens` が `window.confirm` を止めます。文面も「何が消えるか」を出す形に）
 * ・生の色指定を同じ意味のトークンに置き換えた
 */
import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { localDateStr } from '@/lib/format';
import { previousBusinessDay } from '@gmo-onair/shared/src/utils/businessDays';
import { TaxHelperButton } from '@gmo-onair/shared/src/client/ui/tax-aware-amount-input';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FormDialog } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  TaxCategoryLabels, SettlementMethodLabels,
  type TaxCategory, type SettlementMethod, type Vendor,
} from '@/types';
import type { PurchaseRow } from './types';

export interface PurchaseProjectOption {
  id: string;
  /** 受注確定済みでも案件分類未設定の古いデータでは空のことがある（v4.1.8） */
  gls_number: string | null;
  name: string;
}

export function PurchaseDialog({
  editing, defaultProjectId, projects, vendors, saving, deleting, onSave, onDelete, onClose,
}: {
  editing: PurchaseRow | null;
  /** 案件で絞り込んで見ているときの初期値 */
  defaultProjectId: string;
  projects: PurchaseProjectOption[];
  vendors: Vendor[];
  saving: boolean;
  deleting: boolean;
  onSave: (payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(editing?.project_id || defaultProjectId || '');
  const [vendorId, setVendorId] = useState(editing?.vendor_id || '');
  const [taxCategory, setTaxCategory] = useState(editing?.tax_category || 'tax10');
  const [settlementMethod, setSettlementMethod] = useState(editing?.settlement_method || 'rakuraku');
  const [settlementNumber, setSettlementNumber] = useState(
    editing?.settlement_number && editing.settlement_number !== 'pending' ? editing.settlement_number : '',
  );
  const [settlementUrl, setSettlementUrl] = useState(editing?.settlement_url || '');
  const [invoiceQualified, setInvoiceQualified] = useState(editing?.invoice_qualified ? 'qualified' : 'unqualified');
  const [amount, setAmount] = useState<number>(editing?.amount || 0);
  const [description, setDescription] = useState(editing?.description || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [serviceCompletedDate, setServiceCompletedDate] = useState('');
  const [recognitionMonth, setRecognitionMonth] = useState(editing?.recognition_date?.slice(0, 7) || '');
  const [paymentDueDate, setPaymentDueDate] = useState(editing?.payment_due_date?.slice(0, 10) || '');
  const [isProvisional, setIsProvisional] = useState(!!editing?.is_provisional);

  // 新規のとき、案件で絞り込んでいればその案件を初期値にする
  useEffect(() => {
    if (!editing && defaultProjectId) setSelectedProjectId(defaultProjectId);
  }, [editing, defaultProjectId]);

  const handleDelete = async () => {
    if (!editing) return;
    const ok = await confirmAction({
      title: 'この仕入を消しますか',
      description: `${editing.vendor_name ?? '仕入先なし'}「${editing.description ?? '説明なし'}」を消します。元に戻せません。`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (ok) onDelete(editing.id);
  };

  const handleSubmit = () => {
    if (!selectedProjectId || !vendorId) return;
    onSave({
      project_id: selectedProjectId,
      vendor_id: vendorId,
      tax_category: taxCategory,
      settlement_method: settlementMethod,
      settlement_number: settlementNumber || null,
      settlement_url: settlementUrl || null,
      invoice_qualified: invoiceQualified === 'qualified' ? 1 : 0,
      amount,
      description: description || null,
      notes: notes || null,
      service_completed_date: serviceCompletedDate || null,
      recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
      payment_due_date: paymentDueDate || null,
      is_provisional: isProvisional,
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={editing ? '仕入を直す' : '仕入を登録'}
      footer={
        <div className="flex gap-2 sm:justify-between">
          <div>
            {editing && (
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                消す
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>やめる</Button>
            <Button disabled={!selectedProjectId || !vendorId || saving} onClick={handleSubmit}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editing ? '更新' : '登録'}
            </Button>
          </div>
        </div>
      }
    >
        <div className="space-y-4">
          <div>
            <Label>案件 *</Label>
            <SearchableSelect
              options={projects.map((p) => ({ value: p.id, label: `${p.gls_number || 'GLS未発番'} ${p.name}` }))}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              placeholder="GLS番号・案件名で検索..."
            />
            <p className="text-note mt-1 text-muted-foreground">
              受注（A 受注済）以降の案件だけが選べます。
              複数案件への按分は「按分グループ」から登録してください
            </p>
          </div>

          <div>
            <Label>仕入先 *</Label>
            <SearchableSelect
              options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
              value={vendorId}
              onChange={setVendorId}
              placeholder="仕入先を検索..."
            />
          </div>

          <div>
            <Label>金額</Label>
            <div className="flex items-center gap-1">
              <div className="flex-1"><CurrencyInput value={amount} onChange={setAmount} /></div>
              <TaxHelperButton fieldLabel="仕入金額" defaultIncludedAmount={amount} onResult={setAmount} />
            </div>
          </div>

          <div>
            <Label>説明</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="仕入の説明"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="is-provisional" className="cursor-pointer">仮（確定前の見込み仕入）</Label>
            <Switch id="is-provisional" checked={isProvisional} onCheckedChange={(v) => setIsProvisional(!!v)} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>税区分</Label>
              <Select value={taxCategory} onValueChange={setTaxCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                    <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>精算方法</Label>
              <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((key) => (
                    <SelectItem key={key} value={key}>{SettlementMethodLabels[key]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-note border p-3">
            <div>
              <Label>役務提供完了日</Label>
              <Input
                type="date"
                value={serviceCompletedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setServiceCompletedDate(val);
                  if (val) {
                    const [y, m] = val.split('-').map(Number);
                    setRecognitionMonth(`${y}-${String(m).padStart(2, '0')}`);
                    // v2.8.103+: 翌月末が土日祝のときは前営業日に調整
                    setPaymentDueDate(localDateStr(previousBusinessDay(new Date(y, m + 1, 0))));
                  }
                }}
              />
              <p className="text-note mt-0.5 text-muted-foreground">
                入力すると計上月（当月）・支払予定日（翌月末、土日祝は前営業日）を自動入力します
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>計上月</Label>
                <Input type="month" value={recognitionMonth} onChange={(e) => setRecognitionMonth(e.target.value)} />
              </div>
              <div>
                <Label>支払予定日</Label>
                <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>精算番号</Label>
              <Input value={settlementNumber} onChange={(e) => setSettlementNumber(e.target.value)} placeholder="任意" />
            </div>
            <div>
              <Label>申請URL</Label>
              <Input
                type="url"
                value={settlementUrl}
                onChange={(e) => setSettlementUrl(e.target.value)}
                placeholder="精算申請ページのURL（任意）"
              />
            </div>
          </div>

          <div>
            <Label>インボイス</Label>
            <Select value={invoiceQualified} onValueChange={setInvoiceQualified}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="qualified">適格事業者</SelectItem>
                <SelectItem value="unqualified">非適格事業者</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>備考</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="任意" rows={2} />
          </div>
        </div>
    </FormDialog>
  );
}
