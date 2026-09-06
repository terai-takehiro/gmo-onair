// 一覧を「イベント（案件・番組）ごと」に束ねる。14-schedule-v2-plan.md §3-3・§3 B4（2026-09-06 決定）
//
// データは変えない — `qsheet_schedules` は 1 行＝1 日のまま。束ねるのは画面側だけで、
// 鍵は project_id／program_id（どちらも無い表は「案件・番組なし」の束）。
import type { Schedule } from "@gmo-onair/shared/src/schedule/types";

export type BundleKind = "project" | "program" | "none";

export interface ScheduleBundle {
  key: string;
  kind: BundleKind;
  label: string;
  /** 案件メンバー＋主担当の人数（自動共有の対象・§3-2）。番組・案件なしの束は null */
  memberCount: number | null;
  /** その束の中で日付が最も近いもの（束の並び替えに使う） */
  nearestDate: string;
  schedules: Schedule[];
}

/**
 * 一覧（`GET /schedules` の結果）を束にする。
 * - 束の中は日付の**昇順**（近い日が上）。サーバーの並び（`service_date DESC`）とは向きが違うので、
 *   束の中身は必ずここで並べ直す
 * - 束どうしの並びも「一番近い日付」の昇順（§3-3）
 */
export function bundleSchedules(rows: Schedule[]): ScheduleBundle[] {
  const byKey = new Map<string, ScheduleBundle>();

  for (const s of rows) {
    const kind: BundleKind = s.project_id ? "project" : s.program_id ? "program" : "none";
    const key = kind === "project" ? `project:${s.project_id}` : kind === "program" ? `program:${s.program_id}` : "none";
    let bundle = byKey.get(key);
    if (!bundle) {
      const label = kind === "project"
        ? `${s.gls_number ? `${s.gls_number} ` : ""}${s.project_name ?? ""}`.trim()
        : kind === "program"
          ? `番組: ${s.program_name ?? ""}`
          : "案件・番組なし";
      bundle = { key, kind, label, memberCount: kind === "project" ? (s.project_member_count ?? null) : null, nearestDate: s.service_date, schedules: [] };
      byKey.set(key, bundle);
    }
    if (s.service_date < bundle.nearestDate) bundle.nearestDate = s.service_date;
    bundle.schedules.push(s);
  }

  const bundles = [...byKey.values()];
  for (const b of bundles) {
    b.schedules.sort((a, c) => a.service_date.localeCompare(c.service_date));
  }
  bundles.sort((a, b) => a.nearestDate.localeCompare(b.nearestDate) || a.label.localeCompare(b.label, "ja"));
  return bundles;
}
