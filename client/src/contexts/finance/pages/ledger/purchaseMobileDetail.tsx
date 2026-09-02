/**
 * ④ 仕入の詳細シート（スマホ）に出す項目 (v4)
 *
 * カードは業務の優先順に4つ（GLS番号・計上月／金額／説明／案件・仕入先・状態）しか
 * 出しません。**捨てるのは列であって情報ではない**ので、落とした値
 * （精算方法・精算番号・役務提供完了日・インボイス・支払予定日・備考）は
 * ここで詰め直し、カードをタップすると開く `LedgerDetailSheet` に出します。
 *
 * ⚠️ **呼ぶのは `PurchaseListPage` の `ledgerRows` の `useMemo` の中**
 * （`types.ts` の `detail` の説明）。外で呼ぶと20行ぶんを毎レンダリング作り直します。
 *
 * ⚠️ 税区分はここに入れません — 詳細シートの金額の塊が「税抜 ・ 10%課税」で
 * 既に出しています（同じ値を1枚の中に2回出すと、片方だけ直されて食い違う）。
 *
 * ⚠️ **見出し（`dt`）は 72px 固定**（`LedgerDetailSheet`）なので、13px の文字で
 * 5文字までしか収まりません。「役務提供完了日」「支払予定日」はそのままだと
 * 2行に折り返して値と行がずれるため、**この画面だけ短い呼び名**にしてあります
 * （意味は変えない）。
 */
import { SettlementMethodLabels, type SettlementMethod } from '@/types';
import { monthFull, ymd } from './format';
import type { LedgerDetailField, PurchaseRow } from './types';

/**
 * 文字が無いときは `—`。**空欄にしない** — 出ていないのか無いのかが読めなくなる。
 *
 * ⚠️ `ledgerDetail.tsx` にも同じ形の関数（`textOr`）がありますが、そちらは
 * export されていません。**まとめるなら export して共有すること**（写しを
 * 増やさない）。
 */
function textOr(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

/**
 * 精算番号。**`pending` は「まだ番号が無い」符丁**なので、そのまま出すと
 * 英字の番号が入っているように読めます（`settlementState.ts` も実値として
 * 数えていません）。販管費の一覧と同じ「番号待ち」に置き換えます。
 */
function settlementNumberText(n: string | null | undefined): string {
  if (n === 'pending') return '番号待ち';
  return textOr(n);
}

export function purchaseDetailFields(p: PurchaseRow): LedgerDetailField[] {
  return [
    { label: '計上月', value: monthFull(p.recognition_date) },
    { label: '仕入先', value: textOr(p.vendor_name) },
    // 案件と按分グループは**別のもの**（按分グループは複数案件で分け合う費用の束）。
    // カードでは1行にまとめて出しているので、ここでは分けて出す
    { label: '案件', value: textOr(p.project_name) },
    { label: 'グループ', value: textOr(p.group_name) },
    {
      label: '精算方法',
      value: p.settlement_method
        ? (SettlementMethodLabels[p.settlement_method as SettlementMethod] ?? p.settlement_method)
        : '—',
    },
    { label: '精算番号', value: settlementNumberText(p.settlement_number) },
    // 「役務提供完了日」。**計上月・支払予定日の元になる日**なので、
    // 仮のまま残っている行を外で確かめるときに効く
    { label: '役務完了', value: ymd(p.service_completed_date) },
    { label: 'インボイス', value: p.invoice_qualified ? '適格事業者' : '非適格事業者' },
    // 「支払予定日」（`payment_due_date`）
    { label: '支払予定', value: ymd(p.payment_due_date) },
    { label: '備考', value: textOr(p.notes) },
  ];
}
