// 横串（列をまたぐ項目 = Excel のセル結合）の層。2026-09-06 のご依頼で新設。
//
// なぜ列の中ではなく別の層に描くか:
//   列は1本ずつ独立した `div`（幅も罫も列ごと）なので、その中のカードを右隣の列まで
//   伸ばすと、後から描かれる列の背景に隠れる／列の重なりレーン計算にも巻き込まれる。
//   横串は「表全体の上に置く帯」なので、列の外側に1枚だけ重ねる方が素直で、
//   列ごとのレーン割り当て（`scheduleLanes.ts`）にも一切触らずに済む。
//
// この層自体は `pointer-events-none`（下の列の空きクリック＝新規作成を邪魔しない）。
// カードだけが `pointer-events-auto` で押せる。
import { useMemo } from "react";
import { spanPlacement, spanLabel } from "@gmo-onair/shared/src/schedule/span";
import type { ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import { assignLanes } from "./scheduleLanes";
import ScheduleItemCard from "./ScheduleItemCard";

interface Props {
  /** 横串の項目だけ（`isSpanItem` で振り分け済み） */
  items: ScheduleItem[];
  /** 表示順に並べた列（左端からの位置と幅をここから出す） */
  columns: ScheduleColumn[];
  /** 時刻の列の幅（この層の左端） */
  leftOffset: number;
  /** 列見出しの高さ（この層の上端） */
  topOffset: number;
  height: number;
  minToY: (min: number) => number;
  conflictedIds: Set<string>;
  draggingItemId: string | null;
  dragKind: "move" | "resize" | null;
  onSelect: (item: ScheduleItem) => void;
  onPointerDownMove?: (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => void;
  onPointerDownResize?: (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => void;
}

export default function ScheduleSpanLayer({
  items, columns, leftOffset, topOffset, height, minToY, conflictedIds,
  draggingItemId, dragKind, onSelect, onPointerDownMove, onPointerDownResize,
}: Props) {
  // 列の左端の位置（表示順の累積幅）
  const offsets = useMemo(() => {
    const acc: number[] = [];
    let x = 0;
    for (const c of columns) { acc.push(x); x += c.width_px; }
    return acc;
  }, [columns]);
  const totalWidth = offsets.length > 0 ? offsets[offsets.length - 1] + columns[columns.length - 1].width_px : 0;
  const indexOfColumn = useMemo(() => new Map(columns.map((c, i) => [c.id, i])), [columns]);
  // 横串どうしが時間で重なったときは**縦に割る**（列の中の項目は横に割るが、横串は
  // 「どの列に掛かっているか」が本体なので、横に細くすると意味が壊れる —
  // 2列ぶんの横串が1列ぶんの幅で描かれてしまう。横幅は保ったまま高さを分け合う）
  const lanes = useMemo(() => assignLanes(items), [items]);

  if (columns.length === 0) return null;

  return (
    // z は列見出し（z-10）より下・時刻の列（z-20）より下。横スクロールすると
    // 時刻の列の下へ潜り、縦スクロールすると見出しの下へ潜る
    <div
      className="pointer-events-none absolute"
      style={{ left: leftOffset, top: topOffset, width: totalWidth, height, zIndex: 5 }}
    >
      {lanes.map(({ item, lane, laneCount }) => {
        const index = indexOfColumn.get(item.column_id) ?? -1;
        const place = spanPlacement(item.span_cols, index, columns.length);
        if (!place) return null; // 列が消えている等（描かない）
        const bandLeft = offsets[place.startIndex];
        let bandWidth = 0;
        for (let i = place.startIndex; i < place.startIndex + place.count; i++) bandWidth += columns[i].width_px;
        const bandTop = minToY(item.start_min);
        // 尺0のデータが紛れ込んだときの保険（列の中のカードと同じ床）
        const bandHeight = Math.max(20, minToY(item.end_min) - bandTop);
        const laneHeight = bandHeight / laneCount;
        const top = bandTop + lane * laneHeight;
        const cardHeight = Math.max(16, laneHeight - 1);
        return (
          <div key={item.id} className="pointer-events-auto">
            <ScheduleItemCard
              item={item}
              top={top}
              height={cardHeight}
              left={`${bandLeft}px`}
              width={`${Math.max(0, bandWidth - 2)}px`}
              conflicted={conflictedIds.has(item.id)}
              dragging={draggingItemId === item.id}
              dragKind={draggingItemId === item.id ? dragKind : null}
              spanLabel={spanLabel(item.span_cols)}
              onSelect={() => onSelect(item)}
              onPointerDownMove={onPointerDownMove ? (e) => onPointerDownMove(item, e) : undefined}
              onPointerDownResize={onPointerDownResize ? (e) => onPointerDownResize(item, e) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
