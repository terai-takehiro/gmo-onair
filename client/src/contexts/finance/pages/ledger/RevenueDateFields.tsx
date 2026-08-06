/**
 * 売上ダイアログの「日付・前金・請求書発行済・備考」（③ 売上）
 *
 * **`RevenueDialog` から切り出したものです。動きは変えていません。**
 * 分けた理由は1ファイル400行の上限で、中身の作り直しではありません。
 *
 * 計上月を入れると請求予定日（その月末）と入金予定日（翌月末）が入ります。
 * **上書きします** — 先に日付を直してから計上月を変えると消えるので、
 * 順番に気をつける必要があります（旧実装からの持ち越し）。
 */
import { localDateStr } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export function RevenueDateFields({
  recognitionMonth, setRecognitionMonth, billingDate, setBillingDate,
  paymentDueDate, setPaymentDueDate, isAdvancePayment, setIsAdvancePayment,
  invoiceIssued, setInvoiceIssued, notes, setNotes,
}: {
  recognitionMonth: string;
  setRecognitionMonth: (v: string) => void;
  billingDate: string;
  setBillingDate: (v: string) => void;
  paymentDueDate: string;
  setPaymentDueDate: (v: string) => void;
  isAdvancePayment: boolean;
  setIsAdvancePayment: (v: boolean) => void;
  invoiceIssued: boolean;
  setInvoiceIssued: (v: boolean) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label>計上月</Label>
          <Input
            type="month"
            value={recognitionMonth}
            onChange={(e) => {
              setRecognitionMonth(e.target.value);
              if (e.target.value) {
                const [y, m] = e.target.value.split('-').map(Number);
                setBillingDate(localDateStr(new Date(y, m, 0)));
                setPaymentDueDate(localDateStr(new Date(y, m + 1, 0)));
              }
            }}
          />
        </div>
        <div className="space-y-1">
          <Label>請求予定日</Label>
          <Input type="date" value={billingDate} onChange={(e) => setBillingDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>入金予定日</Label>
          <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="is-advance-payment" className="cursor-pointer">前金</Label>
        <Switch id="is-advance-payment" checked={isAdvancePayment}
          onCheckedChange={(v) => setIsAdvancePayment(!!v)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="invoice-issued" className="cursor-pointer">請求書発行済</Label>
        <Switch id="invoice-issued" checked={invoiceIssued}
          onCheckedChange={(v) => setInvoiceIssued(!!v)} />
      </div>

      <div className="space-y-1">
        <Label>備考</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="備考" rows={3} />
      </div>
    </>
  );
}
