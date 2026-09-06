/**
 * **定例報告パックの計算列 — 手計算しない、そして2か所にある写しが同じ答えを出す**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 8/13 の資料は 8月見通しの対目標比が 7月表のコピーのまま（1,060/21,000 = 5.0% のところ 27.8%）で
 * 会議に出た。**表を見ても間違いに気づけない**種類の数字なので、式そのものを固定する
 * （docs/design/v4/keep-report.md §1.2・§5.3）。
 *
 * サーバーは `shared/` を import できない（`server/tsconfig.json` の `rootDir`）ので、
 * 画面が使う `shared/src/keepReport/calc.ts` と、サーバーの
 * `sales/services/keep-report-rules.ts`（比率・判定）・`dailyops/services/keep-pack-calc.ts`（それ以外）に
 * **同じ計算が2か所ある**。片方だけ直すと画面の案内とパックの数字が別の値になるので、
 * 両方を import して突き合わせる（受領書類の `financeDocChainParity.test.ts` と同じ形）。
 * パックの型（`keep-pack.types.ts`）も鍵の名前を突き合わせる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as calc from '../src/keepReport/calc';
import * as serverCalc from '../../server/src/contexts/dailyops/services/keep-pack-calc';
import { ratioOf, varianceOf } from '../../server/src/contexts/sales/services/keep-report-rules';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** `-0` と `0` を同じに扱う（`toBe` は `Object.is`） */
const norm = (v: number | null) => (v === null ? null : v + 0);

// 2026年9月の祝日（敬老の日 9/21・国民の休日 9/22・秋分の日 9/23）。暦の実装に依存しないよう固定
const SEP_2026_HOLIDAYS = new Set(['2026-09-21', '2026-09-22', '2026-09-23']);
const isHoliday = (d: string) => SEP_2026_HOLIDAYS.has(d);

describe('対目標比（260904 の表の数字）', () => {
  it('売上高: 目標 21,000,000 ／ 着地 1,762,000 → 8.4%', () => {
    expect(calc.varianceRatio(21_000_000, 1_762_000)).toBe(8.4);
  });
  it('営業利益（赤字の目標）: 目標 −28,454,000 ／ 着地 −39,834,000 → 60.0%', () => {
    // 9/4 版の式: 1 − 不足額 ÷ |目標| = 1 − 11,380 ÷ 28,454。素直に割ると 140% で「達成」に見える
    expect(calc.varianceRatio(-28_454_000, -39_834_000)).toBe(60.0);
  });
  it('営業利益 見込: 目標 −28,462,000 ／ 見込 −34,710,000 → 78.0%（千円で丸めた入力）', () => {
    // 1 − 6,248 ÷ 28,462 = 78.05% → 小数1桁で 78.0。資料の 78.1% は円の値（丸める前）から出ている
    expect(calc.varianceRatio(-28_462_000, -34_710_000)).toBe(78.0);
  });
  it('目標が超えている行も式は同じ（原価 3,300 → 2,406 は 72.9%）', () => {
    expect(calc.varianceRatio(3_300_000, 2_406_000)).toBe(72.9);
  });
  it('目標が無い・0 は null（割れない）', () => {
    expect(calc.varianceRatio(null, 100)).toBeNull();
    expect(calc.varianceRatio(undefined, 100)).toBeNull();
    expect(calc.varianceRatio(0, 100)).toBeNull();
  });
  it('赤字の目標に対して実績が黒字なら 100% を超える', () => {
    expect(calc.varianceRatio(-1_000_000, 500_000)).toBe(250.0);
  });
});

describe('判定', () => {
  it('売上・利益系は 実績 ≧ 目標 で ○', () => {
    expect(calc.judge('higher_better', 21_000_000, 1_762_000)).toBe('✕');
    expect(calc.judge('higher_better', 17_700_000, 5_672_000)).toBe('✕');
    expect(calc.judge('higher_better', 1_000, 1_000)).toBe('○');
  });
  it('費用系は 実績 ≦ 目標 で ○（原価 3,300 → 2,406・販管費 26,436 → 21,842・償却 19,727 → 18,539）', () => {
    expect(calc.judge('lower_better', 3_300_000, 2_406_000)).toBe('○');
    expect(calc.judge('lower_better', 26_436_000, 21_842_000)).toBe('○');
    expect(calc.judge('lower_better', 19_727_000, 18_539_000)).toBe('○');
    expect(calc.judge('lower_better', 3_300_000, 3_300_001)).toBe('✕');
  });
  it('目標が無ければ "-"', () => {
    expect(calc.judge('lower_better', null, 100)).toBe('-');
  });
});

