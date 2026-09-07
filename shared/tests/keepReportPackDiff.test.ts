/**
 * **「変更点は赤字」の判定 — 前回の資料から変わった升だけを赤くし、shared と server の写しが同じ答えを出す**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 資料の赤字は今まで人が前回の資料と見比べて手で付けていた（keep-report.md §6.3）。
 * ONAiR は前回の凍結したパックと比べて自動で赤くする — **赤くし過ぎても（初めて載る月が全部赤）、
 * 赤くし損ねても（見込から着地へ動いた数字が黒のまま）**、会議の場では気づけない。
 * 決めごとを式で固定する:
 *   - 同じ年月の表どうしで比べる。前回に無い月・無い行は「変わっていない」
 *   - 前回は見込（forecast）だった月が今回は着地（landing）でも、年月が同じなら比べる
 *   - 升は 目標／実績／差／比率／判定 を別々に見る
 *   - 稼働率は同じ年月のカレンダーどうし
 *
 * サーバーは `shared/` を import できないので、pptx が読む
 * `server/src/contexts/dailyops/services/keep-pack-diff.ts` は `shared/src/keepReport/packDiff.ts` の写し。
 * 両方を import して同じ材料で突き合わせる（`keepReportCalc.test.ts` と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import * as shared from '../src/keepReport/packDiff';
import * as server from '../../server/src/contexts/dailyops/services/keep-pack-diff';
import type { KeepReportPack } from '../src/keepReport/types';
import sample from '../../server/src/contexts/dailyops/services/__fixtures__/keep-pack.sample.json';

const prev = sample as unknown as KeepReportPack;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** 前回（9/16 の版）から数字がいくつか動いた「今回」（9/30 の版） */
function nextPack(): KeepReportPack {
  const next = clone(prev);
  next.meeting_date = '2026-09-30';
  next.previous_meeting_date = '2026-09-16';
  // 8月 着地（全体）: 売上の実績が動いた（差・比率も動く。判定は ✕ のまま）
  const rev = next.landing.all.lines.find((l) => l.key === 'revenue')!;
  rev.actual += 1_000_000;
  rev.diff = rev.actual - rev.budget!;
  rev.ratio = 13.2;
  // 9月 見込（GSS）: 販管費の目標だけ動いた（実績は同じ）
  const sga = next.forecast.GSS.lines.find((l) => l.key === 'sga')!;
  sga.budget = (sga.budget ?? 0) + 100_000;
  // 9月の稼働率が動いた。10月は同じ
  next.calendars[0].utilization = 47.4;
  return next;
}

describe('前回の表を探す（同じ計上会社・同じ年月）', () => {
  it('同じ月は着地／見込のどちらからでも見つかる', () => {
    expect(shared.previousPlTable(prev, 'all', '2026-08')?.mode).toBe('landing');
    expect(shared.previousPlTable(prev, 'GJV', '2026-09')?.mode).toBe('forecast');
  });
  it('前回に無い月・無い計上会社・前回そのものが無いときは null', () => {
    expect(shared.previousPlTable(prev, 'all', '2026-10')).toBeNull();
    expect(shared.previousPlTable(prev, 'GMO', '2026-08')).toBeNull(); // 見本のパックに GMO（グループ本体）は無い
    expect(shared.previousPlTable(null, 'all', '2026-08')).toBeNull();
  });
});

