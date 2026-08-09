/**
 * 案件一覧の「実施日の期間」（`client/.../projectList/period.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * 期間の絞り込みは**間違っても画面では気づけません**。「8月の案件」を選んで
 * 3件しか出なくても、それが正しいのか範囲がずれているのかは、
 * 一覧を見ているだけでは分かりません（出ない案件は見えないので）。
 *
 * とくに**月末の出し方**は旧実装が `-31` を固定で書いており、
 * 文字列比較なので **2月末の案件が範囲から外れて**いました。
 */
import { describe, it, expect } from 'vitest';
import {
  defaultPeriod, switchMode, step, range, label, options, toValue, fromValue,
} from '../../client/src/contexts/sales/pages/projectList/period';

describe('既定は「半年（いま属する期）」', () => {
  it('1〜6月は上期', () => {
    expect(defaultPeriod(new Date(2026, 0, 15))).toEqual({ mode: 'half', year: 2026, index: 1 });
    expect(defaultPeriod(new Date(2026, 5, 30))).toEqual({ mode: 'half', year: 2026, index: 1 });
  });
  it('7〜12月は下期', () => {
    expect(defaultPeriod(new Date(2026, 6, 1))).toEqual({ mode: 'half', year: 2026, index: 2 });
    expect(defaultPeriod(new Date(2026, 11, 31))).toEqual({ mode: 'half', year: 2026, index: 2 });
  });
});

describe('範囲（サーバーに送る YYYY-MM-DD）', () => {
  it('月は月末を正しく出す（2月・うるう年）', () => {
    expect(range({ mode: 'month', year: 2026, index: 2 })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(range({ mode: 'month', year: 2024, index: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
  it('月は 30 日で終わる月も正しい', () => {
    expect(range({ mode: 'month', year: 2026, index: 4 })).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });
  it('四半期は3か月', () => {
    expect(range({ mode: 'quarter', year: 2026, index: 3 })).toEqual({ from: '2026-07-01', to: '2026-09-30' });
  });
  it('半年は6か月', () => {
    expect(range({ mode: 'half', year: 2026, index: 1 })).toEqual({ from: '2026-01-01', to: '2026-06-30' });
    expect(range({ mode: 'half', year: 2026, index: 2 })).toEqual({ from: '2026-07-01', to: '2026-12-31' });
  });
  it('年は12か月', () => {
    expect(range({ mode: 'year', year: 2026, index: 1 })).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('全件は絞らない', () => {
    expect(range({ mode: 'all', year: 2026, index: 1 })).toBeNull();
  });
});

describe('単位を変えても、いま見ている範囲を含む対象に寄る', () => {
  it('8月 → 四半期 は 3Q（1Q に飛ばない）', () => {
    expect(switchMode({ mode: 'month', year: 2026, index: 8 }, 'quarter'))
      .toEqual({ mode: 'quarter', year: 2026, index: 3 });
  });
  it('8月 → 半年 は 下期', () => {
    expect(switchMode({ mode: 'month', year: 2026, index: 8 }, 'half'))
      .toEqual({ mode: 'half', year: 2026, index: 2 });
  });
  it('下期 → 月 は 7月（その期の先頭）', () => {
    expect(switchMode({ mode: 'half', year: 2026, index: 2 }, 'month'))
      .toEqual({ mode: 'month', year: 2026, index: 7 });
  });
  it('同じ単位なら何もしない', () => {
    const v = { mode: 'month', year: 2026, index: 8 } as const;
    expect(switchMode(v, 'month')).toBe(v);
  });
});

describe('◀ ▶ は年をまたぐ', () => {
  it('12月の次は翌年1月', () => {
    expect(step({ mode: 'month', year: 2026, index: 12 }, 1)).toEqual({ mode: 'month', year: 2027, index: 1 });
  });
  it('1月の前は前年12月', () => {
    expect(step({ mode: 'month', year: 2026, index: 1 }, -1)).toEqual({ mode: 'month', year: 2025, index: 12 });
  });
  it('下期の次は翌年の上期', () => {
    expect(step({ mode: 'half', year: 2026, index: 2 }, 1)).toEqual({ mode: 'half', year: 2027, index: 1 });
  });
  it('4Q の次は翌年 1Q', () => {
    expect(step({ mode: 'quarter', year: 2026, index: 4 }, 1)).toEqual({ mode: 'quarter', year: 2027, index: 1 });
  });
  it('年は年そのものを動かす', () => {
    expect(step({ mode: 'year', year: 2026, index: 1 }, 1)).toEqual({ mode: 'year', year: 2027, index: 1 });
  });
  it('全件は動かない', () => {
    const v = { mode: 'all', year: 2026, index: 1 } as const;
    expect(step(v, 1)).toEqual(v);
  });
});

describe('表示（指示書 4-3 の表そのまま）', () => {
  it('単位ごとに具体値で出す', () => {
    expect(label({ mode: 'month', year: 2026, index: 8 })).toBe('2026年8月');
    expect(label({ mode: 'quarter', year: 2026, index: 3 })).toBe('2026年 3Q');
    expect(label({ mode: 'half', year: 2026, index: 2 })).toBe('2026年 下期（7〜12月）');
    expect(label({ mode: 'half', year: 2026, index: 1 })).toBe('2026年 上期（1〜6月）');
    expect(label({ mode: 'year', year: 2026, index: 1 })).toBe('2026年');
    expect(label({ mode: 'all', year: 2026, index: 1 })).toBe('指定なし');
  });
});

describe('プルダウンの値の出し入れ', () => {
  const now = new Date(2026, 7, 9);
  it('いま選んでいる対象が候補に必ずある', () => {
    const v = { mode: 'month', year: 2026, index: 8 } as const;
    expect(options(v, now).some((o) => o.value === toValue(v))).toBe(true);
  });
  it('候補に無い年（4年前）を選んでいても候補に足される', () => {
    const v = { mode: 'year', year: 2019, index: 1 } as const;
    expect(options(v, now).some((o) => o.value === '2019:1')).toBe(true);
  });
  it('選ぶと年と対象だけが変わる（単位は変わらない）', () => {
    const v = { mode: 'quarter', year: 2026, index: 3 } as const;
    expect(fromValue(v, '2025:1')).toEqual({ mode: 'quarter', year: 2025, index: 1 });
  });
  it('読めない値は今のまま（画面が壊れない）', () => {
    const v = { mode: 'month', year: 2026, index: 8 } as const;
    expect(fromValue(v, 'x:y')).toEqual(v);
    expect(fromValue(v, 'all')).toEqual(v);
  });
});
