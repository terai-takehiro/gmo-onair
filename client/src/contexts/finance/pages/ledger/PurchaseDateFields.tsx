/**
 * 仕入の「役務提供完了日・計上月・支払予定日」（④ 仕入のダイアログの中身）
 *
 * **`PurchaseDialog` から切り出したものです。JSX を1文字も変えずに移しています。**
 * 分けた理由は1ファイル400行の上限（`client/CLAUDE.md`）で、日付欄の作り直しでは
 * ありません。**この回で組み直した並び順もそのまま**です。
 *
 * まとまりの意味は「**いつの仕入か**」（`docs/design/v4/_form-order.md` 段3）。
 * 3つの日付が連動する（役務提供完了日を入れると計上月＝当月・支払予定日＝翌月末、
 * 土日祝は前営業日）ので、**同じ枠に入れて1つの塊として読ませる**。
 * 連動の計算はここが持ち、値そのものは親（`PurchaseDialog`）の state に残す
 * — 送信 payload を組むのは親のままなので、state を下ろすと2か所に散る。
 *
 * ⚠️ `readOnly`（案件詳細から閲覧だけで開く）は親と同じく `disabled` で受ける。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { localDateStr } from '@/lib/format';
import { previousBusinessDay } from '@gmo-onair/shared/src/utils/businessDays';

export function PurchaseDateFields({
  serviceCompletedDate, setServiceCompletedDate,
  recognitionMonth, setRecognitionMonth,
  paymentDueDate, setPaymentDueDate,
  readOnly,
}: {
  serviceCompletedDate: string;
  setServiceCompletedDate: (v: string) => void;
  recognitionMonth: string;
  setRecognitionMonth: (v: string) => void;
  paymentDueDate: string;
  setPaymentDueDate: (v: string) => void;
  readOnly: boolean;
}) {
  return (
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
          disabled={readOnly}
        />
        <p className="text-note mt-0.5 text-muted-foreground">
          入力すると計上月（当月）・支払予定日（翌月末、土日祝は前営業日）を自動入力します
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>計上月</Label>
          <Input type="month" value={recognitionMonth} onChange={(e) => setRecognitionMonth(e.target.value)} disabled={readOnly} />
        </div>
        <div>
          <Label>支払予定日</Label>
          <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} disabled={readOnly} />
        </div>
      </div>
    </div>
  );
}
