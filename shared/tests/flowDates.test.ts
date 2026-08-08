import { describe, it, expect } from 'vitest';
import {
  addDays, dueOf, describeOffset, sortKey,
} from '../../server/src/shared/services/flowDates';

const INTAKE = '2026-08-08';
const EVENT = '2026-11-20';

describe('addDays', () => {
  it('月をまたぐ', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
    expect(addDays('2026-09-02', -3)).toBe('2026-08-30');
  });
  it('年をまたぐ', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
    expect(addDays('2027-01-04', -5)).toBe('2026-12-30');
  });
  it('うるう年の2月をまたぐ', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
  it('読めない日付は null', () => {
    expect(addDays('2026/08/08', 1)).toBeNull();
    expect(addDays('', 1)).toBeNull();
  });
});

describe('dueOf — 受付から数える', () => {
  it('受付から 3 日', () => {
    expect(dueOf({ anchor: 'intake', offset_days: 3 }, INTAKE, EVENT)).toBe('2026-08-11');
  });
  it('**実施日が未定でも出せる**（受付があるので）', () => {
    expect(dueOf({ anchor: 'intake', offset_days: 5 }, INTAKE, null)).toBe('2026-08-13');
  });
});

describe('dueOf — 実施日から逆算する', () => {
  it('実施日の 60 日前', () => {
    expect(dueOf({ anchor: 'event', offset_days: -60 }, INTAKE, EVENT)).toBe('2026-09-21');
  });
  it('実施日 当日', () => {
    expect(dueOf({ anchor: 'event', offset_days: 0 }, INTAKE, EVENT)).toBe(EVENT);
  });
  it('実施日の翌日・14日後', () => {
    expect(dueOf({ anchor: 'event', offset_days: 1 }, INTAKE, EVENT)).toBe('2026-11-21');
    expect(dueOf({ anchor: 'event', offset_days: 14 }, INTAKE, EVENT)).toBe('2026-12-04');
  });
  it('**実施日が未定なら null**（推測の日付を作らない）', () => {
    expect(dueOf({ anchor: 'event', offset_days: -60 }, INTAKE, null)).toBeNull();
    expect(dueOf({ anchor: 'event', offset_days: 0 }, INTAKE, null)).toBeNull();
  });
  it('受付も実施日も無ければ null', () => {
    expect(dueOf({ anchor: 'intake', offset_days: 1 }, null, null)).toBeNull();
  });
});

describe('dueOf — モックの 26 工程の端', () => {
  it('いちばん早い工程（受付から1日）と、いちばん遅い工程（実施日+24日）', () => {
    expect(dueOf({ anchor: 'intake', offset_days: 1 }, INTAKE, EVENT)).toBe('2026-08-09');
    expect(dueOf({ anchor: 'event', offset_days: 24 }, INTAKE, EVENT)).toBe('2026-12-14');
  });
  it('実施日が受付より前でも計算はする（止めるのは画面の仕事）', () => {
    // 「もう終わった案件をあとから登録する」は実際にある
    expect(dueOf({ anchor: 'event', offset_days: -60 }, '2026-08-08', '2026-08-20')).toBe('2026-06-21');
  });
});

describe('describeOffset', () => {
  it('実施日からの前後', () => {
    expect(describeOffset({ anchor: 'event', offset_days: -60 })).toBe('実施日 -60 日');
    expect(describeOffset({ anchor: 'event', offset_days: 0 })).toBe('実施日 当日');
    expect(describeOffset({ anchor: 'event', offset_days: 14 })).toBe('実施日 +14 日');
  });
  it('受付から', () => {
    expect(describeOffset({ anchor: 'intake', offset_days: 3 })).toBe('受付から 3 日');
    expect(describeOffset({ anchor: 'intake', offset_days: 0 })).toBe('受付の当日');
  });
});

describe('sortKey', () => {
  it('**期限が出せないものは最後**（先頭に集めると一覧が読めない）', () => {
    const rows = [
      { due: null }, { due: '2026-09-21' }, { due: null }, { due: '2026-08-09' },
    ];
    const sorted = [...rows].sort((a, b) => sortKey(a.due).localeCompare(sortKey(b.due)));
    expect(sorted.map((r) => r.due)).toEqual(['2026-08-09', '2026-09-21', null, null]);
  });
});
