// 技術スタッフ（③ `/techops/tech-docs/:id/staff`）の並び・集計だけを持つ純粋関数。
// 画面は `StaffTable.tsx`。400 行の上限（scripts/check-file-size.mjs）に収めるため、
// 描画を持たない処理をここへ分けてある。
// 設計: docs/design/v4/tech-docs.md §4-5・§6③、モック mockups/native/tech-docs/Staff.dc.html
import type { TechStaffRow } from "@gmo-onair/shared/src/tech/types";
import { roleOrder } from "@gmo-onair/shared/src/tech/roles";

/** 作業日の一覧（行が持つ日 ＋ 画面でまだ行の無い日）を古い順に返す */
export function dayListOf(rows: TechStaffRow[], addedDays: string[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) if (r.work_date) seen.add(r.work_date);
  for (const d of addedDays) if (d) seen.add(d);
  return Array.from(seen).sort();
}

/** その作業日の行。並びは役職の順 → 同じ役職の中は sort_order（§4-5） */
export function rowsOfDay(rows: TechStaffRow[], day: string): TechStaffRow[] {
  return rows
    .filter((r) => r.work_date === day)
    .slice()
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.sort_order - b.sort_order);
}

/** 名前が入っている行の数（作業日チップと「この日の人数」に出す） */
export function filledCountOf(rows: TechStaffRow[]): number {
  return rows.filter((r) => r.person_name.trim() !== "").length;
}

export interface CompanyCount {
  name: string;
  count: number;
}

/** 会社ごとの人数。多い順 → 名前順。会社が空の行は数えない */
export function companyCountsOf(rows: TechStaffRow[]): CompanyCount[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.person_name.trim() === "") continue;
    const name = r.company_name.trim();
    if (name === "") continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"),
  );
}

/**
 * 表示順の中で1行だけ上下に動かした結果の id の並び。
 * 端にいて動かせないときは null（呼ぶ側は保存しない）。
 */
export function movedOrder(rows: TechStaffRow[], id: string, delta: -1 | 1): string[] | null {
  const ids = rows.map((r) => r.id);
  const at = ids.indexOf(id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= ids.length) return null;
  const next = ids.slice();
  next[at] = ids[to];
  next[to] = ids[at];
  return next;
}

/** 新しい行の sort_order（その作業日の末尾） */
export function nextSortOrder(rows: TechStaffRow[], day: string): number {
  const same = rows.filter((r) => r.work_date === day);
  return same.length === 0 ? 0 : Math.max(...same.map((r) => r.sort_order)) + 1;
}
