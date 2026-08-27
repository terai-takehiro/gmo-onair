import { describe, it, expect } from 'vitest';
import {
  ymd, addDays, addMonths, startOfWeek, monthWeeks, weekDays,
  placeDay, hourMarks, nowTop, eventsOn, eventsInMonth, outsideWindow, sortForList, timeLabel,
  fracToMin, snapMin, minToHM, MIN_VIS_MIN,
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
  it('**10 分の予定は 1 行が入る高さ**（`MIN_VIS_MIN` 分ぶん）まで底上げする', () => {
    const [p] = placeDay([ev({ start: `${DAY}T10:00`, end: `${DAY}T10:10` })], DAY);
    expect(p.height).toBeCloseTo((MIN_VIS_MIN / (14 * 60)) * 100, 3);
    // 実際の長さは残す（札の中身を1行に畳むかの判定が使う）
    expect(p.minutes).toBe(10);
  });
  it('終日は札にしない（別の欄に出すため）', () => {
    expect(placeDay([ev({ start: `${DAY}T00:00`, end: `${DAY}T00:00`, allDay: true })], DAY)).toHaveLength(0);
  });
  it('**22:00 際の短い予定は枠の下へはみ出さない**（底上げしたぶん上へ押し戻す）', () => {
    const [p] = placeDay([ev({ start: `${DAY}T21:50`, end: `${DAY}T22:00` })], DAY);
    expect(p.top + p.height).toBeLessThanOrEqual(100);
    expect(p.cutBottom).toBe(false);
  });
  it('**「点」の予定の30分の底上げに ↓ を付けない**（21:50 の期限は 22:00 の外へ続かない）', () => {
    const [p] = placeDay([ev({ start: `${DAY}T21:50`, end: `${DAY}T21:50` })], DAY);
    expect(p.cutBottom).toBe(false);
    // 22:00 を実際にまたぐものには従来どおり付く
    const [q] = placeDay([ev({ start: `${DAY}T21:00`, end: `${DAY}T23:00` })], DAY);
    expect(q.cutBottom).toBe(true);
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
  it('**連続する短い予定は重ねない**（底上げで見た目が重なるぶんは列を分ける）', () => {
    // 10:00–10:10 と 10:10–10:20。実時間は重ならないが、どちらも
    // MIN_VIS_MIN 分の高さに底上げされるので、同じ列に置くと視覚的に重なる
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T10:10` }),
      ev({ key: 'b', start: `${DAY}T10:10`, end: `${DAY}T10:20` }),
    ], DAY);
    expect(p.map((x) => x.width)).toEqual([50, 50]);
    expect(p.map((x) => x.left)).toEqual([0, 50]);
  });
  it('底上げが届かない離れた短い予定どうしは列を分けない', () => {
    const p = placeDay([
      ev({ key: 'a', start: `${DAY}T10:00`, end: `${DAY}T10:10` }),
      ev({ key: 'b', start: `${DAY}T11:00`, end: `${DAY}T11:10` }),
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

describe('ドラッグ操作の計算', () => {
  it('fracToMin はグリッドの縦位置を 8:00〜22:00 の分に写す（外に出さない）', () => {
    expect(fracToMin(0)).toBe(8 * 60);
    expect(fracToMin(1)).toBe(22 * 60);
    expect(fracToMin(0.5)).toBe(15 * 60);
    // グリッドの外へはみ出したマウス位置は端に丸める
    expect(fracToMin(-0.2)).toBe(8 * 60);
    expect(fracToMin(1.3)).toBe(22 * 60);
  });
  it('snapMin は 15 分刻みに丸める', () => {
    expect(snapMin(607)).toBe(600);
    expect(snapMin(608)).toBe(615);
    expect(snapMin(600)).toBe(600);
    expect(snapMin(605, 30)).toBe(600);
  });
  it('minToHM は HH:MM（time 入力と API がそのまま受ける形）', () => {
    expect(minToHM(600)).toBe('10:00');
    expect(minToHM(9 * 60 + 5)).toBe('09:05');
    expect(minToHM(-10)).toBe('00:00');
    // 24:00 は <input type="time"> に無いので 23:59 に倒す
    expect(minToHM(24 * 60)).toBe('23:59');
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
  it('**2日以上またぐものは「翌」でなく日付**（1日短く読めてしまう）', () => {
    expect(timeLabel(ev({ start: '2026-08-25T20:00', end: '2026-08-27T02:00' }))).toBe('20:00–8/27 02:00');
  });
  it('**終わりが始まりより前の壊れたデータも始まりの日に出す**（黙って消さない）', () => {
    const broken = ev({ key: 'w', start: '2026-08-27T23:00', end: '2026-08-26T01:00' });
    expect(eventsOn([broken], '2026-08-27').map((r) => r.key)).toEqual(['w']);
    expect(eventsOn([broken], '2026-08-26')).toHaveLength(0);
  });
});

describe('eventsInMonth（一覧ビューの絞り）', () => {
  it('**前の月から続く予定を落とさない**（開始の月だけで絞ると一覧だけから消える）', () => {
    const rows = [
      ev({ key: 'x', start: '2026-08-31T22:00', end: '2026-09-02T02:00' }),
      ev({ key: 'y', start: '2026-09-10T10:00', end: '2026-09-10T11:00' }),
      ev({ key: 'z', start: '2026-08-01T10:00', end: '2026-08-01T11:00' }),
    ];
    expect(eventsInMonth(rows, '2026-09').map((r) => r.key).sort()).toEqual(['x', 'y']);
    expect(eventsInMonth(rows, '2026-08').map((r) => r.key).sort()).toEqual(['x', 'z']);
  });
});

describe('outsideWindow（8:00〜22:00 の外だけの予定の印）', () => {
  it('窓の外だけの予定を上下に分けて数える（窓にかかるものは数えない）', () => {
    const rows = [
      ev({ key: 'a', start: `${DAY}T06:00`, end: `${DAY}T07:00` }),            // 8時前
      ev({ key: 'b', start: `${DAY}T23:00`, end: `${DAY}T23:00` }),            // 22時後（点の期限）
      ev({ key: 'c', start: `${DAY}T10:00`, end: `${DAY}T11:00` }),            // 窓の中
      ev({ key: 'd', start: `${DAY}T07:00`, end: `${DAY}T09:00` }),            // 窓にかかる（札になる）
      ev({ key: 'e', start: `${DAY}T00:00`, end: `${DAY}T00:00`, allDay: true }), // 終日は別の欄
    ];
    const o = outsideWindow(rows, DAY);
    expect(o.before.map((r) => r.key)).toEqual(['a']);
    expect(o.after.map((r) => r.key)).toEqual(['b']);
  });
});
