/**
 * 値引きの上限を超えているか（お金のルール ⑤）
 *
 * ── 計算だけを切り出す理由 ──────────────────────────────────
 *
 * 「20% まで」「500万まで」の判定は、**間違っても画面には何も出ません**
 * （超えているのに通ってしまうか、超えていないのに止まるか）。
 * 画面を立てずに試せるように、DB も HTTP も触らない形にしてあります。
 *
 * ── 上限なし と 0 は別物 ────────────────────────────────────
 *
 * `null` = 上限なし、`0` = 1 円も値引けない。**空欄を 0 として保存すると
 * 全員が値引きできなくなります**ので、`null` のまま持ちます。
 */

export interface DiscountLimit {
  /** 値引き率の上限 (0〜1)。null = 上限なし */
  maxRate: number | null;
  /** 承認なしで出せる値引き額。null = 上限なし */
  maxAmount: number | null;
  /** この役割は見積を作れるか */
  canEstimate: boolean;
}

export interface DiscountCheck {
  /** 承認が要るか */
  needsApproval: boolean;
  /** 実際の値引き率 (0〜1)。小計 0 のときは 0 */
  rate: number;
  /** なぜ承認が要るのか。要らないときは空 */
  reasons: string[];
}

/** 上限を決めていない役割・役割が無い人はこれ（＝止めない） */
export const NO_LIMIT: DiscountLimit = { maxRate: null, maxAmount: null, canEstimate: true };

/**
 * @param subtotal 値引き前の小計（税抜）
 * @param discount 値引き額
 */
export function checkDiscount(subtotal: number, discount: number, limit: DiscountLimit): DiscountCheck {
  const d = Math.max(0, Math.round(discount) || 0);
  const s = Math.max(0, Math.round(subtotal) || 0);
  // **小計 0 で値引きだけあるときを「率 0」で通さない。**
  // 明細を入れる前に値引きだけ入れた見積が、上限を素通りしてしまう
  const rate = s > 0 ? d / s : (d > 0 ? 1 : 0);

  const reasons: string[] = [];
  if (limit.maxRate !== null && rate > limit.maxRate + 1e-9) {
    reasons.push(`値引き率 ${(rate * 100).toFixed(1)}％ が上限 ${(limit.maxRate * 100).toFixed(0)}％ を超えています`);
  }
  if (limit.maxAmount !== null && d > limit.maxAmount) {
    reasons.push(`値引き額 ${d.toLocaleString('ja-JP')} 円 が上限 ${limit.maxAmount.toLocaleString('ja-JP')} 円 を超えています`);
  }
  return { needsApproval: reasons.length > 0, rate, reasons };
}
