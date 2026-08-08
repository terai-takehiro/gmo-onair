import { describe, it, expect } from 'vitest';
import {
  ymd, addDays, addMonths, startOfWeek, monthWeeks, weekDays,
  placeDay, hourMarks, nowTop, eventsOn, sortForList, timeLabel,
  type CalEvent,
} from '../../client/src/contexts/production/pages/calendar/calendarLayout';

const ev = (o: Partial<CalEvent> & { start: string; end: string }): CalEvent => ({
  key: o.key ?? `k-${o.start}`,
  id: o.id ?? 'x',
  layer: o.layer ?? 'studio',
  title: o.title ?? '予定',
  color: '#dc2626',
  typeLabel: '本番',
  sub: '',
  source: '',
  allDay: o.allDay ?? false,
  tentative: false,
  ...o,
});

describe('日付のこまごま', () => {
  it('ymd は地元の日付（UTC に寄せない）', () => {
    // 23:30 は UTC だと前日。`toISOString` を使うと1日ずれる
    expect(ymd(new Date(2026, 7, 8, 23, 30))).toBe('2026-08-08');
    expect(ymd(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
  it('addDays は月と年をまたぐ', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('addMonths は年をまたぐ（前にも後ろにも）', () => {
    expect(addMonths('2026-08-15', 1)).toBe('2026-09-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
    expect(addMonths('2026-03-10', -14)).toBe('2025-01-01');
  });
  it('startOfWeek は日曜', () => {
    expect(startOfWeek('2026-08-08')).toBe('2026-08-02'); // 土 → その週の日曜
    expect(startOfWeek('2026-08-02')).toBe('2026-08-02'); // 日 → そのまま
  });
});

describe('monthWeeks', () => {
  it('月の全部の日が入っている', () => {
    const w = monthWeeks('2026-08-01');
    const flat = w.flat();
    for (let d = 1; d <= 31; d++) expect(flat).toContain(`2026-08-${String(d).padStart(2, '0')}`);
  });
  it('**空の週を作らない**（5 週で収まる月は 5 行）', () => {
    // 2026-02 は日曜始まり・28 日 = ちょうど 4 週
    expect(monthWeeks('2026-02-01')).toHaveLength(4);
    expect(monthWeeks('2026-08-01')).toHaveLength(6);
  });
  it('どの週も7日で、先頭は日曜', () => {
    for (const w of monthWeeks('2026-11-01')) {
      expect(w).toHaveLength(7);
      expect(startOfWeek(w[0])).toBe(w[0]);
    }
  });
});

describe('weekDays', () => {
  it('日曜から7日', () => {
    expect(weekDays('2026-08-05')).toEqual([
      '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08',
    ]);
  });
});

const DAY = '2026-08-08';

describe('placeDay — 位置', () => {
  it('10:00–18:00 は上から 2/14、高さ 8/14', () => {
    const [p] = placeDay([ev({ start: `${DAY}T10:00`, end: `${DAY}T18:00` })], DAY);
    expect(p.top).toBeCloseTo((2 / 14) * 100, 3);
    expect(p.height).toBeCloseTo((8 / 14) * 100, 3);
    expect(p.left).toBe(0);
    expect(p.width).toBe(100);
  });
  it('**表示の外から始まる予定を捨てない**（端で切って印を付ける）', () => {
    const [p] = placeDay([ev({ start: `${DAY}T07:00`, end: `${DAY}T09:00` })], DAY);
    expect(p.top).toBe(0);
    expect(p.height).toBeCloseTo((1 / 14) * 100, 3);
    expect(p.cutTop).toBe(true);
    expect(p.cutBottom).toBe(false);
  });
  it('22:00 をまたぐ予定も出て、下が切れている印が付く', () => {
    const [p] = placeDay([ev({ start: `${DAY}T21:00`, end: `${DAY}T23:30` })], DAY);
    expect(p.cutBottom).toBe(true);
    expect(p.top + p.height).toBeCloseTo(100, 3);
  });
  it('まるごと外の予定は出さない（6:00–7:00）', () => {
    expect(placeDay([ev({ start: `${DAY}T06:00`, end: `${DAY}T07:00` })], DAY)).toHaveLength(0);
  });
  it('**前の日から続く予定はその日の頭から**（時刻だけを見ない）', () => {
    const [p] = placeDay([ev({ start: '2026-08-07T20:00', end: `${DAY}T10:00` })], DAY);
    expect(p.top).toBe(0);
    expect(p.height).toBeCloseTo((2 / 14) * 100, 3);
  });
  it('**前の晩に終わった予定で翌日を埋めない**', () => {
    // 8/7 20:00 – 8/8 00:00 を 8/8 で見ると、始まりも終わりも 0 分
    expect(placeDay([ev({ start: '2026-08-07T20:00', end: `${DAY}T00:00` })], DAY)).toHaveLength(0);
  });
  it('15 分の予定にも読める高さを残す', () => {
    const [p] = placeDay([ev({ start: `${DAY}T10:00`, end: `${DAY}T10:15` })], DAY);
    expect(p.height).toBeGreaterThanOrEqual(2.4);
  });
  it('終日は札にしない（別の欄に出すため）', () => {
    expect(placeDay([ev({ start: `${DAY}T00:00`, end: `${DAY}T00:00`, allDay: true })], DAY)).toHaveLength(0);
  });
});

describe('placeDay — 重なり', () => {
  it('2つ重なると半分ずつ', () => {
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T12:00` }),
      ev({ key: 'b', start: `${DAY}T11:00`, end: `${DAY}T13:00` }),
    ], DAY);
    expect(p.map((x) => x.width)).toEqual([50, 50]);
    expect(p.map((x) => x.left)).toEqual([0, 50]);
  });
  it('**3つ重なっても1つも消えない**（1/3 ずつ）', () => {
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T13:00` }),
      ev({ key: 'b', start: `${DAY}T10:30`, end: `${DAY}T12:00` }),
      ev({ key: 'c', start: `${DAY}T11:00`, end: `${DAY}T14:00` }),
    ], DAY);
    expect(p).toHaveLength(3);
    for (const x of p) expect(x.width).toBeCloseTo(100 / 3, 6);
    expect(p.map((x) => Math.round(x.left))).toEqual([0, 33, 67]);
  });
  it('重ならない2つは**どちらも幅いっぱい**（塊が別なので割らない）', () => {
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T11:00` }),
      ev({ key: 'b', start: `${DAY}T14:00`, end: `${DAY}T15:00` }),
    ], DAY);
    expect(p.map((x) => x.width)).toEqual([100, 100]);
  });
  it('空いた列を使い回す（A 10-11 / B 11-12 / C 10:30-12 なら 2 列）', () => {
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T11:00` }),
      ev({ key: 'c', start: `${DAY}T10:30`, end: `${DAY}T12:00` }),
      ev({ key: 'b', start: `${DAY}T11:00`, end: `${DAY}T12:00` }),
    ], DAY);
    expect(p.every((x) => x.width === 50)).toBe(true);
    // b は a の抜けた列に入る
    expect(p.find((x) => x.ev.key === 'b')!.left).toBe(0);
  });
});

