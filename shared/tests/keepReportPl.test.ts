/**
 * 隔週キープの計算列（keep-report.md §5.3）と稼働率の設定（§5.4）
 *
 * ── なぜ固定するか ──────────────────────────────────────────
 *
 * 8/13 の資料は**対目標比が前月の表のコピーのまま**（1,060/21,000 = 5.0% のところ 27.8%）で
 * 会議に出ていました。手計算・手コピーで維持されていた列を ONAiR が計算するのがこの機能の
 * 要点なので、式そのものをここで固定します。画面を見ても間違いに気づけない計算です。
 *
 * 目標が赤字の行は 9/4 の資料の式（`100 − (目標 − 実績) ÷ |目標| × 100`）に揃えます。
 * 素直に 実績 ÷ 目標 で割ると −39,834 ÷ −28,454 = 140% になり、目標より悪いのに達成に見えます。
 *
 * 実体は `server/src/contexts/sales/services/keep-report-rules.ts`（純粋関数）。
 * 稼働率の既定は `shared/src/keepReport/types.ts` にも写しがあるので一致を固定します。
 */
import { describe, it, expect } from 'vitest';
import {
  ratioOf, varianceOf, sumBudgetFields,
  DEFAULT_UTILIZATION_SETTINGS as serverDefault, UTILIZATION_BOOKING_TYPES,
  normalizeUtilizationSettings, mergeUtilizationSettings,
} from '../../server/src/contexts/sales/services/keep-report-rules';
import { DEFAULT_UTILIZATION_SETTINGS as sharedDefault } from '../src/keepReport/types';

// 260904 の資料（千円）: 目標 → 着地。営業利益の目標が赤字
const DECK_260904 = {
  operating_profit: { budget: -28_454, actual: -39_834, ratio: 60.0 }, // 1 − 11,380 ÷ 28,454
  sga: { budget: 26_427, actual: 21_834, ratio: 82.6 },
  cogs_fixed: { budget: 19_727, actual: 18_539, ratio: 94.0 },
  gross_profit: { budget: 17_700, actual: 539, ratio: 3.0 },
};

describe('ratioOf（対目標比）', () => {
  it('9/4 の資料の営業利益（目標が赤字）は 60.0%', () => {
    const c = DECK_260904.operating_profit;
    expect(ratioOf(c.actual, c.budget)).toBe(c.ratio);
  });

  it('費用・利益の行は 実績 ÷ 目標', () => {
    for (const key of ['sga', 'cogs_fixed', 'gross_profit'] as const) {
      const c = DECK_260904[key];
      expect(ratioOf(c.actual, c.budget), key).toBe(c.ratio);
    }
  });

  it('赤字の目標より良ければ 100% を超える（−28,454 の目標で −20,000 なら 129.7%）', () => {
    expect(ratioOf(-20_000, -28_454)).toBe(129.7);
  });

  it('赤字の目標にぴったりなら 100%', () => {
    expect(ratioOf(-28_454, -28_454)).toBe(100);
  });

  it('目標が無い・0 のときは null（割れない。判定は差で付く）', () => {
    expect(ratioOf(100, null)).toBeNull();
    expect(ratioOf(100, 0)).toBeNull();
  });

  it('小数1桁に丸める', () => {
    expect(ratioOf(1, 3)).toBe(33.3);
    expect(ratioOf(2, 3)).toBe(66.7);
  });
});

describe('varianceOf（差・比・判定）', () => {
  it('売上・利益系は 実績 ≧ 目標 で ○', () => {
    expect(varianceOf(539, 17_700, 'higher_better')).toEqual({ actual: 539, budget: 17_700, diff: -17_161, ratio: 3.0, judge: '✕' });
    expect(varianceOf(18_000, 17_700, 'higher_better').judge).toBe('○');
    expect(varianceOf(17_700, 17_700, 'higher_better').judge).toBe('○');
  });

  it('費用系は 実績 ≦ 目標 で ○', () => {
    expect(varianceOf(21_834, 26_427, 'lower_better')).toEqual({ actual: 21_834, budget: 26_427, diff: -4_593, ratio: 82.6, judge: '○' });
    expect(varianceOf(27_000, 26_427, 'lower_better').judge).toBe('✕');
  });

  it('赤字目標の営業利益: 目標より悪ければ ✕ で比率は 60.0%（140% にしない）', () => {
    const v = varianceOf(-39_834, -28_454, 'higher_better');
    expect(v.judge).toBe('✕');
    expect(v.diff).toBe(-11_380);
    expect(v.ratio).toBe(60.0);
  });

  it('目標が無ければ判定 "-"、差も比も null', () => {
    expect(varianceOf(100, null, 'higher_better')).toEqual({ actual: 100, budget: null, diff: null, ratio: null, judge: '-' });
  });
});

