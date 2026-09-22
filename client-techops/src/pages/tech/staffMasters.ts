// 技術人員の絞り込みと集計（③の候補・⑥の表で共通）。
// 取得そのものは `hooks/useTechMasters.ts`（`persons(params)` はサーバーへ問い合わせる）。
// ここは受け取った一覧に画面側の条件を当て直すだけの純粋関数を持つ。
import type { TechPerson } from "@gmo-onair/shared/src/tech/types";

export interface PersonFilter {
  q?: string;
  role?: string;
  includeInactive?: boolean;
}

/** 検索語（名前・ふりがな・役職）と役職の絞り込み。既定は有効な人だけ */
export function filterPersons(list: TechPerson[], filter: PersonFilter = {}): TechPerson[] {
  const q = (filter.q ?? "").trim();
  const role = filter.role ?? "";
  return list.filter((p) => {
    if (role !== "" && !p.main_roles.includes(role)) return false;
    if (!filter.includeInactive && !p.active) return false;
    if (q === "") return true;
    return p.name.includes(q) || p.kana.includes(q) || p.main_roles.some((r) => r.includes(q));
  });
}

/** 主な役職ごとの人数（⑥の右の「役職の一覧」） */
export function roleCountsOf(list: TechPerson[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of list) for (const r of p.main_roles) counts[r] = (counts[r] ?? 0) + 1;
  return counts;
}
