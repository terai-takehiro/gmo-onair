/**
 * 仕入・販管費の「申請ステータス」を1本にまとめたもの (仕様変更 #4・#6・#7)
 *
 * 旧実装は仕入だけ「仮」「確定」の2値、販管費は精算の進み具合を表示していなかった。
 * ここでは両方に共通する3値へ揃える:
 *
 *   ① 仮フラグ ON                              → 「仮」
 *   ② 仮フラグ OFF・精算番号（`settlement_number`）未入力 → 「確定：未申請」
 *   ③ 仮フラグ OFF・精算番号入力済み             → 「確定：申請済」
 *
 * `PurchaseListPage.tsx`（`purchaseState`）・`SgaListPage.tsx`（`sgaState`）の
 * 両方がこの関数を呼ぶ。**ここを直せば両方の台帳に効く**（財務ダッシュボードの
 * 内訳もこの2ページの行を読んでいるので、そちらにも効く）。
 */
import type { LedgerState } from './types';

/**
 * `settlement_number` に実の値が入っているか。**`pending`（番号待ちの符丁）は
 * 「まだ番号が無い」ので実の値として数えない** — 販管費の一覧は `pending` を
 * 「番号待ち」という表示専用の符丁として使っており（`SgaListPage.tsx`）、
 * ここで実値と誤認すると「未申請」なのに「申請済」と出てしまう。
 */
function hasSettlementNumber(n: string | null | undefined): boolean {
  return !!n && n !== 'pending';
}

export function settlementState(
  isProvisional: boolean,
  settlementNumber: string | null | undefined,
): LedgerState {
  if (isProvisional) {
    return {
      label: '仮',
      tone: 'warn',
      title: 'まだ金額が確定していません。精算が通ると確定に変わります',
    };
  }
  if (hasSettlementNumber(settlementNumber)) {
    return { label: '確定：申請済', tone: 'ok', title: '精算を申請済みです' };
  }
  return { label: '確定：未申請', tone: 'neutral', title: 'まだ精算を申請していません' };
}