describe('sumBudgetFields（全体の目標 ＝ 計上会社の合計）', () => {
  it('行が無ければ null（未登録を 0 にしない）', () => {
    expect(sumBudgetFields([])).toBeNull();
  });

  it('計上会社ごとの値を項目ごとに足す', () => {
    expect(sumBudgetFields([
      { revenue: 21_000_000, cogs_fixed: 19_727_000, cogs_variable: 0, sga: 26_427_000, operating_profit: -25_154_000 },
      { revenue: 5_000_000, cogs_fixed: null, cogs_variable: 1_000_000, sga: null, operating_profit: 4_000_000 },
    ])).toEqual({ revenue: 26_000_000, cogs_fixed: 19_727_000, cogs_variable: 1_000_000, sga: 26_427_000, operating_profit: -21_154_000 });
  });

  it('どの計上会社にも無い項目は null のまま（按分もしない）', () => {
    expect(sumBudgetFields([
      { revenue: 1, cogs_fixed: null, cogs_variable: null, sga: null, operating_profit: null },
      { revenue: null, cogs_fixed: null, cogs_variable: null, sga: null, operating_profit: null },
    ])).toEqual({ revenue: 1, cogs_fixed: null, cogs_variable: null, sga: null, operating_profit: null });
  });

  it('1行なら その行の値そのまま（計上会社を指定したときの形）', () => {
    const row = { revenue: 10, cogs_fixed: 2, cogs_variable: 3, sga: 4, operating_profit: 1 };
    expect(sumBudgetFields([row])).toEqual(row);
  });
});

describe('稼働率の数え方（keep_settings.utilization）', () => {
  it('server の既定と shared の既定が同じ（メンテナンス以外を全部数える・土曜は営業日にしない）', () => {
    expect(serverDefault).toEqual(sharedDefault);
    expect(serverDefault.counted_types).not.toContain('maintenance');
    expect(serverDefault.count_saturday).toBe(false);
  });

  it('既定の種別はすべて数えられる種別の中にある', () => {
    for (const t of serverDefault.counted_types) expect(UTILIZATION_BOOKING_TYPES).toContain(t);
  });

  it('DB の値が壊れていても既定で埋めて返す（知らない種別は落とす・重複は1つに）', () => {
    expect(normalizeUtilizationSettings(null)).toEqual(sharedDefault);
    expect(normalizeUtilizationSettings({ counted_types: ['performance', 'bogus', 'performance'], count_saturday: 'yes' }))
      .toEqual({ counted_types: ['performance'], count_saturday: false });
  });

  it('人の設定は渡した鍵だけ重ねる', () => {
    const cur = { counted_types: ['performance', 'rehearsal'], count_saturday: false };
    expect(mergeUtilizationSettings(cur, { count_saturday: true }))
      .toEqual({ ok: true, value: { counted_types: ['performance', 'rehearsal'], count_saturday: true } });
    expect(mergeUtilizationSettings(cur, { counted_types: ['tour', 'tour', 'hold'] }))
      .toEqual({ ok: true, value: { counted_types: ['tour', 'hold'], count_saturday: false } });
  });

  it('知らない種別・真偽値でない土曜・配列でない本文は黙って落とさず理由を返す', () => {
    const cur = { ...sharedDefault };
    expect(mergeUtilizationSettings(cur, { counted_types: ['performance', 'lunch'] }).ok).toBe(false);
    expect(mergeUtilizationSettings(cur, { count_saturday: 'true' }).ok).toBe(false);
    expect(mergeUtilizationSettings(cur, null).ok).toBe(false);
    expect(mergeUtilizationSettings(cur, []).ok).toBe(false);
  });
});
