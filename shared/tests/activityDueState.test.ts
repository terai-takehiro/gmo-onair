/**
 * 次のアクションの「期限の4区分」を固定する — 営業活動記録（案件別）
 *
 * ── なぜ試験で固定するか（実際に起きること）────────────────
 *
 * この区分は**サーバー（`GET /activity-logs/by-project` の `due`）と画面の
 * 両方**が持ちます。片方だけ直すと、
 * **「期限超過 3」と出ているチップを押すと 2 件しか並ばない**という食い違いになり、
 * しかも**日付が動くと再現しません**（今日を基準にした境界の話なので、
 * 直した翌日には別の件数で外れます）。誰も再現手順を書けないまま
 * 「数字が信用できない画面」だけが残るので、境界を日付固定でここに書きます。
 *
 * ⚠️ サーバーの定義（`activity-log.service.ts`）を変えるときは**この試験も一緒に**。
 * どちらかだけ直せるなら、それは2か所に定義を持っているということです。
 */
import { describe, it, expect } from 'vitest';
import {
  dueStateOf, matchesDue, overdueDays, dueLabel, duePartsOf,
} from '../../client/src/contexts/sales/pages/activityLog/dueState';

/** 火曜日。曜日に依存する実装（「今週」を週末で切る等）が紛れ込んだら落ちる */
const TODAY = '2026-09-22';

describe('期限の4区分', () => {
  it('期限未設定は `none`（`next_action` はあるのに期限だけ無い行）', () => {
    expect(dueStateOf(null, TODAY)).toBe('none');
    expect(dueStateOf('', TODAY)).toBe('none');
    expect(dueStateOf(undefined, TODAY)).toBe('none');
  });

  it('本日より前は `overdue`（本日は含めない）', () => {
    expect(dueStateOf('2026-09-21', TODAY)).toBe('overdue');
    expect(dueStateOf('2026-09-18', TODAY)).toBe('overdue');
  });

  it('本日と明日が `today`（画面の名前は「本日・明日」）', () => {
    expect(dueStateOf('2026-09-22', TODAY)).toBe('today');
    expect(dueStateOf('2026-09-23', TODAY)).toBe('today');
  });

  it('本日+2 〜 本日+7 が `week`（境界の両端を含む）', () => {
    expect(dueStateOf('2026-09-24', TODAY)).toBe('week');
    expect(dueStateOf('2026-09-29', TODAY)).toBe('week');
  });

  it('⚠️ 本日+8 以降はどの区分にも入れない（`later`）', () => {
    // ここを `week` に寄せると「今週やること」に来月の予定が並び、
    // 数字が信用されなくなる。チップを持たないだけで「すべて」には出る
    expect(dueStateOf('2026-09-30', TODAY)).toBe('later');
    expect(dueStateOf('2026-12-01', TODAY)).toBe('later');
    expect(matchesDue('2026-09-30', 'week', TODAY)).toBe(false);
    expect(matchesDue('2026-09-30', 'all', TODAY)).toBe(true);
  });

  it('月をまたいでも日数で数える（文字列の大小だけで判定しない）', () => {
    const today = '2026-10-01';
    expect(dueStateOf('2026-09-28', today)).toBe('overdue');
    expect(overdueDays('2026-09-28', today)).toBe(3);
    expect(dueStateOf('2026-10-08', today)).toBe('week');
    expect(dueStateOf('2026-10-09', today)).toBe('later');
  });
});

describe('期限の文字（docs/wording.md ルール8・9）', () => {
  it('✕「4日すぎ」→ ○「9/18（4日超過）」', () => {
    expect(dueLabel('2026-09-18', TODAY)).toBe('9/18（4日超過）');
  });

  it('✕「今日・明日」→ ○「本日・明日」', () => {
    expect(dueLabel('2026-09-22', TODAY)).toBe('9/22（本日）');
    expect(dueLabel('2026-09-23', TODAY)).toBe('9/23（明日）');
  });

  it('✕「あと3日」→ ○「残り3日」', () => {
    expect(dueLabel('2026-09-25', TODAY)).toBe('9/25（残り3日）');
  });

  it('✕「期限なし」→ ○「期限未設定」（注記は付けない）', () => {
    expect(dueLabel(null, TODAY)).toBe('期限未設定');
    expect(duePartsOf(null, TODAY)).toEqual({ date: '期限未設定', note: '', state: 'none' });
  });

  it('日付と注記は分けて返す（128px の列で注記が消えないように）', () => {
    expect(duePartsOf('2026-09-18', TODAY)).toEqual({ date: '9/18', note: '4日超過', state: 'overdue' });
  });

  it('日は0詰めしない（`09/18` ではなく `9/18`）', () => {
    expect(duePartsOf('2026-09-05', '2026-09-04').date).toBe('9/5');
  });
});
