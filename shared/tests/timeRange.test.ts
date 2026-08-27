import { describe, it, expect } from 'vitest';
import { isReversedTimeRange } from '../../server/src/shared/utils/timeRange';

describe('isReversedTimeRange（予約・予定の end < start を弾く）', () => {
  it('終わりが始まりより前なら true', () => {
    expect(isReversedTimeRange('2026-08-27T18:00', '2026-08-27T09:00')).toBe(true);
    expect(isReversedTimeRange('2026-08-27', '2026-08-26')).toBe(true);
  });
  it('順序が正しければ false（同時刻＝0分も許す。壊れているのは逆転だけ）', () => {
    expect(isReversedTimeRange('2026-08-27T09:00', '2026-08-27T18:00')).toBe(false);
    expect(isReversedTimeRange('2026-08-27T09:00', '2026-08-27T09:00')).toBe(false);
    expect(isReversedTimeRange('2026-08-27', '2026-08-29')).toBe(false);
  });
  it('日をまたぐ正しい順序も false', () => {
    expect(isReversedTimeRange('2026-08-27T22:00', '2026-08-28T02:00')).toBe(false);
  });
  it('欠けている・文字列でない値は判定しない（別の必須チェックに任せる）', () => {
    expect(isReversedTimeRange('', '2026-08-27')).toBe(false);
    expect(isReversedTimeRange('2026-08-27', '')).toBe(false);
    expect(isReversedTimeRange(undefined, undefined)).toBe(false);
    expect(isReversedTimeRange(null, '2026-08-27')).toBe(false);
  });
});
