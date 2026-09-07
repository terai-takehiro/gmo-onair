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
 * ⚠️ **以前は「金額はまだ仮」「金額確定・精算まだ」「金額確定・精算申請済」という
 * 長い文言だった。** 台帳（`LedgerRows.tsx`）の状態列は固定 96px なのに対し
 * 「金額確定・精算まだ」は9文字あり、列に収まらず見切れて読めなくなっていた
 * （ご指摘「ステータスが長すぎて表示されていない事がある」）。この短い3値に
 * 直せば列の幅に収まる。**狭い列（内訳・スマホカード）向けにさらに縮める
 * `compactSettlementLabel` は不要になったので削除した** — もともとこの短い形が
 * 「以前の」表示だったため、ここを直せばどこにも収まらない文言を作らない。
 *
 * ⚠️ **「確定」単独では書かない。** 売上の「売上確定」・予約の「本予約にする」と
 * 語が衝突して、同じ画面群の中で「確定」が3つの意味を持つため。ここは
 * **金額が確定したのか、精算まで出したのか**の2段を必ず言い切る（用語の決めごと）。
 *
 * `PurchaseListPage.tsx`（`purchaseState`）・`SgaListPage.tsx`（`sgaState`）・
 * 財務ダッシュボードの内訳（`financeDashboard/breakdownItems.ts`）がこの関数を呼ぶ。
 * **ここを直せば全画面に効く。**
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
      title: 'まだ金額が確定していません。精算が通ると「確定」に変わります',
    };
  }
  if (hasSettlementNumber(settlementNumber)) {
    return { label: '確定：申請済', tone: 'ok', title: '金額が確定し、精算も申請済みです' };
  }
  return { label: '確定：未申請', tone: 'neutral', title: '金額は確定していますが、まだ精算を申請していません' };
}
