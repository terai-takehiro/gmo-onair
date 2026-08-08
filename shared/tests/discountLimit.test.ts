import { describe, it, expect } from 'vitest';
import { checkDiscount, NO_LIMIT, type DiscountLimit } from '../../server/src/shared/services/discountLimit';

// モックの「営業担当 … 10％ / 1,500,000」
const SALES: DiscountLimit = { maxRate: 0.10, maxAmount: 1_500_000, canEstimate: true };

describe('checkDiscount', () => {
  it('上限なしは何をしても通る', () => {
    expect(checkDiscount(10_000_000, 9_000_000, NO_LIMIT).needsApproval).toBe(false);
  });

  it('率が上限ちょうどは通る', () => {
    const r = checkDiscount(1_000_000, 100_000, SALES);
    expect(r.rate).toBeCloseTo(0.1);
    expect(r.needsApproval).toBe(false);
  });

  it('率が上限を1円ぶん超えたら承認が要る', () => {
    const r = checkDiscount(1_000_000, 100_001, SALES);
    expect(r.needsApproval).toBe(true);
    expect(r.reasons[0]).toContain('値引き率');
  });

  it('率は範囲内でも額が上限を超えたら承認が要る', () => {
    // 20,000,000 の 8% = 1,600,000 → 率は 10% 以内だが額が 150万を超える
    const r = checkDiscount(20_000_000, 1_600_000, SALES);
    expect(r.rate).toBeCloseTo(0.08);
    expect(r.needsApproval).toBe(true);
    expect(r.reasons.join()).toContain('値引き額');
  });

  it('両方超えたら理由が2つ出る', () => {
    expect(checkDiscount(10_000_000, 5_000_000, SALES).reasons).toHaveLength(2);
  });

  it('値引き 0 は常に通る', () => {
    expect(checkDiscount(10_000_000, 0, SALES).needsApproval).toBe(false);
    expect(checkDiscount(0, 0, SALES).needsApproval).toBe(false);
  });

  it('小計 0 で値引きだけあるのは素通りさせない', () => {
    // 明細を入れる前に値引きだけ入れた見積。率を 0 とみなすと上限を抜けてしまう
    const r = checkDiscount(0, 500_000, SALES);
    expect(r.rate).toBe(1);
    expect(r.needsApproval).toBe(true);
  });

  it('上限 0％ は「1円も値引けない」であって「上限なし」ではない', () => {
    const zero: DiscountLimit = { maxRate: 0, maxAmount: 0, canEstimate: true };
    expect(checkDiscount(1_000_000, 1, zero).needsApproval).toBe(true);
    expect(checkDiscount(1_000_000, 0, zero).needsApproval).toBe(false);
  });

  it('小数の誤差で 10％ ちょうどが弾かれない', () => {
    // 0.1 は2進で表せないので、素の > 比較だと通るはずのものが止まる
    expect(checkDiscount(3_000_000, 300_000, SALES).needsApproval).toBe(false);
    expect(checkDiscount(7_000_000, 700_000, SALES).needsApproval).toBe(false);
  });

  it('マイナスの値引きは 0 として扱う（増額に化けさせない）', () => {
    expect(checkDiscount(1_000_000, -50_000, SALES).needsApproval).toBe(false);
  });
});
