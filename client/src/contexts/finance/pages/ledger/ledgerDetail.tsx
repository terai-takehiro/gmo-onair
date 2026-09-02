/**
 * スマホの詳細シートに出す項目を、3つの台帳ぶんまとめて作る (v4)
 *
 * ── なぜ1ファイルか ────────────────────────────────────────
 *
 * カードは業務の優先順に4つ（コード・計上月／金額／見出し／相手先・状態）しか
 * 出しません。**捨てるのは列であって情報ではない**ので、落とした値
 * （税区分・支払期日・備考・精算番号など）はここで詰め直し、タップで開く
 * シートに出します。3つの台帳で「どの値を落として良いか」の判断は同じ性格の
 * ものなので、離して置くと片方だけ項目が増えます。
 *
 * ⚠️ **呼ぶのは各ページの `ledgerRows` の `useMemo` の中**（`types.ts` の
 * `detail` の説明）。外で呼ぶと20行ぶんを毎レンダリング作り直します。
 *
 * ⚠️ 400行に近づいたら `ledgerDetail/{revenue,purchase,sga}.tsx` に分けること
 * （`scripts/check-file-size.mjs`）。
 */
// ⚠️ 税区分はここに入れない — 詳細シートの金額の塊が「税抜 ・ 10%課税」で
// 既に出している（同じ値を1枚の中に2回出すと、片方だけ直されて食い違う）
import { monthFull, ymd } from './format';
import type { LedgerDetailField, RevenueRow } from './types';

/** 「ある／ない」の2値。**空欄にしない** — 出ていないのか無いのかが読めなくなる */
function yesNo(on: boolean | null | undefined, yes: string, no: string): string {
  return on ? yes : no;
}

/** 文字が無いときは `—`（`0` や `false` を消さないよう、文字列だけに使う） */
function textOr(value: string | null | undefined): string {
  return value && value.trim() ? value : '—';
}

/**
 * ③ 売上。**請求の予定日と入金の予定日を並べて出す** — カードには入らないが、
 * 外で「いつ入るか」を訊かれたときに見るのはこの2つ。
 */
export function revenueDetailFields(r: RevenueRow): LedgerDetailField[] {
  return [
    { label: '計上月', value: monthFull(r.recognition_date) },
    { label: '請求先', value: textOr(r.customer_name) },
    { label: '請求予定日', value: ymd(r.billing_date) },
    { label: '入金予定日', value: ymd(r.payment_due_date) },
    { label: '入金日', value: ymd(r.paid_date) },
    { label: '請求書', value: yesNo(r.invoice_issued, '発行済', 'まだ出していません') },
    { label: '前金', value: yesNo(r.is_advance_payment, 'あり', 'なし') },
    { label: '検収', value: ymd(r.inspection_date) },
    { label: '備考', value: textOr(r.notes) },
  ];
}
