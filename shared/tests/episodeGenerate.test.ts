import { describe, it, expect } from 'vitest';
import {
  planEpisodeDates, resolveBroadcastDate, resolvePlan, summarizeResolvedPlan,
  EpisodeGenerateError,
} from '../../server/src/contexts/production/services/episodeGenerate.service';

describe('planEpisodeDates — weekly/biweekly（回数指定）', () => {
  it('毎週・1日1本・回数3件は開始日から7日おき', () => {
    expect(planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-10', per_day_count: 1, count: 3,
    })).toEqual([
      { date: '2026-09-10', take: 1 },
      { date: '2026-09-17', take: 1 },
      { date: '2026-09-24', take: 1 },
    ]);
  });

  it('隔週・1日2本・回数12件は6日付ぶん（設計文書 §7 の実例）', () => {
    const plan = planEpisodeDates({
      cadence: 'biweekly', start_date: '2026-09-10', per_day_count: 2, count: 12,
    });
    expect(plan).toHaveLength(6);
    expect(plan.every((p) => p.take === 2)).toBe(true);
    expect(plan[0].date).toBe('2026-09-10');
    expect(plan[1].date).toBe('2026-09-24');
    expect(plan.reduce((sum, p) => sum + p.take, 0)).toBe(12);
  });

  it('1日あたりの本数で割り切れない回数は最後の日だけ残数になる', () => {
    const plan = planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-10', per_day_count: 2, count: 5,
    });
    expect(plan).toEqual([
      { date: '2026-09-10', take: 2 },
      { date: '2026-09-17', take: 2 },
      { date: '2026-09-24', take: 1 },
    ]);
  });
});

describe('planEpisodeDates — 終了日指定', () => {
  it('終了日を超えたら打ち切る（終了日そのものは含む）', () => {
    const plan = planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-03', per_day_count: 1, end_date: '2026-09-17',
    });
    expect(plan.map((p) => p.date)).toEqual(['2026-09-03', '2026-09-10', '2026-09-17']);
  });

  it('終了日が開始日より前はエラー', () => {
    expect(() => planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-10', per_day_count: 1, end_date: '2026-09-01',
    })).toThrow(EpisodeGenerateError);
  });
});

describe('planEpisodeDates — 終了条件は「どちらか一方」', () => {
  it('回数も終了日も無ければエラー', () => {
    expect(() => planEpisodeDates({ cadence: 'weekly', start_date: '2026-09-10', per_day_count: 1 }))
      .toThrow(EpisodeGenerateError);
  });

  it('回数と終了日を両方指定してもエラー', () => {
    expect(() => planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-10', per_day_count: 1, count: 3, end_date: '2026-10-01',
    })).toThrow(EpisodeGenerateError);
  });
});

describe('planEpisodeDates — 毎月第N◯曜日', () => {
  it('2026-09-10（木・第2木曜）から毎月、同じ「第2木曜」を歩く', () => {
    const plan = planEpisodeDates({
      cadence: 'monthly_nth_weekday', start_date: '2026-09-10', per_day_count: 1, count: 3,
    });
    // 2026-10 の第2木曜は 10/8、2026-11 の第2木曜は 11/12
    expect(plan.map((p) => p.date)).toEqual(['2026-09-10', '2026-10-08', '2026-11-12']);
  });

  it('第5◯曜日が存在しない月は飛ばして次の月へ進む', () => {
    // 2026-01-30 は金曜・その月の第5金曜。次に第5金曜がある月まで飛ぶはず
    const plan = planEpisodeDates({
      cadence: 'monthly_nth_weekday', start_date: '2026-01-30', per_day_count: 1, count: 2,
    });
    expect(plan[0].date).toBe('2026-01-30');
    expect(plan[1].date).not.toBe('2026-02-30'); // そんな日付は存在しない
    // 2026年で次に第5金曜があるのは5月（1,8,15,22,29の5回）
    expect(plan[1].date).toBe('2026-05-29');
  });
});

describe('planEpisodeDates — なし（日付を手で並べる）', () => {
  it('渡した日付をそのまま昇順で使う（count/end_dateは見ない）', () => {
    const plan = planEpisodeDates({
      cadence: 'none', dates: ['2026-09-20', '2026-09-05'], per_day_count: 2,
    });
    expect(plan).toEqual([
      { date: '2026-09-05', take: 2 },
      { date: '2026-09-20', take: 2 },
    ]);
  });

  it('日付が1件も無いとエラー', () => {
    expect(() => planEpisodeDates({ cadence: 'none', dates: [], per_day_count: 1 }))
      .toThrow(EpisodeGenerateError);
  });

  it('同じ日付を2回指定するとエラー', () => {
    expect(() => planEpisodeDates({
      cadence: 'none', dates: ['2026-09-05', '2026-09-05'], per_day_count: 1,
    })).toThrow(EpisodeGenerateError);
  });
});

describe('planEpisodeDates — 上限', () => {
  it('回数が上限（100）を超えたらエラー', () => {
    expect(() => planEpisodeDates({
      cadence: 'weekly', start_date: '2026-09-10', per_day_count: 1, count: 101,
    })).toThrow(EpisodeGenerateError);
  });

  it('終了日指定で合計が上限を超えてもエラー（1日1本×101週）', () => {
    expect(() => planEpisodeDates({
      cadence: 'weekly', start_date: '2026-01-01', per_day_count: 1, end_date: '2027-12-31',
    })).toThrow(EpisodeGenerateError);
  });
});

describe('resolveBroadcastDate', () => {
  it('生放送は収録日＝放送日（オフセットを無視）', () => {
    expect(resolveBroadcastDate('2026-09-10', 7, true)).toBe('2026-09-10');
  });

  it('収録＋オフセット日数（設計文書 §2 の実例: 6/18収録→6/25公開＝+7日）', () => {
    expect(resolveBroadcastDate('2026-06-18', 7, false)).toBe('2026-06-25');
  });
});

describe('resolvePlan — 既存回とのスキップ判定', () => {
  it('指定本数ぶん既にある日は丸ごとスキップする', () => {
    const plan = [{ date: '2026-09-10', take: 2 }, { date: '2026-09-17', take: 2 }];
    const existing = [{ recording_date: '2026-09-10' }, { recording_date: '2026-09-10' }];
    const resolved = resolvePlan(plan, existing);
    expect(resolved[0]).toEqual({ date: '2026-09-10', take: 2, existingCount: 2, skip: true });
    expect(resolved[1]).toEqual({ date: '2026-09-17', take: 2, existingCount: 0, skip: false });
  });

  it('既存が指定本数未満なら作る対象のまま（丸ごと take 本を新規作成）', () => {
    const plan = [{ date: '2026-09-10', take: 2 }];
    const existing = [{ recording_date: '2026-09-10' }];
    const resolved = resolvePlan(plan, existing);
    expect(resolved[0].skip).toBe(false);
  });
});

describe('summarizeResolvedPlan', () => {
  it('作る/飛ばすの件数を集計する', () => {
    const resolved = resolvePlan(
      [{ date: '2026-09-10', take: 2 }, { date: '2026-09-17', take: 2 }, { date: '2026-09-24', take: 1 }],
      [{ recording_date: '2026-09-10' }, { recording_date: '2026-09-10' }],
    );
    const { summary } = summarizeResolvedPlan(resolved);
    expect(summary).toEqual({
      dates_total: 3,
      dates_to_create: 2,
      dates_skipped: 1,
      episodes_to_create: 3,
      episodes_skipped: 2,
    });
  });
});