describe('千円（表示の直前だけ）', () => {
  it('円 → 千円は四捨五入', () => {
    expect(calc.toThousandYen(1_762_293)).toBe(1762);
    expect(calc.toThousandYen(539_400)).toBe(539);
    expect(calc.toThousandYen(539_500)).toBe(540);
  });
  it('負の数は絶対値で丸めて符号を戻す（`toMan` と同じ）。−0 は出さない', () => {
    expect(calc.toThousandYen(-39_834_400)).toBe(-39834);
    expect(calc.toThousandYen(-1_500)).toBe(-2);
    expect(Object.is(calc.toThousandYen(-400), 0)).toBe(true);
  });
});

describe('確度の文字', () => {
  it('ステージ → A〜E', () => {
    expect(calc.confidenceOf('a_won')).toBe('A');
    expect(calc.confidenceOf('r_delivered')).toBe('A');
    expect(calc.confidenceOf('s_completed')).toBe('A');
    expect(calc.confidenceOf('b_verbal')).toBe('B');
    expect(calc.confidenceOf('c_proposal')).toBe('C');
    expect(calc.confidenceOf('d_hold')).toBe('D');
    expect(calc.confidenceOf('neta')).toBe('E');
    expect(calc.confidenceOf(null)).toBe('E');
  });
  it('語は資料の並び', () => {
    expect(calc.CONFIDENCE_LABELS).toEqual({ A: '受注済', B: '正式申込待', C: '提案済', D: '要件確認', E: '問い合わせ' });
  });
});

describe('営業日と稼働率', () => {
  it('2026年9月は 19 営業日（平日 22 − 祝日 3）', () => {
    expect(calc.businessDaysInMonth('2026-09', { isHoliday })).toBe(19);
  });
  it('土曜を数えると 23（土曜が 4 回）', () => {
    expect(calc.businessDaysInMonth('2026-09', { countSaturday: true, isHoliday })).toBe(23);
  });
  it('祝日が土曜に重なっても数えない・日曜は常に除く', () => {
    const sat = new Set(['2026-09-05']);
    // 平日 22 ＋ 土曜 4 − 祝日の土曜 1 = 25
    expect(calc.businessDaysInMonth('2026-09', { countSaturday: true, isHoliday: (d) => sat.has(d) })).toBe(25);
    expect(calc.businessDaysInMonth('2026-09', { isHoliday: () => false })).toBe(22);
  });
  it('資料の 9月 42.1% ＝ 8日 ÷ 19営業日', () => {
    expect(calc.utilizationRate(8, 19)).toBe(42.1);
  });
  it('営業日が 0 なら null（割れない）', () => {
    expect(calc.utilizationRate(0, 0)).toBeNull();
  });
  it('形が違う年月は空', () => {
    expect(calc.listMonthDays('2026-9')).toEqual([]);
    expect(calc.listMonthDays('2026-13')).toEqual([]);
    expect(calc.listMonthDays('2024-02')).toHaveLength(29);
  });
});

