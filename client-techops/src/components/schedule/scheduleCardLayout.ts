// PC グリッドのカードを「どこに・どの順で描くか」まで決める計算（画面を見ても間違いに
// 気づきにくいので、描画から切り離して試験できる形にしてある。`shared/tests/scheduleCardLayout.test.ts`）。
//
// 2026-09-06 のご依頼「カードがかぶった場合は、下のスケジュールが上になるようにした上で、
// かぶったところに文字が出ないように」への対応。決めたのは次の2つ:
//
//  1. **重ね順は開始時刻の順**。遅く始まる（＝画面の下にある）カードほど後から描く＝手前に来る。
//     そのために**列の中のカードも横串も1枚の層にまとめて**描く（列ごとの `div` に分けたままだと
//     「後の列が必ず手前」になり、時刻での重ね順が作れない）。ドラッグ中の1枚だけは常に最前面
//  2. **かぶったところには文字を出さない**。各カードの「文字を描いてよい高さ」を、
//     自分より手前に描かれる（＝重なる）カードの上端までに切り詰める。
//     カードの文字は上端に寄せてあるので、隠れる位置に文字が残ることがなくなる
import { isSpanItem, spanLabel, spanPlacement } from "@gmo-onair/shared/src/schedule/span";
import type { ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes } from "./scheduleLanes";

/** 尺0のデータが紛れ込んだときの保険（押せる高さを残す） */
const MIN_CARD_PX = 20;
/** 横串どうしが重なって高さを分け合うときの最低高さ */
const MIN_LANE_PX = 16;
/** これ未満しか空いていなければ文字は出さない（読めない上に、隠れる位置に置くことになる） */
const MIN_TEXT_PX = 14;
/** 隣のカードとの隙間 */
const GAP_PX = 2;

export interface PlacedCard {
  item: ScheduleItem;
  left: number;
  width: number;
  top: number;
  height: number;
  /** 横串のときだけ「全列」「3列」。列の中のカードは null */
  spanLabel: string | null;
  /** 文字を描いてよい高さ（0 なら文字を出さない）。手前に重なるカードの上端まで */
  textMaxHeight: number;
}

export interface LayoutArgs {
  /** 表示順に並べた列 */
  columns: ScheduleColumn[];
  /** 表示用の項目（ドラッグ中の座標で上書き済みのもの） */
  items: ScheduleItem[];
  /** 分 → Y。`buildTimeline().yOf` */
  minToY: (min: number) => number;
  /** ドラッグ中の項目。常にいちばん手前に描く */
  draggingItemId?: string | null;
}

function overlaps(a: PlacedCard, b: PlacedCard): boolean {
  const horizontally = a.left < b.left + b.width && b.left < a.left + a.width;
  const vertically = a.top < b.top + b.height && b.top < a.top + a.height;
  return horizontally && vertically;
}

export function layoutScheduleCards({ columns, items, minToY, draggingItemId = null }: LayoutArgs): PlacedCard[] {
  if (columns.length === 0) return [];

  // 列の左端（表示順の累積幅）
  const offsets: number[] = [];
  let x = 0;
  for (const c of columns) { offsets.push(x); x += c.width_px; }
  const indexOfColumn = new Map(columns.map((c, i) => [c.id, i]));

  const cards: PlacedCard[] = [];

  // ── 列の中のカード: 重なったら横に割る（`scheduleLanes.ts`）─────────────
  const byColumn = new Map<string, ScheduleItem[]>();
  const spanItems: ScheduleItem[] = [];
  for (const item of items) {
    if (isSpanItem(item.span_cols)) { spanItems.push(item); continue; }
    if (!byColumn.has(item.column_id)) byColumn.set(item.column_id, []);
    byColumn.get(item.column_id)!.push(item);
  }
  for (const [columnId, colItems] of byColumn) {
    const index = indexOfColumn.get(columnId);
    if (index === undefined) continue; // 列が消えている（描かない）
    const colWidth = columns[index].width_px;
    for (const { item, lane, laneCount } of assignLanes(colItems)) {
      const laneWidth = colWidth / laneCount;
      const top = minToY(item.start_min);
      cards.push({
        item,
        left: offsets[index] + lane * laneWidth,
        width: Math.max(0, laneWidth - GAP_PX),
        top,
        height: Math.max(MIN_CARD_PX, minToY(item.end_min) - top),
        spanLabel: null,
        textMaxHeight: 0, // 下でまとめて決める
      });
    }
  }

  // ── 横串: 掛かる列の幅いっぱい。横串どうしが重なったら**縦に**割る ────────
  // （列の中の項目は横に割るが、横串は「どの列に掛かっているか」が本体なので、
  //   横に細くすると 2 列ぶんの横串が 1 列ぶんの幅で描かれ、意味が壊れる）
  for (const { item, lane, laneCount } of assignLanes(spanItems)) {
    const index = indexOfColumn.get(item.column_id) ?? -1;
    const place = spanPlacement(item.span_cols, index, columns.length);
    if (!place) continue; // 列が消えている等（描かない）
    let bandWidth = 0;
    for (let i = place.startIndex; i < place.startIndex + place.count; i++) bandWidth += columns[i].width_px;
    const bandTop = minToY(item.start_min);
    const bandHeight = Math.max(MIN_CARD_PX, minToY(item.end_min) - bandTop);
    const laneHeight = bandHeight / laneCount;
    cards.push({
      item,
      left: offsets[place.startIndex],
      width: Math.max(0, bandWidth - GAP_PX),
      top: bandTop + lane * laneHeight,
      height: Math.max(MIN_LANE_PX, laneHeight - (laneCount > 1 ? 1 : 0)),
      spanLabel: spanLabel(item.span_cols),
      textMaxHeight: 0,
    });
  }

  // ── 重ね順: 遅く始まるカードほど手前（＝配列の後ろ）──────────────────
  // 同時刻に始まるものは長いほうを先に（奥に）置く — 短い＝細かいほうが手前に来る。
  // ドラッグ中の1枚だけは、いつでもいちばん手前（掴んでいるものが隠れない）
  cards.sort((a, b) => {
    const aDrag = a.item.id === draggingItemId;
    const bDrag = b.item.id === draggingItemId;
    if (aDrag !== bDrag) return aDrag ? 1 : -1;
    return a.item.start_min - b.item.start_min
      || (b.item.end_min - b.item.start_min) - (a.item.end_min - a.item.start_min)
      || a.item.id.localeCompare(b.item.id);
  });

  // ── かぶったところに文字を出さない ────────────────────────────────
  // 自分より手前に描かれる（＝後ろの要素で、実際に重なる）カードの上端までを文字の場所にする
  for (let i = 0; i < cards.length; i++) {
    let limit = cards[i].height;
    for (let j = i + 1; j < cards.length; j++) {
      if (!overlaps(cards[i], cards[j])) continue;
      limit = Math.min(limit, cards[j].top - cards[i].top);
    }
    cards[i].textMaxHeight = limit >= MIN_TEXT_PX ? limit : 0;
  }

  return cards;
}