describe('変わった升', () => {
  const next = nextPack();

  it('実績が動いた行は 実績・差・比率 が赤、目標と判定は赤くない', () => {
    const changed = shared.changedPlKeys(shared.previousPlTable(prev, 'all', '2026-08'), next.landing.all);
    expect([...changed].sort()).toEqual(['revenue.actual', 'revenue.diff', 'revenue.ratio']);
  });
  it('目標だけ動いた行は 目標 だけ赤（実績・差・比率・判定は見本のまま）', () => {
    const changed = shared.changedPlKeys(shared.previousPlTable(prev, 'GSS', '2026-09'), next.forecast.GSS);
    expect([...changed]).toEqual(['sga.budget']);
  });
  it('何も動いていない表は空', () => {
    expect(shared.changedPlKeys(shared.previousPlTable(prev, 'GJV', '2026-08'), next.landing.GJV).size).toBe(0);
  });
  it('前回に無い月（初めて載る月）は何も赤くしない', () => {
    const oct = clone(next.forecast.all);
    oct.year_month = '2026-10';
    expect(shared.changedPlKeys(shared.previousPlTable(prev, 'all', '2026-10'), oct).size).toBe(0);
    expect(shared.changedPlKeys(null, oct).size).toBe(0);
    // 年月の違う表を渡されても比べない（呼ぶ側の取り違えで全升が赤になるのを防ぐ）
    expect(shared.changedPlKeys(prev.landing.all, oct).size).toBe(0);
  });
  it('前回は見込だった月が今回は着地になっても、年月が同じなら比べる（9/30 → 10/14）', () => {
    // 10/14 の版: 9月が着地に変わり、売上の実績が見込と違う
    const landingSep = clone(prev.forecast.all);
    landingSep.mode = 'landing';
    const rev = landingSep.lines.find((l) => l.key === 'revenue')!;
    rev.actual -= 500_000;
    const changed = shared.changedPlKeys(shared.previousPlTable(prev, 'all', '2026-09'), landingSep);
    expect(changed.has('revenue.actual')).toBe(true);
    expect(changed.has('revenue.budget')).toBe(false);
  });
  it('目標が無い（null）行は null どうしで「変わっていない」', () => {
    const a = clone(prev.landing.all);
    const b = clone(prev.landing.all);
    for (const t of [a, b]) for (const l of t.lines) { l.budget = null; l.diff = null; l.ratio = null; l.judge = '-'; }
    expect(shared.changedPlKeys(a, b).size).toBe(0);
  });
});

describe('稼働率', () => {
  const next = nextPack();
  it('同じ月で稼働率が動いたら true、同じなら false', () => {
    expect(shared.changedUtilization(shared.previousCalendar(prev, '2026-09'), next.calendars[0])).toBe(true);
    expect(shared.changedUtilization(shared.previousCalendar(prev, '2026-10'), next.calendars[1])).toBe(false);
  });
  it('前回に無い月・前回が無いときは false', () => {
    const nov = { ...clone(next.calendars[1]), year_month: '2026-11' };
    expect(shared.changedUtilization(shared.previousCalendar(prev, '2026-11'), nov)).toBe(false);
    expect(shared.changedUtilization(null, nov)).toBe(false);
    expect(shared.changedUtilization(prev.calendars[0], nov)).toBe(false); // 年月の違うカレンダーは比べない
  });
  it('null（営業日が無い月）と数字の間の変化も拾う', () => {
    const a = { ...clone(prev.calendars[0]), utilization: null };
    expect(shared.changedUtilization(a, prev.calendars[0])).toBe(true);
  });
});

describe('脚注の文', () => {
  it('前回の会議日を M/D で入れる', () => {
    expect(shared.changeNoteLabel('2026-09-16')).toBe('赤字＝前回（9/16）の資料から変わった所');
    expect(shared.changeNoteLabel('2026-10-05')).toBe('赤字＝前回（10/5）の資料から変わった所');
  });
});

describe('サーバーの写しは同じ答えを出す', () => {
  const next = nextPack();
  const entities = ['all', 'GJV', 'GSS', 'GMO'] as const;
  const months = ['2026-08', '2026-09', '2026-10'];

  it('列の並び・鍵の作り方', () => {
    expect(server.PL_CELL_COLUMNS).toEqual(shared.PL_CELL_COLUMNS);
    expect(server.plCellKey('revenue', 'ratio')).toBe(shared.plCellKey('revenue', 'ratio'));
  });
  it('前回の表・変わった升（計上会社 × 年月 × 着地/見込 の全部）', () => {
    for (const p of [prev, null]) for (const e of entities) for (const ym of months) {
      expect(server.previousPlTable(p, e, ym)).toEqual(shared.previousPlTable(p, e, ym));
      for (const mode of ['landing', 'forecast'] as const) {
        const table = next[mode][e];
        if (!table) continue;
        const a = server.changedPlKeys(server.previousPlTable(p, e, ym), table);
        const b = shared.changedPlKeys(shared.previousPlTable(p, e, ym), table);
        expect([...a].sort()).toEqual([...b].sort());
      }
    }
  });
  it('稼働率・脚注', () => {
    for (const p of [prev, null]) for (const c of next.calendars) {
      expect(server.previousCalendar(p, c.year_month)).toEqual(shared.previousCalendar(p, c.year_month));
      expect(server.changedUtilization(server.previousCalendar(p, c.year_month), c))
        .toBe(shared.changedUtilization(shared.previousCalendar(p, c.year_month), c));
    }
    for (const d of ['2026-09-16', '2026-10-05', 'なし']) expect(server.changeNoteLabel(d)).toBe(shared.changeNoteLabel(d));
  });
});