describe('日付', () => {
  it('月・日の足し引き（年またぎ・負）', () => {
    expect(calc.addMonths('2026-09', 1)).toBe('2026-10');
    expect(calc.addMonths('2026-01', -1)).toBe('2025-12');
    expect(calc.addMonths('2026-12', 1)).toBe('2027-01');
    expect(calc.addDays('2026-09-16', -14)).toBe('2026-09-02');
    expect(calc.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('曜日つきの見出し', () => {
    expect(calc.dateLabel('2026-10-03')).toBe('2026/10/3（土）');
    expect(calc.dateRangeLabel('2026-10-03', '2026-10-04')).toBe('2026/10/3（土）〜10/4（日）');
    expect(calc.dateRangeLabel('2026-10-03', '2026-10-03')).toBe('2026/10/3（土）');
    expect(calc.dateRangeLabel('2026-12-31', '2027-01-01')).toBe('2026/12/31（木）〜2027/1/1（金）');
    expect(calc.dateRangeLabel(null, '2026-10-04')).toBe('');
  });
  it('新規／更新の印は前回の会議日当日を含める', () => {
    expect(calc.pipelineSinceLast('2026-09-02T10:00:00Z', '2026-09-02T10:00:00Z', '2026-09-02')).toBe('new');
    expect(calc.pipelineSinceLast('2026-08-01', '2026-09-05', '2026-09-02')).toBe('updated');
    expect(calc.pipelineSinceLast('2026-08-01', '2026-08-20', '2026-09-02')).toBeNull();
    expect(calc.pipelineSinceLast('2026-09-10', '2026-09-10', null)).toBeNull();
    expect(calc.pipelineSinceLast(new Date(2026, 8, 3, 9, 0), null, '2026-09-02')).toBe('new');
  });
});

describe('サーバーと同じ答えを出す', () => {
  const BUDGETS = [null, 0, 1, 21_000_000, 17_700_000, 3_300_000, -28_454_000, -28_462_000, -1_000_000];
  const ACTUALS = [0, 1_762_000, 5_672_000, 2_406_000, -39_834_000, -34_710_000, 500_000, -1];

  it('対目標比（shared.varianceRatio ＝ server.ratioOf）', () => {
    for (const b of BUDGETS) for (const a of ACTUALS) {
      expect(norm(calc.varianceRatio(b, a))).toBe(norm(ratioOf(a, b)));
    }
  });
  it('判定（shared.judge ＝ server.varianceOf().judge）', () => {
    for (const kind of ['higher_better', 'lower_better'] as const) {
      for (const b of BUDGETS) for (const a of ACTUALS) {
        expect(calc.judge(kind, b, a)).toBe(varianceOf(a, b, kind).judge);
      }
    }
  });
  it('確度・語・並び', () => {
    for (const s of ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost', null]) {
      expect(serverCalc.confidenceOf(s)).toBe(calc.confidenceOf(s));
    }
    expect(serverCalc.CONFIDENCE_LABELS).toEqual(calc.CONFIDENCE_LABELS);
    expect(serverCalc.CONFIDENCE_ORDER).toEqual(calc.CONFIDENCE_ORDER);
  });
  it('営業日・稼働率・日付', () => {
    for (const ym of ['2024-02', '2026-09', '2026-10', '2027-01']) {
      for (const countSaturday of [false, true]) {
        expect(serverCalc.businessDaysInMonth(ym, { countSaturday, isHoliday })).toBe(calc.businessDaysInMonth(ym, { countSaturday, isHoliday }));
      }
      expect(serverCalc.listMonthDays(ym)).toEqual(calc.listMonthDays(ym));
      expect(serverCalc.addMonths(ym, -13)).toBe(calc.addMonths(ym, -13));
    }
    for (const [a, b] of [[8, 19], [0, 19], [3, 0], [7, 22]]) {
      expect(norm(serverCalc.utilizationRate(a, b))).toBe(norm(calc.utilizationRate(a, b)));
    }
    for (const d of ['2026-09-16', '2026-12-31', '2024-02-29']) {
      expect(serverCalc.addDays(d, 45)).toBe(calc.addDays(d, 45));
      expect(serverCalc.weekdayOf(d)).toBe(calc.weekdayOf(d));
      expect(serverCalc.dateLabel(d)).toBe(calc.dateLabel(d));
      expect(serverCalc.dateRangeLabel(d, '2027-01-02')).toBe(calc.dateRangeLabel(d, '2027-01-02'));
    }
  });
  it('新規／更新の印', () => {
    const cases: Array<[string | Date | null, string | Date | null, string | null]> = [
      ['2026-09-02T10:00:00Z', '2026-09-02T10:00:00Z', '2026-09-02'],
      ['2026-08-01', '2026-09-05', '2026-09-02'],
      ['2026-08-01', '2026-08-20', '2026-09-02'],
      [new Date(2026, 8, 3), null, '2026-09-02'],
      ['2026-09-10', '2026-09-10', null],
      [null, null, '2026-09-02'],
    ];
    for (const [c, u, p] of cases) {
      expect(serverCalc.pipelineSinceLast(c, u, p)).toBe(calc.pipelineSinceLast(c, u, p));
    }
  });
  it('サーバーの祝日表は 2026年9月を 19 営業日と数える（国民の休日 9/22 を含む）', () => {
    const fromServer = serverCalc.holidayPredicate(2026, 2026);
    expect(fromServer('2026-09-22')).toBe(true);
    expect(serverCalc.businessDaysInMonth('2026-09', { isHoliday: fromServer })).toBe(19);
  });
});

/** `export interface X { ... }` ごとに、行頭の鍵の名前を集める（入れ子の `{ }` は1行で書く決めごと） */
function interfaceFields(src: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /export interface (\w+)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    const body = src.slice(start, i - 1);
    out.set(m[1], [...body.matchAll(/^\s*([a-z_]+)\??:/gm)].map((x) => x[1]).sort());
  }
  return out;
}

describe('型の写し（サーバーの keep-pack.types.ts は shared の types.ts と同じ鍵を持つ）', () => {
  const shared = interfaceFields(read('shared', 'src', 'keepReport', 'types.ts'));
  const server = interfaceFields(read('server', 'src', 'contexts', 'dailyops', 'services', 'keep-pack.types.ts'));
  const PACK_INTERFACES = [
    'BudgetLine', 'MonthlyPlTable', 'MonthlyTrendPoint', 'PipelineRow', 'ProjectPageData',
    'UtilizationCalendar', 'InviewSummary', 'PlByEntity', 'KeepReportPack', 'KeepInput',
  ];
  for (const name of PACK_INTERFACES) {
    it(name, () => {
      expect(shared.get(name), `shared に ${name} が無い`).toBeDefined();
      expect(server.get(name), `server に ${name} が無い`).toEqual(shared.get(name));
    });
  }
});
