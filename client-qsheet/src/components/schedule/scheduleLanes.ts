// 同じ列で時刻が重なる項目を横に割るための「レーン」割り当て（区間彩色の簡易版）。
// 実装設計: 04-schedule-impl.md §5-3「重なりは黙って弾かず、黙って重ねもしない」
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

export interface LanedItem {
  item: ScheduleItem;
  lane: number;
  laneCount: number;
}

/** 同じ column_id の項目を start_min 順に並べ、重なるものへ別レーンを割り当てる */
export function assignLanes(items: ScheduleItem[]): LanedItem[] {
  const sorted = [...items].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
  const laneEnds: number[] = []; // レーンごとの「今まで置いた項目の end_min」
  const placed: { item: ScheduleItem; lane: number }[] = [];

  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start_min);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end_min);
    } else {
      laneEnds[lane] = item.end_min;
    }
    placed.push({ item, lane });
  }

  // 「重なりグループ」ごとの最大レーン数を、そのグループの全項目に適用する
  // （同じ時間帯にいる項目は同じ幅で並ぶようにする）
  const laneCount = Math.max(1, laneEnds.length);
  return placed.map(({ item, lane }) => ({ item, lane, laneCount }));
}

/** その列の重なり件数（見出しに「重なり N件」と出す用。§5-3） */
export function countOverlaps(items: ScheduleItem[]): number {
  const sorted = [...items].sort((a, b) => a.start_min - b.start_min);
  let overlaps = 0;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].start_min < sorted[i].end_min) overlaps++;
      else break;
    }
  }
  return overlaps;
}
