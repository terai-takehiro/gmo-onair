// 同じ列で時刻が重なる項目を横に割るための「レーン」割り当て（区間彩色の簡易版）。
// 実装設計: 04-schedule-impl.md §5-3「重なりは黙って弾かず、黙って重ねもしない」
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

export interface LanedItem {
  item: ScheduleItem;
  lane: number;
  laneCount: number;
}

/**
 * 同じ column_id の項目を start_min 順に並べ、重なるものへ別レーンを割り当てる。
 *
 * ⚠️ **`laneCount` は「重なりグループ」ごとに区切って数える。表全体の最大値を
 * 全項目へ一律に適用してはいけない**（過去のバグ・実害あり）。
 * 表全体で1本だけ数える実装だと、たとえば午前に3件重なる瞬間が1回あるだけで、
 * それとは無関係な午後の（誰とも重ならない）単独の項目まで幅1/3に押し縮められる。
 * PC グリッドの項目クリックは押しやすさが命（`04-schedule-impl.md` §5-3）なので、
 * 本来100%幅で描けるはずの単独項目が根拠なく細くなると、隣のレーンとの誤クリックを誘発する
 * （実際に「クリックすると別の項目が開く」という報告があった — 誤クリックしていた）。
 * 重なりが途切れた（＝それまで置いた項目が全部終わった）ところでグループを区切り、
 * レーンの空き状況もグループごとにリセットする。
 */
export function assignLanes(items: ScheduleItem[]): LanedItem[] {
  const sorted = [...items].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
  let laneEnds: number[] = []; // 今のグループで、レーンごとの「今まで置いた項目の end_min」
  const placed: { item: ScheduleItem; lane: number; groupIndex: number }[] = [];
  const groupMaxLanes: number[] = []; // グループごとの最大同時レーン数
  let groupIndex = -1;
  let groupBusyUntil = -Infinity; // 今のグループで、これまでに置いた項目の end_min の最大値

  for (const item of sorted) {
    // 今のグループが既に途切れていたら（＝置いた項目が全部この項目の開始前に終わっていたら）
    // 新しいグループを始める。レーンの空き状況も引き継がない
    if (groupIndex === -1 || item.start_min >= groupBusyUntil) {
      groupIndex++;
      groupMaxLanes[groupIndex] = 0;
      laneEnds = [];
      groupBusyUntil = item.end_min;
    } else {
      groupBusyUntil = Math.max(groupBusyUntil, item.end_min);
    }

    let lane = laneEnds.findIndex((end) => end <= item.start_min);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end_min);
    } else {
      laneEnds[lane] = item.end_min;
    }
    groupMaxLanes[groupIndex] = Math.max(groupMaxLanes[groupIndex], laneEnds.length);
    placed.push({ item, lane, groupIndex });
  }

  return placed.map(({ item, lane, groupIndex: g }) => ({ item, lane, laneCount: Math.max(1, groupMaxLanes[g]) }));
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
