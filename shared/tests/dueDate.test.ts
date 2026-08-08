import { describe, it, expect } from 'vitest';
import {
  daysInMonth, closingDateOf, dueDateOf, mergeRule, describeRule,
} from '../../server/src/shared/services/dueDate';

const MONTH_END = { closingDay: 31, paymentMonths: 1, paymentDay: 31 };

describe('daysInMonth', () => {
  it('うるう年の2月は29日', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it('30日の月と31日の月', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe('closingDateOf', () => {
  it('月末締めはその月の末日', () => {
    expect(closingDateOf('2026-08-08', 31)).toBe('2026-08-31');
    // **2月に31日は無いので末日へ丸める。** 丸めないと2月だけ締めが消える
    expect(closingDateOf('2026-02-10', 31)).toBe('2026-02-28');
  });
  it('締め日より後の売上は翌月の締めになる', () => {
    expect(closingDateOf('2026-08-25', 20)).toBe('2026-09-20');
    expect(closingDateOf('2026-08-20', 20)).toBe('2026-08-20');
  });
  it('12月をまたぐと年が繰り上がる', () => {
    expect(closingDateOf('2026-12-25', 20)).toBe('2027-01-20');
  });
  it('読めない日付は null（推測で日付を作らない）', () => {
    expect(closingDateOf('', 31)).toBeNull();
    expect(closingDateOf('2026/08/08', 31)).toBeNull();
  });
});

describe('dueDateOf', () => {
  it('月末締め・翌月末払い', () => {
    expect(dueDateOf('2026-08-08', MONTH_END)).toBe('2026-09-30');
  });
  it('翌月末が2月なら28日に丸まる', () => {
    expect(dueDateOf('2026-01-15', MONTH_END)).toBe('2026-02-28');
  });
  it('年をまたぐ', () => {
    expect(dueDateOf('2026-12-01', MONTH_END)).toBe('2027-01-31');
  });
  it('当月払い（0か月後）', () => {
    expect(dueDateOf('2026-08-08', { closingDay: 20, paymentMonths: 0, paymentDay: 25 })).toBe('2026-08-25');
  });
  it('2か月後', () => {
    expect(dueDateOf('2026-11-05', { closingDay: 31, paymentMonths: 2, paymentDay: 10 })).toBe('2027-01-10');
  });
  it('締め日を過ぎた売上は1か月ぶん後ろへずれる', () => {
    // 20日締め・翌月末。8/25 の売上は 9/20 締め → 10/31
    expect(dueDateOf('2026-08-25', { closingDay: 20, paymentMonths: 1, paymentDay: 31 })).toBe('2026-10-31');
    expect(dueDateOf('2026-08-19', { closingDay: 20, paymentMonths: 1, paymentDay: 31 })).toBe('2026-09-30');
  });
  it('読めない日付は null', () => {
    expect(dueDateOf('なし', MONTH_END)).toBeNull();
  });
});

describe('mergeRule', () => {
  it('例外が無ければ会社のルールのまま', () => {
    expect(mergeRule(MONTH_END, null)).toEqual(MONTH_END);
    expect(mergeRule(MONTH_END, {})).toEqual(MONTH_END);
  });
  it('項目ごとに重なる（支払日だけ例外）', () => {
    expect(mergeRule(MONTH_END, { paymentDay: 20 }))
      .toEqual({ closingDay: 31, paymentMonths: 1, paymentDay: 20 });
  });
  it('例外が効いて期日が変わる', () => {
    const r = mergeRule(MONTH_END, { paymentMonths: 2 });
    expect(dueDateOf('2026-08-08', r)).toBe('2026-10-31');
  });
  it('0 は「決めていない」ではない（0か月後として効く）', () => {
    const r = mergeRule(MONTH_END, { paymentMonths: 0 });
    expect(r.paymentMonths).toBe(0);
    expect(dueDateOf('2026-08-08', r)).toBe('2026-08-31');
  });
});

describe('describeRule', () => {
  it('月末締め・翌月末', () => {
    expect(describeRule(MONTH_END)).toBe('末日締め ・ 翌月末日');
  });
  it('20日締め・当月25日', () => {
    expect(describeRule({ closingDay: 20, paymentMonths: 0, paymentDay: 25 })).toBe('20日締め ・ 当月25日');
  });
  it('2か月後', () => {
    expect(describeRule({ closingDay: 31, paymentMonths: 2, paymentDay: 10 })).toBe('末日締め ・ 2か月後10日');
  });
});
