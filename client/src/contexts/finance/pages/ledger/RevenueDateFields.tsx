/**
 * 売上ダイアログの「日付・前金・検収・請求書発行済・備考」（③ 売上）
 *
 * **`RevenueDialog` から切り出したものです。**
 * 分けた理由は1ファイル400行の上限で、日付欄の中身の作り直しではありません
 * （検収のトグルだけは仕様変更 #5 で新規に足したもの）。
 *
 * 計上月を入れると請求予定日（その月末）と入金予定日（翌月末）が入ります。
 * **上書きします** — 先に日付を直してから計上月を変えると消えるので、
 * 順番に気をつける必要があります（旧実装からの持ち越し）。
 *
 * ── 検収は真偽フラグではなく `inspection_date`（仕様変更 #5）────────
 *
 * 検収は「済んだかどうか」だけでなく「いつ済んだか」が要る（migration 140の
 * コメント参照）ため、フラグを新設せず**既存の日付列**を使う。トグルを
 * ONにすると当日の日付を入れ、OFFにすると `null` に戻す。
 * **表示順序は 前金 → 検収 → 請求書発行済**（ご指定）。
 *
 * ⚠️ **検収だけは押した瞬間に保存される**（前金・請求書発行済は「更新」を
 * 押すまで待つ）。`POST/PUT /revenues` が `inspection_date` を受け取らない
 * ため — 検収の読み書きは `⑤ 見積・請求` と共用の `PATCH /billing/invoices/:id`
 * だけの役目（`billing.routes.ts` 参照）。同じ列を書く口を増やさず、
 * **既にある口をこの部品の中から直接呼ぶ**（1ファイル400行の上限との兼ね合いで
 * `RevenueDialog.tsx` 側を太らせない）。保存前の新規売上（`revenueId` が空）は
 * まだ対象の行が無いので押せない。
 *
 * ⚠️ **見込み（`status='estimate'`）の売上では検収を記録できません。**
 * サーバー（`billing.routes.ts` の `PATCH /billing/invoices/:id`）が
 * 「確定した売上だけ」で弾くためです。以前はその条件を画面が知らず、
 * `onError` も無かったので**押すとスイッチが黙って戻るだけ**でした
 * （案件詳細の売上・請求ペインは見込みの行も並べるので日常的に起きる）。
 * いまは押せない理由を先に出し、それでも失敗したら通知を出します。
 */
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export function RevenueDateFields({
  recognitionMonth, setRecognitionMonth, billingDate, setBillingDate,
  paymentDueDate, setPaymentDueDate, isAdvancePayment, setIsAdvancePayment,
  revenueId, inspectionDate, status, onInspectionSaved,
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
  /** 直している売上の id。**空なら未保存**（検収はまだ記録できない） */
  revenueId: string;
  /** migration 140。**フラグではなく日付**（入っていれば済み） */
  inspectionDate: string | null;
  /**
   * 直している売上の状態（`confirmed` / `estimate`）。**サーバーが確定した行しか
   * 受け付けない**ので、見込みの行では押せない理由を先に出すために要る。
   * 分からないとき（新規登録）は未指定でよい — その場合は `revenueId` の有無で判断する
   */
  status?: string;
  /** 保存に成功したら呼ばれる（`RevenueDialog.tsx` 側で state 反映 ＋ 関連キャッシュの再読込） */
  onInspectionSaved: (v: string | null) => void;
  invoiceIssued: boolean;
  setInvoiceIssued: (v: boolean) => void;
  notes: string;
  setNotes: (v: string) => void;
}) {
  const inspectionMutation = useMutation({
    mutationFn: (value: string | null) =>
      api.patch(`/billing/invoices/${revenueId}`, { inspection_date: value }),
    onSuccess: (_r, value) => onInspectionSaved(value),
    // **黙って戻さない。** 失敗を伝えないと「押しても保存できない」に見える
    onError: (err) => notifyApiError('検収を記録できませんでした', err),
  });
  // サーバー（`billing.routes.ts`）の条件とそろえる。**押してから断られるのをやめる**
  const inspectionBlocked = !revenueId
    ? '先に登録すると記録できます'
    : status && status !== 'confirmed'
      ? '確定した売上だけ記録できます'
      : undefined;
  // 立てるのだけ止める（消すのは通す）。`invoiceIssued` が既に true なら押せる
  const issueBlocked = !invoiceIssued && status && status !== 'confirmed'
    ? '確定した売上だけ記録できます'
    : undefined;

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

      {/* 表示順序: 前金 → 検収 → 請求書発行済（ご指定） */}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="is-advance-payment" className="cursor-pointer">前金</Label>
        <Switch id="is-advance-payment" checked={isAdvancePayment}
          onCheckedChange={(v) => setIsAdvancePayment(!!v)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <Label htmlFor="inspection-date" className={inspectionBlocked ? undefined : 'cursor-pointer'}>
            検収
            {/* 済んだ日を出す。**「いつ」が分からないと確認に使えない**
                （⑤ 見積・請求の `InvoiceRows.tsx` の `MarkCell` と同じ考え方） */}
            {inspectionDate && (
              <span className="font-number ml-2 text-note text-muted-foreground">
                {inspectionDate.slice(0, 10)}
              </span>
            )}
          </Label>
          {/* ⚠️ 枠は残して常に一言そえる — 押せない Switch だけ置くと理由が分からず、
              押せるときは**保存の仕方が他と違う**ことを知らせる必要がある
              （前金・請求書発行済は「更新」を押すまで待つのに、検収だけ即時） */}
          <span className="text-note text-muted-foreground">
            （{inspectionBlocked ?? '押すとすぐ保存されます'}）
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          {inspectionMutation.isPending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          <Switch
            id="inspection-date"
            checked={!!inspectionDate}
            disabled={!!inspectionBlocked || inspectionMutation.isPending}
            title={inspectionBlocked}
            onCheckedChange={(v) => inspectionMutation.mutate(v ? localDateStr(new Date()) : null)}
          />
        </span>
      </div>

      {/* 請求書発行済も**確定した売上だけ**（サーバー `PUT /revenues/:id` と同じ条件）。
          立てた瞬間に請求書番号が採られる印なので、見込みの行では立てさせない。
          **消すほうは止めない** — 間違って立った印を消せなくなる */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex flex-col">
          <Label htmlFor="invoice-issued" className={issueBlocked ? undefined : 'cursor-pointer'}>請求書発行済</Label>
          {issueBlocked && <span className="text-note text-muted-foreground">（{issueBlocked}）</span>}
        </span>
        <Switch id="invoice-issued" checked={invoiceIssued} disabled={!!issueBlocked} title={issueBlocked}
          onCheckedChange={(v) => setInvoiceIssued(!!v)} />
      </div>

      <div className="space-y-1">
        <Label>備考</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="備考" rows={3} />
      </div>
    </>
  );
}
