import { describe, it, expect } from 'vitest';
import { holidaysOf, holidaysBetween } from '../../server/src/shared/services/holidays';

const on = (y: number, date: string) => holidaysOf(y).filter((h) => h.date === date);
const names = (y: number) => Object.fromEntries(holidaysOf(y).map((h) => [h.date, h.name]));

describe('holidaysOf — 動かない祝日', () => {
  it('元日・建国記念の日・天皇誕生日', () => {
    const n = names(2026);
    expect(n['2026-01-01']).toBe('元日');
    expect(n['2026-02-11']).toBe('建国記念の日');
    expect(n['2026-02-23']).toBe('天皇誕生日');
  });
  it('ゴールデンウィーク', () => {
    const n = names(2026);
    expect(n['2026-04-29']).toBe('昭和の日');
    expect(n['2026-05-03']).toBe('憲法記念日');
    expect(n['2026-05-04']).toBe('みどりの日');
    expect(n['2026-05-05']).toBe('こどもの日');
  });
});

describe('holidaysOf — ハッピーマンデー', () => {
  it('成人の日は1月の第2月曜', () => {
    // 2026-01-01 は木曜 → 第1月曜は 1/5、第2月曜は 1/12
    expect(names(2026)['2026-01-12']).toBe('成人の日');
    // 2027-01-01 は金曜 → 第1月曜は 1/4、第2月曜は 1/11
    expect(names(2027)['2027-01-11']).toBe('成人の日');
  });
  it('1日が月曜の月でも第2月曜がずれない', () => {
    // 2029-01-01 は月曜 → 第2月曜は 1/8
    expect(names(2029)['2029-01-08']).toBe('成人の日');
  });
  it('海の日は7月の第3月曜', () => {
    expect(names(2026)['2026-07-20']).toBe('海の日');
  });
  it('スポーツの日は10月の第2月曜', () => {
    expect(names(2026)['2026-10-12']).toBe('スポーツの日');
  });
});

describe('holidaysOf — 春分・秋分', () => {
  it('実績と一致する（2024〜2026）', () => {
    expect(names(2024)['2024-03-20']).toBe('春分の日');
    expect(names(2024)['2024-09-22']).toBe('秋分の日');
    expect(names(2025)['2025-03-20']).toBe('春分の日');
    expect(names(2025)['2025-09-23']).toBe('秋分の日');
    expect(names(2026)['2026-03-20']).toBe('春分の日');
    expect(names(2026)['2026-09-23']).toBe('秋分の日');
  });
  it('うるう年前後でずれる（2027 の春分は 3/21）', () => {
    expect(names(2027)['2027-03-21']).toBe('春分の日');
  });
  it('**予測である印が付く**（公示に合わせて直せるように）', () => {
    expect(on(2026, '2026-03-20')[0].estimated).toBe(true);
    expect(on(2026, '2026-01-01')[0].estimated).toBe(false);
  });
  it('式の範囲外（2100年）は春分・秋分を出さない', () => {
    const n = holidaysOf(2100).map((h) => h.name);
    expect(n).not.toContain('春分の日');
    expect(n).not.toContain('秋分の日');
    expect(n).toContain('元日'); // ほかは出る
  });
});

describe('holidaysOf — 振替休日', () => {
  it('日曜の祝日は翌日が振替休日', () => {
    // 2026-11-23（勤労感謝の日）は月曜なので振替なし
    expect(names(2026)['2026-11-24']).toBeUndefined();
    // 2025-11-23（勤労感謝の日）は日曜 → 11/24 が振替休日
    expect(names(2025)['2025-11-24']).toBe('振替休日');
  });
  it('連休の途中が日曜でも、次の「祝日でない日」まで送る', () => {
    // 2026-05-03（憲法記念日）は日曜。5/4・5/5 も祝日なので振替は 5/6
    expect(names(2026)['2026-05-03']).toBe('憲法記念日');
    expect(names(2026)['2026-05-06']).toBe('振替休日');
    // 5/4・5/5 が振替に置き換わっていないこと
    expect(names(2026)['2026-05-04']).toBe('みどりの日');
    expect(names(2026)['2026-05-05']).toBe('こどもの日');
  });
  it('同じ日に振替休日を2つ作らない', () => {
    for (const y of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
      const dates = holidaysOf(y).map((h) => h.date);
      expect(new Set(dates).size).toBe(dates.length);
    }
  });
});

describe('holidaysOf — 国民の休日', () => {
  it('敬老の日と秋分の日に挟まれた平日が休みになる', () => {
    // 2026: 敬老の日 9/21(月)・秋分の日 9/23(水) → 9/22(火) が国民の休日
    expect(names(2026)['2026-09-21']).toBe('敬老の日');
    expect(names(2026)['2026-09-22']).toBe('国民の休日');
    expect(names(2026)['2026-09-23']).toBe('秋分の日');
  });
  it('挟まれた日が土日なら作らない（元々休みなので）', () => {
    // GW の 5/4 は祝日なので国民の休日にはならない
    expect(names(2026)['2026-05-04']).toBe('みどりの日');
  });
});

describe('holidaysBetween', () => {
  it('年をまたいで日付順に並ぶ', () => {
    const h = holidaysBetween(2026, 2028);
    expect(h[0].date).toBe('2026-01-01');
    expect(h[h.length - 1].date.startsWith('2028')).toBe(true);
    for (let i = 1; i < h.length; i++) expect(h[i].date >= h[i - 1].date).toBe(true);
  });
  it('年ごとの件数（振替休日の数で増える）', () => {
    // **緩い範囲で通さない。** 1件ずつ曜日を数えて確かめた実数で固定する
    //   2026: 16 + 振替(5/3 日) + 国民の休日(9/22) = 18
    //   2027: 16 + 振替(3/21 春分が日曜) = 17
    //   2028: 日曜に当たる祝日が無い = 16
    //   2029: 16 + 振替3件（2/11・4/29・9/23 がいずれも日曜）= 19
    //   2030: 16 + 振替3件（5/5・8/11・11/3 がいずれも日曜）= 19
    expect(holidaysOf(2026)).toHaveLength(18);
    expect(holidaysOf(2027)).toHaveLength(17);
    expect(holidaysOf(2028)).toHaveLength(16);
    expect(holidaysOf(2029)).toHaveLength(19);
    expect(holidaysOf(2030)).toHaveLength(19);
  });

  it('2029・2030 の振替休日は日曜の祝日から生まれている', () => {
    const n29 = Object.fromEntries(holidaysOf(2029).map((h) => [h.date, h.name]));
    expect(n29['2029-02-12']).toBe('振替休日'); // 2/11 建国記念の日が日曜
    expect(n29['2029-04-30']).toBe('振替休日'); // 4/29 昭和の日が日曜
    expect(n29['2029-09-24']).toBe('振替休日'); // 9/23 秋分の日が日曜
    const n30 = Object.fromEntries(holidaysOf(2030).map((h) => [h.date, h.name]));
    expect(n30['2030-05-06']).toBe('振替休日'); // 5/5 こどもの日が日曜
    expect(n30['2030-08-12']).toBe('振替休日'); // 8/11 山の日が日曜
    expect(n30['2030-11-04']).toBe('振替休日'); // 11/3 文化の日が日曜
  });
});
