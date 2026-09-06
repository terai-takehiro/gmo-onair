/**
 * 前回の資料からの「変わった所」— **「変更点は赤字」の判定**（GMO流会議フォーマット・keep-report.md §6.3）
 *
 * ── 決めごと ────────────────────────────────────────────────
 * - 比べるのは**前回の凍結したパック**（会議日が一つ前の版）。手で赤字にしない
 * - 比べるのは**同じ年月の表**。前回のパックにその月が無ければ「変わっていない」
 *   （初めて載る月を全部赤にしない）
 * - 前回は着地見込（forecast）だった月が今回は着地（landing）になることがある（9/30 → 10/14）。
 *   **年月が同じなら mode が違っても比べる** — 見込から着地へ動いた数字こそ赤字で見せたいもの
 * - 表の升は 目標／実績／差／比率／判定 の5つを**別々に**見る（実績だけ動いて比率が同じ、はあり得る）
 * - 稼働率は同じ年月のカレンダーどうし。ヨミ表の新規／更新はパックの `since_last` が既に持っている
 *
 * ⚠️ **server は shared を import できない**（`server/tsconfig.json` の `rootDir`）ので、
 * `server/src/contexts/dailyops/services/keep-pack-diff.ts` に**同じ関数の写し**がある。
 * `shared/tests/keepReportPackDiff.test.ts` が両方を同じ材料で走らせて同じ答えになることを固定する。
 * **こちらを直したら写しも同じに直すこと。**
 */
import type { BudgetLine, KeepReportPack, MonthlyPlTable, PlByEntity, UtilizationCalendar } from './types';

export type PlCellColumn = 'budget' | 'actual' | 'diff' | 'ratio' | 'judge';
/** 表の升の列（資料の並び: 目標／着地／判定／対目標比／対目標） */
export const PL_CELL_COLUMNS: readonly PlCellColumn[] = ['budget', 'actual', 'diff', 'ratio', 'judge'];

/** 変わった升の鍵: `<行の key>.<列>`（例 `revenue.actual`） */
export type PlCellKey = `${BudgetLine['key']}.${PlCellColumn}`;

export function plCellKey(line: BudgetLine['key'], column: PlCellColumn): PlCellKey {
  return `${line}.${column}`;
}

/**
 * 前回のパックから、同じ主体・同じ年月の表を探す（着地／見込のどちらでも）。無ければ null。
 * `gig` は数字があるときだけ入っているので、無いときは null（＝赤にしない）。
 */
export function previousPlTable(
  prev: KeepReportPack | null | undefined, entity: keyof PlByEntity, yearMonth: string,
): MonthlyPlTable | null {
  if (!prev) return null;
  for (const mode of ['landing', 'forecast'] as const) {
    const t = prev[mode]?.[entity];
    if (t && t.year_month === yearMonth) return t;
  }
  return null;
}

/**
 * 変わった升の鍵の集合。前回の表が無い・年月が違うときは空（＝何も赤くしない）。
 * 前回に無い行（行が増えたとき）も「変わった」とは言わない。
 */
export function changedPlKeys(
  prevTable: MonthlyPlTable | null | undefined, nextTable: MonthlyPlTable,
): Set<PlCellKey> {
  const out = new Set<PlCellKey>();
  if (!prevTable || prevTable.year_month !== nextTable.year_month) return out;
  const prevLines = new Map(prevTable.lines.map((l) => [l.key, l]));
  for (const line of nextTable.lines) {
    const p = prevLines.get(line.key);
    if (!p) continue;
    for (const c of PL_CELL_COLUMNS) {
      // null どうしは同じ、数字は値で比べる（`-0` と `0` は `===` で同じ）
      if (p[c] !== line[c]) out.add(plCellKey(line.key, c));
    }
  }
  return out;
}

/** 前回のパックから同じ年月のカレンダー。無ければ null */
export function previousCalendar(prev: KeepReportPack | null | undefined, yearMonth: string): UtilizationCalendar | null {
  if (!prev) return null;
  return prev.calendars.find((c) => c.year_month === yearMonth) ?? null;
}

/** 稼働率が変わったか。前回に同じ月が無ければ false（初めて載る月は赤にしない） */
export function changedUtilization(prev: UtilizationCalendar | null | undefined, next: UtilizationCalendar): boolean {
  if (!prev || prev.year_month !== next.year_month) return false;
  return prev.utilization !== next.utilization;
}

/** 資料の脚注の文。前回の会議日（`YYYY-MM-DD`）を `M/D` で入れる */
export function changeNoteLabel(previousMeetingDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(previousMeetingDate);
  const md = m ? `${Number(m[2])}/${Number(m[3])}` : previousMeetingDate;
  return `赤字＝前回（${md}）の資料から変わった所`;
}
