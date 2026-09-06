// PC グリッドのカードを描く層。**列の中のカードも横串も、この1枚にまとめて描く**。
//
// なぜ列の中に描かないか（2026-09-06 のご依頼「かぶったら下のスケジュールが上になるように」）:
//   列は1本ずつ独立した `div` なので、その中にカードを置くと**後の列が必ず手前**になり、
//   時刻での重ね順（遅く始まるものが手前）を作れない。横串（列をまたぐカード）に至っては
//   右隣の列の背景に隠れてしまう。位置と重ね順は `scheduleCardLayout.ts` が全部決め、
//   ここはその通りに並べるだけ。
//
// この層自体は `pointer-events-none`（下の列の空きクリック＝新規作成を邪魔しない）。
// カードだけが `pointer-events-auto` で押せる。
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import type { PlacedCard } from "./scheduleCardLayout";
import ScheduleItemCard from "./ScheduleItemCard";

interface Props {
  /** `layoutScheduleCards` の結果（奥から手前の順に並んでいる） */
  cards: PlacedCard[];
  /** 時刻の列の幅（この層の左端） */
  leftOffset: number;
  /** 列見出しの高さ（この層の上端） */
  topOffset: number;
  width: number;
  height: number;
  conflictedIds: Set<string>;
  draggingItemId: string | null;
  dragKind: "move" | "resize" | null;
  onSelect: (item: ScheduleItem) => void;
  onPointerDownMove?: (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => void;
  onPointerDownResize?: (item: ScheduleItem, e: React.PointerEvent<HTMLElement>) => void;
}

export default function ScheduleCardLayer({
  cards, leftOffset, topOffset, width, height, conflictedIds,
  draggingItemId, dragKind, onSelect, onPointerDownMove, onPointerDownResize,
}: Props) {
  return (
    // z は列見出し（z-10）・時刻の列（z-20）より下。横スクロールすれば時刻の列の下へ、
    // 縦スクロールすれば見出しの下へ潜る
    <div
      className="pointer-events-none absolute"
      style={{ left: leftOffset, top: topOffset, width, height, zIndex: 5 }}
    >
      {cards.map((card) => {
        const isDraggingThis = draggingItemId === card.item.id;
        return (
          <div key={card.item.id} className="pointer-events-auto">
            <ScheduleItemCard
              item={card.item}
              top={card.top}
              height={card.height}
              left={`${card.left}px`}
              width={`${card.width}px`}
              textMaxHeight={card.textMaxHeight}
              conflicted={conflictedIds.has(card.item.id)}
              dragging={isDraggingThis}
              dragKind={isDraggingThis ? dragKind : null}
              spanLabel={card.spanLabel}
              onSelect={() => onSelect(card.item)}
              onPointerDownMove={onPointerDownMove ? (e) => onPointerDownMove(card.item, e) : undefined}
              onPointerDownResize={onPointerDownResize ? (e) => onPointerDownResize(card.item, e) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
