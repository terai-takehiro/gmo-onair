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
 * `PurchaseListPage.tsx`（`purchaseState`）・`SgaListPage.tsx`（`sgaState`）・
 * 財務ダッシュボードの内訳（`financeDashboard/breakdownItems.ts`）がこの関数を呼ぶ。
 * **ここを直せば3か所すべてに効く。**
 *
 * ⚠️ **以前ここには「内訳はこの2ページの行を読んでいるのでそちらにも効く」と
 * 書いてあったが、事実と違った。** 内訳は台帳のコンポーネントを再利用しておらず、
 * 自前で行を組み立てている。そのため 3値へ揃えたはずが内訳だけ「仮」の2値のまま
 * 取り残され、「確定：未申請」と「確定：申請済」が同じ見た目になっていた
 * （ご指摘）。内訳側から**この関数を直接呼ぶ**ように直してある。
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

/**
 * 狭い列（財務ダッシュボードの内訳）用の短いラベル。**意味は変えない**。
 *
 * 内訳は lg で3枚並ぶ（1枚あたり実効 ~360px）ので、「確定：未申請」（6字）は
 * `TableBadge` の固定幅 62px に収まらず自然幅（約90px）になり、金額と挟んで
 * 件名を潰す。ラベルを画面ごとに書き分けると必ず片方が古くなるので、
 * **短くする規則もここに1つだけ置く**（`title` は元の文言のまま出す）。
 */
export function compactSettlementLabel(label: string): string {
  return label.replace('確定：', '');
}
