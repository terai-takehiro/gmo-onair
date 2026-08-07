/**
 * PDF から読み取った内容（参照用・書き換えられない） (⑦ 取り込み・v4)
 *
 * **人が原本と突き合わせるための面**です。ここを編集できるようにすると
 * 「PDF に何と書いてあったか」が残らなくなり、あとで数字を疑えなくなります。
 *
 * ── 読み取り % は「数えられるもの」で出す ────────────────────
 *
 * モックは「読み取り 98% / 74%（80未満は橙）」を出します。ただし解析は
 * 正規表現のパーサで、機械学習の確信度のようなものは持っていません。
 * **数字をそれらしく真似ることはしません。** 代わりに
 * **台帳に入れるのに要る項目のうち何個読めたか**を出します
 * （`scoreXpoint` / `scoreRakuraku`）。同じ PDF なら必ず同じ数字になります。
 *
 * **% の隣に「何が読めなかったか」を必ず出す。** 74% とだけ書かれても、
 * 何を直せばよいのかが分かりません。
 */
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { settlementPrefix, type ParseScore, type XpointParseResult } from './types';

/**
 * 読み取りの確からしさ。**80 未満を橙にする**（モックの決め）。
 * 100% でも「税率は 10% と仮定」の警告は別に出るので、緑＝そのまま登録してよい、ではない。
 */
function ScoreBar({ score }: { score: ParseScore }) {
  const low = score.score < 80;
  return (
    <div
      className={`rounded-control-lg flex flex-wrap items-center gap-x-3 gap-y-1 border p-3 ${
        low ? 'border-warning-border bg-warning-surface' : 'border-border bg-muted'
      }`}
    >
      <span className="text-sub-sm text-muted-foreground">読み取り</span>
      <span className={`font-number text-h3 ${low ? 'text-warning' : 'text-success'}`}>
        {score.score}<span className="text-sub-sm">%</span>
      </span>
      <span className="text-sub-sm text-muted-foreground">
        要る項目 <span className="font-number">{score.total}</span> のうち{' '}
        <span className="font-number">{score.filled}</span> 個を読めました
      </span>
      {score.missing.length > 0 && (
        <span className="text-sub-sm min-w-0 flex-1 text-warning">
          読めなかったもの: <strong className="font-bold">{score.missing.join(' / ')}</strong>
        </span>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-note">
      <span className="text-muted-foreground">{label}: </span>
      {children}
    </div>
  );
}

export function PdfExtracted({ result }: { result: XpointParseResult }) {
  const p = result.parsed;
  const v = result.voucher;
  const prefix = settlementPrefix(result.format);
  const allDup = [...result.duplicates.purchases, ...result.duplicates.sga];

  return (
    <>
      <ScoreBar score={result.score} />

      {p && (
        <div className="rounded-control-lg border border-border bg-muted p-3">
          <p className="text-sub-sm mb-1 font-bold text-secondary-foreground">PDF から読み取った内容（参照用）</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <Field label="件名">{p.subject || '—'}</Field>
            <Field label="取引先">{p.vendorCode ? `${p.vendorCode} ` : ''}{p.vendorName || '—'}</Field>
            <Field label="支払金額（税込）">
              {p.amountInclusive != null ? formatCurrency(p.amountInclusive) : '—'}
              {p.paymentMethod ? `（${p.paymentMethod}）` : ''}
            </Field>
            <Field label="科目">{p.account || '—'}</Field>
            <Field label="申請日">{p.applicationDate || '—'}{p.applicantName ? `（${p.applicantName}）` : ''}</Field>
            <Field label="納期／期間">{p.servicePeriodStart || '—'} 〜 {p.servicePeriodEnd || '—'}</Field>
            <Field label="支払予定日">{p.paymentDueDate || '—'}</Field>
            <Field label="計上日（経理欄）">{p.recognitionDate || '—'}</Field>
            <Field label="適格事業者番号">{p.invoiceNumber || '—'}</Field>
            <Field label="GLS 番号">{p.glsNumber || '—'}</Field>
          </div>
        </div>
      )}

      {v && (
        <div className="rounded-control-lg flex flex-col gap-2 border border-border bg-muted p-3">
          <p className="text-sub-sm font-bold text-secondary-foreground">PDF から読み取った内容（参照用）</p>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <Field label="伝票No">{v.denpyoNumber || '—'}{v.headerNumber ? `（管理番号 ${v.headerNumber}）` : ''}</Field>
            <Field label="申請者">{v.applicantName || '—'}{v.applicationDate ? `（申請日 ${v.applicationDate}）` : ''}</Field>
            <Field label="合計 精算額（税込）">{v.totalInclusive != null ? formatCurrency(v.totalInclusive) : '—'}</Field>
            <Field label="明細数">{v.items.length} 行 → {result.units.length} 登録単位</Field>
          </div>
          <div className="overflow-x-auto">
            <table className="text-note w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-0.5 pr-2 font-normal">No</th>
                  <th className="py-0.5 pr-2 font-normal">日付</th>
                  <th className="py-0.5 pr-2 font-normal">税区分</th>
                  <th className="py-0.5 pr-2 text-right font-normal">金額（税込）</th>
                  <th className="py-0.5 font-normal">用途</th>
                </tr>
              </thead>
              <tbody>
                {v.items.map((it) => (
                  <tr key={it.no} className="border-t border-border-subtle">
                    <td className="py-0.5 pr-2">{it.no}</td>
                    <td className="whitespace-nowrap py-0.5 pr-2">{it.date || '—'}</td>
                    <td className="whitespace-nowrap py-0.5 pr-2">{it.taxLabel}</td>
                    <td className="font-number whitespace-nowrap py-0.5 pr-2 text-right">{formatCurrency(it.amountInclusive)}</td>
                    <td className="py-0.5">{it.usage || it.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(result.warnings.length > 0 || allDup.length > 0) && (
        <div className="rounded-control-lg flex flex-col gap-1 border border-warning-border bg-warning-surface p-3">
          {allDup.length > 0 && (
            <p className="text-note flex items-start gap-1 font-bold text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              精算番号 {prefix}-{result.settlementNumber} は既に
              {result.duplicates.purchases.length > 0 ? ` 仕入 ${result.duplicates.purchases.length} 件` : ''}
              {result.duplicates.purchases.length > 0 && result.duplicates.sga.length > 0 ? '・' : ''}
              {result.duplicates.sga.length > 0 ? ` 販管費 ${result.duplicates.sga.length} 件` : ''}
              {' '}に登録されています。二重登録に注意してください。
            </p>
          )}
          {allDup.map((d) => (
            <p key={d.id} className="text-note pl-5 text-destructive">
              既存: {d.vendor_name || '—'} / {formatCurrency(d.amount)} / 計上 {d.recognition_date || '—'} / {d.description || ''}
            </p>
          ))}
          {result.warnings.map((w) => (
            <p key={w} className="text-note flex items-start gap-1 text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{w}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
