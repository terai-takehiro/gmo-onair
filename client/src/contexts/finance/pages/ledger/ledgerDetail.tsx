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
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { SettlementMethodLabels, type SettlementMethod } from '@/types';
import { formatSettlementNo } from '../../components/SgaDialog';
import { monthFull, ymd } from './format';
import type { LedgerDetailField, PurchaseRow, RevenueRow, SgaLedgerItem } from './types';

/** 「ある／ない」の2値。**空欄にしない** — 出ていないのか無いのかが読めなくなる */
export function yesNo(on: boolean | null | undefined, yes: string, no: string): string {
  return on ? yes : no;
}

/** 文字が無いときは `—`（`0` や `false` を消さないよう、文字列だけに使う） */
export function textOr(value: string | null | undefined): string {
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
    { label: '按分グループ', value: textOr(p.group_name) },
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

/**
 * 精算の申請番号。**方法（X-Point ／ 楽楽精算）の接頭辞を付けて出す** —
 * 経理はこの形のまま突き合わせるので、番号だけだとどちらの精算システムを
 * 見ればよいか分からない（`formatSettlementNo` は一覧・ダイアログと同じもの）。
 *
 * `pending` は「番号待ち」の符丁で、実の番号ではない（`settlementState.ts`）。
 */
function settlementText(item: SgaLedgerItem): string {
  if (item.settlement_number === 'pending') return '番号待ち（申請はこれから）';
  const no = formatSettlementNo(item.settlement_method ?? '', item.settlement_number ?? '');
  if (no) return no;
  const method = item.settlement_method
    ? SettlementMethodLabels[item.settlement_method as SettlementMethod] ?? item.settlement_method
    : null;
  // 番号が無い＝まだ申請していない。**空欄にしない**（出ていないのか無いのかが読めなくなる）
  return method ? `まだ申請していません（${method}）` : 'まだ申請していません';
}

/**
 * スマホの詳細シートに出す項目。**カードが出さない値の行き先**。
 *
 * カードは4つ（精算番号・発生月／金額／詳細／支払先・申請ステータス）しか
 * 出さないが、**捨てるのは列であって情報ではない**ので、落とした値をここへ移す。
 * 販管費は案件に紐づかないぶん、経理が突き合わせに使う値（勘定科目・精算番号・
 * 支払期日）を上のほうに置いている。
 *
 * ⚠️ 税区分は入れない — 詳細シートの金額の塊が「税抜 ・ 10%課税」で既に出している
 * （同じ値を1枚の中に2回出すと、片方だけ直されて食い違う）。
 */
export function sgaDetailFields(item: SgaLedgerItem): LedgerDetailField[] {
  return [
    { label: '発生月', value: monthFull(item.recognition_date) },
    { label: '支払先', value: textOr(item.vendor_name) },
    // 166 より前の行は科目を持たない。**「未設定」と書く**（空にすると
    // 「読み込めていない」と区別が付かない・`SgaListPage.tsx` の冒頭）
    { label: '勘定科目', value: item.account_title_name || '未設定' },
    { label: '費用の種類', value: item.expense_type === 'fixed' ? '固定費' : '都度' },
    { label: '入れた人', value: item.source === 'accounting' ? '経理の取込' : '社員が入れた' },
    { label: '精算', value: settlementText(item) },
    { label: '支払期日', value: ymd(item.payment_due_date) },
    { label: 'インボイス', value: item.invoice_qualified ? '登録あり' : '登録なし' },
    {
      // **「按分」は開かずにそのまま出す**（2026-09-05 の用語棚卸し）。会計の標準語で、
      // 開くと「按分グループ」と「費用を分け合うグループ」のように同じものに名前が2つできる。
      // 月をまたいで分けている費用だけが値を持ち、それ以外は `—` になる
      label: '按分の期間',
      value: (
        // 期間は文字列で組み立てない（開始・区切り・終了を分ける部品を使う）。
        // 分け方の欄は `<input type="month">` なので `2026-04` の形で来る
        <DateRange
          start={item.amortize_start ? monthFull(item.amortize_start) : null}
          end={item.amortize_end ? monthFull(item.amortize_end) : null}
        />
      ),
    },
    { label: '備考', value: textOr(item.notes) },
  ];
}