describe('目盛りと「いま」', () => {
  it('8:00 から 22:00 まで 15 本', () => {
    const h = hourMarks();
    expect(h).toHaveLength(15);
    expect(h[0]).toEqual({ label: '08:00', top: 0 });
    expect(h[14].label).toBe('22:00');
    expect(h[14].top).toBeCloseTo(100, 6);
  });
  it('**時間帯の外なら「いま」の線を出さない**', () => {
    expect(nowTop(new Date(2026, 7, 8, 7, 0))).toBeNull();
    expect(nowTop(new Date(2026, 7, 8, 23, 0))).toBeNull();
    expect(nowTop(new Date(2026, 7, 8, 15, 0))).toBeCloseTo((7 / 14) * 100, 6);
  });
});

describe('eventsOn / sortForList / timeLabel', () => {
  const rows = [
    ev({ key: 'a', start: '2026-08-07T20:00', end: '2026-08-09T10:00', title: '3日またぎ' }),
    ev({ key: 'b', start: `${DAY}T14:00`, end: `${DAY}T15:00`, title: '当日' }),
    ev({ key: 'c', start: '2026-08-10T09:00', end: '2026-08-10T10:00', title: 'あと' }),
  ];
  it('**日をまたぐ予定を真ん中の日でも拾う**', () => {
    expect(eventsOn(rows, DAY).map((r) => r.key).sort()).toEqual(['a', 'b']);
  });
  it('その日にかからないものは拾わない', () => {
    expect(eventsOn(rows, '2026-08-11')).toHaveLength(0);
  });
  it('終日が先頭、あとは時刻順', () => {
    const s = sortForList([
      ev({ key: 'x', start: `${DAY}T14:00`, end: `${DAY}T15:00` }),
      ev({ key: 'y', start: `${DAY}T09:00`, end: `${DAY}T10:00` }),
      ev({ key: 'z', start: `${DAY}T00:00`, end: `${DAY}T00:00`, allDay: true }),
    ]);
    expect(s.map((r) => r.key)).toEqual(['z', 'y', 'x']);
  });
  it('**日をまたぐ時刻に「翌」を付ける**（同じ日に見えてしまう）', () => {
    expect(timeLabel(ev({ start: `${DAY}T10:00`, end: `${DAY}T18:00` }))).toBe('10:00–18:00');
    expect(timeLabel(ev({ start: `${DAY}T22:00`, end: '2026-08-09T02:00' }))).toBe('22:00–翌02:00');
    expect(timeLabel(ev({ start: `${DAY}T00:00`, end: `${DAY}T00:00`, allDay: true }))).toBe('終日');
  });
});
