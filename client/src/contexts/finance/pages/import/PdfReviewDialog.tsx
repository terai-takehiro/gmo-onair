/**
 * 精算 PDF の内容を確かめて台帳に入れる (⑦ 取り込み・v4)
 *
 * 1 単位 = 仕入 or 販管費の 1 レコード。楽楽精算は 1 伝票が
 * （種別 × GLS × 税区分）ごとに複数単位へ割れるので、1 単位ずつ確かめて登録します。
 * **自動では登録しません** — すべての項目が人の目を通ってから確定します。
 *
 * 送るボディは旧実装（`XpointImportPage.tsx` の `XpointReviewDialog`）と同じです。
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Check } from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Button } from '@/components/ui/button';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { TaxCategoryLabels } from '@/types';
import { PdfExtracted } from './PdfExtracted';
import { PdfReviewForm, taxDivisor, type PdfFormState } from './PdfReviewForm';
import { settlementPrefix, type XpointFileRow, type XpointParseResult } from './types';

const EMPTY: PdfFormState = {
  kind: 'purchase', taxCategory: 'tax10', amount: 0, description: '', notes: '',
  projectId: '', vendorId: '', createVendor: false, recognitionMonth: '',
  serviceCompletedDate: '', isProvisional: false, vendorName: '', recognitionDate: '',
  settlementNumber: '', invoiceQualified: 'qualified', paymentDueDate: '',
};

export function PdfReviewDialog({
  file, result, onClose, onRegistered,
}: {
  file: XpointFileRow;
  result: XpointParseResult;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const p = result.parsed;
  const v = result.voucher;
  const units = result.units;
  const isRakuraku = result.format === 'rakuraku';
  const prefix = settlementPrefix(result.format);

  // 登録済み単位（開き直したとき registered_records から戻す）
  const doneFromServer = useMemo(
    () => new Set((file.registered_records || []).map((r) => r.unit_index)),
    [file.registered_records],
  );
  const [registeredUnits, setRegisteredUnits] = useState<Set<number>>(() => {
    const s = new Set<number>();
    for (const r of file.registered_records || []) if (typeof r.unit_index === 'number') s.add(r.unit_index);
    return s;
  });
  const firstOpen = units.findIndex((_, i) => !doneFromServer.has(i));
  const [unitIdx, setUnitIdx] = useState(firstOpen >= 0 ? firstOpen : 0);
  const unit = units[unitIdx];

  const [f, setF] = useState<PdfFormState>({
    ...EMPTY,
    settlementNumber: result.settlementNumber || '',
    invoiceQualified: p ? (p.invoiceQualified ? 'qualified' : 'unqualified') : 'qualified',
    paymentDueDate: p?.paymentDueDate || '',
    vendorId: result.match.vendor?.id || '',
  });
  const set = <K extends keyof PdfFormState>(k: K, value: PdfFormState[K]) =>
    setF((prev) => ({ ...prev, [k]: value }));

  // 単位が切り替わったら、その単位の読み取り値でフォームを入れ直す
  useEffect(() => {
    if (!unit) return;
    setF((prev) => {
      const base = {
        ...prev,
        kind: (unit.kind === 'sga' ? 'sga' : 'purchase') as 'purchase' | 'sga',
        taxCategory: unit.taxCategory,
        amount: unit.amountExclusive,
        projectId: unit.project?.id || '',
        recognitionMonth: unit.recognitionDate ? unit.recognitionDate.slice(0, 7) : '',
        recognitionDate: unit.recognitionDate || '',
        description: unit.description || p?.description || p?.subject || '',
      };
      if (isRakuraku && v) {
        const items = v.items.filter((it) => unit.itemNos.includes(it.no));
        return {
          ...base,
          serviceCompletedDate: unit.recognitionDate || '',
          vendorName: v.applicantName ? `${v.applicantName}（立替精算）` : '',
          notes: [
            `[楽楽精算取込] ${file.file_name} / 伝票No.${v.denpyoNumber || '?'} / 申請者: ${v.applicantName || '?'}`,
            ...items.map((it) => `No.${it.no} ${it.date || ''} ${it.usage || it.body} ${formatCurrency(it.amountInclusive)}(税込)`),
          ].join('\n'),
        };
      }
      return {
        ...base,
        serviceCompletedDate: p?.servicePeriodEnd || '',
        vendorName: p?.vendorName || '',
        notes: [`[X-Point取込] ${file.file_name}`, p?.subject, p?.account, ...(p?.detailLines || [])]
          .filter(Boolean).join('\n'),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIdx]);

  const register = useMutation({
    mutationFn: async () => {
      const willComplete = registeredUnits.size + 1 >= units.length;
      const common = {
        tax_category: f.taxCategory,
        settlement_method: result.settlementMethod,
        settlement_number: f.settlementNumber || null,
        invoice_qualified: f.invoiceQualified === 'qualified' ? 1 : 0,
        amount: f.amount,
        description: f.description || null,
        notes: f.notes || null,
        payment_due_date: f.paymentDueDate || null,
      };
      const newVendor = f.createVendor && !f.vendorId && p?.vendorName
        ? { name: p.vendorName, invoice_registration_number: p.invoiceNumber || null }
        : undefined;
      const body = f.kind === 'purchase'
        ? {
            kind: f.kind, unit_index: unitIdx, complete: willComplete, new_vendor: newVendor,
            purchase: {
              ...common,
              project_id: f.projectId,
              vendor_id: f.vendorId || null,
              recognition_date: f.recognitionMonth ? `${f.recognitionMonth}-01` : null,
              service_completed_date: f.serviceCompletedDate || null,
              is_provisional: f.isProvisional,
            },
          }
        : {
            kind: f.kind, unit_index: unitIdx, complete: willComplete, new_vendor: newVendor,
            sga: {
              ...common,
              vendor_name: f.vendorName || null,
              vendor_id: f.vendorId || null,
              recognition_date: f.recognitionDate,
              expense_type: 'spot',
            },
          };
      await api.post(`/xpoint/files/${file.id}/register`, body);
      return { willComplete };
    },
    onSuccess: ({ willComplete }) => {
      if (willComplete) { onRegistered(); return; }
      setRegisteredUnits((prev) => {
        const next = new Set(prev);
        next.add(unitIdx);
        const nextIdx = units.findIndex((_, i) => !next.has(i));
        if (nextIdx >= 0) setUnitIdx(nextIdx);
        return next;
      });
    },
    onError: (err) => notifyApiError('台帳に登録できませんでした', err),
  });

  const canSubmit = useMemo(() => {
    if (f.amount <= 0) return false;
    if (registeredUnits.has(unitIdx)) return false;
    if (f.kind === 'purchase') return !!f.projectId && (!!f.vendorId || (f.createVendor && !!p?.vendorName));
    return !!f.recognitionDate && !!f.vendorName;
  }, [f, p?.vendorName, registeredUnits, unitIdx]);

  return (
    <FormDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={isRakuraku ? '楽楽精算の内容を確かめる' : 'X-Point 申請の内容を確かめる'}
      // **2カラムの複合フォーム（PdfReviewForm）＋ 明細表（PdfExtracted）を持つので `wide` を渡す。**
      // 旧幅は sm:max-w-3xl（768px）で既定の640pxを超えていた
      wide
      sub={`${result.settlementNumber ? `${prefix}-${result.settlementNumber} ・ ` : ''}${file.file_name}`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={() => register.mutate()} disabled={!canSubmit || register.isPending}>
            {register.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {registeredUnits.has(unitIdx)
              ? 'この単位は登録済み'
              : units.length > 1
                ? `この単位を${f.kind === 'purchase' ? '仕入' : '販管費'}に入れる（${registeredUnits.size + 1}/${units.length}）`
                : f.kind === 'purchase' ? '仕入に入れる' : '販管費に入れる'}
          </Button>
        </FormDialogFooter>
      }
    >
        <PdfExtracted result={result} />

        {/* 登録単位のステップ（楽楽精算で複数単位のとき） */}
        {units.length > 1 && (
          <div className="flex flex-col gap-1">
            <p className="text-sub-sm font-bold text-secondary-foreground">
              登録単位（税区分・案件ごとに {units.length} 件に分けて登録します）
            </p>
            <div className="flex flex-wrap gap-2">
              {units.map((u, i) => {
                const done = registeredUnits.has(i);
                return (
                  <button
                    key={`${u.taxCategory}-${u.glsNumber ?? 'none'}-${i}`}
                    type="button"
                    onClick={() => setUnitIdx(i)}
                    aria-pressed={i === unitIdx}
                    className={`rounded-control-lg min-h-tap border px-3 text-left lg:min-h-[40px] ${
                      i === unitIdx ? 'border-primary bg-primary-surface-weak' : 'border-border bg-card'
                    } ${done ? 'opacity-70' : ''}`}
                  >
                    <span className="text-note flex items-center gap-1 font-bold">
                      {done && <Check className="h-3 w-3 text-success" aria-hidden="true" />}
                      単位 {i + 1}: {u.kind === 'sga' ? '販管費' : '仕入'}
                      {' / '}{TaxCategoryLabels[u.taxCategory as keyof typeof TaxCategoryLabels] || u.taxCategory}
                    </span>
                    <span className="text-note block text-muted-foreground">
                      {u.glsNumber || 'GLS なし'} ・ 税込 {formatCurrency(u.amountInclusive)}
                      {' → '}税抜 {formatCurrency(Math.round(u.amountInclusive / taxDivisor(u.taxCategory)))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <PdfReviewForm f={f} set={set} result={result} unit={unit} />
    </FormDialog>
  );
}
