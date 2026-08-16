/**
 * カレンダーの予約 → 案件の「実施日」（`server/.../project-event-dates.service.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * 実施日が**カレンダーと食い違っても画面には何も出ません**。案件詳細は
 * 「2026/08/13 〜 —」と自信を持って出し、カレンダーは 8/20〜8/22 を出します。
 * どちらが本当かは**予約を1件ずつ開かないと分からない**ので、日付の出し方を
 * 目で確かめる方法がありません。
 *
 * ── 数える種別の表が2つあること ────────────────────────────
 *
 * サーバーは `shared/` を import できない構成（`server/tsconfig.json` の `rootDir`）
 * なので、**同じ3つの種別をサーバーと画面が別々に持っています**。
 * ずれると「日程の欄が出ないのに実施日も直らない」＝**どこからも実施日を
 * 直せない案件**ができるので、ここで両方を読んで突き合わせます。
 */
import { describe, it, expect } from 'vitest';
import {
  EVENT_BOOKING_TYPES,
  deriveEventRange,
} from '../../server/src/contexts/production/services/project-event-dates.service';
import {
  EVENT_BOOKING_TYPES as CLIENT_EVENT_BOOKING_TYPES,
  hasEventBooking,
} from '../../client/src/contexts/sales/pages/projectForm/eventBookings';

const perf = (start: string, end?: string) => ({
  booking_type: 'performance', start_time: start, end_time: end ?? start,
});

describe('EVENT_BOOKING_TYPES — サーバーと画面が同じ組を持つ', () => {
  it('本番・リハーサル・仮押さえの3つ', () => {
    expect([...EVENT_BOOKING_TYPES]).toEqual(['performance', 'rehearsal', 'hold']);
  });
  it('画面側の表と一致する（ずれると実施日を直せない案件ができる）', () => {
    expect([...CLIENT_EVENT_BOOKING_TYPES]).toEqual([...EVENT_BOOKING_TYPES]);
  });
  it('相談・内覧・設営・社内利用・その他は数えない', () => {
    for (const t of ['consultation', 'tour', 'setup', 'maintenance', 'internal', 'other']) {
      expect(EVENT_BOOKING_TYPES).not.toContain(t);
    }
  });
});

describe('deriveEventRange — 予約から実施日を出す', () => {
  it('1件の単日は開始も終了も同じ日', () => {
    expect(deriveEventRange([perf('2026-08-20')])).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
  it('またぐ予約は最初の日と最後の日', () => {
    expect(deriveEventRange([perf('2026-08-20', '2026-08-22')]))
      .toEqual({ start: '2026-08-20', end: '2026-08-22' });
  });
  it('リハーサルが先なら開始はリハーサルの日（作るときの決め方と同じ）', () => {
    const rows = [
      perf('2026-08-20', '2026-08-22'),
      { booking_type: 'rehearsal', start_time: '2026-08-19', end_time: '2026-08-19' },
    ];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-08-19', end: '2026-08-22' });
  });
  it('仮押さえも数える（押さえた日は実施日）', () => {
    const rows = [{ booking_type: 'hold', start_time: '2026-09-01', end_time: '2026-09-02' }];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-09-01', end: '2026-09-02' });
  });
  it('**相談は数えない** — 3か月前の打合せで開始が3か月前に伸びない', () => {
    const rows = [
      { booking_type: 'consultation', start_time: '2026-05-01', end_time: '2026-05-01' },
      perf('2026-08-20'),
    ];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
  it('時刻つきの予約は日付だけを見る', () => {
    const rows = [{ booking_type: 'performance', start_time: '2026-08-20T09:30', end_time: '2026-08-20T18:00' }];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
  it('終了が空でも開始だけで出す', () => {
    const rows = [{ booking_type: 'performance', start_time: '2026-08-20', end_time: '' }];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
  it('**終了が開始より前の行は終了を捨てる**（実施日が逆さまにならない）', () => {
    const rows = [{ booking_type: 'performance', start_time: '2026-08-20', end_time: '2026-08-10' }];
    expect(deriveEventRange(rows)).toEqual({ start: '2026-08-20', end: '2026-08-20' });
  });
  it('開始が読めない行は数えない', () => {
    expect(deriveEventRange([{ booking_type: 'performance', start_time: '2026/08/20', end_time: null }])).toBeNull();
  });
  it('**数える予約が1件も無ければ null**（案件の実施日を触らない）', () => {
    expect(deriveEventRange([])).toBeNull();
    expect(deriveEventRange([{ booking_type: 'tour', start_time: '2026-08-20', end_time: '2026-08-20' }])).toBeNull();
  });
});

describe('hasEventBooking — 直す画面が日程の欄を隠してよいか', () => {
  it('本番があれば隠す（予約が唯一のもとになる）', () => {
    expect(hasEventBooking([{ booking_type: 'performance' }])).toBe(true);
  });
  it('**相談だけなら隠さない** — 隠すと実施日を直す口がどこにも無くなる', () => {
    expect(hasEventBooking([{ booking_type: 'consultation' }])).toBe(false);
    expect(hasEventBooking([{ booking_type: 'tour' }, { booking_type: 'other' }])).toBe(false);
  });
  it('1件も無ければ隠さない', () => {
    expect(hasEventBooking([])).toBe(false);
  });
});
