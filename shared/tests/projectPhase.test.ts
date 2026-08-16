/**
 * 案件詳細のスマホタブの段階（`client/.../projectDetail/tabs.ts`）
 *
 * ── なぜここを試すのか ──────────────────────────────────────
 *
 * 段階の判定を間違えると、**本番の日に「当日」タブが出ません**。
 * 現場でスマホを開いた人は、出ないタブを探しようがありません
 * （URL を知っていれば開けますが、本番中に URL は打ちません）。
 *
 * とくに**飛び日**（10/01 と 10/05 だけ本番、あいだは何も無い）が要注意です。
 * 期間で判定すると 10/03 が本番日になり、逆に開始日だけを見ると
 * 10/05 が本番日になりません。**「いずれかの日が今日」**が正しい判定です。
 */
import { describe, it, expect } from 'vitest';
import { projectPhase, MOBILE_TABS_BY_PHASE } from '../../client/src/contexts/sales/pages/projectDetail/tabs';

const TODAY = '2026-10-03';

describe('projectPhase — 終わった案件', () => {
  it('完了は done', () => {
    expect(projectPhase({ stage: 's_completed', event_start: '2026-10-03' }, TODAY)).toBe('done');
  });
  it('失注は done（実施日が今日でも done が勝つ）', () => {
    // 失注した案件の本番日は来ません。「当日」を出すと、来ない本番の資料を開かせることになる
    expect(projectPhase({ stage: 'e_lost', event_start: '2026-10-03' }, TODAY)).toBe('done');
  });
});

describe('projectPhase — 本番日', () => {
  it('実施日が今日なら day', () => {
    expect(projectPhase({ stage: 'a_won', event_start: '2026-10-03' }, TODAY)).toBe('day');
  });
  it('終了日が今日でも day（最終日も本番）', () => {
    expect(projectPhase({ stage: 'a_won', event_start: '2026-10-01', event_end: '2026-10-03' }, TODAY)).toBe('day');
  });
  it('飛び日は「いずれかの日が今日」で見る', () => {
    const dates = [{ date: '2026-10-01' }, { date: '2026-10-03' }, { date: '2026-10-07' }];
    expect(projectPhase({ stage: 'a_won', event_start: '2026-10-01', event_end: '2026-10-07', dates }, TODAY)).toBe('day');
  });
  it('**飛び日のあいだの日は本番ではない**（期間で判定してはいけない）', () => {
    const dates = [{ date: '2026-10-01' }, { date: '2026-10-07' }];
    expect(projectPhase({ stage: 'a_won', event_start: '2026-10-01', event_end: '2026-10-07', dates }, TODAY)).toBe('base');
  });
  it('**カレンダーで動かした本番日も day**（`dates` は作ったときのまま古い）', () => {
    // 予約を 10/01 → 10/03 に動かすと `event_start` / `event_end` だけが引き直され、
    // `project_dates` は 10/01 のまま残る。`dates` だけを見ていると当日タブが出なかった
    const dates = [{ date: '2026-10-01' }];
    expect(projectPhase(
      { stage: 'a_won', event_start: '2026-10-03', event_end: '2026-10-03', dates }, TODAY,
    )).toBe('day');
  });
  it('日程を持たない案件は base', () => {
    expect(projectPhase({ stage: 'c_proposal' }, TODAY)).toBe('base');
    expect(projectPhase({ stage: 'c_proposal', event_start: null, event_end: null }, TODAY)).toBe('base');
  });
  it('実施日が過ぎていても、終わっていなければ base（請求とふりかえりが残る）', () => {
    expect(projectPhase({ stage: 'a_won', event_start: '2026-09-01' }, TODAY)).toBe('base');
  });
});

describe('MOBILE_TABS_BY_PHASE', () => {
  it('どの段階も3つ（375px に並べられる数）', () => {
    for (const keys of Object.values(MOBILE_TABS_BY_PHASE)) expect(keys).toHaveLength(3);
  });
  it('概要はどの段階にもある（落ちる先が要る）', () => {
    for (const keys of Object.values(MOBILE_TABS_BY_PHASE)) expect(keys[0]).toBe('overview');
  });
  it('当日はいちばん右（押し間違いで開かないように）', () => {
    expect(MOBILE_TABS_BY_PHASE.day[2]).toBe('day');
  });
  it('終わった案件はふりかえりを持つ', () => {
    expect(MOBILE_TABS_BY_PHASE.done).toContain('review');
  });
  it('ふだんはやり取りを持つ（書くのがいちばん多い）', () => {
    expect(MOBILE_TABS_BY_PHASE.base).toContain('thread');
  });
});
