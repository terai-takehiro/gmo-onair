/**
 * 「最後の動き」の相対表示のテスト。
 *
 * ── なぜここをテストするか ──────────────────────────────────
 *
 * 純関数で、**画面を見ても間違いに気づけない**種類の計算だからです
 * (docs/v4-plan.md「自動テストについて」の基準)。
 *
 *   ・「1時間前」なのか「60分前」なのかは、境目でしか出ません。
 *     実データを眺めていて境目に当たることはまずない
 *   ・**未来の日時が来ると負の数になり「-1分前」と出ます**。
 *     時計のずれで実際に起きます (サーバーが数秒進んでいるだけで出る)
 *   ・7日を超えたら日付に切り替える段があり、切り替わりを見落とすと
 *     「43日前」のような、数え直さないと日付にならない表示が出ます
 */
import { describe, it, expect } from 'vitest';
import { formatRelativeTime, localDateStr } from '../src/client/format';

// 「今」を固定する。実時刻に依存させるとテストが日によって落ちる
const NOW = new Date('2026-08-05T12:00:00+09:00');
const rel = (iso: string) => formatRelativeTime(iso, NOW);

describe('formatRelativeTime — 段の境目', () => {
  it('1分未満は「たった今」', () => {
    expect(rel('2026-08-05T12:00:00+09:00')).toBe('たった今');
    expect(rel('2026-08-05T11:59:01+09:00')).toBe('たった今');
  });

  it('1分ちょうどから「N分前」', () => {
    expect(rel('2026-08-05T11:59:00+09:00')).toBe('1分前');
    expect(rel('2026-08-05T11:01:00+09:00')).toBe('59分前');
  });

  it('60分ちょうどから「N時間前」 (「60分前」にしない)', () => {
    expect(rel('2026-08-05T11:00:00+09:00')).toBe('1時間前');
    expect(rel('2026-08-04T13:00:00+09:00')).toBe('23時間前');
  });

  it('24時間ちょうどから「N日前」 (「24時間前」にしない)', () => {
    expect(rel('2026-08-04T12:00:00+09:00')).toBe('1日前');
    expect(rel('2026-07-30T12:00:00+09:00')).toBe('6日前');
  });

  it('7日からは日付にする (「43日前」を出さない)', () => {
    expect(rel('2026-07-29T12:00:00+09:00')).toBe('2026/07/29');
    expect(rel('2026-06-23T12:00:00+09:00')).toBe('2026/06/23');
  });
});

describe('formatRelativeTime — 壊れた値', () => {
  it('未来は「たった今」に丸める (「-1分前」を出さない)', () => {
    // サーバーの時計が数秒進んでいるだけで実際に起きる
    expect(rel('2026-08-05T12:00:30+09:00')).toBe('たった今');
    expect(rel('2026-08-06T12:00:00+09:00')).toBe('たった今');
  });

  it('無い値・読めない値は空にする (「Invalid Date」を画面に出さない)', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
    expect(formatRelativeTime(undefined, NOW)).toBe('');
    expect(formatRelativeTime('', NOW)).toBe('');
    expect(formatRelativeTime('これは日付ではない', NOW)).toBe('');
  });

  it('Date とミリ秒でも同じ結果になる', () => {
    const d = new Date('2026-08-05T11:00:00+09:00');
    expect(formatRelativeTime(d, NOW)).toBe('1時間前');
    expect(formatRelativeTime(d.getTime(), NOW)).toBe('1時間前');
  });
});

describe('localDateStr — `toISOString` を使わない年月日', () => {
  it('ローカルの年月日をそのまま文字にする', () => {
    expect(localDateStr(new Date(2026, 7, 8, 15, 0))).toBe('2026-08-08');
  });
  it('**深夜0時〜朝9時でも前日にならない**（`toISOString` は JST を UTC に寄せて前日になる）', () => {
    expect(localDateStr(new Date(2026, 7, 27, 2, 0))).toBe('2026-08-27');
    expect(localDateStr(new Date(2026, 7, 27, 0, 0))).toBe('2026-08-27');
  });
  it('月・日は0埋め2桁', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
