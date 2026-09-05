/**
 * 仕入・販管費の「申請ステータス」を1本にまとめたもの (仕様変更 #4・#6・#7)
 *
 * 旧実装は仕入だけ「仮」「確定」の2値、販管費は精算の進み具合を表示していなかった。
 * ここでは両方に共通する3値へ揃える:
 *
 *   ① 仮フラグ ON                              → 「金額はまだ仮」
 *   ② 仮フラグ OFF・精算番号（`settlement_number`）未入力 → 「金額確定・精算まだ」
 *   ③ 仮フラグ OFF・精算番号入力済み             → 「金額確定・精算申請済」
 *
 * ⚠️ **「確定」単独では書かない。** 売上の「売上確定」・予約の「本予約にする」と
 * 語が衝突して、同じ画面群の中で「確定」が3つの意味を持つため。ここは
 * **金額が確定したのか、精算まで出したのか**の2段を必ず言い切る（用語の決めごと）。
 *
 * `PurchaseListPage.tsx`（`purchaseState`）・`SgaListPage.tsx`（`sgaState`）・
 * 財務ダッシュボードの内訳（`financeDashboard/breakdownItems.ts`）がこの関数を呼ぶ。
 * **ここを直せば3か所すべてに効く。**
 *
 * ⚠️ **以前ここには「内訳はこの2ページの行を読んでいるのでそちらにも効く」と
 * 書いてあったが、事実と違った。** 内訳は台帳のコンポーネントを再利用しておらず、
 * 自前で行を組み立てている。そのため 3値へ揃えたはずが内訳だけ「仮」の2値のまま
 * 取り残され、「金額確定・精算まだ」と「金額確定・精算申請済」が同じ見た目になっていた
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
      label: '金額はまだ仮',
      tone: 'warn',
      title: 'まだ金額が確定していません。精算が通ると「金額確定」に変わります',
    };
  }
  if (hasSettlementNumber(settlementNumber)) {
    return { label: '金額確定・精算申請済', tone: 'ok', title: '金額が確定し、精算も申請済みです' };
  }
  return { label: '金額確定・精算まだ', tone: 'neutral', title: '金額は確定していますが、まだ精算を申請していません' };
}

/**
 * 狭い列（財務ダッシュボードの内訳）用の短いラベル。**意味は変えない**。
 *
 * 内訳は lg で3枚並ぶ（1枚あたり実効 ~360px）ので、「金額確定・精算まだ」は
 * `TableBadge` の固定幅 62px に収まらず自然幅になり、金額と挟んで件名を潰す。
 * ラベルを画面ごとに書き分けると必ず片方が古くなるので、**短くする規則も
 * ここに1つだけ置く**（`title` は元の文言のまま出すので意味は落ちない）。
 *
 * 落とすのは頭の「金額確定・」だけ＝残るのは「精算申請済」「精算まだ」で、
 * **どちらも金額確定側だと色（tone: ok / neutral）で見分けられる**。「仮」だけは
 * warn 色で別に立つので、短語と色の2つで3値が区別できる。
 */
export function compactSettlementLabel(label: string): string {
  return label.replace('金額確定・', '').replace('金額はまだ', '');
}
