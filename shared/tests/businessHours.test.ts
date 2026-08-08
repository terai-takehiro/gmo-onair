import { describe, it, expect } from 'vitest';
import {
  checkHours, toMinutes, type DayHours, type ClosedDay,
} from '../../server/src/shared/services/businessHours';

/** 用賀（モックの HOURS.yoga から割増の列を落としたもの） */
const YOGA: DayHours[] = [
  { weekday: 1, open_time: '09:00', close_time: '22:00', over_policy: 'accept', note: null },
  { weekday: 2, open_time: '09:00', close_time: '22:00', over_policy: 'accept', note: null },
  { weekday: 3, open_time: '09:00', close_time: '22:00', over_policy: 'accept', note: null },
  { weekday: 4, open_time: '09:00', close_time: '22:00', over_policy: 'accept', note: null },
  { weekday: 5, open_time: '09:00', close_time: '24:00', over_policy: 'accept', note: '深夜帯は要事前相談' },
  { weekday: 6, open_time: '10:00', close_time: '20:00', over_policy: 'consult', note: null },
  { weekday: 0, open_time: null, close_time: null, over_policy: 'reject', note: '緊急対応は当番へ' },
];

const CLOSED: ClosedDay[] = [
  { from_date: '2026-08-13', to_date: '2026-08-16', name: '夏季休業', availability: 'none' },
  { from_date: '2026-09-07', to_date: '2026-09-09', name: 'ST01 設備点検', availability: 'partial' },
];

// 2026-08-10 は月曜 / 08-15 は土曜 / 08-16 は日曜
const MON = '2026-08-10';
const SAT = '2026-08-15';
const SUN = '2026-08-16';

describe('toMinutes', () => {
  it('24時を超える表記も読める（深夜まで営業する日）', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('26:00')).toBe(1560);
  });
  it('読めない文字列は null', () => {
    expect(toMinutes('9時')).toBeNull();
    expect(toMinutes('')).toBeNull();
  });
});

describe('checkHours — 営業時間の中', () => {
  it('月曜 10:00〜18:00 は時間内', () => {
    expect(checkHours(`${MON}T10:00`, `${MON}T18:00`, YOGA, []).outside).toBe(false);
  });
  it('ちょうど開始・ちょうど終了は時間内', () => {
    expect(checkHours(`${MON}T09:00`, `${MON}T22:00`, YOGA, []).outside).toBe(false);
  });
});

describe('checkHours — 営業時間の外', () => {
  it('開始が早すぎる', () => {
    const r = checkHours(`${MON}T08:00`, `${MON}T12:00`, YOGA, []);
    expect(r.outside).toBe(true);
    expect(r.reason).toContain('09:00 から');
  });
  it('終了が遅すぎる（1分でも外なら外）', () => {
    const r = checkHours(`${MON}T18:00`, `${MON}T22:01`, YOGA, []);
    expect(r.outside).toBe(true);
    expect(r.reason).toContain('22:00 まで');
  });
  it('前後どちらもはみ出したら両方だと分かる文にする', () => {
    expect(checkHours(`${MON}T07:00`, `${MON}T23:00`, YOGA, []).reason).toContain('前後');
  });
  it('日をまたぐ予約は翌日ぶんを足して測る', () => {
    // 金曜 22:00 〜 土曜 01:00。金曜は 24:00 までなので **時間外**
    expect(checkHours('2026-08-14T22:00', '2026-08-15T01:00', YOGA, []).outside).toBe(true);
    // 金曜 20:00 〜 24:00 ちょうどは時間内
    expect(checkHours('2026-08-14T20:00', '2026-08-15T00:00', YOGA, []).outside).toBe(false);
  });
  it('休みの曜日は時間に関係なく外', () => {
    const r = checkHours(`${SUN}T13:00`, `${SUN}T15:00`, YOGA, []);
    expect(r.outside).toBe(true);
    expect(r.reason).toContain('日曜は休み');
    expect(r.policy).toBe('reject');
  });
  it('土曜は「相談のうえ」の段が返る', () => {
    expect(checkHours(`${SAT}T21:00`, `${SAT}T22:00`, YOGA, []).policy).toBe('consult');
  });
});

describe('checkHours — 休業日は営業時間より強い', () => {
  it('休業日の期間に入っていれば、時間内でも外', () => {
    // 2026-08-13 は木曜で 09:00〜22:00 の営業時間内だが夏季休業
    const r = checkHours('2026-08-13T10:00', '2026-08-13T12:00', YOGA, CLOSED);
    expect(r.outside).toBe(true);
    expect(r.closedDayName).toBe('夏季休業');
    expect(r.policy).toBe('reject');
  });
  it('期間の初日と最終日も含む', () => {
    expect(checkHours('2026-08-13T10:00', null, YOGA, CLOSED).outside).toBe(true);
    expect(checkHours('2026-08-16T10:00', null, YOGA, CLOSED).outside).toBe(true);
    // 期間の外
    expect(checkHours('2026-08-12T10:00', '2026-08-12T12:00', YOGA, CLOSED).outside).toBe(false);
  });
  it('**`open` の休業日は無視する**（祝日を表に並べただけの行）', () => {
    // 祝日は初期値が open。拾ってしまうと「元日は営業します」という
    // 注意が祝日の予約すべてに出て、本当に見るべき注意が埋もれる
    const holidays: ClosedDay[] = [
      { from_date: '2026-08-11', to_date: '2026-08-11', name: '山の日', availability: 'open' },
    ];
    expect(checkHours('2026-08-11T10:00', '2026-08-11T18:00', YOGA, holidays).outside).toBe(false);
    // 「休む」に変えた瞬間から効く
    const closedNow: ClosedDay[] = [{ ...holidays[0], availability: 'none' }];
    expect(checkHours('2026-08-11T10:00', '2026-08-11T18:00', YOGA, closedNow).outside).toBe(true);
  });

  it('「一部のみ」は相談の段（受け付けないとは別）', () => {
    const r = checkHours('2026-09-08T10:00', null, YOGA, CLOSED);
    expect(r.policy).toBe('consult');
    expect(r.reason).toContain('一部の部屋');
  });
});

describe('checkHours — 止めないための逃げ道', () => {
  it('読めない日時は「時間外ではない」（毎回注意を出さない）', () => {
    expect(checkHours('なし', null, YOGA, []).outside).toBe(false);
    expect(checkHours('', null, YOGA, []).outside).toBe(false);
  });
  it('曜日を決めていない拠点は止めない', () => {
    expect(checkHours(`${MON}T03:00`, `${MON}T05:00`, [], []).outside).toBe(false);
  });
  it('時刻の書式が壊れている行は止めない', () => {
    const broken: DayHours[] = [{ weekday: 1, open_time: '9時', close_time: '22時', over_policy: 'accept', note: null }];
    expect(checkHours(`${MON}T03:00`, null, broken, []).outside).toBe(false);
  });
});
