/**
 * 案件の「実施日」の書き方を固定する — 営業活動記録（案件別）
 *
 * ── なぜ試験で固定するか ────────────────────────────────────
 *
 * 実施日は `project_dates`（案件を作ったときに入れた日）と
 * `projects.event_start` / `event_end`（予約から引き直される日）の**2か所**にあり、
 * 素直に書くと画面ごとに違う日・違う日数が出ます。しかも
 * **複数日の案件で先頭の日だけ出すと「1日だけの本番」に読めます**
 * （3日間の設営・本番・撤去を1日と取り違える）。
 *
 * 画面を立てずに確かめられる形にして、書き方の3通りをここに固定します。
 */
import { describe, it, expect } from 'vitest';
import {
  eventDateLabel, countEventDays, firstEventDate,
} from '../../client/src/contexts/sales/pages/activityLog/eventDate';

describe('実施日の書き方', () => {
  it('1日なら曜日を付ける（`10/24（土）`）', () => {
    expect(eventDateLabel('2026-10-24', 1)).toBe('10/24（土）');
  });

  it('⚠️ 複数日は曜日を付けず「ほかN日」（ほかの日数 = 総日数 - 1）', () => {
    // 曜日を付けると「その曜日の1日だけ」と読めてしまう
    expect(eventDateLabel('2026-10-24', 3)).toBe('10/24 ほか2日');
    expect(eventDateLabel('2026-10-24', 2)).toBe('10/24 ほか1日');
  });

  it('実施日が無ければ「実施日 未定」（0件・`null`・壊れた値）', () => {
    expect(eventDateLabel(null, 0)).toBe('実施日 未定');
    expect(eventDateLabel(undefined, 3)).toBe('実施日 未定');
    expect(eventDateLabel('しらない', 1)).toBe('実施日 未定');
  });

  it('総数が来ていないときは 1 日として扱う（日付があるのに「未定」と書かない）', () => {
    expect(eventDateLabel('2026-10-24', null)).toBe('10/24（土）');
    expect(eventDateLabel('2026-10-24', undefined)).toBe('10/24（土）');
  });

  it('月・日は0詰めしない（`10/04` ではなく `10/4`）', () => {
    expect(eventDateLabel('2026-10-04', 1)).toBe('10/4（日）');
  });
});

describe('実施日の数え方（`projectPhase` と同じ材料を見る）', () => {
  it('重複は1日として数える（`project_dates` と `event_start` が同じ日）', () => {
    expect(countEventDays({
      dates: [{ date: '2026-10-24' }], event_start: '2026-10-24', event_end: '2026-10-24',
    })).toBe(1);
  });

  it('⚠️ 両端だけを足す（期間で埋めない）', () => {
    // 飛び日（10/01 と 10/07 だけ本番）の中日まで実施日にしない
    expect(countEventDays({ dates: [], event_start: '2026-10-01', event_end: '2026-10-07' })).toBe(2);
  });

  it('実施日が1つも無ければ 0（＝「実施日 未定」）', () => {
    expect(countEventDays({ dates: [], event_start: null, event_end: null })).toBe(0);
    expect(firstEventDate({ dates: null, event_start: null, event_end: null })).toBeNull();
  });

  it('いちばん早い日を先頭に出す（配列の順番に頼らない）', () => {
    const p = {
      dates: [{ date: '2026-10-26' }, { date: '2026-10-24' }],
      event_start: '2026-10-25',
      event_end: '2026-10-26',
    };
    expect(firstEventDate(p)).toBe('2026-10-24');
    expect(countEventDays(p)).toBe(3);
    expect(eventDateLabel(firstEventDate(p), countEventDays(p))).toBe('10/24 ほか2日');
  });
});
