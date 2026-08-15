/**
 * 日本の壁時計。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ずれても**画面には日付が出るだけ**なので、見て気づけません。
 * 実際、夜間ジョブは「3時に走る」と書いてあるのに**正午に走って**いて、
 * ダッシュボードは JST の朝 9 時前だけ前日を出していました
 * （どちらもレビューで指摘されるまで誰も気づいていません）。
 *
 * ここは時計を渡せる純関数なので、**問題の時刻を狙って**確かめられます。
 */
import { describe, it, expect } from 'vitest';
import {
  jstDate, jstTime, jstParts, shiftYmd, jstMonthRange,
} from '../../server/src/shared/utils/jst';

/** UTC の時刻から Date を作る（コンテナは UTC で動く） */
const utc = (iso: string) => new Date(`${iso}Z`);

describe('日本の壁時計', () => {
  it('UTC の 00:00 は日本の同じ日の 09:00', () => {
    expect(jstParts(utc('2026-08-15T00:00:00'))).toEqual({ date: '2026-08-15', time: '09:00' });
  });

  // ⚠️ ここが壊れていた側。UTC の夕方は**日本ではもう翌日**
  it('UTC の 15:00 は日本の翌日 00:00（日付が変わる）', () => {
    expect(jstParts(utc('2026-08-15T15:00:00'))).toEqual({ date: '2026-08-16', time: '00:00' });
  });

  it('UTC の 23:59 は日本の翌日 08:59', () => {
    expect(jstParts(utc('2026-08-15T23:59:00'))).toEqual({ date: '2026-08-16', time: '08:59' });
  });

  // 夜間ジョブは `at: '03:00'` を `HH:MM` の大小で判定する。
  // 24時ちょうどが `24:00` と返ると「まだ来ていない」になり、**その日は流れない**
  it('日本の真夜中は 24:00 ではなく 00:00', () => {
    expect(jstTime(utc('2026-08-15T15:00:00'))).toBe('00:00');
  });

  it('年をまたぐ（UTC 大晦日の夕方は日本の元日）', () => {
    expect(jstDate(utc('2026-12-31T15:00:00'))).toBe('2027-01-01');
  });

  // **サーバーの時間帯に釣られないこと。** ここが釣られると、
  // 手元（JST の開発機）では通って本番（UTC）で落ちる
  it('プロセスの時間帯を変えても答えが変わらない', () => {
    const before = process.env.TZ;
    const at = utc('2026-08-15T15:30:00');
    try {
      process.env.TZ = 'UTC';
      const a = jstParts(at);
      process.env.TZ = 'America/New_York';
      const b = jstParts(at);
      expect(a).toEqual(b);
      expect(a).toEqual({ date: '2026-08-16', time: '00:30' });
    } finally {
      if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
    }
  });
});

describe('日付の足し算', () => {
  it('月をまたぐ', () => {
    expect(shiftYmd('2026-08-30', 6)).toBe('2026-09-05');
  });

  it('前に戻せる', () => {
    expect(shiftYmd('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('うるう日を飛ばさない', () => {
    expect(shiftYmd('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('今月の範囲', () => {
  it('日本時間の月で切る（UTC 月末の夕方は日本の翌月）', () => {
    expect(jstMonthRange(utc('2026-08-31T15:00:00'))).toEqual({ start: '2026-09-01', end: '2026-09-31' });
  });

  // 末日は 31 固定。日付は TEXT の文字列比較なので、
  // 2月でも「その月のすべて」を含む上限として正しく働く
  it('2月でも上限として働く', () => {
    const { start, end } = jstMonthRange(utc('2026-02-10T00:00:00'));
    expect(start).toBe('2026-02-01');
    expect('2026-02-28' <= end).toBe(true);
    expect('2026-03-01' <= end).toBe(false);
  });
});
