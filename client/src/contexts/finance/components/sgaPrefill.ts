/**
 * 販管費ダイアログの初期値の決め方（⑤ 販管費）
 *
 * **`SgaDialog.tsx` から切り出した1関数だけのファイルです。** 分けた理由は
 * 1ファイル400行の上限 — `SgaDialog.tsx` は元から 400 行の際どいところにあり、
 * readOnly（仕様変更 #3）を足すだけで確実に超えるため、`revenuePrefill.ts`
 * （③ 売上・同じ理由の切り出し）に倣ってここへ出した。
 *
 * `formFromSga` は「行（`SgaExpense`）→ 編集フォームの初期値（`SgaFormData`）」の
 * マッピングで、**`SgaListPage`（一覧の行を直す）が呼ぶ**。財務ダッシュボードの
 * 内訳の行は `?edit=<id>` を付けてこの画面へ遷移するだけ（`BudgetDashboardPage.tsx`）
 * で、`formFromSga` 自体は直接は呼ばない ── 遷移した先で `SgaListPage` の
 * `?edit=` ハンドラがこの関数を通して編集ダイアログを開く。
 * ⚠️ 以前この節は「`BudgetDashboardPage` が閲覧専用ダイアログのために直接呼ぶ」
 * 旨だったが、そのダイアログはコミット 7914d63 で廃止済み。写すと片方だけ
 * 直った画面ができるので、マッピングは引き続きこの1か所にまとめてある。
 */
import type { SgaExpense } from '@/types';
import type { SgaFormData } from './SgaDialog';

/**
 * `fallbackAssignedTo` は「担当者が入っていない古い行を直しに来たとき、まず
 * 自分を入れておく」ための初期値（`SgaListPage` の旧実装のまま）。
 * 閲覧だけのときは渡さなくてよい（渡さなければ空のまま＝担当者欄には何も出ない）。
 */
export function formFromSga(item: SgaExpense, fallbackAssignedTo = ''): SgaFormData {
  const pending = item.settlement_number === 'pending';
  return {
    vendor_name: item.vendor_name ?? '',
    vendor_id: item.vendor_id ?? '',
    tax_category: item.tax_category ?? 'tax10',
    recognition_date: item.recognition_date?.slice(0, 10) ?? '',
    settlement_method: item.settlement_method ?? 'xpoint',
    settlement_number: pending ? '' : (item.settlement_number ?? ''),
    settlement_number_pending: pending,
    settlement_url: item.settlement_url ?? '',
    amount: item.amount ?? 0,
    description: item.description ?? '',
    notes: item.notes ?? '',
    invoice_qualified: item.invoice_qualified ?? true,
    payment_due_date: item.payment_due_date?.slice(0, 10) ?? '',
    assigned_to: item.assigned_to ?? fallbackAssignedTo,
    expense_type: item.expense_type ?? 'spot',
    account_title_id: (item as { account_title_id?: string | null }).account_title_id ?? '',
    amortize_enabled: !!item.amortize_start,
    amortize_start: item.amortize_start ?? '',
    amortize_end: item.amortize_end ?? '',
    source: item.source || 'staff',
    is_provisional: item.is_provisional ?? false,
  };
}
